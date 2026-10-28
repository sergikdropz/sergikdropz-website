import { describe, expect, it } from 'vitest'
import { cleanTrace, extendBleed, lanczosUpscale } from './print-prep'
import type { ImageDataLike } from './remove-background'

function solid(width: number, height: number, rgb: [number, number, number]): ImageDataLike {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgb[0]
    data[i + 1] = rgb[1]
    data[i + 2] = rgb[2]
    data[i + 3] = 255
  }
  return { data, width, height }
}

describe('print prep', () => {
  it('doubles a flat color without shifting it', () => {
    const out = lanczosUpscale(solid(4, 4, [20, 80, 200]), 2)
    expect(out.width).toBe(8)
    expect(out.height).toBe(8)
    expect(out.data[0]).toBeGreaterThan(10)
    expect(out.data[0]).toBeLessThan(35)
    expect(out.data[2]).toBeGreaterThan(180)
  })

  it('copies the edge color into the bleed margin', () => {
    const out = extendBleed(solid(4, 4, [240, 10, 10]), 2)
    expect(out.width).toBe(8)
    expect(out.height).toBe(8)
    expect(out.data[0]).toBe(240)
    expect(out.data[(7 * 8 + 7) * 4]).toBe(240)
    expect(out.data[(3 * 8 + 3) * 4 + 1]).toBe(10)
  })

  it('keeps a one-pixel line and redraws it at twice the size', () => {
    const image = solid(12, 12, [255, 255, 255])
    for (let x = 2; x < 10; x++) {
      const i = (6 * 12 + x) * 4
      image.data[i] = 0
      image.data[i + 1] = 0
      image.data[i + 2] = 0
    }
    const out = cleanTrace(image, 2)
    expect(out.width).toBe(24)
    const mid = (12 * 24 + 8) * 4
    expect(out.data[mid]).toBeLessThan(30)
    expect(out.data[4]).toBeGreaterThan(220)
  })
})