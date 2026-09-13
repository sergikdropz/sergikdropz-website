import productsData from '@/data/products.json'
import releasesData from '@/data/releases.json'
import releaseSchedule from '@/data/release-schedule.json'
import { resolveImageUrl } from '@/utils/resolveImageUrl'

export type BackgroundTile = {
  id: string
  src: string
  alt: string
}

export type MosaicVariant = 'vault' | 'music' | 'gallery'

const INVALID_CDN_PATTERNS = ['image-cdn-fa.spotifycdn.com', 'image-cdn-ak.spotifycdn.com']

export function mosaicVariantForPath(pathname: string | null | undefined): MosaicVariant {
  if (pathname?.startsWith('/music-library')) return 'vault'
  if (pathname?.startsWith('/music')) return 'music'
  return 'gallery'
}

export function isMusicVaultPath(pathname: string | null | undefined): boolean {
  return mosaicVariantForPath(pathname) === 'vault'
}

export function normalizeReleaseKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(digital download\)/g, ' ')
    .replace(/\bcover art\b/g, ' ')
    .replace(/\bep\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Heuristic resolution score for cover URLs (higher = prefer).
 * Local masters beat Spotify CDN thumbs; Spotify size codes are known.
 */
export function artworkResolutionScore(src: string): number {
  const url = (resolveImageUrl(src) || src).split('?')[0]
  if (!url) return 0

  // Spotify album-art size codes
  if (/ab67616d0000b273/i.test(url)) return 640
  if (/ab67616d00001e02/i.test(url)) return 300
  if (/ab67616d00004851/i.test(url)) return 64

  const dim = url.match(/(?:^|[/_-])(\d{2,4})x(\d{2,4})(?:[./_]|$)/i)
  if (dim) return Math.max(Number(dim[1]) || 0, Number(dim[2]) || 0)

  // Local / ingested masters are typically full-resolution
  if (
    url.startsWith('/images/') ||
    url.includes('/gallery-images/') ||
    url.includes('/images/audio/')
  ) {
    return 3000
  }

  if (/scdn\.co|spotifycdn\.com|spotify/i.test(url)) return 300
  return 500
}

export function preferHigherResolutionArtwork(a: string, b: string): string {
  return artworkResolutionScore(a) >= artworkResolutionScore(b) ? a : b
}

/** One entry per release label; keeps the highest-resolution source. */
export function dedupeArtworkByReleaseLabel<T extends { src: string; label: string }>(items: T[]): T[] {
  const byKey = new Map<string, T>()
  const order: string[] = []

  for (const item of items) {
    const releaseKey = normalizeReleaseKey(item.label)
    const key = releaseKey || `src:${(resolveImageUrl(item.src) || item.src).split('?')[0]}`
    const prev = byKey.get(key)
    if (!prev) {
      byKey.set(key, item)
      order.push(key)
      continue
    }
    if (artworkResolutionScore(item.src) > artworkResolutionScore(prev.src)) {
      byKey.set(key, item)
    }
  }

  return order.map((key) => byKey.get(key)!).filter(Boolean)
}

function createTileCollector() {
  const byRelease = new Map<string, BackgroundTile>()
  const bySrc = new Set<string>()
  const order: string[] = []

  const add = (id: string, raw: string | undefined, alt: string) => {
    if (!raw) return
    if (INVALID_CDN_PATTERNS.some((pattern) => raw.includes(pattern))) return
    const src = resolveImageUrl(raw)
    if (!src) return
    const srcKey = src.split('?')[0]
    const releaseKey = normalizeReleaseKey(alt)
    const key = releaseKey || `src:${srcKey}`

    const prev = byRelease.get(key)
    if (prev) {
      if (artworkResolutionScore(src) > artworkResolutionScore(prev.src)) {
        bySrc.delete(prev.src.split('?')[0])
        bySrc.add(srcKey)
        byRelease.set(key, { id, src, alt })
      }
      return
    }
    if (bySrc.has(srcKey)) return
    bySrc.add(srcKey)
    byRelease.set(key, { id, src, alt })
    order.push(key)
  }

  return {
    add,
    tiles: () => order.map((key) => byRelease.get(key)!).filter(Boolean),
  }
}

let catalogArtworkByKey: Map<string, string> | null = null

function rememberCatalogArtwork(map: Map<string, string>, name: string | undefined, raw: string | undefined) {
  if (!name || !raw) return
  const key = normalizeReleaseKey(name)
  if (!key) return
  const src = resolveImageUrl(raw)
  if (!src) return
  const prev = map.get(key)
  if (!prev || artworkResolutionScore(src) > artworkResolutionScore(prev)) {
    map.set(key, src)
  }
}

function catalogArtworkIndex(): Map<string, string> {
  if (catalogArtworkByKey) return catalogArtworkByKey
  const map = new Map<string, string>()
  for (const product of productsData.products) {
    rememberCatalogArtwork(map, product.title, product.artwork)
    rememberCatalogArtwork(map, product.slug, product.artwork)
    rememberCatalogArtwork(map, product.release_id?.replace(/-/g, ' '), product.artwork)
  }
  for (const item of releaseSchedule.schedule) {
    rememberCatalogArtwork(map, item.title, item.artwork)
    rememberCatalogArtwork(map, item.id.replace(/-/g, ' '), item.artwork)
  }
  for (const release of releasesData.releases) {
    rememberCatalogArtwork(map, release.title, release.image)
    rememberCatalogArtwork(map, release.id.replace(/-/g, ' '), release.image)
  }
  catalogArtworkByKey = map
  return map
}

/** Known shop/schedule/release cover for a folder name like "Staying A Vibe". */
export function catalogArtworkForRelease(name: string | null | undefined): string | undefined {
  if (!name?.trim()) return undefined
  return catalogArtworkIndex().get(normalizeReleaseKey(name))
}

/** Unique EP cover art for the Music Vault mosaic background. */
export function collectEpCoverTiles(): BackgroundTile[] {
  const { add, tiles } = createTileCollector()

  for (const product of productsData.products) {
    if (product.category !== 'ep-bundles' || !product.artwork) continue
    add(product.id, product.artwork, `${product.title} cover art`)
  }

  for (const item of releaseSchedule.schedule) {
    if (item.type !== 'EP') continue
    add(`schedule-${item.id}`, item.artwork, `${item.title} EP cover art`)
  }

  for (const release of releasesData.releases) {
    if (release.type !== 'EP' || !release.image) continue
    add(`release-${release.id}`, release.image, `${release.title} EP cover art`)
  }

  return tiles()
}

/** Unique release cover art for the /music mosaic background. */
export function collectReleaseCoverTiles(): BackgroundTile[] {
  const { add, tiles } = createTileCollector()

  for (const product of productsData.products) {
    if (!product.artwork) continue
    add(product.id, product.artwork, `${product.title} cover art`)
  }

  for (const item of releaseSchedule.schedule) {
    add(`schedule-${item.id}`, item.artwork, `${item.title} cover art`)
  }

  for (const release of releasesData.releases) {
    if (!release.image) continue
    add(`release-${release.id}`, release.image, `${release.title} cover art`)
  }

  return tiles()
}
