/** Printful's mockup generator saves product photos at this size. */
export const PRINTFUL_MOCKUP_PX = 1000

/**
 * Width and height from a JPEG header. Stops before the compressed scan so a
 * short prefix of the file is enough.
 */
export function jpegPixelSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  let index = 2
  while (index + 8 < bytes.length) {
    if (bytes[index] !== 0xff) {
      index += 1
      continue
    }
    const marker = bytes[index + 1]
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      index += 2
      continue
    }
    if (marker === 0xda) return null
    const length = (bytes[index + 2] << 8) | bytes[index + 3]
    if (length < 2) return null
    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (isStartOfFrame && index + 8 < bytes.length) {
      const height = (bytes[index + 5] << 8) | bytes[index + 6]
      const width = (bytes[index + 7] << 8) | bytes[index + 8]
      return width > 0 && height > 0 ? { width, height } : null
    }
    index += 2 + length
  }
  return null
}

/** Older mockup files were stored like any other upload, as 1000×1000 JPEGs. */
export function isLegacyPrintfulMockupJpeg(bytes: Uint8Array, filename: string): boolean {
  if (!filename.toLowerCase().endsWith('.jpg')) return false
  const size = jpegPixelSize(bytes)
  return size?.width === PRINTFUL_MOCKUP_PX && size.height === PRINTFUL_MOCKUP_PX
}
