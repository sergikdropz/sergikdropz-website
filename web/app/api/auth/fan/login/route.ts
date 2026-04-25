import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, clientKeyFromRequest } from '@/lib/rate-limit'
import { sendFanMagicLinkEmail } from '@/lib/fan-magic-link'

export const dynamic = 'force-dynamic'

const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 15

/**
 * Passwordless fan sign-in: sends a magic link (Supabase Auth).
 * Configure redirect URL in Supabase: `${SITE_URL}/auth/callback`
 */
export async function POST(request: NextRequest) {
  try {
    const rl = checkRateLimit(`fan-magic:${clientKeyFromRequest(request)}`, MAX_ATTEMPTS, WINDOW_MS)
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Too many requests. Try again later.' },
        {
          status: 429,
          headers: { 'Retry-After': String(rl.retryAfterSec) },
        },
      )
    }

    const body = await request.json().catch(() => ({}))
    const email = typeof body.email === 'string' ? body.email : ''
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : undefined
    const next = typeof body.next === 'string' ? body.next : undefined

    const result = await sendFanMagicLinkEmail(request, { email, displayName, next })
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({
      ok: true,
      message: 'Check your email for the sign-in link.',
    })
  } catch (error: unknown) {
    console.error('Fan magic link error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
