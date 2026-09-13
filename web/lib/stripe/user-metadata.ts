import type Stripe from 'stripe'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function parseSupabaseUserIdFromStripeMeta(
  metadata: Stripe.Metadata | null | undefined
): string | null {
  const raw = metadata?.supabaseUserId
  if (!raw || typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return UUID_RE.test(trimmed) ? trimmed : null
}

export function normalizeSupabaseUserIdInput(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return UUID_RE.test(trimmed) ? trimmed : null
}
