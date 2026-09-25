import type { BackgroundTile } from '@/lib/ep-cover-art'
import { normalizeReleaseKey } from '@/lib/ep-cover-art'
import { stripArtworkCacheBust, withArtworkCacheBust, isUploadedFolderArtwork } from '@/lib/catalog-sync/artwork'
import { subscribeCatalogSync } from '@/lib/catalog-sync/bus'
import { CATALOG_VERSION_EVENT } from '@/lib/catalog-sync/types'
import { resolveImageUrl } from '@/utils/resolveImageUrl'

type Listener = () => void

const tilesById = new Map<string, BackgroundTile>()
/** Paths that were replaced — must not re-enter the mosaic from static tiles. */
const suppressedPaths = new Set<string>()
const listeners = new Set<Listener>()
/** Stable empty snapshot for SSR / useSyncExternalStore getServerSnapshot. */
export const EMPTY_LIVE_MOSAIC_COVERS: BackgroundTile[] = []
/** Cached client snapshot — must be referentially stable between updates. */
let snapshot: BackgroundTile[] = EMPTY_LIVE_MOSAIC_COVERS
let hydrated = false
let hydratePromise: Promise<void> | null = null
let busAttached = false
let versionListenerAttached = false

function pathKey(src: string): string {
  return stripArtworkCacheBust(resolveImageUrl(src) || src)
}

function rebuildSnapshot() {
  snapshot = tilesById.size === 0 ? EMPTY_LIVE_MOSAIC_COVERS : Array.from(tilesById.values())
}

function notify() {
  rebuildSnapshot()
  for (const listener of listeners) {
    try {
      listener()
    } catch (err) {
      console.error('[live-mosaic-covers] listener failed', err)
    }
  }
}

function tileIdForFolder(folderId: string) {
  return `live-folder-${folderId}`
}

export function suppressMosaicPath(src: string | null | undefined) {
  const key = src ? pathKey(src) : ''
  if (!key) return
  suppressedPaths.add(key)
}

export function isMosaicPathSuppressed(src: string | null | undefined): boolean {
  const key = src ? pathKey(src) : ''
  return Boolean(key && suppressedPaths.has(key))
}

/** Test helper — clear in-memory mosaic state between unit cases. */
export function resetLiveMosaicCoversForTests() {
  tilesById.clear()
  suppressedPaths.clear()
  snapshot = EMPTY_LIVE_MOSAIC_COVERS
  hydrated = false
  hydratePromise = null
}

export function upsertLiveMosaicCover(tile: BackgroundTile) {
  const src = resolveImageUrl(tile.src)
  if (!src) return
  const base = pathKey(src)
  if (base) suppressedPaths.delete(base)

  const prev = tilesById.get(tile.id)
  if (prev) {
    const prevBase = pathKey(prev.src)
    if (prevBase && prevBase !== base) suppressMosaicPath(prevBase)
  }

  const next: BackgroundTile = {
    id: tile.id,
    src: withArtworkCacheBust(src),
    alt: tile.alt || prev?.alt || 'Album cover',
  }
  if (prev && stripArtworkCacheBust(prev.src) === stripArtworkCacheBust(next.src) && prev.alt === next.alt) {
    // Still refresh bust so mosaic images reload after overwrite
    if (prev.src === next.src) return
  }
  tilesById.set(tile.id, next)
  notify()
}

export function removeLiveMosaicCover(id: string) {
  const prev = tilesById.get(id)
  if (prev) suppressMosaicPath(prev.src)
  if (!tilesById.delete(id)) return
  notify()
}

/** Drop every mosaic tile that resolves to the same cover path. */
export function removeLiveMosaicCoverBySrc(src: string | null | undefined) {
  const key = src ? pathKey(src) : ''
  if (!key) return
  suppressMosaicPath(src)
  let changed = false
  for (const [id, tile] of Array.from(tilesById.entries())) {
    if (pathKey(tile.src) !== key) continue
    tilesById.delete(id)
    changed = true
  }
  if (changed) notify()
}

export function getLiveMosaicCovers(): BackgroundTile[] {
  return snapshot
}

