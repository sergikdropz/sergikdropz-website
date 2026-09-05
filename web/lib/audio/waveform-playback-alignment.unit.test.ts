import { describe, expect, it } from 'vitest'
import {
  looksLikeSyntheticPeaks,
  storedWaveformLikelyStale,
  waveformAnalysisUrls,
} from './waveform-playback-alignment'

describe('storedWaveformLikelyStale', () => {
  it('flags wav track file against mp3 playback URL', () => {
    expect(
      storedWaveformLikelyStale(
        'unreleased/eps/SERGIK - Inspire/SERGIK - The McCoy.wav',
        'https://example.supabase.co/storage/v1/object/public/audio-files/unreleased/eps/SERGIK%20-%20Inspire/SERGIK%20-%20The%20McCoy.mp3',
      ),
    ).toBe(true)
  })

  it('accepts matching mp3 paths', () => {
    const path = 'unreleased/eps/SERGIK - Inspire/SERGIK - The McCoy.mp3'
    expect(
      storedWaveformLikelyStale(
        path,
        `https://example.supabase.co/storage/v1/object/public/audio-files/${encodeURIComponent(path)}`,
      ),
    ).toBe(false)
  })
})

describe('looksLikeSyntheticPeaks', () => {
  it('detects the default sine fallback pattern', () => {
    const bars = 2000
    const peaks = Array.from({ length: bars }, (_, i) => {
      const position = i / bars
      return (
        0.08 +
        Math.abs(Math.sin(position * Math.PI * 12)) * 0.35 +
        Math.abs(Math.sin(position * Math.PI * 48)) * 0.25 +
        Math.abs(Math.sin(position * Math.PI * 120)) * 0.15
      )
    })
    expect(looksLikeSyntheticPeaks(peaks)).toBe(true)
  })
})

describe('waveformAnalysisUrls', () => {
  it('includes same-origin /audio path for tunnel playback URLs', () => {
    const urls = waveformAnalysisUrls(
      'https://tunnel.trycloudflare.com/audio/unreleased/eps/SERGIK%20-%20Inspire/a.mp3',
      'unreleased/eps/SERGIK - Inspire/a.mp3',
    )
    expect(urls.some((u) => u.startsWith('/audio/'))).toBe(true)
  })

  it('never returns a cross-origin candidate', () => {
    const urls = waveformAnalysisUrls(
      'https://lunisolar-nonsolicitously-ofelia.ngrok-free.dev/audio/unreleased/eps/SERGIK%20-%20FTP/SERGIK%20-%20FTP.mp3',
      'https://lunisolar-nonsolicitously-ofelia.ngrok-free.dev/audio/unreleased/eps/SERGIK%20-%20FTP/SERGIK%20-%20FTP.mp3',
    )
    expect(urls.length).toBeGreaterThan(0)
    for (const u of urls) expect(u.startsWith('/')).toBe(true)
  })
})
