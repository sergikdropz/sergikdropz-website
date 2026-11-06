export type MerchDiscountType = 'percent' | 'amount'

/** A code the shop can apply. `value` is a percent (1–100) or dollars off. */
export type MerchDiscount = {
  code: string
  label: string
  type: MerchDiscountType
  value: number
  active: boolean
  expiresAt: string | null
}

export type MerchDiscountQuote = {
  code: string
  label: string
  type: MerchDiscountType
  value: number
  amountOff: number
  total: number
}

const CODE_RE = /^[A-Z0-9][A-Z0-9-]{1,31}$/

export function normalizeDiscountCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '')
}

function roundCents(dollars: number): number {
  return Math.round(dollars * 100) / 100
}

function expired(expiresAt: string | null, now: number): boolean {
  if (!expiresAt) return false
  if (/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) {
    return now > Date.parse(`${expiresAt}T23:59:59.999Z`)
  }
  const time = Date.parse(expiresAt)
  return Number.isFinite(time) && now > time
}

export function discountLabel(type: MerchDiscountType, value: number): string {
  if (type === 'percent') {
    const shown = Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100)
    return `${shown}% off`
  }
  return `${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)} off`
}

export function parseMerchDiscount(value: unknown): MerchDiscount | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const code = normalizeDiscountCode(String(raw.code || ''))
  if (!CODE_RE.test(code)) return null
  const type = raw.type === 'amount' ? 'amount' : raw.type === 'percent' ? 'percent' : null
  if (!type) return null
  const amount = Number(raw.value)
  if (!Number.isFinite(amount) || amount <= 0) return null
  if (type === 'percent' && amount > 100) return null
  if (type === 'amount' && amount > 10000) return null
  const expiresAt = typeof raw.expiresAt === 'string' && raw.expiresAt.trim() ? raw.expiresAt.trim() : null
  const label = String(raw.label || '').trim() || discountLabel(type, amount)
  return {
    code,
    label: label.slice(0, 40),
    type,
    value: type === 'percent' ? Math.round(amount * 100) / 100 : roundCents(amount),
    active: raw.active !== false,
    expiresAt,
  }
}

export function parseMerchDiscounts(value: unknown): MerchDiscount[] {
  const rows = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as { codes?: unknown }).codes)
      ? (value as { codes: unknown[] }).codes
      : []
  const seen = new Set<string>()
  const codes: MerchDiscount[] = []
  for (const row of rows) {
    const parsed = parseMerchDiscount(row)
    if (!parsed || seen.has(parsed.code)) continue
    seen.add(parsed.code)
    codes.push(parsed)
  }
  return codes
}

export function findMerchDiscount(codes: MerchDiscount[], rawCode: string): MerchDiscount | null {
  const code = normalizeDiscountCode(rawCode)
  if (!code) return null
  return codes.find((item) => item.code === code) || null
}

/**
 * Price a basket with one code.
 * Percent off is rounded per line, the same way Stripe applies `percent_off`.
 * A dollar amount comes off the basket once.
 */
export function quoteMerchDiscount(
  lineTotals: number[],
  discount: Pick<MerchDiscount, 'code' | 'label' | 'type' | 'value' | 'expiresAt'> & { active?: boolean },
  now = Date.now(),
): MerchDiscountQuote | { error: string } {
  if (discount.active === false) return { error: "That code doesn't apply." }
  if (expired(discount.expiresAt, now)) return { error: 'That code has expired.' }
  const lines = lineTotals.map((total) => roundCents(Math.max(0, Number(total) || 0))).filter((total) => total > 0)
  const subtotal = roundCents(lines.reduce((sum, total) => sum + total, 0))
  if (!(subtotal > 0)) return { error: "That code doesn't change this price." }

  let amountOff = 0
  if (discount.type === 'percent') {
    if (!(discount.value > 0) || discount.value > 100) return { error: "That code doesn't apply." }
    amountOff = roundCents(lines.reduce((sum, total) => sum + roundCents(total * (discount.value / 100)), 0))
  } else {
    if (!(discount.value > 0)) return { error: "That code doesn't apply." }
    amountOff = Math.min(subtotal, roundCents(discount.value))
  }
  if (!(amountOff > 0)) return { error: "That code doesn't change this price." }
  return {
    code: discount.code,
    label: discount.label,
    type: discount.type,
    value: discount.value,
    amountOff,
    total: roundCents(subtotal - amountOff),
  }
}
