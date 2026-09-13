import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { normalizeSupabaseUserIdInput } from '@/lib/stripe/user-metadata'
import { safeInternalPath } from '@/lib/safe-internal-path'
import { requireFanAuthWithPassword } from '@/lib/require-fan-membership'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
})

export async function POST(request: NextRequest) {
  try {
    const gate = await requireFanAuthWithPassword(request)
    if (!gate.ok) return gate.response

    const { planId, supabaseUserId, returnPath } = await request.json()
    const nextPath = safeInternalPath(typeof returnPath === 'string' ? returnPath : null)
    const metaUserId = normalizeSupabaseUserIdInput(supabaseUserId)

    if (!planId) {
      return NextResponse.json({ error: 'Plan ID required' }, { status: 400 })
    }

    const plansData = await import('@/data/membership-plans.json')
    const plan = plansData.plans.find((p: any) => p.id === planId)

    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
    }

    if (!plan.stripePriceId) {
      return NextResponse.json(
        { error: 'Subscription not configured. Please set up Stripe Price IDs.' },
        { status: 500 }
      )
    }

    const getBaseUrl = () => {
      if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL
      const url = new URL(request.url)
      return `${url.protocol}//${url.host}`
    }

    const baseUrl = getBaseUrl()

    const successSuffix = nextPath
      ? `&next=${encodeURIComponent(nextPath)}`
      : ''
    const cancelSuffix = nextPath
      ? `&next=${encodeURIComponent(nextPath)}`
      : ''

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: plan.stripePriceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${baseUrl}/shop/success?session_id={CHECKOUT_SESSION_ID}&type=subscription${successSuffix}`,
      cancel_url: `${baseUrl}/shop/membership?cancelled=true${cancelSuffix}`,
      metadata: {
        planId: plan.id,
        productType: 'subscription',
        ...(metaUserId ? { supabaseUserId: metaUserId } : {}),
      },
    })

    return NextResponse.json({ sessionId: session.id, url: session.url })
  } catch (error: any) {
    console.error('Subscription checkout error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create subscription checkout' },
      { status: 500 }
    )
  }
}
