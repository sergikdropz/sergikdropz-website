import { describe, expect, it } from 'vitest'
import {
  localGridPhaseErrorSec,
  paintMixAnnotations,
  paintPhaseAlignStrip,
} from './waveform-overlays'

function mockCtx() {
  return {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    canvas: { width: 0, height: 0 },
    fillRect() {},
    stroke() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    fill() {},
    fillText() {},
    setLineDash() {},
    setTransform() {},
    createLinearGradient() {
      return {
        addColorStop() {},
      }
    },
  } as unknown as CanvasRenderingContext2D
}

describe('paintMixAnnotations blend progress', () => {
  it('draws without throwing when blendProgress is set', () => {
    expect(() =>
      paintMixAnnotations(mockCtx(), {
        width: 400,
        height: 80,
        startSec: 0,
        endSec: 200,
        overlay: {
          active: true,
          mixOutSec: 160,
          mixStartSec: 160,
          mixEndSec: 176,
          blendProgress: 0.5,
        },
      }),
    ).not.toThrow()
  })
})

describe('localGridPhaseErrorSec', () => {
  it('is near zero on the downbeat', () => {
    expect(localGridPhaseErrorSec({ currentTimeSec: 0, bpm: 120, offsetSec: 0 })).toBeCloseTo(0, 5)
    expect(localGridPhaseErrorSec({ currentTimeSec: 0.5, bpm: 120, offsetSec: 0 })).toBeCloseTo(0, 5)
  })

  it('reports signed error within ±½ beat by default', () => {
    const err = localGridPhaseErrorSec({ currentTimeSec: 0.1, bpm: 120, offsetSec: 0 })
    expect(err).toBeCloseTo(0.1, 5)
    const early = localGridPhaseErrorSec({ currentTimeSec: 0.4, bpm: 120, offsetSec: 0 })
    expect(early).toBeCloseTo(-0.1, 5)
  })

  it('folds into a multi-bar CDJ window instead of ±½ beat', () => {
    // ±2 bars @ 4/4 → windowBeats = 16 (full), period = 8s @ 120 BPM, half = 4s
    const err = localGridPhaseErrorSec({
      currentTimeSec: 1.0,
      bpm: 120,
      offsetSec: 0,
      windowBeats: 16,
    })
    expect(err).toBeCloseTo(1.0, 5)
    const wrap = localGridPhaseErrorSec({
      currentTimeSec: 7.5,
      bpm: 120,
      offsetSec: 0,
      windowBeats: 16,
    })
    // 7.5s into an 8s period → −0.5s past the far half
    expect(wrap).toBeCloseTo(-0.5, 5)
  })
})

describe('paintPhaseAlignStrip', () => {
  it('draws locked and drifting phase and returns status', () => {
    const locked = paintPhaseAlignStrip(mockCtx(), {
      width: 240,
      height: 20,
      dpr: 1,
      currentTimeSec: 0,
      bpm: 120,
      offsetSec: 0,
      beatsPerBar: 4,
    })
    expect(locked.locked).toBe(true)
    expect(locked.mode).toBe('grid')

    const drifting = paintPhaseAlignStrip(mockCtx(), {
      width: 240,
      height: 20,
      dpr: 1,
      currentTimeSec: 0.1,
      bpm: 120,
      offsetSec: 0,
      phaseErrorSec: 0.05,
      options: { windowId: 'bar-1', showPhrases: true, phraseBars: 8 },
    })
    expect(drifting.mode).toBe('sync')
    expect(drifting.locked).toBe(false)
    expect(drifting.errSec).toBeCloseTo(0.05, 5)
  })

  it('keeps multi-bar sync error inside the CDJ window (not ±½ beat)', () => {
    // ±2 bars → windowSec = 2s @ 120 BPM; 0.8s error must not wrap to −0.2s
    const painted = paintPhaseAlignStrip(mockCtx(), {
      width: 240,
      height: 20,
      dpr: 1,
      currentTimeSec: 0,
      bpm: 120,
      offsetSec: 0,
      phaseErrorSec: 0.8,
      options: { windowId: 'bar-2' },
    })
    expect(painted.mode).toBe('sync')
    expect(painted.errSec).toBeCloseTo(0.8, 5)
  })

  it('keeps grid needle on ±½ beat lock even with a wide window', () => {
    const painted = paintPhaseAlignStrip(mockCtx(), {
      width: 240,
      height: 20,
      dpr: 1,
      currentTimeSec: 0.8,
      bpm: 120,
      offsetSec: 0,
      options: { windowId: 'bar-8' },
    })
    expect(painted.mode).toBe('grid')
    // 0.8s @ 120 BPM → 0.3s past nearest beat half → folded to −0.2s
    expect(painted.errSec).toBeCloseTo(-0.2, 5)
  })
})
