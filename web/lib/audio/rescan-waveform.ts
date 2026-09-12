import { waveformAnalysisUrls, canAnalyzeAudioWaveform } from '@/lib/audio/waveform-playback-alignment'
import { sanitizeWaveformPeaks } from '@/lib/audio/sanitize-waveform-peaks'
import {
  setPlaybackWaveformCache,
  clearPlaybackWaveformCache,
} from '@/lib/audio/waveform-playback-cache'
import { clearCachedWaveformSamples } from '@/lib/audio/waveform-track-loader'
import { generatePeakData, type PeakData } from '@/utils/audioWorkerClient'
import { resolveAudioUrl } from '@/utils/resolveAudioUrl'
import { DEFAULT_WAVEFORM_BUCKETS } from '@/lib/audio/waveform-dsp-envelope'

export type RescannedWaveform = {
  peaks: number[]
  envelopes?: PeakData['envelopes']
  samples: number
}

export async function rescanAndPersistWaveform(track: {
  id: string
  file?: string | null
  audioFileId?: string | null
  title?: string | null
}): Promise<RescannedWaveform> {
  const file = String(track.file || '').trim()
  if (!file) throw new Error('No audio file on this track to rescan')
  if (!canAnalyzeAudioWaveform()) {
    throw new Error('This browser cannot decode audio for a waveform rescan')
  }

  const url = await resolveAudioUrl(file)
  const candidates = waveformAnalysisUrls(url, file)
  let peakData: PeakData | null = null
  for (const candidate of candidates) {
    try {
      const next = await generatePeakData(candidate, DEFAULT_WAVEFORM_BUCKETS)
      if (next?.data?.length) {
        peakData = next
        break
      }
    } catch {
      /* try the next playback URL */
    }
  }

  const peaks = sanitizeWaveformPeaks(peakData?.data)
  if (!peaks || !peakData) {
    throw new Error('Could not decode this file into a waveform. Play the track once, then rescan.')
  }

  const res = await fetch('/api/audio/waveform', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      trackId: track.id,
      audioFileId: track.audioFileId || undefined,
      path: file,
      title: track.title || undefined,
      peaks,
      envelopes: peakData.envelopes,
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || 'Failed to save the rescanned waveform')
  }

  for (const candidate of candidates) {
    clearPlaybackWaveformCache(candidate)
    setPlaybackWaveformCache(candidate, { ...peakData, data: peaks })
  }
  clearCachedWaveformSamples(track.id)

  return {
    peaks,
    envelopes: peakData.envelopes,
    samples: peaks.length,
  }
}
