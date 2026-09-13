/**
 * Printful API wrapper for print-on-demand merch
 * Requires: PRINTFUL_API_KEY, PRINTFUL_STORE_ID in env
 */

const PRINTFUL_API_BASE = 'https://api.printful.com'

function getHeaders() {
  return {
    Authorization: `Bearer ${process.env.PRINTFUL_API_KEY}`,
    'Content-Type': 'application/json',
    'X-PF-Store-Id': process.env.PRINTFUL_STORE_ID || '',
  }
}

async function printfulFetch(endpoint: string, options?: RequestInit) {
  const res = await fetch(`${PRINTFUL_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      ...getHeaders(),
      ...(options?.headers || {}),
    },
  })

  if (!res.ok) {
    const errorBody = await res.text()
    throw new Error(`Printful API error ${res.status}: ${errorBody}`)
  }

  return res.json()
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
