import { ensureShopCheckoutAuth } from '@/lib/checkoutActor'

export async function startMerchCheckout(options: {
  items: Array<{ printful_variant_id: number; quantity: number }>
  cancelPath?: string
  recipient?: { country_code: string; state_code?: string }
  returnPath?: string
}) {
  const gate = await ensureShopCheckoutAuth({
    returnPath:
      options.returnPath ||
      (typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/shop/cart'),
  })
  if (!gate.ok) return { redirected: true as const }

  const res = await fetch('/api/stripe/create-merch-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      items: options.items,
      supabaseUserId: gate.userId,
      cancelPath: options.cancelPath,
      recipient: options.recipient,
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || 'Checkout failed')
  }
  if (data.url) window.location.href = data.url
  return { redirected: Boolean(data.url) }
}
