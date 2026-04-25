import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { normalizeSupabaseUserIdInput } from '@/lib/stripe/user-metadata'
import { requireFanAuthWithPassword } from '@/lib/require-fan-membership'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
})

export async function POST(request: NextRequest) {
  try {
    const member = await requireFanAuthWithPassword(request)
    if (!member.ok) return member.response

    const { items, supabaseUserId } = await request.json()
    const metaUserId = normalizeSupabaseUserIdInput(supabaseUserId)

    if (!items?.length) {
      return NextResponse.json({ error: 'Items required' }, { status: 400 })
    }

    const getBaseUrl = () => {
      if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL
      const url = new URL(request.url)
      return `${url.protocol}//${url.host}`
    }

    const baseUrl = getBaseUrl()

    const lineItems = items.map((item: any) => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: item.name,
          description: item.variant || '',
          images: item.image ? [item.image] : [],
        },
        unit_amount: Math.round(item.price * 100),
      },
      quantity: item.quantity,
    }))

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      shipping_address_collection: {
        allowed_countries: ['US', 'CA', 'GB', 'AU', 'DE', 'FR', 'ES', 'IT', 'NL', 'SE', 'NO', 'DK', 'JP'],
      },
      success_url: `${baseUrl}/shop/success?session_id={CHECKOUT_SESSION_ID}&type=merch`,
      cancel_url: `${baseUrl}/shop/merch?purchase=cancelled`,
      metadata: {
        productType: 'merch',
        items: JSON.stringify(
          items.map((item: any) => ({
            printful_variant_id: item.printful_variant_id,
            quantity: item.quantity,
            name: item.name,
          }))
        ),
        ...(metaUserId ? { supabaseUserId: metaUserId } : {}),
      },
    })

    return NextResponse.json({ sessionId: session.id, url: session.url })
  } catch (error: any) {
    console.error('Merch checkout error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create merch checkout' },
      { status: 500 }
    )
  }
}
