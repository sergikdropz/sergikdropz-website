import type { SupabaseClient } from '@supabase/supabase-js'
import { ALL_DSP_STORE_IDS } from '@/lib/studio/constants'
import { isStudioVaultImportFolderType } from '@/lib/studio/vault-picker'
import {
  buildVaultReleaseDraft,
  descriptionFromSonicDna,
  distributionTrackIdentityPayload,
  dnaCopyInputFromCatalog,
  dnaCopyInputFromDraft,
  marketingCopyFromDna,
  marketingCopyWithVaultMeta,
  mergeGeneratedMarketingCopy,
  isAnalysisCopy,
  mergeStudioTrackIdentity,
  studioReleaseIdFromVaultFolder,
  studioTrackIdentityFromVault,
  vaultFolderIdFromMarketingCopy,
  type CatalogCopySourceTrack,
  type DnaCopyInput,
  type StudioTrackIdentity,
  type VaultFolderRow,
  type VaultTrackRow,
} from '@/lib/studio/vault-import'
import { probeAudioDurationSec } from '@/lib/studio/catalog-timestamp-probe'
import { normalizeDurationSec, resolveCatalogDuration } from '@/lib/studio/catalog-timestamps'
import { durationToSeconds } from '@/lib/studio/isrc-format'
import { extractCopyIntelCard } from '@/lib/studio/copy-intelligence'
import { loadSonicDnaIntelligenceCard } from '@/lib/audio/load-local-measured'
import {
  contributorsFromVault,
  mergeContributors,
  parseContributors,
} from '@/lib/studio/track-credits'
import { linkDspMastersForRelease } from '@/lib/studio/link-dsp-masters-server'

const VAULT_TRACK_SELECT =
  'id, title, artist, folder_id, audio_file_id, file_url, artwork_url, duration, date, date_created, year, genre, subgenre, bpm, key_signature, energy_level, danceability, sonic_dna, display_order, track_number, is_archived, metadata'

export async function loadVaultFolderWithTracks(
  supabase: SupabaseClient,
  folderId: string,
): Promise<{ folder: VaultFolderRow; tracks: VaultTrackRow[] }> {
  const { data: folder, error: folderError } = await supabase
    .from('music_library_folders')
    .select('id, name, type, artwork_url, year, album_artist, genre, metadata')
    .eq('id', folderId)
    .maybeSingle()

  if (folderError) throw new Error(folderError.message)
  if (!folder) throw new Error('Vault folder not found')

  const { data: tracks, error: tracksError } = await supabase
    .from('music_library_tracks')
    .select(
      VAULT_TRACK_SELECT,
    )
    .eq('folder_id', folderId)
    .or('is_archived.is.null,is_archived.eq.false')
    .order('display_order', { ascending: true })

  if (tracksError) throw new Error(tracksError.message)

  const rows = (tracks || []) as Array<VaultTrackRow & { audio_file_id?: string | null }>
  return {
    folder: folder as VaultFolderRow,
    tracks: await hydrateVaultTracksWithAudio(supabase, rows),
  }
}

async function hydrateVaultTracksWithAudio(
  supabase: SupabaseClient,
  rows: Array<VaultTrackRow & { audio_file_id?: string | null }>,
): Promise<VaultTrackRow[]> {
  const audioIds = [
    ...new Set(rows.map((row) => row.audio_file_id).filter((id): id is string => Boolean(id))),
  ]
  const audioById = new Map<
    string,
    {
      sonic_dna?: unknown
      sonic_dna_status?: string | null
      artwork_url?: string | null
      duration_seconds?: number | null
    }
  >()
  if (audioIds.length) {
    const { data: audioRows, error: audioError } = await supabase
      .from('audio_files')
      .select('id, sonic_dna, sonic_dna_status, artwork_url, duration_seconds')
      .in('id', audioIds)
    if (audioError) throw new Error(audioError.message)
    for (const audio of audioRows || []) {
      audioById.set(audio.id, audio)
    }
  }
  return rows.map((row) => {
    const audio = row.audio_file_id ? audioById.get(row.audio_file_id) : undefined
    return {
      ...row,
      sonic_dna: row.sonic_dna || audio?.sonic_dna || null,
      sonic_dna_status: audio?.sonic_dna_status || null,
      artwork_url: row.artwork_url || audio?.artwork_url || null,
      duration: resolveCatalogDuration({
        vault: row.duration,
        audio: audio?.duration_seconds,
        sonicDna: row.sonic_dna || audio?.sonic_dna,
        metadata: row.metadata,
      }).seconds,
    }
  })
}

