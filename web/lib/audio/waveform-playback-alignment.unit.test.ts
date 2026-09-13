import { describe, expect, it } from 'vitest'
import {
  fetchStaticWaveformTape,
  looksLikeSyntheticPeaks,
  parseStaticWaveformJson,
  staticWaveformJsonUrl,
  staticWaveformRelPath,
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

describe('staticWaveformJsonUrl', () => {
  it('maps m4a and wav masters to the mp3 tape JSON path', () => {
    expect(staticWaveformRelPath('unreleased/Playlists/Feelin Sendy/SERGIK - Bender.m4a')).toBe(
      'unreleased/Playlists/Feelin Sendy/SERGIK - Bender.json',
    )
    expect(staticWaveformJsonUrl('unreleased/Playlists/Feelin Sendy/SERGIK - Bender.m4a')).toBe(
      '/waveforms/unreleased/Playlists/Feelin%20Sendy/SERGIK%20-%20Bender.json',
    )
    expect(staticWaveformJsonUrl('unreleased/eps/SERGIK - FTP/SERGIK - FTP.wav')).toBe(
      '/waveforms/unreleased/eps/SERGIK%20-%20FTP/SERGIK%20-%20FTP.json',
    )
  })
})

describe('fetchStaticWaveformTape', () => {
  it('uses the API and treats available:false as a miss', async () => {
    const originalFetch = globalThis.fetch
    const calls: string[] = []
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      calls.push(url)
      return new Response(JSON.stringify({ available: false }), { status: 200 })
    }) as typeof fetch
    try {
      const tape = await fetchStaticWaveformTape('unreleased/Playlists/Feelin Sendy/SERGIK - Bender.m4a')
      expect(tape).toBeNull()
      expect(calls[0]).toContain('/api/audio/static-waveform?')
      expect(calls[0]).not.toContain('/waveforms/')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

describe('parseStaticWaveformJson', () => {
  it('reads compact deploy tapes', () => {
    const tape = parseStaticWaveformJson({ d: [0.2, 0.4], e: [[0.4, 0.2, 0.1, 0.2, 0.3]] })
    expect(tape?.data).toEqual([0.2, 0.4])
    expect(tape?.envelopes?.[0]).toEqual({ peak: 0.4, rms: 0.2, low: 0.1, mid: 0.2, high: 0.3 })
  })

  it('returns null for empty bodies', () => {
    expect(parseStaticWaveformJson({})).toBeNull()
    expect(parseStaticWaveformJson(null)).toBeNull()
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
