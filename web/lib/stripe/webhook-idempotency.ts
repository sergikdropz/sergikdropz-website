import type { SupabaseClient } from '@supabase/supabase-js'

function isMissingStripeEventsTable(error: { message?: string; code?: string }): boolean {
  const m = (error.message || '').toLowerCase()
  return (
    m.includes('does not exist') ||
    m.includes('could not find the table') ||
    m.includes('schema cache') ||
    error.code === '42P01'
  )
}

export async function isStripeWebhookEventDuplicate(
  supabase: SupabaseClient,
  stripeEventId: string
): Promise<'duplicate' | 'not_duplicate' | 'unconfigured'> {
  const { data, error } = await supabase
    .from('stripe_webhook_events')
    .select('id')
    .eq('stripe_event_id', stripeEventId)
    .maybeSingle()

  if (error) {
    if (isMissingStripeEventsTable(error)) {
      return 'unconfigured'
    }
    console.error('[stripe webhook] idempotency lookup failed:', error)
    throw new Error(error.message || 'stripe_webhook_events lookup failed')
  }

  return data ? 'duplicate' : 'not_duplicate'
}

export async function recordStripeWebhookEventProcessed(
  supabase: SupabaseClient,
  stripeEventId: string,
  eventType: string
): Promise<void> {
  const { error } = await supabase.from('stripe_webhook_events').insert({
    stripe_event_id: stripeEventId,
    event_type: eventType,
  })

  if (error) {
    if (error.code === '23505') return
    if (isMissingStripeEventsTable(error)) return
    console.error('[stripe webhook] idempotency insert failed:', error)
  }
}
