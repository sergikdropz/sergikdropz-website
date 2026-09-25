/**
 * Media Session / OS lock-screen helpers.
 *
 * iOS/iPadOS show ±10s seek when seekforward/seekbackward are registered,
 * even if nexttrack/previoustrack are also set. Prefer track skip on phones
 * and tablets. Artwork must be absolute https URLs or the widget stays blank.
 */

import { resolveImageUrl } from '@/utils/resolveImageUrl'

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

/**
 * Canonical HTTPS origin for OS artwork fetch (iOS ignores http / LAN dev origins).
 */
export function resolveMediaSessionOrigin(pageOrigin?: string | null): string | null {
  const env =
    typeof process !== 'undefined' && process.env.NEXT_PUBLIC_SITE_URL
      ? process.env.NEXT_PUBLIC_SITE_URL.trim().replace(/\/$/, '')
      : ''
  const page = String(pageOrigin ?? '').trim().replace(/\/$/, '')
  if (env && /^https:\/\//i.test(env)) {
    if (!page || /^http:\/\//i.test(page)) return env
  }
  if (page) return page
  return env || null
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
  const base = resolveMediaSessionOrigin(origin)
  if (!base) return undefined
  if (raw.startsWith('/')) return `${base}${raw}`
  return `${base}/${raw}`
}

/** Same-origin artwork bytes — reliable for iOS / Android Media Session fetchers. */
export function mediaSessionArtworkFetchUrl(
  artwork: string | null | undefined,
  origin?: string | null,
): string | undefined {
  const absolute = absoluteMediaArtworkUrl(artwork, origin)
  if (!absolute || !/^https?:\/\//i.test(absolute)) return undefined
  try {
    const u = new URL(absolute)
    const pathOnly = u.pathname
    if (pathOnly.startsWith('/images/') || pathOnly.startsWith('/audio/')) {
      const base = resolveMediaSessionOrigin(origin ?? u.origin)
      if (!base) return absolute
      const q = new URLSearchParams({ path: pathOnly })
      const bust = u.searchParams.get('v')
      if (bust) q.set('v', bust)
      return `${base}/api/media/session-artwork?${q.toString()}`
    }
  } catch {
    /* keep absolute */
  }
  return absolute
}

export function buildLockScreenArtworkEntries(
  artwork: string | null | undefined,
  origin?: string | null,
): LockScreenArtworkEntry[] {
  const resolvedOrigin = resolveMediaSessionOrigin(origin)
  const primary =
    mediaSessionArtworkFetchUrl(artwork, resolvedOrigin) ||
    mediaSessionArtworkFetchUrl(LOCK_SCREEN_FALLBACK_ARTWORK, resolvedOrigin) ||
    absoluteMediaArtworkUrl(artwork, resolvedOrigin) ||
    absoluteMediaArtworkUrl(LOCK_SCREEN_FALLBACK_ARTWORK, resolvedOrigin)
  if (!primary || !/^https?:\/\//i.test(primary)) return []
  const type = artworkMimeType(artwork || LOCK_SCREEN_FALLBACK_ARTWORK)
  return ARTWORK_SIZES.map((sizes) => ({ src: primary, sizes, type }))
}

/** Resolve catalog artwork ref → MediaMetadata `artwork` array. */
export function buildMediaSessionArtworkFromRef(
  artworkRef: string | null | undefined,
  pageOrigin?: string | null,
): LockScreenArtworkEntry[] {
  const origin = resolveMediaSessionOrigin(
    pageOrigin ?? (typeof window !== 'undefined' ? window.location.origin : null),
  )
  const src = artworkRef ? resolveImageUrl(artworkRef) : undefined
  return buildLockScreenArtworkEntries(src, origin)
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
