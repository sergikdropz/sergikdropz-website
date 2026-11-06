import { normalizeDiscountCode, type MerchDiscount } from '@/lib/merch/discount'

export const MERCH_DISCOUNT_KEY = 'sergik-merch-discount'
export const MERCH_DISCOUNT_EVENT = 'sergik-merch-discount-changed'

export type StoredMerchDiscount = Pick<MerchDiscount, 'code' | 'label' | 'type' | 'value' | 'expiresAt'>

function emit() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(MERCH_DISCOUNT_EVENT))
}

export function readStoredMerchDiscount(): StoredMerchDiscount | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(MERCH_DISCOUNT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredMerchDiscount
    const code = normalizeDiscountCode(parsed?.code || '')
    if (!code || (parsed.type !== 'percent' && parsed.type !== 'amount')) return null
    if (!Number.isFinite(Number(parsed.value)) || Number(parsed.value) <= 0) return null
    return {
      code,
      label: String(parsed.label || code),
      type: parsed.type,
      value: Number(parsed.value),
      expiresAt: parsed.expiresAt || null,
    }
  } catch {
    return null
  }
}

export function writeStoredMerchDiscount(discount: StoredMerchDiscount | null) {
  if (typeof window === 'undefined') return
  if (!discount) window.localStorage.removeItem(MERCH_DISCOUNT_KEY)
  else window.localStorage.setItem(MERCH_DISCOUNT_KEY, JSON.stringify(discount))
  emit()
}
