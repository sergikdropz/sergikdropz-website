import { describe, expect, it } from 'vitest'
import {
  PHASE_DRAG_SCALE,
  PHASE_JOG_SNAP_BEAT_FRAC,
  PHASE_WHEEL_FINE_SCALE,
  PHASE_WHEEL_MAX_STEP_PX,
  PHASE_WHEEL_SUPERFINE_SCALE,
  centerPhaseDeltaSec,
  phaseDragPixels,
  phaseNudgeSecFromPixels,
  phaseWheelPixels,
  snapPhaseJogDelta,
  softPhaseJogPixels,
} from './phase-meter-wheel'

describe('phaseWheelPixels', () => {
  it('inverts trackpad side-scroll and applies the fine gear', () => {
    const soft10 = softPhaseJogPixels(10)
    expect(phaseWheelPixels({ deltaX: 10, deltaY: 0 })).toBeCloseTo(
      -soft10 * PHASE_WHEEL_FINE_SCALE,
      6,
    )
    expect(phaseWheelPixels({ deltaX: -10, deltaY: 0 })).toBeCloseTo(
      soft10 * PHASE_WHEEL_FINE_SCALE,
      6,
    )
  })

  it('treats vertical mouse wheel as jog while hovering the strip', () => {
    const soft20 = softPhaseJogPixels(Math.min(120, PHASE_WHEEL_MAX_STEP_PX))
    // Dominant vertical axis still jogs (dedicated strip, not the mixer panel).
    expect(phaseWheelPixels({ deltaX: 0, deltaY: 120 })).toBeCloseTo(
      -soft20 * PHASE_WHEEL_FINE_SCALE,
      6,
    )
    expect(phaseWheelPixels({ deltaX: 2, deltaY: 120 })).toBeCloseTo(
      -soft20 * PHASE_WHEEL_FINE_SCALE,
      6,
    )
  })

  it('treats shift+wheel as jog on the dominant axis (still inverted)', () => {
    const soft20 = softPhaseJogPixels(20)
    expect(phaseWheelPixels({ deltaX: 0, deltaY: 20, shiftKey: true })).toBeCloseTo(
      -soft20 * PHASE_WHEEL_FINE_SCALE,
      6,
    )
  })

  it('scales stroke length with sensitivity', () => {
    const base = phaseWheelPixels({ deltaX: 10, deltaY: 0, sensitivity: 1 })
    expect(phaseWheelPixels({ deltaX: 10, deltaY: 0, sensitivity: 2 })).toBeCloseTo(base * 2, 6)
    expect(phaseWheelPixels({ deltaX: 10, deltaY: 0, sensitivity: 0.5 })).toBeCloseTo(base * 0.5, 6)
  })

  it('slows down further with alt held', () => {
    const soft10 = softPhaseJogPixels(10)
    expect(phaseWheelPixels({ deltaX: 10, deltaY: 0, altKey: true })).toBeCloseTo(
      -soft10 * PHASE_WHEEL_SUPERFINE_SCALE,
      6,
    )
  })

  it('caps momentum flings before soft-shaping', () => {
    const softCap = softPhaseJogPixels(PHASE_WHEEL_MAX_STEP_PX)
    expect(phaseWheelPixels({ deltaX: 5000, deltaY: 0 })).toBeCloseTo(
      -softCap * PHASE_WHEEL_FINE_SCALE,
      6,
    )
    expect(phaseWheelPixels({ deltaX: -5000, deltaY: 0 })).toBeCloseTo(
      softCap * PHASE_WHEEL_FINE_SCALE,
      6,
    )
  })

  it('returns 0 for non-finite deltas', () => {
    expect(phaseWheelPixels({ deltaX: Number.NaN, deltaY: Number.NaN })).toBe(0)
  })
})

describe('softPhaseJogPixels', () => {
  it('damps large strokes more than small ones', () => {
    const small = softPhaseJogPixels(4) / 4
    const large = softPhaseJogPixels(20) / 20
    expect(large).toBeLessThan(small)
  })
})

