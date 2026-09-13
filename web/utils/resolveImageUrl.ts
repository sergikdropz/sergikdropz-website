/**
 * Resolve gallery/artwork paths for next/image.
 *
 * Vault cover art was stored in the `gallery-images` bucket. That bucket is
 * not publicly readable in production, so those URLs 403. The files ship with
 * the site under `/images/audio/...` and `/images/gallery/...`.
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

function stripLocalQuery(imagePath: string): string {
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) return imagePath
  const idx = imagePath.indexOf('?')
  return idx === -1 ? imagePath : imagePath.slice(0, idx)
}

/** Keep `?v=` so overwritten folder covers refresh in next/image and the player. */
function localCacheBust(imagePath: string): string {
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) return ''
  const idx = imagePath.indexOf('?')
  if (idx === -1) return ''
  const v = new URLSearchParams(imagePath.slice(idx + 1)).get('v')
  return v ? `?v=${encodeURIComponent(v)}` : ''
}

function withLocalCacheBust(resolved: string, bust: string): string {
  if (!bust) return resolved
  if (resolved.startsWith('http://') || resolved.startsWith('https://')) return resolved
  return `${resolved.split('?')[0]}${bust}`
}

function resolveImageUrlUncached(imagePath: string): string {
  if (!imagePath || typeof imagePath !== 'string') return imagePath

  const bust = localCacheBust(imagePath)
  const pathOnly = stripLocalQuery(imagePath)
  if (pathOnly.includes(STAYING_A_VIBE_LEGACY) || pathOnly.includes('staying-a-vibe-cover.jpg')) {
    return withLocalCacheBust(encodeImagePath(STAYING_A_VIBE_COVER), bust)
  }

  const galleryRel = galleryRelativePath(pathOnly)
  if (galleryRel) {
    const local = galleryRel.startsWith('audio/')
      ? `/images/${galleryRel}`
      : `/images/gallery/${galleryRel}`
    return withLocalCacheBust(encodeImagePath(local), bust)
  }

  if (pathOnly.startsWith('/images/') || pathOnly.startsWith('/audio/')) {
    return withLocalCacheBust(encodeImagePath(pathOnly), bust)
  }

  if (pathOnly.startsWith('http://') || pathOnly.startsWith('https://')) {
    return pathOnly
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
