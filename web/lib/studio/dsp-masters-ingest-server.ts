/**
 * Ingest local WAV masters into Cloudflare R2 `audio/dsp-masters/…`
 * and link them to distribution_tracks.
 *
 * Does NOT run Sonic DNA / waveform analysis — reuses DNA already on the
 * linked Music Vault / audio_files row. A quick WAV-header duration check
 * confirms the matched file lines up with the DB track.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { closeSync, openSync, readSync, statSync } from 'fs'
import {
  cacheBustMediaUrl,
} from '@/lib/audio/replace-audio-file'
import {
  getR2MediaConfig,
  putR2ObjectFromFile,
  publicR2MediaUrl,
  r2ObjectExists,
  vaultMediaProxyUrl,
} from '@/lib/audio/r2Media'
import {
  DSP_MASTERS_FOLDER_ID,
  DSP_MASTERS_FOLDER_NAME,
  dspMastersRelativePath,
  type DspMasterSourceHit,
} from '@/lib/studio/dsp-masters'

export type DspMasterIngestInput = {
  hit: DspMasterSourceHit
  releaseTitle: string
  trackTitle: string
  isrc?: string | null
  artist?: string | null
  distributionTrackId?: string | null
  musicLibraryTrackId?: string | null
  /** Existing studio/vault duration (seconds) for quick match verify */
  knownDurationSec?: number | null
  /** Skip when wav_url already points at dsp-masters/ */
  skipIfAlreadyOnDspMasters?: boolean
  /** Skip R2 put when object already exists (still links DB). */
  skipUploadIfExists?: boolean
  /**
   * Reject upload when WAV header duration disagrees with known DB duration.
   * Default: true when knownDurationSec is set.
   */
  verifyDuration?: boolean
}

export type DspMasterIngestResult = {
  status: 'ingested' | 'skipped' | 'error'
  isrc: string | null
  title: string
  relativePath: string | null
  wav_url: string | null
  distribution_track_id: string | null
  music_library_track_id: string | null
  message?: string
  verify?: {
    wavDurationSec: number | null
    dbDurationSec: number | null
    ok: boolean
  }
}

/** Rough duration from PCM WAV header. Returns null for non-standard headers. */
export function approxWavDurationSeconds(buffer: Buffer): number | null {
  if (buffer.length < 44) return null
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    return null
  }

  // Walk chunks — fmt may not be at a fixed offset (DistroKid / Ableton WAVs often insert JUNK/LIST).
  let byteRate = 0
  let dataBytes: number | null = null
  let offset = 12
  const limit = Math.min(buffer.length, 64 * 1024)
  while (offset + 8 <= limit) {
    const id = buffer.toString('ascii', offset, offset + 4)
    const size = buffer.readUInt32LE(offset + 4)
    const dataStart = offset + 8
    if (id === 'fmt ' && dataStart + 16 <= buffer.length) {
      // audioFormat(2) channels(2) sampleRate(4) byteRate(4) …
      byteRate = buffer.readUInt32LE(dataStart + 8)
    } else if (id === 'data') {
      dataBytes = size
      break
    }
    // Chunks are word-aligned
    offset = dataStart + size + (size % 2)
    if (size <= 0) break
  }

  if (!byteRate) {
    // Legacy fixed-offset fallback for simple PCM WAVs
    byteRate = buffer.readUInt32LE(28)
  }
  if (!byteRate) return null
  if (dataBytes == null) {
    if (buffer.length > 1024) dataBytes = buffer.length - 44
    else return null
  }
  if (dataBytes <= 0) return null
  const sec = dataBytes / byteRate
  if (!Number.isFinite(sec) || sec <= 0) return null
  return Math.round(sec)
}

/**
 * Quick match check: WAV header duration vs DB duration.
 * Allows ±8% or ±6s (whichever is larger) for edits / leading silence.
 */
export function durationsAgree(
  wavSec: number | null | undefined,
  dbSec: number | null | undefined,
): boolean {
  if (wavSec == null || dbSec == null || wavSec <= 0 || dbSec <= 0) return true
  const slack = Math.max(6, Math.round(dbSec * 0.08))
  return Math.abs(wavSec - dbSec) <= slack
}

