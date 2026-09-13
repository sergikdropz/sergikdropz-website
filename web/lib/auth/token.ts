const DEFAULT_REMEMBER_MAX_AGE = 60 * 60 * 24 * 7
const EXTENDED_REMEMBER_MAX_AGE = 60 * 60 * 24 * 30

function decodeBase64Url(input: string) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalized.length % 4 ? '='.repeat(4 - (normalized.length % 4)) : ''
  const base64 = normalized + padding

  if (typeof atob === 'function') {
    return atob(base64)
  }

  // Node fallback
  return Buffer.from(base64, 'base64').toString('utf8')
}

export function getJwtExpiryMs(token: string): number | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const decoded = JSON.parse(decodeBase64Url(payload))
    if (typeof decoded?.exp !== 'number') return null
    return decoded.exp * 1000
  } catch {
    return null
  }
}

export function isJwtExpired(token: string, skewMs = 60_000) {
  const expiry = getJwtExpiryMs(token)
  if (!expiry) return true
  return Date.now() + skewMs >= expiry
}

export function getRememberMaxAgeSeconds(rememberCookieValue?: string | null) {
  return rememberCookieValue === '1' ? EXTENDED_REMEMBER_MAX_AGE : DEFAULT_REMEMBER_MAX_AGE
}

type SupabaseRefreshResponse = {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
  user?: unknown
}

export async function refreshSupabaseSession(refreshToken: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) return null

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })

    if (!response.ok) return null

    const data = (await response.json()) as SupabaseRefreshResponse
    if (!data?.access_token || !data?.refresh_token) return null
    return data
  } catch {
    return null
  }
}
