import { describe, expect, it } from 'vitest'
import {
  emptyMixScorecard,
  formatMixScorecard,
  scorecardStatusSuffix,
} from './mix-scorecard'
import {
  cueBiasSecFromPairLearning,
  getPairLearning,
  pairLearningScoreBias,
  parsePairLearning,
  preferredOutFromPairLearning,
  pushPairLearning,
} from './pair-learning'
import { exactOverlapDurationSec } from './phrase-mix-doctrine'

describe('mix-scorecard', () => {
  it('formats lock / cue / seeks', () => {
    const s = {
      ...emptyMixScorecard(),
      preArmLockMs: 120,
      fireCueDeltaMs: 8,
      overlapLockMs: 40,
      silentSeekCount: 1,
      lockedAtFire: true,
      samples: 8,
      phaseRmsSec: 0.01,
    }
    expect(formatMixScorecard(s)).toContain('cueΔ 8ms')
    expect(scorecardStatusSuffix(s)).toMatch(/L40/)
  })
})

describe('pair-learning', () => {
  it('parses and prefers OUT bars after good mixes', () => {
    const parsed = parsePairLearning([
      {
        pairKey: 'a→b',
        outgoingTrackId: 'a',
        incomingTrackId: 'b',
        updatedAt: 1,
        lastGoodCueDeltaMs: 4,
        lastGoodLockMs: 50,
        preferredOutPhraseBars: 16,
        lastGrade: 'good',
        goodCount: 2,
        weakCount: 0,
      },
    ])
    expect(parsed).toHaveLength(1)
    expect(preferredOutFromPairLearning(parsed[0])).toBe(16)
    expect(pairLearningScoreBias(parsed[0])).toBeGreaterThan(0)
    expect(cueBiasSecFromPairLearning(parsed[0], 120)).toBeCloseTo(0.004, 5)
  })

  it('getPairLearning finds by ids', () => {
    const store = parsePairLearning([
      {
        pairKey: 'out→in',
        outgoingTrackId: 'out',
        incomingTrackId: 'in',
        updatedAt: 1,
        lastGoodCueDeltaMs: null,
        lastGoodLockMs: null,
        preferredOutPhraseBars: 8,
        lastGrade: 'excellent',
        goodCount: 1,
        weakCount: 0,
      },
    ])
    expect(getPairLearning('out', 'in', store)?.preferredOutPhraseBars).toBe(8)
    expect(getPairLearning('x', 'y', store)).toBeNull()
  })

  it('pushPairLearning is a no-op without window storage in node', () => {
    const next = pushPairLearning({
      outgoingTrackId: 'o',
      incomingTrackId: 'i',
      grade: 'good',
      scorecard: {
        ...emptyMixScorecard(),
        fireCueDeltaMs: 3,
        overlapLockMs: 20,
        lockedAtFire: true,
      },
      outPhraseBars: 16,
    })
    expect(Array.isArray(next)).toBe(true)
  })
})

describe('exactOverlapDurationSec lattice', () => {
  it('snaps to N×4 bars at 120 BPM (bar = 2s)', () => {
    // 8 bars = 16s
    expect(exactOverlapDurationSec(16, 48, 120)).toBe(16)
    // 14.8s ≈ 7.4 bars → round to 8 → 16s
    expect(exactOverlapDurationSec(14.8, 48, 120)).toBe(16)
    // 7s ≈ 3.5 bars → round to 4 → 8s
    expect(exactOverlapDurationSec(7, 48, 120)).toBe(8)
    expect(exactOverlapDurationSec(0)).toBe(0.25)
  })
})
