import { describe, expect, it } from 'vitest'
import { sanitizeWaveformPeaks } from './sanitize-waveform-peaks'

describe('sanitizeWaveformPeaks', () => {
  it('rejects short or invalid input', () => {
    expect(sanitizeWaveformPeaks(null)).toBe(null)
    expect(sanitizeWaveformPeaks([1, 2, 3])).toBe(null)
    expect(sanitizeWaveformPeaks(Array.from({ length: 80 }, () => Number.NaN))).toBe(null)
  })

  it('keeps finite peaks and downsamples oversized tapes', () => {
    const raw = Array.from({ length: 200 }, (_, i) => (i % 7 === 0 ? Number.NaN : i / 200))
    const peaks = sanitizeWaveformPeaks(raw, { min: 64, max: 80 })
    expect(peaks).toHaveLength(80)
    expect(peaks?.every((n) => Number.isFinite(n))).toBe(true)
  })
})
