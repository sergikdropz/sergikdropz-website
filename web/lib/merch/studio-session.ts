import {
  DEFAULT_SHOP_BACKDROP,
  parseShopBackdrop,
  shopBackdropIsOriginal,
  type ShopBackdrop,
} from '@/lib/merch/shop-backdrop'

const CATALOG_NAV_KEY = 'sergwear-catalog-nav'
const STUDIO_DESIGN_KEY = 'sergwear-studio-design'
const STAGE_VIEW_KEY = 'sergwear-stage-view'
const OPEN_TAB_KEY = 'sergwear-open-tabs'

export type CatalogNavSession = {
  activeNavId: string
  activeCategoryId: number | null
  sectionTitle: string
  expanded: number[]
  productsOpen: boolean
  productFolder: 'all' | 'draft' | 'live' | 'hidden' | null
}

export function readCatalogNavSession(): Partial<CatalogNavSession> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(CATALOG_NAV_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CatalogNavSession>
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export function writeCatalogNavSession(session: CatalogNavSession) {
  window.localStorage.setItem(CATALOG_NAV_KEY, JSON.stringify(session))
}

export function readStudioDesignId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STUDIO_DESIGN_KEY)
    const id = raw ? (JSON.parse(raw) as { designId?: string }).designId : ''
    return typeof id === 'string' && id ? id : null
  } catch {
    return null
  }
}

export function writeStudioDesignId(designId: string | null) {
  if (!designId) {
    window.localStorage.removeItem(STUDIO_DESIGN_KEY)
    return
  }
  window.localStorage.setItem(STUDIO_DESIGN_KEY, JSON.stringify({ designId }))
}

export function readStageView(): 'preview' | 'design' | null {
  if (typeof window === 'undefined') return null
  const value = window.localStorage.getItem(STAGE_VIEW_KEY)
  return value === 'preview' || value === 'design' ? value : null
}

export function writeStageView(view: 'preview' | 'design') {
  window.localStorage.setItem(STAGE_VIEW_KEY, view)
}

const PRODUCT_MATS_KEY = 'sergwear-product-mats'

/** Shared backdrop used by every product that has no per-design override. */
export const ALL_PRODUCTS_MAT_KEY = '__all__'
/** Explicit “Original” on one product so it does not inherit the all-products tone. */
export const PRODUCT_MAT_ORIGINAL = -1

export type ProductMatMap = Record<string, number>

function clampTone(tone: number): number {
  return Math.max(0, Math.min(255, Math.round(tone)))
}

function parseMatTone(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (value === PRODUCT_MAT_ORIGINAL) return PRODUCT_MAT_ORIGINAL
  return clampTone(value)
}

/** Saved backdrop tone for one design. Missing means inherit all-products, then original. */
export function readProductMats(): ProductMatMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(PRODUCT_MATS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return {}
    const map: ProductMatMap = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (!key) continue
      const tone = parseMatTone(value)
      if (tone == null) continue
      map[key] = tone
    }
    return map
  } catch {
    return {}
  }
}

export function writeProductMat(id: string, tone: number | null) {
  if (typeof window === 'undefined' || !id) return
  const map = readProductMats()
  if (tone == null) {
    const all = map[ALL_PRODUCTS_MAT_KEY]
    if (all != null && all !== PRODUCT_MAT_ORIGINAL) map[id] = PRODUCT_MAT_ORIGINAL
    else delete map[id]
  } else {
    map[id] = clampTone(tone)
  }
  window.localStorage.setItem(PRODUCT_MATS_KEY, JSON.stringify(map))
}

/** Replace every product backdrop with one tone. Null restores original on all. */
export function writeAllProductMats(tone: number | null) {
  if (typeof window === 'undefined') return
  if (tone == null) {
    window.localStorage.removeItem(PRODUCT_MATS_KEY)
    return
  }
  window.localStorage.setItem(
    PRODUCT_MATS_KEY,
    JSON.stringify({ [ALL_PRODUCTS_MAT_KEY]: clampTone(tone) }),
  )
}

