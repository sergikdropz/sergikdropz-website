import { describe, expect, it } from 'vitest'
import {
  CANVAS_DRIFT_VARIANTS,
  canvasDriftEase,
  canvasPoseAtElapsed,
  canvasReboundUnit,
  lerpCanvasPose,
  spotifyCanvasDriftSeed,
  SPOTIFY_CANVAS_DURATION_SEC,
  SPOTIFY_CANVAS_HEIGHT,
  SPOTIFY_CANVAS_WIDTH,
} from '@/lib/studio/spotify-canvas'

describe('spotify canvas drift', () => {
  it('uses Spotify 9:16 canvas dimensions and 8s duration', () => {
    expect(SPOTIFY_CANVAS_WIDTH / SPOTIFY_CANVAS_HEIGHT).toBeCloseTo(9 / 16, 5)
    expect(SPOTIFY_CANVAS_DURATION_SEC).toBe(8)
    expect(CANVAS_DRIFT_VARIANTS).toHaveLength(8)
  })

  it('seeds a stable drift variant from title', () => {
    const a = spotifyCanvasDriftSeed('Are We Awake?')
    const b = spotifyCanvasDriftSeed('Are We Awake?')
    expect(a).toBe(b)
    expect(a).toBeGreaterThanOrEqual(0)
    expect(a).toBeLessThan(8)
    expect(spotifyCanvasDriftSeed('Other Title')).not.toBe(a)
  })

  it('rebounds 0→1→0 for a seamless loop', () => {
    expect(canvasReboundUnit(0, 8)).toBeCloseTo(0, 5)
    expect(canvasReboundUnit(4, 8)).toBeCloseTo(1, 5)
    expect(canvasReboundUnit(8, 8)).toBeCloseTo(0, 5)
    expect(canvasDriftEase(0.5)).toBeCloseTo(0.5, 5)
  })

  it('lerps Ken Burns poses along the rebound path', () => {
    const start = canvasPoseAtElapsed(0, 0, 8)
    const mid = canvasPoseAtElapsed(0, 4, 8)
    const end = canvasPoseAtElapsed(0, 8, 8)
    expect(start.scale).toBeCloseTo(CANVAS_DRIFT_VARIANTS[0]!.from.scale, 5)
    expect(mid.scale).toBeCloseTo(CANVAS_DRIFT_VARIANTS[0]!.to.scale, 5)
    expect(end.scale).toBeCloseTo(start.scale, 5)

    const midLerp = lerpCanvasPose(
      CANVAS_DRIFT_VARIANTS[0]!.from,
      CANVAS_DRIFT_VARIANTS[0]!.to,
      0.5
    )
    expect(midLerp.tx).toBeCloseTo(-3, 5)
  })
})
