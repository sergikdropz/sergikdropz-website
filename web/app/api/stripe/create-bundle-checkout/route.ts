import { NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
})

export async function POST(request: Request) {
  try {
    const { bundleId } = await request.json()

    if (!bundleId) {
      return NextResponse.json({ error: 'Bundle ID required' }, { status: 400 })
    }

    const bundlesData = await import('@/data/bundles.json')
    const bundle = bundlesData.bundles.find((b: any) => b.id === bundleId)

    if (!bundle || bundle.status !== 'active') {
      return NextResponse.json({ error: 'Bundle not found' }, { status: 404 })
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
              name: bundle.name,
              description: bundle.description,
              images: bundle.artwork ? [`${baseUrl}${bundle.artwork}`] : [],
            },
            unit_amount: Math.round(bundle.bundlePrice * 100),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${baseUrl}/shop/success?session_id={CHECKOUT_SESSION_ID}&type=bundle`,
      cancel_url: `${baseUrl}/shop?purchase=cancelled`,
      metadata: {
        bundleId: bundle.id,
        bundleName: bundle.name,
        bundleItemIds: JSON.stringify(bundle.productIds),
        productType: 'bundle',
      },
    })

    return NextResponse.json({ sessionId: session.id, url: session.url })
  } catch (error: any) {
    console.error('Bundle checkout error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create bundle checkout' },
      { status: 500 }
    )
  }
}
