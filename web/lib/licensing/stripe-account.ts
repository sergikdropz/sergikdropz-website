import Stripe from 'stripe'
import { stripeNameMatchesLicensor } from '@/lib/licensing/operator-gate'

export async function readStripeAccountLegalName(): Promise<{ name: string | null; matches: boolean; livemode: boolean }> {
  const key = process.env.STRIPE_SECRET_KEY?.trim()
  if (!key) throw new Error('Stripe is not configured.')
  const stripe = new Stripe(key, { apiVersion: '2023-10-16' })
  const account = await stripe.accounts.retrieve()
  const candidates = [
    account.company?.name,
    account.business_profile?.name,
    account.settings?.dashboard?.display_name,
  ].filter((value): value is string => Boolean(value && value.trim()))
  const match = candidates.find((value) => stripeNameMatchesLicensor(value)) || null
  const name = match || candidates[0] || null
  const accountLivemode = (account as { livemode?: boolean }).livemode === true
  const livemode = accountLivemode || key.startsWith('sk_live_') || key.startsWith('rk_live_')
  return { name, matches: Boolean(match), livemode }
}
