import { mkdir, readdir, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { normalizeCoverArtworkBuffer } from '@/lib/media/normalize-cover'

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

/** Drop older `folder-id.png` (etc.) when a new extension is uploaded for the same cover id. */
async function removeSiblingArtworkFiles(dir: string, artworkId: string, keepFile: string): Promise<void> {
  let entries: string[] = []
  try {
    entries = await readdir(dir)
  } catch {
    return
  }
  const prefix = `${artworkId}.`
  await Promise.all(
    entries
      .filter((name) => name.startsWith(prefix) && name !== keepFile)
      .map((name) => unlink(join(dir, name)).catch(() => undefined)),
  )
}

export type SaveLocalArtworkOptions = {
  /** When false, write the buffer as-is (batch tooling / tests). Default true. */
  normalize?: boolean
}

/**
 * Save cover art under public/ so Next can serve it without a Storage gateway.
 * By default PNG/WebP/etc. are converted to high-quality JPEG (see normalize-cover).
 */
export async function saveLocalArtworkFile(
  artworkId: string,
  fileName: string,
  mimeType: string,
  buffer: Buffer,
  options?: SaveLocalArtworkOptions,
): Promise<string> {
  // Reject HEIC early even when we normalize to jpg.
  artworkExt(fileName, mimeType)

  const id = safeArtworkId(artworkId)
  const shouldNormalize = options?.normalize !== false
  let outBuffer = buffer
  let ext = 'jpg'
  if (shouldNormalize) {
    const normalized = await normalizeCoverArtworkBuffer(buffer)
    outBuffer = normalized.buffer
    ext = normalized.ext
  } else {
    ext = artworkExt(fileName, mimeType)
  }

  const filename = `${id}.${ext}`
  const dir = join(process.cwd(), 'public', 'images', 'audio', 'artwork')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, filename), outBuffer)
  await removeSiblingArtworkFiles(dir, id, filename)
  return `/images/audio/artwork/${filename}`
}

/** Remove all local `artworkId.*` cover files. Returns deleted public URLs. */
export async function deleteLocalArtworkFiles(artworkId: string): Promise<string[]> {
  const id = safeArtworkId(artworkId)
  const dir = join(process.cwd(), 'public', 'images', 'audio', 'artwork')
  let entries: string[] = []
  try {
    entries = await readdir(dir)
  } catch {
    return []
  }
  const prefix = `${id}.`
  const deleted: string[] = []
  await Promise.all(
    entries
      .filter((name) => name.startsWith(prefix))
      .map(async (name) => {
        try {
          await unlink(join(dir, name))
          deleted.push(`/images/audio/artwork/${name}`)
        } catch {
          /* ignore missing */
        }
      }),
  )
  return deleted
}

export function isHomeApiPlainTextError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '')
  return message.includes('sergik-home-api') || message.includes("Unexpected token 's'")
}
