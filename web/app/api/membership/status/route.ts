import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { getSessionFromRequest } from '@/lib/auth/request-session'
import { findActiveMembershipRow } from '@/lib/membership-queries'
import { checkRateLimitAsync, clientKeyFromRequest } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

// Rate limit: 20 lookups per 5 minutes per IP — prevents email enumeration
const RATE_MAX = 20
const RATE_WINDOW_MS = 5 * 60 * 1000

type SafePayload = {
  planId: string
  status: string
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean | null
}

function membershipPayload(data: {
  plan_id: string
  status: string
  current_period_end: string | null
  cancel_at_period_end: boolean | null
  stripe_customer_id: string
}) {
  // stripe_customer_id is intentionally omitted from the public response.
  const safe: SafePayload = {
    planId: data.plan_id,
    status: data.status,
    currentPeriodEnd: data.current_period_end,
    cancelAtPeriodEnd: data.cancel_at_period_end,
  }
  return NextResponse.json({ active: true, membership: safe })
}

/**
 * GET /api/membership/status?email=...
 * Rate-limited. Returns membership status without exposing the Stripe customer ID.
 *
 * GET /api/membership/status (with auth cookies)
 * Signed-in user — lookup by user_id then fallback to email.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const emailParam = searchParams.get('email')

    // Apply rate limiting only for the unauthenticated email-param path.
    if (emailParam) {
      const ip = clientKeyFromRequest(request)
      const rl = await checkRateLimitAsync(`membership-status:${ip}`, RATE_MAX, RATE_WINDOW_MS)
      if (!rl.ok) {
        return NextResponse.json(
          { error: 'Too many requests' },
          {
            status: 429,
            headers: { 'Retry-After': String(rl.retryAfterSec) },
          }
        )
      }
    }

    const supabase = createSupabaseServerClient()

    if (emailParam) {
      const row = await findActiveMembershipRow(supabase, { email: emailParam.trim() })
      if (row) return membershipPayload(row)
      return NextResponse.json({ active: false, membership: null })
    }

    const session = await getSessionFromRequest(request)
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Provide ?email= or sign in to check membership' },
        { status: 400 }
      )
    }

    const row = await findActiveMembershipRow(supabase, {
      userId: session.user.id,
      email: session.user.email ?? null,
    })

    if (row) return membershipPayload(row)
    return NextResponse.json({ active: false, membership: null })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Membership status error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
