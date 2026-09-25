import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import {
  clearPlaybackWaveformCache,
  getPlaybackWaveformCache,
  loadPlaybackWaveformCache,
  setPlaybackWaveformCache,
} from '@/lib/audio/waveform-playback-cache'
import type { PeakData } from '@/utils/audioWorkerClient'

const sample: PeakData = {
  data: [0.1, 0.2, 0.3, 0.4],
  length: 4,
  sampleRate: 44100,
}

describe('waveform-playback-cache', () => {
  beforeEach(() => {
    clearPlaybackWaveformCache()
  })

  afterEach(() => {
    clearPlaybackWaveformCache()
    vi.unstubAllGlobals()
  })

  it('stores and returns peaks from memory (query-stripped key)', () => {
    setPlaybackWaveformCache('/audio/track.mp3?v=1', sample)
    expect(getPlaybackWaveformCache('/audio/track.mp3?v=9')?.data).toEqual(sample.data)
  })

  it('loadPlaybackWaveformCache returns memory hits without needing IDB', async () => {
    setPlaybackWaveformCache('/api/audio/media/x.mp3', sample)
    const loaded = await loadPlaybackWaveformCache('/api/audio/media/x.mp3?token=1')
    expect(loaded?.data).toEqual(sample.data)
  })

  it('loadPlaybackWaveformCache tolerates missing IndexedDB', async () => {
    vi.stubGlobal('indexedDB', undefined)
    clearPlaybackWaveformCache()
    expect(await loadPlaybackWaveformCache('/missing.mp3')).toBeNull()
    setPlaybackWaveformCache('/missing.mp3', sample)
    expect(await loadPlaybackWaveformCache('/missing.mp3')).toEqual(sample)
  })
})
