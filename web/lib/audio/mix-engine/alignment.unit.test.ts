import { describe, expect, it } from 'vitest'
import {
  MISSING_BPM_CONFIDENCE,
  beatSyncLockProgress,
  mediaDelayToWallMs,
  readPairBpmConfidence,
  resolveFireIncomingCue,
  solveAlignmentState,
} from './alignment'
import { PRE_AUDIBLE_LOCK_SEC } from './pre-audible-nudge'
import { beatPhaseErrorSec } from './sync'
import { buildMixPlan } from './plan-from-dna'

const fofDna = {
  measured: {
    bpm: 124,
    bpmConfidence: 0.85,
    drumFamily: 'four-on-the-floor',
    kickSteps: [0, 4, 8, 12],
    snareSteps: [4, 12],
  },
}

const breakDna = {
  measured: {
    bpm: 124,
    bpmConfidence: 0.85,
    drumFamily: 'breakbeat',
    kickSteps: [0, 6, 10],
    snareSteps: [4, 12],
  },
}

describe('alignment media-time phase', () => {
  it('phase error is invariant when rates would have scaled BPM incorrectly', () => {
    // Same media positions on matching grids → ~0 phase regardless of playbackRate fiction
    const err = beatPhaseErrorSec({
      outgoingTimeSec: 32.04,
      outgoingBpm: 120,
      outgoingOffsetSec: 0.04,
      incomingTimeSec: 8.04,
      incomingBpm: 120,
      incomingOffsetSec: 0.04,
    })
    expect(Math.abs(err)).toBeLessThan(0.01)
  })

  it('mediaDelayToWallMs divides by outgoing rate', () => {
    expect(mediaDelayToWallMs(1, 1)).toBeCloseTo(1000, 0)
    expect(mediaDelayToWallMs(1, 1.25)).toBeCloseTo(800, 0)
    expect(mediaDelayToWallMs(1, 0.8)).toBeCloseTo(1250, 0)
  })

  it('beatSyncLockProgress extends lock when confidence is high', () => {
    const low = beatSyncLockProgress({ tempoGlideStart: 0.55, dnaConfidence: 0.3 })
    const high = beatSyncLockProgress({ tempoGlideStart: 0.55, dnaConfidence: 0.9 })
    expect(high).toBeGreaterThan(low)
    expect(high).toBeGreaterThanOrEqual(0.8)
  })
})

describe('honest confidence', () => {
  it('missing bpmConfidence defaults low', () => {
    expect(readPairBpmConfidence({}, {})).toBe(MISSING_BPM_CONFIDENCE)
    expect(readPairBpmConfidence(null, fofDna)).toBe(MISSING_BPM_CONFIDENCE)
  })

  it('buildMixPlan disables phraseLock when confidence missing', () => {
    const plan = buildMixPlan({
      outgoing: {
        id: 'o',
        file: '/o.mp3',
        bpm: 124,
        duration: 180,
        sonic_dna: { segments: { introEndRatio: 0.08, outroStartRatio: 0.82 } },
      },
      incoming: {
        id: 'i',
        file: '/i.mp3',
        bpm: 126,
        duration: 200,
        sonic_dna: { segments: { introEndRatio: 0.1, outroStartRatio: 0.85 } },
      },
      nowSec: 140,
      inPhraseBars: 8,
      outPhraseBars: 16,
      overlapBars: 8,
    })
    expect(plan).not.toBeNull()
    expect(plan!.phraseLock).toBe(false)
    expect(plan!.dnaConfidence).toBeLessThan(0.45)
    expect(plan!.resolvedIncomingSec).toBeDefined()
  })
})