export function productMatKey(designId: string | null, catalogProductId: number | null): string | null {
  if (designId) return designId
  if (catalogProductId != null) return `catalog:${catalogProductId}`
  return null
}

/** Per-product override, else the all-products tone. Null keeps the original color. */
export function resolveProductMat(map: ProductMatMap, key: string | null): number | null {
  if (key && Object.prototype.hasOwnProperty.call(map, key)) {
    const value = map[key]
    return value === PRODUCT_MAT_ORIGINAL ? null : value
  }
  const all = map[ALL_PRODUCTS_MAT_KEY]
  if (all == null || all === PRODUCT_MAT_ORIGINAL) return null
  return all
}

export function productMatCss(map: ProductMatMap | undefined, key: string | null): string | undefined {
  const tone = resolveProductMat(map || {}, key)
  return tone == null ? undefined : productMatColor(tone)
}

/** Flat color behind a cut-out product. The garment image stays on top. */
export function productMatColor(tone: number): string {
  const value = Math.max(0, Math.min(255, Math.round(tone)))
  return `rgb(${value}, ${value}, ${value})`
}

const SHOP_BACKDROP_KEY = 'sergwear-shop-backdrop'

export type { ShopBackdrop } from '@/lib/merch/shop-backdrop'
export {
  DEFAULT_SHOP_BACKDROP,
  activeShopBackdrop,
  parseShopBackdrop,
  shopBackdropCss,
  shopBackdropIsOriginal,
} from '@/lib/merch/shop-backdrop'

export function readShopBackdrop(): ShopBackdrop {
  if (typeof window === 'undefined') return DEFAULT_SHOP_BACKDROP
  try {
    const raw = window.localStorage.getItem(SHOP_BACKDROP_KEY)
    if (!raw) return DEFAULT_SHOP_BACKDROP
    return parseShopBackdrop(JSON.parse(raw))
  } catch {
    return DEFAULT_SHOP_BACKDROP
  }
}

export function writeShopBackdrop(backdrop: ShopBackdrop) {
  if (typeof window === 'undefined') return
  const saved = parseShopBackdrop(backdrop)
  if (shopBackdropIsOriginal(saved)) {
    window.localStorage.removeItem(SHOP_BACKDROP_KEY)
    return
  }
  window.localStorage.setItem(SHOP_BACKDROP_KEY, JSON.stringify(saved))
}

export function readOpenTab(designId: string): string | null {
  if (typeof window === 'undefined' || !designId) return null
  try {
    const raw = window.localStorage.getItem(OPEN_TAB_KEY)
    if (!raw) return null
    const map = JSON.parse(raw) as Record<string, unknown>
    const value = map[designId]
    return typeof value === 'string' && value ? value : null
  } catch {
    return null
  }
}

const STUDIO_DOCK_KEY = 'sergwear-studio-docks'

export function readStudioDockOpen(id: string, fallback = false): boolean {
  if (typeof window === 'undefined' || !id) return fallback
  try {
    const raw = window.localStorage.getItem(STUDIO_DOCK_KEY)
    if (!raw) return fallback
    const map = JSON.parse(raw) as Record<string, unknown>
    return typeof map[id] === 'boolean' ? map[id] : fallback
  } catch {
    return fallback
  }
}

export function writeStudioDockOpen(id: string, open: boolean) {
  if (typeof window === 'undefined' || !id) return
  let map: Record<string, boolean> = {}
  try {
    const raw = window.localStorage.getItem(STUDIO_DOCK_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'boolean') map[key] = value
      }
    }
  } catch {
    map = {}
  }
  map[id] = open
  window.localStorage.setItem(STUDIO_DOCK_KEY, JSON.stringify(map))
}

export function writeOpenTab(designId: string, fileType: string) {
  if (typeof window === 'undefined' || !designId || !fileType) return
  let map: Record<string, string> = {}
  try {
    const raw = window.localStorage.getItem(OPEN_TAB_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'string' && value) map[key] = value
      }
    }
  } catch {
    map = {}
  }
  map[designId] = fileType
  window.localStorage.setItem(OPEN_TAB_KEY, JSON.stringify(map))
}
