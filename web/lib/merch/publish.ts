import { getBlank, type BlankPlacement, type MerchBlank } from '@/lib/merch/blanks'
import {
  absoluteUrl,
  isPublicFulfillmentUrl,
  placementKey,
  type ArtPlacement,
  type DesignVariant,
  type MerchDesign,
} from '@/lib/merch/design'
import { printfulCatalogFetch, printfulFetch } from '@/lib/printful'
import {
  fetchPlacementPrintAreas,
  resolvePlacementPrintArea,
  type PlacementPrintArea,
} from '@/lib/merch/printful-catalog'

type CatalogListItem = {
  id: number
  title?: string
  type_name?: string
}

type CatalogVariant = {
  id: number
  size?: string | null
  color?: string | null
  price?: string | number
  in_stock?: boolean
}

type CatalogProduct = {
  id: number
  title?: string
  files?: Array<{ type?: string; title?: string }>
  techniques?: Array<{ key?: string }>
}

export type PrintFile = {
  type: string
  url: string
  position: {
    area_width: number
    area_height: number
    width: number
    height: number
    top: number
    left: number
  }
}

/** Baked print files from the fitting room, keyed by Printful file type (or front/back for studio blanks). */
export type PrintFileOverrides = Record<string, string>

export type PublishResult = {
  variants: DesignVariant[]
  printfulSyncProductId: string | null
  mockupTaskKey: string | null
  wholesaleCost: number | null
  note: string
}

function titleMatches(title: string, fragments: string[]): boolean {
  const hay = title.toLowerCase()
  return fragments.every((fragment) => hay.includes(fragment.toLowerCase()))
}

function looseTitleMatch(title: string, fragments: string[]): boolean {
  const hay = title.toLowerCase()
  return fragments.some((fragment) => hay.includes(fragment.toLowerCase()))
}

export async function resolveCatalogProduct(
  blank: MerchBlank,
  catalogProductId?: number | null
): Promise<{
  product: CatalogProduct
  variants: CatalogVariant[]
} | null> {
  const overrideId =
    catalogProductId && Number.isFinite(catalogProductId) ? Number(catalogProductId) : blank.catalogHintId
  const hinted = await printfulCatalogFetch(`/products/${overrideId}`).catch(() => null)
  const hintedProduct = hinted?.result?.product as CatalogProduct | undefined
  const hintedVariants = (hinted?.result?.variants || []) as CatalogVariant[]
  if (
    hintedProduct &&
    catalogProductId != null &&
    Number.isFinite(Number(catalogProductId)) &&
    Number(catalogProductId) === overrideId
  ) {
    return { product: hintedProduct, variants: hintedVariants }
  }
  if (hintedProduct && titleMatches(hintedProduct.title || '', blank.titleMatch)) {
    return { product: hintedProduct, variants: hintedVariants }
  }
  if (hintedProduct && looseTitleMatch(hintedProduct.title || '', blank.titleMatch)) {
    return { product: hintedProduct, variants: hintedVariants }
  }

  const list = await printfulCatalogFetch('/products')
  const products = (list.result || []) as CatalogListItem[]
  const found =
    products.find((item) => titleMatches(item.title || '', blank.titleMatch)) ||
    products.find((item) => looseTitleMatch(item.title || '', blank.titleMatch))
  if (!found) return null
  const details = await printfulCatalogFetch(`/products/${found.id}`)
  return {
    product: details.result.product as CatalogProduct,
    variants: (details.result.variants || []) as CatalogVariant[],
  }
}

function fileTypeFor(area: BlankPlacement, product: CatalogProduct): string {
  const types = new Set((product.files || []).map((file) => file.type).filter(Boolean) as string[])
  if (types.has(area.printfulType)) return area.printfulType
  if (area.id === 'front' && types.has('default')) return 'default'
  if (types.has('front') && area.id === 'front') return 'front'
  return area.printfulType
}

