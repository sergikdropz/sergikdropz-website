import { createSupabaseServerClient } from '@/lib/supabase'

export type ActiveMembershipRow = {
  plan_id: string
  status: string
  current_period_end: string | null
  cancel_at_period_end: boolean | null
  stripe_customer_id: string
}

type SupabaseServer = ReturnType<typeof createSupabaseServerClient>

export async function findActiveMembershipRow(
  supabase: SupabaseServer,
  opts: { userId?: string; email?: string | null }
): Promise<ActiveMembershipRow | null> {
  if (opts.userId) {
    const { data, error } = await supabase
      .from('memberships')
      .select('plan_id,status,current_period_end,cancel_at_period_end,stripe_customer_id')
      .eq('user_id', opts.userId)
      .in('status', ['active', 'trialing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!error && data) return data
  }

  if (opts.email) {
    const { data, error } = await supabase
      .from('memberships')
      .select('plan_id,status,current_period_end,cancel_at_period_end,stripe_customer_id')
      .eq('customer_email', opts.email.toLowerCase())
      .in('status', ['active', 'trialing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!error && data) return data
  }

  return null
}
