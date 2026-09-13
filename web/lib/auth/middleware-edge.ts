/**
 * Edge-safe helpers for middleware only. Do not import @/lib/auth or @/lib/supabase here.
 */

export function isAdminEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false
  const adminEmails =
    process.env.ADMIN_EMAILS?.split(',').map((e) => e.trim().toLowerCase()) || []
  if (adminEmails.length === 0) {
    // No allowlist configured — defer full admin check to server layouts/API routes.
    return true
  }
  return adminEmails.includes(email.toLowerCase())
}

const ACCESS_CACHE_TTL_MS = 60_000
const accessCache = new Map<string, { allowed: boolean; expiresAt: number }>()

function tokenCacheKey(accessToken: string): string {
  // Avoid storing full JWTs in the map key forever — use a stable slice + length.
  return `${accessToken.length}:${accessToken.slice(0, 24)}:${accessToken.slice(-24)}`
}

/** Validate JWT with Supabase Auth (fetch-only, Edge compatible). */
export async function fetchSupabaseUserEmail(
  accessToken: string
): Promise<string | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) return null

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
    })
    if (!response.ok) return null
    const data = (await response.json()) as { email?: string }
    return data.email ?? null
  } catch {
    return null
  }
}

/**
 * Lightweight gate: valid session + optional ADMIN_EMAILS allowlist.
 * Cached ~60s per token so admin navigations don't hit Supabase Auth on every RSC.
 * Database `admins` table checks run in server layouts and API routes only.
 */
export async function middlewareHasAdminAccess(accessToken: string): Promise<boolean> {
  const key = tokenCacheKey(accessToken)
  const now = Date.now()
  const hit = accessCache.get(key)
  if (hit && hit.expiresAt > now) {
    return hit.allowed
  }

  const email = await fetchSupabaseUserEmail(accessToken)
  const allowed = Boolean(email) && isAdminEmailAllowed(email)
  accessCache.set(key, { allowed, expiresAt: now + ACCESS_CACHE_TTL_MS })

  // Bound memory in long-lived edge isolates
  if (accessCache.size > 200) {
    for (const [k, v] of accessCache) {
      if (v.expiresAt <= now) accessCache.delete(k)
    }
  }

  return allowed
}
