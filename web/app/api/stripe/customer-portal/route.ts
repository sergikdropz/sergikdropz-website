import { NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
})

export async function POST(request: Request) {
  try {
    const { customerId } = await request.json()

    if (!customerId) {
      return NextResponse.json({ error: 'Customer ID required' }, { status: 400 })
    }

    const getBaseUrl = () => {
      if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL
      const url = new URL(request.url)
      return `${url.protocol}//${url.host}`
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${getBaseUrl()}/shop/membership/manage`,
    })

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error('Customer portal error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create portal session' },
      { status: 500 }
    )
  }
}