const MISSING_IDENTITY_COLUMN = /column|schema cache|sonic_snapshot/i

export async function writeDistributionTrackIdentity(
  supabase: SupabaseClient,
  trackId: string,
  identity: StudioTrackIdentity,
) {
  const { error } = await supabase
    .from('distribution_tracks')
    .update(distributionTrackIdentityPayload(identity))
    .eq('id', trackId)
  if (error && !MISSING_IDENTITY_COLUMN.test(error.message)) {
    throw new Error(error.message)
  }
}

export type ImportVaultOptions = {
  folderId: string
  /** Existing release to fill / attach into. If omitted, creates a new release. */
  releaseId?: string | null
  /** When filling an existing release, overwrite empty fields only (default true). */
  fillEmptyOnly?: boolean
}

/**
 * Create or fill a distribution release from a Music Vault folder.
 * Links distribution_tracks via music_library_track_id; uses vault file_url as provisional wav_url.
 */
export async function importVaultFolderToStudio(
  supabase: SupabaseClient,
  opts: ImportVaultOptions,
) {
  const { folder, tracks } = await loadVaultFolderWithTracks(supabase, opts.folderId)
  if (!isStudioVaultImportFolderType(folder.type)) {
    throw new Error(
      'Release Studio only imports Music Vault EP folders as a set. Add crate tracks as singles from Add tracks.',
    )
  }
  if (!tracks.length) {
    throw new Error('Vault folder has no tracks to import')
  }

  const draft = buildVaultReleaseDraft(folder, tracks)
  const fillEmptyOnly = opts.fillEmptyOnly !== false
  let releaseId = opts.releaseId?.trim() || ''
  let created = false
  let persistedRelease: Record<string, unknown>

  if (!releaseId) {
    releaseId = studioReleaseIdFromVaultFolder(folder.id)
    const { data: release, error } = await supabase
      .from('distribution_releases')
      .insert({
        id: releaseId,
        title: draft.release.title,
        type: draft.release.type,
        release_date: draft.release.release_date,
        artwork_url: draft.release.artwork_url,
        description: draft.release.description,
        explicit: draft.release.explicit,
        genre: draft.release.genre,
        subgenre: draft.release.subgenre,
        label_name: draft.release.label_name,
        marketing_copy: marketingCopyWithVaultMeta(
          marketingCopyFromDna(dnaCopyInputFromDraft(draft)),
          draft.release.source_folder_id,
        ),
        distribution_mode: 'self',
        target_stores: ALL_DSP_STORE_IDS,
        distributor_status: 'draft',
      })
      .select('*')
      .single()

    if (error) {
      const duplicate =
        error.code === '23505' || /duplicate key|already exists/i.test(error.message || '')
      if (!duplicate) throw new Error(error.message || 'Failed to create release')
      // A prior attempt can save the row, then fail while mirroring the calendar file.
      const { data: existing, error: fetchError } = await supabase
        .from('distribution_releases')
        .select('*')
        .eq('id', releaseId)
        .single()
      if (fetchError || !existing) throw new Error(error.message || 'Failed to create release')
      persistedRelease = existing
    } else {
      created = true
      persistedRelease = release
    }
  } else {
    const { data: existing, error: fetchError } = await supabase
      .from('distribution_releases')
      .select('*')
      .eq('id', releaseId)
      .single()

    if (fetchError || !existing) throw new Error('Release not found')

    const existingFolder = vaultFolderIdFromMarketingCopy(
      (existing.marketing_copy as Record<string, unknown>) || null,
    )
    if (existingFolder && existingFolder !== draft.release.source_folder_id) {
      throw new Error(
        `Release "${existing.title || releaseId}" is already linked to a different vault folder. Open that release instead of overwriting it.`,
      )
    }

    const updates: Record<string, unknown> = {
      marketing_copy: marketingCopyWithVaultMeta(
        mergeGeneratedMarketingCopy(
          (existing.marketing_copy as Record<string, unknown>) || {},
          marketingCopyFromDna(dnaCopyInputFromDraft(draft)),
          fillEmptyOnly,
        ),
        draft.release.source_folder_id,
      ),
    }
    const maybeSet = (key: string, value: unknown) => {
      if (value == null || value === '') return
      if (fillEmptyOnly && existing[key] != null && existing[key] !== '') return
      updates[key] = value
    }
    maybeSet('title', draft.release.title)
    maybeSet('type', draft.release.type)
    maybeSet('artwork_url', draft.release.artwork_url)
    maybeSet('genre', draft.release.genre)
    maybeSet('subgenre', draft.release.subgenre)
    maybeSet('description', draft.release.description)
    maybeSet('release_date', draft.release.release_date)
    maybeSet('label_name', draft.release.label_name)

    const { data: release, error } = await supabase
      .from('distribution_releases')
      .update(updates)
      .eq('id', releaseId)
      .select('*')
      .single()

    if (error) throw new Error(error.message || 'Failed to update release')
    persistedRelease = release
  }

  const libraryIds = draft.tracks.map((t) => t.music_library_track_id)
  const { data: existingLinks } = await supabase
    .from('distribution_tracks')
    .select('id, music_library_track_id, release_id')
    .in('music_library_track_id', libraryIds)

  const byLibrary = new Map(
    (existingLinks || [])
      .filter((r) => r.music_library_track_id)
      .map((r) => [r.music_library_track_id as string, r]),
  )

  const trackResults: Array<{
    music_library_track_id: string
    distribution_track_id: string
    status: 'created' | 'linked' | 'skipped' | 'error'
    message?: string
  }> = []

  for (const t of draft.tracks) {
    const existing = byLibrary.get(t.music_library_track_id)
    if (existing) {
      if (existing.release_id && existing.release_id !== releaseId) {
        trackResults.push({
          music_library_track_id: t.music_library_track_id,
          distribution_track_id: existing.id,
          status: 'skipped',
          message: 'Already on another release',
        })
        continue
      }
      const { error: linkError } = await supabase
        .from('distribution_tracks')
        .update({
          release_id: releaseId,
          title: t.title,
          artwork_url: t.artwork_url || undefined,
          duration: t.duration,
        })
        .eq('id', existing.id)

      if (linkError) {
        trackResults.push({
          music_library_track_id: t.music_library_track_id,
          distribution_track_id: existing.id,
          status: 'error',
          message: linkError.message,
        })
      } else {
        await writeDistributionTrackIdentity(supabase, existing.id, t.identity)
        trackResults.push({
          music_library_track_id: t.music_library_track_id,
          distribution_track_id: existing.id,
          status: 'linked',
        })
      }
      continue
    }

    const distId = `dtrack-${t.music_library_track_id}`.slice(0, 80)
    const { data: inserted, error: insertError } = await supabase
      .from('distribution_tracks')
      .insert({
        id: distId,
        release_id: releaseId,
        music_library_track_id: t.music_library_track_id,
        title: t.title,
        duration: t.duration,
        wav_url: t.wav_url,
        artwork_url: t.artwork_url,
        contributors: t.contributors,
        splits: [],
        explicit: false,
        language: 'en',
        track_number: t.track_number,
        instrumental: false,
      })
      .select('id')
      .single()

    if (insertError) {
      // ID collision — try unique suffix
      const altId = `${distId}-${Date.now().toString(36)}`.slice(0, 80)
      const { data: inserted2, error: insertError2 } = await supabase
        .from('distribution_tracks')
        .insert({
          id: altId,
          release_id: releaseId,
          music_library_track_id: t.music_library_track_id,
          title: t.title,
          duration: t.duration,
          wav_url: t.wav_url,
          artwork_url: t.artwork_url,
          contributors: t.contributors,
          splits: [],
          explicit: false,
          language: 'en',
          track_number: t.track_number,
          instrumental: false,
        })
        .select('id')
        .single()

      if (insertError2) {
        trackResults.push({
          music_library_track_id: t.music_library_track_id,
          distribution_track_id: '',
          status: 'error',
          message: insertError2.message,
        })
      } else {
        trackResults.push({
          music_library_track_id: t.music_library_track_id,
          distribution_track_id: inserted2!.id,
          status: 'created',
        })
        await writeDistributionTrackIdentity(supabase, inserted2!.id, t.identity)
      }
    } else {
      trackResults.push({
        music_library_track_id: t.music_library_track_id,
        distribution_track_id: inserted!.id,
        status: 'created',
      })
      await writeDistributionTrackIdentity(supabase, inserted!.id, t.identity)
    }
  }

  let masters: Awaited<ReturnType<typeof linkDspMastersForRelease>> | null = null
  try {
    masters = await linkDspMastersForRelease(supabase, String(persistedRelease.id))
  } catch (mastersError) {
    console.error('Auto-pull DSP masters after vault import failed', mastersError)
  }

  return {
    created,
    release: persistedRelease,
    draft,
    tracks: trackResults,
    masters,
    dnaHints: {
      genre: draft.release.genre,
      subgenre: draft.release.subgenre,
      descriptionSeeded: Boolean(draft.release.description),
      tracksWithDna: draft.tracks.filter((t) => t.dna_complete).length,
      trackCount: draft.tracks.length,
    },
  }
}

