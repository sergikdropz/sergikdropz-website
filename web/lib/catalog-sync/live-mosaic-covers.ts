import type { BackgroundTile } from '@/lib/ep-cover-art'
import { stripArtworkCacheBust, withArtworkCacheBust, isUploadedFolderArtwork } from '@/lib/catalog-sync/artwork'
import { subscribeCatalogSync } from '@/lib/catalog-sync/bus'
import { CATALOG_VERSION_EVENT } from '@/lib/catalog-sync/types'
import { resolveImageUrl } from '@/utils/resolveImageUrl'

type Listener = () => void

const tilesById = new Map<string, BackgroundTile>()
const listeners = new Set<Listener>()
/** Stable empty snapshot for SSR / useSyncExternalStore getServerSnapshot. */
export const EMPTY_LIVE_MOSAIC_COVERS: BackgroundTile[] = []
/** Cached client snapshot — must be referentially stable between updates. */
let snapshot: BackgroundTile[] = EMPTY_LIVE_MOSAIC_COVERS
let hydrated = false
let hydratePromise: Promise<void> | null = null
let busAttached = false
let versionListenerAttached = false

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

export function upsertLiveMosaicCover(tile: BackgroundTile) {
  const src = resolveImageUrl(tile.src)
  if (!src) return
  const prev = tilesById.get(tile.id)
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
  if (!tilesById.delete(id)) return
  notify()
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

/** Merge static mosaic tiles with live ingested covers (live wins on same resolved path). */
export function mergeMosaicTiles(staticTiles: BackgroundTile[], liveTiles: BackgroundTile[] = getLiveMosaicCovers()): BackgroundTile[] {
  const seen = new Set<string>()
  const out: BackgroundTile[] = []
  const add = (tile: BackgroundTile) => {
    const key = stripArtworkCacheBust(resolveImageUrl(tile.src) || tile.src)
    if (!key || seen.has(key)) return
    seen.add(key)
    out.push(tile)
  }
  // Live first so newly ingested covers appear in the pool immediately
  for (const tile of liveTiles) add(tile)
  for (const tile of staticTiles) add(tile)
  return out
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
      const tiles = Array.isArray(data?.tiles) ? (data.tiles as BackgroundTile[]) : []
      let changed = false
      for (const tile of tiles) {
        if (!tile?.id || !tile?.src) continue
        const rawSrc = String(tile.src)
        const prev = tilesById.get(String(tile.id))
        const prevBase = prev ? stripArtworkCacheBust(prev.src) : ''
        const nextBase = stripArtworkCacheBust(resolveImageUrl(rawSrc) || rawSrc)
        // Keep API cache-bust (mtime) when present; only mint a new bust when path changes.
        const src =
          prev && prevBase === nextBase
            ? prev.src
            : rawSrc.includes('?v=')
              ? resolveImageUrl(rawSrc) || rawSrc
              : withArtworkCacheBust(rawSrc)
        const next: BackgroundTile = {
          id: String(tile.id),
          src,
          alt: String(tile.alt || 'Album cover art'),
        }
        if (!prev || prev.src !== next.src || prev.alt !== next.alt) {
          tilesById.set(next.id, next)
          changed = true
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
