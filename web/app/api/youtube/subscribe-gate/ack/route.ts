import { NextRequest, NextResponse } from 'next/server'
import { persistPromoContact, YOUTUBE_UNLOCK_SOURCE, YOUTUBE_UNLOCK_TAG } from '@/lib/fan-crm'
import { checkRateLimit, clientKeyFromRequest } from '@/lib/rate-limit'
import { createSupabaseServerClient } from '@/lib/supabase'
import {
  YT_SUB_GATE_COOKIE,
  confirmViewerSubscribedToSergik,
  emailFromGoogleAccessToken,
  sealYtSubGate,
  ytSubGateCookieOptions,
} from '@/lib/youtube/subscribe-gate'

export const dynamic = 'force-dynamic'

const ACK_ERRORS: Record<string, string> = {
  channel: 'The SERGIK YouTube channel could not be confirmed.',
  unsubscribed: 'Subscribe to @sergikdropz on YouTube, then try again.',
  error: 'YouTube could not confirm the subscription. Try again.',
}

/** In-page unlock after Google token — verifies subscription via YouTube Data API. */
export async function POST(request: NextRequest) {
  const rl = checkRateLimit(`yt-sub-gate:${clientKeyFromRequest(request)}`, 20, 15 * 60 * 1000)
  if (!rl.ok) {
    return NextResponse.json(
      { unlocked: false, error: 'Too many attempts. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  const body = await request.json().catch(() => ({}))
  const skipCrm = body.promoConsent === 'denied'
  const accessToken = typeof body.accessToken === 'string' ? body.accessToken.trim() : ''
  if (!accessToken) {
    return NextResponse.json({ unlocked: false, needsAccount: true })
  }

  const confirmed = await confirmViewerSubscribedToSergik(accessToken)
  if (!confirmed.ok) {
    return NextResponse.json({
      unlocked: false,
      error: ACK_ERRORS[confirmed.reason] || ACK_ERRORS.error,
    })
  }

  const email = await emailFromGoogleAccessToken(accessToken)
  if (email && !skipCrm) {
    try {
      await persistPromoContact(createSupabaseServerClient(), {
        email,
        source: YOUTUBE_UNLOCK_SOURCE,
        tags: [YOUTUBE_UNLOCK_TAG, 'subscriber'],
        platforms: ['youtube'],
      })
    } catch (error) {
      console.warn('youtube unlock contact skipped:', error)
    }
  }

  try {
    const { token, maxAgeSec } = sealYtSubGate()
    const response = NextResponse.json({ unlocked: true, channelId: confirmed.channelId })
    response.cookies.set(YT_SUB_GATE_COOKIE, token, ytSubGateCookieOptions(request, maxAgeSec))
    return response
  } catch {
    return NextResponse.json({ unlocked: false }, { status: 500 })
  }
}
