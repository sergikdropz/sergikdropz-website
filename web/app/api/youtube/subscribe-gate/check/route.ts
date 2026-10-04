import { NextRequest, NextResponse } from 'next/server'
import { normalizeFanTags, persistPromoContact, YOUTUBE_UNLOCK_SOURCE } from '@/lib/fan-crm'
import { checkRateLimit, clientKeyFromRequest } from '@/lib/rate-limit'
import { createSupabaseServerClient } from '@/lib/supabase'
import { YT_SUB_GATE_COOKIE, sealYtSubGate, ytSubGateCookieOptions } from '@/lib/youtube/subscribe-gate'
import {
  YT_SUBSCRIBER_PENDING_TAG,
  fanTagsConfirmYoutubeSubscriber,
  normalizeGateEmail,
} from '@/lib/youtube/subscribe-gate-email'

export const dynamic = 'force-dynamic'

const NOT_SUBSCRIBED =
  'This email is not confirmed as a subscriber yet. Subscribe on YouTube first. The video stays locked until it is.'

/** Unlock only when this email is already a confirmed subscriber on our side. */
export async function POST(request: NextRequest) {
  const rl = checkRateLimit(`yt-sub-check:${clientKeyFromRequest(request)}`, 20, 15 * 60 * 1000)
  if (!rl.ok) {
    return NextResponse.json(
      { unlocked: false, error: 'Too many checks. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  const body = await request.json().catch(() => ({}))
  const email = normalizeGateEmail(body.email)
  if (!email) {
    return NextResponse.json({
      unlocked: false,
      error: 'Enter the email on the Google account you use for YouTube.',
    })
  }

  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase.from('fans').select('tags').eq('email', email).maybeSingle()
  if (error) {
    console.warn('youtube subscriber check skipped:', error.code, error.message)
    return NextResponse.json({ unlocked: false, error: NOT_SUBSCRIBED })
  }

  const tags = normalizeFanTags(data?.tags)
  if (!fanTagsConfirmYoutubeSubscriber(tags)) {
    try {
      await persistPromoContact(supabase, {
        email,
        source: YOUTUBE_UNLOCK_SOURCE,
        tags: [YT_SUBSCRIBER_PENDING_TAG],
        platforms: ['youtube'],
      })
    } catch (persistError) {
      console.warn('youtube pending subscriber skipped:', persistError)
    }
    return NextResponse.json({ unlocked: false, error: NOT_SUBSCRIBED })
  }

  try {
    const { token, maxAgeSec } = sealYtSubGate()
    const response = NextResponse.json({ unlocked: true })
    response.cookies.set(YT_SUB_GATE_COOKIE, token, ytSubGateCookieOptions(request, maxAgeSec))
    return response
  } catch {
    return NextResponse.json({ unlocked: false, error: NOT_SUBSCRIBED }, { status: 500 })
  }
}