export function subscribeLiveMosaicCovers(listener: Listener): () => void {
  ensureCatalogBus()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function ensureCatalogBus() {
  if (typeof window === 'undefined') return
  if (!busAttached) {
    busAttached = true
    subscribeCatalogSync((event) => {
      if (!Object.prototype.hasOwnProperty.call(event.patch, 'artwork')) return
      const folderId = event.folderId
      if (!folderId) return
      const artwork = event.patch.artwork
      const id = tileIdForFolder(folderId)
      if (!artwork) {
        removeLiveMosaicCover(id)
        return
      }
      const src = resolveImageUrl(String(artwork))
      if (!src) return
      // Prefer ingested folder uploads; also accept other local covers assigned to the folder.
      if (!isUploadedFolderArtwork(src) && !src.startsWith('/images/')) return
      upsertLiveMosaicCover({
        id,
        src,
        alt: event.patch.name ? `${event.patch.name} cover art` : 'Album cover art',
      })
    })
  }
  if (!versionListenerAttached) {
    versionListenerAttached = true
    window.addEventListener(CATALOG_VERSION_EVENT, () => {
      // Remote publishes may only bump version — re-fetch mosaic pool.
      void hydrateLiveMosaicCovers({ force: true })
    })
  }
}

function mosaicTileRank(tile: BackgroundTile, liveIds: Set<string>): number {
  if (liveIds.has(tile.id) || tile.id.startsWith('live-folder-') || tile.id.startsWith('folder-')) {
    return 3
  }
  if (isUploadedFolderArtwork(tile.src)) return 2
  if (tile.id.startsWith('fs-')) return 1
  return 0
}

/**
 * Merge static mosaic tiles with live ingested covers.
 * One tile per release label (and per path); live / uploaded folder art wins.
 * Suppressed (replaced) paths never re-enter from static sources.
 */
export function mergeMosaicTiles(
  staticTiles: BackgroundTile[],
  liveTiles: BackgroundTile[] = getLiveMosaicCovers(),
): BackgroundTile[] {
  const seenPath = new Set<string>()
  const byRelease = new Map<string, BackgroundTile>()
  const order: string[] = []
  const liveIds = new Set(liveTiles.map((t) => t.id))

  const add = (tile: BackgroundTile, fromLive: boolean) => {
    const key = pathKey(tile.src)
    if (!key) return
    if (!fromLive && suppressedPaths.has(key)) return
    if (seenPath.has(key)) return

    const releaseKey = normalizeReleaseKey(tile.alt || '')
    const mapKey = releaseKey || `src:${key}`
    const prev = byRelease.get(mapKey)
    if (prev) {
      const prevRank = mosaicTileRank(prev, liveIds)
      const nextRank = mosaicTileRank(tile, liveIds)
      if (nextRank > prevRank || (nextRank === prevRank && fromLive)) {
        seenPath.delete(pathKey(prev.src))
        seenPath.add(key)
        byRelease.set(mapKey, tile)
      }
      return
    }

    seenPath.add(key)
    byRelease.set(mapKey, tile)
    order.push(mapKey)
  }

  // Live first so newly ingested covers appear in the pool immediately
  for (const tile of liveTiles) add(tile, true)
  for (const tile of staticTiles) add(tile, false)
  return order.map((key) => byRelease.get(key)!).filter(Boolean)
}

export async function hydrateLiveMosaicCovers(opts?: { force?: boolean }): Promise<BackgroundTile[]> {
  if (typeof window === 'undefined') return getLiveMosaicCovers()
  ensureCatalogBus()
  if (hydratePromise) {
    await hydratePromise
  }
  if (hydrated && !opts?.force) return getLiveMosaicCovers()

  hydratePromise = (async () => {
    try {
      const res = await fetch('/api/music-library/mosaic-covers', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json().catch(() => ({}))
      const tiles = Array.from(
        new Map(
          (Array.isArray(data?.tiles) ? (data.tiles as BackgroundTile[]) : [])
            .filter((tile) => tile?.id && tile?.src)
            .map((tile) => [String(tile.id), tile] as const),
        ).values(),
      )

      const nextIds = new Set(tiles.map((tile) => String(tile.id)))
      let changed = false

      // Drop stale API-backed tiles (fs-*, folder-*). Keep live-folder-* unless
      // the same folder also arrived as folder-{id} from the API.
      for (const id of Array.from(tilesById.keys())) {
        if (id.startsWith('live-folder-')) {
          const folderId = id.slice('live-folder-'.length)
          if (nextIds.has(`folder-${folderId}`) || nextIds.has(id)) {
            // Will be refreshed below or already current
            continue
          }
          // Keep optimistic live tiles that the API has not yet indexed
          continue
        }
        if (!nextIds.has(id)) {
          const prev = tilesById.get(id)
          if (prev) suppressMosaicPath(prev.src)
          tilesById.delete(id)
          changed = true
        }
      }

      for (const tile of tiles) {
        const id = String(tile.id)
        const rawSrc = String(tile.src)
        const nextBase = pathKey(rawSrc)
        if (nextBase && suppressedPaths.has(nextBase)) {
          // Replaced path should not return from hydrate unless it is the
          // current cover for this folder id (explicit folder-* / live-folder-*).
          const isCurrentFolder =
            id.startsWith('folder-') || id.startsWith('live-folder-') || id.startsWith('fs-folder-')
          if (!isCurrentFolder) continue
          // Current folder cover is authoritative — unsuppress.
          suppressedPaths.delete(nextBase)
        }

        const prev = tilesById.get(id)
        const prevBase = prev ? pathKey(prev.src) : ''
        if (prev && prevBase && prevBase !== nextBase) suppressMosaicPath(prevBase)

        const src =
          prev && prevBase === nextBase
            ? prev.src
            : rawSrc.includes('?v=')
              ? resolveImageUrl(rawSrc) || rawSrc
              : withArtworkCacheBust(rawSrc)
        const next: BackgroundTile = {
          id,
          src,
          alt: String(tile.alt || 'Album cover art'),
        }
        if (!prev || prev.src !== next.src || prev.alt !== next.alt) {
          tilesById.set(next.id, next)
          changed = true
        }

        // Prefer folder-* over live-folder-* duplicate for the same collection
        if (id.startsWith('folder-')) {
          const liveId = `live-folder-${id.slice('folder-'.length)}`
          if (tilesById.has(liveId)) {
            tilesById.delete(liveId)
            changed = true
          }
        }
      }

      hydrated = true
      if (changed) notify()
    } catch {
      /* non-fatal — static mosaic still works */
    } finally {
      hydratePromise = null
    }
  })()
  await hydratePromise
  return getLiveMosaicCovers()
}
