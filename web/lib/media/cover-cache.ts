/**
 * Cover-art cache helpers — only busted artwork URLs are durable-cached.
 * Bare `/images/...` without `?v=` must not enter long-lived SW/Cache Storage
 * (same-path overwrite would stick like the retired Daze astronaut cover).
 */

import { withArtworkCacheBust, stripArtworkCacheBust } from '@/lib/catalog-sync/artwork'
import { resolveImageUrl } from '@/utils/resolveImageUrl'
import { isLocalFolderArtworkPath } from '@/utils/imageOptimization'

export const COVER_CACHE_NAME = 'sergik-cover-cache-v1'
export const COVER_PREFETCH_LIMIT = 32

/** True when a cover URL is safe to cache long-term (explicit cache bust). */
export function isCacheableCoverUrl(raw: string | null | undefined): boolean {
  if (!raw?.trim()) return false
  const input = raw.trim()
  if (input.startsWith('blob:') || input.startsWith('data:')) return false

  // next/image optimizer URLs — inspect the inner `url` param (do not run resolveImageUrl;
  // it strips the query and would drop the wrapped artwork path).
  if (input.includes('/_next/image')) {
    try {
      const url = new URL(input, typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
      if (url.pathname.startsWith('/_next/image')) {
        const inner = url.searchParams.get('url') || ''
        return isBustedArtworkPath(inner)
      }
    } catch {
      return false
    }
  }

  const resolved = resolveImageUrl(input) || input
  if (!resolved) return false

  try {
    const url = new URL(resolved, typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
    return isBustedArtworkPath(url.pathname + url.search)
  } catch {
    return isBustedArtworkPath(resolved)
  }
}

function isBustedArtworkPath(pathOrUrl: string): boolean {
  const lower = pathOrUrl.toLowerCase()
  const looksLikeArtwork =
    lower.includes('/images/audio/artwork/') ||
    lower.includes('/audio-files/artwork/') ||
    /\/artwork\/folder-/i.test(lower)
  if (!looksLikeArtwork) return false
  return /[?&]v=\d+/i.test(pathOrUrl) || /%3[Ff]v%3[Dd]\d+/i.test(pathOrUrl)
}

/** Ensure cover URLs carry `?v=` before prefetch/cache. */
export function ensureBustedCoverUrl(raw: string | null | undefined): string {
  if (!raw?.trim()) return ''
  const resolved = resolveImageUrl(raw.trim()) || raw.trim()
  if (!resolved) return ''
  if (/[?&]v=\d+/i.test(resolved)) return resolved
  if (
    resolved.includes('/images/audio/artwork/') ||
    /\/audio-files\/artwork\//i.test(resolved) ||
    /\/object\/(?:public|sign)\/audio-files\/artwork\//i.test(resolved)
  ) {
    return withArtworkCacheBust(stripArtworkCacheBust(resolved))
  }
  return resolved
}

export function prefersReducedDataTransfer(): boolean {
  if (typeof navigator === 'undefined') return false
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } })
    .connection
  if (conn?.saveData) return true
  const type = (conn?.effectiveType || '').toLowerCase()
  return type === 'slow-2g' || type === '2g'
}

/** Build a same-origin next/image URL for a busted cover (optional warm). */
export function nextImageCoverUrl(src: string, width = 256): string | null {
  const busted = ensureBustedCoverUrl(src)
  if (!busted || !isCacheableCoverUrl(busted)) return null
  if (/^https?:\/\//i.test(busted) && typeof window !== 'undefined') {
    try {
      const u = new URL(busted)
      if (u.origin !== window.location.origin) {
        // Remote covers still go through next/image when configured; warm the optimizer URL.
        return `/_next/image?url=${encodeURIComponent(busted)}&w=${width}&q=75`
      }
    } catch {
      /* fall through */
    }
  }
  if (isLocalFolderArtworkPath(busted)) {
    return busted
  }
  const pathOnly = busted.split('?')[0]
  if (pathOnly.startsWith('/')) {
    return `/_next/image?url=${encodeURIComponent(pathOnly)}&w=${width}&q=75`
  }
  return `/_next/image?url=${encodeURIComponent(busted)}&w=${width}&q=75`
}

/** Dedupe + bust a list of cover sources for session warm (prefer next/image thumbs). */
export function prepareCoverPrefetchUrls(sources: Array<string | null | undefined>, limit = COVER_PREFETCH_LIMIT): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of sources) {
    const busted = ensureBustedCoverUrl(raw)
    if (!busted || !isCacheableCoverUrl(busted)) continue
    const key = stripArtworkCacheBust(busted)
    if (seen.has(key)) continue
    seen.add(key)
    const optimized = nextImageCoverUrl(busted, 256)
    if (optimized) {
      out.push(optimized)
    } else {
      out.push(busted)
    }
    if (out.length >= limit) break
  }
  return out
}