describe('phaseDragPixels', () => {
  it('gears drag through the soft curve', () => {
    expect(phaseDragPixels(10)).toBeCloseTo(softPhaseJogPixels(10) * PHASE_DRAG_SCALE, 6)
    expect(phaseDragPixels(-10)).toBeCloseTo(softPhaseJogPixels(-10) * PHASE_DRAG_SCALE, 6)
  })

  it('scales coarse feel faster than fine', () => {
    const fine = Math.abs(phaseDragPixels(12, 'fine'))
    const normal = Math.abs(phaseDragPixels(12, 'normal'))
    const coarse = Math.abs(phaseDragPixels(12, 'coarse'))
    expect(fine).toBeLessThan(normal)
    expect(normal).toBeLessThan(coarse)
  })
})

describe('phaseNudgeSecFromPixels', () => {
  it('maps a full-width drag to the whole visible beat window', () => {
    expect(
      phaseNudgeSecFromPixels({ pixels: 400, widthPx: 400, windowBeats: 4, bpm: 120 }),
    ).toBeCloseTo(2, 6)
  })

  it('is a no-op without usable geometry or tempo', () => {
    expect(phaseNudgeSecFromPixels({ pixels: 10, widthPx: 0, windowBeats: 4, bpm: 120 })).toBe(0)
    expect(phaseNudgeSecFromPixels({ pixels: 0, widthPx: 400, windowBeats: 4, bpm: 120 })).toBe(0)
  })
})

describe('snapPhaseJogDelta', () => {
  const bpm = 120
  const beatSec = 0.5
  const snapSec = beatSec * PHASE_JOG_SNAP_BEAT_FRAC

  it('snaps to center when a step would land inside the lock band (grid polarity)', () => {
    // polarity −1: offset↑ lowers err. err=+12ms, nudge +10ms of offset → next≈+2ms → snap.
    const err = snapSec * 0.6
    const step = err * 0.9
    const out = snapPhaseJogDelta({ errSec: err, deltaSec: step, bpm, polarity: -1 })
    expect(out.snapped).toBe(true)
    expect(out.deltaSec).toBeCloseTo(err, 6) // -err / -1
  })

  it('snaps when the step would cross zero', () => {
    const err = 0.02
    const out = snapPhaseJogDelta({
      errSec: err,
      deltaSec: 0.05,
      bpm,
      polarity: -1,
    })
    expect(out.snapped).toBe(true)
    expect(out.deltaSec).toBeCloseTo(err, 6)
  })

  it('uses live-master polarity so offset↑ raises err', () => {
    const err = 0.02
    // Need negative offset delta to cancel positive err when polarity is +1.
    const out = snapPhaseJogDelta({
      errSec: err,
      deltaSec: -0.05,
      bpm,
      polarity: 1,
    })
    expect(out.snapped).toBe(true)
    expect(out.deltaSec).toBeCloseTo(-err, 6)
  })

  it('does not fight when already locked or when jogging away', () => {
    expect(
      snapPhaseJogDelta({ errSec: snapSec * 0.2, deltaSec: 0.01, bpm, polarity: -1 }).snapped,
    ).toBe(false)
    expect(
      snapPhaseJogDelta({ errSec: 0.02, deltaSec: -0.01, bpm, polarity: -1 }).snapped,
    ).toBe(false)
  })

  it('passes through when there is no usable error', () => {
    expect(snapPhaseJogDelta({ errSec: null, deltaSec: 0.01, bpm }).deltaSec).toBe(0.01)
    expect(snapPhaseJogDelta({ errSec: 0.01, deltaSec: 0, bpm }).deltaSec).toBe(0)
  })
})

describe('centerPhaseDeltaSec', () => {
  it('returns the offset nudge that zeros displayed error', () => {
    expect(centerPhaseDeltaSec({ errSec: 0.02, polarity: -1 })).toBeCloseTo(0.02, 6)
    expect(centerPhaseDeltaSec({ errSec: 0.02, polarity: 1 })).toBeCloseTo(-0.02, 6)
    expect(centerPhaseDeltaSec({ errSec: 0, polarity: -1 })).toBe(0)
    expect(centerPhaseDeltaSec({ errSec: null })).toBe(0)
  })
})
