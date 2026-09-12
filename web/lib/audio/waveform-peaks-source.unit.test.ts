import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchWaveformPeaksFromUrl,
  resolveWaveformPeaks,
} from '@/lib/audio/waveform-peaks-source'

const peaks = (n: number) => Array.from({ length: n }, (_, i) => (i % 10) / 10)

function stubFetch(impl: (url: string) => Promise<Response> | Response) {
  const spy = vi.fn((input: any) => impl(String(input)))
  vi.stubGlobal('fetch', spy)
  return spy
}

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    json: async () => body,
  } as unknown as Response
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchWaveformPeaksFromUrl', () => {
  it('returns sanitized peaks from a storage URL', async () => {
    stubFetch(() => jsonResponse(peaks(2000)))
    const result = await fetchWaveformPeaksFromUrl('https://cdn.test/waveforms/a.json')
    expect(result).toHaveLength(2000)
  })

  it('reads compact { d, e } tape payloads with flux', async () => {
    const { parseWaveformTapePayload } = await import('@/lib/audio/waveform-peaks-source')
    const tape = parseWaveformTapePayload({
      v: 2,
      d: peaks(128),
      e: Array.from({ length: 128 }, () => [0.8, 0.4, 0.3, 0.2, 0.1, 0.5]),
    })
    expect(tape?.peaks).toHaveLength(128)
    expect(tape?.envelopes).toHaveLength(128)
    expect(tape?.envelopes?.[0].flux).toBeCloseTo(0.5, 5)
  })

  it('returns null on a non-ok response', async () => {
    stubFetch(() => jsonResponse(null, false))
    expect(await fetchWaveformPeaksFromUrl('https://cdn.test/missing.json')).toBeNull()
  })

  it('returns null when the fetch throws', async () => {
    stubFetch(() => {
      throw new Error('network down')
    })
    expect(await fetchWaveformPeaksFromUrl('https://cdn.test/a.json')).toBeNull()
  })

  it('rejects a payload that is not a peak array', async () => {
    stubFetch(() => jsonResponse({ peaks: [1, 2, 3] }))
    expect(await fetchWaveformPeaksFromUrl('https://cdn.test/a.json')).toBeNull()
  })
})

describe('resolveWaveformPeaks', () => {
  it('prefers the storage URL and never reads the column', async () => {
    const spy = stubFetch(() => jsonResponse(peaks(2000)))
    const result = await resolveWaveformPeaks({
      waveform_json_url: 'https://cdn.test/waveforms/a.json',
      waveform_data: peaks(128),
    })
    expect(result).toHaveLength(2000)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('falls back to the column when storage fails', async () => {
    stubFetch(() => jsonResponse(null, false))
    const result = await resolveWaveformPeaks({
      waveform_json_url: 'https://cdn.test/gone.json',
      waveform_data: peaks(128),
    })
    expect(result).toHaveLength(128)
  })

  it('uses the column when no storage URL is set', async () => {
    const spy = stubFetch(() => jsonResponse(peaks(2000)))
    const result = await resolveWaveformPeaks({ waveform_data: peaks(256) })
    expect(result).toHaveLength(256)
    expect(spy).not.toHaveBeenCalled()
  })

  it('returns null when neither source has usable peaks', async () => {
    stubFetch(() => jsonResponse(null, false))
    expect(await resolveWaveformPeaks({ waveform_json_url: 'https://cdn.test/x.json' })).toBeNull()
    expect(await resolveWaveformPeaks(null)).toBeNull()
    expect(await resolveWaveformPeaks({ waveform_data: [1, 2, 3] })).toBeNull()
  })
})
