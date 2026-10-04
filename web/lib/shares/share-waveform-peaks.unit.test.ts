import { describe, expect, it } from 'vitest'
import { coercePeaks, downsamplePeaks, normalizePeaks } from '@/lib/shares/share-waveform-peaks'

describe('share waveform peaks', () => {
  it('coerces numeric and envelope rows', () => {
    const mixed = [0.2, { rms: 0.8 }, { positive: 0.4 }, { negative: -0.3 }]
    const peaks = coercePeaks([...mixed, ...Array.from({ length: 14 }, () => 0.1)])
    expect(peaks).not.toBeNull()
    expect(peaks![1]).toBe(0.8)
    expect(peaks![2]).toBe(0.4)
  })

  it('rejects short tapes', () => {
    expect(coercePeaks([1, 2, 3])).toBeNull()
  })

  it('downsamples by max in each bucket', () => {
    const peaks = [0.1, 0.9, 0.2, 0.3]
    expect(downsamplePeaks(peaks, 2)).toEqual([0.9, 0.3])
  })

  it('normalizes to a visible floor', () => {
    const out = normalizePeaks([0, 2, 1])
    expect(out[1]).toBe(1)
    expect(out[0]).toBe(0.1)
  })
})
