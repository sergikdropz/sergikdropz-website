import { NextRequest, NextResponse } from 'next/server'
import { MW_SB_ACCESS_HEADER } from '@/lib/auth/middleware-bridge'
import { getRememberMaxAgeSeconds, isJwtExpired, refreshSupabaseSession } from '@/lib/auth/token'

export type MiddlewareRefreshResult = {
  accessToken: string
  refreshToken: string
  rememberCookie: string | undefined
}

/**
 * When the access JWT is missing/expired but a refresh token exists, refresh once.
 * Returns new tokens or null if refresh is not possible.
 */
export async function tryMiddlewareSessionRefresh(
  request: NextRequest
): Promise<MiddlewareRefreshResult | null> {
  const authToken = request.cookies.get('sb-auth-token')?.value
  const refreshToken = request.cookies.get('sb-refresh-token')?.value
  const rememberCookie = request.cookies.get('sb-auth-remember')?.value

  const needsRefresh = !authToken || isJwtExpired(authToken)
  if (!needsRefresh || !refreshToken) {
    return null
  }

  const refreshed = await refreshSupabaseSession(refreshToken)
  if (!refreshed?.access_token || !refreshed?.refresh_token) {
    return null
  }

  return {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token,
    rememberCookie,
  }
}

export function applyRefreshedSessionCookies(
  response: NextResponse,
  refreshed: MiddlewareRefreshResult
) {
  const maxAge = getRememberMaxAgeSeconds(refreshed.rememberCookie)
  const remember = refreshed.rememberCookie === '1' ? '1' : '0'

  response.cookies.set('sb-auth-token', refreshed.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge,
    path: '/',
  })
  response.cookies.set('sb-refresh-token', refreshed.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge,
    path: '/',
  })
  response.cookies.set('sb-auth-remember', remember, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge,
    path: '/',
  })
}

export function nextWithRefreshedSession(
  request: NextRequest,
  refreshed: MiddlewareRefreshResult,
  extraRequestHeaders?: Headers
): NextResponse {
  const requestHeaders = extraRequestHeaders ?? new Headers(request.headers)
  requestHeaders.delete(MW_SB_ACCESS_HEADER)
  requestHeaders.set(MW_SB_ACCESS_HEADER, refreshed.accessToken)

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  })
  applyRefreshedSessionCookies(response, refreshed)
  return response
}