type CatalogTimestampVaultSource = {
  genre?: string | null
  subgenre?: string | null
  sonic_dna?: unknown
  duration?: number | null
  audio_duration?: number | null
  metadata?: unknown
  audio_file_id?: string | null
  file_url?: string | null
}

async function loadCatalogTimestampVaultSources(
  supabase: SupabaseClient,
  vaultIds: string[],
): Promise<Map<string, CatalogTimestampVaultSource>> {
  const vaultById = new Map<string, CatalogTimestampVaultSource>()
  const uniqueIds = [...new Set(vaultIds.filter(Boolean))]
  if (!uniqueIds.length) return vaultById

  const { data: vaultTracks } = await supabase
    .from('music_library_tracks')
    .select('id, genre, subgenre, sonic_dna, duration, audio_file_id, file_url, metadata')
    .in('id', uniqueIds)

  const audioIds = [
    ...new Set(
      (vaultTracks || [])
        .map((row) => row.audio_file_id)
        .filter((id): id is string => typeof id === 'string' && Boolean(id)),
    ),
  ]
  const audioById = new Map<string, { duration_seconds?: number | null; sonic_dna?: unknown }>()
  if (audioIds.length) {
    const { data: audioRows } = await supabase
      .from('audio_files')
      .select('id, duration_seconds, sonic_dna')
      .in('id', audioIds)
    for (const audio of audioRows || []) {
      audioById.set(String(audio.id), audio)
    }
  }

  for (const row of vaultTracks || []) {
    const audio = row.audio_file_id ? audioById.get(String(row.audio_file_id)) : undefined
    const compiled = loadSonicDnaIntelligenceCard({
      trackId: String(row.id),
      audioFileId: row.audio_file_id ? String(row.audio_file_id) : null,
      filePath: typeof row.file_url === 'string' ? row.file_url : null,
    })
    vaultById.set(String(row.id), {
      genre: row.genre,
      subgenre: row.subgenre,
      duration: row.duration,
      audio_duration: audio?.duration_seconds ?? null,
      metadata: row.metadata,
      audio_file_id: row.audio_file_id ? String(row.audio_file_id) : null,
      file_url: typeof row.file_url === 'string' ? row.file_url : null,
      sonic_dna: compiled || row.sonic_dna || audio?.sonic_dna || null,
    })
  }
  return vaultById
}