describe('solveAlignmentState groove-aware snare', () => {
  it('enables snareLock for FoF × FoF', () => {
    const a = solveAlignmentState({
      plannedIncomingSec: 16,
      outgoingTimeSec: 64,
      outgoingBpm: 124,
      outgoingOffsetSec: 0,
      outgoingSonicDna: fofDna,
      incomingBpm: 124,
      incomingOffsetSec: 0,
      incomingSonicDna: fofDna,
      phraseBars: 8,
    })
    expect(a.snareLock).toBe(true)
    expect(a.phraseLock).toBe(true)
    expect(a.sources).toContain('snare')
  })

  it('disables snareLock for breakbeat pairs', () => {
    const a = solveAlignmentState({
      plannedIncomingSec: 16,
      outgoingTimeSec: 64,
      outgoingBpm: 124,
      outgoingOffsetSec: 0,
      outgoingSonicDna: breakDna,
      incomingBpm: 124,
      incomingOffsetSec: 0,
      incomingSonicDna: breakDna,
      phraseBars: 8,
    })
    expect(a.snareLock).toBe(false)
    expect(a.sources).not.toContain('snare')
  })

  it('places incoming on the same bar of phrase 1 as outgoing', () => {
    const a = solveAlignmentState({
      plannedIncomingSec: 0,
      outgoingTimeSec: 64 + 4, // 4s into an 8-bar cell @ 120 BPM
      outgoingBpm: 120,
      outgoingOffsetSec: 0,
      incomingBpm: 120,
      incomingOffsetSec: 0,
      phraseBars: 8,
      phrase1Lock: true,
      dnaConfidence: 0.8,
    })
    expect(a.incomingCueSec).toBeGreaterThan(3.5)
    expect(a.incomingCueSec).toBeLessThan(4.5)
    expect(a.sources).toContain('phrase-phase')
  })
})

describe('resolveFireIncomingCue', () => {
  it('resnaps drifted pre-arm media to phrase-aligned cue at fire', () => {
    const fired = resolveFireIncomingCue({
      mediaNowSec: 32.4,
      alignedCueSec: 4.0,
      idlePreArmLocked: true,
      alreadyOnBuffer: true,
      phrase1Lock: true,
      bpm: 128,
    })
    expect(fired.cueSec).toBeCloseTo(4.0, 5)
    expect(fired.resnapped).toBe(true)
    expect(fired.usedMediaNow).toBe(false)
  })

  it('trusts locked warm playhead within half beat (no phrase-1 smash)', () => {
    const aligned = 4.0
    const media = aligned + 0.18 // < half beat @ 128bpm (~0.234s)
    const fired = resolveFireIncomingCue({
      mediaNowSec: media,
      alignedCueSec: aligned,
      idlePreArmLocked: true,
      alreadyOnBuffer: true,
      phrase1Lock: true,
      bpm: 128,
    })
    expect(fired.cueSec).toBeCloseTo(media, 5)
    expect(fired.usedMediaNow).toBe(true)
    expect(fired.resnapped).toBe(false)
  })

  it('keeps mediaNow when already within the silent lock window', () => {
    const aligned = 4.0
    const media = aligned + PRE_AUDIBLE_LOCK_SEC * 0.5
    const fired = resolveFireIncomingCue({
      mediaNowSec: media,
      alignedCueSec: aligned,
      idlePreArmLocked: true,
      alreadyOnBuffer: true,
      phrase1Lock: true,
    })
    expect(fired.cueSec).toBeCloseTo(media, 5)
    expect(fired.usedMediaNow).toBe(true)
    expect(fired.resnapped).toBe(false)
  })

  it('trusts locked warm playhead when phrase1Lock is off', () => {
    const fired = resolveFireIncomingCue({
      mediaNowSec: 18.2,
      alignedCueSec: 2.0,
      idlePreArmLocked: true,
      alreadyOnBuffer: true,
      phrase1Lock: false,
    })
    expect(fired.cueSec).toBeCloseTo(18.2, 5)
    expect(fired.usedMediaNow).toBe(true)
  })

  it('always uses aligned cue when not pre-arm locked', () => {
    const fired = resolveFireIncomingCue({
      mediaNowSec: 12,
      alignedCueSec: 3.5,
      idlePreArmLocked: false,
      alreadyOnBuffer: true,
      phrase1Lock: true,
    })
    expect(fired.cueSec).toBeCloseTo(3.5, 5)
    expect(fired.resnapped).toBe(true)
  })
})
