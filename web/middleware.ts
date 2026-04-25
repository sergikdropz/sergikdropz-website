import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getRememberMaxAgeSeconds, isJwtExpired, refreshSupabaseSession } from '@/lib/auth/token'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (
    process.env.ADMIN_PUBLIC_SETUP_DISABLED === '1' &&
    pathname === '/admin/setup'
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/admin/login'
    url.searchParams.set('setup', 'disabled')
    return NextResponse.redirect(url)
  }

  const isAdminRoute = pathname.startsWith('/admin')
  const isAdminApiRoute = pathname.startsWith('/api/admin')
  const isFanRoute = pathname.startsWith('/fan')
  const isFanApiRoute = pathname.startsWith('/api/fan')
  const isMembershipStatusApi = pathname === '/api/membership/status'
  const isMembershipManagePage = pathname === '/shop/membership/manage'
  const isMusicLibraryPage = pathname === '/music-library' || pathname.startsWith('/music-library/')
  const isMusicLibraryApi = pathname.startsWith('/api/music-library')
  const isAuthSessionRoute = pathname === '/api/auth/session'
  const isAuthPage = pathname === '/admin/login' || pathname === '/admin/setup'
  const isAuthApi = pathname.startsWith('/api/auth/')

  // Allow non-session auth APIs through without checks
  if (isAuthApi && !isAuthSessionRoute) {
    return NextResponse.next()
  }

  // Allow auth pages through but set header for layout
  if (isAuthPage) {
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-pathname', pathname)
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  const shouldProtect = isAdminRoute || isAdminApiRoute
  const shouldRefresh =
    shouldProtect ||
    isAuthSessionRoute ||
    isFanRoute ||
    isFanApiRoute ||
    isMembershipStatusApi ||
    isMembershipManagePage ||
    isMusicLibraryPage ||
    isMusicLibraryApi

  if (shouldRefresh) {
    const authToken = request.cookies.get('sb-auth-token')?.value
    const refreshToken = request.cookies.get('sb-refresh-token')?.value
    const rememberCookie = request.cookies.get('sb-auth-remember')?.value

    const needsRefresh = !authToken || isJwtExpired(authToken)
    if (needsRefresh && refreshToken) {
      const refreshed = await refreshSupabaseSession(refreshToken)
      if (refreshed) {
        const response = NextResponse.next()
        const maxAge = getRememberMaxAgeSeconds(rememberCookie)
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
        if (isAdminRoute) {
          response.headers.set('x-pathname', pathname)
        }
        return response
      }
    }

    if (shouldProtect && !authToken && !refreshToken) {
      if (isAdminApiRoute) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      const url = request.nextUrl.clone()
      url.pathname = '/admin/login'
      return NextResponse.redirect(url)
    }
  }

  if (isAdminRoute) {
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-pathname', pathname)
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/api/admin/:path*',
    '/api/auth/session',
    '/fan/:path*',
    '/api/fan/:path*',
    '/api/membership/status',
    '/shop/membership/manage',
    '/music-library',
    '/music-library/:path*',
    '/api/music-library/:path*',
  ],
}