async function persistResolvedCatalogDurations(
  supabase: SupabaseClient,
  rows: Array<{
    id?: unknown
    duration?: unknown
    music_library_track_id?: unknown
    audio_file_id?: unknown
  }>,
  resolved: Array<number | null>,
) {
  await Promise.all(
    rows.map(async (row, index) => {
      const id = typeof row.id === 'string' ? row.id : ''
      const next = resolved[index]
      const existing = durationToSeconds(typeof row.duration === 'number' ? row.duration : null)
      if (next == null || next <= 0) return
      if (existing != null && existing > 0) return
      const writes: Promise<unknown>[] = []
      if (id) {
        writes.push(Promise.resolve(supabase.from('distribution_tracks').update({ duration: next }).eq('id', id)))
      }
      const vaultId = typeof row.music_library_track_id === 'string' ? row.music_library_track_id : ''
      if (vaultId) {
        writes.push(
          Promise.resolve(supabase.from('music_library_tracks').update({ duration: next }).eq('id', vaultId)),
        )
      }
      const audioId = typeof row.audio_file_id === 'string' ? row.audio_file_id : ''
      if (audioId) {
        writes.push(
          Promise.resolve(supabase.from('audio_files').update({ duration_seconds: next }).eq('id', audioId)),
        )
      }
      if (writes.length) await Promise.all(writes)
    }),
  )
}

