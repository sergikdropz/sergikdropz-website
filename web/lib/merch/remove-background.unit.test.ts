import { describe, it, expect } from 'vitest'
import {
  colorDistance,
  estimateBackgroundColor,
  removeSolidBackground,
  type ImageDataLike,
} from './remove-background'

/** Build an RGBA image: white background with a solid red square in the middle. */
function makeImage(size: number, inset: number): ImageDataLike {
  const data = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const inSquare = x >= inset && x < size - inset && y >= inset && y < size - inset
      if (inSquare) {
        data[i] = 220
        data[i + 1] = 20
        data[i + 2] = 20
      } else {
        data[i] = 255
        data[i + 1] = 255
        data[i + 2] = 255
      }
      data[i + 3] = 255
    }
  }
  return { data, width: size, height: size }
}

const alphaAt = (img: ImageDataLike, x: number, y: number) => img.data[(y * img.width + x) * 4 + 3]

describe('remove-background', () => {
  it('measures larger distance for dissimilar colours', () => {
    expect(colorDistance(255, 255, 255, 255, 255, 255)).toBe(0)
    expect(colorDistance(255, 255, 255, 0, 0, 0)).toBeGreaterThan(
      colorDistance(255, 255, 255, 240, 240, 240),
    )
  })

  it('samples the background colour from the corners', () => {
    const img = makeImage(20, 5)
    expect(estimateBackgroundColor(img)).toEqual([255, 255, 255])
  })

  it('clears the solid background but keeps the subject opaque', () => {
    const size = 20
    const inset = 6
    const img = makeImage(size, inset)
    const out = removeSolidBackground(img, { tolerance: 32, feather: 8 })

    // Corners (background) become transparent.
    expect(alphaAt(out, 0, 0)).toBe(0)
    expect(alphaAt(out, size - 1, size - 1)).toBe(0)

    // Centre (subject) stays fully opaque.
    const mid = Math.floor(size / 2)
    expect(alphaAt(out, mid, mid)).toBe(255)
  })

  it('does not mutate the input image', () => {
    const img = makeImage(12, 3)
    const before = img.data[3]
    removeSolidBackground(img)
    expect(img.data[3]).toBe(before)
  })

  it('respects an explicit background colour override', () => {
    // All-red image; treat red as the background → everything clears.
    const size = 8
    const data = new Uint8ClampedArray(size * size * 4)
    for (let i = 0; i < size * size; i++) {
      data[i * 4] = 200
      data[i * 4 + 1] = 0
      data[i * 4 + 2] = 0
      data[i * 4 + 3] = 255
    }
    const out = removeSolidBackground({ data, width: size, height: size }, {
      backgroundColor: [200, 0, 0],
      tolerance: 10,
    })
    expect(alphaAt(out, 4, 4)).toBe(0)
  })
})
