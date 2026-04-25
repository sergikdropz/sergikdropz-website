/**
 * Audio URL caching utility
 * Safe to add - doesn't modify existing functionality
 * Implements TTL-based in-memory cache to reduce redundant API calls
 */

interface CachedUrl {
  url: string
  timestamp: number
}

const urlCache = new Map<string, CachedUrl>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Get cached URL if it exists and hasn't expired
 * @param filePath - The audio file path to look up
 * @returns Cached URL or null if not found/expired
 */
export function getCachedUrl(filePath: string): string | null {
  const cached = urlCache.get(filePath)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.url
  }
  // Remove expired entry
  if (cached) {
    urlCache.delete(filePath)
  }
  return null
}

/**
 * Store URL in cache
 * @param filePath - The audio file path
 * @param url - The resolved URL to cache
 */
export function setCachedUrl(filePath: string, url: string): void {
  urlCache.set(filePath, { url, timestamp: Date.now() })
}

/**
 * Clear all cached URLs
 * Useful for testing or when cache needs to be reset
 */
export function clearCache(): void {
  urlCache.clear()
}