async function probeMissingCatalogDurations(
  items: Array<{ seconds: number | null; fileUrl?: string | null; wavUrl?: string | null }>,
): Promise<Array<number | null>> {
  const out = items.map((item) => item.seconds)
  const missing = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.seconds == null)
  const workers = Math.min(3, missing.length)
  let cursor = 0
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (cursor < missing.length) {
        const current = missing[cursor++]
        if (!current) return
        const seconds = await probeAudioDurationSec(current.item.fileUrl || current.item.wavUrl)
        if (seconds != null) out[current.index] = seconds
      }
    }),
  )
  return out
}

function catalogSourceFromDistributionRow(
  row: Record<string, unknown>,
  vault?: {
    genre?: string | null
    subgenre?: string | null
    sonic_dna?: unknown
    duration?: number | null
    audio_duration?: number | null
    metadata?: unknown
  } | null,
): CatalogCopySourceTrack {
  const snap =
    row.sonic_snapshot && typeof row.sonic_snapshot === 'object' && !Array.isArray(row.sonic_snapshot)
      ? (row.sonic_snapshot as Partial<StudioTrackIdentity>)
      : {}
  const bpmRaw = snap.bpm ?? row.bpm
  const bpm = Number(bpmRaw)
  const vaultNote = vault ? descriptionFromSonicDna(vault.sonic_dna) : null
  const duration = resolveCatalogDuration({
    catalog: row.duration,
    vault: vault?.duration,
    audio: vault?.audio_duration,
    sonicDna: vault?.sonic_dna,
    metadata: vault?.metadata,
  }).seconds
  const isrcRaw = row.isrc_full ?? row.isrc
  return {
    title: typeof row.title === 'string' ? row.title : '',
    track_number: Number(row.track_number) || null,
    contributors: row.contributors,
    duration,
    isrc: typeof isrcRaw === 'string' ? isrcRaw : null,
    sonic_dna: vault?.sonic_dna,
    copy_intel: extractCopyIntelCard(vault?.sonic_dna, typeof row.title === 'string' ? row.title : ''),
    identity: {
      description:
        (typeof snap.description === 'string' && snap.description) ||
        (typeof row.description === 'string' && row.description) ||
        vaultNote,
      genre:
        snap.genre ||
        (typeof row.genre === 'string' ? row.genre : null) ||
        vault?.genre ||
        null,
      subgenre:
        snap.subgenre ||
        (typeof row.subgenre === 'string' ? row.subgenre : null) ||
        vault?.subgenre ||
        null,
      bpm: Number.isFinite(bpm) && bpm > 0 ? bpm : null,
      key_signature:
        snap.key_signature || (typeof row.key_signature === 'string' ? row.key_signature : null) || null,
      drum_style: snap.drum_style || null,
      intention: snap.intention || null,
    },
  }
}

