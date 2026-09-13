/**
 * Load waveform samples for a track (preload / ghost tape).
 * Mirrors MusicPlayer peak resolution without React state.
 */

import { peaksOrEnvelopesToWaveformSamples, DEFAULT_WAVEFORM_BUCKETS } from '@/lib/audio/waveform-dsp-envelope'
import {
  waveformAnalysisUrls,
  vaultRelativePath,
  canAnalyzeAudioWaveform,
  fetchStaticWaveformTape,
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

export function clearCachedWaveformSamples(trackId?: string) {
  if (!trackId) {
    memCache.clear()
    return
  }
  memCache.delete(trackId)
}

export async function loadWaveformSamplesForTrack(
  track: TrackLike,
  knownUrl?: string | null,
  options?: { allowFullDecode?: boolean },
): Promise<{ samples: WaveformSample[]; durationSec: number } | null> {
  const hit = memCache.get(track.id)
  if (hit?.samples.length) return hit

  const durationSec =
    typeof track.duration === 'number' && track.duration > 0 ? track.duration : 180

  const tryPeaks = (
    peaks: number[],
    envelopes?: {
      peak: number
      rms: number
      low: number
      mid: number
      high: number
      flux?: number
    }[] | null,
  ) => {
    const samples = peaksOrEnvelopesToWaveformSamples(
      peaks,
      envelopes?.map((e) => ({
        peak: e.peak,
        rms: e.rms,
        low: e.low,
        mid: e.mid,
        high: e.high,
        flux: typeof e.flux === 'number' ? e.flux : 0,
      })),
    )
    if (!samples.length) return null
    const packed = { samples, durationSec }
    memCache.set(track.id, packed)
    return packed
  }

  // Deployed JSON tape (skipped when public/waveforms is empty — avoids console 404s)
  const storageRel = vaultRelativePath(knownUrl || '') || vaultRelativePath(track.file) || null
  if (storageRel) {
    const tape = await fetchStaticWaveformTape(storageRel)
    if (tape?.data.length) {
      const packed = tryPeaks(tape.data, tape.envelopes)
      if (packed) return packed
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
  if (!options?.allowFullDecode) return null

  for (const u of candidates) {
    if (!canAnalyzeAudioWaveform()) break
    try {
      const peakData = await generatePeakData(u, DEFAULT_WAVEFORM_BUCKETS)
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
