/**
 * Shared browser fetch for `/api/auth/session` — one in-flight request + short TTL
 * so Header / vault / MusicPlayer don't stampede the route on cold load.
 */

export type BrowserAuthSession = {
  authenticated?: boolean
  isAdmin?: boolean
  user?: { id: string; email?: string | null }
}

const SESSION_TTL_MS = 15_000

let cached: { at: number; data: BrowserAuthSession | null } | null = null
let inFlight: Promise<BrowserAuthSession | null> | null = null

export async function fetchBrowserAuthSession(opts?: {
  force?: boolean
}): Promise<BrowserAuthSession | null> {
  // Skip on the server; allow vitest node via explicit window stub.
  if (typeof window === 'undefined') return null
  if (!opts?.force && cached && Date.now() - cached.at < SESSION_TTL_MS) {
    return cached.data
  }
  if (inFlight) return inFlight

  inFlight = (async () => {
    try {
      const response = await fetch('/api/auth/session', {
        credentials: 'include',
        cache: 'no-store',
      })
      if (!response.ok) {
        cached = { at: Date.now(), data: null }
        return null
      }
      const data = (await response.json()) as BrowserAuthSession
      cached = { at: Date.now(), data }
      return data
    } catch {
      cached = { at: Date.now(), data: null }
      return null
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

/** Test helper — clears TTL + in-flight. */
export function resetBrowserAuthSessionCacheForTests() {
  cached = null
  inFlight = null
}