export async function loadDnaCopyInputForRelease(
  supabase: SupabaseClient,
  releaseId: string,
): Promise<{ input: DnaCopyInput; existingCopy: Record<string, unknown> }> {
  const { data: release, error } = await supabase
    .from('distribution_releases')
    .select(
      'id, title, type, genre, subgenre, description, album_artist, label_name, release_date, language, artwork_designer, artwork_photographer, artwork_illustrator, marketing_copy',
    )
    .eq('id', releaseId)
    .single()

  if (error || !release) throw new Error('Release not found')

  const { data: tracks } = await supabase
    .from('distribution_tracks')
    .select(
      'id, title, track_number, description, genre, subgenre, bpm, key_signature, sonic_snapshot, contributors, music_library_track_id, duration, isrc_full, wav_url',
    )
    .eq('release_id', releaseId)
    .order('created_at', { ascending: true })

  const trackRows = (tracks || []) as Array<Record<string, unknown>>
  const vaultById = await loadCatalogTimestampVaultSources(
    supabase,
    trackRows
      .map((row) => row.music_library_track_id as string | null)
      .filter((id): id is string => Boolean(id)),
  )

  const yearRaw = String(release.release_date || '').slice(0, 4)
  const year = Number(yearRaw)
  const catalogTracks = trackRows.map((row) => {
    const vaultId = typeof row.music_library_track_id === 'string' ? row.music_library_track_id : ''
    const vault = vaultId ? vaultById.get(vaultId) : null
    const compiled =
      vaultId
        ? loadSonicDnaIntelligenceCard({
            trackId: vaultId,
            audioFileId: vault?.audio_file_id,
            filePath: vault?.file_url,
          })
        : null
    const sonic_dna = compiled || vault?.sonic_dna
    return catalogSourceFromDistributionRow(
      row,
      sonic_dna || vault
        ? {
            genre: vault?.genre,
            subgenre: vault?.subgenre,
            duration: vault?.duration,
            audio_duration: vault?.audio_duration,
            metadata: vault?.metadata,
            sonic_dna,
          }
        : null,
    )
  })
  const probed = await probeMissingCatalogDurations(
    catalogTracks.map((track, index) => {
      const vaultId = typeof trackRows[index]?.music_library_track_id === 'string'
        ? String(trackRows[index].music_library_track_id)
        : ''
      const vault = vaultId ? vaultById.get(vaultId) : null
      return {
        seconds: track.duration ?? null,
        fileUrl: vault?.file_url,
        wavUrl: typeof trackRows[index]?.wav_url === 'string' ? String(trackRows[index].wav_url) : null,
      }
    }),
  )
  catalogTracks.forEach((track, index) => {
    track.duration = probed[index] ?? track.duration ?? null
  })
  await persistResolvedCatalogDurations(
    supabase,
    trackRows.map((row, index) => {
      const vaultId = typeof row.music_library_track_id === 'string' ? row.music_library_track_id : ''
      const vault = vaultId ? vaultById.get(vaultId) : null
      return {
        ...row,
        audio_file_id: vault?.audio_file_id,
      }
    }),
    catalogTracks.map((track) => track.duration ?? null),
  )

  return {
    input: dnaCopyInputFromCatalog({
      title: String(release.title || 'Untitled'),
      type: (release.type as string | null) || null,
      genre: (release.genre as string | null) || null,
      subgenre: (release.subgenre as string | null) || null,
      description: (release.description as string | null) || null,
      artist:
        (release.album_artist as string | null) || (release.label_name as string | null) || 'SERGIK',
      label: (release.label_name as string | null) || null,
      language: (release.language as string | null) || null,
      streetDate: (release.release_date as string | null) || null,
      year: year > 1900 ? year : null,
      tracks: catalogTracks,
      artwork_designer: (release.artwork_designer as string | null) || null,
      artwork_photographer: (release.artwork_photographer as string | null) || null,
      artwork_illustrator: (release.artwork_illustrator as string | null) || null,
    }),
    existingCopy: (release.marketing_copy as Record<string, unknown>) || {},
  }
}

export async function applyMarketingCopyFromDna(
  supabase: SupabaseClient,
  releaseId: string,
  opts?: { fillEmptyOnly?: boolean; persist?: boolean },
) {
  const fillEmptyOnly = Boolean(opts?.fillEmptyOnly)
  const { input, existingCopy } = await loadDnaCopyInputForRelease(supabase, releaseId)
  const generated = marketingCopyFromDna(input)
  const merged = mergeGeneratedMarketingCopy(existingCopy, generated, fillEmptyOnly)

  if (opts?.persist) {
    const { error } = await supabase
      .from('distribution_releases')
      .update({ marketing_copy: merged })
      .eq('id', releaseId)
    if (error) throw new Error(error.message)
  }

  return { generated, copy: merged, input }
}

