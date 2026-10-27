import type { SupabaseClient } from '@supabase/supabase-js'
import { CREDIT_EXPIRY_MONTHS, type MembershipPlanId } from '@/lib/membership/entitlements'

type Db = SupabaseClient

function addMonthsIso(from: Date, months: number): string {
  const d = new Date(from)
  d.setMonth(d.getMonth() + months)
  return d.toISOString()
}

export async function expireStaleCredits(supabase: Db, userId: string): Promise<void> {
  const now = new Date().toISOString()
  const { data: rows } = await supabase
    .from('shop_credit_ledger')
    .select('id, delta_cents, expires_at, kind')
    .eq('user_id', userId)
    .eq('kind', 'subscription_grant')
    .lt('expires_at', now)
    .gt('delta_cents', 0)

  if (!rows?.length) return

  for (const row of rows) {
    const { data: already } = await supabase
      .from('shop_credit_ledger')
      .select('id')
      .eq('kind', 'expire')
      .eq('note', `expire:${row.id}`)
      .maybeSingle()
    if (already) continue

    const amount = Number(row.delta_cents) || 0
    if (amount <= 0) continue

    const { data: account } = await supabase
      .from('shop_credit_accounts')
      .select('balance_cents')
      .eq('user_id', userId)
      .maybeSingle()

    const balance = Number(account?.balance_cents) || 0
    const deduct = Math.min(balance, amount)
    if (deduct <= 0) continue

    await supabase.from('shop_credit_ledger').insert({
      user_id: userId,
      delta_cents: -deduct,
      kind: 'expire',
      note: `expire:${row.id}`,
    })

    await supabase
      .from('shop_credit_accounts')
      .upsert({
        user_id: userId,
        balance_cents: balance - deduct,
        updated_at: now,
      })
  }
}

export async function getShopCreditBalanceCents(supabase: Db, userId: string): Promise<number> {
  await expireStaleCredits(supabase, userId)
  const { data } = await supabase
    .from('shop_credit_accounts')
    .select('balance_cents')
    .eq('user_id', userId)
    .maybeSingle()
  return Number(data?.balance_cents) || 0
}

export function subscriptionCreditGrantCents(subtotalExTaxCents: number, planId: MembershipPlanId): number {
  const rate = planId === 'inner-circle' ? 0.9 : 0.75
  return Math.floor(subtotalExTaxCents * rate)
}

export async function grantSubscriptionShopCredits(
  supabase: Db,
  opts: {
    userId: string
    planId: MembershipPlanId
    stripeInvoiceId: string
    subtotalExTaxCents: number
  },
): Promise<{ granted: boolean; cents: number }> {
  const cents = subscriptionCreditGrantCents(opts.subtotalExTaxCents, opts.planId)
  if (cents <= 0) return { granted: false, cents: 0 }

  const { error } = await supabase.from('shop_credit_ledger').insert({
    user_id: opts.userId,
    delta_cents: cents,
    kind: 'subscription_grant',
    plan_id: opts.planId,
    stripe_invoice_id: opts.stripeInvoiceId,
    expires_at: addMonthsIso(new Date(), CREDIT_EXPIRY_MONTHS),
  })

  if (error) {
    if (error.code === '23505') return { granted: false, cents: 0 }
    throw new Error(error.message)
  }

  const { data: account } = await supabase
    .from('shop_credit_accounts')
    .select('balance_cents')
    .eq('user_id', opts.userId)
    .maybeSingle()

  const balance = Number(account?.balance_cents) || 0
  const { error: upsertErr } = await supabase.from('shop_credit_accounts').upsert({
    user_id: opts.userId,
    balance_cents: balance + cents,
    updated_at: new Date().toISOString(),
  })

  if (upsertErr) throw new Error(upsertErr.message)
  return { granted: true, cents }
}

export async function spendShopCredits(
  supabase: Db,
  opts: {
    userId: string
    cents: number
    stripeCheckoutSessionId?: string
    note?: string
  },
): Promise<{ ok: boolean; spent: number }> {
  const want = Math.floor(opts.cents)
  if (want <= 0) return { ok: true, spent: 0 }

  await expireStaleCredits(supabase, opts.userId)
  const balance = await getShopCreditBalanceCents(supabase, opts.userId)
  const spent = Math.min(balance, want)
  if (spent <= 0) return { ok: false, spent: 0 }

  const { error: ledgerErr } = await supabase.from('shop_credit_ledger').insert({
    user_id: opts.userId,
    delta_cents: -spent,
    kind: 'checkout_spend',
    stripe_checkout_session_id: opts.stripeCheckoutSessionId || null,
    note: opts.note || null,
  })
  if (ledgerErr) throw new Error(ledgerErr.message)

  const { error: upsertErr } = await supabase.from('shop_credit_accounts').upsert({
    user_id: opts.userId,
    balance_cents: balance - spent,
    updated_at: new Date().toISOString(),
  })
  if (upsertErr) throw new Error(upsertErr.message)

  return { ok: true, spent }
}
