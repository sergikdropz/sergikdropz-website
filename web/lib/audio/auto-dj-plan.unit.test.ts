import { describe, expect, it } from 'vitest'
import {
  autoDjPlanScanEvery,
  shouldRunAutoDjPlanScan,
  buildAutoDjTickPlan,
  buildAutoDjFirePlan,
} from './auto-dj-plan'
import { DEFAULT_AUTO_DJ_CONFIG } from './auto-dj-preferences'
import type { MixTrackRef } from '@/lib/audio/mix-engine'

const lockedDna = {
  gridLocked: true,
  measured: {
    gridLocked: true,
    gridLockScore: 0.85,
    bpm: 128,
    bpmConfidence: 0.9,
    drumFamily: 'four-on-the-floor',
  },
}

function track(id: string, bpm = 128): MixTrackRef {
  return {
    id,
    file: `${id}.mp3`,
    title: id,
    bpm,
    duration: 240,
    beat_grid_offset: 0,
    sonic_dna: lockedDna,
  }
}

describe('autoDjPlanScanEvery', () => {
  it('scans every tick near OUT', () => {
    expect(autoDjPlanScanEvery(5, 8)).toBe(1)
    expect(autoDjPlanScanEvery(null, 8)).toBe(1)
  })

  it('coarsens early in the track', () => {
    expect(autoDjPlanScanEvery(90, 8)).toBe(10)
    expect(autoDjPlanScanEvery(30, 8)).toBe(3)
  })

  it('shouldRunAutoDjPlanScan honors cadence', () => {
    expect(shouldRunAutoDjPlanScan(3, 90, 8)).toBe(false)
    expect(shouldRunAutoDjPlanScan(10, 90, 8)).toBe(true)
  })
})

