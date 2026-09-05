import { describe, expect, it } from 'vitest'
import { buildSkipBlendPlan, nextGridSec } from './skip-blend'
import type { MixPlan } from './types'

describe('nextGridSec', () => {
  it('snaps forward to the next beat, never backward', () => {
    // 120 BPM → 0.5s beat. 1.01s is just after beat 2.
    expect(nextGridSec(1.01, 120, 0, 1)).toBeCloseTo(1.5, 5)
    expect(nextGridSec(1.0, 120, 0, 1)).toBeCloseTo(1.5, 5)
  })

  it('honors a grid offset', () => {
    expect(nextGridSec(0.3, 120, 0.1, 1)).toBeCloseTo(0.6, 5)
  })
})

describe('buildSkipBlendPlan', () => {
  const prior: MixPlan = {
    outgoingTrackId: 'out',
    incomingTrackId: 'in',
    startAtOutgoingSec: 180,
    incomingStartSec: 0.04,
    resolvedIncomingSec: 0.04,
    mixDurationSec: 16,
    rateRatio: 1.02,
    style: 'crossfade',
    curve: 'equal-power',
    outPhraseBars: 16,
    inPhraseBars: 8,
    overlapBars: 8,
    phraseBars: 8,
    reason: 'Auto DJ',
    holdBeatmatch: true,
  }

  it('fires from the next beat and keeps the parked phrase-1 cue', () => {
    const plan = buildSkipBlendPlan({
      outgoingTrackId: 'out',
      incomingTrackId: 'in',
      nowSec: 40.1,
      outgoingBpm: 120,
      incomingStartSec: 0,
      overlapBars: 8,
      rateRatio: 1.05,
      style: 'crossfade',
      outPhraseBars: 8,
      inPhraseBars: 8,
      remainSec: 80,
      prior,
    })
    expect(plan.startAtOutgoingSec).toBeCloseTo(40.5, 5)
    expect(plan.mixOutMarkerSec).toBeCloseTo(40.5, 5)
    expect(plan.incomingStartSec).toBeCloseTo(0.04, 5)
    expect(plan.resolvedIncomingSec).toBeCloseTo(0.04, 5)
    expect(plan.mixDurationSec).toBe(16)
    expect(plan.reason).toBe('Skip blend')
    expect(plan.phrase1Lock).toBe(true)
    expect(plan.blendFromOut).toBe(true)
  })

  it('ignores a prior plan for a different incoming track', () => {
    const plan = buildSkipBlendPlan({
      outgoingTrackId: 'out',
      incomingTrackId: 'other',
      nowSec: 10,
      outgoingBpm: 120,
      incomingStartSec: 0.2,
      overlapBars: 8,
      rateRatio: 1,
      style: 'filter-eq',
      outPhraseBars: 8,
      inPhraseBars: 8,
      prior,
    })
    expect(plan.incomingStartSec).toBe(0.2)
    expect(plan.style).toBe('filter-eq')
    expect(plan.mixDurationSec).toBeCloseTo(16, 5)
  })
})
