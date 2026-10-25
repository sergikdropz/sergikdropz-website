import { getBlank, MERCH_BLANKS, type GarmentFamily, type MerchBlank } from '@/lib/merch/blanks'

/** Client-safe catalog product row (no Node fs). */
export type PrintfulCatalogProduct = {
  id: number
  title: string
  type: string
  typeName: string
  brand: string | null
  model: string | null
  image: string | null
  variantCount: number
  fileTypes: string[]
  isDiscontinued: boolean
  techniques: string[]
  studioFamily: GarmentFamily | null
  studioBlankId: string | null
  category: string
  mainCategoryId: number | null
  avgFulfillmentDays: number | null
}

export function categorizeCatalogProduct(title: string, typeName: string, productType?: string): string {
  const lower = `${title} ${typeName} ${productType || ''}`.toLowerCase()
  if (lower.includes('hoodie') || lower.includes('sweatshirt')) return 'hoodies'
  if (lower.includes('hat') || lower.includes('cap') || lower.includes('beanie')) return 'hats'
  if (
    lower.includes('tee') ||
    lower.includes('t-shirt') ||
    lower.includes('tank') ||
    lower.includes('short sleeve') ||
    lower.includes('long sleeve') ||
    lower.includes('shirt') ||
    lower.includes('polo')
  ) {
    return 'tees'
  }
  if (lower.includes('pant') || lower.includes('jogger') || lower.includes('legging')) {
    return 'pants'
  }
  if (/\bshorts\b/.test(lower)) {
    return 'pants'
  }
  return 'accessories'
}

export function inferStudioFamily(title: string, typeName: string, productType?: string): GarmentFamily {
  const category = categorizeCatalogProduct(title, typeName, productType)
  if (category === 'hoodies') return 'hoodie'
  if (category === 'hats') return 'hat'
  if (category === 'pants') return 'sweatpants'
  return 'tee'
}

/** Re-derive studio blank from titles (fixes stale cache rows, e.g. “Short Sleeve” → pants). */
export function reconcileCatalogProductStudio(product: PrintfulCatalogProduct): PrintfulCatalogProduct {
  const family = inferStudioFamily(product.title, product.typeName, product.type)
  const studioBlank =
    MERCH_BLANKS.find((blank) => blank.catalogHintId === product.id) ||
    MERCH_BLANKS.find((blank) => blank.family === family) ||
    null
  return {
    ...product,
    category: categorizeCatalogProduct(product.title, product.typeName, product.type),
    studioFamily: studioBlank?.family ?? family,
    studioBlankId: studioBlank?.id ?? null,
  }
}

export function resolveBlankForCatalogProduct(product: PrintfulCatalogProduct): MerchBlank {
  const reconciled = reconcileCatalogProductStudio(product)
  return (
    MERCH_BLANKS.find((item) => item.catalogHintId === reconciled.id) ||
    (reconciled.studioBlankId ? getBlank(reconciled.studioBlankId) : undefined) ||
    MERCH_BLANKS.find((item) => item.family === reconciled.studioFamily) ||
    MERCH_BLANKS[0]
  )
}
