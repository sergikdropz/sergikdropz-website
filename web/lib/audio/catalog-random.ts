/**
 * Catalog random: pick unused tracks from the selected folder, playlist,
 * or full library. Separate from queue-order shuffle.
 */

export const CATALOG_RANDOM_DEFAULT = true

export function readCatalogRandomSetting(): boolean {
  if (typeof window === 'undefined') return CATALOG_RANDOM_DEFAULT
  try {
    const raw = localStorage.getItem('musicPlayerSettings')
    if (!raw) return CATALOG_RANDOM_DEFAULT
    const parsed = JSON.parse(raw) as { catalogRandom?: unknown }
    return typeof parsed.catalogRandom === 'boolean'
      ? parsed.catalogRandom
      : CATALOG_RANDOM_DEFAULT
  } catch {
    return CATALOG_RANDOM_DEFAULT
  }
}

export function catalogScopeLabel(source?: {
  type: 'folder' | 'playlist' | null
  id: string | null
} | null): 'folder' | 'playlist' | 'catalog' {
  if (source?.type === 'folder' && source.id) return 'folder'
  if (source?.type === 'playlist' && source.id) return 'playlist'
  return 'catalog'
}

function shuffledCopy<T>(items: T[], random: () => number): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[next[i], next[j]] = [next[j]!, next[i]!]
  }
  return next
}

export function pickRandomUnusedTracks<T extends { id: string }>(
  pool: T[],
  excludeIds: Iterable<string>,
  count: number,
  options?: {
    allowReshuffle?: boolean
    keepExcluded?: Iterable<string>
    random?: () => number
  },
): T[] {
  const want = Math.max(0, Math.floor(count))
  if (want === 0 || pool.length === 0) return []

  const random = options?.random ?? Math.random
  const excluded = new Set(excludeIds)
  let unused = pool.filter((track) => !excluded.has(track.id))

  if (unused.length === 0 && options?.allowReshuffle) {
    const keep = new Set(options.keepExcluded ?? [])
    unused = pool.filter((track) => !keep.has(track.id))
  }

  if (unused.length === 0) return []
  return shuffledCopy(unused, random).slice(0, Math.min(want, unused.length))
}