function overrideFor(overrides: PrintFileOverrides, placement: ArtPlacement): string | undefined {
  return overrides[placementKey(placement)] || overrides[placement.placement]
}

/**
 * Printful sync-product files for a design. Each placement keeps its own
 * Printful file type (sleeve_left, label_inside, front_large…) so nothing
 * collapses into "front" on the way to the printer.
 */
export function buildPrintFiles(
  design: MerchDesign,
  blank: MerchBlank,
  product: CatalogProduct,
  origin: string,
  overrides: PrintFileOverrides,
  printAreas: Record<string, PlacementPrintArea> = {}
): PrintFile[] {
  const seen = new Set<string>()
  return design.placements
    .map((placement) => {
      const area =
        blank.placements.find((item) => item.id === placement.placement) || blank.placements[0]
      const source = overrideFor(overrides, placement) || placement.assetUrl
      if (!area || !source) return null
      const url = absoluteUrl(source, origin)
      if (!isPublicFulfillmentUrl(url)) return null
      const type = placement.fileType || fileTypeFor(area, product)
      if (seen.has(type)) return null
      seen.add(type)
      // Prefer the catalog product's real print area; fall back to blank dims.
      const live = resolvePlacementPrintArea(printAreas, type)
      const areaWidth = live?.width ?? area.printWidth
      const areaHeight = live?.height ?? area.printHeight
      return {
        type,
        url,
        position: {
          area_width: areaWidth,
          area_height: areaHeight,
          width: areaWidth,
          height: areaHeight,
          top: 0,
          left: 0,
        },
      }
    })
    .filter((file): file is PrintFile => Boolean(file))
}

function pickVariants(blank: MerchBlank, design: MerchDesign, variants: CatalogVariant[]): CatalogVariant[] {
  const colors = new Set(design.colors.map((color) => color.toLowerCase()))
  const sizes = new Set(design.sizes.map((size) => size.toLowerCase()))
  return variants.filter((variant) => {
    const color = (variant.color || '').toLowerCase()
    const size = (variant.size || 'one size').toLowerCase()
    const colorOk = colors.size === 0 || [...colors].some((wanted) => color.includes(wanted) || wanted.includes(color))
    const sizeOk = sizes.size === 0 || sizes.has(size) || (size === 'os' && sizes.has('one size'))
    return colorOk && sizeOk && variant.in_stock !== false
  })
}

