import { describe, expect, it } from 'vitest'
import {
  applyVinylBendToDeckRates,
  filterPhaseErrorSec,
  microRateCorrection,
  phaseChaseStrength,
  settleVinylBend,
  smoothVinylBend,
  VINYL_BEND_DEADBAND_SEC,
  VINYL_BEND_MAX,
} from './sync'

describe('vinyl bend', () => {
  it('slows incoming when it is ahead of the master', () => {
    const micro = microRateCorrection({
      phaseErrorSec: 0.02,
      bpm: 128,
      strength: 0.9,
    })
    expect(micro).toBeLessThan(1)
    expect(micro).toBeGreaterThanOrEqual(1 - VINYL_BEND_MAX)
  })

  it('speeds incoming when it is behind the master', () => {
    const micro = microRateCorrection({
      phaseErrorSec: -0.02,
      bpm: 128,
      strength: 0.9,
    })
    expect(micro).toBeGreaterThan(1)
    expect(micro).toBeLessThanOrEqual(1 + VINYL_BEND_MAX)
  })

  it('is a no-op inside the lock deadband', () => {
    expect(
      microRateCorrection({
        phaseErrorSec: VINYL_BEND_DEADBAND_SEC / 2,
        bpm: 120,
        strength: 1,
      }),
    ).toBe(1)
  })

  it('applies the bend to incoming only so relative rate can catch', () => {
    const bent = applyVinylBendToDeckRates({
      outRate: 1,
      inRate: 128 / 124,
      microMultiplier: 0.985,
    })
    expect(bent.outRate).toBe(1)
    expect(bent.inRate).toBeCloseTo((128 / 124) * 0.985, 6)
    expect(bent.inRate).not.toBeCloseTo(bent.outRate, 3)
  })

  it('incoming-only bend closes 20ms residual; dual-copy does not', () => {
    const bpm = 120
    const dt = 1 / 60
    const simulate = (copyOntoOutgoing: boolean) => {
      let phaseErr = 0.02
      let bias = 1
      for (let i = 0; i < 90; i += 1) {
        const micro = microRateCorrection({
          phaseErrorSec: phaseErr,
          bpm,
          strength: 0.9,
        })
        bias = settleVinylBend(smoothVinylBend(bias, micro, Math.abs(phaseErr)), Math.abs(phaseErr))
        const bent = applyVinylBendToDeckRates({
          outRate: 1,
          inRate: 1,
          microMultiplier: bias,
        })
        const outRate = copyOntoOutgoing ? bent.inRate : bent.outRate
        phaseErr += (bent.inRate - outRate) * dt
      }
      return phaseErr
    }

    expect(Math.abs(simulate(false))).toBeLessThan(0.006)
    expect(Math.abs(simulate(true))).toBeGreaterThan(0.015)
  })

  it('filters currentTime jitter instead of following each sample', () => {
    let filtered = 0.02
    filtered = filterPhaseErrorSec(filtered, -0.02)
    expect(filtered).toBeGreaterThan(0)
    expect(filtered).toBeLessThan(0.02)
  })

  it('keeps full chase until late handoff', () => {
    expect(phaseChaseStrength(0.4)).toBe(1)
    expect(phaseChaseStrength(0.85)).toBe(1)
    expect(phaseChaseStrength(1)).toBeCloseTo(0.2, 5)
  })
})
