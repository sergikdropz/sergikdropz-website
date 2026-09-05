/**
 * Audio URL caching utility
 * Safe to add - doesn't modify existing functionality
 * Implements TTL-based in-memory cache to reduce redundant API calls
 */

interface CachedUrl {
  url: string
  timestamp: number
  ttlMs: number
}

const urlCache = new Map<string, CachedUrl>()
const DEFAULT_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Get cached URL if it exists and hasn't expired
 */
export function getCachedUrl(filePath: string): string | null {
  const cached = urlCache.get(filePath)
  if (cached && Date.now() - cached.timestamp < cached.ttlMs) {
    return cached.url
  }
  if (cached) {
    urlCache.delete(filePath)
  }
  return null
}

/**
 * Store URL in cache
 * @param ttlMs optional TTL (e.g. presigned R2 URLs ~1h, use 50 min buffer)
 */
export function setCachedUrl(filePath: string, url: string, ttlMs = DEFAULT_CACHE_TTL): void {
  urlCache.set(filePath, { url, timestamp: Date.now(), ttlMs })
}

/**
 * Clear all cached URLs
 * Useful for testing or when cache needs to be reset
 */
export function clearCache(): void {
  urlCache.clear()
}

