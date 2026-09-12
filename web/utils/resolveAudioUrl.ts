/**
 * Utility to resolve audio file paths to actual URLs
 * 
 * In production: Always resolves to Supabase Storage URLs
 * In development: Tries Supabase first, falls back to local files
 */

import { getCachedUrl, setCachedUrl } from './audioCache'
import {
  isDirectPlayableUrl,
  isEdgePlaybackUrl,
  isR2BrowserPlayEnabled,
  shouldPreferResolveOverProxy,
} from '@/lib/audio/edge-playback-url'
import {
  alternateAudioExtensionUrl,
  normalizeVaultAudioUrl,
  toSameOriginMediaUrl,
} from './normalizeVaultAudioUrl'

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
function rememberUrl(filePath: string, url: string, ttlMs?: number) {
  setCachedUrl(filePath, url, ttlMs)
  setCachedUrl(url, url, ttlMs)
}

function browserPlayUrl(filePath: string, candidate?: string | null): string | null {
  return (
    toSameOriginMediaUrl(candidate || '') ||
    toSameOriginMediaUrl(filePath) ||
    (candidate && isDirectPlayableUrl(candidate) ? candidate : null)
  )
}

function playUrlFromResolve(
  filePath: string,
  data: { url?: unknown; source?: unknown; fallbackUrl?: unknown },
): string | null {
  const raw = data.url != null ? String(data.url) : ''
  const source = data.source != null ? String(data.source) : ''
  if ((source === 'presigned' || source === 'cdn') && raw && isR2BrowserPlayEnabled()) {
    // Keep the signature intact — do not run through toSameOriginMediaUrl.
    if (isEdgePlaybackUrl(raw) || /^https?:\/\//i.test(raw)) return raw
  }
  return (
    browserPlayUrl(filePath, raw) ||
    (raw && isDirectPlayableUrl(raw) ? raw : null) ||
    (data.fallbackUrl ? browserPlayUrl(filePath, String(data.fallbackUrl)) : null)
  )
}

export async function resolveAudioUrl(filePath: string): Promise<string> {
  const sameOrigin = browserPlayUrl(filePath, filePath)
  if (sameOrigin) {
    rememberUrl(filePath, sameOrigin)
    return sameOrigin
  }

  const normalizedInput = normalizeVaultAudioUrl(filePath)
  if (isDirectPlayableUrl(normalizedInput)) {
    rememberUrl(filePath, normalizedInput)
    rememberUrl(normalizedInput, normalizedInput)
    return normalizedInput
  }

  const cached = getCachedUrl(filePath) || getCachedUrl(normalizedInput)
  if (cached && isDirectPlayableUrl(cached)) {
    return cached
  }

  const proxyFallback = shouldPreferResolveOverProxy(normalizedInput)
    ? normalizedInput
    : normalizedInput.startsWith('/api/audio/media/')
      ? normalizedInput
      : null

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
          const raw = String(data.url)
          const out =
            playUrlFromResolve(filePath, data) ||
            (isDirectPlayableUrl(raw) ? raw : normalizeVaultAudioUrl(raw))
          const ttlMs =
            typeof data.expiresIn === 'number' && data.expiresIn > 60
              ? Math.max(60_000, (data.expiresIn - 60) * 1000)
              : undefined
          rememberUrl(filePath, out, ttlMs)
          rememberUrl(normalizedInput, out, ttlMs)
          return out
        } else if (!isDevelopment) {
          if (proxyFallback) {
            rememberUrl(filePath, proxyFallback)
            return proxyFallback
          }
          if (data.error) {
            console.error('Supabase configuration error:', data.error)
            throw new Error(`Supabase not configured: ${data.error}`)
          }
          console.error('Audio file not found in Supabase:', normalizedInput)
          throw new Error(`Audio file not found: ${normalizedInput}`)
        }
      }
    } catch (error: any) {
      if (proxyFallback) {
        rememberUrl(filePath, proxyFallback)
        return proxyFallback
      }
      if (!isDevelopment) {
        console.error('Failed to resolve audio URL from Supabase:', error)
        throw error
      }
      console.warn('Failed to resolve audio URL from Supabase, using local path:', error)
    }
  }

  // Fallback: same-origin proxy if we already have one, else local path.
  if (proxyFallback) {
    rememberUrl(filePath, proxyFallback)
    return proxyFallback
  }
  const result = await preferExistingLocalAudio(normalizedInput)
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    rememberUrl(normalizedInput, result)
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
  const unique = [...new Set(filePaths.filter(Boolean))]
  if (typeof window !== 'undefined' && unique.length > 1) {
    try {
      const qs = unique.map((path) => `path=${encodeURIComponent(path)}`).join('&')
      const response = await fetch(`/api/audio/resolve?${qs}`)
      if (response.ok) {
        const data = await response.json()
        const items = Array.isArray(data.results) ? data.results : null
        if (items) {
          for (const item of items) {
            if (!item?.path || !item?.url) continue
            const raw = String(item.url)
            const out =
              playUrlFromResolve(item.path, item) ||
              (isDirectPlayableUrl(raw) ? raw : normalizeVaultAudioUrl(raw))
            rememberUrl(item.path, out, item.expiresIn > 60 ? (item.expiresIn - 60) * 1000 : undefined)
            resolved.set(item.path, out)
          }
        }
      }
    } catch {
      /* fall through to per-path */
    }
  }

  const missing = unique.filter((path) => !resolved.has(path))
  const results = await Promise.all(missing.map(async (path) => [path, await resolveAudioUrl(path)] as const))
  results.forEach(([path, url]) => resolved.set(path, url))
  return resolved
}
