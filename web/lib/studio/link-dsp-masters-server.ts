/**
 * Auto-attach DSP masters when a release is set up.
 *
 * Order:
 * 1. Link if already in R2 `audio/dsp-masters/…`
 * 2. Else scan local SERGIK drive (Exports / Album Release Masters / Distrokid downloads),
 *    upload to R2, and link
 * 3. Else mark missing so the UI can ask the user to locate a WAV
 *
 * Local scan only works when this Next.js process can see the drive (local/home-server).
 * On Vercel it skips to R2 + missing.
 */

import { existsSync } from 'fs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cacheBustMediaUrl } from '@/lib/audio/replace-audio-file'
import {
  getR2MediaConfig,
  listR2Prefix,
  publicR2MediaUrl,
  r2ObjectExists,
  vaultMediaProxyUrl,
} from '@/lib/audio/r2Media'
import {
  DSP_MASTERS_R2_PREFIX,
  defaultDspMasterScanRoots,
  dspMastersRelativePath,
  dspMastersReleaseSlug,
  isDspMasterUrl,
  matchTrackToDspMaster,
  pickDspMasterR2Key,
  scanDspMasterSources,
  type DspMasterSourceHit,
} from '@/lib/studio/dsp-masters'
import { ingestDspMaster } from '@/lib/studio/dsp-masters-ingest-server'

export type LocateMasterTrackResult = {
  trackId: string
  title: string
  isrc: string | null
  status: 'linked' | 'ingested' | 'already' | 'missing' | 'error'
  wav_url: string | null
  relativePath: string | null
  localPath?: string | null
  message?: string
}

export type LocateMastersReleaseResult = {
  releaseId: string
  releaseTitle: string
  linked: number
  ingested: number
  missing: number
  already: number
  localScan: boolean
  tracks: LocateMasterTrackResult[]
}

function mediaUrlForRelative(relativePath: string): string {
  return cacheBustMediaUrl(publicR2MediaUrl(relativePath) || vaultMediaProxyUrl(relativePath))
}

function localDriveAvailable(): boolean {
  return defaultDspMasterScanRoots().some((root) => {
    try {
      return existsSync(root)
    } catch {
      return false
    }
  })
}

async function resolveR2KeyForTrack(opts: {
  releaseTitle: string
  trackTitle: string
  isrc?: string | null
  releaseKeys: string[]
  globalKeys: string[]
}): Promise<string | null> {
  const canonical = dspMastersRelativePath({
    releaseTitle: opts.releaseTitle,
    trackTitle: opts.trackTitle,
    isrc: opts.isrc,
  })
  if (await r2ObjectExists(canonical)) return canonical

  const fromRelease = pickDspMasterR2Key(opts.releaseKeys, {
    trackTitle: opts.trackTitle,
    isrc: opts.isrc,
    releaseTitle: opts.releaseTitle,
  })
  if (fromRelease) return fromRelease

  return pickDspMasterR2Key(opts.globalKeys, {
    trackTitle: opts.trackTitle,
    isrc: opts.isrc,
    releaseTitle: opts.releaseTitle,
  })
}

/**
 * For each track on a release: prefer R2 dsp-masters, else ingest from local drive.
 * Missing tracks are returned so the UI can ask the user to locate a file.
 */
