import { describe, expect, it } from 'vitest'
import {
  EQ_DIAL_DRAG_SLOP_PX,
  EQ_DIAL_MAX_GAIN,
  EQ_DIAL_MIN_GAIN,
  EQ_DIAL_TRAVEL_PX,
  eqDialPositionToGain,
  eqGainFromDrag,
  eqGainToDialPosition,
  isEqDialDrag,
  nudgeEqGain,
} from './eq-dial-drag'

describe('eqGainToDialPosition', () => {
  it('maps the detent and both ends to full travel', () => {
    expect(eqGainToDialPosition(0)).toBe(0)
    expect(eqGainToDialPosition(EQ_DIAL_MAX_GAIN)).toBe(1)
    expect(eqGainToDialPosition(EQ_DIAL_MIN_GAIN)).toBe(-1)
  })

  it('clamps out-of-range gains', () => {
    expect(eqGainToDialPosition(99)).toBe(1)
    expect(eqGainToDialPosition(-99)).toBe(-1)
    expect(eqGainToDialPosition(Number.NaN)).toBe(0)
  })

  it('round-trips through eqDialPositionToGain', () => {
    for (const gain of [-40, -18, -6, 0, 3, 12]) {
      expect(eqDialPositionToGain(eqGainToDialPosition(gain))).toBeCloseTo(gain, 1)
    }
  })
})

describe('isEqDialDrag', () => {
  it('treats sub-slop movement as a tap', () => {
    expect(isEqDialDrag(1, 1)).toBe(false)
    expect(isEqDialDrag(0, EQ_DIAL_DRAG_SLOP_PX)).toBe(true)
  })
})

describe('eqGainFromDrag', () => {
  it('boosts on upward drag and cuts on downward drag', () => {
    expect(eqGainFromDrag({ startGain: 0, deltaY: -EQ_DIAL_TRAVEL_PX })).toBe(EQ_DIAL_MAX_GAIN)
    expect(eqGainFromDrag({ startGain: 0, deltaY: EQ_DIAL_TRAVEL_PX })).toBe(EQ_DIAL_MIN_GAIN)
  })

  it('is relative to the gain captured at pointer-down', () => {
    expect(eqGainFromDrag({ startGain: 6, deltaY: -EQ_DIAL_TRAVEL_PX / 2 })).toBe(EQ_DIAL_MAX_GAIN)
  })

  it('clamps past either end of travel', () => {
    expect(eqGainFromDrag({ startGain: 0, deltaY: -EQ_DIAL_TRAVEL_PX * 4 })).toBe(EQ_DIAL_MAX_GAIN)
    expect(eqGainFromDrag({ startGain: 0, deltaY: EQ_DIAL_TRAVEL_PX * 4 })).toBe(EQ_DIAL_MIN_GAIN)
  })

  it('snaps back to a hard 0 dB detent on both sides', () => {
    expect(eqGainFromDrag({ startGain: 0, deltaY: -1 })).toBe(0)
    expect(eqGainFromDrag({ startGain: 0, deltaY: 1 })).toBe(0)
    expect(eqGainFromDrag({ startGain: 0, deltaY: 10 })).toBeLessThan(0)
  })

  it('moves a quarter as far with fine mode', () => {
    const coarse = eqGainFromDrag({ startGain: 0, deltaY: -40 })
    const fine = eqGainFromDrag({ startGain: 0, deltaY: -40, fine: true })
    expect(fine).toBeCloseTo(coarse / 4, 1)
  })
})

describe('nudgeEqGain', () => {
  it('steps and clamps within range', () => {
    expect(nudgeEqGain(0, 1)).toBe(1)
    expect(nudgeEqGain(EQ_DIAL_MAX_GAIN, 1)).toBe(EQ_DIAL_MAX_GAIN)
    expect(nudgeEqGain(EQ_DIAL_MIN_GAIN, -1)).toBe(EQ_DIAL_MIN_GAIN)
  })

  it('passes through the 0 dB detent', () => {
    expect(nudgeEqGain(0.2, -0.1)).toBe(0)
  })
})
