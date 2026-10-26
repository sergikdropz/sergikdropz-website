import Stripe from 'stripe'

let cached: Stripe | null = null

/**
 * Lazily build the server Stripe client.
 *
 * Never instantiate Stripe at module load in a route file: Next evaluates route
 * modules while collecting page data at build time, and STRIPE_SECRET_KEY is
 * not guaranteed to exist in that environment. Throwing here (inside the
 * handler) turns a build failure into a 500 on the one request that needs it.
 */
export function getStripeServerClient(): Stripe {
  if (cached) return cached
  const key = process.env.STRIPE_SECRET_KEY?.trim()
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured')
  cached = new Stripe(key, { apiVersion: '2023-10-16' })
  return cached
}
