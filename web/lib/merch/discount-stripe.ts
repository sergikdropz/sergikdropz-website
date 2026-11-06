import type { MerchDiscount } from '@/lib/merch/discount'
import { getStripeServerClient } from '@/lib/stripe/server-client'

function couponId(discount: Pick<MerchDiscount, 'code' | 'type' | 'value'>): string {
  const slug = discount.code.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || 'code'
  const value = discount.type === 'percent' ? `p${discount.value}` : `a${Math.round(discount.value * 100)}`
  return `merch_${slug}_${value}`.slice(0, 40)
}

/** Reuse the Stripe coupon for this code and amount so checkout charges the quoted price. */
export async function ensureMerchStripeCoupon(
  discount: Pick<MerchDiscount, 'code' | 'label' | 'type' | 'value'>,
): Promise<string> {
  const stripe = getStripeServerClient()
  const id = couponId(discount)
  const existing = await stripe.coupons.retrieve(id).catch(() => null)
  if (existing && !('deleted' in existing && existing.deleted)) return existing.id
  const created = await stripe.coupons.create({
    id,
    name: discount.label.slice(0, 40),
    duration: 'once',
    ...(discount.type === 'percent'
      ? { percent_off: discount.value }
      : { amount_off: Math.round(discount.value * 100), currency: 'usd' }),
  })
  return created.id
}