export async function publishDesignToPrintful(
  design: MerchDesign,
  origin: string,
  printFilesByPlacement: PrintFileOverrides = {}
): Promise<PublishResult> {
  const blank = getBlank(design.blankId)
  if (!blank) {
    return {
      variants: [],
      printfulSyncProductId: null,
      mockupTaskKey: null,
      wholesaleCost: null,
      note: 'Unknown garment.',
    }
  }
  if (!process.env.PRINTFUL_API_KEY) {
    return {
      variants: [],
      printfulSyncProductId: null,
      mockupTaskKey: null,
      wholesaleCost: blank.estimatedCost,
      note: 'Design saved. Add PRINTFUL_API_KEY to send it to the printer.',
    }
  }

  if (design.printfulSyncProductId && design.variants.some((variant) => variant.syncVariantId > 0)) {
    return {
      variants: design.variants,
      printfulSyncProductId: design.printfulSyncProductId,
      mockupTaskKey: design.mockupTaskKey,
      wholesaleCost: design.wholesaleCost ?? blank.estimatedCost,
      note: 'Already at the printer. Make it public when the photos look right.',
    }
  }

  const files = buildPrintFiles(design, blank, { id: blank.catalogHintId, files: [] }, origin, printFilesByPlacement)
  const activePlacements = design.placements.filter((placement) => placement.assetUrl)
  const publicFiles =
    activePlacements.length > 0 &&
    activePlacements.every((placement) => {
      const source = overrideFor(printFilesByPlacement, placement) || placement.assetUrl
      return isPublicFulfillmentUrl(absoluteUrl(source, origin))
    })
  if (!publicFiles || files.length === 0) {
    return {
      variants: [],
      printfulSyncProductId: null,
      mockupTaskKey: null,
      wholesaleCost: blank.estimatedCost,
      note: 'Design saved. Printful needs a public https art URL, so localhost stays in the fitting room until the site is on a public origin.',
    }
  }

  const resolved = await resolveCatalogProduct(blank, design.catalogProductId)
  if (!resolved) {
    return {
      variants: [],
      printfulSyncProductId: null,
      mockupTaskKey: null,
      wholesaleCost: blank.estimatedCost,
      note: `Design saved. No Printful blank matched ${blank.name}.`,
    }
  }

  const chosen = pickVariants(blank, design, resolved.variants)
  if (chosen.length === 0) {
    return {
      variants: [],
      printfulSyncProductId: null,
      mockupTaskKey: null,
      wholesaleCost: blank.estimatedCost,
      note: 'Design saved. None of the selected colors and sizes are in stock at Printful.',
    }
  }

  const printAreas = await fetchPlacementPrintAreas(
    resolved.product.id,
    (resolved.product.techniques || []).map((row) => row.key || '').filter(Boolean)
  ).catch(() => ({}))
  const readyFiles = buildPrintFiles(
    design,
    blank,
    resolved.product,
    origin,
    printFilesByPlacement,
    printAreas
  )
  const thumbnail = readyFiles[0]?.url
  const created = await printfulFetch('/store/products', {
    method: 'POST',
    body: JSON.stringify({
      sync_product: { name: design.name, thumbnail },
      sync_variants: chosen.map((variant) => ({
        variant_id: variant.id,
        retail_price: design.retailPrice.toFixed(2),
        files: readyFiles,
      })),
    }),
  })

  const syncVariants = (created.result?.sync_variants || []) as Array<{
    id: number
    variant_id: number
    size?: string
    color?: string
    retail_price?: string
  }>
  const variants: DesignVariant[] = syncVariants.map((variant) => ({
    catalogVariantId: variant.variant_id,
    syncVariantId: variant.id,
    size: variant.size || '',
    color: variant.color || '',
    retailPrice: design.retailPrice,
  }))
  const prices = chosen
    .map((variant) => Number(variant.price))
    .filter((price) => Number.isFinite(price) && price > 0)
  const wholesaleCost = prices.length > 0 ? Math.min(...prices) : blank.estimatedCost

  let mockupTaskKey: string | null = null
  try {
    const task = await printfulFetch(`/mockup-generator/create-task/${resolved.product.id}`, {
      method: 'POST',
      body: JSON.stringify({
        variant_ids: [chosen[0].id],
        format: 'jpg',
        files: readyFiles.map(({ type, url, position }) => ({
          placement: type,
          image_url: url,
          position,
        })),
      }),
    })
    mockupTaskKey = task.result?.task_key ? String(task.result.task_key) : null
  } catch (error) {
    console.error('Printful mockup task:', error)
  }

  return {
    variants,
    printfulSyncProductId: created.result?.sync_product?.id
      ? String(created.result.sync_product.id)
      : null,
    mockupTaskKey,
    wholesaleCost,
    note: mockupTaskKey
      ? 'Hidden in the shop. Printful is making the photos.'
      : 'Hidden in the shop. The printer has the product. Photos can be generated again from this design.',
  }
}

export function collectMockupUrls(result: unknown): string[] {
  const urls = new Set<string>()
  const walk = (value: unknown) => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      value.forEach(walk)
      return
    }
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if ((key === 'url' || key === 'mockup_url') && typeof nested === 'string' && nested.startsWith('http')) {
        urls.add(nested)
      } else {
        walk(nested)
      }
    }
  }
  walk(result)
  return [...urls]
}

export function placementsReady(placements: ArtPlacement[]): boolean {
  return placements.some((placement) => placement.assetUrl && placement.assetWidth > 0)
}
