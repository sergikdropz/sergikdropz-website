import type { SupabaseClient } from '@supabase/supabase-js'
import { findActiveMembershipRow } from '@/lib/membership-queries'
import { entitlementsForPlan, type FanTier, type PlanEntitlements } from '@/lib/membership/entitlements'
import { getShopCreditBalanceCents } from '@/lib/shop/shop-credits'
import { getQuotaSnapshot, type QuotaSnapshot } from '@/lib/shop/member-download-quota'

type Db = SupabaseClient

export type ShopMemberBenefits = {
  tier: FanTier
  planId: string | null
  entitlements: PlanEntitlements | null
  shopCreditBalanceCents: number
  quota: QuotaSnapshot | null
  currentPeriodEnd: string | null
}

export async function loadShopMemberBenefits(
  supabase: Db,
  opts: { userId: string; email?: string | null },
): Promise<ShopMemberBenefits> {
  const row = await findActiveMembershipRow(supabase, opts)
  const entitlements = entitlementsForPlan(row?.plan_id)
  const tier: FanTier = entitlements?.id ?? 'free'
  const balance = await getShopCreditBalanceCents(supabase, opts.userId)

  let quota: QuotaSnapshot | null = null
  if (row && entitlements && row.current_period_end) {
    const periodEnd = row.current_period_end
    const periodStart =
      row.current_period_start ||
      new Date(new Date(periodEnd).getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
    quota = await getQuotaSnapshot(supabase, opts.userId, entitlements, periodStart, periodEnd)
  }

  return {
    tier,
    planId: row?.plan_id ?? null,
    entitlements,
    shopCreditBalanceCents: balance,
    quota,
    currentPeriodEnd: row?.current_period_end ?? null,
  }
}
