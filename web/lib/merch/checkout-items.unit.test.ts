import { describe, expect, it } from 'vitest'
import {
  parseMerchCheckoutMetadata,
  resolveMerchCheckoutLines,
  serializeMerchCheckoutMetadata,
  stripeShippingFromPrintfulRates,
} from './checkout-items'

const products = [
  {
    name: 'Stone Eye Tee',
    thumbnail: '/tee.jpg',
    fulfillmentReady: true,
    variants: [
      { name: 'Black / L', printful_variant_id: 4012, retail_price: 32, in_stock: true },
      { name: 'Black / XL', printful_variant_id: 4013, retail_price: 32, in_stock: false },
    ],
  },
  {
    name: 'Preview Hoodie',
    thumbnail: '/hoodie.jpg',
    fulfillmentReady: false,
    variants: [{ name: 'Black / M', printful_variant_id: 9001, retail_price: 55, in_stock: true }],
  },
]

describe('merch checkout metadata', () => {
  it('round-trips compact Stripe metadata and old webhook payloads', () => {
    const raw = serializeMerchCheckoutMetadata([
      { printful_variant_id: 4012, quantity: 2, name: 'Stone Eye Tee — Black / L' },
    ])
    expect(JSON.parse(raw)[0]).toEqual({ v: 4012, q: 2, n: 'Stone Eye Tee — Black / L' })
    expect(parseMerchCheckoutMetadata(raw)).toEqual([
      { printful_variant_id: 4012, quantity: 2, name: 'Stone Eye Tee — Black / L' },
    ])
    expect(
      parseMerchCheckoutMetadata(
        JSON.stringify([{ printful_variant_id: 7, quantity: 1, name: 'Hat' }]),
      ),
    ).toEqual([{ printful_variant_id: 7, quantity: 1, name: 'Hat' }])
  })

  it('prices cart lines from the live catalog', () => {
    const resolved = resolveMerchCheckoutLines(products, [
      { printful_variant_id: 4012, quantity: 2 },
    ])
    expect(resolved).toEqual({
      lines: [
        {
          printful_variant_id: 4012,
          quantity: 2,
          name: 'Stone Eye Tee — Black / L',
          variant: 'Black / L',
          image: '/tee.jpg',
          price: 32,
        },
      ],
    })
  })

  it('rejects missing, preview-only, and out-of-stock variants', () => {
    expect(resolveMerchCheckoutLines(products, [])).toEqual({ error: 'Items required' })
    expect(resolveMerchCheckoutLines(products, [{ printful_variant_id: 404, quantity: 1 }])).toEqual({
      error: 'One of the items is no longer available',
    })
    expect(resolveMerchCheckoutLines(products, [{ printful_variant_id: 9001, quantity: 1 }])).toEqual({
      error: 'One of the items is no longer available',
    })
    expect(resolveMerchCheckoutLines(products, [{ printful_variant_id: 4013, quantity: 1 }])).toEqual({
      error: 'Stone Eye Tee is out of stock',
    })
  })

  it('maps Printful rates onto Stripe shipping options', () => {
    const options = stripeShippingFromPrintfulRates([
      {
        id: 'STANDARD',
        name: 'Flat Rate',
        rate: '5.95',
        currency: 'USD',
        minDeliveryDays: 4,
        maxDeliveryDays: 8,
      },
      { name: 'Broken', rate: 'nope' },
    ])
    expect(options).toHaveLength(1)
    expect(options[0].shipping_rate_data.fixed_amount).toEqual({ amount: 595, currency: 'usd' })
    expect(options[0].shipping_rate_data.delivery_estimate).toEqual({
      minimum: { unit: 'business_day', value: 4 },
      maximum: { unit: 'business_day', value: 8 },
    })
  })
})