export async function linkDspMastersForRelease(
  supabase: SupabaseClient,
  releaseId: string,
  opts?: { force?: boolean; trackIds?: string[]; skipLocal?: boolean },
): Promise<LocateMastersReleaseResult> {
  const { data: release, error: releaseErr } = await supabase
    .from('distribution_releases')
    .select('id, title, album_artist')
    .eq('id', releaseId)
    .single()
  if (releaseErr || !release) {
    throw new Error(releaseErr?.message || 'Release not found')
  }

  const releaseTitle = String(release.title || 'Untitled')
  const artist = typeof release.album_artist === 'string' ? release.album_artist : 'Sergik'

  let trackQuery = supabase
    .from('distribution_tracks')
    .select('id, title, isrc_full, wav_url, music_library_track_id, duration')
    .eq('release_id', releaseId)
    .order('track_number', { ascending: true })

  if (opts?.trackIds?.length) {
    trackQuery = trackQuery.in('id', opts.trackIds)
  }

  const { data: tracks, error: trackErr } = await trackQuery
  if (trackErr) throw new Error(trackErr.message)

  const empty: LocateMastersReleaseResult = {
    releaseId,
    releaseTitle,
    linked: 0,
    ingested: 0,
    missing: 0,
    already: 0,
    localScan: false,
    tracks: [],
  }

  if (!tracks?.length) return empty

  const canR2 = Boolean(getR2MediaConfig())
  const canLocal = !opts?.skipLocal && localDriveAvailable()

  let releaseKeys: string[] = []
  let globalKeys: string[] = []
  if (canR2) {
    const releaseSlug = dspMastersReleaseSlug(releaseTitle)
    ;[releaseKeys, globalKeys] = await Promise.all([
      listR2Prefix(`${DSP_MASTERS_R2_PREFIX}/${releaseSlug}`, { maxKeys: 200 }),
      listR2Prefix(DSP_MASTERS_R2_PREFIX, { maxKeys: 2000 }),
    ])
  }

  let localSources: DspMasterSourceHit[] = []
  if (canLocal) {
    try {
      localSources = scanDspMasterSources(defaultDspMasterScanRoots())
    } catch (err) {
      console.warn('[linkDspMastersForRelease] local scan failed', err)
    }
  }

  const results: LocateMasterTrackResult[] = []
  let linked = 0
  let ingested = 0
  let missing = 0
  let already = 0

  for (const track of tracks) {
    const trackId = String(track.id)
    const title = String(track.title || 'Untitled')
    const isrc = typeof track.isrc_full === 'string' ? track.isrc_full : null
    const currentWav = typeof track.wav_url === 'string' ? track.wav_url : null
    const vaultId =
      typeof track.music_library_track_id === 'string' ? track.music_library_track_id : null
    const knownDuration = typeof track.duration === 'number' ? track.duration : null

    if (!opts?.force && isDspMasterUrl(currentWav)) {
      already++
      results.push({
        trackId,
        title,
        isrc,
        status: 'already',
        wav_url: currentWav,
        relativePath: null,
        message: 'already on dsp-masters',
      })
      continue
    }

    try {
      // 1) R2 hit
      if (canR2) {
        const relativePath = await resolveR2KeyForTrack({
          releaseTitle,
          trackTitle: title,
          isrc,
          releaseKeys,
          globalKeys,
        })
        if (relativePath) {
          const fileUrl = mediaUrlForRelative(relativePath)
          const { error: upErr } = await supabase
            .from('distribution_tracks')
            .update({ wav_url: fileUrl })
            .eq('id', trackId)
          if (upErr) {
            results.push({
              trackId,
              title,
              isrc,
              status: 'error',
              wav_url: currentWav,
              relativePath,
              message: upErr.message,
            })
            continue
          }
          if (vaultId) {
            await supabase.from('music_library_tracks').update({ file_url: fileUrl }).eq('id', vaultId)
          }
          linked++
          results.push({
            trackId,
            title,
            isrc,
            status: 'linked',
            wav_url: fileUrl,
            relativePath,
            message: 'linked from R2 DSP Masters',
          })
          continue
        }
      }

      // 2) Local drive match → upload to R2
      if (canLocal && localSources.length && canR2) {
        const hit = matchTrackToDspMaster(localSources, {
          trackTitle: title,
          isrc,
          releaseTitle,
        })
        if (hit) {
          const result = await ingestDspMaster(supabase, {
            hit,
            releaseTitle,
            trackTitle: title,
            isrc,
            artist,
            distributionTrackId: trackId,
            musicLibraryTrackId: vaultId,
            knownDurationSec: knownDuration,
            skipIfAlreadyOnDspMasters: !opts?.force,
            verifyDuration: knownDuration != null,
          })
          if (result.status === 'ingested' || result.status === 'skipped') {
            ingested++
            results.push({
              trackId,
              title,
              isrc,
              status: result.status === 'skipped' ? 'already' : 'ingested',
              wav_url: result.wav_url,
              relativePath: result.relativePath,
              localPath: hit.absPath,
              message: result.message || `from local: ${hit.fileName}`,
            })
            continue
          }
          results.push({
            trackId,
            title,
            isrc,
            status: 'error',
            wav_url: currentWav,
            relativePath: result.relativePath,
            localPath: hit.absPath,
            message: result.message || 'local ingest failed',
          })
          continue
        }
      }

      // 3) Ask user to locate
      missing++
      results.push({
        trackId,
        title,
        isrc,
        status: 'missing',
        wav_url: currentWav,
        relativePath: null,
        message: canLocal
          ? 'not found on local drive — locate a WAV'
          : 'not found in DSP Masters — locate a WAV',
      })
    } catch (err) {
      results.push({
        trackId,
        title,
        isrc,
        status: 'error',
        wav_url: currentWav,
        relativePath: null,
        message: err instanceof Error ? err.message : 'locate failed',
      })
    }
  }

  return {
    releaseId,
    releaseTitle,
    linked,
    ingested,
    missing,
    already,
    localScan: canLocal,
    tracks: results,
  }
}
