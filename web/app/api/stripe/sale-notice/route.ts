import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { deliverShopSaleNotice } from '@/lib/email/deliver-shop-sale'
import { shopSaleTitle } from '@/lib/email/shop-sale-notice'

export const dynamic = 'force-dynamic'

function stripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim()
  if (!key) return null
  return new Stripe(key, { apiVersion: '2023-10-16' })
}

/** Buyer return URL can file the same notice the webhook files. Session id is the key. */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const sessionId = String(body?.sessionId || '').trim()
    if (!sessionId.startsWith('cs_')) {
      return NextResponse.json({ error: 'Session ID required' }, { status: 400 })
    }

    const stripe = stripeClient()
    if (!stripe) {
      return NextResponse.json({ error: 'Stripe is not configured' }, { status: 503 })
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId)
    if (session.payment_status !== 'paid' && session.status !== 'complete') {
      return NextResponse.json({ ok: false })
    }

    const productType = session.metadata?.productType || 'track'
    const result = await deliverShopSaleNotice({
      sessionId: session.id,
      amountCents: session.amount_total || 0,
      currency: session.currency || 'usd',
      productType,
      title: shopSaleTitle({ productType, metadata: session.metadata }),
      format: session.metadata?.format || null,
      customerEmail: session.customer_email || session.customer_details?.email || null,
      customerName: session.customer_details?.name || null,
    })

    return NextResponse.json({ ok: true, result })
  } catch (error) {
    console.error('Shop sale notice failed:', error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
