import { describe, expect, it } from 'vitest'
import {
  TEMPO_DIAL_DRAG_SLOP_PX,
  TEMPO_DIAL_MAX_PCT,
  TEMPO_DIAL_MIN_PCT,
  TEMPO_DIAL_TRAVEL_PX,
  isTempoDialDrag,
  nudgeTempoPct,
  tempoPctFromDrag,
} from './tempo-dial-drag'

describe('isTempoDialDrag', () => {
  it('treats sub-slop movement as a tap', () => {
    expect(isTempoDialDrag(1, 1)).toBe(false)
    expect(isTempoDialDrag(0, TEMPO_DIAL_DRAG_SLOP_PX)).toBe(true)
  })
})

describe('tempoPctFromDrag', () => {
  it('drags up to speed up and down to slow down', () => {
    expect(tempoPctFromDrag({ startPct: 0, deltaY: -TEMPO_DIAL_TRAVEL_PX })).toBe(TEMPO_DIAL_MAX_PCT)
    expect(tempoPctFromDrag({ startPct: 0, deltaY: TEMPO_DIAL_TRAVEL_PX })).toBe(TEMPO_DIAL_MIN_PCT)
  })

  it('is relative to the press starting percent', () => {
    expect(tempoPctFromDrag({ startPct: 10, deltaY: -TEMPO_DIAL_TRAVEL_PX / 5 })).toBeCloseTo(20, 1)
  })

  it('shift-drag is finer', () => {
    const coarse = tempoPctFromDrag({ startPct: 0, deltaY: -TEMPO_DIAL_TRAVEL_PX / 2 })
    const fine = tempoPctFromDrag({ startPct: 0, deltaY: -TEMPO_DIAL_TRAVEL_PX / 2, fine: true })
    expect(Math.abs(fine)).toBeLessThan(Math.abs(coarse))
  })

  it('snaps near zero and clamps the ends', () => {
    expect(tempoPctFromDrag({ startPct: 0.05, deltaY: 0 })).toBe(0)
    expect(tempoPctFromDrag({ startPct: 40, deltaY: -TEMPO_DIAL_TRAVEL_PX })).toBe(TEMPO_DIAL_MAX_PCT)
    expect(tempoPctFromDrag({ startPct: -40, deltaY: TEMPO_DIAL_TRAVEL_PX })).toBe(TEMPO_DIAL_MIN_PCT)
  })
})

describe('nudgeTempoPct', () => {
  it('steps and clamps', () => {
    expect(nudgeTempoPct(0, 1)).toBe(1)
    expect(nudgeTempoPct(0, -0.25)).toBe(-0.2)
    expect(nudgeTempoPct(TEMPO_DIAL_MAX_PCT, 5)).toBe(TEMPO_DIAL_MAX_PCT)
    expect(nudgeTempoPct(TEMPO_DIAL_MIN_PCT, -5)).toBe(TEMPO_DIAL_MIN_PCT)
  })
})
