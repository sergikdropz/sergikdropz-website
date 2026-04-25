import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, clientKeyFromRequest } from '@/lib/rate-limit'
import { sendFanMagicLinkEmail } from '@/lib/fan-magic-link'

export const dynamic = 'force-dynamic'

const WINDOW_MS = 60 * 60 * 1000
const MAX_ATTEMPTS = 15

/**
 * Passwordless registration: same magic-link flow as login.
 */
export async function POST(request: NextRequest) {
  const rl = checkRateLimit(`fan-register:${clientKeyFromRequest(request)}`, MAX_ATTEMPTS, WINDOW_MS)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many registration attempts. Try again later.' },
      {
        status: 429,
        headers: { 'Retry-After': String(rl.retryAfterSec) },
      },
    )
  }

  const body = await request.json().catch(() => ({}))
  const email = typeof body.email === 'string' ? body.email : ''
  const displayName = typeof body.displayName === 'string' ? body.displayName : undefined
  const next = typeof body.next === 'string' ? body.next : '/fan/account'

  const result = await sendFanMagicLinkEmail(request, { email, displayName, next })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({
    ok: true,
    needsEmailConfirm: true,
    message: 'Check your email to finish creating your account.',
  })
}
