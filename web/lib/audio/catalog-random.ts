/**
 * Catalog random: pick unused tracks from the selected folder, playlist,
 * or full library. Separate from queue-order shuffle.
 *
 * Behavior by scope when Random is on:
 * - folder / crate / EP → play that collection in release order, then jump to a
 *   random different crate/EP (not the next sibling on the shelf)
 * - playlist / full catalog → least-repetition random with a no-repeat window
 *
 * Recently played tracks stay out of rotation for
 * {@link CATALOG_RANDOM_NO_REPEAT_WINDOW} picks before they can return.
 */

export const CATALOG_RANDOM_DEFAULT = true

/** Minimum gap (in played tracks) before the same id can be chosen again. */
export const CATALOG_RANDOM_NO_REPEAT_WINDOW = 35

/** Prefer not revisiting the same crate/EP for this many release jumps. */
export const CATALOG_RANDOM_RELEASE_WINDOW = 12

/** Folder types treated as playable releases (crates + EPs). */
export const CATALOG_RELEASE_FOLDER_TYPES = new Set(['album', 'ep'])

export type CatalogReleaseFolder = {
  id: string
  type: string
  name?: string
  parentId?: string | null
  hidden?: boolean
  children?: CatalogReleaseFolder[]
}

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

/** True when Random should exhaust the current folder in order, then jump crates/EPs. */
export function isOrderedReleaseRandomScope(source?: {
  type: 'folder' | 'playlist' | null
  id: string | null
} | null): boolean {
  return catalogScopeLabel(source) === 'folder'
}

function shuffledCopy<T>(items: T[], random: () => number): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[next[i], next[j]] = [next[j]!, next[i]!]
  }
  return next
}

/** Append `id` to a recent-play list, newest last, capped to `windowSize`. */
export function pushRecentPlayedId(
  recent: readonly string[],
  id: string,
  windowSize: number = CATALOG_RANDOM_NO_REPEAT_WINDOW,
): string[] {
  if (!id || windowSize <= 0) return [...recent]
  const next = recent.filter((existing) => existing !== id)
  next.push(id)
  const cap = Math.max(1, Math.floor(windowSize))
  return next.length > cap ? next.slice(next.length - cap) : next
}

/** Session-wide recent plays so GlobalMusicPlayer and MusicPlayer share the window. */
let sessionRecentPlayedIds: string[] = []
let sessionRecentReleaseIds: string[] = []

export function getRecentPlayedTrackIds(): readonly string[] {
  return sessionRecentPlayedIds
}

export function rememberPlayedTrackId(
  id: string,
  windowSize: number = CATALOG_RANDOM_NO_REPEAT_WINDOW,
): void {
  if (!id) return
  sessionRecentPlayedIds = pushRecentPlayedId(sessionRecentPlayedIds, id, windowSize)
}

export function clearRecentPlayedTrackIds(): void {
  sessionRecentPlayedIds = []
}

export function getRecentPlayedReleaseIds(): readonly string[] {
  return sessionRecentReleaseIds
}

export function rememberPlayedReleaseId(
  id: string,
  windowSize: number = CATALOG_RANDOM_RELEASE_WINDOW,
): void {
  if (!id) return
  sessionRecentReleaseIds = pushRecentPlayedId(sessionRecentReleaseIds, id, windowSize)
}

export function clearRecentPlayedReleaseIds(): void {
  sessionRecentReleaseIds = []
}

/**
 * Build the exclude set for a pick: hard blocks (queue / keep) stay fixed;
 * the recent no-repeat window softens only when the pool is too small.
 * Oldest recent ids drop out of the block list first.
 */
export function resolveNoRepeatExcludeIds(params: {
  poolSize: number
  excludeIds: Iterable<string>
  recentIds?: Iterable<string>
  keepExcluded?: Iterable<string>
  count: number
  windowSize?: number
}): Set<string> {
  const want = Math.max(0, Math.floor(params.count))
  const hard = new Set<string>([
    ...(params.keepExcluded ?? []),
    ...params.excludeIds,
  ])
  const recentOrdered = [...(params.recentIds ?? [])].filter(
    (id) => id && !hard.has(id),
  )
  const windowSize = Math.max(
    0,
    Math.floor(params.windowSize ?? CATALOG_RANDOM_NO_REPEAT_WINDOW),
  )
  const poolSize = Math.max(0, params.poolSize)
  // Leave enough room to satisfy `count` after hard blocks.
  const maxRecentBlock = Math.max(0, poolSize - hard.size - want)
  const targetRecent = Math.min(windowSize, maxRecentBlock, recentOrdered.length)
  const next = new Set(hard)
  const newestBlocked = recentOrdered.slice(
    Math.max(0, recentOrdered.length - targetRecent),
  )
  for (const id of newestBlocked) next.add(id)
  return next
}

