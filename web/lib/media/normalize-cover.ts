/**
 * Normalize folder/EP cover masters for web delivery.
 * PNG (and other rasters) become high-quality JPEG; resolution is preserved
 * up to COVER_MASTER_MAX_PX (no upscaling).
 */

import sharp from 'sharp'

/** Longest edge cap — originals at/under this keep full resolution. */
export const COVER_MASTER_MAX_PX = 4000
/** High-quality JPEG for lightbox / EP hero / crate thumbs via next/image. */
export const COVER_MASTER_JPEG_QUALITY = 92

export type NormalizedCover = {
  buffer: Buffer
  ext: 'jpg'
  mimeType: 'image/jpeg'
  width: number
  height: number
}

/**
 * Re-encode any raster cover to a high-quality JPEG master.
 * - PNG/WebP/GIF/AVIF → JPEG (PNG always converts)
 * - Keeps resolution up to COVER_MASTER_MAX_PX (withoutEnlargement)
 * - Animated GIF/WebP: first frame only. HEIC should be rejected before calling.
 */
export async function normalizeCoverArtworkBuffer(input: Buffer): Promise<NormalizedCover> {
  if (!input?.length) throw new Error('Empty cover artwork buffer')

  const pipeline = sharp(input, { failOn: 'none', animated: false }).rotate()
  const meta = await pipeline.metadata()
  const resized = pipeline.resize(COVER_MASTER_MAX_PX, COVER_MASTER_MAX_PX, {
    fit: 'inside',
    withoutEnlargement: true,
  })

  const buffer = await resized
    .jpeg({
      quality: COVER_MASTER_JPEG_QUALITY,
      mozjpeg: true,
      // Full chroma — cover art (gradients, type) looks soft with 4:2:0.
      chromaSubsampling: '4:4:4',
    })
    .toBuffer()

  const outMeta = await sharp(buffer).metadata()
  return {
    buffer,
    ext: 'jpg',
    mimeType: 'image/jpeg',
    width: outMeta.width || meta.width || COVER_MASTER_MAX_PX,
    height: outMeta.height || meta.height || COVER_MASTER_MAX_PX,
  }
}
