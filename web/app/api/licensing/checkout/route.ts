import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { markCheckoutSession, prepareLicensingCheckout } from '@/lib/licensing/store'

export const dynamic = 'force-dynamic'

function stripeClient(): Stripe | NextResponse {
  const key = process.env.STRIPE_SECRET_KEY?.trim()
  if (!key) {
    return NextResponse.json({ error: 'Payments are not configured on this server.' }, { status: 503 })
  }
  return new Stripe(key, { apiVersion: '2023-10-16' })
}

export async function POST(request: Request) {
  try {
    const stripe = stripeClient()
    if (stripe instanceof NextResponse) return stripe
    const body = (await request.json()) as { token?: string }
    const token = String(body.token || '').trim()
    if (!token) return NextResponse.json({ error: 'Missing desk token.' }, { status: 400 })
    const inquiry = await prepareLicensingCheckout(token)
    const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || new URL(request.url).origin
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: inquiry.licensing_clients?.email || undefined,
      line_items: [
        {
          price_data: {
            currency: inquiry.quote_currency || 'usd',
            unit_amount: inquiry.quote_cents || 0,
            product_data: {
              name: `SERGIK license ${inquiry.public_id}`,
              description: inquiry.track_title || String(inquiry.project?.name || 'Music license'),
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${base}/licensing/desk/${token}?payment=pending`,
      cancel_url: `${base}/licensing/desk/${token}?payment=cancelled`,
      metadata: {
        productType: 'sync_license',
        inquiryId: inquiry.id,
        publicId: inquiry.public_id,
      },
    })
    await markCheckoutSession(inquiry.id, session.id)
    return NextResponse.json({ url: session.url })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not start checkout.' }, { status: 400 })
  }
}
