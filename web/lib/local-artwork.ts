import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'

const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'])

function artworkExt(fileName: string, mimeType: string): string {
  const fromName = (fileName.split('.').pop() || '').toLowerCase()
  if (fromName === 'heic' || fromName === 'heif' || mimeType.includes('heic') || mimeType.includes('heif')) {
    throw new Error('HEIC/HEIF photos can’t be used as cover art. Export as JPG or PNG and try again.')
  }
  if (ALLOWED_EXT.has(fromName)) return fromName === 'jpeg' ? 'jpg' : fromName
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/webp') return 'webp'
  if (mimeType === 'image/gif') return 'gif'
  if (mimeType === 'image/avif') return 'avif'
  return 'jpg'
}

function safeArtworkId(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 160) || 'artwork'
}

/** Save cover art under public/ so Next can serve it without a Storage gateway. */
export async function saveLocalArtworkFile(
  artworkId: string,
  fileName: string,
  mimeType: string,
  buffer: Buffer,
): Promise<string> {
  const ext = artworkExt(fileName, mimeType)
  const filename = `${safeArtworkId(artworkId)}.${ext}`
  const dir = join(process.cwd(), 'public', 'images', 'audio', 'artwork')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, filename), buffer)
  return `/images/audio/artwork/${filename}`
}

export function isHomeApiPlainTextError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '')
  return message.includes('sergik-home-api') || message.includes("Unexpected token 's'")
}
