/**
 * Ingest DistroKid Vault WAV masters into Music Vault + distribution_tracks.
 * Audio bytes go to Cloudflare R2 (same `audio/` layout as the Music Vault).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { extractMetadataFromBuffer } from '@/utils/extractMetadataFromBuffer'
import { generateWaveformFromBuffer } from '@/utils/generateWaveformFromBuffer'
import { processUploadOptimized } from '@/utils/processUploadOptimized'
import {
  cacheBustMediaUrl,
  fingerprintHashFromBuffer,
  safeAudioFileName,
} from '@/lib/audio/replace-audio-file'
import { normalizeTitleKey } from '@/lib/studio/distrokid-import'
import { saveLocalVaultAudioFile } from '@/lib/music-library/ingest-vault-audio'
import { planImportedAudio, transcodeAudioToMp3 } from '@/lib/audio/stream-master'
import {
  getR2MediaConfig,
  putR2Object,
  publicR2MediaUrl,
  vaultMediaProxyUrl,
} from '@/lib/audio/r2Media'
import {
  DISTROKID_EXPORTS_FOLDER_ID,
  isrcFromVaultMeta,
  mergeReleaseOntoVaultTrack,
  pickCanonicalVaultTrack,
  vaultTitleMatchKey,
  type VaultMergeCandidate,
} from '@/lib/music-library/merge-release-vault-track'

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'track'
  )
}

export type DistroKidWavIngestInput = {
  buffer: Buffer
  fileName: string
  isrc?: string | null
  title?: string | null
  artist?: string | null
  albumTitle?: string | null
  albumuuid?: string | null
  /** Skip if distribution track already has music_library_track_id + wav_url */
  skipIfVaultLinked?: boolean
}

export type DistroKidWavIngestResult = {
  status: 'ingested' | 'skipped' | 'error'
  isrc: string | null
  title: string | null
  distribution_track_id: string | null
  music_library_track_id: string | null
  wav_url: string | null
  message?: string
}

const DISTROKID_EXPORTS_FOLDER_NAME = 'Distrokid Exports'

/**
 * Keep DistroKid WAV masters under the Distrokid Exports playlist folder —
 * do not create per-release “DistroKid — …” sidebar EPs/singles.
 * When merging onto an existing vault track we leave that track in its home folder.
 */
async function ensureDistroKidFolder(
  supabase: SupabaseClient,
  opts: { albumuuid?: string | null; albumTitle?: string | null; typeHint?: string },
): Promise<string> {
  const folderId = DISTROKID_EXPORTS_FOLDER_ID
  const { data: existing } = await supabase
    .from('music_library_folders')
    .select('id')
    .eq('id', folderId)
    .maybeSingle()
  if (existing?.id) return existing.id

  const { error } = await supabase.from('music_library_folders').insert({
    id: folderId,
    name: DISTROKID_EXPORTS_FOLDER_NAME,
    type: 'folder',
    parent_id: null,
    hidden: false,
    metadata: {
      source: 'distrokid-exports',
      albumuuid: opts.albumuuid || null,
      importedAt: new Date().toISOString(),
    },
  })
  if (error && !/duplicate|unique/i.test(error.message)) {
    throw new Error(error.message)
  }
  return folderId
}

async function findExistingVaultTrack(
  supabase: SupabaseClient,
  opts: {
    musicLibraryTrackId?: string | null
    isrc?: string | null
    title?: string | null
    artist?: string | null
  },
): Promise<VaultMergeCandidate | null> {
  if (opts.musicLibraryTrackId) {
    const { data } = await supabase
      .from('music_library_tracks')
      .select(
        'id, title, artist, file_url, artwork_url, duration, bpm, key_signature, genre, subgenre, year, date, date_created, folder_id, audio_file_id, is_archived, metadata',
      )
      .eq('id', opts.musicLibraryTrackId)
      .maybeSingle()
    if (data?.id && !data.is_archived) return data as VaultMergeCandidate
  }

  const { data: rows } = await supabase
    .from('music_library_tracks')
    .select(
      'id, title, artist, file_url, artwork_url, duration, bpm, key_signature, genre, subgenre, year, date, date_created, folder_id, audio_file_id, is_archived, metadata',
    )
    .or('is_archived.is.null,is_archived.eq.false')
    .limit(5000)

  const candidates: VaultMergeCandidate[] = []
  const wantIsrc = opts.isrc ? opts.isrc.replace(/[^A-Za-z0-9]/g, '').toUpperCase() : null
  const wantTitle = opts.title ? vaultTitleMatchKey(opts.title, opts.artist) : ''

  for (const row of rows || []) {
    const hit = row as VaultMergeCandidate
    if (wantIsrc && isrcFromVaultMeta(hit.metadata) === wantIsrc) {
      candidates.push(hit)
      continue
    }
    if (wantTitle && vaultTitleMatchKey(String(hit.title || ''), hit.artist) === wantTitle) {
      candidates.push(hit)
    }
  }

  return pickCanonicalVaultTrack(candidates, wantIsrc)
}

