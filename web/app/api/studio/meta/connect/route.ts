import { randomBytes } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { metaOAuthDialogUrl } from '@/lib/meta/graph'
import { META_OAUTH_STATE_COOKIE } from '@/lib/meta/connection'
import { safeInternalPath } from '@/lib/safe-internal-path'

export const dynamic = 'force-dynamic'

function redirectUri(request: NextRequest): string {
  return new URL('/api/studio/meta/callback', request.url).toString()
}

export async function GET(request: NextRequest) {
  const session = await getServerSession()
  if (!session?.isAdmin) {
    const login = new URL('/admin/login', request.url)
    login.searchParams.set('next', '/studio/pipeline')
    return NextResponse.redirect(login)
  }

  const nextPath = safeInternalPath(request.nextUrl.searchParams.get('next')) || '/studio/pipeline'
  const state = randomBytes(24).toString('base64url')
  const dialog = metaOAuthDialogUrl(redirectUri(request), `${state}.${encodeURIComponent(nextPath)}`)
  if (!dialog) {
    const back = new URL(nextPath, request.url)
    back.searchParams.set('meta', 'missing_app')
    return NextResponse.redirect(back)
  }

  const response = NextResponse.redirect(dialog)
  response.cookies.set(META_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10,
    path: '/',
  })
  return response
}
