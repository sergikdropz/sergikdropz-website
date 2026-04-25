import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { normalizeSupabaseUserIdInput } from '@/lib/stripe/user-metadata'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
})

export async function POST(request: Request) {
  try {
    const { amount, message, supabaseUserId } = await request.json()
    const metaUserId = normalizeSupabaseUserIdInput(supabaseUserId)

    const tipConfig = await import('@/data/tip-jar-config.json')

    const tipAmount = Number(amount)
    if (!tipAmount || tipAmount < tipConfig.minAmount || tipAmount > tipConfig.maxAmount) {
      return NextResponse.json(
        { error: `Amount must be between $${tipConfig.minAmount} and $${tipConfig.maxAmount}` },
        { status: 400 }
      )
    }

    const getBaseUrl = () => {
      if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL
      const url = new URL(request.url)
      return `${url.protocol}//${url.host}`
    }

    const baseUrl = getBaseUrl()

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Tip for SERGIK',
              description: message || 'Thank you for supporting independent music!',
            },
            unit_amount: Math.round(tipAmount * 100),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${baseUrl}/shop/success?session_id={CHECKOUT_SESSION_ID}&type=tip`,
      cancel_url: `${baseUrl}/shop/tip?cancelled=true`,
      metadata: {
        productType: 'tip',
        tipAmount: String(tipAmount),
        tipMessage: message || '',
        ...(metaUserId ? { supabaseUserId: metaUserId } : {}),
      },
    })

    return NextResponse.json({ sessionId: session.id, url: session.url })
  } catch (error: any) {
    console.error('Tip checkout error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create tip checkout' },
      { status: 500 }
    )
  }
}