async function archiveVaultDuplicate(
  supabase: SupabaseClient,
  duplicateId: string,
  keepId: string,
): Promise<void> {
  if (!duplicateId || duplicateId === keepId) return
  await supabase
    .from('music_library_tracks')
    .update({
      is_archived: true,
      archived_at: new Date().toISOString(),
      metadata: {
        merged_into: keepId,
        merged_at: new Date().toISOString(),
        reason: 'release_vault_dedupe',
      },
    })
    .eq('id', duplicateId)

  // Repoint any Studio links from the archived twin onto the keep row.
  await supabase
    .from('distribution_tracks')
    .update({ music_library_track_id: keepId })
    .eq('music_library_track_id', duplicateId)
}

async function findDistributionTrack(
  supabase: SupabaseClient,
  opts: { isrc?: string | null; title?: string | null },
): Promise<Record<string, unknown> | null> {
  if (opts.isrc) {
    const { data } = await supabase
      .from('distribution_tracks')
      .select('id, title, isrc_full, wav_url, music_library_track_id, release_id, duration')
      .eq('isrc_full', opts.isrc.replace(/-/g, '').toUpperCase())
      .maybeSingle()
    if (data) return data as Record<string, unknown>
  }
  if (opts.title) {
    const key = normalizeTitleKey(opts.title)
    const { data } = await supabase
      .from('distribution_tracks')
      .select('id, title, isrc_full, wav_url, music_library_track_id, release_id, duration')
      .ilike('title', opts.title)
      .limit(5)
    const exact = (data || []).find((row) => normalizeTitleKey(String(row.title || '')) === key)
    if (exact) return exact as Record<string, unknown>
  }
  return null
}

/**
 * Upload a DistroKid WAV into audio-files + music_library_tracks and link the
 * matching distribution_tracks row (by ISRC, then title).
 */
