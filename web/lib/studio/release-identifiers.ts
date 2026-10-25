/** DistroKid and GS1 barcodes on distribution_releases, not marketing_copy. */

const IDENTIFIER_KEYS = ['upc', 'previous_upc'] as const

export type ReleaseIdentifierKey = (typeof IDENTIFIER_KEYS)[number]

export type ReleaseIdentifiers = Partial<Record<ReleaseIdentifierKey, string>>

export function parseReleaseBarcode(raw: unknown, label = 'UPC'): string | null {
  if (raw == null || raw === '') return null
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    throw new Error(`${label} must be a 12- or 13-digit code`)
  }
  const digits = String(raw).replace(/\D/g, '')
  if (!digits) return null
  if (digits.length !== 12 && digits.length !== 13) {
    throw new Error(`${label} must be 12 or 13 digits (got ${digits.length})`)
  }
  return digits
}

export function pickReleaseIdentifiers(raw: Record<string, unknown>): ReleaseIdentifiers {
  const out: ReleaseIdentifiers = {}
  for (const key of IDENTIFIER_KEYS) {
    if (!(key in raw)) continue
    const parsed = parseReleaseBarcode(raw[key], key)
    if (parsed) out[key] = parsed
  }
  return out
}
