/**
 * Resolve gallery/artwork paths for next/image.
 *
 * Vault EP cover art was stored in the `gallery-images` bucket under `audio/…`.
 * That bucket path is not reliably public in every environment, so those URLs are
 * rewritten onto shipped files under `/images/audio/…`.
 *
 * Admin gallery photo uploads also use `gallery-images/` (top-level). Those files
 * only exist in Storage — keep the remote public URL. Do not rewrite them to
 * `/images/gallery/…` unless the caller already passed a local path.
 *
 * Do not rewrite other remote URLs (Spotify, YouTube, audio-files audio).
 */

const imageUrlCache = new Map<string, string>()
const MAX_CACHE_SIZE = 500

const GALLERY_PUBLIC = '/object/public/gallery-images/'
const GALLERY_SIGN = '/object/sign/gallery-images/'
const GALLERY_RENDER = '/render/image/public/gallery-images/'

const STAYING_A_VIBE_LEGACY = 'CD9B1141-992E-405C-B73D-CF3D2A6BF02E.jpeg'
const STAYING_A_VIBE_COVER = '/images/audio/unreleased/eps/SERGIK - Staying A Vibe/staying-a-vibe-cover.jpg'

/** Old Daze astronaut cover — still referenced by stale mobile caches / copy playlists. */
const DAZE_ASTRONAUT_LEGACY = '89D09194-956E-422F-A040-8A9DEC10C3DD'
const DAZE_COVER = '/images/audio/artwork/folder-collection-unreleased-eps-sergik---daze.jpg'
const HAPPY_CAMPER_COVER = '/images/audio/artwork/folder-1787720929879.jpg'

export function resolveImageUrl(imagePath: string): string {
  const cached = imageUrlCache.get(imagePath)
  if (cached) return cached

  const resolved = resolveImageUrlUncached(imagePath)

  if (imageUrlCache.size >= MAX_CACHE_SIZE) {
    const first = imageUrlCache.keys().next().value
    if (first !== undefined) imageUrlCache.delete(first)
  }
  imageUrlCache.set(imagePath, resolved)
  return resolved
}

/** Test helper — clears the module-level resolve cache. */
export function clearResolveImageUrlCache(): void {
  imageUrlCache.clear()
}

function decodeSegment(seg: string): string {
  try {
    return decodeURIComponent(seg)
  } catch {
    return seg
  }
}

/** Encode each path segment so next/image accepts spaces and `&`. Idempotent. */
export function encodeImagePath(pathname: string): string {
  if (!pathname.startsWith('/')) return pathname
  return pathname
    .split('/')
    .map((seg) => (seg ? encodeURIComponent(decodeSegment(seg)) : ''))
    .join('/')
}

function galleryRelativePath(imagePath: string): string | null {
  const markers = [GALLERY_PUBLIC, GALLERY_SIGN, GALLERY_RENDER]
  for (const marker of markers) {
    const idx = imagePath.indexOf(marker)
    if (idx === -1) continue
    let rel = imagePath.slice(idx + marker.length).split('?')[0]
    try {
      rel = decodeURIComponent(rel)
    } catch {
      /* keep raw */
    }
    return rel.replace(/^\/+/, '')
  }
  return null
}

function stripQuery(imagePath: string): string {
  const idx = imagePath.indexOf('?')
  return idx === -1 ? imagePath : imagePath.slice(0, idx)
}

/** Keep `?v=` so overwritten folder covers refresh in next/image and the player. */
function localCacheBust(imagePath: string): string {
  const idx = imagePath.indexOf('?')
  if (idx === -1) return ''
  const v = new URLSearchParams(imagePath.slice(idx + 1)).get('v')
  return v ? `?v=${encodeURIComponent(v)}` : ''
}

function withLocalCacheBust(resolved: string, bust: string): string {
  if (!bust) return resolved
  if (resolved.startsWith('http://') || resolved.startsWith('https://')) {
    const base = stripQuery(resolved)
    return `${base}${bust}`
  }
  return `${resolved.split('?')[0]}${bust}`
}

