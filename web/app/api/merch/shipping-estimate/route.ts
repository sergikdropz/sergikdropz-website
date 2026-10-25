import { NextRequest, NextResponse } from 'next/server'
import { estimateShipping } from '@/lib/printful'

export const dynamic = 'force-dynamic'

/**
 * Live Printful shipping rates for a basket. Additive — the storefront can call
 * this to show real shipping before checkout. Requires PRINTFUL_API_KEY.
 * `variant_id` here is the Printful catalog variant id (sync variant also works
 * in Printful's API, but catalog variant is the documented shape for rates).
 */
export async function POST(request: NextRequest) {
  if (!process.env.PRINTFUL_API_KEY) {
    return NextResponse.json({ error: 'Shipping estimate unavailable' }, { status: 503 })
  }

  let body: any = null
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const recipient = body?.recipient || {}
  const countryCode = String(recipient.country_code || recipient.country || '').toUpperCase()
  if (!countryCode) {
    return NextResponse.json({ error: 'country_code is required' }, { status: 400 })
  }
  // state_code is required by Printful for US/CA/AU.
  const needsState = ['US', 'CA', 'AU'].includes(countryCode)
  const stateCode = String(recipient.state_code || recipient.state || '')
  if (needsState && !stateCode) {
    return NextResponse.json({ error: `state_code is required for ${countryCode}` }, { status: 400 })
  }

  const items = Array.isArray(body?.items)
    ? body.items
        .map((item: any) => ({
          variant_id: Number(item.variant_id),
          quantity: Math.max(1, Number(item.quantity) || 1),
        }))
        .filter((item: any) => Number.isFinite(item.variant_id) && item.variant_id > 0)
    : []

  if (items.length === 0) {
    return NextResponse.json({ error: 'At least one item with a variant_id is required' }, { status: 400 })
  }

  try {
    const rates = await estimateShipping({
      recipient: {
        address1: String(recipient.address1 || recipient.line1 || ''),
        city: String(recipient.city || ''),
        state_code: stateCode,
        country_code: countryCode,
        zip: String(recipient.zip || recipient.postal_code || ''),
      },
      items,
    })
    return NextResponse.json({ rates })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Could not estimate shipping' }, { status: 502 })
  }
}
