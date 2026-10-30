import type { BlankColor } from '@/lib/merch/blanks'
import type { ProductSpecs } from '@/lib/merch/product-specs'
import type { PrintfulCatalogProduct } from '@/lib/merch/catalog-product-meta'

export type { PrintfulCatalogProduct } from '@/lib/merch/catalog-product-meta'

export type CatalogVariantRow = {
  id: number
  color?: string | null
  size?: string | null
  price?: string | number | null
  in_stock?: boolean
  color_code?: string | null
  color_code2?: string | null
  image?: string | null
  availabilityRegions?: Record<string, string>
  availabilityStatus?: Array<{ region: string; status: string }>
  material?: Array<{ name: string; percentage: number }>
}

export type CatalogTechnique = {
  key: string
  label: string
  isDefault: boolean
}

export type CatalogPrintFileOption = {
  id: string
  type: string
  title: string
  additionalPrice: number | null
}

export type CatalogPrintFile = {
  fileId: string
  type: string
  title: string
  additionalPrice: number | null
  options: CatalogPrintFileOption[]
  printWidth?: number | null
  printHeight?: number | null
  dpi?: number | null
  /** Printful mockup-generator template id resolved for this placement. */
  templateId?: number | null
  templateUrl?: string | null
  /** Printful template photo and garment color for each variant, keyed by variant id. */
  variantTemplates?: Record<string, { imageUrl: string; backgroundColor: string | null }>
  /** Normalized print drop zone from Printful positioning template (0–1). */
  mockupStage?: { x: number; y: number; w: number; h: number } | null
  /** Width / height of the template image so the stage can keep its true shape. */
  templateAspect?: number | null
  /**
   * False when Printful exposes neither a printfile nor a template for this
   * placement under any technique (e.g. legacy `embroidery_front` on the dad hat).
   * Such files are hidden from the designer when a calibrated sibling exists.
   */
  mockupSupported?: boolean
}

export type CatalogProductDetail = {
  product: PrintfulCatalogProduct
  colors: BlankColor[]
  sizes: string[]
  defaultColors: string[]
  defaultSizes: string[]
  minWholesale: number | null
  fileTypes: string[]
  variants: CatalogVariantRow[]
  techniques: CatalogTechnique[]
  printFiles: CatalogPrintFile[]
  /** Flat Printful thread-color option ids for this product (`thread_colors_front_large`, …). */
  threadOptionIds?: string[]
  description: string | null
  specs: ProductSpecs | null
}

export type PrintfulCatalogSnapshot = {
  syncedAt: string | null
  productCount: number
  products: PrintfulCatalogProduct[]
}
