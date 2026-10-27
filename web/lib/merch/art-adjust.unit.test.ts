import { describe, expect, it } from 'vitest'
import {
  applyArtEdit,
  applyEffect,
  autoTone,
  clampCrop,
  curveLut,
  defaultArtEdit,
  displayToSource,
} from './art-adjust'
import type { ImageDataLike } from './remove-background'

function solid(width: number, height: number, rgba: [number, number, number, number]): ImageDataLike {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgba[0]
    data[i + 1] = rgba[1]
    data[i + 2] = rgba[2]
    data[i + 3] = rgba[3]
  }
  return { data, width, height }
}

function at(image: ImageDataLike, x: number, y: number) {
  const i = (y * image.width + x) * 4
  return [image.data[i], image.data[i + 1], image.data[i + 2], image.data[i + 3]]
}

describe('art-adjust', () => {
  it('keeps an identity curve as a straight line', () => {
    const lut = curveLut([
      { x: 0, y: 0 },
      { x: 255, y: 255 },
    ])
    expect(lut[0]).toBe(0)
    expect(lut[128]).toBe(128)
    expect(lut[255]).toBe(255)
  })

  it('leaves pixels unchanged when every control is at rest', () => {
    const image = solid(2, 2, [20, 40, 60, 255])
    const out = applyArtEdit(image, defaultArtEdit())
    expect(at(out, 1, 1)).toEqual([20, 40, 60, 255])
  })

  it('drops saturation to gray', () => {
    const image = solid(1, 1, [200, 20, 20, 255])
    const edit = defaultArtEdit()
    edit.tone.saturation = 0
    const [r, g, b] = at(applyArtEdit(image, edit), 0, 0)
    expect(Math.abs(r - g)).toBeLessThan(2)
    expect(Math.abs(g - b)).toBeLessThan(2)
  })

  it('lifts a dark frame with auto tone', () => {
    const image = solid(8, 8, [24, 24, 24, 255])
    const tone = autoTone(image)
    expect(tone.brightness).toBeGreaterThan(100)
  })

  it('swaps the sides on a 90 degree turn', () => {
    const image = solid(2, 1, [9, 0, 0, 255])
    image.data[4] = 0
    image.data[5] = 9
    const edit = defaultArtEdit()
    edit.rotate = 90
    const out = applyArtEdit(image, edit)
    expect(out.width).toBe(1)
    expect(out.height).toBe(2)
  })

  it('crops to the requested fraction', () => {
    const image = solid(4, 4, [1, 2, 3, 255])
    const edit = defaultArtEdit()
    edit.crop = { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }
    const out = applyArtEdit(image, edit)
    expect(out.width).toBe(2)
    expect(out.height).toBe(2)
  })

  it('pads a wide image out to a square', () => {
    const image = solid(4, 2, [8, 8, 8, 255])
    const edit = defaultArtEdit()
    edit.fit = 'square'
    edit.padColor = [255, 0, 0]
    const out = applyArtEdit(image, edit)
    expect(out.width).toBe(4)
    expect(out.height).toBe(4)
    expect(at(out, 0, 0)[0]).toBe(255)
    expect(at(out, 0, 1)).toEqual([8, 8, 8, 255])
  })

  it('maps a rotated display point back onto the source', () => {
    const source = displayToSource(1, 0, false, false, 90)
    expect(source.x).toBeCloseTo(0)
    expect(source.y).toBeCloseTo(0)
  })

  it('keeps a crop box inside the frame', () => {
    expect(clampCrop({ x: 0.9, y: -1, w: 0.8, h: 0.01 })).toEqual({ x: 0.2, y: 0, w: 0.8, h: 0.05 })
  })

  it('restores the uncleaned cutout when edge clean returns to 0', () => {
    const image = solid(16, 16, [255, 255, 255, 255])
    for (let y = 5; y < 11; y++) {
      for (let x = 5; x < 11; x++) {
        const i = (y * 16 + x) * 4
        image.data[i] = 180
        image.data[i + 1] = 20
        image.data[i + 2] = 20
      }
    }
    const speck = (8 * 16 + 4) * 4
    image.data[speck] = 180
    image.data[speck + 1] = 180
    image.data[speck + 2] = 180
    const base = applyArtEdit(image, { ...defaultArtEdit(), cutout: true, edgeClean: 0 }, 'crop')
    applyArtEdit(image, { ...defaultArtEdit(), cutout: true, edgeClean: 100 }, 'crop')
    const back = applyArtEdit(image, { ...defaultArtEdit(), cutout: true, edgeClean: 0 }, 'crop')
    expect(at(back, 4, 8)[3]).toBe(at(base, 4, 8)[3])
    expect(at(back, 8, 8)[3]).toBe(255)
  })

  it('builds a black and white preset without moving the crop', () => {
    const edit = applyEffect(defaultArtEdit(), 'bw')
    expect(edit.tone.saturation).toBe(0)
    expect(edit.crop).toEqual({ x: 0, y: 0, w: 1, h: 1 })
  })
})
