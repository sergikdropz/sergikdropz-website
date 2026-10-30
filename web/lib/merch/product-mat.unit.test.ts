import { describe, expect, it } from 'vitest'
import { backdropKind, coverFrontNeck, fillSilhouetteWithPattern, paintGarmentBackdrop } from '@/lib/merch/product-mat'

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

  it('fills a transparent positioning hole with the color photo and keeps the backdrop', () => {
    const hole = [0, 0, 0, 0]
    const outside = [255, 255, 255, 255]
    const tieDye = [244, 120, 180, 255]
    const silhouette = new Uint8ClampedArray([...outside, ...hole])
    const pattern = new Uint8ClampedArray([...tieDye, ...tieDye])
    const filled = fillSilhouetteWithPattern(silhouette, pattern, null)
    expect(pixel(filled, 0)).toEqual([255, 255, 255, 255])
    expect(pixel(filled, 1)).toEqual([244, 120, 180, 255])
    const onMat = fillSilhouetteWithPattern(silhouette, pattern, { r: 10, g: 20, b: 30 })
    expect(pixel(onMat, 0)).toEqual([10, 20, 30, 255])
    expect(pixel(onMat, 1)).toEqual([244, 120, 180, 255])
  })

  it('replaces the front collar inside a back neck with the fabric below it', () => {
    const width = 10
    const height = 40
    const pattern = new Uint8ClampedArray(width * height * 4)
    const silhouette = new Uint8ClampedArray(width * height * 4)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4
        const neck = y >= 1 && y <= 8 && x >= 4 && x <= 5
        const body = y >= 9 && y <= 38
        const hole = neck || body
        silhouette[offset + 3] = hole ? 0 : 255
        const color = neck ? [8, 8, 12] : body ? [200, 10, 10] : [255, 255, 255]
        pattern[offset] = color[0]
        pattern[offset + 1] = color[1]
        pattern[offset + 2] = color[2]
        pattern[offset + 3] = 255
      }
    }
    const covered = coverFrontNeck(pattern, silhouette, width, height)
    expect(pixel(covered, 1 * width + 4)).toEqual([200, 10, 10, 255])
    expect(pixel(covered, 8 * width + 5)).toEqual([200, 10, 10, 255])
    expect(pixel(covered, 20 * width + 3)).toEqual([200, 10, 10, 255])
    expect(pixel(covered, 0)).toEqual([255, 255, 255, 255])
  })
})
