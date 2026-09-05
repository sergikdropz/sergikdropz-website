import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export type FanJourneyMetrics = {
  visitors: number
  emailSubscribers: number
  fanAccounts: number
  purchasers: number
  activeMembers: number
  totalRevenue: number
  timestamp: string
}

/** GET /api/admin/fan-journey — aggregates the full fan funnel in one DB round-trip. */
export async function GET() {
  const session = await getServerSession()
  if (!session?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createSupabaseServerClient()

  const [
    { count: emailSubscribers },
    { count: fanAccounts },
    purchasesResult,
    { count: activeMembers },
    analyticsResult,
  ] = await Promise.all([
    supabase
      .from('email_subscribers')
      .select('id', { count: 'exact', head: true })
      .eq('active', true),
    supabase
      .from('fan_profiles')
      .select('id', { count: 'exact', head: true }),
    supabase
      .from('purchases')
      .select('id, amount_paid', { count: 'exact' })
      .not('amount_paid', 'is', null),
    supabase
      .from('memberships')
      .select('id', { count: 'exact', head: true })
      .in('status', ['active', 'trialing']),
    supabase
      .from('analytics_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_type', 'page_view')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
  ])

  const totalRevenue = (purchasesResult.data ?? []).reduce(
    (sum: number, p: { amount_paid: number | null }) => sum + (p.amount_paid ?? 0),
    0
  )

  const metrics: FanJourneyMetrics = {
    visitors: analyticsResult.count ?? 0,
    emailSubscribers: emailSubscribers ?? 0,
    fanAccounts: fanAccounts ?? 0,
    purchasers: purchasesResult.count ?? 0,
    activeMembers: activeMembers ?? 0,
    totalRevenue,
    timestamp: new Date().toISOString(),
  }

  return NextResponse.json(metrics)
}
