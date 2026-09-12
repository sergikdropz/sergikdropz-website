import { describe, expect, it } from 'vitest'
import {
  gradeMixQuality,
  snapshotMixQuality,
  formatMixQuality,
  mixQualityLabel,
} from './mix-quality'
import {
  consecutiveWeakMixCount,
  mergeMixQualityHistory,
  parseMixQualityHistory,
} from './mix-quality-history'

describe('mix quality grading', () => {
  it('grades excellent under 8ms worst residual', () => {
    expect(
      gradeMixQuality({ samples: 8, phaseRmsSec: 0.005, kickResidualRmsMs: 4 }),
    ).toBe('excellent')
  })

  it('grades poor when residual is large', () => {
    expect(
      gradeMixQuality({ samples: 8, phaseRmsSec: 0.04, kickResidualRmsMs: 30 }),
    ).toBe('poor')
  })

  it('snapshot requires enough samples', () => {
    expect(
      snapshotMixQuality({ samples: 2, phaseRmsSec: 0.01, kickResidualRmsMs: 10 }),
    ).toBeNull()
    const snap = snapshotMixQuality({
      samples: 12,
      phaseRmsSec: 0.01,
      kickResidualRmsMs: 9,
    })
    expect(snap?.grade).toBe('good')
    expect(snap?.label).toBe(mixQualityLabel('good'))
  })

  it('format includes grade word', () => {
    expect(
      formatMixQuality({
        samples: 8,
        phaseRmsSec: 0.02,
        kickResidualRmsMs: 18,
      }),
    ).toMatch(/loose/i)
  })

  it('counts leading fair/poor streak', () => {
    expect(
      consecutiveWeakMixCount([
        { grade: 'poor' },
        { grade: 'fair' },
        { grade: 'good' },
      ]),
    ).toBe(2)
    expect(consecutiveWeakMixCount([{ grade: 'excellent' }])).toBe(0)
  })

  it('merges cloud and local mix history by timestamp', () => {
    const local = parseMixQualityHistory([
      { at: 2, grade: 'good', label: 'Good', phaseRmsSec: 0.01, kickResidualRmsMs: 8, samples: 8 },
    ])
    const cloud = parseMixQualityHistory([
      { at: 1, grade: 'poor', label: 'Poor', phaseRmsSec: 0.04, kickResidualRmsMs: 20, samples: 8 },
      { at: 2, grade: 'good', label: 'Good', phaseRmsSec: 0.01, kickResidualRmsMs: 8, samples: 8 },
    ])
    const merged = mergeMixQualityHistory(local, cloud)
    expect(merged).toHaveLength(2)
    expect(merged[0]?.at).toBe(2)
  })
})