export async function ingestDistroKidWav(
  supabase: SupabaseClient,
  input: DistroKidWavIngestInput,
): Promise<DistroKidWavIngestResult> {
  const isrc = input.isrc ? input.isrc.replace(/-/g, '').toUpperCase() : null
  const title = input.title?.trim() || null
  const dist = await findDistributionTrack(supabase, { isrc, title })

  if (
    input.skipIfVaultLinked !== false &&
    dist?.music_library_track_id &&
    dist?.wav_url
  ) {
    const wavUrl = String(dist.wav_url)
    // Re-upload when the prior ingest landed on Supabase Storage (size-limited).
    if (!/supabase\.co\/storage/i.test(wavUrl)) {
      return {
        status: 'skipped',
        isrc,
        title: title || (typeof dist.title === 'string' ? dist.title : null),
        distribution_track_id: String(dist.id),
        music_library_track_id: String(dist.music_library_track_id),
        wav_url: wavUrl,
        message: 'Already linked to Music Vault',
      }
    }
  }

  const fileName = safeAudioFileName(input.fileName, 'master.wav')
  // DistroKid sometimes returns MP3 masters named `*.mp3.wav`
  if (!/\.(wav|mp3)$/i.test(fileName) && !/\.mp3\.wav$/i.test(input.fileName)) {
    return {
      status: 'error',
      isrc,
      title,
      distribution_track_id: dist ? String(dist.id) : null,
      music_library_track_id: null,
      wav_url: null,
      message: 'File must be a WAV (or DistroKid MP3 master)',
    }
  }

  if (!getR2MediaConfig()) {
    return {
      status: 'error',
      isrc,
      title,
      distribution_track_id: dist ? String(dist.id) : null,
      music_library_track_id: null,
      wav_url: null,
      message: 'Cloudflare R2 is not configured (R2_ACCOUNT_ID / KEY / SECRET / BUCKET)',
    }
  }

  const artist = input.artist?.trim() || 'Sergik'
  const trackTitle = title || fileName.replace(/\.(wav|mp3)$/i, '')
  const folderId = await ensureDistroKidFolder(supabase, {
    albumuuid: input.albumuuid,
    albumTitle: input.albumTitle || trackTitle,
  })

  const relativePath = `distrokid/${slugify(input.albumuuid || input.albumTitle || 'imports')}/${fileName}`
  const looksLikeMp3 =
    /\.mp3$/i.test(fileName) ||
    /\.mp3\.wav$/i.test(input.fileName) ||
    input.buffer.subarray(0, 3).toString('binary') === 'ID3' ||
    (input.buffer[0] === 0xff && (input.buffer[1] & 0xe0) === 0xe0)
  const contentType = looksLikeMp3 ? 'audio/mpeg' : 'audio/wav'
  let format = looksLikeMp3 ? 'MP3' : 'WAV'

  try {
    await putR2Object(relativePath, input.buffer, { contentType })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err || 'R2 upload failed')
    return {
      status: 'error',
      isrc,
      title: trackTitle,
      distribution_track_id: dist ? String(dist.id) : null,
      music_library_track_id: null,
      wav_url: null,
      message,
    }
  }

  const fileUrl = cacheBustMediaUrl(
    publicR2MediaUrl(relativePath) || vaultMediaProxyUrl(relativePath),
  )
  const planned = planImportedAudio({ fileName, vaultRelativePath: relativePath })
  let streamUrl = fileUrl
  let distributionWavUrl = fileUrl
  if (planned.isWav && planned.dspWavRelativePath) {
    try {
      if (planned.dspWavRelativePath !== relativePath) {
        await saveLocalVaultAudioFile(planned.dspWavRelativePath, input.buffer)
        await putR2Object(planned.dspWavRelativePath, input.buffer, { contentType: 'audio/wav' })
        distributionWavUrl = cacheBustMediaUrl(
          publicR2MediaUrl(planned.dspWavRelativePath) ||
            vaultMediaProxyUrl(planned.dspWavRelativePath),
        )
      }
      const mp3 = await transcodeAudioToMp3(input.buffer)
      await saveLocalVaultAudioFile(planned.streamRelativePath, mp3)
      await putR2Object(planned.streamRelativePath, mp3, { contentType: 'audio/mpeg' })
      streamUrl = cacheBustMediaUrl(
        publicR2MediaUrl(planned.streamRelativePath) || vaultMediaProxyUrl(planned.streamRelativePath),
      )
      format = 'MP3'
    } catch (err) {
      console.warn(
        '[distrokid-wav] MP3 stream encode failed, website will use the WAV until re-ingest:',
        err instanceof Error ? err.message : err,
      )
    }
  }
  const fingerprint = fingerprintHashFromBuffer(input.buffer)
  const metadata = await extractMetadataFromBuffer(input.buffer, fileName)
  const waveform = await generateWaveformFromBuffer(input.buffer, fileName)
  const duration = metadata.duration != null ? Math.round(metadata.duration) : null

  let audioFileId: string | null = null
  {
    const { data: byPath } = await supabase
      .from('audio_files')
      .select('id')
      .eq('file_path', relativePath)
      .maybeSingle()
    if (byPath?.id) {
      audioFileId = byPath.id
      await supabase
        .from('audio_files')
        .update({
          file_url: streamUrl,
          file_name: fileName,
          format: format,
          size_bytes: input.buffer.length,
          size_mb: parseFloat((input.buffer.length / (1024 * 1024)).toFixed(2)),
          duration_seconds: duration,
          key_signature: metadata.key || null,
          waveform_data: waveform?.data || null,
          waveform_samples: waveform?.samples || null,
          sonic_dna_status: 'pending',
          sonic_dna_error: null,
        })
        .eq('id', audioFileId)
    } else {
      const { data: inserted, error } = await supabase
        .from('audio_files')
        .insert({
          title: trackTitle,
          artist,
          file_name: fileName,
          file_path: relativePath,
          file_url: streamUrl,
          format: format,
          size_bytes: input.buffer.length,
          size_mb: parseFloat((input.buffer.length / (1024 * 1024)).toFixed(2)),
          duration_seconds: duration,
          folder_path: relativePath.includes('/')
            ? relativePath.slice(0, relativePath.lastIndexOf('/'))
            : '',
          is_purchasable: false,
          key_signature: metadata.key || null,
          waveform_data: waveform?.data || null,
          waveform_samples: waveform?.samples || null,
          sonic_dna_status: 'pending',
        })
        .select('id')
        .single()
      if (error) {
        return {
          status: 'error',
          isrc,
          title: trackTitle,
          distribution_track_id: dist ? String(dist.id) : null,
          music_library_track_id: null,
          wav_url: null,
          message: error.message,
        }
      }
      audioFileId = inserted.id
    }
  }

  let libraryTrackId: string | null = null
  if (audioFileId) {
    const vaultMatch = await findExistingVaultTrack(supabase, {
      musicLibraryTrackId:
        typeof dist?.music_library_track_id === 'string' ? dist.music_library_track_id : null,
      isrc,
      title: trackTitle,
      artist,
    })

    const { data: existingByAudio } = await supabase
      .from('music_library_tracks')
      .select('id')
      .eq('audio_file_id', audioFileId)
      .maybeSingle()

    if (vaultMatch?.id) {
      libraryTrackId = vaultMatch.id
      const merged = mergeReleaseOntoVaultTrack(vaultMatch, {
        file_url: distributionWavUrl,
        audio_file_id: audioFileId,
        duration,
        isrc,
        albumuuid: input.albumuuid || null,
        fingerprint,
        source: 'distrokid-wav',
      })
      if (!/\.mp3(\?|$)/i.test(merged.file_url || '')) merged.file_url = streamUrl
      if (planned.dspWavRelativePath) merged.metadata.dspMastersPath = planned.dspWavRelativePath
      await supabase
        .from('music_library_tracks')
        .update({
          file_url: merged.file_url,
          audio_file_id: merged.audio_file_id,
          duration: merged.duration,
          date: merged.date,
          year: merged.year,
          // Keep the track in its vault EP/crate — do not move into Distrokid Exports.
          metadata: merged.metadata,
        })
        .eq('id', libraryTrackId)

      // Archive Distrokid Exports / audio twin so All Songs doesn't list duplicates.
      if (existingByAudio?.id && existingByAudio.id !== libraryTrackId) {
        await archiveVaultDuplicate(supabase, String(existingByAudio.id), libraryTrackId)
      }
    } else if (existingByAudio?.id) {
      libraryTrackId = existingByAudio.id
      await supabase
        .from('music_library_tracks')
        .update({
          file_url: streamUrl,
          title: trackTitle,
          artist,
          duration,
          folder_id: folderId,
          metadata: {
            source: 'distrokid-wav',
            isrc,
            albumuuid: input.albumuuid || null,
            fingerprint,
            importedAt: new Date().toISOString(),
          },
        })
        .eq('id', libraryTrackId)
    } else {
      libraryTrackId = `track-dk-${slugify(isrc || trackTitle)}-${Date.now().toString(36)}`.slice(
        0,
        80,
      )
      const { error: trackErr } = await supabase.from('music_library_tracks').insert({
        id: libraryTrackId,
        folder_id: folderId,
        audio_file_id: audioFileId,
        title: trackTitle,
        artist,
        file_url: streamUrl,
        duration,
        metadata: {
          source: 'distrokid-wav',
          isrc,
          albumuuid: input.albumuuid || null,
          fingerprint,
          importedAt: new Date().toISOString(),
        },
      })
      if (trackErr) {
        return {
          status: 'error',
          isrc,
          title: trackTitle,
          distribution_track_id: dist ? String(dist.id) : null,
          music_library_track_id: null,
          wav_url: distributionWavUrl,
          message: trackErr.message,
        }
      }
    }

    processUploadOptimized(audioFileId, input.buffer, fileName, fileUrl, relativePath, {
      metadata,
      waveform,
      musicbrainz: null,
    })
  }

  if (dist?.id) {
    const { error: linkErr } = await supabase
      .from('distribution_tracks')
      .update({
        wav_url: distributionWavUrl,
        music_library_track_id: libraryTrackId,
        duration: duration ?? (typeof dist.duration === 'number' ? dist.duration : null),
        fingerprint_hash: fingerprint,
      })
      .eq('id', dist.id)
    if (linkErr) {
      return {
        status: 'error',
        isrc,
        title: trackTitle,
        distribution_track_id: String(dist.id),
        music_library_track_id: libraryTrackId,
        wav_url: distributionWavUrl,
        message: linkErr.message,
      }
    }
  }

  return {
    status: 'ingested',
    isrc,
    title: trackTitle,
    distribution_track_id: dist ? String(dist.id) : null,
    music_library_track_id: libraryTrackId,
    wav_url: distributionWavUrl,
  }
}

