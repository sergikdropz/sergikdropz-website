import { readdir, readFile, access } from 'node:fs/promises'
import path from 'node:path'
import galleryData from '@/data/gallery.json'
import {
  collectEpCoverTiles,
  collectReleaseCoverTiles,
  type BackgroundTile,
} from '@/lib/ep-cover-art'
import { buildMosaicGrid } from '@/lib/background-mosaic'
import { resolveImageUrl } from '@/utils/resolveImageUrl'

const IMAGE_EXT = /\.(avif|gif|jpe?g|png|webp)$/i
/** Skip huge masters — Satori + OG generation time out or OOM on multi‑MB tiles. */
const MAX_TILE_BYTES = 700_000

export type OgMosaicLoadedTile = {
  id: string
  src: string
  dataUrl: string
}

function mimeForPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.avif') return 'image/avif'
  return 'image/jpeg'
}

function toDataUrl(buf: Buffer, filePath: string): string {
  return `data:${mimeForPath(filePath)};base64,${buf.toString('base64')}`
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

/** Unique gallery photos + music/release covers (+ on-disk artwork folder). */
export function collectOgMosaicSources(): BackgroundTile[] {
  const seen = new Set<string>()
  const out: BackgroundTile[] = []

  const push = (id: string, raw: string | null | undefined, alt: string) => {
    if (!raw) return
    const src = resolveImageUrl(raw).split('?')[0]
    if (!src || seen.has(src)) return
    seen.add(src)
    out.push({ id, src, alt })
  }

  for (const img of galleryData.images) {
    push(`gallery-${img.id}`, img.src, img.alt || 'SERGIK gallery')
  }

  for (const tile of collectReleaseCoverTiles()) {
    push(`release-${tile.id}`, tile.src, tile.alt)
  }

  for (const tile of collectEpCoverTiles()) {
    push(`ep-${tile.id}`, tile.src, tile.alt)
  }

  return out
}

async function collectDiskArtworkTiles(): Promise<BackgroundTile[]> {
  const dir = path.join(process.cwd(), 'public', 'images', 'audio', 'artwork')
  try {
    const files = await readdir(dir)
    return files
      .filter((file) => IMAGE_EXT.test(file))
      .map((file) => ({
        id: `fs-${file.replace(/\.[^.]+$/, '')}`,
        src: `/images/audio/artwork/${file}`,
        alt: 'Album cover art',
      }))
  } catch {
    return []
  }
}

async function loadLocalTile(tile: BackgroundTile): Promise<OgMosaicLoadedTile | null> {
  if (!tile.src.startsWith('/')) return null
  const abs = path.join(process.cwd(), 'public', tile.src.replace(/^\//, ''))
  if (!(await fileExists(abs))) return null
  try {
    const buf = await readFile(abs)
    if (buf.byteLength === 0 || buf.byteLength > MAX_TILE_BYTES) return null
    return {
      id: tile.id,
      src: tile.src,
      dataUrl: toDataUrl(buf, abs),
    }
  } catch {
    return null
  }
}

async function loadRemoteTile(origin: string, tile: BackgroundTile): Promise<OgMosaicLoadedTile | null> {
  if (tile.src.startsWith('/')) return null
  try {
    const url = tile.src.startsWith('http') ? tile.src : new URL(tile.src, origin).toString()
    const res = await fetch(url, {
      headers: { Accept: 'image/*,*/*;q=0.8' },
      next: { revalidate: 86400 },
    })
    if (!res.ok) return null
    const type = res.headers.get('content-type') || 'image/jpeg'
    if (!type.startsWith('image/')) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength === 0 || buf.byteLength > MAX_TILE_BYTES) return null
    return {
      id: tile.id,
      src: tile.src,
      dataUrl: `data:${type};base64,${buf.toString('base64')}`,
    }
  } catch {
    return null
  }
}

/**
 * Load as many gallery + cover tiles as practical for a dense OG collage.
 * Prefers local `/images/...` (fast, reliable), then remote covers.
 */
export async function loadOgMosaicTiles(options?: {
  origin?: string
  /** Target unique images to load (default 36). */
  limit?: number
}): Promise<OgMosaicLoadedTile[]> {
  const limit = options?.limit ?? 36
  const origin = options?.origin || 'http://localhost:3001'

  const catalog = collectOgMosaicSources()
  const disk = await collectDiskArtworkTiles()
  const seen = new Set(catalog.map((t) => t.src.split('?')[0]))
  const pool: BackgroundTile[] = [...catalog]
  for (const tile of disk) {
    const key = tile.src.split('?')[0]
    if (seen.has(key)) continue
    seen.add(key)
    pool.push(tile)
  }

  const local = pool.filter((t) => t.src.startsWith('/'))
  const remote = pool.filter((t) => !t.src.startsWith('/'))

  const loaded: OgMosaicLoadedTile[] = []

  // Parallel local reads first (majority of the collage)
  const localBatch = await Promise.all(local.map((tile) => loadLocalTile(tile)))
  for (const tile of localBatch) {
    if (!tile) continue
    loaded.push(tile)
    if (loaded.length >= limit) return loaded
  }

  const remaining = limit - loaded.length
  if (remaining <= 0) return loaded

  const remoteBatch = await Promise.all(
    remote.slice(0, remaining * 2).map((tile) => loadRemoteTile(origin, tile)),
  )
  for (const tile of remoteBatch) {
    if (!tile) continue
    loaded.push(tile)
    if (loaded.length >= limit) break
  }

  return loaded
}

/** Dense OG grid: 8×4 fits 1200×630 with collage density close to the live site mosaic. */
export const OG_MOSAIC_COLS = 8
export const OG_MOSAIC_ROWS = 4
export const OG_MOSAIC_CELLS = OG_MOSAIC_COLS * OG_MOSAIC_ROWS

export function buildOgMosaicIndices(poolSize: number): number[] {
  if (poolSize <= 0) return []
  return buildMosaicGrid(poolSize, OG_MOSAIC_CELLS, OG_MOSAIC_COLS)
}
