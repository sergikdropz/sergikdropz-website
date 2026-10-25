import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { printfulCatalogFetch } from '@/lib/printful'
import { MERCH_BLANKS } from '@/lib/merch/blanks'
import {
  categorizeCatalogProduct,
  inferStudioFamily,
  reconcileCatalogProductStudio,
  type PrintfulCatalogProduct,
} from '@/lib/merch/catalog-product-meta'
import type {
  CatalogProductDetail,
  CatalogVariantRow,
  PrintfulCatalogSnapshot,
} from '@/lib/merch/printful-catalog-types'

export type {
  CatalogPrintFile,
  CatalogPrintFileOption,
  CatalogProductDetail,
  CatalogTechnique,
  CatalogVariantRow,
  PrintfulCatalogSnapshot,
  PrintfulCatalogProduct,
} from '@/lib/merch/printful-catalog-types'
export { categorizeCatalogProduct, inferStudioFamily, reconcileCatalogProductStudio } from '@/lib/merch/catalog-product-meta'
import { colorNameToHex } from '@/lib/merch/color-names'
import {
  buildProductSpecs,
  parsePrintfilesPayload,
  parseTemplateVariantLinks,
  parseTemplatesPayload,
  type PrintfileRecord,
  type ProductSpecs,
  type TemplateRecord,
  type TemplateVariantLink,
  type VariantPlacementMap,
} from '@/lib/merch/product-specs'

function catalogPath() {
  return join(process.cwd(), 'data', 'printful-catalog.json')
}

type RawProduct = {
  id: number
  main_category_id?: number
  title?: string
  type?: string
  type_name?: string
  brand?: string | null
  model?: string | null
  image?: string | null
  variant_count?: number
  is_discontinued?: boolean
  avg_fulfillment_time?: number | null
  files?: Array<{
    id?: string
    type?: string
    title?: string
    additional_price?: string | number | null
    options?: Array<{
      id?: string
      type?: string
      title?: string
      additional_price?: string | number | null
    }>
  }>
  techniques?: Array<{ key?: string; display_name?: string; is_default?: boolean }>
  description?: string
  origin_country?: string | null
  currency?: string | null
}

function normalizeProduct(raw: RawProduct): PrintfulCatalogProduct {
  const title = raw.title || `Product ${raw.id}`
  const typeName = raw.type_name || raw.type || 'Product'
  const productType = raw.type || ''
  const family = inferStudioFamily(title, typeName, productType)
  const studioBlank =
    MERCH_BLANKS.find((blank) => blank.catalogHintId === raw.id) ||
    MERCH_BLANKS.find((blank) => blank.family === family) ||
    null

  return {
    id: raw.id,
    title,
    type: productType,
    typeName,
    brand: raw.brand ?? null,
    model: raw.model ?? null,
    image: raw.image ?? null,
    variantCount: raw.variant_count ?? 0,
    fileTypes: (raw.files || []).map((file) => file.type).filter(Boolean) as string[],
    isDiscontinued: Boolean(raw.is_discontinued),
    techniques: (raw.techniques || []).map((t) => t.key || t.display_name || '').filter(Boolean),
    studioFamily: studioBlank?.family ?? family,
    studioBlankId: studioBlank?.id ?? null,
    category: categorizeCatalogProduct(title, typeName, productType),
    mainCategoryId: raw.main_category_id ?? null,
    avgFulfillmentDays:
      raw.avg_fulfillment_time != null && Number.isFinite(Number(raw.avg_fulfillment_time))
        ? Number(raw.avg_fulfillment_time)
        : null,
  }
}

export function normalizeProductFromRaw(raw: RawProduct): PrintfulCatalogProduct {
  return normalizeProduct(raw)
}