/** Parse ISRC from DistroKid download filenames like QZES72569811-Soul-Candy.wav */
export function isrcFromDistroKidWavFileName(fileName: string): string | null {
  const base = fileName.split(/[/\\]/).pop() || fileName
  const match = base.match(/^([A-Z0-9]{12})[-_]/i)
  if (match) return match[1].toUpperCase()
  const any = base.match(/\b([A-Z]{2}[A-Z0-9]{10})\b/i)
  return any ? any[1].toUpperCase() : null
}

export function titleFromDistroKidWavFileName(fileName: string): string | null {
  const base = (fileName.split(/[/\\]/).pop() || fileName).replace(/\.wav$/i, '')
  const withoutIsrc = base.replace(/^[A-Z0-9]{12}[-_]/i, '')
  let cleaned = withoutIsrc.replace(/[-_]+/g, ' ').trim()
  // DistroKid content-disposition style: SERGIKSoulCandy
  if (/^SERGIK/i.test(cleaned) && !cleaned.includes(' ')) {
    cleaned = cleaned.replace(/^SERGIK/i, '').trim()
  }
  // CamelCase / glued titles → spaced words (SoulCandy → Soul Candy)
  if (cleaned && !/\s/.test(cleaned)) {
    cleaned = cleaned
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .replace(/([a-zA-Z])(\d)/g, '$1 $2')
      .replace(/(\d)([a-zA-Z])/g, '$1 $2')
      .trim()
  }
  return cleaned || null
}
