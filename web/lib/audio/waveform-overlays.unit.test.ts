import { describe, expect, it } from 'vitest'
import { paintMixAnnotations } from './waveform-overlays'

describe('paintMixAnnotations blend progress', () => {
  it('draws without throwing when blendProgress is set', () => {
    const ctx = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      font: '',
      fillRect() {},
      stroke() {},
      beginPath() {},
      moveTo() {},
      lineTo() {},
      fillText() {},
      setLineDash() {},
    } as unknown as CanvasRenderingContext2D

    expect(() =>
      paintMixAnnotations(ctx, {
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
