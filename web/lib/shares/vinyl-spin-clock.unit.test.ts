import { describe, expect, it } from 'vitest'
import {
  shortestAngleDelta,
  vinylDegreesToSeconds,
  vinylVelocityToRate,
  VINYL_33_RPM_MS,
  VINYL_33_RPM_SEC,
  VINYL_DEG_PER_SEC,
  VINYL_RPM,
} from '@/lib/shares/vinyl-spin-clock'

describe('vinyl-spin-clock', () => {
  it('locks LP speed to 33⅓ RPM (1.8s per revolution)', () => {
    expect(VINYL_RPM).toBeCloseTo(100 / 3, 10)
    expect(VINYL_33_RPM_SEC).toBeCloseTo(1.8, 10)
    expect(VINYL_33_RPM_MS).toBeCloseTo(1800, 10)
    expect(VINYL_DEG_PER_SEC).toBeCloseTo(200, 10)
  })

  it('maps a full clockwise turn to +1.8s of audio', () => {
    expect(vinylDegreesToSeconds(360)).toBeCloseTo(1.8, 10)
    expect(vinylDegreesToSeconds(-180)).toBeCloseTo(-0.9, 10)
  })

  it('maps angular velocity onto signed playback rate multiples', () => {
    expect(vinylVelocityToRate(VINYL_DEG_PER_SEC)).toBeCloseTo(1, 10)
    expect(vinylVelocityToRate(-2 * VINYL_DEG_PER_SEC)).toBeCloseTo(-2, 10)
  })

  it('returns the shortest signed pointer angle delta', () => {
    expect(shortestAngleDelta(10, 20)).toBeCloseTo(10, 10)
    expect(shortestAngleDelta(170, -170)).toBeCloseTo(20, 10)
    expect(shortestAngleDelta(-170, 170)).toBeCloseTo(-20, 10)
  })
})
