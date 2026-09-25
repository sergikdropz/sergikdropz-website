import { NextRequest, NextResponse } from 'next/server'
import { safeInternalPath } from '@/lib/safe-internal-path'
import {
  YT_SUB_GATE_COOKIE,
  YT_SUB_GATE_STATE_COOKIE,
  clearYtSubGateStateCookie,
  resolveSergikChannelId,
  sealYtSubGate,
  subscribeViewerToChannel,
  viewerSubscribesToChannel,
  youtubeOAuthClient,
  ytSubGateCookieOptions,
} from '@/lib/youtube/subscribe-gate'

export const dynamic = 'force-dynamic'

function finish(request: NextRequest, nextPath: string, flag: string, unlock = false) {
  const dest = new URL(nextPath, request.url)
  dest.searchParams.set('ytgate', flag)
  const response = NextResponse.redirect(dest)
  clearYtSubGateStateCookie(response, request)
  if (unlock) {
    const { token, maxAgeSec } = sealYtSubGate()
    response.cookies.set(YT_SUB_GATE_COOKIE, token, ytSubGateCookieOptions(request, maxAgeSec))
  }
  return response
}

export async function GET(request: NextRequest) {
  const stateParam = request.nextUrl.searchParams.get('state') || ''
  const stateDot = stateParam.indexOf('.')
  const state = stateDot >= 0 ? stateParam.slice(0, stateDot) : ''
  const encodedNext = stateDot >= 0 ? stateParam.slice(stateDot + 1) : ''
  let returnPath = '/music-library'
  try {
    returnPath = safeInternalPath(decodeURIComponent(encodedNext)) || '/music-library'
  } catch {
    returnPath = '/music-library'
  }

  const expected = request.cookies.get(YT_SUB_GATE_STATE_COOKIE)?.value
  if (!state || !expected || state !== expected) {
    return finish(request, returnPath, 'state')
  }

  const oauthError = request.nextUrl.searchParams.get('error')
  if (oauthError) {
    return finish(request, returnPath, oauthError === 'access_denied' ? 'denied' : 'error')
  }

  const code = request.nextUrl.searchParams.get('code')
  const client = youtubeOAuthClient()
  if (!code || !client) {
    return finish(request, returnPath, 'error')
  }

  const redirectUri = new URL('/api/youtube/subscribe-gate/callback', request.url).toString()
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: client.id,
      client_secret: client.secret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  const tokenData = await tokenResponse.json().catch(() => null)
  const accessToken = typeof tokenData?.access_token === 'string' ? tokenData.access_token : ''
  if (!tokenResponse.ok || !accessToken) {
    return finish(request, returnPath, 'error')
  }

  const channelId = await resolveSergikChannelId(accessToken)
  if (!channelId) {
    return finish(request, returnPath, 'channel')
  }

  let subscribed = await viewerSubscribesToChannel(accessToken, channelId)
  if (!subscribed) {
    const inserted = await subscribeViewerToChannel(accessToken, channelId)
    subscribed = inserted && (await viewerSubscribesToChannel(accessToken, channelId))
  }

  if (!subscribed) {
    return finish(request, returnPath, 'unsubscribed')
  }

  return finish(request, returnPath, 'ok', true)
}
