/**
 * Client-side cover prep before POST /api/audio/artwork.
 * Vercel rejects request bodies above ~4.5MB (413) before our route runs.
 */

/** Target max file bytes after client re-encode (multipart + metadata headroom). */
export const ARTWORK_UPLOAD_CLIENT_MAX_BYTES = 3_800_000

/** Longest edge when re-encoding oversized phone photos in the browser. */
export const ARTWORK_UPLOAD_CLIENT_MAX_EDGE_PX = 2400

const JPEG_MIME = 'image/jpeg'

function scaledDimensions(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= maxEdge) return { width, height }
  const scale = maxEdge / longest
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

async function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode cover JPEG'))),
      JPEG_MIME,
      quality,
    )
  })
}

/**
 * Downscale/re-encode large rasters so uploads stay under the serverless body limit.
 * Returns the original file when already small enough.
 */
export async function prepareCoverArtworkUploadFile(file: File): Promise<File> {
  if (typeof window === 'undefined') return file
  if (file.size <= ARTWORK_UPLOAD_CLIENT_MAX_BYTES) return file

  const bitmap = await createImageBitmap(file)
  const { width, height } = scaledDimensions(
    bitmap.width,
    bitmap.height,
    ARTWORK_UPLOAD_CLIENT_MAX_EDGE_PX,
  )

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    return file
  }
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  let quality = 0.9
  let blob = await canvasToJpegBlob(canvas, quality)
  while (blob.size > ARTWORK_UPLOAD_CLIENT_MAX_BYTES && quality > 0.5) {
    quality -= 0.08
    blob = await canvasToJpegBlob(canvas, quality)
  }

  const baseName = (file.name || 'cover').replace(/\.[^.]+$/, '') || 'cover'
  return new File([blob], `${baseName}.jpg`, { type: JPEG_MIME, lastModified: Date.now() })
}

export async function buildArtworkUploadFormData(
  file: File,
  fields: Record<string, string | null | undefined>,
): Promise<FormData> {
  const prepared = await prepareCoverArtworkUploadFile(file)
  const formData = new FormData()
  formData.append('file', prepared, prepared.name || file.name || 'cover.jpg')
  for (const [key, value] of Object.entries(fields)) {
    if (value != null && String(value).trim()) formData.append(key, String(value))
  }
  return formData
}

export function artworkUploadHttpErrorMessage(status: number, serverMessage?: string): string {
  if (status === 413) {
    return 'Cover image is too large for upload. Use a JPG under 4MB or export a smaller size.'
  }
  return serverMessage || 'Artwork upload failed'
}
