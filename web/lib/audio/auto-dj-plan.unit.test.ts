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
