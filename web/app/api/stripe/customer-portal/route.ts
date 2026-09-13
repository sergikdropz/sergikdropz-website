import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { findActiveMembershipRow } from '@/lib/membership-queries'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
})

export async function POST(request: Request) {
  try {
    // Require an authenticated session — no anonymous access to billing portal.
    const session = await getServerSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Look up the Stripe customer ID from the authenticated user's membership record.
    // Never trust a client-supplied customer ID.
    const supabase = createSupabaseServerClient()
    const membership = await findActiveMembershipRow(supabase, {
      userId: session.user.id,
      email: session.user.email ?? null,
    })

    if (!membership?.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No active membership found for this account' },
        { status: 404 }
      )
    }

    const getBaseUrl = () => {
      if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL
      const url = new URL(request.url)
      return `${url.protocol}//${url.host}`
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: membership.stripe_customer_id,
      return_url: `${getBaseUrl()}/shop/membership/manage`,
    })

    return NextResponse.json({ url: portalSession.url })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create portal session'
    console.error('Customer portal error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
