import { describe, expect, it } from 'vitest'
import {
  deriveKickOnsetSec,
  kickOnsetsFromSteps,
  nearestOnsetResidualSec,
  resolveKickOnsetSec,
  resolveSnareClapOnsetSec,
  buildGridOnsetBundle,
  emphasizePeaksNearOnsets,
  isGridLocked,
  withGridLockOnDna,
  withGridAnalysisOnDna,
} from './kick-onsets'
import { dualOnsetResidualNudgeSec } from './transient-align'

describe('kickOnsetsFromSteps', () => {
  it('projects kick steps onto the timeline', () => {
    const onsets = kickOnsetsFromSteps({
      bpm: 120,
      offsetSec: 0,
      kickSteps: [0, 4, 8, 12],
      stepsPerBar: 16,
      durationSec: 8,
      tile: false,
    })
    // 120 BPM → 0.5s/beat → bar = 2s; step = 0.125s
    expect(onsets[0]).toBeCloseTo(0, 5)
    expect(onsets[1]).toBeCloseTo(0.5, 5)
    expect(onsets.length).toBe(4)
  })
})

describe('nearestOnsetResidualSec', () => {
  it('returns residual within the window', () => {
    expect(
      nearestOnsetResidualSec({
        timeSec: 1.01,
        onsetsSec: [0, 1.0, 2.0],
        windowSec: 0.03,
      }),
    ).toBeCloseTo(-0.01, 5)
  })

  it('returns 0 when outside the window', () => {
    expect(
      nearestOnsetResidualSec({
        timeSec: 1.2,
        onsetsSec: [0, 1.0, 2.0],
        windowSec: 0.03,
      }),
    ).toBe(0)
  })
})

describe('deriveKickOnsetSec', () => {
  it('finds strong local maxima', () => {
    const peaks = Array.from({ length: 200 }, (_, i) => {
      // Kick every 20 samples
      if (i % 20 === 10) return 1
      if (i % 20 === 9 || i % 20 === 11) return 0.4
      return 0.05
    })
    const onsets = deriveKickOnsetSec({
      peaks,
      durationSec: 10,
      bpm: 120,
      offsetSec: 0,
    })
    expect(onsets.length).toBeGreaterThanOrEqual(4)
  })
})

describe('resolveKickOnsetSec / snare / grid lock', () => {
  it('prefers stored kickOnsetSec', () => {
    const stored = [0.1, 0.6, 1.1, 1.6, 2.1]
    const onsets = resolveKickOnsetSec({
      sonicDna: { measured: { kickOnsetSec: stored, bpm: 120 } },
      durationSec: 10,
      bpm: 120,
    })
    expect(onsets).toEqual(stored)
  })

  it('prefers stored snareClapOnsetSec', () => {
    const stored = [0.25, 0.75, 1.25, 1.75]
    const onsets = resolveSnareClapOnsetSec({
      sonicDna: { measured: { snareClapOnsetSec: stored, bpm: 120 } },
      durationSec: 10,
      bpm: 120,
    })
    expect(onsets).toEqual(stored)
  })

  it('buildGridOnsetBundle returns both series', () => {
    const bundle = buildGridOnsetBundle({
      sonicDna: {
        measured: {
          bpm: 120,
          kickSteps: [0, 8],
          snareSteps: [4, 12],
          stepsPerBar: 16,
        },
      },
      durationSec: 8,
      bpm: 120,
      offsetSec: 0,
    })
    expect(bundle.kickOnsetSec.length).toBeGreaterThanOrEqual(4)
    expect(bundle.snareClapOnsetSec.length).toBeGreaterThanOrEqual(4)
  })

  it('withGridLockOnDna stamps measured.gridLocked and snare onsets', () => {
    const dna = withGridLockOnDna({ measured: { bpm: 128 } }, true, {
      kickOnsetSec: [0, 0.5, 1, 1.5],
      snareClapOnsetSec: [0.25, 0.75, 1.25, 1.75],
      gridLockScore: 0.8,
    })
    expect(dna.gridLocked).toBe(true)
    expect((dna.measured as { snareClapOnsetSec: number[] }).snareClapOnsetSec).toHaveLength(4)
    expect(isGridLocked(dna)).toBe(true)
  })

  it('withGridAnalysisOnDna preserves unlocked state', () => {
    const dna = withGridAnalysisOnDna({ measured: { bpm: 120 } }, {
      kickOnsetSec: [0, 0.5, 1, 1.5],
      gridLockScore: 0.5,
    })
    expect(isGridLocked(dna)).toBe(false)
    expect((dna.measured as { gridLockScore: number }).gridLockScore).toBe(0.5)
  })

  it('withGridAnalysisOnDna writes gridOffsetSec from offsetSec', () => {
    const dna = withGridAnalysisOnDna({ measured: { bpm: 120 } }, {
      offsetSec: 2.4,
      gridLockScore: 0.62,
    })
    expect((dna.measured as { gridOffsetSec: number }).gridOffsetSec).toBeCloseTo(2.4, 5)
  })
})

describe('emphasizePeaksNearOnsets', () => {
  it('boosts samples near onsets', () => {
    const peaks = Array.from({ length: 100 }, () => 0.2)
    const out = emphasizePeaksNearOnsets(peaks, [0.5], 1, 0.5)
    const mid = out[50]!
    expect(mid).toBeGreaterThan(0.2)
  })
})

describe('dualOnsetResidualNudgeSec', () => {
  it('blends kick and snare residuals', () => {
    const nudge = dualOnsetResidualNudgeSec({
      outgoingTimeSec: 1.0,
      incomingTimeSec: 1.01,
      outgoingKickOnsets: [0, 0.5, 1.0, 1.5],
      incomingKickOnsets: [0, 0.5, 1.0, 1.5],
      outgoingSnareOnsets: [0.25, 0.75, 1.25, 1.75],
      incomingSnareOnsets: [0.25, 0.75, 1.25, 1.75],
      snareWeight: 0.4,
      windowSec: 0.03,
    })
    // Incoming playhead is 10ms after a shared kick — residual stays in micro band.
    expect(Math.abs(nudge)).toBeGreaterThan(0)
    expect(Math.abs(nudge)).toBeLessThanOrEqual(0.02)
  })
})
