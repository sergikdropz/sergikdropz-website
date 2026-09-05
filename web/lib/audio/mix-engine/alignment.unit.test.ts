import { describe, expect, it } from 'vitest'
import {
  MISSING_BPM_CONFIDENCE,
  beatSyncLockProgress,
  mediaDelayToWallMs,
  readPairBpmConfidence,
  solveAlignmentState,
} from './alignment'
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
})
