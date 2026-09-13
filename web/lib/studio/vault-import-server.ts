import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildVaultReleaseDraft,
  marketingCopyWithVaultMeta,
  type VaultFolderRow,
  type VaultTrackRow,
} from '@/lib/studio/vault-import'

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
      'id, title, folder_id, file_url, artwork_url, duration, date, date_created, year, genre, subgenre, sonic_dna, sonic_dna_status, display_order, track_number, is_archived, metadata',
    )
    .eq('folder_id', folderId)
    .or('is_archived.is.null,is_archived.eq.false')
    .order('display_order', { ascending: true })

  if (tracksError) throw new Error(tracksError.message)

  return {
    folder: folder as VaultFolderRow,
    tracks: (tracks || []) as VaultTrackRow[],
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
  if (!tracks.length) {
    throw new Error('Vault folder has no tracks to import')
  }

  const draft = buildVaultReleaseDraft(folder, tracks)
  const fillEmptyOnly = opts.fillEmptyOnly !== false
  let releaseId = opts.releaseId?.trim() || ''
  let created = false
  let persistedRelease: Record<string, unknown>

  if (!releaseId) {
    releaseId = `release-${folder.id.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 40)}-${Date.now().toString(36)}`
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
        marketing_copy: marketingCopyWithVaultMeta({}, draft.release.source_folder_id),
        distribution_mode: 'self',
        target_stores: [],
        distributor_status: 'draft',
      })
      .select('*')
      .single()

    if (error) throw new Error(error.message || 'Failed to create release')
    created = true
    persistedRelease = release
  } else {
    const { data: existing, error: fetchError } = await supabase
      .from('distribution_releases')
      .select('*')
      .eq('id', releaseId)
      .single()

    if (fetchError || !existing) throw new Error('Release not found')

    const updates: Record<string, unknown> = {
      marketing_copy: marketingCopyWithVaultMeta(
        (existing.marketing_copy as Record<string, unknown>) || {},
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
        contributors: [],
        splits: [],
        explicit: false,
        language: 'en',
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
          contributors: [],
          splits: [],
          explicit: false,
          language: 'en',
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
      }
    } else {
      trackResults.push({
        music_library_track_id: t.music_library_track_id,
        distribution_track_id: inserted!.id,
        status: 'created',
      })
    }
  }

  return {
    created,
    release: persistedRelease,
    draft,
    tracks: trackResults,
    dnaHints: {
      genre: draft.release.genre,
      subgenre: draft.release.subgenre,
      descriptionSeeded: Boolean(draft.release.description),
      tracksWithDna: draft.tracks.filter((t) => t.dna_complete).length,
      trackCount: draft.tracks.length,
    },
  }
}
