import { NextRequest, NextResponse } from 'next/server'
import { persistPromoContact, YOUTUBE_UNLOCK_SOURCE } from '@/lib/fan-crm'
import { checkRateLimit, clientKeyFromRequest } from '@/lib/rate-limit'
import { createSupabaseServerClient } from '@/lib/supabase'
import {
  YT_SUB_GATE_COOKIE,
  YT_SUB_INTENT_COOKIE,
  readYtSubIntent,
  sealYtSubGate,
  ytSubGateCookieOptions,
} from '@/lib/youtube/subscribe-gate'
import { YT_SUBSCRIBER_CONFIRMED_TAG } from '@/lib/youtube/subscribe-gate-email'

export const dynamic = 'force-dynamic'

/** Called from the floating window after the fan uses the channel Subscribe button. */
export async function POST(request: NextRequest) {
  const rl = checkRateLimit(`yt-sub-confirm:${clientKeyFromRequest(request)}`, 20, 15 * 60 * 1000)
  if (!rl.ok) {
    return NextResponse.json(
      { unlocked: false, error: 'Too many attempts. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  const email = readYtSubIntent(request.cookies.get(YT_SUB_INTENT_COOKIE)?.value)
  if (!email) {
    return NextResponse.json({
      unlocked: false,
      error: 'Open Subscribe to watch again, then use the YouTube Subscribe button.',
    })
  }

  try {
    await persistPromoContact(createSupabaseServerClient(), {
      email,
      source: YOUTUBE_UNLOCK_SOURCE,
      tags: [YT_SUBSCRIBER_CONFIRMED_TAG, 'subscriber'],
      platforms: ['youtube'],
    })
  } catch (error) {
    console.warn('youtube subscriber confirm skipped:', error)
  }

  try {
    const { token, maxAgeSec } = sealYtSubGate()
    const response = NextResponse.json({ unlocked: true })
    response.cookies.set(YT_SUB_GATE_COOKIE, token, ytSubGateCookieOptions(request, maxAgeSec))
    response.cookies.set(YT_SUB_INTENT_COOKIE, '', { ...ytSubGateCookieOptions(request, 0), maxAge: 0 })
    return response
  } catch {
    return NextResponse.json({ unlocked: false }, { status: 500 })
  }
}
