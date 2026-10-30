/** One backdrop behind every public shop preview. Original is solid white. */
export type ShopBackdrop = {
  color: string
  opacity: number
}

export const DEFAULT_SHOP_BACKDROP: ShopBackdrop = { color: '#ffffff', opacity: 1 }

function clampOpacity(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export function normalizeShopBackdropHex(value: string): string | null {
  const raw = value.trim().replace('#', '')
  const full = raw.length === 3 ? raw.split('').map((part) => part + part).join('') : raw
  if (!/^[0-9a-f]{6}$/i.test(full)) return null
  return `#${full.toLowerCase()}`
}

export function parseShopBackdrop(value: unknown): ShopBackdrop {
  if (!value || typeof value !== 'object') return DEFAULT_SHOP_BACKDROP
  const raw = value as { color?: unknown; opacity?: unknown }
  const color = typeof raw.color === 'string' ? normalizeShopBackdropHex(raw.color) : null
  const opacity = typeof raw.opacity === 'number' && Number.isFinite(raw.opacity) ? clampOpacity(raw.opacity) : 1
  if (!color) return DEFAULT_SHOP_BACKDROP
  return { color, opacity }
}

export function shopBackdropIsOriginal(backdrop: ShopBackdrop): boolean {
  return backdrop.color === DEFAULT_SHOP_BACKDROP.color && backdrop.opacity >= 1
}

export function shopBackdropCss(backdrop: ShopBackdrop): string {
  const parsed = parseShopBackdrop(backdrop)
  if (parsed.opacity >= 1) return parsed.color
  const raw = parsed.color.slice(1)
  const r = Number.parseInt(raw.slice(0, 2), 16)
  const g = Number.parseInt(raw.slice(2, 4), 16)
  const b = Number.parseInt(raw.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${parsed.opacity})`
}

/** Null keeps the original white field. A value replaces every product backdrop. */
export function activeShopBackdrop(backdrop: ShopBackdrop | null | undefined): ShopBackdrop | null {
  if (!backdrop || shopBackdropIsOriginal(backdrop)) return null
  return backdrop
}
