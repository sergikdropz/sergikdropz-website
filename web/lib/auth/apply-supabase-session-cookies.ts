import { NextResponse } from 'next/server'

export function applySupabaseSessionCookies(
  response: NextResponse,
  session: { access_token: string; refresh_token: string },
  rememberMe: boolean
) {
  const maxAge = rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * 24 * 7
  const opts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge,
    path: '/',
  }
  response.cookies.set('sb-auth-token', session.access_token, opts)
  response.cookies.set('sb-refresh-token', session.refresh_token, opts)
  response.cookies.set('sb-auth-remember', rememberMe ? '1' : '0', opts)
}
