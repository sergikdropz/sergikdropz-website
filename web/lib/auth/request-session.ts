import type { NextRequest } from 'next/server'
import { getServerSessionFromToken, type ServerAuthSession } from '@/lib/auth'
import { MW_SB_ACCESS_HEADER } from '@/lib/auth/middleware-bridge'
import { isJwtExpired } from '@/lib/auth/token'

export function getBearerFromCookies(request: NextRequest): string | null {
  return request.cookies.get('sb-auth-token')?.value ?? null
}

/**
 * Prefer the middleware-refreshed access token header when present.
 * Cookie alone can still be the expired JWT while middleware already refreshed
 * for this request — fan APIs were 401ing despite /api/auth/session succeeding.
 */
export function getAccessTokenFromRequest(request: NextRequest): string | null {
  const mwToken = request.headers.get(MW_SB_ACCESS_HEADER)?.trim()
  if (mwToken) return mwToken

  const cookieToken = getBearerFromCookies(request)
  if (cookieToken && !isJwtExpired(cookieToken)) return cookieToken
  // Last resort: expired cookie (getUser may still succeed briefly / for clock skew)
  return cookieToken
}

export async function getSessionFromRequest(request: NextRequest): Promise<ServerAuthSession | null> {
  const token = getAccessTokenFromRequest(request)
  if (!token) return null
  return getServerSessionFromToken(token)
}