describe('buildAutoDjTickPlan', () => {
  it('builds a frozen phrase plan near OUT', () => {
    const outgoing = track('out')
    const incoming = track('in')
    const result = buildAutoDjTickPlan({
      config: { ...DEFAULT_AUTO_DJ_CONFIG, enabled: true, syncMode: 'beat-sync' },
      nowSec: 200,
      durationSec: 240,
      outgoing,
      incoming,
      outgoingPlaybackRate: 1,
      outgoingBpm: 128,
      outgoingGridOffset: 0,
      incomingGridOffset: 0,
      leadInSec: 0,
      lastMixGrade: null,
      consecutiveWeak: 0,
      phaseMeterEnabled: false,
      phaseMeter: { windowId: 'phrase-1', phraseBars: 8 },
      frozen: null,
      mixInCueSec: 0,
      sliderPlaybackRate: 1,
    })
    expect(result).not.toBeNull()
    expect(result!.plan.phrase1Lock).toBe(true)
    expect(result!.plan.blendFromOut).toBe(true)
    expect(result!.plan.mixDurationSec).toBeGreaterThan(1)
    expect(result!.delaySeconds).toBeLessThan(60)
  })
  it('soft-freezes the plan once inside the prepare lead window', () => {
    const outgoing = track('out')
    const incoming = track('in')
    const probe = buildAutoDjTickPlan({
      config: { ...DEFAULT_AUTO_DJ_CONFIG, enabled: true, syncMode: 'beat-sync' },
      nowSec: 0,
      durationSec: 240,
      outgoing,
      incoming,
      outgoingPlaybackRate: 1,
      outgoingBpm: 128,
      outgoingGridOffset: 0,
      incomingGridOffset: 0,
      leadInSec: 8,
      lastMixGrade: null,
      consecutiveWeak: 0,
      phaseMeterEnabled: false,
      phaseMeter: { windowId: 'phrase-1', phraseBars: 8 },
      frozen: null,
      mixInCueSec: 0,
      sliderPlaybackRate: 1,
    })
    expect(probe).not.toBeNull()
    const outMarker = probe!.plan.startAtOutgoingSec
    // Sit 6s before OUT — past soft-freeze (prepare lead) but before hard freeze (4s).
    const mid = buildAutoDjTickPlan({
      config: { ...DEFAULT_AUTO_DJ_CONFIG, enabled: true, syncMode: 'beat-sync' },
      nowSec: outMarker - 6,
      durationSec: 240,
      outgoing,
      incoming,
      outgoingPlaybackRate: 1,
      outgoingBpm: 128,
      outgoingGridOffset: 0,
      incomingGridOffset: 0,
      leadInSec: 8,
      lastMixGrade: null,
      consecutiveWeak: 0,
      phaseMeterEnabled: false,
      phaseMeter: { windowId: 'phrase-1', phraseBars: 8 },
      frozen: null,
      mixInCueSec: 0,
      sliderPlaybackRate: 1,
    })
    expect(mid).not.toBeNull()
    expect(mid!.delaySeconds).toBeGreaterThan(4)
    expect(mid!.delaySeconds).toBeLessThanOrEqual(Math.max(mid!.effectiveLeadInSec, 4) + 0.5)
    expect(mid!.frozen).not.toBeNull()
    expect(mid!.frozen!.incomingId).toBe('in')
  })
  it('keeps frozen OUT sticky across later rebuilds', () => {
    const outgoing = track('out')
    const incoming = track('in')
    const probe = buildAutoDjTickPlan({
      config: { ...DEFAULT_AUTO_DJ_CONFIG, enabled: true, syncMode: 'beat-sync' },
      nowSec: 0,
      durationSec: 240,
      outgoing,
      incoming,
      outgoingPlaybackRate: 1,
      outgoingBpm: 128,
      outgoingGridOffset: 0,
      incomingGridOffset: 0,
      leadInSec: 8,
      lastMixGrade: null,
      consecutiveWeak: 0,
      phaseMeterEnabled: false,
      phaseMeter: { windowId: 'phrase-1', phraseBars: 8 },
      frozen: null,
      mixInCueSec: 0,
      sliderPlaybackRate: 1,
    })
    expect(probe).not.toBeNull()
    const outMarker = probe!.plan.startAtOutgoingSec
    const first = buildAutoDjTickPlan({
      config: { ...DEFAULT_AUTO_DJ_CONFIG, enabled: true, syncMode: 'beat-sync' },
      nowSec: outMarker - 6,
      durationSec: 240,
      outgoing,
      incoming,
      outgoingPlaybackRate: 1,
      outgoingBpm: 128,
      outgoingGridOffset: 0,
      incomingGridOffset: 0,
      leadInSec: 8,
      lastMixGrade: null,
      consecutiveWeak: 0,
      phaseMeterEnabled: false,
      phaseMeter: { windowId: 'phrase-1', phraseBars: 8 },
      frozen: null,
      mixInCueSec: 0,
      sliderPlaybackRate: 1,
    })
    expect(first).not.toBeNull()
    expect(first!.frozen).not.toBeNull()
    const frozenOut = first!.frozen!.plan.startAtOutgoingSec

    const later = buildAutoDjTickPlan({
      config: { ...DEFAULT_AUTO_DJ_CONFIG, enabled: true, syncMode: 'beat-sync' },
      nowSec: frozenOut - 3,
      durationSec: 240,
      outgoing,
      incoming,
      outgoingPlaybackRate: 1.02,
      outgoingBpm: 128,
      outgoingGridOffset: 0,
      incomingGridOffset: 0,
      leadInSec: 8,
      lastMixGrade: null,
      consecutiveWeak: 0,
      phaseMeterEnabled: false,
      phaseMeter: { windowId: 'phrase-1', phraseBars: 8 },
      frozen: first!.frozen,
      mixInCueSec: 0,
      sliderPlaybackRate: 1,
    })
    expect(later).not.toBeNull()
    expect(later!.plan.startAtOutgoingSec).toBe(frozenOut)
    expect(later!.frozen!.plan.startAtOutgoingSec).toBe(frozenOut)
  })
})

