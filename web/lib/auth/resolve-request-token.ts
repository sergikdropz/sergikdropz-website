import type { NextRequest } from 'next/server'
import { MW_SB_ACCESS_HEADER } from '@/lib/auth/middleware-bridge'
import { isJwtExpired, refreshSupabaseSession } from '@/lib/auth/token'

export type ResolvedRequestToken = {
  accessToken: string
  /** When refresh ran during resolution (caller may need to set cookies). */
  refreshed?: {
    accessToken: string
    refreshToken: string
    rememberCookie: string | undefined
  }
}

/**
 * Resolve a valid Supabase access token from middleware request cookies/headers.
 */
export async function resolveRequestAccessToken(
  request: NextRequest
): Promise<ResolvedRequestToken | null> {
  const mwToken = request.headers.get(MW_SB_ACCESS_HEADER)
  const accessToken = mwToken || request.cookies.get('sb-auth-token')?.value
  const refreshToken = request.cookies.get('sb-refresh-token')?.value
  const rememberCookie = request.cookies.get('sb-auth-remember')?.value

  if ((!accessToken || isJwtExpired(accessToken)) && !mwToken && refreshToken) {
    const refreshed = await refreshSupabaseSession(refreshToken)
    if (refreshed?.access_token) {
      return {
        accessToken: refreshed.access_token,
        refreshed: {
          accessToken: refreshed.access_token,
          refreshToken: refreshed.refresh_token,
          rememberCookie,
        },
      }
    }
  }

  if (!accessToken || isJwtExpired(accessToken)) {
    return null
  }

  return { accessToken }
}
