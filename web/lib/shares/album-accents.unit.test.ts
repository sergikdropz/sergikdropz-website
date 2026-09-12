import { describe, expect, it } from 'vitest'
import { FALLBACK_ACCENTS, paletteFromImageData, rgbToCss } from './album-accents'

function solidImageData(r: number, g: number, b: number, size = 8): ImageData {
  const data = new Uint8ClampedArray(size * size * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
    data[i + 3] = 255
  }
  return { data, width: size, height: size, colorSpace: 'srgb' } as ImageData
}

describe('album accents', () => {
  it('formats rgba css', () => {
    expect(rgbToCss({ r: 10, g: 20, b: 30 })).toBe('rgb(10, 20, 30)')
    expect(rgbToCss({ r: 10, g: 20, b: 30 }, 0.5)).toBe('rgba(10, 20, 30, 0.5)')
  })

  it('extracts a vivid midtone as primary', () => {
    const palette = paletteFromImageData(solidImageData(180, 40, 60))
    expect(palette).not.toBeNull()
    expect(palette!.primary.r).toBeGreaterThan(150)
    expect(palette!.css.primary).toContain('rgb(')
  })

  it('ignores near-black images', () => {
    expect(paletteFromImageData(solidImageData(2, 2, 2))).toBeNull()
  })

  it('exposes a fallback palette', () => {
    expect(FALLBACK_ACCENTS.css.muted).toMatch(/rgb/)
  })
})
