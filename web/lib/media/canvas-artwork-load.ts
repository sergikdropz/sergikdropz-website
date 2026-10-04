/**
 * Load release artwork for canvas / MediaRecorder exports (IG stories, feed squares, vinyl).
 * Uses site image resolution (gallery → /images/audio/…) then same-origin proxy when needed.
 */

import { proxiedArtworkUrl } from '@/lib/shares/story-snippet'
import { resolveImageUrl } from '@/utils/resolveImageUrl'

function clean(value: unknown): string {
  return value == null ? '' : String(value).trim()
}

/** Best URL for drawing cover art on a canvas (resolved local path or proxied remote). */
export function artworkSrcForCanvas(raw: string | null | undefined, pageOrigin?: string): string {
  const text = clean(raw)
  if (!text) return ''
  const resolved = resolveImageUrl(text)
  if (!resolved) return ''
  return proxiedArtworkUrl(resolved, pageOrigin)
}

function isSameOriginOrRelative(url: string): boolean {
  if (url.startsWith('/') && !url.startsWith('//')) return true
  if (typeof window === 'undefined') return false
  try {
    return new URL(url, window.location.origin).origin === window.location.origin
  } catch {
    return false
  }
}

function loadImageElement(src: string, crossOrigin: boolean): Promise<HTMLImageElement | null> {
  if (!src || typeof Image === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    const img = new Image()
    if (crossOrigin) img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

async function loadViaFetchBlob(src: string): Promise<HTMLImageElement | null> {
  if (typeof fetch === 'undefined') return null
  try {
    const res = await fetch(src, { credentials: 'same-origin', cache: 'force-cache' })
    if (!res.ok) return null
    const blob = await res.blob()
    if (!blob.type.startsWith('image/')) return null
    const objectUrl = URL.createObjectURL(blob)
    try {
      return await loadImageElement(objectUrl, false)
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  } catch {
    return null
  }
}

/** Load artwork for canvas compositing; returns null if every strategy fails. */
export async function loadArtworkForCanvas(
  raw: string | null | undefined,
  pageOrigin?: string
): Promise<HTMLImageElement | null> {
  const primary = artworkSrcForCanvas(raw, pageOrigin)
  if (!primary) return null

  const sameOrigin = isSameOriginOrRelative(primary)
  let img = await loadImageElement(primary, !sameOrigin)
  if (img) return img

  if (sameOrigin) {
    img = await loadViaFetchBlob(primary)
    if (img) return img
  }

  if (!primary.includes('/api/shares/artwork-proxy')) {
    const proxied = proxiedArtworkUrl(primary, pageOrigin)
    if (proxied && proxied !== primary) {
      img = await loadImageElement(proxied, true)
      if (img) return img
      img = await loadViaFetchBlob(proxied)
      if (img) return img
    }
  }

  return null
}

/** Pick the first non-empty artwork field (release → DSP → track). */
export function pickSocialPromoArtworkUrl(...candidates: Array<string | null | undefined>): string {
  for (const raw of candidates) {
    const src = artworkSrcForCanvas(raw)
    if (src) return src
  }
  return ''
}
