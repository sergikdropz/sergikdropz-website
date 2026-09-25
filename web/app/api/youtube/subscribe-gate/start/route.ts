import { NextRequest, NextResponse } from 'next/server'
import { safeInternalPath } from '@/lib/safe-internal-path'
import {
  YT_SUB_GATE_SCOPE,
  YT_SUB_GATE_STATE_COOKIE,
  YT_SUB_GATE_STATE_MAX_AGE_SEC,
  newYtSubGateState,
  youtubeOAuthClient,
  ytSubGateCookieOptions,
} from '@/lib/youtube/subscribe-gate'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const client = youtubeOAuthClient()
  const nextPath = safeInternalPath(request.nextUrl.searchParams.get('next')) || '/music-library'
  if (!client) {
    const fail = new URL(nextPath, request.url)
    fail.searchParams.set('ytgate', 'unconfigured')
    return NextResponse.redirect(fail)
  }

  const state = newYtSubGateState()
  const redirectUri = new URL('/api/youtube/subscribe-gate/callback', request.url).toString()
  const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  auth.searchParams.set('client_id', client.id)
  auth.searchParams.set('redirect_uri', redirectUri)
  auth.searchParams.set('response_type', 'code')
  auth.searchParams.set('scope', YT_SUB_GATE_SCOPE)
  auth.searchParams.set('access_type', 'online')
  auth.searchParams.set('prompt', 'select_account consent')
  auth.searchParams.set('include_granted_scopes', 'true')
  auth.searchParams.set('state', `${state}.${encodeURIComponent(nextPath)}`)

  const response = NextResponse.redirect(auth)
  response.cookies.set(YT_SUB_GATE_STATE_COOKIE, state, ytSubGateCookieOptions(request, YT_SUB_GATE_STATE_MAX_AGE_SEC))
  return response
}
