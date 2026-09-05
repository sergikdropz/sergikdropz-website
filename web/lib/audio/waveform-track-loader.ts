/**
 * Load waveform samples for a track (preload / ghost tape).
 * Mirrors MusicPlayer peak resolution without React state.
 */

import { peaksOrEnvelopesToWaveformSamples } from '@/lib/audio/waveform-dsp-envelope'
import {
  waveformAnalysisUrls,
  vaultRelativePath,
  canAnalyzeAudioWaveform,
  staticWaveformJsonUrl,
} from '@/lib/audio/waveform-playback-alignment'
import {
  getPlaybackWaveformCache,
  setPlaybackWaveformCache,
} from '@/lib/audio/waveform-playback-cache'
import type { WaveformSample } from '@/lib/audio/waveform-view'
import { generatePeakData } from '@/utils/audioWorkerClient'
import { resolveAudioUrl } from '@/utils/resolveAudioUrl'

type TrackLike = {
  id: string
  file: string
  waveform_data?: number[] | null
  duration?: number | null
}

const memCache = new Map<string, { samples: WaveformSample[]; durationSec: number }>()

export function getCachedWaveformSamples(trackId: string) {
  return memCache.get(trackId) || null
}

export async function loadWaveformSamplesForTrack(
  track: TrackLike,
  knownUrl?: string | null
): Promise<{ samples: WaveformSample[]; durationSec: number } | null> {
  const hit = memCache.get(track.id)
  if (hit?.samples.length) return hit

  const durationSec =
    typeof track.duration === 'number' && track.duration > 0 ? track.duration : 180

  const tryPeaks = (
    peaks: number[],
    envelopes?: { peak: number; rms: number; low: number; mid: number; high: number }[] | null
  ) => {
    const samples = peaksOrEnvelopesToWaveformSamples(peaks, envelopes)
    if (!samples.length) return null
    const packed = { samples, durationSec }
    memCache.set(track.id, packed)
    return packed
  }

  // Deployed JSON tape
  const storageRel = vaultRelativePath(knownUrl || '') || vaultRelativePath(track.file) || null
  if (storageRel) {
    const jsonPath = staticWaveformJsonUrl(storageRel)
    try {
      const res = await fetch(jsonPath, { cache: 'force-cache' })
      if (res.ok) {
        const body = await res.json()
        const data: number[] | undefined = Array.isArray(body?.d)
          ? body.d
          : Array.isArray(body?.data)
            ? body.data
            : undefined
        let envelopes:
          | { peak: number; rms: number; low: number; mid: number; high: number }[]
          | undefined
        if (Array.isArray(body?.e) && body.e.length && Array.isArray(body.e[0])) {
          envelopes = body.e.map((row: number[]) => ({
            peak: row[0] ?? 0,
            rms: row[1] ?? 0,
            low: row[2] ?? 0,
            mid: row[3] ?? 0,
            high: row[4] ?? 0,
          }))
        } else if (Array.isArray(body?.envelopes)) {
          envelopes = body.envelopes
        }
        if (data?.length) {
          const packed = tryPeaks(data, envelopes)
          if (packed) return packed
        }
      }
    } catch {
      /* continue */
    }
  }

  const inline = Array.isArray(track.waveform_data) ? track.waveform_data : []
  if (inline.length > 64) {
    const packed = tryPeaks(inline)
    if (packed) return packed
  }

  let url = knownUrl || null
  if (!url) {
    try {
      url = await resolveAudioUrl(track.file)
    } catch {
      url = null
    }
  }
  if (!url) return null

  const candidates = waveformAnalysisUrls(url, track.file)
  for (const u of candidates) {
    const cached = getPlaybackWaveformCache(u)
    if (cached?.data?.length) {
      const packed = tryPeaks(cached.data, cached.envelopes)
      if (packed) return packed
    }
  }
  for (const u of candidates) {
    if (!canAnalyzeAudioWaveform()) break
    try {
      const peakData = await generatePeakData(u, 1600)
      if (!peakData?.data?.length) continue
      setPlaybackWaveformCache(u, peakData)
      const packed = tryPeaks(peakData.data, peakData.envelopes)
      if (packed) return packed
    } catch {
      /* try next */
    }
  }
  return null
}
