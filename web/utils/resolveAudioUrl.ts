/**
 * Utility to resolve audio file paths to actual URLs
 * 
 * In production: Always resolves to Supabase Storage URLs
 * In development: Tries Supabase first, falls back to local files
 */

import { getCachedUrl, setCachedUrl } from './audioCache'

const DEBUG_INGEST =
  process.env.NODE_ENV !== 'production' && !!process.env.NEXT_PUBLIC_ENABLE_DEBUG_LOGGING
const debugIngest = (payload: Record<string, unknown>) => {
  if (!DEBUG_INGEST) return
  if (typeof window === 'undefined') return
  try {
    fetch('http://127.0.0.1:7243/ingest/a346b04a-1680-490e-a42d-0a05edd129a0', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {})
  } catch {
    // Ignore debug ingest errors
  }
}

/**
 * Resolves an audio file path to a URL
 * @param filePath - The local file path (e.g., "/audio/unreleased/eps/...")
 * @returns Promise<string> - The resolved URL (Supabase URL in production, or local path in dev)
 */
export async function resolveAudioUrl(filePath: string): Promise<string> {

  // If it's already a full URL (starts with http), return as-is
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
    return filePath
  }

  // Check cache first (NEW - safe addition)
  const cached = getCachedUrl(filePath)
  if (cached) {
    return cached
  }

  // Always try Supabase resolution (works in both dev and production)
  if (typeof window !== 'undefined') {
    const isDevelopment = process.env.NODE_ENV === 'development'
    
    try {
      const response = await fetch(`/api/audio/resolve?path=${encodeURIComponent(filePath)}`)
      
      if (response.ok) {
        const data = await response.json()
        debugIngest({
          location: 'resolveAudioUrl.ts:36',
          message: 'Audio resolve response',
          data: {
            filePath,
            hasUrl: !!data.url,
            url: data.url?.substring(0, 100),
            hasError: !!data.error,
          },
          timestamp: Date.now(),
          sessionId: 'debug-session',
          runId: 'run1',
          hypothesisId: 'C',
        })
        // In production, always use Supabase URL (even if null, API will construct it)
        // In development, use Supabase URL if found, otherwise fall back to local
        if (data.url) {
          // Cache the result (NEW - safe addition)
          setCachedUrl(filePath, data.url)
          return data.url
        } else if (!isDevelopment) {
          // In production, if API returns null, check if it's a configuration error
          if (data.error) {
            console.error('Supabase configuration error:', data.error)
            throw new Error(`Supabase not configured: ${data.error}`)
          }
          // In production, if API returns null, that's an error - don't fall back to local
          console.error('Audio file not found in Supabase:', filePath)
          throw new Error(`Audio file not found: ${filePath}`)
        }
      }
    } catch (error: any) {
      if (!isDevelopment) {
        // In production, don't fall back to local files
        console.error('Failed to resolve audio URL from Supabase:', error)
        throw error
      }
      // In development, fall through to local path
      console.warn('Failed to resolve audio URL from Supabase, using local path:', error)
    }
  }

  // Fallback: return the local path (only used in development)
  const result = filePath
  // Cache even local paths in dev (NEW - safe addition)
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    setCachedUrl(filePath, result)
  }
  return result
}

/**
 * Batch resolve multiple audio file paths
 * @param filePaths - Array of file paths
 * @returns Promise<Map<string, string>> - Map of original path to resolved URL
 */
export async function resolveAudioUrls(filePaths: string[]): Promise<Map<string, string>> {
  const resolved = new Map<string, string>()
  
  // Resolve all in parallel
  const promises = filePaths.map(async (path) => {
    const url = await resolveAudioUrl(path)
    return [path, url] as [string, string]
  })
  
  const results = await Promise.all(promises)
  results.forEach(([path, url]) => {
    resolved.set(path, url)
  })
  
  return resolved
}
