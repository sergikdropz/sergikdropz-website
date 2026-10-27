import type { SupabaseClient } from '@supabase/supabase-js'

type Db = SupabaseClient

export async function insertEpBundlePurchase(
  supabase: Db,
  opts: {
    sessionId: string
    productId: string
    format: string
    releaseId?: string
    customerEmail: string | null
    customerName: string | null
    amountPaidCents: number
    currency?: string
    userId?: string | null
    productType?: string
  },
): Promise<{ purchaseId: string | null }> {
  const { data, error } = await supabase
    .from('purchases')
    .insert({
      stripe_session_id: opts.sessionId,
      track_id: opts.productId,
      track_title: opts.productId,
      format: opts.format,
      file_url: '',
      customer_email: opts.customerEmail,
      customer_name: opts.customerName,
      amount_paid: opts.amountPaidCents,
      currency: opts.currency || 'usd',
      purchased_at: new Date().toISOString(),
      product_type: opts.productType || 'ep-bundle',
      ...(opts.userId ? { user_id: opts.userId } : {}),
    })
    .select('id')
    .single()

  if (error) {
    console.error('insertEpBundlePurchase', error)
    return { purchaseId: null }
  }

  return { purchaseId: data?.id ? String(data.id) : null }
}
