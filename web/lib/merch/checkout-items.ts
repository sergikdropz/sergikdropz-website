import { MERCH_CART_MAX_LINES, MERCH_CART_MAX_QTY } from '@/lib/merch/shop-cart'

export type MerchFulfillmentItem = {
  printful_variant_id: number
  quantity: number
  name: string
}

export type MerchCheckoutRequestItem = {
  printful_variant_id?: number
  quantity?: number
}

export type ResolvedMerchCheckoutLine = {
  printful_variant_id: number
  quantity: number
  name: string
  variant: string
  image: string
  price: number
}

type CatalogProduct = {
  name: string
  thumbnail?: string
  fulfillmentReady?: boolean
  variants: Array<{
    name: string
    printful_variant_id: number
    retail_price: number
    in_stock?: boolean
  }>
}

export function resolveMerchCheckoutLines(
  products: CatalogProduct[],
  requested: MerchCheckoutRequestItem[],
): { lines: ResolvedMerchCheckoutLine[] } | { error: string } {
  if (!Array.isArray(requested) || requested.length === 0) {
    return { error: 'Items required' }
  }
  if (requested.length > MERCH_CART_MAX_LINES) {
    return { error: `Cart is limited to ${MERCH_CART_MAX_LINES} items` }
  }

  const variants = new Map<
    number,
    { product: CatalogProduct; variant: CatalogProduct['variants'][number] }
  >()
  for (const product of products) {
    if (product.fulfillmentReady === false) continue
    for (const variant of product.variants || []) {
      const id = Number(variant.printful_variant_id)
      if (!Number.isFinite(id) || id <= 0) continue
      if (!variants.has(id)) variants.set(id, { product, variant })
    }
  }

  const lines: ResolvedMerchCheckoutLine[] = []
  for (const item of requested) {
    const variantId = Number(item.printful_variant_id)
    const quantity = Math.max(1, Math.min(MERCH_CART_MAX_QTY, Math.round(Number(item.quantity) || 1)))
    if (!Number.isFinite(variantId) || variantId <= 0) {
      return { error: 'This piece is not connected to fulfillment yet' }
    }
    const match = variants.get(variantId)
    if (!match) {
      return { error: 'One of the items is no longer available' }
    }
    if (match.variant.in_stock === false) {
      return { error: `${match.product.name} is out of stock` }
    }
    const price = Number(match.variant.retail_price)
    if (!Number.isFinite(price) || price <= 0) {
      return { error: 'One of the items is missing a price' }
    }
    lines.push({
      printful_variant_id: variantId,
      quantity,
      name: `${match.product.name} — ${match.variant.name}`.trim(),
      variant: match.variant.name,
      image: match.product.thumbnail || '',
      price,
    })
  }

  return { lines }
}

const METADATA_LIMIT = 500

export function serializeMerchCheckoutMetadata(
  lines: Array<{ printful_variant_id: number; quantity: number; name: string }>,
): string {
  const compact = lines.map((line) => ({
    v: line.printful_variant_id,
    q: line.quantity,
    n: String(line.name || 'Merch').slice(0, 48),
  }))
  const withNames = JSON.stringify(compact)
  if (withNames.length <= METADATA_LIMIT) return withNames
  return JSON.stringify(compact.map(({ v, q }) => ({ v, q })))
}

export function parseMerchCheckoutMetadata(raw?: string | null): MerchFulfillmentItem[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as Array<Record<string, unknown>>
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => ({
        printful_variant_id: Number(item.printful_variant_id ?? item.v),
        quantity: Math.max(1, Math.round(Number(item.quantity ?? item.q) || 1)),
        name: String(item.name ?? item.n ?? 'Merch'),
      }))
      .filter((item) => Number.isFinite(item.printful_variant_id) && item.printful_variant_id > 0)
  } catch {
    return []
  }
}

export function stripeShippingFromPrintfulRates(
  rates: Array<{
    id?: string
    name?: string
    rate?: string | number
    currency?: string
    minDeliveryDays?: number
    maxDeliveryDays?: number
    min_delivery_days?: number
    max_delivery_days?: number
  }>,
) {
  return rates
    .map((rate) => {
      const amount = Math.round(Number(rate.rate) * 100)
      if (!Number.isFinite(amount) || amount < 0) return null
      const min = Number(rate.minDeliveryDays ?? rate.min_delivery_days)
      const max = Number(rate.maxDeliveryDays ?? rate.max_delivery_days)
      const estimate =
        Number.isFinite(min) && Number.isFinite(max) && min > 0 && max >= min
          ? {
              minimum: { unit: 'business_day' as const, value: min },
              maximum: { unit: 'business_day' as const, value: max },
            }
          : undefined
      return {
        shipping_rate_data: {
          type: 'fixed_amount' as const,
          fixed_amount: {
            amount,
            currency: String(rate.currency || 'usd').toLowerCase(),
          },
          display_name: String(rate.name || rate.id || 'Shipping').slice(0, 40),
          ...(estimate ? { delivery_estimate: estimate } : {}),
        },
      }
    })
    .filter((option): option is NonNullable<typeof option> => Boolean(option))
    .slice(0, 5)
}
