import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { checkRateLimit, clientKeyFromRequest } from '@/lib/rate-limit'

const WINDOW_MS = 60_000
const MAX_POSTS_PER_WINDOW = 25

/**
 * Per-IP fixed-window limit for Stripe checkout / portal POST endpoints.
 * In-memory only; use Redis/Upstash for multi-instance parity.
 */
export function stripeCheckoutRateLimitResponse(
  request: NextRequest,
  routeKey: string
): NextResponse | null {
  const key = `stripe-checkout:${routeKey}:${clientKeyFromRequest(request)}`
  const result = checkRateLimit(key, MAX_POSTS_PER_WINDOW, WINDOW_MS)
  if (result.ok) return null
  return NextResponse.json(
    { error: 'Too many requests', retryAfterSec: result.retryAfterSec },
    {
      status: 429,
      headers: { 'Retry-After': String(result.retryAfterSec) },
    }
  )
}
