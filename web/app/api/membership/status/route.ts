import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { getSessionFromRequest } from '@/lib/auth/request-session'
import { findActiveMembershipRow } from '@/lib/membership-queries'

export const dynamic = 'force-dynamic'

function membershipPayload(data: {
  plan_id: string
  status: string
  current_period_end: string | null
  cancel_at_period_end: boolean | null
  stripe_customer_id: string
}) {
  return NextResponse.json({
    active: true,
    membership: {
      planId: data.plan_id,
      status: data.status,
      currentPeriodEnd: data.current_period_end,
      cancelAtPeriodEnd: data.cancel_at_period_end,
      stripeCustomerId: data.stripe_customer_id,
    },
  })
}

/**
 * GET /api/membership/status?email=...
 * Explicit email (e.g. manage page) — lookup by email only.
 *
 * GET /api/membership/status (with cookies)
 * Signed-in user — try user_id on memberships, then fall back to session email.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const emailParam = searchParams.get('email')

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
