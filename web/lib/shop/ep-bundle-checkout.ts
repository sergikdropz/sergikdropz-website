import type Stripe from 'stripe'
import { normalizeShopAudioFormat, shopReleasePriceCents } from '@/lib/shop/format-prices'
import { findProductForCheckout, isExclusiveProductId } from '@/lib/shop/member-catalog'
import { getShopCreditBalanceCents, spendShopCredits } from '@/lib/shop/shop-credits'
import { insertEpBundlePurchase } from '@/lib/shop/fulfill-digital-purchase'
import { entitlementsForPlan } from '@/lib/membership/entitlements'
import { findActiveMembershipRow } from '@/lib/membership-queries'
import type { SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

type Db = SupabaseClient

export type EpBundleCheckoutInput = {
  productId: string
  formatRaw: unknown
  applyShopCredits: boolean
  userId: string
  userEmail: string | null
  baseUrl: string
  metaUserId?: string
}

export type EpBundleCheckoutResult =
  | { kind: 'stripe'; session: Stripe.Checkout.Session }
  | { kind: 'credit_only'; url: string; sessionId: string }

export async function prepareEpBundleCheckout(
  supabase: Db,
  stripe: Stripe,
  input: EpBundleCheckoutInput,
): Promise<{ error?: string; status?: number; result?: EpBundleCheckoutResult }> {
  const product = findProductForCheckout(input.productId)
  if (!product) {
    return { error: 'Product not found', status: 404 }
  }

  if (isExclusiveProductId(product.id)) {
    const membership = await findActiveMembershipRow(supabase, {
      userId: input.userId,
      email: input.userEmail,
    })
    const ent = entitlementsForPlan(membership?.plan_id)
    if (!ent?.canPurchaseExclusive) {
      return { error: 'Inner Circle membership required for exclusive releases', status: 403 }
    }
  }

  const audioFormat = normalizeShopAudioFormat(input.formatRaw)
  if (!audioFormat) {
    return { error: 'Choose MP3 or lossless WAV', status: 400 }
  }

  const trackCount = Number(product.trackCount)
  if (!Number.isFinite(trackCount) || trackCount < 1) {
    return { error: 'This release has no track count', status: 400 }
  }

  const unitAmount = shopReleasePriceCents(trackCount, audioFormat)
  let creditApplied = 0
  if (input.applyShopCredits) {
    const balance = await getShopCreditBalanceCents(supabase, input.userId)
    creditApplied = Math.min(balance, unitAmount)
  }

  const chargeCents = unitAmount - creditApplied
  const formatLabel = audioFormat === 'WAV' ? 'Lossless WAV' : 'MP3'

  if (chargeCents <= 0) {
    const sessionId = `cr_${randomUUID()}`
    const spent = await spendShopCredits(supabase, {
      userId: input.userId,
      cents: unitAmount,
      stripeCheckoutSessionId: sessionId,
      note: `ep-bundle:${product.id}`,
    })
    if (!spent.ok) {
      return { error: 'Could not apply shop credits', status: 400 }
    }

    await insertEpBundlePurchase(supabase, {
      sessionId,
      productId: product.id,
      format: audioFormat,
      releaseId: product.release_id || undefined,
      customerEmail: input.userEmail,
      customerName: null,
      amountPaidCents: unitAmount,
      userId: input.userId,
      productType: 'ep-bundle',
    })

    return {
      result: {
        kind: 'credit_only',
        sessionId,
        url: `${input.baseUrl}/download/order?session_id=${encodeURIComponent(sessionId)}`,
      },
    }
  }

  const { stripeCheckoutImages } = await import('@/lib/stripe/checkout-image')

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${product.title} (${formatLabel})`,
            description: product.description,
            images: stripeCheckoutImages(input.baseUrl, product.artwork),
          },
          unit_amount: chargeCents,
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: `${input.baseUrl}/shop/success?session_id={CHECKOUT_SESSION_ID}&type=ep-bundle`,
    cancel_url: `${input.baseUrl}/shop/music?purchase=cancelled`,
    metadata: {
      productId: product.id,
      productType: 'ep-bundle',
      format: audioFormat,
      releaseId: product.release_id || '',
      listPriceCents: String(unitAmount),
      creditAppliedCents: String(creditApplied),
      ...(input.metaUserId ? { supabaseUserId: input.metaUserId } : {}),
    },
  })

  return { result: { kind: 'stripe', session } }
}

export async function applyCheckoutCreditSpendFromMetadata(
  supabase: Db,
  opts: {
    userId: string
    sessionId: string
    creditAppliedCents: number
    note?: string
  },
): Promise<void> {
  const cents = Math.floor(opts.creditAppliedCents)
  if (cents <= 0 || !opts.userId) return

  const { data: existing } = await supabase
    .from('shop_credit_ledger')
    .select('id')
    .eq('stripe_checkout_session_id', opts.sessionId)
    .eq('kind', 'checkout_spend')
    .maybeSingle()

  if (existing) return

  await spendShopCredits(supabase, {
    userId: opts.userId,
    cents,
    stripeCheckoutSessionId: opts.sessionId,
    note: opts.note,
  })
}
