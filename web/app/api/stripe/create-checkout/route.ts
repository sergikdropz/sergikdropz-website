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

    const body = await request.json()
    const { trackId, format, licenseTier, productId, productType, supabaseUserId } = body
    const metaUserId = normalizeSupabaseUserIdInput(supabaseUserId)

    // Get base URL
    const getBaseUrl = () => {
      if (process.env.NEXT_PUBLIC_SITE_URL) {
        return process.env.NEXT_PUBLIC_SITE_URL
      }
      const url = new URL(request.url)
      return `${url.protocol}//${url.host}`
    }

    const baseUrl = getBaseUrl()

    // Handle EP bundle / product purchases
    if (productType === 'ep-bundle' && productId) {
      const productsData = await import('@/data/products.json')
      const product = productsData.products.find((p: any) => p.id === productId)

      if (!product) {
        return NextResponse.json({ error: 'Product not found' }, { status: 404 })
      }

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: product.title,
                description: product.description,
                images: product.artwork ? [`${baseUrl}${product.artwork}`] : [],
              },
              unit_amount: Math.round(product.price * 100),
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${baseUrl}/shop/success?session_id={CHECKOUT_SESSION_ID}&type=ep-bundle`,
        cancel_url: `${baseUrl}/shop?purchase=cancelled`,
        metadata: {
          productId: product.id,
          productType: 'ep-bundle',
          releaseId: product.release_id || '',
          ...(metaUserId ? { supabaseUserId: metaUserId } : {}),
        },
      })

      return NextResponse.json({ sessionId: session.id, url: session.url })
    }

    // Handle licensed beat purchases
    if (licenseTier && trackId) {
      const licenseTiersData = await import('@/data/license-tiers.json')
      const tier = licenseTiersData.tiers.find((t: any) => t.id === licenseTier)

      if (!tier) {
        return NextResponse.json({ error: 'License tier not found' }, { status: 400 })
      }

      const purchasableTracks = await import('@/data/purchasable-tracks.json')
      const track = purchasableTracks.tracks.find((t: any) => t.id === trackId)

      if (!track) {
        return NextResponse.json({ error: 'Track not found' }, { status: 404 })
      }

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `${track.title} — ${tier.name} License`,
                description: tier.description,
                images: track.artwork ? [`${baseUrl}${track.artwork}`] : [],
              },
              unit_amount: Math.round(tier.price * 100),
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${baseUrl}/shop/success?session_id={CHECKOUT_SESSION_ID}&type=license&tier=${licenseTier}`,
        cancel_url: `${baseUrl}/shop?purchase=cancelled`,
        metadata: {
          trackId,
          licenseTier,
          productType: 'license',
          termsSnapshot: JSON.stringify(tier.terms),
          ...(metaUserId ? { supabaseUserId: metaUserId } : {}),
        },
      })

      return NextResponse.json({ sessionId: session.id, url: session.url })
    }

    // Handle standard single-track purchases (original flow)
    if (!trackId || !format) {
      return NextResponse.json(
        { error: 'Track ID and format are required' },
        { status: 400 }
      )
    }

    const purchasableTracks = await import('@/data/purchasable-tracks.json')
    const track = purchasableTracks.tracks.find((t: any) => t.id === trackId)

    if (!track) {
      return NextResponse.json({ error: 'Track not found' }, { status: 404 })
    }

    const selectedFormat = track.formats.find((f: any) => f.type === format)
    if (!selectedFormat) {
      return NextResponse.json({ error: 'Format not available' }, { status: 400 })
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${track.title} (${format})`,
              description: track.description,
              images: track.artwork ? [`${baseUrl}${track.artwork}`] : [],
            },
            unit_amount: Math.round(track.price * 100),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${baseUrl}/shop/success?session_id={CHECKOUT_SESSION_ID}&type=track`,
      cancel_url: `${baseUrl}/shop?purchase=cancelled`,
      metadata: {
        trackId,
        format,
        productType: 'track',
        fileName: selectedFormat.file,
        ...(metaUserId ? { supabaseUserId: metaUserId } : {}),
      },
    })

    return NextResponse.json({ sessionId: session.id, url: session.url })
  } catch (error: any) {
    console.error('Stripe checkout error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}
