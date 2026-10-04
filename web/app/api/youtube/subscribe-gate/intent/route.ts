import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, clientKeyFromRequest } from '@/lib/rate-limit'
import {
  YT_SUB_INTENT_COOKIE,
  sealYtSubIntent,
  ytSubGateCookieOptions,
} from '@/lib/youtube/subscribe-gate'
import { normalizeGateEmail } from '@/lib/youtube/subscribe-gate-email'

export const dynamic = 'force-dynamic'

async function rememberEmail(request: NextRequest, email: string) {
  const { token, maxAgeSec } = sealYtSubIntent(email)
  const response = NextResponse.json({ ok: true })
  response.cookies.set(YT_SUB_INTENT_COOKIE, token, ytSubGateCookieOptions(request, maxAgeSec))
  return response
}

/** Remember the email without leaving the music page. */
export async function POST(request: NextRequest) {
  const rl = checkRateLimit(`yt-sub-intent:${clientKeyFromRequest(request)}`, 30, 15 * 60 * 1000)
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: 'Too many attempts. Try again later.' }, { status: 429 })
  }
  const body = await request.json().catch(() => ({}))
  const email = normalizeGateEmail(body.email)
  if (!email) {
    return NextResponse.json(
      { ok: false, error: 'Enter the email on the Google account you use for YouTube.' },
      { status: 400 },
    )
  }
  return rememberEmail(request, email)
}

/** Remember the email, then open the floating subscribe window. The library page is not redirected. */
export async function GET(request: NextRequest) {
  const rl = checkRateLimit(`yt-sub-intent:${clientKeyFromRequest(request)}`, 30, 15 * 60 * 1000)
  const dest = new URL('/youtube-subscribe', request.url)
  if (!rl.ok) {
    dest.searchParams.set('error', 'rate')
    return NextResponse.redirect(dest)
  }

  const email = normalizeGateEmail(request.nextUrl.searchParams.get('email'))
  if (!email) {
    dest.searchParams.set('error', 'email')
    return NextResponse.redirect(dest)
  }

  const { token, maxAgeSec } = sealYtSubIntent(email)
  const response = NextResponse.redirect(dest)
  response.cookies.set(YT_SUB_INTENT_COOKIE, token, ytSubGateCookieOptions(request, maxAgeSec))
  return response
}
