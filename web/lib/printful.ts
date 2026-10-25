/**
 * Printful API wrapper for print-on-demand merch
 * Requires: PRINTFUL_API_KEY, PRINTFUL_STORE_ID in env
 */

import { nextRetryDelayMs, readRateLimit, shouldRetryStatus } from '@/lib/printful-rate-limit'

const PRINTFUL_API_BASE = 'https://api.printful.com'
const MAX_RETRIES = 3

function getHeaders(requireAuth = false) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  const key = process.env.PRINTFUL_API_KEY
  if (key) headers.Authorization = `Bearer ${key}`
  else if (requireAuth) {
    throw new Error('Printful API key not configured')
  }
  const storeId = process.env.PRINTFUL_STORE_ID
  if (storeId) headers['X-PF-Store-Id'] = storeId
  return headers
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Shared request core. Honours Printful rate limits: on 429 (and transient
 * 5xx) it waits for `Retry-After` — or an exponential backoff with jitter —
 * and retries up to MAX_RETRIES. Request bodies are strings, so retrying is safe.
 */
async function printfulRequest(
  endpoint: string,
  { requireAuth, label, ...options }: RequestInit & { requireAuth: boolean; label: string },
) {
  let attempt = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await fetch(`${PRINTFUL_API_BASE}${endpoint}`, {
      ...options,
      headers: {
        ...getHeaders(requireAuth),
        ...(options.headers || {}),
      },
    })

    if (res.ok) return res.json()

    if (shouldRetryStatus(res.status) && attempt < MAX_RETRIES) {
      const delay = nextRetryDelayMs(attempt, res.headers.get('retry-after'))
      const snap = readRateLimit(res.headers)
      console.warn(
        `[printful] ${label} ${endpoint} → ${res.status}; retrying in ${delay}ms ` +
          `(attempt ${attempt + 1}/${MAX_RETRIES}, remaining=${snap.remaining ?? '?'})`,
      )
      await sleep(delay)
      attempt += 1
      continue
    }

    const errorBody = await res.text()
    throw new Error(`Printful ${label} error ${res.status}: ${errorBody}`)
  }
}

/** Public catalog reads work without a token; store/orders require PRINTFUL_API_KEY. */
export async function printfulCatalogFetch(endpoint: string, options?: RequestInit) {
  return printfulRequest(endpoint, { ...options, requireAuth: false, label: 'catalog' })
}

export async function printfulFetch(endpoint: string, options?: RequestInit) {
  return printfulRequest(endpoint, { ...options, requireAuth: true, label: 'API' })
}

/**
 * Get all products from the Printful store
 */
export async function getProducts() {
  const data = await printfulFetch('/store/products')
  return data.result || []
}

/**
 * Get product details including variants
 */
export async function getProductDetails(productId: string) {
  const data = await printfulFetch(`/store/products/${productId}`)
  return data.result
}

/**
 * Estimate shipping costs
 */
export async function estimateShipping(params: {
  recipient: {
    address1: string
    city: string
    state_code: string
    country_code: string
    zip: string
  }
  items: Array<{
    variant_id: number
    quantity: number
  }>
}) {
  const data = await printfulFetch('/shipping/rates', {
    method: 'POST',
    body: JSON.stringify(params),
  })
  return data.result || []
}

/**
 * Create an order in Printful
 */
export async function createOrder(params: {
  external_id?: string
  recipient: {
    name: string
    address1: string
    address2?: string
    city: string
    state_code: string
    country_code: string
    zip: string
    email: string
  }
  items: Array<{
    sync_variant_id: number
    quantity: number
  }>
}) {
  const data = await printfulFetch('/orders', {
    method: 'POST',
    body: JSON.stringify({
      ...params,
      confirm: true, // Auto-confirm and start fulfillment
    }),
  })
  return data.result
}

/**
 * Get order status from Printful
 */
export async function getOrderStatus(orderId: string) {
  const data = await printfulFetch(`/orders/${orderId}`)
  return data.result
}

/** Events we subscribe to. Printful v1 webhooks are a single URL + type list per store. */
export const PRINTFUL_WEBHOOK_EVENTS = [
  'package_shipped',
  'package_returned',
  'order_created',
  'order_updated',
  'order_failed',
  'order_canceled',
  'order_refunded',
  'order_put_hold',
  'order_put_hold_approval',
  'order_remove_hold',
] as const

export async function getPrintfulWebhook() {
  const data = await printfulFetch('/webhooks')
  return data.result
}

export async function registerPrintfulWebhook(url: string, types: string[]) {
  const data = await printfulFetch('/webhooks', {
    method: 'POST',
    body: JSON.stringify({ url, types }),
  })
  return data.result
}

export async function disablePrintfulWebhook() {
  const data = await printfulFetch('/webhooks', { method: 'DELETE' })
  return data.result
}

/**
 * Submit order to Printful after Stripe checkout (called from webhook)
 */
export async function submitPrintfulOrder(params: {
  orderId: string
  items: Array<{
    printful_variant_id: number
    quantity: number
    name: string
  }>
  shippingAddress: any
  customerEmail: string
}) {
  if (!process.env.PRINTFUL_API_KEY) {
    console.error('Printful API key not configured')
    return null
  }

  try {
    const address = params.shippingAddress
    const order = await createOrder({
      external_id: params.orderId,
      recipient: {
        name: address?.name || 'Customer',
        address1: address?.line1 || '',
        address2: address?.line2 || undefined,
        city: address?.city || '',
        state_code: address?.state || '',
        country_code: address?.country || 'US',
        zip: address?.postal_code || '',
        email: params.customerEmail,
      },
      items: params.items.map((item) => ({
        sync_variant_id: item.printful_variant_id,
        quantity: item.quantity,
      })),
    })

    return order
  } catch (error) {
    console.error('Error submitting Printful order:', error)
    throw error
  }
}
