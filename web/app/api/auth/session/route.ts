import { NextRequest, NextResponse } from 'next/server'
import { getServerSessionFromToken } from '@/lib/auth'
import { MW_SB_ACCESS_HEADER } from '@/lib/auth/middleware-bridge'
import { getRememberMaxAgeSeconds, isJwtExpired, refreshSupabaseSession } from '@/lib/auth/token'
import { fanHasPasswordCredential } from '@/lib/fan-password-credential'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const mwAccessToken = request.headers.get(MW_SB_ACCESS_HEADER)
    const authToken = request.cookies.get('sb-auth-token')?.value
    const refreshToken = request.cookies.get('sb-refresh-token')?.value
    const rememberCookie = request.cookies.get('sb-auth-remember')?.value

    let activeToken = mwAccessToken || authToken

    if ((!activeToken || isJwtExpired(activeToken)) && refreshToken && !mwAccessToken) {
      const refreshed = await refreshSupabaseSession(refreshToken)
      if (refreshed?.access_token) {
        activeToken = refreshed.access_token
        const refreshedSession = await getServerSessionFromToken(activeToken)
        if (!refreshedSession) {
          return NextResponse.json({ authenticated: false })
        }

        const maxAge = getRememberMaxAgeSeconds(rememberCookie)
        const hasPasswordCredential = refreshedSession.isAdmin
          ? true
          : await fanHasPasswordCredential(refreshedSession.user.id)
        const response = NextResponse.json({
          authenticated: true,
          user: {
            id: refreshedSession.user.id,
            email: refreshedSession.user.email,
          },
          isAdmin: refreshedSession.isAdmin,
          hasPasswordCredential,
        })
        response.cookies.set('sb-auth-token', refreshed.access_token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge,
          path: '/',
        })
        response.cookies.set('sb-refresh-token', refreshed.refresh_token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge,
          path: '/',
        })
        response.cookies.set('sb-auth-remember', rememberCookie === '1' ? '1' : '0', {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge,
          path: '/',
        })

        return response
      }
    }

    if (!activeToken) {
      return NextResponse.json({ authenticated: false })
    }

    const session = await getServerSessionFromToken(activeToken)
    if (!session) {
      return NextResponse.json({ authenticated: false })
    }

    const hasPasswordCredential = session.isAdmin
      ? true
      : await fanHasPasswordCredential(session.user.id)

    return NextResponse.json({
      authenticated: true,
      user: {
        id: session.user.id,
        email: session.user.email,
      },
      isAdmin: session.isAdmin,
      hasPasswordCredential,
    })
  } catch (error: any) {
    console.error('Session check error:', error)
    return NextResponse.json({ authenticated: false })
  }
}
