import { describe, expect, it } from 'vitest'
import { applyArtEdit, defaultArtEdit } from './art-adjust'
import { defringeRimColor, inpaintStamps, polygonMask, refineCutoutEdge } from './cutout-tools'
import type { ImageDataLike } from './remove-background'

function solid(size: number, rgb: [number, number, number], alpha = 255): ImageDataLike {
  const data = new Uint8ClampedArray(size * size * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgb[0]
    data[i + 1] = rgb[1]
    data[i + 2] = rgb[2]
    data[i + 3] = alpha
  }
  return { data, width: size, height: size }
}

describe('cutout tools', () => {
  it('rasterizes a polygon and leaves the outside untouched', () => {
    const mask = polygonMask(20, 20, [
      { x: 0.25, y: 0.25 },
      { x: 0.75, y: 0.25 },
      { x: 0.75, y: 0.75 },
      { x: 0.25, y: 0.75 },
    ])
    expect(mask[10 * 20 + 10]).toBe(1)
    expect(mask[0]).toBe(0)
    expect(polygonMask(20, 20, [{ x: 0.2, y: 0.2 }])[10]).toBe(0)
  })

  it('pulls white off the rim without clearing the pixel', () => {
    const image = solid(12, [20, 20, 80])
    image.data[7] = 0
    const edge = 2 * 4
    image.data[edge] = 250
    image.data[edge + 1] = 250
    image.data[edge + 2] = 250
    const out = defringeRimColor(image, 'white', 100)
    expect(out.data[edge + 3]).toBe(255)
    expect(out.data[edge]).toBeLessThan(80)
  })

  it('shifts the matte without rewriting colour', () => {
    const image = solid(10, [10, 40, 200])
    image.data[3] = 0
    const out = refineCutoutEdge(image, { radius: 2, smooth: 0, feather: 0, contrast: 0, shift: 1 })
    expect(out.data[0]).toBe(10)
    expect(out.data[1]).toBe(40)
    expect(out.data[2]).toBe(200)
    expect(out.data[3]).toBe(255)
  })

  it('fills an inpaint hole from the surrounding colour', () => {
    const image = solid(16, [30, 90, 200])
    for (let y = 6; y <= 10; y++) {
      for (let x = 6; x <= 10; x++) {
        const i = (y * 16 + x) * 4
        image.data[i] = 0
        image.data[i + 1] = 0
        image.data[i + 2] = 0
      }
    }
    const hole = inpaintStamps(image, [{ x: 0.5, y: 0.5, radius: 0.28 }])
    const center = (8 * 16 + 8) * 4
    expect(hole.data[center]).toBeGreaterThan(15)
    expect(hole.data[center + 1]).toBeGreaterThan(50)
    expect(hole.data[center + 3]).toBe(255)
  })

  it('restores a lasso region after the background cut', () => {
    const size = 16
    const data = new Uint8ClampedArray(size * size * 4)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4
        const subject = x >= 5 && x < 11 && y >= 5 && y < 11
        data[i] = subject ? 220 : 255
        data[i + 1] = subject ? 20 : 255
        data[i + 2] = subject ? 20 : 255
        data[i + 3] = 255
      }
    }
    const edit = defaultArtEdit()
    edit.cutout = true
    edit.lassos = [
      {
        restore: true,
        points: [
          { x: 0, y: 0 },
          { x: 0.2, y: 0 },
          { x: 0.2, y: 0.2 },
          { x: 0, y: 0.2 },
        ],
      },
    ]
    const out = applyArtEdit({ data, width: size, height: size }, edit, 'cutout')
    expect(out.data[3]).toBe(255)
    expect(out.data[(8 * size + 8) * 4]).toBe(220)
  })
})