describe('buildAutoDjFirePlan', () => {
  it('prefers frozen plan length at fire', () => {
    const tick = buildAutoDjTickPlan({
      config: { ...DEFAULT_AUTO_DJ_CONFIG, enabled: true },
      nowSec: 200,
      durationSec: 240,
      outgoing: track('out'),
      incoming: track('in'),
      outgoingPlaybackRate: 1,
      outgoingBpm: 128,
      outgoingGridOffset: 0,
      incomingGridOffset: 0,
      leadInSec: 0,
      lastMixGrade: null,
      consecutiveWeak: 0,
      phaseMeterEnabled: false,
      phaseMeter: { windowId: 'phrase-1', phraseBars: 8 },
      frozen: null,
      mixInCueSec: 0,
      sliderPlaybackRate: 1,
    })
    expect(tick).not.toBeNull()
    const fired = buildAutoDjFirePlan({
      config: DEFAULT_AUTO_DJ_CONFIG,
      phraseMix: tick!.phraseMix,
      liveOutgoing: { ...track('out'), duration: 240 },
      liveIncoming: track('in'),
      nowSec: tick!.plan.startAtOutgoingSec + 0.01,
      liveDurationSec: 240,
      outMarker: tick!.plan.startAtOutgoingSec,
      beatSec: tick!.beatSec,
      outgoingPlaybackRate: 1,
      frozenPlan: tick!.plan,
      fallbackStyle: 'crossfade',
      lastOrTickPlan: tick!.plan,
      phaseMeterEnabled: false,
      phaseMeter: { windowId: 'phrase-1', phraseBars: 8 },
      detectedBpm: 128,
      sliderPlaybackRate: 1,
      hasIncomingReady: true,
    })
    expect(fired.mixDurationSec).toBeGreaterThanOrEqual(tick!.plan.mixDurationSec * 0.98)
    expect(fired.plan.phrase1Lock).toBe(true)
  })

  it('keeps prepare lead-in and frozen OUT through fire', () => {
    const outgoing = track('out')
    const incoming = track('in')
    const tick = buildAutoDjTickPlan({
      config: { ...DEFAULT_AUTO_DJ_CONFIG, enabled: true, syncMode: 'beat-sync' },
      nowSec: 200,
      durationSec: 240,
      outgoing,
      incoming,
      outgoingPlaybackRate: 1,
      outgoingBpm: 128,
      outgoingGridOffset: 0,
      incomingGridOffset: 0,
      leadInSec: 1.5,
      lastMixGrade: null,
      consecutiveWeak: 0,
      phaseMeterEnabled: false,
      phaseMeter: { windowId: 'phrase-1', phraseBars: 8 },
      frozen: null,
      mixInCueSec: 0,
      sliderPlaybackRate: 1,
    })
    expect(tick).not.toBeNull()
    expect(tick!.plan.prepareLeadInSec).toBeGreaterThanOrEqual(1.5)
    expect(tick!.plan.blendFromOut).toBe(true)

    const outMarker = tick!.plan.startAtOutgoingSec
    const fired = buildAutoDjFirePlan({
      config: DEFAULT_AUTO_DJ_CONFIG,
      phraseMix: tick!.phraseMix,
      liveOutgoing: { ...outgoing, duration: 240 },
      liveIncoming: incoming,
      nowSec: outMarker + 0.004,
      liveDurationSec: 240,
      outMarker,
      beatSec: tick!.beatSec,
      outgoingPlaybackRate: 1,
      frozenPlan: tick!.frozen?.plan ?? tick!.plan,
      fallbackStyle: tick!.plan.style,
      lastOrTickPlan: tick!.plan,
      phaseMeterEnabled: false,
      phaseMeter: { windowId: 'phrase-1', phraseBars: 8 },
      detectedBpm: 128,
      sliderPlaybackRate: 1,
      hasIncomingReady: true,
    })
    expect(fired.plan.startAtOutgoingSec).toBe(outMarker)
    expect(fired.mixDurationSec).toBeGreaterThanOrEqual(tick!.plan.mixDurationSec * 0.98)
    expect(fired.incomingRate).toBeGreaterThan(0)
  })
})
