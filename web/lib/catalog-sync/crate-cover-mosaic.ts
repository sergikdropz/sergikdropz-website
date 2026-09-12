import { resolveImageUrl } from '@/utils/resolveImageUrl'
import { stripArtworkCacheBust } from './artwork'

export const CRATE_MOSAIC_SIZE = 9

function hashString(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function mulberry32(seed: number): () => number {
  let next = seed || 1
  return () => {
    next |= 0
    next = (next + 0x6d2b79f5) | 0
    let t = Math.imul(next ^ (next >>> 15), 1 | next)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function coverDedupeKey(url: string): string {
  const path = stripArtworkCacheBust(url)
  let file = path
  try {
    file = decodeURIComponent(path)
  } catch {
    /* keep raw */
  }
  file = (file.split('/').pop() || file).toLowerCase()
  return file.replace(/[^a-z0-9.]+/g, '')
}

function shuffleInPlace<T>(list: T[], seed: string): T[] {
  const rand = mulberry32(hashString(seed))
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1))
    const current = list[i]
    list[i] = list[j]
    list[j] = current
  }
  return list
}

/** Unique, resolved library covers for crate mosaics. */
export function collectLibraryCoverPool(urls: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of urls) {
    if (!raw?.trim() || raw.startsWith('blob:')) continue
    const url = stripArtworkCacheBust(resolveImageUrl(raw) || raw)
    if (!url) continue
    const key = coverDedupeKey(url)
    if (!key || seen.has(key) || seen.has(url)) continue
    seen.add(key)
    seen.add(url)
    out.push(url)
  }
  return out
}

/** Unique covers for one crate tile. Fills up to 9 without repeating inside that tile. */
export function crateMosaicCovers(
  pool: string[],
  crateId: string,
  size = CRATE_MOSAIC_SIZE,
): string[] {
  if (!pool.length || size <= 0) return []
  const unique = collectLibraryCoverPool(pool)
  return shuffleInPlace([...unique], crateId).slice(0, Math.min(size, unique.length))
}

/** Each crate tile gets its own shuffle of the full pool; uniqueness is per tile only. */
export function assignCrateMosaicCovers(
  pool: string[],
  crateIds: string[],
  size = CRATE_MOSAIC_SIZE,
): Record<string, string[]> {
  const assigned: Record<string, string[]> = {}
  for (const id of crateIds) assigned[id] = crateMosaicCovers(pool, id, size)
  return assigned
}
