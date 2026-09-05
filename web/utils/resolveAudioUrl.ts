/**
 * Utility to resolve audio file paths to actual URLs
 * 
 * In production: Always resolves to Supabase Storage URLs
 * In development: Tries Supabase first, falls back to local files
 */

import { getCachedUrl, setCachedUrl } from './audioCache'
import { alternateAudioExtensionUrl, normalizeVaultAudioUrl } from './normalizeVaultAudioUrl'

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

async function urlExists(url: string): Promise<boolean> {
  if (typeof window === 'undefined') return true
  if (!url.startsWith('/') || url.startsWith('//')) return true
  try {
    const res = await fetch(url, { method: 'HEAD', credentials: 'same-origin' })
    if (res.ok) return true
    // Some static hosts reject HEAD — try a ranged GET.
    if (res.status === 405 || res.status === 501) {
      const getRes = await fetch(url, {
        method: 'GET',
        headers: { Range: 'bytes=0-0' },
        credentials: 'same-origin',
      })
      return getRes.ok || getRes.status === 206
    }
    return false
  } catch {
    return false
  }
}

/**
 * Local vault may have WAV-only drops or MP3-only migrated files.
 * Prefer the URL that actually exists on disk.
 *
 * Never probe `/api/audio/media/...` — each HEAD hits R2 through the Next proxy and
 * races the actual playback GET (logs showed multi-second HEADs starving play).
 * Extension fallback belongs in the player's onError path.
 */
async function preferExistingLocalAudio(url: string): Promise<string> {
  if (typeof window === 'undefined') return url
  if (!url.startsWith('/audio/')) return url

  if (await urlExists(url)) return url
  const alt = alternateAudioExtensionUrl(url)
  if (alt && (await urlExists(alt))) return alt
  return url
}

/**
 * Resolves an audio file path to a URL
 * @param filePath - The local file path (e.g., "/audio/unreleased/eps/...")
 * @returns Promise<string> - The resolved URL (Supabase URL in production, or local path in dev)
 */
export async function resolveAudioUrl(filePath: string): Promise<string> {
  const normalizedInput = normalizeVaultAudioUrl(filePath)

  // Already same-origin media proxy or absolute http(s) — skip resolve + existence HEAD
  if (
    normalizedInput.startsWith('/api/audio/media/') ||
    normalizedInput.startsWith('http://') ||
    normalizedInput.startsWith('https://')
  ) {
    setCachedUrl(filePath, normalizedInput)
    setCachedUrl(normalizedInput, normalizedInput)
    return normalizedInput
  }

  // Check cache first (NEW - safe addition)
  const cached = getCachedUrl(normalizedInput)
  if (cached) {
    return normalizeVaultAudioUrl(cached)
  }

  // Always try Supabase resolution (works in both dev and production)
  if (typeof window !== 'undefined') {
    const isDevelopment = process.env.NODE_ENV === 'development'
    
    try {
      const response = await fetch(`/api/audio/resolve?path=${encodeURIComponent(normalizedInput)}`)
      
      if (response.ok) {
        const data = await response.json()
        debugIngest({
          location: 'resolveAudioUrl.ts:36',
          message: 'Audio resolve response',
          data: {
            filePath: normalizedInput,
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
          const out = normalizeVaultAudioUrl(data.url)
          const ttlMs =
            typeof data.expiresIn === 'number' && data.expiresIn > 60
              ? Math.max(60_000, (data.expiresIn - 60) * 1000)
              : undefined
          setCachedUrl(normalizedInput, out, ttlMs)
          return out
        } else if (!isDevelopment) {
          // In production, if API returns null, check if it's a configuration error
          if (data.error) {
            console.error('Supabase configuration error:', data.error)
            throw new Error(`Supabase not configured: ${data.error}`)
          }
          // In production, if API returns null, that's an error - don't fall back to local
          console.error('Audio file not found in Supabase:', normalizedInput)
          throw new Error(`Audio file not found: ${normalizedInput}`)
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

  // Fallback: local path — pick the extension that actually exists (wav-only playlist drops).
  const result = await preferExistingLocalAudio(normalizedInput)
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    setCachedUrl(normalizedInput, result)
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
