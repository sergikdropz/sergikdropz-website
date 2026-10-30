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
import { embroideryVariantOptions } from '@/lib/merch/embroidery-threads'

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
  files?: Array<{ type?: string; title?: string; options?: Array<{ id?: string }> }>
  techniques?: Array<{ key?: string }>
  options?: Array<{ id?: string }>
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
  /** True when this call asked Printful for a new photo task. A null key then means the task failed. */
  requestedMockups: boolean
  /** The stored photos already match this color, stitch, and placement. */
  reusePhotos?: boolean
  /** Fingerprint to store once the new photos finish downloading. */
  mockupPhotoKey?: string | null
  wholesaleCost: number | null
  note: string
}

/** Printful reuses a file when the URL is unchanged, even after we replace the bytes. */
export function freshPrintfulUrl(url: string): string {
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}pf=${Date.now()}`
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

type SyncPrintFile = PrintFile & { options?: Array<{ id: string; value: true }> }

const MOCKUP_ANGLES = 6

function sameSize(variantSize: string | null | undefined, preferredSize: string | null | undefined): boolean {
  const size = (preferredSize || '').trim().toLowerCase()
  const variant = (variantSize || '').trim().toLowerCase()
  if (!size || !variant) return !size
  if (variant === size) return true
  return (variant === 'os' && size === 'one size') || (variant === 'one size' && size === 'os')
}

/** One Printful variant per catalog color, with the preview color first. */
export function variantIdsForColors(
  variants: Array<{ id: number; color?: string | null; size?: string | null }>,
  preferredSize: string | null,
  preferredColor?: string | null,
): number[] {
  const byColor = new Map<string, { id: number; color: string; sizeRank: number }>()
  for (const variant of variants) {
    if (!Number.isFinite(variant.id) || variant.id <= 0) continue
    const color = (variant.color || '').trim()
    if (!color) continue
    const sizeRank = sameSize(variant.size, preferredSize) ? 0 : 1
    const key = color.toLowerCase()
    const current = byColor.get(key)
    if (!current || sizeRank < current.sizeRank) byColor.set(key, { id: variant.id, color, sizeRank })
  }
  const rows = [...byColor.values()]
  const preferred = (preferredColor || '').trim().toLowerCase()
  rows.sort((a, b) => {
    const aFirst = preferred && a.color.toLowerCase() === preferred ? 0 : 1
    const bFirst = preferred && b.color.toLowerCase() === preferred ? 0 : 1
    return aFirst - bFirst
  })
  return rows.map((row) => row.id)
}

/** The one variant Printful should photograph: the color on the stage. */
export function previewVariantId(
  variants: Array<{ id: number; color?: string | null; size?: string | null }>,
  preferredSize: string | null,
  preferredColor?: string | null,
): number | null {
  return variantIdsForColors(variants, preferredSize, preferredColor)[0] ?? null
}

export type MockupAngle = { url: string; title: string }

function roundPhotoKey(value: number): string {
  return (Math.round(value * 1000) / 1000).toString()
}

/** Changes when the photographed color, stitch file, placement, or threads change. */
export function mockupPhotoKey(parts: {
  catalogProductId?: number | null
  colorName?: string | null
  files: Array<{ type: string; url: string }>
  placements: Array<Pick<ArtPlacement, 'fileType' | 'placement' | 'assetUrl' | 'x' | 'y' | 'scale' | 'rotation'>>
  unlimited?: boolean
  threads?: Record<string, string[]> | null
}): string {
  const files = parts.files
    .map((file) => `${file.type}:${file.url.split('?')[0]}`)
    .sort()
    .join('|')
  const placements = parts.placements
    .map(
      (placement) =>
        `${placement.fileType || placement.placement}:${placement.assetUrl.split('?')[0]}:${roundPhotoKey(placement.x)}:${roundPhotoKey(placement.y)}:${roundPhotoKey(placement.scale)}:${roundPhotoKey(placement.rotation)}`,
    )
    .sort()
    .join('|')
  const threads = parts.unlimited
    ? 'unlimited'
    : Object.entries(parts.threads || {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, hexes]) => `${id}:${[...hexes].sort().join(',')}`)
        .join('|')
  return [
    parts.catalogProductId || '',
    (parts.colorName || '').trim().toLowerCase(),
    files,
    placements,
    threads,
  ].join('~')
}

export function photosMatchKey(
  design: Pick<MerchDesign, 'previewColorName' | 'mockupUrlsByColor' | 'mockupPhotoKeysByColor'>,
  photoKey: string,
): boolean {
  const color = (design.previewColorName || '').trim().toLowerCase()
  if (!color || !photoKey) return false
  const storedKey = Object.entries(design.mockupPhotoKeysByColor || {}).find(
    ([name]) => name.trim().toLowerCase() === color,
  )?.[1]
  if (storedKey !== photoKey) return false
  const photos =
    Object.entries(design.mockupUrlsByColor || {}).find(([name]) => name.trim().toLowerCase() === color)?.[1] || []
  return photos.some((url) => Boolean(url) && !url.startsWith('http'))
}

/** Angle photos from a completed mockup task, up to six per variant. */
export function collectMockupAnglesByVariant(result: unknown): Map<number, MockupAngle[]> {
  const grouped = new Map<number, MockupAngle[]>()
  const root = result && typeof result === 'object' ? (result as { mockups?: unknown }).mockups : null
  if (!Array.isArray(root)) return grouped
  for (const mockup of root) {
    if (!mockup || typeof mockup !== 'object') continue
    const row = mockup as { variant_ids?: unknown; mockup_url?: unknown; extra?: unknown }
    const variantIds = Array.isArray(row.variant_ids)
      ? row.variant_ids.map(Number).filter((id) => Number.isFinite(id) && id > 0)
      : []
    const angles: MockupAngle[] = []
    const push = (url: unknown, title: unknown) => {
      if (typeof url !== 'string' || !url.startsWith('http') || angles.some((angle) => angle.url === url)) return
      if (angles.length >= MOCKUP_ANGLES) return
      const name = typeof title === 'string' && title.trim() ? title.trim() : `Angle ${angles.length + 1}`
      angles.push({ url, title: name.slice(0, 80) })
    }
    if (Array.isArray(row.extra)) {
      for (const extra of row.extra) {
        if (!extra || typeof extra !== 'object') continue
        const shot = extra as { url?: unknown; title?: unknown; option?: unknown }
        push(shot.url, shot.title || shot.option)
      }
    }
    push(row.mockup_url, 'Front')
    if (variantIds.length === 0 || angles.length === 0) continue
    for (const id of variantIds) {
      const list = grouped.get(id) || []
      for (const angle of angles) {
        if (!list.some((item) => item.url === angle.url) && list.length < MOCKUP_ANGLES) list.push(angle)
      }
      grouped.set(id, list)
    }
  }
  return grouped
}

export function collectMockupsByVariant(result: unknown): Map<number, string[]> {
  return new Map(
    [...collectMockupAnglesByVariant(result)].map(([id, angles]) => [id, angles.map((angle) => angle.url)]),
  )
}

export function mockupAnglesByColorFromTask(
  result: unknown,
  colorByVariantId: Map<number, string>,
  fallbackColor: string | null,
): Record<string, MockupAngle[]> {
  const grouped = collectMockupAnglesByVariant(result)
  const byColor: Record<string, MockupAngle[]> = {}
  for (const [variantId, angles] of grouped) {
    const color = colorByVariantId.get(variantId)
    if (!color || angles.length === 0) continue
    const existing = byColor[color] || []
    for (const angle of angles) {
      if (!existing.some((item) => item.url === angle.url) && existing.length < MOCKUP_ANGLES) existing.push(angle)
    }
    byColor[color] = existing
  }
  if (Object.keys(byColor).length === 0 && fallbackColor) {
    const first = grouped.size > 0 ? [...grouped.values()][0] : null
    const angles =
      first && first.length > 0
        ? first
        : collectMockupUrls(result)
            .slice(0, MOCKUP_ANGLES)
            .map((url, index) => ({ url, title: `Angle ${index + 1}` }))
    if (angles.length > 0) byColor[fallbackColor] = angles.slice(0, MOCKUP_ANGLES)
  }
  return byColor
}

export function mockupsByColorFromTask(
  result: unknown,
  colorByVariantId: Map<number, string>,
  fallbackColor: string | null,
): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(mockupAnglesByColorFromTask(result, colorByVariantId, fallbackColor)).map(([color, angles]) => [
      color,
      angles.map((angle) => angle.url),
    ]),
  )
}

async function createMockupTask(
  catalogProductId: number,
  variantIds: number[],
  files: SyncPrintFile[],
  threadOptions: ReturnType<typeof embroideryVariantOptions>,
): Promise<string | null> {
  const ids = [...new Set(variantIds.filter((id) => Number.isFinite(id) && id > 0))]
  if (ids.length === 0) return null
  const productOptions: Record<string, string[]> = {}
  for (const option of threadOptions) productOptions[option.id] = option.value
  const task = await printfulFetch(`/mockup-generator/create-task/${catalogProductId}`, {
    method: 'POST',
    body: JSON.stringify({
      variant_ids: ids,
      format: 'jpg',
      ...(Object.keys(productOptions).length > 0 ? { product_options: productOptions } : {}),
      files: files.map(({ type, url, position, options }) => ({
        placement: type,
        image_url: url,
        position,
        ...(options ? { options } : {}),
      })),
    }),
  })
  return task.result?.task_key ? String(task.result.task_key) : null
}

async function startMockupTask(
  catalogProductId: number,
  variantIds: number[],
  files: SyncPrintFile[],
  threadOptions: ReturnType<typeof embroideryVariantOptions>,
): Promise<string | null> {
  const ids = [...new Set(variantIds.filter((id) => Number.isFinite(id) && id > 0))]
  if (ids.length === 0) return null
  try {
    return await createMockupTask(catalogProductId, ids, files, threadOptions)
  } catch (error) {
    console.error('Printful mockup task:', error)
    if (ids.length < 2) return null
    try {
      return await createMockupTask(catalogProductId, [ids[0]], files, threadOptions)
    } catch (again) {
      console.error('Printful mockup task:', again)
      return null
    }
  }
}

async function refreshPrintedDesign(
  design: MerchDesign,
  blank: MerchBlank,
  catalogProductId: number,
  files: SyncPrintFile[],
  threadOptions: ReturnType<typeof embroideryVariantOptions>,
  startPhotos: () => Promise<string | null>,
  reusePhotos: boolean,
  photoKey: string,
): Promise<PublishResult> {
  const syncProductId = design.printfulSyncProductId
  if (!syncProductId) {
    return {
      variants: design.variants,
      printfulSyncProductId: null,
      mockupTaskKey: null,
      requestedMockups: false,
      wholesaleCost: design.wholesaleCost ?? blank.estimatedCost,
      note: 'Design saved.',
    }
  }
  const current = await printfulFetch(`/store/products/${encodeURIComponent(syncProductId)}`)
  const rows = (current.result?.sync_variants || []) as Array<{ id?: number; variant_id?: number }>
  const kept = rows.filter((row) => Number(row.id) > 0)
  if (kept.length === 0) {
    return {
      variants: design.variants,
      printfulSyncProductId: syncProductId,
      mockupTaskKey: null,
      requestedMockups: false,
      wholesaleCost: design.wholesaleCost ?? blank.estimatedCost,
      note: 'Printful has no variants on this product, so the photos were not replaced.',
    }
  }
  await printfulFetch(`/store/products/${encodeURIComponent(syncProductId)}`, {
    method: 'PUT',
    body: JSON.stringify({
      sync_product: { name: design.name, thumbnail: files[0]?.url },
      sync_variants: kept.map((row) => ({
        id: row.id,
        retail_price: design.retailPrice.toFixed(2),
        files,
        ...(threadOptions.length > 0 ? { options: threadOptions } : {}),
      })),
    }),
  })
  const mockupTaskKey = await startPhotos()
  return {
    variants: design.variants,
    printfulSyncProductId: syncProductId,
    mockupTaskKey,
    requestedMockups: !reusePhotos,
    reusePhotos,
    mockupPhotoKey: photoKey,
    wholesaleCost: design.wholesaleCost ?? blank.estimatedCost,
    note: mockupTaskKey
      ? 'Printful is making a photo of this color.'
      : reusePhotos
        ? 'The printer has the new file. Photos for this color are already current.'
        : 'The printer has the new file. Printful could not start the photos.',
  }
}

export async function publishDesignToPrintful(
  design: MerchDesign,
  origin: string,
  printFilesByPlacement: PrintFileOverrides = {},
  options?: { previewOnly?: boolean },
): Promise<PublishResult> {
  const blank = getBlank(design.blankId)
  if (!blank) {
    return {
      variants: [],
      printfulSyncProductId: null,
      mockupTaskKey: null,
      requestedMockups: false,
      wholesaleCost: null,
      note: 'Unknown garment.',
    }
  }
  if (!process.env.PRINTFUL_API_KEY) {
    return {
      variants: [],
      printfulSyncProductId: null,
      mockupTaskKey: null,
      requestedMockups: false,
      wholesaleCost: blank.estimatedCost,
      note: 'Design saved. Add PRINTFUL_API_KEY to send it to the printer.',
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
      requestedMockups: false,
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
      requestedMockups: false,
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
      requestedMockups: false,
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
  const optionIds = (resolved.product.options || []).map((option) => option.id || '').filter(Boolean)
  const fullColorFileTypes = (resolved.product.files || [])
    .filter((file) => (file.options || []).some((option) => option.id === 'full_color'))
    .map((file) => file.type || '')
    .filter(Boolean)
  const threadOptions = embroideryVariantOptions(
    readyFiles.map((file) => file.type),
    design,
    optionIds,
    fullColorFileTypes,
  )
  const fullColorTypes = new Set(fullColorFileTypes)
  const syncFiles = readyFiles.map((file) => {
    const unlimited = Boolean(design.embroideryUnlimitedColor) && fullColorTypes.has(file.type)
    return {
      ...file,
      url: freshPrintfulUrl(file.url),
      options: unlimited ? [{ id: 'full_color', value: true as const }] : undefined,
    }
  })
  const variantId =
    previewVariantId(resolved.variants, design.sizes[0] || null, design.previewColorName) ?? chosen[0].id
  const photoKey = mockupPhotoKey({
    catalogProductId: resolved.product.id,
    colorName: design.previewColorName,
    files: syncFiles,
    placements: design.placements,
    unlimited: design.embroideryUnlimitedColor,
    threads: design.embroideryThreads,
  })
  const reusePhotos = photosMatchKey(design, photoKey)
  const startPhotos = () =>
    reusePhotos ? Promise.resolve(null) : startMockupTask(resolved.product.id, [variantId], syncFiles, threadOptions)
  if (design.printfulSyncProductId) {
    return refreshPrintedDesign(
      design,
      blank,
      resolved.product.id,
      syncFiles,
      threadOptions,
      startPhotos,
      reusePhotos,
      photoKey,
    )
  }
  if (options?.previewOnly) {
    const mockupTaskKey = await startPhotos()
    return {
      variants: design.variants,
      printfulSyncProductId: null,
      mockupTaskKey,
      requestedMockups: !reusePhotos,
      reusePhotos,
      mockupPhotoKey: photoKey,
      wholesaleCost:
        chosen.map((variant) => Number(variant.price)).filter((price) => Number.isFinite(price) && price > 0).sort((a, b) => a - b)[0] ??
        blank.estimatedCost,
      note: mockupTaskKey
        ? 'Printful is making a photo of this color.'
        : reusePhotos
          ? 'Photos for this color are already current.'
          : 'Design saved. Printful could not start the photos.',
    }
  }
  const created = await printfulFetch('/store/products', {
    method: 'POST',
    body: JSON.stringify({
      sync_product: { name: design.name, thumbnail: syncFiles[0]?.url },
      sync_variants: chosen.map((variant) => ({
        variant_id: variant.id,
        retail_price: design.retailPrice.toFixed(2),
        files: syncFiles,
        ...(threadOptions.length > 0 ? { options: threadOptions } : {}),
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

  const mockupTaskKey = await startPhotos()

  return {
    variants,
    printfulSyncProductId: created.result?.sync_product?.id
      ? String(created.result.sync_product.id)
      : null,
    mockupTaskKey,
    requestedMockups: !reusePhotos,
    reusePhotos,
    mockupPhotoKey: photoKey,
    wholesaleCost,
    note: mockupTaskKey
      ? 'Hidden in the shop. Printful is making a photo of this color.'
      : reusePhotos
        ? 'Hidden in the shop. Photos for this color are already current.'
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
