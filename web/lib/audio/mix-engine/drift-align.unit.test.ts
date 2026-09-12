import { describe, expect, it } from 'vitest'
import {
  createDriftAlignState,
  driftAlignRate,
  estimateDrift,
  fuseBlendError,
  pushDriftSample,
  DRIFT_KICK_TRUST_SEC,
  DRIFT_WALK_SEC_PER_SEC,
} from './drift-align'
import {
  applyVinylBendToDeckRates,
  microRateCorrection,
  settleVinylBend,
  smoothVinylBend,
  VINYL_BEND_MAX,
} from './sync'
import { SILENT_VINYL_BEND_MAX } from './pre-audible-nudge'

describe('fuseBlendError', () => {
  it('chases kick when it agrees with the grid', () => {
    const fused = fuseBlendError({
      gridPhaseSec: 0.012,
      kickResidualSec: 0.01,
      beatSec: 0.5,
    })
    expect(fused.source).toBe('kick')
    expect(fused.errorSec).toBeCloseTo(0.01, 8)
  })

  it('ignores an opposing / wrapped kick and keeps the grid', () => {
    const fused = fuseBlendError({
      gridPhaseSec: 0.04,
      kickResidualSec: -0.015,
      beatSec: 0.5,
    })
    expect(fused.source).toBe('grid')
    expect(fused.errorSec).toBeCloseTo(0.04, 8)
  })

  it('falls back to grid when kick is outside the audible pocket', () => {
    const fused = fuseBlendError({
      gridPhaseSec: 0.03,
      kickResidualSec: DRIFT_KICK_TRUST_SEC + 0.004,
      beatSec: 0.5,
    })
    expect(fused.source).toBe('grid')
  })

  it('does not treat a missed onset (0) as a lock against an open grid', () => {
    const fused = fuseBlendError({
      gridPhaseSec: 0.02,
      kickResidualSec: 0,
      beatSec: 0.5,
    })
    expect(fused.source).toBe('grid')
    expect(fused.errorSec).toBeCloseTo(0.02, 8)
  })

  it('chases the clap on a backbeat when kicks are already locked', () => {
    const fused = fuseBlendError({
      gridPhaseSec: 0.002,
      kickResidualSec: 0.001,
      clapResidualSec: 0.012,
      beatSec: 0.5,
    })
    expect(fused.source).toBe('clap')
    expect(fused.errorSec).toBeCloseTo(0.012, 8)
  })

  it('chases clap-only residual (no kick in the window)', () => {
    const fused = fuseBlendError({
      gridPhaseSec: 0.003,
      kickResidualSec: null,
      clapResidualSec: 0.011,
      beatSec: 0.5,
    })
    expect(fused.source).toBe('clap')
    expect(fused.errorSec).toBeCloseTo(0.011, 8)
  })

  it('blends kick and clap when both slip the same way', () => {
    const fused = fuseBlendError({
      gridPhaseSec: 0.01,
      kickResidualSec: 0.01,
      clapResidualSec: 0.012,
      beatSec: 0.5,
    })
    expect(fused.source).toBe('pocket')
    expect(fused.errorSec).toBeGreaterThan(0.01)
    expect(fused.errorSec).toBeLessThan(0.012)
  })

  it('keeps the kick when clap opposes it', () => {
    const fused = fuseBlendError({
      gridPhaseSec: 0.01,
      kickResidualSec: 0.01,
      clapResidualSec: -0.012,
      beatSec: 0.5,
    })
    expect(fused.source).toBe('kick')
    expect(fused.errorSec).toBeCloseTo(0.01, 8)
  })

  it('ignores peak-derived onsets when trustOnsets is false', () => {
    const fused = fuseBlendError({
      gridPhaseSec: 0.012,
      kickResidualSec: 0.01,
      clapResidualSec: 0.011,
      beatSec: 0.5,
      trustOnsets: false,
    })
    expect(fused.source).toBe('grid')
    expect(fused.errorSec).toBeCloseTo(0.012, 8)
  })

  it('ignores clap on non-FoF pairs unless allowClap', () => {
    const fused = fuseBlendError({
      gridPhaseSec: 0.002,
      kickResidualSec: null,
      clapResidualSec: 0.012,
      beatSec: 0.5,
      allowClap: false,
    })
    expect(fused.source).toBe('grid')
  })
})

describe('estimateDrift', () => {
  it('reads a constant offset with near-zero walk', () => {
    const samples = Array.from({ length: 8 }, (_, i) => ({
      tSec: i * 0.016,
      errorSec: 0.02,
    }))
    const est = estimateDrift(samples)
    expect(est.offsetSec).toBeCloseTo(0.02, 5)
    expect(Math.abs(est.driftRate)).toBeLessThan(DRIFT_WALK_SEC_PER_SEC * 0.25)
  })

  it('detects a +3ms/s walk', () => {
    const samples = Array.from({ length: 10 }, (_, i) => ({
      tSec: i * 0.016,
      errorSec: 0.004 + i * 0.016 * 0.003,
    }))
    const est = estimateDrift(samples)
    expect(est.driftRate).toBeGreaterThan(0.002)
    expect(est.driftRate).toBeCloseTo(0.003, 2)
  })
})