export async function readPrintfulCatalogCache(): Promise<PrintfulCatalogSnapshot> {
  try {
    const raw = await readFile(catalogPath(), 'utf8')
    const parsed = JSON.parse(raw) as PrintfulCatalogSnapshot
    return {
      syncedAt: parsed.syncedAt ?? null,
      productCount: parsed.productCount ?? parsed.products?.length ?? 0,
      products: Array.isArray(parsed.products)
        ? parsed.products.map(reconcileCatalogProductStudio)
        : [],
    }
  } catch {
    return { syncedAt: null, productCount: 0, products: [] }
  }
}

export function variantsToMerchOptions(variants: CatalogVariantRow[]): {
  colors: import('@/lib/merch/blanks').BlankColor[] // eslint-friendly re-export shape
  sizes: string[]
  defaultColors: string[]
  defaultSizes: string[]
  minWholesale: number | null
} {
  const colorMap = new Map<string, string>()
  const sizes = new Set<string>()
  const prices: number[] = []

  for (const variant of variants) {
    if (variant.color) {
      const hex =
        variant.color_code && /^#[0-9a-f]{3,8}$/i.test(variant.color_code)
          ? variant.color_code
          : colorNameToHex(variant.color)
      colorMap.set(variant.color, hex)
    }
    const size = (variant.size || 'One size').trim()
    if (size) sizes.add(size)
    const price = Number(variant.price)
    if (Number.isFinite(price) && price > 0) prices.push(price)
  }

  const colors = [...colorMap.entries()].map(([name, hex]) => ({ name, hex }))
  const sizeList = [...sizes].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  const defaultColors = colors.slice(0, 2).map((c) => c.name)
  const defaultSizes = sizeList.filter((s) => !/^2?xl/i.test(s) || sizeList.length <= 5).slice(0, 5)
  const minWholesale = prices.length > 0 ? Math.min(...prices) : null

  return {
    colors,
    sizes: sizeList,
    defaultColors: defaultColors.length > 0 ? defaultColors : colors.slice(0, 1).map((c) => c.name),
    defaultSizes: defaultSizes.length > 0 ? defaultSizes : sizeList.slice(0, 4),
    minWholesale,
  }
}

export type PlacementGeometry = {
  printfiles: PrintfileRecord[]
  variantPrintfiles: VariantPlacementMap[]
  templates: TemplateRecord[]
  templateLinks: TemplateVariantLink[]
}

/**
 * Printful scopes `/mockup-generator/printfiles` and `/templates` by
 * `?technique=`: the default call only returns the default technique's
 * placements (DTG on a tee), so embroidery and DTF placements are missing
 * unless each technique is asked for. Fetch every technique the product
 * supports and merge, so every print file gets its own template + printfile.
 */
export async function fetchPlacementGeometry(
  productId: number,
  techniqueKeys: string[]
): Promise<PlacementGeometry> {
  const keys = [...new Set(techniqueKeys.filter(Boolean))]
  // Always include the unscoped (default-technique) call as a safety net.
  const queries: Array<string | null> = [null, ...keys]
  const results = await Promise.all(
    queries.map(async (technique) => {
      const suffix = technique ? `?technique=${encodeURIComponent(technique)}` : ''
      const [printfilePayload, templatePayload] = await Promise.all([
        readPrintfulOptional(`/mockup-generator/printfiles/${productId}${suffix}`, true),
        readPrintfulOptional(`/mockup-generator/templates/${productId}${suffix}`, true),
      ])
      return {
        parsed: parsePrintfilesPayload(printfilePayload),
        templates: parseTemplatesPayload(templatePayload),
        links: parseTemplateVariantLinks(templatePayload),
      }
    })
  )
  return mergePlacementGeometry(
    results.map((row) => ({
      printfiles: row.parsed.printfiles,
      variantPrintfiles: row.parsed.variantPrintfiles,
      templates: row.templates,
      templateLinks: row.links,
    }))
  )
}

