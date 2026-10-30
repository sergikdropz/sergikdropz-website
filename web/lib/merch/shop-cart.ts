export type MerchCartLine = {
  id: string
  productSlug: string
  productName: string
  variantName: string
  printful_variant_id: number
  price: number
  quantity: number
  image: string
}

export const MERCH_CART_KEY = 'sergik-merch-cart'
export const MERCH_CART_EVENT = 'sergik-merch-cart-changed'
export const MERCH_CART_MAX_QTY = 10
export const MERCH_CART_MAX_LINES = 20

function cartLineId(slug: string, printfulVariantId: number) {
  return `${slug}:${printfulVariantId}`
}

function clampQty(quantity: number) {
  const n = Math.round(Number(quantity) || 0)
  return Math.max(1, Math.min(MERCH_CART_MAX_QTY, n))
}

function sanitizeLine(line: Partial<MerchCartLine> | null | undefined): MerchCartLine | null {
  const variantId = Number(line?.printful_variant_id)
  const price = Number(line?.price)
  const slug = String(line?.productSlug || '').trim()
  const name = String(line?.productName || '').trim()
  if (!Number.isFinite(variantId) || variantId <= 0) return null
  if (!Number.isFinite(price) || price <= 0) return null
  if (!slug || !name) return null
  return {
    id: String(line?.id || cartLineId(slug, variantId)),
    productSlug: slug,
    productName: name,
    variantName: String(line?.variantName || '').trim(),
    printful_variant_id: variantId,
    price,
    quantity: clampQty(Number(line?.quantity)),
    image: String(line?.image || ''),
  }
}

function emitCartChanged() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(MERCH_CART_EVENT))
}

export function readMerchCart(): MerchCartLine[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(MERCH_CART_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as MerchCartLine[]
    if (!Array.isArray(parsed)) return []
    return parsed.map(sanitizeLine).filter((line): line is MerchCartLine => Boolean(line))
  } catch {
    return []
  }
}

export function writeMerchCart(lines: MerchCartLine[]) {
  if (typeof window === 'undefined') return
  const next = lines
    .map(sanitizeLine)
    .filter((line): line is MerchCartLine => Boolean(line))
    .slice(0, MERCH_CART_MAX_LINES)
  window.localStorage.setItem(MERCH_CART_KEY, JSON.stringify(next))
  emitCartChanged()
}

export function merchCartCount(lines: MerchCartLine[] = readMerchCart()): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0)
}

export function merchCartSubtotal(lines: MerchCartLine[] = readMerchCart()): number {
  return lines.reduce((sum, line) => sum + line.price * line.quantity, 0)
}

export function addMerchCartLine(input: Omit<MerchCartLine, 'id'>): MerchCartLine[] {
  const clean = sanitizeLine({ ...input, id: cartLineId(input.productSlug, input.printful_variant_id) })
  if (!clean) return readMerchCart()
  const next = [...readMerchCart()]
  const index = next.findIndex((line) => line.id === clean.id)
  if (index >= 0) {
    next[index] = { ...next[index], quantity: clampQty(next[index].quantity + clean.quantity) }
  } else if (next.length >= MERCH_CART_MAX_LINES) {
    return next
  } else {
    next.push(clean)
  }
  writeMerchCart(next)
  return next
}

export function setMerchCartLineQuantity(id: string, quantity: number): MerchCartLine[] {
  if (quantity <= 0) return removeMerchCartLine(id)
  const next = readMerchCart().map((line) =>
    line.id === id ? { ...line, quantity: clampQty(quantity) } : line,
  )
  writeMerchCart(next)
  return next
}

export function removeMerchCartLine(id: string): MerchCartLine[] {
  const next = readMerchCart().filter((line) => line.id !== id)
  writeMerchCart(next)
  return next
}

export function clearMerchCart(): MerchCartLine[] {
  writeMerchCart([])
  return []
}

export function merchCartCheckoutItems(lines: MerchCartLine[] = readMerchCart()) {
  return lines.map((line) => ({
    printful_variant_id: line.printful_variant_id,
    quantity: line.quantity,
  }))
}

export function formatMerchMoney(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}
