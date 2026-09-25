import { NextRequest, NextResponse } from 'next/server'
import { persistPromoContact, YOUTUBE_UNLOCK_SOURCE, YOUTUBE_UNLOCK_TAG } from '@/lib/fan-crm'
import { getFanVaultUnlockEmailFromRequest } from '@/lib/fan-vault-unlock-cookie'
import { checkRateLimit, clientKeyFromRequest } from '@/lib/rate-limit'
import { createSupabaseServerClient } from '@/lib/supabase'
import {
  YT_SUB_GATE_COOKIE,
  emailFromGoogleAccessToken,
  sealYtSubGate,
  ytSubGateCookieOptions,
} from '@/lib/youtube/subscribe-gate'

export const dynamic = 'force-dynamic'

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const email = value.trim().toLowerCase()
  if (!email.includes('@') || email.length > 320) return null
  return email
}

/** In-page unlock. Saves the email to the promo list and never leaves the music library. */
export async function POST(request: NextRequest) {
  const rl = checkRateLimit(`yt-sub-gate:${clientKeyFromRequest(request)}`, 20, 15 * 60 * 1000)
  if (!rl.ok) {
    return NextResponse.json(
      { unlocked: false, error: 'Too many attempts. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  const body = await request.json().catch(() => ({}))
  if (body.promoConsent === 'denied') {
    try {
      const { token, maxAgeSec } = sealYtSubGate()
      const response = NextResponse.json({ unlocked: true })
      response.cookies.set(YT_SUB_GATE_COOKIE, token, ytSubGateCookieOptions(request, maxAgeSec))
      return response
    } catch {
      return NextResponse.json({ unlocked: false }, { status: 500 })
    }
  }

  let email = normalizeEmail(body.email)
  if (!email) email = getFanVaultUnlockEmailFromRequest(request)
  if (!email && typeof body.accessToken === 'string') {
    email = await emailFromGoogleAccessToken(body.accessToken)
  }
  if (!email) {
    return NextResponse.json({ unlocked: false, needsAccount: true })
  }

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

  try {
    const { token, maxAgeSec } = sealYtSubGate()
    const response = NextResponse.json({ unlocked: true })
    response.cookies.set(YT_SUB_GATE_COOKIE, token, ytSubGateCookieOptions(request, maxAgeSec))
    return response
  } catch {
    return NextResponse.json({ unlocked: false }, { status: 500 })
  }
}
