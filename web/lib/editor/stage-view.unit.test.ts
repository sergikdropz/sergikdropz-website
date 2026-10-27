import { describe, expect, it } from 'vitest'
import { clampStagePan, clampStageZoom, panForZoom } from './stage-view'

describe('stage view', () => {
  it('keeps the framed center still when zooming from the middle', () => {
    expect(panForZoom({ x: 40, y: -10 }, 1, 2, 0, 0)).toEqual({ x: 80, y: -20 })
  })

  it('zooms toward a point away from the center', () => {
    expect(panForZoom({ x: 0, y: 0 }, 1, 2, 100, 0)).toEqual({ x: -100, y: 0 })
  })

  it('limits how far the view can zoom', () => {
    expect(clampStageZoom(0.2)).toBe(1)
    expect(clampStageZoom(12)).toBe(8)
  })

  it('keeps a fitted image centered so none of it is cropped', () => {
    expect(clampStagePan({ x: 40, y: -20 }, 1, { width: 400, height: 500 }, { width: 600, height: 500 })).toEqual({
      x: 0,
      y: 0,
    })
  })

  it('lets a zoomed image move only until its edge meets the frame', () => {
    expect(clampStagePan({ x: 400, y: 0 }, 2, { width: 400, height: 500 }, { width: 600, height: 500 })).toEqual({
      x: 100,
      y: 0,
    })
  })
})