async function ensureDspMastersFolder(supabase: SupabaseClient): Promise<string> {
  const folderId = DSP_MASTERS_FOLDER_ID
  const { data: existing } = await supabase
    .from('music_library_folders')
    .select('id')
    .eq('id', folderId)
    .maybeSingle()
  if (existing?.id) return existing.id

  const { error } = await supabase.from('music_library_folders').insert({
    id: folderId,
    name: DSP_MASTERS_FOLDER_NAME,
    type: 'folder',
    parent_id: null,
    hidden: false,
    metadata: {
      source: 'dsp-masters',
      purpose: 'distribution-wavs',
      createdAt: new Date().toISOString(),
    },
  })
  if (error && !/duplicate|unique/i.test(error.message)) {
    throw new Error(error.message)
  }
  return folderId
}

export async function ingestDspMaster(
  supabase: SupabaseClient,
  input: DspMasterIngestInput,
): Promise<DspMasterIngestResult> {
  const isrc = input.isrc?.replace(/[^A-Za-z0-9]/g, '').toUpperCase() || null
  const trackTitle = input.trackTitle.trim() || input.hit.fileName.replace(/\.wav$/i, '')
  const relativePath = dspMastersRelativePath({
    releaseTitle: input.releaseTitle,
    trackTitle,
    isrc,
    sourceFileName: input.hit.fileName,
  })

  let distId = input.distributionTrackId || null
  let existingWav: string | null = null
  let existingVaultId: string | null = input.musicLibraryTrackId || null
  let knownDuration = input.knownDurationSec ?? null

  if (distId) {
    const { data: dist } = await supabase
      .from('distribution_tracks')
      .select('id, wav_url, music_library_track_id, duration')
      .eq('id', distId)
      .maybeSingle()
    if (dist) {
      existingWav = typeof dist.wav_url === 'string' ? dist.wav_url : null
      if (!existingVaultId && typeof dist.music_library_track_id === 'string') {
        existingVaultId = dist.music_library_track_id
      }
      if (knownDuration == null && typeof dist.duration === 'number') {
        knownDuration = dist.duration
      }
    }
  } else if (isrc) {
    const { data: byIsrc } = await supabase
      .from('distribution_tracks')
      .select('id, wav_url, music_library_track_id, duration')
      .eq('isrc_full', isrc)
      .maybeSingle()
    if (byIsrc?.id) {
      distId = String(byIsrc.id)
      existingWav = typeof byIsrc.wav_url === 'string' ? byIsrc.wav_url : null
      if (!existingVaultId && typeof byIsrc.music_library_track_id === 'string') {
        existingVaultId = byIsrc.music_library_track_id
      }
      if (knownDuration == null && typeof byIsrc.duration === 'number') {
        knownDuration = byIsrc.duration
      }
    }
  }

  // Prefer vault duration / DNA length when studio duration is missing
  if (existingVaultId && knownDuration == null) {
    const { data: vault } = await supabase
      .from('music_library_tracks')
      .select('duration, audio_file_id')
      .eq('id', existingVaultId)
      .maybeSingle()
    if (typeof vault?.duration === 'number' && vault.duration > 0) {
      knownDuration = vault.duration
    } else if (vault?.audio_file_id) {
      const { data: af } = await supabase
        .from('audio_files')
        .select('duration_seconds, sonic_dna')
        .eq('id', vault.audio_file_id)
        .maybeSingle()
      if (typeof af?.duration_seconds === 'number' && af.duration_seconds > 0) {
        knownDuration = af.duration_seconds
      } else if (af?.sonic_dna && typeof af.sonic_dna === 'object') {
        const dna = af.sonic_dna as Record<string, unknown>
        const bpmBlock = dna.bpm
        const dur =
          typeof dna.duration === 'number'
            ? dna.duration
            : typeof dna.duration_seconds === 'number'
              ? dna.duration_seconds
              : bpmBlock && typeof bpmBlock === 'object' && typeof (bpmBlock as any).duration === 'number'
                ? (bpmBlock as any).duration
                : null
        if (typeof dur === 'number' && dur > 0) knownDuration = Math.round(dur)
      }
    }
  }

  if (
    input.skipIfAlreadyOnDspMasters !== false &&
    existingWav &&
    /\/dsp-masters\//i.test(existingWav)
  ) {
    return {
      status: 'skipped',
      isrc,
      title: trackTitle,
      relativePath,
      wav_url: existingWav,
      distribution_track_id: distId,
      music_library_track_id: existingVaultId,
      message: 'already on dsp-masters',
    }
  }

  if (!getR2MediaConfig()) {
    return {
      status: 'error',
      isrc,
      title: trackTitle,
      relativePath,
      wav_url: null,
      distribution_track_id: distId,
      music_library_track_id: existingVaultId,
      message: 'Cloudflare R2 is not configured',
    }
  }

  let wavDurationSec: number | null = null
  let sizeBytes = 0
  try {
    sizeBytes = statSync(input.hit.absPath).size
    const fd = openSync(input.hit.absPath, 'r')
    const head = Buffer.alloc(Math.min(64 * 1024, sizeBytes))
    readSync(fd, head, 0, head.length, 0)
    closeSync(fd)
    wavDurationSec = approxWavDurationSeconds(head)
  } catch (err) {
    return {
      status: 'error',
      isrc,
      title: trackTitle,
      relativePath,
      wav_url: null,
      distribution_track_id: distId,
      music_library_track_id: existingVaultId,
      message: err instanceof Error ? err.message : 'failed to read WAV header',
    }
  }

  const verifyOk = durationsAgree(wavDurationSec, knownDuration)
  const shouldVerify = input.verifyDuration !== false && knownDuration != null && wavDurationSec != null
  if (shouldVerify && !verifyOk) {
    return {
      status: 'error',
      isrc,
      title: trackTitle,
      relativePath,
      wav_url: null,
      distribution_track_id: distId,
      music_library_track_id: existingVaultId,
      message: `duration mismatch: wav=${wavDurationSec}s db=${knownDuration}s — wrong file?`,
      verify: { wavDurationSec, dbDurationSec: knownDuration, ok: false },
    }
  }

  let fingerprint: string | null = null
  const exists = input.skipUploadIfExists !== false ? await r2ObjectExists(relativePath) : false
  if (!exists) {
    try {
      const uploaded = await putR2ObjectFromFile(relativePath, input.hit.absPath, {
        contentType: 'audio/wav',
      })
      fingerprint = uploaded.sha256
      sizeBytes = uploaded.bytes
    } catch (err) {
      return {
        status: 'error',
        isrc,
        title: trackTitle,
        relativePath,
        wav_url: null,
        distribution_track_id: distId,
        music_library_track_id: existingVaultId,
        message: err instanceof Error ? err.message : 'R2 upload failed',
      }
    }
  }

  const fileUrl = cacheBustMediaUrl(
    publicR2MediaUrl(relativePath) || vaultMediaProxyUrl(relativePath),
  )
  const duration = knownDuration ?? wavDurationSec
  const artist = input.artist?.trim() || 'Sergik'

  let folderId: string
  try {
    folderId = await ensureDspMastersFolder(supabase)
  } catch (err) {
    return {
      status: 'error',
      isrc,
      title: trackTitle,
      relativePath,
      wav_url: fileUrl,
      distribution_track_id: distId,
      music_library_track_id: existingVaultId,
      message: err instanceof Error ? err.message : 'failed to ensure DSP Masters folder',
    }
  }

  let libraryTrackId = existingVaultId
  let audioFileId: string | null = null

  if (libraryTrackId) {
    // Keep existing vault row + DNA. Only refresh the master URL pointer.
    const { data: vault } = await supabase
      .from('music_library_tracks')
      .select('id, audio_file_id, metadata')
      .eq('id', libraryTrackId)
      .maybeSingle()
    audioFileId = typeof vault?.audio_file_id === 'string' ? vault.audio_file_id : null

    const prevMeta =
      vault?.metadata && typeof vault.metadata === 'object' && !Array.isArray(vault.metadata)
        ? (vault.metadata as Record<string, unknown>)
        : {}

    await supabase
      .from('music_library_tracks')
      .update({
        file_url: fileUrl,
        duration: duration ?? undefined,
        metadata: {
          ...prevMeta,
          source: prevMeta.source || 'dsp-masters',
          isrc: isrc || prevMeta.isrc || null,
          fingerprint,
          releaseTitle: input.releaseTitle,
          dspMastersPath: relativePath,
          dspMastersAt: new Date().toISOString(),
        },
      })
      .eq('id', libraryTrackId)

    // Point the existing audio_files row at the DSP master without clearing sonic_dna.
    if (audioFileId) {
      await supabase
        .from('audio_files')
        .update({
          file_url: fileUrl,
          file_path: relativePath,
          file_name: relativePath.split('/').pop(),
          format: 'WAV',
          size_bytes: sizeBytes,
          size_mb: parseFloat((sizeBytes / (1024 * 1024)).toFixed(2)),
          ...(duration != null ? { duration_seconds: duration } : {}),
        })
        .eq('id', audioFileId)
    }
  } else {
    // No vault link — create a DSP Masters playlist stub (no Sonic DNA run).
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
          file_url: fileUrl,
          file_name: relativePath.split('/').pop(),
          format: 'WAV',
          size_bytes: sizeBytes,
          size_mb: parseFloat((sizeBytes / (1024 * 1024)).toFixed(2)),
          ...(duration != null ? { duration_seconds: duration } : {}),
        })
        .eq('id', audioFileId)
    } else {
      const { data: inserted, error } = await supabase
        .from('audio_files')
        .insert({
          title: trackTitle,
          artist,
          file_name: relativePath.split('/').pop(),
          file_path: relativePath,
          file_url: fileUrl,
          format: 'WAV',
          size_bytes: sizeBytes,
          size_mb: parseFloat((sizeBytes / (1024 * 1024)).toFixed(2)),
          duration_seconds: duration,
          folder_path: relativePath.includes('/')
            ? relativePath.slice(0, relativePath.lastIndexOf('/'))
            : DSP_MASTERS_FOLDER_NAME,
          is_purchasable: false,
          sonic_dna_status: 'skipped',
        })
        .select('id')
        .single()
      if (error) {
        return {
          status: 'error',
          isrc,
          title: trackTitle,
          relativePath,
          wav_url: fileUrl,
          distribution_track_id: distId,
          music_library_track_id: null,
          message: error.message,
        }
      }
      audioFileId = inserted.id
    }

    const { data: byAudio } = await supabase
      .from('music_library_tracks')
      .select('id')
      .eq('audio_file_id', audioFileId)
      .maybeSingle()

    if (byAudio?.id) {
      libraryTrackId = byAudio.id
      await supabase
        .from('music_library_tracks')
        .update({
          file_url: fileUrl,
          title: trackTitle,
          artist,
          duration,
          folder_id: folderId,
          metadata: {
            source: 'dsp-masters',
            isrc,
            fingerprint,
            releaseTitle: input.releaseTitle,
            dspMastersPath: relativePath,
            importedAt: new Date().toISOString(),
          },
        })
        .eq('id', libraryTrackId)
    } else {
      libraryTrackId = `track-dsp-${(isrc || trackTitle).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`.slice(
        0,
        80,
      )
      const { error: trackErr } = await supabase.from('music_library_tracks').insert({
        id: libraryTrackId,
        folder_id: folderId,
        audio_file_id: audioFileId,
        title: trackTitle,
        artist,
        file_url: fileUrl,
        duration,
        metadata: {
          source: 'dsp-masters',
          isrc,
          fingerprint,
          releaseTitle: input.releaseTitle,
          dspMastersPath: relativePath,
          importedAt: new Date().toISOString(),
        },
      })
      if (trackErr) {
        return {
          status: 'error',
          isrc,
          title: trackTitle,
          relativePath,
          wav_url: fileUrl,
          distribution_track_id: distId,
          music_library_track_id: null,
          message: trackErr.message,
        }
      }
    }
  }

  if (distId) {
    const linkPayload: Record<string, unknown> = {
      wav_url: fileUrl,
      music_library_track_id: libraryTrackId,
      duration,
    }
    if (fingerprint) linkPayload.fingerprint_hash = fingerprint
    const { error: linkErr } = await supabase
      .from('distribution_tracks')
      .update(linkPayload)
      .eq('id', distId)
    if (linkErr) {
      return {
        status: 'error',
        isrc,
        title: trackTitle,
        relativePath,
        wav_url: fileUrl,
        distribution_track_id: distId,
        music_library_track_id: libraryTrackId,
        message: linkErr.message,
      }
    }
  }

  return {
    status: 'ingested',
    isrc,
    title: trackTitle,
    relativePath,
    wav_url: fileUrl,
    distribution_track_id: distId,
    music_library_track_id: libraryTrackId,
    message: exists
      ? 'linked existing R2 object (DNA preserved)'
      : knownDuration != null
        ? `verified vs DB ${knownDuration}s`
        : 'uploaded (no DB duration to verify)',
    verify: { wavDurationSec, dbDurationSec: knownDuration, ok: verifyOk },
  }
}