export function pickRandomUnusedTracks<T extends { id: string }>(
  pool: T[],
  excludeIds: Iterable<string>,
  count: number,
  options?: {
    allowReshuffle?: boolean
    keepExcluded?: Iterable<string>
    recentIds?: Iterable<string>
    noRepeatWindow?: number
    random?: () => number
  },
): T[] {
  const want = Math.max(0, Math.floor(count))
  if (want === 0 || pool.length === 0) return []

  const random = options?.random ?? Math.random
  const keep = new Set(options?.keepExcluded ?? [])
  const recentIds = options?.recentIds ?? getRecentPlayedTrackIds()
  const windowSize = options?.noRepeatWindow ?? CATALOG_RANDOM_NO_REPEAT_WINDOW

  const blocked = resolveNoRepeatExcludeIds({
    poolSize: pool.length,
    excludeIds,
    recentIds,
    keepExcluded: keep,
    count: want,
    windowSize,
  })
  let unused = pool.filter((track) => !blocked.has(track.id))

  if (unused.length === 0 && options?.allowReshuffle) {
    // Last resort: only hard-keep (current / explicitly protected) stay out.
    unused = pool.filter((track) => !keep.has(track.id))
    if (unused.length === 0) return []
    // Prefer the least-recently played among the fallback set.
    const recentIndex = new Map<string, number>()
    ;[...recentIds].forEach((id, index) => recentIndex.set(id, index))
    unused = [...unused].sort((a, b) => {
      const ai = recentIndex.has(a.id) ? recentIndex.get(a.id)! : -1
      const bi = recentIndex.has(b.id) ? recentIndex.get(b.id)! : -1
      return ai - bi
    })
    return unused.slice(0, Math.min(want, unused.length))
  }

  if (unused.length === 0) return []
  return shuffledCopy(unused, random).slice(0, Math.min(want, unused.length))
}

type OrderedTrackFields = {
  id: string
  display_order?: number | null
  track_number?: number | null
  title?: string | null
}

function releaseOrderKey(track: OrderedTrackFields): [number, number, string] {
  const display =
    typeof track.display_order === 'number' && Number.isFinite(track.display_order)
      ? track.display_order
      : Number.POSITIVE_INFINITY
  const number =
    typeof track.track_number === 'number' && Number.isFinite(track.track_number)
      ? track.track_number
      : Number.POSITIVE_INFINITY
  return [display, number, String(track.title || track.id)]
}

/** Stable crate/EP listening order: display_order → track_number → title. */
export function sortTracksInReleaseOrder<T extends OrderedTrackFields>(tracks: T[]): T[] {
  return [...tracks].sort((a, b) => {
    const [ad, an, at] = releaseOrderKey(a)
    const [bd, bn, bt] = releaseOrderKey(b)
    if (ad !== bd) return ad - bd
    if (an !== bn) return an - bn
    return at.localeCompare(bt)
  })
}

/**
 * Exhaust a release in order with least repetition: prefer tracks after the
 * current one, then wrap to earlier unplayed tracks in the same collection.
 */
export function pickNextOrderedTracks<T extends OrderedTrackFields>(
  pool: T[],
  excludeIds: Iterable<string>,
  count: number,
  options?: { preferAfterId?: string | null },
): T[] {
  const want = Math.max(0, Math.floor(count))
  if (want === 0 || pool.length === 0) return []

  const ordered = sortTracksInReleaseOrder(pool)
  const excluded = new Set(excludeIds)
  const unused = ordered.filter((track) => !excluded.has(track.id))
  if (unused.length === 0) return []

  const preferAfterId = options?.preferAfterId
  if (preferAfterId) {
    const idx = ordered.findIndex((track) => track.id === preferAfterId)
    if (idx >= 0) {
      const afterIds = new Set(ordered.slice(idx + 1).map((track) => track.id))
      const after = unused.filter((track) => afterIds.has(track.id))
      const before = unused.filter((track) => !afterIds.has(track.id))
      return [...after, ...before].slice(0, Math.min(want, unused.length))
    }
  }

  return unused.slice(0, Math.min(want, unused.length))
}

export function collectReleaseFoldersFromTree(
  folders: CatalogReleaseFolder[] | null | undefined,
): CatalogReleaseFolder[] {
  const out: CatalogReleaseFolder[] = []
  const seen = new Set<string>()

  const walk = (nodes: CatalogReleaseFolder[] | undefined) => {
    for (const folder of nodes || []) {
      const type = String(folder?.type || '')
      if (
        folder?.id &&
        CATALOG_RELEASE_FOLDER_TYPES.has(type) &&
        !folder.hidden &&
        !seen.has(folder.id)
      ) {
        seen.add(folder.id)
        out.push({
          id: folder.id,
          type,
          name: folder.name,
          parentId: folder.parentId ?? null,
          hidden: false,
        })
      }
      if (folder?.children?.length) walk(folder.children)
    }
  }

  walk(folders || [])
  return out
}

/**
 * Pick a fresh crate/EP — never the sequential “next on the shelf”.
 * Honors a recent-release window when enough alternatives exist.
 */
export function pickRandomReleaseFolder(
  releases: CatalogReleaseFolder[],
  options?: {
    excludeIds?: Iterable<string>
    recentIds?: Iterable<string>
    keepExcluded?: Iterable<string>
    random?: () => number
    noRepeatWindow?: number
  },
): CatalogReleaseFolder | null {
  if (!releases.length) return null
  const random = options?.random ?? Math.random
  const hard = new Set<string>([
    ...(options?.keepExcluded ?? []),
    ...(options?.excludeIds ?? []),
  ])
  const candidates = releases.filter((folder) => folder.id && !hard.has(folder.id))
  if (candidates.length === 0) return null

  const recentIds = options?.recentIds ?? getRecentPlayedReleaseIds()
  const blocked = resolveNoRepeatExcludeIds({
    poolSize: candidates.length,
    excludeIds: [],
    recentIds,
    keepExcluded: [],
    count: 1,
    windowSize: options?.noRepeatWindow ?? CATALOG_RANDOM_RELEASE_WINDOW,
  })
  const fresh = candidates.filter((folder) => !blocked.has(folder.id))
  const pool = fresh.length > 0 ? fresh : candidates
  return shuffledCopy(pool, random)[0] ?? null
}
