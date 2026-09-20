/**
 * Media Session / OS lock-screen helpers.
 *
 * iOS/iPadOS show ±10s seek when seekforward/seekbackward are registered,
 * even if nexttrack/previoustrack are also set. Prefer track skip on phones
 * and tablets. Artwork must be absolute https URLs or the widget stays blank.
 */

export const LOCK_SCREEN_FALLBACK_ARTWORK = '/images/logo.png'

const ARTWORK_SIZES = ['96x96', '128x128', '192x192', '256x256', '384x384', '512x512'] as const

export type LockScreenArtworkEntry = {
  src: string
  sizes: string
  type: string
}

export function artworkMimeType(src: string): string {
  const path = src.split('?')[0]?.split('#')[0]?.toLowerCase() || ''
  if (path.endsWith('.png')) return 'image/png'
  if (path.endsWith('.webp')) return 'image/webp'
  if (path.endsWith('.gif')) return 'image/gif'
  if (path.endsWith('.svg')) return 'image/svg+xml'
  if (path.endsWith('.avif')) return 'image/avif'
  return 'image/jpeg'
}

/** Absolute URL required by iOS MediaMetadata artwork fetch. */
export function absoluteMediaArtworkUrl(
  artwork: string | null | undefined,
  origin?: string | null,
): string | undefined {
  const raw = String(artwork || '').trim()
  if (!raw) return undefined
  if (/^https?:\/\//i.test(raw)) return raw
  if (raw.startsWith('//')) return `https:${raw}`
  const base = String(origin || '').replace(/\/$/, '')
  if (!base) return raw.startsWith('/') ? raw : undefined
  if (raw.startsWith('/')) return `${base}${raw}`
  return `${base}/${raw}`
}

export function buildLockScreenArtworkEntries(
  artwork: string | null | undefined,
  origin?: string | null,
): LockScreenArtworkEntry[] {
  const primary =
    absoluteMediaArtworkUrl(artwork, origin) ||
    absoluteMediaArtworkUrl(LOCK_SCREEN_FALLBACK_ARTWORK, origin)
  if (!primary || !/^https?:\/\//i.test(primary)) return []
  const type = artworkMimeType(primary)
  return ARTWORK_SIZES.map((sizes) => ({ src: primary, sizes, type }))
}

/**
 * Phones/tablets: only register next/previous so the OS shows skip buttons.
 * Desktop notifications can keep seek ±N.
 */
export function lockScreenPrefersTrackSkip(userAgent?: string, maxTouchPoints = 0): boolean {
  if (typeof navigator !== 'undefined' && !userAgent) {
    const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData
    if (uaData?.mobile === true) return true
  }
  const ua = userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '')
  const touch =
    maxTouchPoints ||
    (typeof navigator !== 'undefined'
      ? (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints || 0
      : 0)
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (/Macintosh/i.test(ua) && touch > 1)
  return isIOS || /Android/i.test(ua)
}