/** Merge per-technique geometry. Printfile ids and template ids are global in Printful, so dedupe by id. */
export function mergePlacementGeometry(parts: PlacementGeometry[]): PlacementGeometry {
  const printfiles = new Map<number, PrintfileRecord>()
  const templates = new Map<string, TemplateRecord>()
  const variantPlacements = new Map<number, Record<string, number>>()
  const links: TemplateVariantLink[] = []
  const seenLinks = new Set<string>()
  for (const part of parts) {
    for (const file of part.printfiles) {
      if (!printfiles.has(file.printfileId)) printfiles.set(file.printfileId, file)
    }
    for (const template of part.templates) {
      const key = template.templateId != null ? `id:${template.templateId}` : `url:${template.imageUrl}:${template.printfileId}`
      if (!templates.has(key)) templates.set(key, template)
    }
    for (const row of part.variantPrintfiles) {
      const current = variantPlacements.get(row.variantId) || {}
      // Technique-specific placements extend the variant's map; never overwrite.
      variantPlacements.set(row.variantId, { ...row.placements, ...current })
    }
    for (const link of part.templateLinks) {
      const key = `${link.variantId}:${link.placement}:${link.templateId}`
      if (seenLinks.has(key)) continue
      seenLinks.add(key)
      links.push(link)
    }
  }
  return {
    printfiles: [...printfiles.values()],
    templates: [...templates.values()],
    variantPrintfiles: [...variantPlacements.entries()].map(([variantId, placements]) => ({ variantId, placements })),
    templateLinks: links,
  }
}

export async function fetchCatalogProductDetail(productId: number): Promise<CatalogProductDetail | null> {
  const data = await printfulCatalogFetch(`/products/${productId}`).catch(() => null)
  const rawProduct = data?.result?.product as RawProduct | undefined
  if (!rawProduct) return null
  const product = normalizeProduct(rawProduct)
  const variants = ((data?.result?.variants || []) as Array<CatalogVariantRow & {
    availability_regions?: Record<string, string>
    availability_status?: Array<{ region?: string; status?: string }>
    material?: Array<{ name?: string; percentage?: number }>
  }>).map((row) => ({
    id: row.id,
    color: row.color ?? null,
    size: row.size ?? null,
    price: row.price ?? null,
    in_stock: row.in_stock,
    color_code: row.color_code ?? null,
    image: row.image ?? null,
    availabilityRegions: row.availability_regions || row.availabilityRegions,
    availabilityStatus: (row.availability_status || row.availabilityStatus || [])
      .map((item) => ({ region: item.region || '', status: item.status || '' }))
      .filter((item) => item.region),
    material: (row.material || [])
      .map((item) => ({ name: item.name || '', percentage: Number(item.percentage) }))
      .filter((item) => item.name && Number.isFinite(item.percentage)),
  }))
  const options = variantsToMerchOptions(variants)
  const techniques = (rawProduct.techniques || [])
    .map((row) => ({
      key: row.key || '',
      label: row.display_name || row.key || 'Print',
      isDefault: Boolean(row.is_default),
    }))
    .filter((row) => row.key)
  const printFiles = (rawProduct.files || [])
    .map((file) => {
      const additionalPriceRaw = file.additional_price
      const additionalPrice =
        additionalPriceRaw != null && additionalPriceRaw !== '' && Number.isFinite(Number(additionalPriceRaw))
          ? Number(additionalPriceRaw)
          : null
      return {
        fileId: file.id || file.type || '',
        type: file.type || '',
        title: file.title || file.type || 'Print file',
        additionalPrice,
        options: (file.options || [])
          .map((option) => {
            const optionPriceRaw = option.additional_price
            const optionPrice =
              optionPriceRaw != null && optionPriceRaw !== '' && Number.isFinite(Number(optionPriceRaw))
                ? Number(optionPriceRaw)
                : null
            return {
              id: option.id || '',
              type: option.type || '',
              title: option.title || option.id || 'Option',
              additionalPrice: optionPrice,
            }
          })
          .filter((option) => option.id),
      }
    })
    .filter((file) => file.type && file.type !== 'mockup' && file.type !== 'preview')

  const geometry = await fetchPlacementGeometry(
    productId,
    techniques.map((row) => row.key)
  )
  const specs = buildProductSpecs({
    description: rawProduct.description || null,
    originCountry: rawProduct.origin_country || null,
    currency: rawProduct.currency || null,
    variants,
    files: printFiles,
    printfiles: geometry.printfiles,
    variantPrintfiles: geometry.variantPrintfiles,
    templates: geometry.templates,
    templateLinks: geometry.templateLinks,
  })
  const guidelineByType = new Map(specs.guidelines.flatMap((row) => row.types.map((type) => [type, row] as const)))
  const printFilesWithArea = printFiles.map((file) => {
    const guide = guidelineByType.get(file.type)
    return {
      ...file,
      printWidth: guide?.printWidth ?? null,
      printHeight: guide?.printHeight ?? null,
      dpi: guide?.dpi ?? null,
      templateId: guide?.templateId ?? null,
      templateUrl: guide?.templateUrl ?? null,
      mockupStage: guide?.templateStage ?? null,
      templateAspect: guide?.templateAspect ?? null,
      mockupSupported: Boolean(guide?.printWidth || guide?.templateUrl),
    }
  })

  return {
    product,
    colors: options.colors.length > 0 ? options.colors : MERCH_BLANKS[0].colors,
    sizes: options.sizes.length > 0 ? options.sizes : MERCH_BLANKS[0].sizes,
    defaultColors: options.defaultColors,
    defaultSizes: options.defaultSizes,
    minWholesale: options.minWholesale,
    fileTypes: product.fileTypes,
    variants,
    techniques,
    printFiles: printFilesWithArea,
    description: specs.lead || null,
    specs,
  }
}

