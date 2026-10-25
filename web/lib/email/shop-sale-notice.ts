import bundlesData from '@/data/bundles.json'
import productsData from '@/data/products.json'
import { OWNER_REMINDER_EMAIL } from '@/lib/studio/owner-release-reminders'

export type ShopSaleInput = {
  sessionId: string
  amountCents: number
  currency: string
  productType: string
  title: string
  format?: string | null
  customerEmail?: string | null
  customerName?: string | null
  downloadUrl?: string | null
}

export function shopSaleNotifyAddress(): string {
  const override = process.env.SHOP_SALE_NOTIFY_EMAIL?.trim()
  return override || OWNER_REMINDER_EMAIL
}

export function formatSaleAmount(cents: number, currency: string): string {
  const amount = Math.max(0, Number(cents) || 0) / 100
  const code = String(currency || 'usd').trim().toUpperCase() || 'USD'
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(amount)
  } catch {
    return `$${amount.toFixed(2)} ${code}`
  }
}

export function shopSaleTitle(input: {
  productType: string
  metadata?: Record<string, string | undefined | null> | null
}): string {
  const type = String(input.productType || 'shop')
  const meta = input.metadata || {}
  const read = (key: string) => String(meta[key] || '').trim()

  if (type === 'tip') return 'Tip'
  if (type === 'merch') return 'Merch order'
  if (type === 'subscription') return 'Membership'

  const bundleName = read('bundleName')
  if (bundleName) return bundleName

  const productId = read('productId')
  if (productId) {
    const product = productsData.products.find((row) => row.id === productId)
    if (product?.title) return product.title
  }

  const bundleId = read('bundleId')
  if (bundleId) {
    const bundle = bundlesData.bundles.find((row) => row.id === bundleId)
    if (bundle?.name) return bundle.name
  }

  if (type === 'license') {
    const tier = read('licenseTier')
    return tier ? `License — ${tier}` : 'License'
  }

  return read('trackTitle') || productId || read('trackId') || 'Shop order'
}

export function shopSaleNotice(input: ShopSaleInput): { subject: string; body: string } {
  const amount = formatSaleAmount(input.amountCents, input.currency)
  const title = input.title.trim() || 'Shop order'
  const format = String(input.format || '').trim()
  const buyerName = String(input.customerName || '').trim()
  const buyerEmail = String(input.customerEmail || '').trim()
  const buyer = buyerEmail ? (buyerName ? `${buyerName} <${buyerEmail}>` : buyerEmail) : 'Not collected'
  const downloadUrl = String(input.downloadUrl || '').trim()
  const lines = [
    'A paid order just landed in the shop.',
    '',
    `Item: ${title}`,
    format ? `Format: ${format}` : '',
    `Amount: ${amount}`,
    `Buyer: ${buyer}`,
    `Stripe: ${input.sessionId}`,
    downloadUrl ? `Download: ${downloadUrl}` : '',
  ].filter((line) => line !== '')

  return {
    subject: `Sale: ${title} — ${amount}`.slice(0, 200),
    body: lines.join('\n'),
  }
}

const DIGITAL_PRODUCT_TYPES = new Set(['track', 'ep-bundle', 'bundle'])

/** Link the buyer can open from the sale email. Session id is the payment proof. */
export function shopOrderDownloadUrl(input: {
  origin: string
  sessionId: string
  productType: string
}): string | null {
  const type = String(input.productType || '').trim()
  if (!DIGITAL_PRODUCT_TYPES.has(type)) return null
  const sessionId = String(input.sessionId || '').trim()
  if (!sessionId.startsWith('cs_')) return null
  const origin = String(input.origin || '').trim().replace(/\/$/, '')
  if (!/^https?:\/\//i.test(origin)) return null
  return `${origin}/api/download/order?session_id=${encodeURIComponent(sessionId)}`
}

export function shopBuyerDownloadNotice(input: {
  title: string
  format?: string | null
  downloadUrl: string
}): { subject: string; body: string } {
  const title = input.title.trim() || 'your order'
  const format = String(input.format || '').trim()
  const lines = [
    'Your download is ready.',
    '',
    `Item: ${title}`,
    format ? `Format: ${format}` : '',
    '',
    'Download:',
    input.downloadUrl.trim(),
  ].filter((line) => line !== '')
  return {
    subject: `Your download: ${title}`.slice(0, 200),
    body: lines.join('\n'),
  }
}