function persistedIdentityFromRow(track: Record<string, unknown>): Partial<StudioTrackIdentity> {
  const snap = track.sonic_snapshot
  if (snap && typeof snap === 'object' && !Array.isArray(snap)) {
    return snap as Partial<StudioTrackIdentity>
  }
  const bpm = Number(track.bpm)
  return {
    description: typeof track.description === 'string' ? track.description : null,
    genre: typeof track.genre === 'string' ? track.genre : null,
    subgenre: typeof track.subgenre === 'string' ? track.subgenre : null,
    bpm: Number.isFinite(bpm) && bpm > 0 ? bpm : null,
    key_signature: typeof track.key_signature === 'string' ? track.key_signature : null,
  }
}

const EMPTY_IDENTITY: StudioTrackIdentity = {
  description: null,
  genre: null,
  subgenre: null,
  bpm: null,
  key_signature: null,
  scale: null,
  energy: null,
  danceability: null,
  drum_style: null,
  time_signature: null,
  timing_feel: null,
  intention: null,
  instruments: [],
  dna_complete: false,
  lyrics_excerpt: null,
  press_source: null,
}

/** Attach a unique Sonic DNA card to each distribution track (live vault + persisted snapshot). */
export async function enrichDistributionTracksWithVaultIdentity(
  supabase: SupabaseClient,
  tracks: Array<Record<string, unknown>>,
): Promise<Array<Record<string, unknown> & { identity: StudioTrackIdentity }>> {
  const vaultIds = [
    ...new Set(
      tracks
        .map((track) => track.music_library_track_id)
        .filter((id): id is string => typeof id === 'string' && Boolean(id)),
    ),
  ]

  const liveById = new Map<string, VaultTrackRow>()
  if (vaultIds.length) {
    const { data, error } = await supabase
      .from('music_library_tracks')
      .select(
        VAULT_TRACK_SELECT,
      )
      .in('id', vaultIds)
    if (error) throw new Error(error.message)
    const hydrated = await hydrateVaultTracksWithAudio(
      supabase,
      (data || []) as Array<VaultTrackRow & { audio_file_id?: string | null }>,
    )
    for (const row of hydrated) liveById.set(row.id, row)
  }

  const creditSeedIds = new Set<string>()
  const numberSeedIds = new Set<string>()
  const durationSeedIds = new Set<string>()
  const enriched: Array<
    Record<string, unknown> & {
      identity: StudioTrackIdentity
      contributors: ReturnType<typeof parseContributors>
      track_number: number
    }
  > = tracks.map((track, index) => {
    const vaultId = typeof track.music_library_track_id === 'string' ? track.music_library_track_id : ''
    const vault = vaultId ? liveById.get(vaultId) : undefined
    const live = vault ? studioTrackIdentityFromVault(vault) : EMPTY_IDENTITY
    const identity = mergeStudioTrackIdentity(persistedIdentityFromRow(track), live)
    const existingCredits = parseContributors(track.contributors)
    const contributors = mergeContributors(
      existingCredits,
      contributorsFromVault({
        artist: vault?.artist,
        title: typeof track.title === 'string' ? track.title : vault?.title,
      }),
    )
    const id = typeof track.id === 'string' ? track.id : ''
    if (id && !existingCredits.length && contributors.length) creditSeedIds.add(id)
    const existingNumber = Number(track.track_number)
    const inferredNumber =
      (typeof vault?.track_number === 'number' && vault.track_number > 0 && vault.track_number) ||
      (typeof vault?.display_order === 'number' && vault.display_order > 0 && vault.display_order) ||
      index + 1
    const track_number =
      Number.isFinite(existingNumber) && existingNumber > 0 ? existingNumber : inferredNumber
    if (id && !(Number.isFinite(existingNumber) && existingNumber > 0)) numberSeedIds.add(id)
    const compiled = vaultId
      ? loadSonicDnaIntelligenceCard({
          trackId: vaultId,
          audioFileId: vault?.audio_file_id,
          filePath: vault?.file_url,
        })
      : null
    const resolved = resolveCatalogDuration({
      catalog: track.duration,
      vault: vault?.duration,
      sonicDna: compiled || vault?.sonic_dna,
      metadata: vault?.metadata,
    })
    const duration = resolved.seconds
    if (id && resolved.source !== 'catalog' && duration != null && duration > 0) {
      durationSeedIds.add(id)
    }
    return {
      ...track,
      identity,
      contributors,
      track_number,
      duration,
      copy_intel: extractCopyIntelCard(vault?.sonic_dna, typeof track.title === 'string' ? track.title : vault?.title),
    }
  })

  const probed = await probeMissingCatalogDurations(
    enriched.map((track) => {
      const vaultId = typeof track.music_library_track_id === 'string' ? track.music_library_track_id : ''
      const vault = vaultId ? liveById.get(vaultId) : undefined
      return {
        seconds: normalizeDurationSec(track.duration),
        fileUrl: vault?.file_url,
        wavUrl: typeof track.wav_url === 'string' ? track.wav_url : null,
      }
    }),
  )
  enriched.forEach((track, index) => {
    const seconds = probed[index]
    if (seconds == null) return
    track.duration = seconds
    const id = typeof track.id === 'string' ? track.id : ''
    if (id) durationSeedIds.add(id)
  })
  await persistResolvedCatalogDurations(
    supabase,
    enriched.map((track, index) => {
      const vaultId = typeof track.music_library_track_id === 'string' ? track.music_library_track_id : ''
      const vault = vaultId ? liveById.get(vaultId) : undefined
      return {
        id: track.id,
        duration: tracks[index]?.duration,
        music_library_track_id: track.music_library_track_id,
        audio_file_id: vault?.audio_file_id,
      }
    }),
    probed,
  )

  await Promise.all(
    enriched.map(async (track) => {
      const id = typeof track.id === 'string' ? track.id : ''
      if (!id) return
      const writes: Promise<unknown>[] = []
      const persisted = persistedIdentityFromRow(track)
      const keptNote =
        typeof persisted.description === 'string' &&
        persisted.description.trim() &&
        !isAnalysisCopy(persisted.description)
      if (!keptNote && (track.identity.description || track.identity.genre || track.identity.bpm)) {
        writes.push(writeDistributionTrackIdentity(supabase, id, track.identity))
      }
      if (creditSeedIds.has(id)) {
        writes.push(
          Promise.resolve(
            supabase.from('distribution_tracks').update({ contributors: track.contributors }).eq('id', id),
          ),
        )
      }
      if (numberSeedIds.has(id)) {
        writes.push(
          Promise.resolve(
            supabase.from('distribution_tracks').update({ track_number: track.track_number }).eq('id', id),
          ),
        )
      }
      if (durationSeedIds.has(id) && typeof track.duration === 'number' && track.duration > 0) {
        writes.push(
          Promise.resolve(
            supabase.from('distribution_tracks').update({ duration: track.duration }).eq('id', id),
          ),
        )
      }
      if (writes.length) await Promise.all(writes)
    }),
  )

  return enriched
}

/** Persist unique Sonic DNA cards onto existing distribution tracks after vault attach. */
export async function persistDistributionTrackIdentitiesFromVault(
  supabase: SupabaseClient,
  pairs: Array<{ distributionTrackId: string; vaultTrackId: string }>,
) {
  const vaultIds = [
    ...new Set(pairs.map((pair) => pair.vaultTrackId).filter((id) => Boolean(id))),
  ]
  if (!vaultIds.length) return

  const { data, error } = await supabase
    .from('music_library_tracks')
    .select(
      VAULT_TRACK_SELECT,
    )
    .in('id', vaultIds)
  if (error) throw new Error(error.message)

  const hydrated = await hydrateVaultTracksWithAudio(
    supabase,
    (data || []) as Array<VaultTrackRow & { audio_file_id?: string | null }>,
  )
  const byId = new Map(hydrated.map((row) => [row.id, row]))

  await Promise.all(
    pairs.map(async (pair) => {
      const vault = byId.get(pair.vaultTrackId)
      if (!vault) return
      await writeDistributionTrackIdentity(
        supabase,
        pair.distributionTrackId,
        studioTrackIdentityFromVault(vault),
      )
    }),
  )
}
