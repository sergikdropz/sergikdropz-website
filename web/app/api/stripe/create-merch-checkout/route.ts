import { NextRequest, NextResponse } from 'next/server'
import { normalizeSupabaseUserIdInput } from '@/lib/stripe/user-metadata'
import { requireFanAuthWithPassword } from '@/lib/require-fan-membership'
import { getStripeServerClient } from '@/lib/stripe/server-client'
import { stripeCheckoutImages } from '@/lib/stripe/checkout-image'
import { loadShopMerchProducts } from '@/lib/merch/shop-catalog'
import {
  resolveMerchCheckoutLines,
  serializeMerchCheckoutMetadata,
  stripeShippingFromPrintfulRates,
} from '@/lib/merch/checkout-items'
import { quoteMerchDiscount } from '@/lib/merch/discount'
import { findActiveMerchDiscount } from '@/lib/merch/discount-store'
import { ensureMerchStripeCoupon } from '@/lib/merch/discount-stripe'
import { STATE_REQUIRED } from '@/lib/merch/regions'

function getBaseUrl(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL
  const url = new URL(request.url)
  return `${url.protocol}//${url.host}`
}

export async function POST(request: NextRequest) {
  try {
    const member = await requireFanAuthWithPassword(request)
    if (!member.ok) return member.response

    const body = await request.json()
    const metaUserId = normalizeSupabaseUserIdInput(body?.supabaseUserId) || member.session.user.id
    const cancelPath =
      typeof body?.cancelPath === 'string' && body.cancelPath.startsWith('/')
        ? body.cancelPath
        : '/shop/cart'

    const products = await loadShopMerchProducts()
    const resolved = resolveMerchCheckoutLines(products, Array.isArray(body?.items) ? body.items : [])
    if ('error' in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: 400 })
    }

    const requestedCode = typeof body?.discountCode === 'string' ? body.discountCode.trim() : ''
    let stripeCoupon: string | null = null
    let appliedCode: string | null = null
    if (requestedCode) {
      const found = await findActiveMerchDiscount(requestedCode)
      if (!found) {
        return NextResponse.json({ error: "That code doesn't apply." }, { status: 400 })
      }
      const quote = quoteMerchDiscount(
        resolved.lines.map((line) => line.price * line.quantity),
        found,
      )
      if ('error' in quote) {
        return NextResponse.json({ error: quote.error }, { status: 400 })
      }
      if (quote.total <= 0) {
        return NextResponse.json({ error: 'This code covers the whole order.' }, { status: 400 })
      }
      stripeCoupon = await ensureMerchStripeCoupon(found)
      appliedCode = found.code
    }

    const baseUrl = getBaseUrl(request)
    const lineItems = resolved.lines.map((item) => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: item.name,
          description: item.variant || '',
          images: stripeCheckoutImages(baseUrl, item.image),
        },
        unit_amount: Math.round(item.price * 100),
      },
      quantity: item.quantity,
    }))

    const recipient = body?.recipient || {}
    const countryCode = String(recipient.country_code || recipient.country || '')
      .trim()
      .toUpperCase()
    const stateCode = String(recipient.state_code || recipient.state || '').trim()
    let shippingOptions: ReturnType<typeof stripeShippingFromPrintfulRates> = []
    if (countryCode && process.env.PRINTFUL_API_KEY && (!STATE_REQUIRED.has(countryCode) || stateCode)) {
      try {
        const { estimateShipping } = await import('@/lib/printful')
        const rates = await estimateShipping({
          recipient: {
            address1: '',
            city: '',
            state_code: stateCode,
            country_code: countryCode,
            zip: '',
          },
          items: resolved.lines.map((line) => ({
            variant_id: line.printful_variant_id,
            quantity: line.quantity,
          })),
        })
        shippingOptions = stripeShippingFromPrintfulRates(Array.isArray(rates) ? rates : [])
      } catch (error) {
        console.warn('Merch shipping estimate skipped:', error)
      }
    }

    const session = await getStripeServerClient().checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      customer_email: member.session.user.email || undefined,
      shipping_address_collection: {
        allowed_countries: ['US', 'CA', 'GB', 'AU', 'DE', 'FR', 'ES', 'IT', 'NL', 'SE', 'NO', 'DK', 'JP'],
      },
      ...(shippingOptions.length > 0 ? { shipping_options: shippingOptions } : {}),
      ...(stripeCoupon ? { discounts: [{ coupon: stripeCoupon }] } : {}),
      success_url: `${baseUrl}/shop/success?session_id={CHECKOUT_SESSION_ID}&type=merch`,
      cancel_url: `${baseUrl}${cancelPath}${cancelPath.includes('?') ? '&' : '?'}purchase=cancelled`,
      metadata: {
        productType: 'merch',
        items: serializeMerchCheckoutMetadata(resolved.lines),
        ...(appliedCode ? { discountCode: appliedCode } : {}),
        ...(metaUserId ? { supabaseUserId: metaUserId } : {}),
      },
    })

    return NextResponse.json({ sessionId: session.id, url: session.url })
  } catch (error: any) {
    console.error('Merch checkout error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create merch checkout' },
      { status: 500 },
    )
  }
}