export type PlacementPrintArea = { width: number; height: number; dpi: number }

/**
 * Real print-area pixel dimensions per placement for a catalog product, taken
 * from Printful's mockup-generator printfiles. Used so mockup tasks send the
 * correct area for EVERY product (tee, hoodie, hat, mug, poster, sleeves…),
 * not a hardcoded tee size. Returns an empty object if the API is unavailable.
 */
export async function fetchPlacementPrintAreas(
  productId: number,
  techniqueKeys?: string[]
): Promise<Record<string, PlacementPrintArea>> {
  let keys = techniqueKeys
  if (!keys) {
    const data = await printfulCatalogFetch(`/products/${productId}`).catch(() => null)
    const raw = (data?.result?.product?.techniques || []) as Array<{ key?: string }>
    keys = raw.map((row) => row.key || '').filter(Boolean)
  }
  const { printfiles, variantPrintfiles } = await fetchPlacementGeometry(productId, keys)
  const byId = new Map(printfiles.map((file) => [file.printfileId, file]))
  const counts = new Map<string, Map<number, number>>()
  for (const row of variantPrintfiles) {
    for (const [placement, rawId] of Object.entries(row.placements)) {
      const id = Number(rawId)
      if (!byId.has(id)) continue
      const bucket = counts.get(placement) ?? new Map<number, number>()
      bucket.set(id, (bucket.get(id) ?? 0) + 1)
      counts.set(placement, bucket)
    }
  }
  const areas: Record<string, PlacementPrintArea> = {}
  for (const [placement, bucket] of counts) {
    const bestId = [...bucket.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    const file = bestId != null ? byId.get(bestId) : undefined
    if (file) areas[placement] = { width: file.width, height: file.height, dpi: file.dpi }
  }
  // Products without a variant→placement map (posters, mugs) still expose one printfile.
  if (Object.keys(areas).length === 0 && printfiles[0]) {
    areas.default = {
      width: printfiles[0].width,
      height: printfiles[0].height,
      dpi: printfiles[0].dpi,
    }
  }
  return areas
}

export function resolvePlacementPrintArea(
  areas: Record<string, PlacementPrintArea>,
  placement: string
): PlacementPrintArea | null {
  return (
    areas[placement] ||
    areas.default ||
    areas.front ||
    Object.values(areas)[0] ||
    null
  )
}

async function readPrintfulOptional(endpoint: string, preferAuth = false): Promise<unknown | null> {
  try {
    if (preferAuth && process.env.PRINTFUL_API_KEY) {
      const { printfulFetch } = await import('@/lib/printful')
      return await printfulFetch(endpoint)
    }
    return await printfulCatalogFetch(endpoint)
  } catch {
    if (preferAuth && process.env.PRINTFUL_API_KEY) {
      try {
        return await printfulCatalogFetch(endpoint)
      } catch {
        return null
      }
    }
    return null
  }
}

export async function syncPrintfulCatalogFromApi(): Promise<PrintfulCatalogSnapshot> {
  const list = await printfulCatalogFetch('/products')
  const rows = (list.result || []) as RawProduct[]
  const products = rows.map(normalizeProduct).sort((a, b) => a.title.localeCompare(b.title))
  const payload: PrintfulCatalogSnapshot = {
    syncedAt: new Date().toISOString(),
    productCount: products.length,
    products,
  }
  await mkdir(join(process.cwd(), 'data'), { recursive: true })
  await writeFile(catalogPath(), JSON.stringify(payload, null, 2))
  return payload
}

export async function listCatalogProductsLive(options: {
  categoryId?: number
  q?: string
  limit?: number
}): Promise<PrintfulCatalogProduct[]> {
  const limit = options.limit && options.limit > 0 ? options.limit : 120
  let rows: RawProduct[] = []
  if (options.categoryId && Number.isFinite(options.categoryId)) {
    const data = await printfulCatalogFetch(`/products?category_id=${options.categoryId}`)
    rows = (data?.result || []) as RawProduct[]
  } else {
    const data = await printfulCatalogFetch('/products')
    rows = (data?.result || []) as RawProduct[]
  }
  let products = rows.map(normalizeProduct).filter((item) => !item.isDiscontinued)
  if (options.q?.trim()) {
    const q = options.q.trim().toLowerCase()
    products = products.filter((item) => {
      const hay = `${item.title} ${item.typeName} ${item.brand || ''}`.toLowerCase()
      return hay.includes(q)
    })
  }
  return products.slice(0, limit)
}

export function filterCatalogProducts(
  products: PrintfulCatalogProduct[],
  options: {
    q?: string
    category?: string
    categoryId?: number
    favorites?: number[]
    fastDeliveryOnly?: boolean
    specialOffersOnly?: boolean
    limit?: number
    includeDiscontinued?: boolean
  }
): PrintfulCatalogProduct[] {
  const q = (options.q || '').trim().toLowerCase()
  let list = products
  if (!options.includeDiscontinued) {
    list = list.filter((item) => !item.isDiscontinued)
  }
  if (options.category && options.category !== 'all') {
    list = list.filter((item) => item.category === options.category)
  }
  if (options.categoryId && Number.isFinite(options.categoryId)) {
    const id = Number(options.categoryId)
    list = list.filter((item) => item.mainCategoryId === id)
  }
  if (options.favorites?.length) {
    const set = new Set(options.favorites)
    list = list.filter((item) => set.has(item.id))
  }
  if (options.fastDeliveryOnly) {
    list = list.filter((item) => item.avgFulfillmentDays != null && item.avgFulfillmentDays <= 4)
  }
  if (options.specialOffersOnly) {
    list = list.filter(
      (item) =>
        item.title.toLowerCase().includes('stanley/stella') ||
        item.techniques.includes('DTFILM') ||
        item.techniques.includes('DTG')
    )
  }
  if (q) {
    list = list.filter((item) => {
      const hay = `${item.title} ${item.typeName} ${item.brand || ''} ${item.model || ''}`.toLowerCase()
      return hay.includes(q)
    })
  }
  const limit = options.limit && options.limit > 0 ? options.limit : list.length
  return list.slice(0, limit)
}
