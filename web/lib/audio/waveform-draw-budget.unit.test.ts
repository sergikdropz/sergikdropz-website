import { describe, expect, it } from 'vitest'
import { WAVEFORM_COLUMNS_HARD_MAX, waveformDrawBudget } from './waveform-draw-budget'
import { sliceTapeWindow, tapeIndexAtOrAfter } from './waveform-tape-cache'
import type { TimedWaveformSample } from './waveform-view'

describe('waveformDrawBudget', () => {
  it('keeps full-track overview dense when width is unknown', () => {
    const b = waveformDrawBudget(0)
    expect(b.columns).toBeGreaterThanOrEqual(1000)
    expect(b.overview).toBe(true)
    expect(b.halfBeats).toBe(false)
  })

  it('densifies phrase zooms and enables half-beats', () => {
    expect(waveformDrawBudget(8).columns).toBeGreaterThan(700)
    expect(waveformDrawBudget(8).halfBeats).toBe(true)
    expect(waveformDrawBudget(8).overview).toBe(false)
    expect(waveformDrawBudget(64).overview).toBe(true)
  })

  it('caps columns to CSS width × DPR (no overpaint)', () => {
    const narrow = waveformDrawBudget(0, { cssWidth: 400, dpr: 1 })
    expect(narrow.columns).toBe(400)
    expect(narrow.columns).toBeLessThan(1000)

    const retina = waveformDrawBudget(8, { cssWidth: 800, dpr: 2 })
    expect(retina.columns).toBe(Math.ceil(800 * 2 * 1.2))
    expect(retina.columns).toBeLessThanOrEqual(WAVEFORM_COLUMNS_HARD_MAX)
  })

  it('never paints more than the hard max', () => {
    const wide = waveformDrawBudget(8, { cssWidth: 4000, dpr: 2 })
    expect(wide.columns).toBe(WAVEFORM_COLUMNS_HARD_MAX)
  })
})

describe('tape window slice', () => {
  const timed: TimedWaveformSample[] = Array.from({ length: 100 }, (_, i) => ({
    positive: 0.5,
    negative: 0.4,
    color: 'rgb(1,2,3)',
    timeSec: i,
  }))

  it('binary-searches time on the tape', () => {
    expect(tapeIndexAtOrAfter(timed, 25)).toBe(25)
    expect(tapeIndexAtOrAfter(timed, 25.1)).toBe(26)
  })

  it('decimates wide windows to the draw budget', () => {
    const slice = sliceTapeWindow(timed, 10, 90, 20)
    expect(slice.length).toBe(20)
    expect(slice[0].timeSec).toBeGreaterThanOrEqual(9)
    expect(slice[slice.length - 1].timeSec).toBeLessThanOrEqual(90)
  })

  it('keeps column peak max when decimating (accurate readings)', () => {
    const spiked = timed.map((s, i) =>
      i === 50 ? { ...s, positive: 0.99, negative: 0.95 } : { ...s, positive: 0.1, negative: 0.08 }
    )
    const slice = sliceTapeWindow(spiked, 0, 99, 10)
    expect(Math.max(...slice.map((s) => s.positive))).toBeCloseTo(0.99, 5)
  })
})
