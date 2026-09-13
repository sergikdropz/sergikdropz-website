import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isAdminAuthPath } from '@/lib/auth/admin-paths'
import { MW_SB_ACCESS_HEADER } from '@/lib/auth/middleware-bridge'
import { middlewareHasAdminAccess } from '@/lib/auth/middleware-edge'
import {
  nextWithRefreshedSession,
  tryMiddlewareSessionRefresh,
} from '@/lib/auth/middleware-refresh'
import { resolveRequestAccessToken } from '@/lib/auth/resolve-request-token'

function stripInternalMiddlewareHeaders(request: NextRequest): Headers {
  const requestHeaders = new Headers(request.headers)
  requestHeaders.delete(MW_SB_ACCESS_HEADER)
  return requestHeaders
}

function withPathnameHeader(request: NextRequest, pathname: string): Headers {
  const requestHeaders = stripInternalMiddlewareHeaders(request)
  requestHeaders.set('x-pathname', pathname)
  return requestHeaders
}

function adminLoginRedirect(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone()
  url.pathname = '/admin/login'
  const response = NextResponse.redirect(url)
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')
  return response
}

async function denyUnlessAdmin(
  request: NextRequest,
  accessToken: string,
  isApi: boolean
): Promise<NextResponse | null> {
  const allowed = await middlewareHasAdminAccess(accessToken)
  if (allowed) return null

  if (isApi) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return adminLoginRedirect(request)
}

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
  const isStudioRoute = pathname.startsWith('/studio')
  const isAdminApiRoute = pathname.startsWith('/api/admin')
  const isStudioApiRoute = pathname.startsWith('/api/studio')
  // Public studio catalog for marketing pages — not admin-gated in middleware.
  const isPublicStudioApi = pathname === '/api/studio/releases/public'
  const isNurturingApiRoute = pathname.startsWith('/api/nurturing')
  const isPrivilegedOpsApi =
    isAdminApiRoute ||
    (isStudioApiRoute && !isPublicStudioApi) ||
    isNurturingApiRoute
  const isAdminProtectedPage =
    (isAdminRoute && !isAdminAuthPath(pathname)) || isStudioRoute
  const isFanRoute = pathname.startsWith('/fan')
  const isFanApiRoute = pathname.startsWith('/api/fan')
  const isMembershipStatusApi = pathname === '/api/membership/status'
  const isMembershipManagePage = pathname === '/shop/membership/manage'
  const isMusicLibraryPage =
    pathname === '/music-library' || pathname.startsWith('/music-library/')
  const isMusicLibraryApi = pathname.startsWith('/api/music-library')
  const isAuthSessionRoute = pathname === '/api/auth/session'
  const isAuthPage = isAdminAuthPath(pathname)
  const isAuthApi = pathname.startsWith('/api/auth/')

  if (isAuthApi && !isAuthSessionRoute) {
    const requestHeaders = stripInternalMiddlewareHeaders(request)
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  const shouldRefresh =
    isAdminRoute ||
    isStudioRoute ||
    isPrivilegedOpsApi ||
    isAuthSessionRoute ||
    isFanRoute ||
    isFanApiRoute ||
    isMembershipStatusApi ||
    isMembershipManagePage ||
    isMusicLibraryPage ||
    isMusicLibraryApi

  if (shouldRefresh) {
    const refreshed = await tryMiddlewareSessionRefresh(request)

    if (refreshed) {
      const requestHeaders = withPathnameHeader(request, pathname)
      if (isAdminProtectedPage || isPrivilegedOpsApi) {
        const denied = await denyUnlessAdmin(
          request,
          refreshed.accessToken,
          isPrivilegedOpsApi
        )
        if (denied) return denied
      }
      return nextWithRefreshedSession(request, refreshed, requestHeaders)
    }
  }

  if (isAdminProtectedPage) {
    const resolved = await resolveRequestAccessToken(request)
    if (!resolved?.accessToken) {
      return adminLoginRedirect(request)
    }
    const denied = await denyUnlessAdmin(request, resolved.accessToken, false)
    if (denied) return denied

    const requestHeaders = withPathnameHeader(request, pathname)
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  if (isPrivilegedOpsApi) {
    const resolved = await resolveRequestAccessToken(request)
    if (!resolved?.accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const denied = await denyUnlessAdmin(request, resolved.accessToken, true)
    if (denied) return denied

    const requestHeaders = stripInternalMiddlewareHeaders(request)
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  if (isAuthPage) {
    const requestHeaders = withPathnameHeader(request, pathname)
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  if (isAdminRoute) {
    const requestHeaders = withPathnameHeader(request, pathname)
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/admin',
    '/admin/:path*',
    '/studio',
    '/studio/:path*',
    '/api/admin/:path*',
    '/api/studio/:path*',
    '/api/nurturing/:path*',
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
