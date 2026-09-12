import { describe, expect, it } from 'vitest'
import {
  XF_CENTER,
  XF_WHEEL_FINE_SCALE,
  XF_WHEEL_MAX_STEP_PX,
  applyCrossfaderWheelDelta,
  crossfaderDeltaFromWheel,
} from './mix-crossfader-wheel'

describe('crossfaderDeltaFromWheel', () => {
  it('moves toward B on positive horizontal scroll', () => {
    const d = crossfaderDeltaFromWheel({ deltaX: 10, deltaY: 0 })
    expect(d).toBeGreaterThan(0)
    expect(d).toBeCloseTo(Math.pow(10, 0.72) * XF_WHEEL_FINE_SCALE, 6)
  })

  it('accepts vertical mouse wheel while hovering', () => {
    const d = crossfaderDeltaFromWheel({ deltaX: 0, deltaY: 20 })
    expect(d).toBeGreaterThan(0)
  })

  it('caps momentum flings', () => {
    const softCap = Math.pow(XF_WHEEL_MAX_STEP_PX, 0.72) * XF_WHEEL_FINE_SCALE
    expect(crossfaderDeltaFromWheel({ deltaX: 5000, deltaY: 0 })).toBeCloseTo(softCap, 6)
  })

  it('returns 0 for empty gestures', () => {
    expect(crossfaderDeltaFromWheel({ deltaX: 0, deltaY: 0 })).toBe(0)
    expect(crossfaderDeltaFromWheel({ deltaX: Number.NaN, deltaY: Number.NaN })).toBe(0)
  })
})

describe('applyCrossfaderWheelDelta', () => {
  it('accumulates and clamps', () => {
    expect(applyCrossfaderWheelDelta(0.5, 0.1)).toBeCloseTo(0.6, 6)
    expect(applyCrossfaderWheelDelta(0.95, 0.2)).toBe(1)
    expect(applyCrossfaderWheelDelta(0.05, -0.2)).toBe(0)
    expect(applyCrossfaderWheelDelta(Number.NaN, 0.1)).toBeCloseTo(XF_CENTER + 0.1, 6)
  })
})
