import { describe, expect, it } from 'vitest'
import { isLegacyPrintfulMockupJpeg, jpegPixelSize } from './printful-mockup-jpeg'

function jpegWithSize(width: number, height: number): Buffer {
  const sof = Buffer.from([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
  ])
  return sof
}

describe('legacy printful mockup jpegs', () => {
  it('reads size from the frame header', () => {
    expect(jpegPixelSize(jpegWithSize(1000, 1000))).toEqual({ width: 1000, height: 1000 })
    expect(jpegPixelSize(jpegWithSize(2857, 2797))).toEqual({ width: 2857, height: 2797 })
  })

  it('treats only 1000×1000 jpegs as leftover printful photos', () => {
    expect(isLegacyPrintfulMockupJpeg(jpegWithSize(1000, 1000), 'photo.jpg')).toBe(true)
    expect(isLegacyPrintfulMockupJpeg(jpegWithSize(2857, 2797), 'photo.jpg')).toBe(false)
    expect(isLegacyPrintfulMockupJpeg(jpegWithSize(1000, 1000), 'art.png')).toBe(false)
  })
})