/** Canonical shipped covers — defeat stale mobile caches that still point at retired art. */
function canonicalFolderCover(pathOnly: string): string | null {
  if (pathOnly.includes(DAZE_ASTRONAUT_LEGACY)) return DAZE_COVER
  if (/folder-1787720929879\./i.test(pathOnly)) return HAPPY_CAMPER_COVER
  if (/folder-collection-unreleased-eps-sergik---daze-?\./i.test(pathOnly)) return DAZE_COVER
  return null
}

/**
 * Prefer shipped local JPEG masters for the folder-cover upload pool.
 * - Local `.png/.webp` siblings were retired by `artwork:normalize`.
 * - Remote Storage may still serve multi-MB `.png` — map onto local JPEG masters
 *   (never invent a remote `.jpg` that does not exist).
 * - Trailing-dash stems (`…daze-.jpg`) normalize to the on-disk master.
 */
function preferNormalizedArtworkMaster(pathOnly: string): string {
  const remote = pathOnly.match(
    /\/(?:object\/(?:public|sign)\/)?audio-files\/artwork\/(folder-[^/?#]+)\.[a-z0-9]+$/i,
  )
  if (remote) {
    const stem = remote[1].replace(/-+$/g, '')
    return `/images/audio/artwork/${stem}.jpg`
  }

  const localAny = pathOnly.match(
    /(\/images\/audio\/artwork\/)(folder-[^/?#]+)\.([a-z0-9]+)$/i,
  )
  if (localAny) {
    const stem = localAny[2].replace(/-+$/g, '')
    const ext = localAny[3].toLowerCase()
    // Retired raster siblings + trailing-dash jpg typos → canonical JPEG master.
    if (ext === 'png' || ext === 'webp' || ext === 'gif' || ext === 'avif' || stem !== localAny[2]) {
      return `${localAny[1]}${stem}.jpg`
    }
  }
  return pathOnly
}

function resolveImageUrlUncached(imagePath: string): string {
  if (!imagePath || typeof imagePath !== 'string') return imagePath

  const bust = localCacheBust(imagePath)
  let pathOnly = preferNormalizedArtworkMaster(stripQuery(imagePath))
  if (pathOnly.includes(STAYING_A_VIBE_LEGACY) || pathOnly.includes('staying-a-vibe-cover.jpg')) {
    return withLocalCacheBust(encodeImagePath(STAYING_A_VIBE_COVER), bust)
  }

  const canonical = canonicalFolderCover(pathOnly)
  if (canonical) {
    return withLocalCacheBust(encodeImagePath(canonical), bust)
  }

  const galleryRel = galleryRelativePath(pathOnly)
  if (galleryRel) {
    // Legacy EP/vault covers lived under gallery-images/audio/… and ship with the site.
    // Admin photo uploads also land in gallery-images/, but only exist remotely — keep those URLs.
    if (galleryRel.startsWith('audio/')) {
      return withLocalCacheBust(encodeImagePath(`/images/${galleryRel}`), bust)
    }
    if (pathOnly.startsWith('http://') || pathOnly.startsWith('https://')) {
      return pathOnly
    }
    return withLocalCacheBust(encodeImagePath(`/images/gallery/${galleryRel}`), bust)
  }

  if (pathOnly.startsWith('/images/') || pathOnly.startsWith('/audio/')) {
    return withLocalCacheBust(encodeImagePath(pathOnly), bust)
  }

  if (pathOnly.startsWith('http://') || pathOnly.startsWith('https://')) {
    return withLocalCacheBust(pathOnly, bust)
  }

  const withSlash = pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`
  return withSlash.startsWith('/images/') || withSlash.startsWith('/audio/')
    ? withLocalCacheBust(encodeImagePath(withSlash), bust)
    : withLocalCacheBust(withSlash, bust)
}

export function getOptimizedImageUrl(
  imagePath: string,
  _options?: {
    width?: number
    height?: number
    quality?: number
    format?: 'webp' | 'avif' | 'jpg' | 'png'
  },
): string {
  return resolveImageUrl(imagePath)
}
