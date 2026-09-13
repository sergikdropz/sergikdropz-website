import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { getSessionFromRequest } from '@/lib/auth/request-session'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createSupabaseServerClient()
    const uid = session.user.id
    const email = session.user.email?.toLowerCase()

    const { data: byUser, error: e1 } = await supabase
      .from('memberships')
      .select(
        'plan_id,status,current_period_end,cancel_at_period_end,stripe_customer_id,stripe_subscription_id'
      )
      .eq('user_id', uid)
      .in('status', ['active', 'trialing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!e1 && byUser) {
      return NextResponse.json({
        active: true,
        tier: 'paid' as const,
        membership: {
          planId: byUser.plan_id,
          status: byUser.status,
          currentPeriodEnd: byUser.current_period_end,
          cancelAtPeriodEnd: byUser.cancel_at_period_end,
          stripeCustomerId: byUser.stripe_customer_id,
        },
      })
    }

    if (email) {
      const { data: byEmail, error: e2 } = await supabase
        .from('memberships')
        .select(
          'plan_id,status,current_period_end,cancel_at_period_end,stripe_customer_id,stripe_subscription_id'
        )
        .eq('customer_email', email)
        .in('status', ['active', 'trialing'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!e2 && byEmail) {
        return NextResponse.json({
          active: true,
          tier: 'paid' as const,
          membership: {
            planId: byEmail.plan_id,
            status: byEmail.status,
            currentPeriodEnd: byEmail.current_period_end,
            cancelAtPeriodEnd: byEmail.cancel_at_period_end,
            stripeCustomerId: byEmail.stripe_customer_id,
          },
        })
      }
    }

    return NextResponse.json({ active: false, tier: 'free' as const, membership: null })
  } catch (e) {
    console.error('GET /api/fan/membership', e)
    return NextResponse.json({ active: false, tier: 'free' as const, membership: null })
  }
}
