import { describe, expect, it } from 'vitest'
import { backdropKind, paintGarmentBackdrop } from '@/lib/merch/product-mat'

function pixel(data: Uint8ClampedArray, index: number) {
  const offset = index * 4
  return [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]]
}

describe('paintGarmentBackdrop', () => {
  it('leaves a cut-out shirt alone so the mat stays behind opaque fabric', () => {
    const data = new Uint8ClampedArray([
      0, 0, 0, 0, 0, 0, 0, 0,
      35, 35, 35, 255, 35, 35, 35, 255,
    ])
    expect(backdropKind(data, 2, 2)).toBe('cutout')
    const painted = paintGarmentBackdrop(data, 2, 2, { r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })
    expect(painted).toBe(data)
  })

  it('recolors a baked white backdrop and keeps the garment on its own color', () => {
    const white = [255, 255, 255, 255]
    const hat = [8, 8, 8, 76]
    const data = new Uint8ClampedArray([
      ...white, ...white, ...white,
      ...white, ...hat, ...white,
      ...white, ...white, ...white,
    ])
    expect(backdropKind(data, 3, 3)).toBe('ghost')
    const painted = paintGarmentBackdrop(data, 3, 3, { r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })
    expect(pixel(painted, 0)).toEqual([0, 0, 0, 255])
    expect(pixel(painted, 2)).toEqual([0, 0, 0, 255])
    expect(pixel(painted, 8)).toEqual([0, 0, 0, 255])
    const cover = 76 / 255
    const fabric = Math.round(8 * cover + 255 * (1 - cover))
    expect(pixel(painted, 4)).toEqual([fabric, fabric, fabric, 255])
    expect(fabric).toBeGreaterThan(160)
  })
})
