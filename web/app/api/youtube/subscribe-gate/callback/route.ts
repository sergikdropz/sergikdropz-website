import { NextRequest, NextResponse } from 'next/server'
import { persistPromoContact, YOUTUBE_UNLOCK_SOURCE, YOUTUBE_UNLOCK_TAG } from '@/lib/fan-crm'
import { safeInternalPath } from '@/lib/safe-internal-path'
import { createSupabaseServerClient } from '@/lib/supabase'
import {
  YT_SUB_GATE_COOKIE,
  YT_SUB_GATE_POPUP_COOKIE,
  YT_SUB_GATE_STATE_COOKIE,
  clearYtSubGateStateCookie,
  confirmViewerSubscribedToSergik,
  emailFromGoogleAccessToken,
  sealYtSubGate,
  youtubeOAuthClient,
  youtubeSubscribePopupResult,
  ytSubGateCookieOptions,
} from '@/lib/youtube/subscribe-gate'

export const dynamic = 'force-dynamic'

function finish(request: NextRequest, nextPath: string, flag: string, unlock = false) {
  if (request.cookies.get(YT_SUB_GATE_POPUP_COOKIE)?.value === '1') {
    return youtubeSubscribePopupResult(request, flag, unlock)
  }
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

  const confirmed = await confirmViewerSubscribedToSergik(accessToken)
  if (!confirmed.ok) {
    return finish(request, returnPath, confirmed.reason === 'channel' ? 'channel' : 'unsubscribed')
  }

  const email = await emailFromGoogleAccessToken(accessToken)
  if (email) {
    try {
      await persistPromoContact(createSupabaseServerClient(), {
        email,
        source: YOUTUBE_UNLOCK_SOURCE,
        tags: [YOUTUBE_UNLOCK_TAG, 'subscriber'],
        platforms: ['youtube'],
      })
    } catch (error) {
      console.warn('youtube oauth unlock contact skipped:', error)
    }
  }

  return finish(request, returnPath, 'ok', true)
}