describe('driftAlignRate', () => {
  it('slows incoming when it is ahead (offset)', () => {
    const a = driftAlignRate({
      errorSec: 0.02,
      driftRate: 0,
      integralSec: 0,
      bpm: 128,
      strength: 0.9,
      dtSec: 1 / 60,
    })
    expect(a.kind).toBe('offset')
    expect(a.multiplier).toBeLessThan(1)
    expect(a.multiplier).toBeGreaterThanOrEqual(1 - VINYL_BEND_MAX)
  })

  it('speeds incoming when it is behind', () => {
    const a = driftAlignRate({
      errorSec: -0.02,
      driftRate: 0,
      integralSec: 0,
      bpm: 128,
      strength: 0.9,
      dtSec: 1 / 60,
    })
    expect(a.multiplier).toBeGreaterThan(1)
    expect(a.multiplier).toBeLessThanOrEqual(1 + VINYL_BEND_MAX)
  })

  it('is a no-op inside the lock deadband', () => {
    const a = driftAlignRate({
      errorSec: 0.0008,
      driftRate: 0,
      integralSec: 0.01,
      bpm: 120,
      strength: 1,
      dtSec: 1 / 60,
    })
    expect(a.kind).toBe('deadband')
    expect(a.multiplier).toBe(1)
    expect(a.nextIntegralSec).toBeLessThan(0.01)
  })

  it('clamps audible bend to ±1.8% and silent to ±3.5%', () => {
    const audible = driftAlignRate({
      errorSec: 0.2,
      driftRate: 0.02,
      integralSec: 0.4,
      bpm: 120,
      strength: 1,
      dtSec: 1 / 60,
    })
    expect(audible.multiplier).toBeGreaterThanOrEqual(1 - VINYL_BEND_MAX)
    expect(audible.multiplier).toBeLessThanOrEqual(1 + VINYL_BEND_MAX)

    const silent = driftAlignRate({
      errorSec: 0.2,
      driftRate: 0.02,
      integralSec: 0.4,
      bpm: 120,
      strength: 1,
      dtSec: 1 / 60,
      silent: true,
    })
    expect(silent.multiplier).toBeGreaterThanOrEqual(1 - SILENT_VINYL_BEND_MAX)
    expect(silent.multiplier).toBeLessThanOrEqual(1 + SILENT_VINYL_BEND_MAX)
    expect(Math.abs(silent.multiplier - 1)).toBeGreaterThan(Math.abs(audible.multiplier - 1) - 1e-9)
  })

  it('anti-windup freezes the integral when the clamp is hit', () => {
    const integralSec = 0.4
    const a = driftAlignRate({
      errorSec: 0.2,
      driftRate: 0.02,
      integralSec,
      bpm: 120,
      strength: 1,
      dtSec: 1 / 60,
    })
    expect(a.multiplier).toBeCloseTo(1 - VINYL_BEND_MAX, 8)
    expect(a.nextIntegralSec).toBe(integralSec)
  })

  it('never copies the trim onto outgoing', () => {
    const a = driftAlignRate({
      errorSec: 0.016,
      driftRate: 0.004,
      integralSec: 0,
      bpm: 124,
      strength: 0.9,
      dtSec: 1 / 60,
    })
    const bent = applyVinylBendToDeckRates({
      outRate: 1,
      inRate: 128 / 124,
      microMultiplier: a.multiplier,
    })
    expect(bent.outRate).toBe(1)
    expect(bent.inRate).not.toBeCloseTo(bent.outRate, 3)
  })
})

describe('drift PI vs P-only', () => {
  it('closes a walking BPM error that P-only leaves as a residual', () => {
    const dt = 1 / 60
    const walk = 0.008
    const run = (useDrift: boolean) => {
      let phase = 0.004
      let bias = 1
      const state = createDriftAlignState()
      for (let i = 0; i < 180; i += 1) {
        const t = i * dt
        phase += walk * dt
        if (useDrift) {
          pushDriftSample(state, t, phase)
          const est = estimateDrift(state.samples)
          const aligned = driftAlignRate({
            errorSec: phase,
            driftRate: est.driftRate,
            integralSec: state.integralSec,
            bpm: 120,
            strength: 0.9,
            dtSec: dt,
          })
          state.integralSec = aligned.nextIntegralSec
          bias = settleVinylBend(
            smoothVinylBend(bias, aligned.multiplier, Math.abs(phase)),
            Math.abs(phase),
          )
        } else {
          const micro = microRateCorrection({
            phaseErrorSec: phase,
            bpm: 120,
            strength: 0.9,
          })
          bias = settleVinylBend(
            smoothVinylBend(bias, micro, Math.abs(phase)),
            Math.abs(phase),
          )
        }
        const bent = applyVinylBendToDeckRates({
          outRate: 1,
          inRate: 1,
          microMultiplier: bias,
        })
        phase += (bent.inRate - bent.outRate) * dt
      }
      return phase
    }

    const withI = run(true)
    const pOnly = run(false)
    expect(Math.abs(withI)).toBeLessThan(Math.abs(pOnly))
    expect(Math.abs(withI)).toBeLessThan(0.006)
    expect(Math.abs(pOnly)).toBeGreaterThan(0.004)
  })
})
