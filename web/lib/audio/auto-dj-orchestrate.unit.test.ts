import { describe, expect, it } from 'vitest'
import {
  applyPrepareLeadIn,
  resolveFireMixPlan,
  gateAutoDjFire,
  shouldBlockDnaFallback,
  orchestrateSkipBlendPlan,
} from './auto-dj-orchestrate'
import type { MixPlan } from '@/lib/audio/mix-engine/types'

function basePlan(over: Partial<MixPlan> = {}): MixPlan {
  return {
    outgoingTrackId: 'out',
    incomingTrackId: 'in',
    startAtOutgoingSec: 100,
    mixOutMarkerSec: 100,
    incomingStartSec: 0,
    mixDurationSec: 16,
    rateRatio: 1,
    style: 'crossfade',
    curve: 'equal-power',
    outPhraseBars: 8,
    inPhraseBars: 8,
    overlapBars: 8,
    phraseBars: 8,
    reason: 'test',
    phrase1Lock: true,
    blendFromOut: true,
    exactOverlap: true,
    ...over,
  }
}

describe('applyPrepareLeadIn', () => {
  it('stamps prepareLeadInSec without changing OUT', () => {
    const plan = applyPrepareLeadIn(basePlan(), 4)
    expect(plan.prepareLeadInSec).toBe(4)
    expect(plan.startAtOutgoingSec).toBe(100)
  })
})

describe('resolveFireMixPlan', () => {
  it('keeps frozen plan near the marker', () => {
    const frozen = basePlan({ mixDurationSec: 16 })
    const fresh = resolveFireMixPlan({
      frozen,
      fallback: basePlan({ mixDurationSec: 8, reason: 'fallback' }),
      nowSec: 100.01,
      outMarker: 100,
      beatSec: 0.5,
      remainAfterOut: 20,
    })
    expect(fresh.reason).toBe('test')
    expect(fresh.mixDurationSec).toBeGreaterThanOrEqual(15)
  })

  it('still prefers frozen cues when slightly late', () => {
    const frozen = basePlan({ reason: 'frozen' })
    const fresh = resolveFireMixPlan({
      frozen,
      fallback: basePlan({ reason: 'late-rebuild' }),
      nowSec: 100.5,
      outMarker: 100,
      beatSec: 0.5,
      remainAfterOut: 4,
      exactOverlap: true,
    })
    expect(fresh.reason).toBe('frozen')
  })
})

describe('gateAutoDjFire', () => {
  it('restores compressed overlap to doctrine length', () => {
    const gate = gateAutoDjFire({
      hasIncomingReady: true,
      plannedOverlapSec: 16,
      exactOverlapSec: 8,
      requireIncomingReady: false,
    })
    expect(gate.ok).toBe(true)
    expect(gate.mixDurationSec).toBeGreaterThanOrEqual(15)
  })
})

describe('shouldBlockDnaFallback', () => {
  it('blocks BeatSync four-on-floor DNA fallback', () => {
    expect(
      shouldBlockDnaFallback({ syncMode: 'beat-sync', fourOnFloorOutgoing: true }),
    ).toBe(true)
    expect(
      shouldBlockDnaFallback({ syncMode: 'tempo-sync', fourOnFloorOutgoing: true }),
    ).toBe(false)
  })
})

describe('orchestrateSkipBlendPlan', () => {
  it('fires on the next beat and keeps phrase-1 IN', () => {
    const plan = orchestrateSkipBlendPlan({
      outgoingTrackId: 'a',
      incomingTrackId: 'b',
      nowSec: 10.1,
      outgoingBpm: 120,
      outgoingOffsetSec: 0,
      incomingStartSec: 0,
      overlapBars: 8,
      rateRatio: 1,
      style: 'crossfade',
      outPhraseBars: 8,
      inPhraseBars: 8,
      remainSec: 40,
      prior: basePlan({ incomingTrackId: 'b', incomingStartSec: 0.5 }),
    })
    expect(plan.reason).toBe('Skip blend')
    expect(plan.incomingStartSec).toBe(0.5)
    expect(plan.startAtOutgoingSec).toBeGreaterThan(10.1)
  })
})
