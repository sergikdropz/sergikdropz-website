import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { connectMetaFromUserToken, META_OAUTH_STATE_COOKIE } from '@/lib/meta/connection'
import { exchangeMetaCode } from '@/lib/meta/graph'
import { safeInternalPath } from '@/lib/safe-internal-path'

export const dynamic = 'force-dynamic'

function finish(request: NextRequest, nextPath: string, flag: string) {
  const dest = new URL(nextPath, request.url)
  dest.searchParams.set('meta', flag)
  const response = NextResponse.redirect(dest)
  response.cookies.set(META_OAUTH_STATE_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
  return response
}

export async function GET(request: NextRequest) {
  const session = await getServerSession()
  const stateParam = request.nextUrl.searchParams.get('state') || ''
  const stateDot = stateParam.indexOf('.')
  const state = stateDot >= 0 ? stateParam.slice(0, stateDot) : ''
  const encodedNext = stateDot >= 0 ? stateParam.slice(stateDot + 1) : ''
  let returnPath = '/studio/pipeline'
  try {
    returnPath = safeInternalPath(decodeURIComponent(encodedNext)) || '/studio/pipeline'
  } catch {
    returnPath = '/studio/pipeline'
  }

  if (!session?.isAdmin) return finish(request, returnPath, 'unauthorized')

  const expected = request.cookies.get(META_OAUTH_STATE_COOKIE)?.value
  if (!state || !expected || state !== expected) return finish(request, returnPath, 'state')

  const oauthError = request.nextUrl.searchParams.get('error')
  if (oauthError) return finish(request, returnPath, oauthError === 'access_denied' ? 'denied' : 'error')

  const code = request.nextUrl.searchParams.get('code')
  if (!code) return finish(request, returnPath, 'error')

  try {
    const redirectUri = new URL('/api/studio/meta/callback', request.url).toString()
    const token = await exchangeMetaCode(code, redirectUri)
    await connectMetaFromUserToken(token)
    return finish(request, returnPath, 'connected')
  } catch {
    return finish(request, returnPath, 'error')
  }
}
