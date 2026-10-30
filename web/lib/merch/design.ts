import { getBlank, type BlankPlacement, type GarmentFamily, type PlacementId } from '@/lib/merch/blanks'
import { frontPhotoIndex, mockupPhotosForColor, mockupTitlesForColor } from '@/lib/merch/catalog-studio'
import { isShopCategory, type ShopCategoryId } from '@/lib/merch/shop-categories'

export type DpiGrade = 'good' | 'fair' | 'low'
export type DesignStatus = 'draft' | 'hidden' | 'live'

export type ArtPlacement = {
  placement: PlacementId
  /** Printful print-file type (front, back, sleeve_left, label_inside…). Set when the art targets a catalog product. */
  fileType?: string
  assetUrl: string
  assetWidth: number
  assetHeight: number
  /** Left edge of the art, fraction of the print area. */
  x: number
  /** Top edge of the art, fraction of the print area. */
  y: number
  /** Art width as a fraction of the print-area width. */
  scale: number
  rotation: number
}

export type DesignVariant = {
  catalogVariantId: number
  syncVariantId: number
  size: string
  color: string
  retailPrice: number
}

export type MerchDesign = {
  id: string
  name: string
  slug: string
  blankId: string
  /** When set, publish resolves this Printful catalog product instead of the blank hint alone. */
  catalogProductId?: number | null
  family: GarmentFamily
  placements: ArtPlacement[]
  /** Print-file tab that was selected when this design was last saved. */
  activeFileType?: string | null
  colors: string[]
  sizes: string[]
  previewColor: string
  /** Catalog color name the preview hex was chosen as. Two-tone colors share a hex. */
  previewColorName?: string | null
  retailPrice: number
  wholesaleCost: number | null
  status: DesignStatus
  printfulSyncProductId: string | null
  mockupTaskKey: string | null
  mockupUrls: string[]
  /** Printful angle photos keyed by catalog color name. */
  mockupUrlsByColor?: Record<string, string[]>
  /** Angle names in the same order as `mockupUrlsByColor`, such as Front or Back. */
  mockupAngleTitlesByColor?: Record<string, string[]>
  /** Photos still downloading. The stage keeps the previous set until these are stored. */
  mockupPendingByColor?: Record<string, string[]>
  mockupPendingTitlesByColor?: Record<string, string[]>
  /** Fingerprint of the stitch, placement, and threads the pending photos were made from. */
  mockupPendingKey?: string | null
  /** Fingerprint of the photos already stored for each color. */
  mockupPhotoKeysByColor?: Record<string, string>
  /** Library ids from the previous photo set, removed after the new set is stored. */
  mockupRetiredArtIds?: string[]
  /** Baked print-file URLs keyed by placement. Reused so Put it out does not store a new copy. */
  printFileUrls?: Record<string, string>
  variants: DesignVariant[]
  publishNote: string | null
  /** Manual order in My Products and on the public shop. Lower numbers come first. */
  sortIndex?: number | null
  /** Shop chip this product sits under. Falls back to the garment's category. */
  shopCategory?: ShopCategoryId | null
  /** Unlimited-color embroidery instead of a stock thread. */
  embroideryUnlimitedColor?: boolean
  /** Stock thread hexes keyed by Printful option id (`thread_colors_front_large`). */
  embroideryThreads?: Record<string, string[]>
  createdAt: string
  updatedAt: string
}

export function compareMerchDesignOrder(a: MerchDesign, b: MerchDesign): number {
  const ai = typeof a.sortIndex === 'number' ? a.sortIndex : Number.MAX_SAFE_INTEGER
  const bi = typeof b.sortIndex === 'number' ? b.sortIndex : Number.MAX_SAFE_INTEGER
  if (ai !== bi) return ai - bi
  return b.updatedAt.localeCompare(a.updatedAt)
}

export function sortMerchDesigns(designs: MerchDesign[]): MerchDesign[] {
  return [...designs].sort(compareMerchDesignOrder)
}

export function shopCategoryOf(design: Pick<MerchDesign, 'shopCategory' | 'blankId'>): ShopCategoryId {
  if (isShopCategory(design.shopCategory)) return design.shopCategory
  const blank = getBlank(design.blankId)
  if (blank && isShopCategory(blank.category)) return blank.category
  return 'tees'
}

const PRINT_DPI = 150

export function suggestRetail(cost: number): number {
  if (!Number.isFinite(cost) || cost <= 0) return 36
  return Math.ceil(Math.max(cost * 2.2, cost + 12))
}

/** Retail minus wholesale minus a 2.9% + $0.30 card fee. */
export function youKeep(retail: number, cost: number): number {
  const fee = retail * 0.029 + 0.3
  return Math.round((retail - cost - fee) * 100) / 100
}

/** Art height as a fraction of the print-area height (matches the fitting-room stage). */
export function artHeightInPrintArea(placement: ArtPlacement, area: BlankPlacement): number {
  if (area.printWidth <= 0 || placement.assetWidth <= 0) return placement.scale
  return (
    (placement.scale * area.printWidth * (placement.assetHeight / placement.assetWidth)) / area.printHeight
  )
}

export function placementPixelSize(placement: ArtPlacement, area: BlankPlacement): {
  width: number
  height: number
} {
  const width = placement.scale * area.printWidth
  const height =
    placement.assetWidth > 0 ? width * (placement.assetHeight / placement.assetWidth) : width
  return { width, height }
}

export function effectiveDpi(placement: ArtPlacement, area: BlankPlacement): number {
  const shownInches = (placement.scale * area.printWidth) / PRINT_DPI
  if (shownInches <= 0) return 0
  return placement.assetWidth / shownInches
}

/** Key used for per-placement print files sent to Printful. */
export function placementKey(placement: Pick<ArtPlacement, 'placement' | 'fileType'>): string {
  return placement.fileType || placement.placement
}

/**
 * A chest, sleeve, label, or small mark. It should not become the product
 * preview when another side carries the actual print.
 */
function isAccentPlacement(row: ArtPlacement): boolean {
  const type = (row.fileType || '').toLowerCase()
  if (/sleeve|chest|label|pocket/.test(type)) return true
  return row.scale < 0.45
}

/**
 * Art the product card and the stage should open on. The file last open on
 * the stage wins, unless it is only a small mark and another side has the print.
 */
function previewPlacementRank(row: ArtPlacement): number {
  const type = (row.fileType || '').toLowerCase()
  if (type === 'front' || type === 'default' || type === 'front_dtf' || type === 'front_large' || type === 'front_large_dtf') {
    return 0
  }
  if (row.placement === 'front' && !/sleeve|chest|label|pocket/.test(type)) return 1
  if (/sleeve|chest|label|pocket/.test(type)) return 3
  if (row.placement === 'back') return 2
  return 4
}

export function previewArtPlacement(
  placements: ArtPlacement[],
  activeFileType?: string | null,
): ArtPlacement | undefined {
  const withArt = placements.filter((row) => row.assetUrl)
  const ranked = [...withArt].sort(
    (a, b) => previewPlacementRank(a) - previewPlacementRank(b) || b.scale - a.scale,
  )
  if (activeFileType) {
    const active = withArt.find((row) => row.fileType === activeFileType)
    if (active && !isAccentPlacement(active)) return active
    const full = ranked.find((row) => !isAccentPlacement(row))
    if (full) return full
    if (active) return active
  }
  return ranked[0]
}

/** Validate placements posted from the fitting room. Keeps the Printful file type so sleeves and labels survive save + publish. */
export function normalizePlacements(value: unknown): ArtPlacement[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value
    .map((item) => {
      const row = item as Partial<ArtPlacement>
      if (row.placement !== 'front' && row.placement !== 'back') return null
      if (!row.assetUrl || typeof row.assetUrl !== 'string') return null
      const fileType =
        typeof row.fileType === 'string' && /^[a-z0-9_]{1,64}$/i.test(row.fileType) ? row.fileType : undefined
      const placement: ArtPlacement = {
        placement: row.placement,
        assetUrl: row.assetUrl,
        assetWidth: Number(row.assetWidth) || 0,
        assetHeight: Number(row.assetHeight) || 0,
        x: Number(row.x) || 0,
        y: Number(row.y) || 0,
        scale: Number(row.scale) || 0.6,
        rotation: Number(row.rotation) || 0,
      }
      if (fileType) placement.fileType = fileType
      const key = placementKey(placement)
      if (seen.has(key)) return null
      seen.add(key)
      return placement
    })
    .filter((row): row is ArtPlacement => Boolean(row))
}

export function dpiGrade(dpi: number): DpiGrade {
  if (dpi >= 150) return 'good'
  if (dpi >= 100) return 'fair'
  return 'low'
}

export function dpiGradeRingClass(grade: DpiGrade): string {
  if (grade === 'good') return 'ring-2 ring-sky-400/90'
  if (grade === 'fair') return 'ring-2 ring-amber-400/90'
  return 'ring-2 ring-red-400/90'
}

export function designPlacementIssues(
  entries: Array<{ label: string; art: ArtPlacement; area: BlankPlacement }>
): { outside: string[]; lowDpi: string[] } {
  const outside: string[] = []
  const lowDpi: string[] = []
  for (const { label, art, area } of entries) {
    if (artOutside(art, area)) outside.push(label)
    if (dpiGrade(effectiveDpi(art, area)) === 'low') lowDpi.push(label)
  }
  return { outside, lowDpi }
}

/** Axis-aligned box of the art inside the print area, in fractions. Rotation expands the box. */
export function artBox(placement: ArtPlacement, area: BlankPlacement): {
  x: number
  y: number
  w: number
  h: number
} {
  const width = placement.scale
  const height =
    area.printWidth > 0 && placement.assetWidth > 0
      ? (placement.scale * area.printWidth * (placement.assetHeight / placement.assetWidth)) /
        area.printHeight
      : placement.scale
  const rad = (placement.rotation * Math.PI) / 180
  const cos = Math.abs(Math.cos(rad))
  const sin = Math.abs(Math.sin(rad))
  const w = width * cos + height * sin
  const h = width * sin + height * cos
  const cx = placement.x + width / 2
  const cy = placement.y + height / 2
  return { x: cx - w / 2, y: cy - h / 2, w, h }
}

export function artOutside(placement: ArtPlacement, area: BlankPlacement): boolean {
  const box = artBox(placement, area)
  const inset = stitchInsets(area)
  const slop = 0.004
  return (
    box.x < inset.x - slop ||
    box.y < inset.y - slop ||
    box.x + box.w > 1 - inset.x + slop ||
    box.y + box.h > 1 - inset.y + slop
  )
}

export function isEmbroideryFileType(fileType: string | undefined | null): boolean {
  return /embroidery/i.test(fileType || '')
}

/**
 * Embroidery machines drop stitches that sit on the edge of the print file.
 * 0.3″ at the file's DPI matches the margin Printful removed from a full-bleed
 * snapback logo (the returned preview stopped about 90px inside a 675px file).
 */
export const EMBROIDERY_SAFE_INCHES = 0.3

/** Insets, as fractions of the print file, that embroidery will actually keep. */
export function stitchInsets(area: BlankPlacement): { x: number; y: number } {
  if (!isEmbroideryFileType(area.printfulType) || area.printWidth <= 0 || area.printHeight <= 0) {
    return { x: 0, y: 0 }
  }
  const dpi = area.dpi && area.dpi > 0 ? area.dpi : 300
  const marginPx = EMBROIDERY_SAFE_INCHES * dpi
  return {
    x: Math.min(0.22, marginPx / area.printWidth),
    y: Math.min(0.22, marginPx / area.printHeight),
  }
}

/**
 * Shrink and shift art so it stays inside the area Printful will keep.
 * Embroidery uses the stitch margin. Print, DTF, and the rest use the print-file edge.
 */
export function containPlacement<T extends ArtPlacement>(placement: T, area: BlankPlacement): T {
  const inset = stitchInsets(area)
  const box = artBox(placement, area)
  if (!(box.w > 0) || !(box.h > 0)) return placement
  const minX = inset.x
  const minY = inset.y
  const maxX = 1 - inset.x
  const maxY = 1 - inset.y
  const availW = maxX - minX
  const availH = maxY - minY
  if (availW <= 0 || availH <= 0) return placement
  let scale = placement.scale
  let x = placement.x
  let y = placement.y
  const fit = Math.min(1, availW / box.w, availH / box.h)
  if (fit < 0.999) {
    const cx = box.x + box.w / 2
    const cy = box.y + box.h / 2
    const nextW = box.w * fit
    const nextH = box.h * fit
    scale = placement.scale * fit
    x = cx - nextW / 2
    y = cy - nextH / 2
  }
  const shifted = artBox({ ...placement, x, y, scale }, area)
  if (shifted.x < minX) x += minX - shifted.x
  if (shifted.y < minY) y += minY - shifted.y
  const parked = artBox({ ...placement, x, y, scale }, area)
  if (parked.x + parked.w > maxX) x -= parked.x + parked.w - maxX
  if (parked.y + parked.h > maxY) y -= parked.y + parked.h - maxY
  return { ...placement, x, y, scale }
}

/** Largest width fraction that still sits inside the stitch margin, including rotation. */
export function maxScaleInMitigation(
  placement: Pick<ArtPlacement, 'assetWidth' | 'assetHeight' | 'rotation'>,
  area: BlankPlacement,
): number {
  const inset = stitchInsets(area)
  const contained = containPlacement(
    {
      placement: 'front',
      assetUrl: '',
      assetWidth: placement.assetWidth,
      assetHeight: placement.assetHeight,
      x: inset.x,
      y: inset.y,
      scale: 1,
      rotation: placement.rotation,
    },
    area,
  )
  return contained.scale
}

/** Place new art inside the area Printful will keep, with a little room inside that box. */
export function fitPlacement(
  assetWidth: number,
  assetHeight: number,
  area: BlankPlacement,
): Pick<ArtPlacement, 'x' | 'y' | 'scale' | 'rotation'> {
  const inset = stitchInsets(area)
  const availW = Math.max(0, 1 - inset.x * 2)
  const availH = Math.max(0, 1 - inset.y * 2)
  const imgAspect = assetWidth > 0 ? assetHeight / assetWidth : 1
  const areaAspect = area.printWidth > 0 ? area.printHeight / area.printWidth : 1
  let scale = 0.86 * (availW > 0 ? availW : 1)
  const heightAtScale = areaAspect > 0 ? (scale * imgAspect) / areaAspect : scale
  const maxH = 0.86 * (availH > 0 ? availH : 1)
  if (heightAtScale > maxH && imgAspect > 0) scale = (maxH * areaAspect) / imgAspect
  scale = Math.min(availW > 0 ? availW : 1, Math.max(0.15, scale))
  const height = areaAspect > 0 ? (scale * imgAspect) / areaAspect : scale
  const fitted = containPlacement(
    {
      placement: 'front',
      assetUrl: '',
      assetWidth,
      assetHeight,
      scale,
      x: inset.x + ((availW > 0 ? availW : 1) - scale) / 2,
      y: inset.y + Math.max(0, ((availH > 0 ? availH : 1) - height) / 2),
      rotation: 0,
    },
    area,
  )
  return { x: fitted.x, y: fitted.y, scale: fitted.scale, rotation: fitted.rotation }
}

/**
 * Largest scale that still prints one source pixel per print-file pixel.
 * Larger than this stretches the file and drops it under the 150 DPI line.
 */
export function nativePrintScale(assetWidth: number, area: Pick<BlankPlacement, 'printWidth'>): number {
  if (!(assetWidth > 0) || !(area.printWidth > 0)) return Number.POSITIVE_INFINITY
  return assetWidth / area.printWidth
}

/**
 * Center the art in the area Printful will keep, at the current rotation.
 * The size is the stitch box or the print-file edge, and never larger than the file's own pixels.
 */
export function optimizePlacementForPrint<T extends ArtPlacement>(placement: T, area: BlankPlacement): T {
  const maxSafe = maxScaleInMitigation(placement, area)
  const native = nativePrintScale(placement.assetWidth, area)
  const scale = Math.min(maxSafe, native)
  if (!(scale > 0)) return containPlacement(placement, area)
  const imgAspect = placement.assetWidth > 0 ? placement.assetHeight / placement.assetWidth : 1
  const areaAspect = area.printWidth > 0 ? area.printHeight / area.printWidth : 1
  const height = areaAspect > 0 ? (scale * imgAspect) / areaAspect : scale
  return containPlacement(
    {
      ...placement,
      scale,
      x: 0.5 - scale / 2,
      y: 0.5 - height / 2,
    },
    area,
  )
}

export type MitigationGuideline = {
  id: 'design' | 'preview' | 'print-file' | 'stitch' | 'print-edge'
  label: string
  detail: string
}

/** Inches at this DPI, kept exact to two decimals so 2.25″ does not become 2.3″. */
function inchesExact(pixels: number, dpi: number): string {
  const rounded = Math.round((pixels / dpi) * 100) / 100
  if (Number.isInteger(rounded)) return `${rounded.toFixed(0)}″`
  const tenth = Math.round(rounded * 10) / 10
  if (Math.abs(rounded - tenth) < 0.001) return `${rounded.toFixed(1)}″`
  return `${rounded.toFixed(2)}″`
}

/**
 * The words the product-design panel uses for this placement.
 * Design, the baked PNG, and the Printful photo are three different pictures.
 * These lines name each one with the print-file size the editor and bake share.
 */
export function mitigationGuidelines(area: {
  printfulType?: string | null
  label?: string | null
  printWidth: number
  printHeight: number
  dpi?: number | null
}): MitigationGuideline[] {
  const name = area.label?.trim() || 'This placement'
  const embroidery = isEmbroideryFileType(area.printfulType)
  const lines: MitigationGuideline[] = [
    {
      id: 'design',
      label: 'Design',
      detail: embroidery
        ? "Design shows this print file on Printful's garment template. The bright dashed box is the stitch area. The dim band around it is not stitched. Drag, scale, fit, and copy stay inside the bright box."
        : "Design shows this print file on Printful's garment template. The bright dashed box is the print area. Drag, scale, fit, and copy stay inside it.",
    },
    {
      id: 'preview',
      label: 'Preview',
      detail:
        'Preview shows the last photo Printful stored for the color that photo was made in. Another color draws that garment with this design. A new photo appears only after Put it out stores one. If that photo cuts the art while Design shows it inside the dashed box, put the design out again.',
    },
  ]
  const width = area.printWidth
  const height = area.printHeight
  const dpi = area.dpi && area.dpi > 0 ? area.dpi : embroidery ? 300 : 0
  if (!(width > 0) || !(height > 0) || !(dpi > 0)) {
    lines.push({
      id: 'print-file',
      label: 'Print file',
      detail: `${name} gets its pixel size from the Printful catalog. Put it out bakes that size. The size appears here once the catalog file has loaded.`,
    })
    return lines
  }
  lines.push({
    id: 'print-file',
    label: 'Print file',
    detail: `Put it out bakes ${name} as a ${width}×${height} px PNG at ${dpi} DPI (${inchesExact(width, dpi)} × ${inchesExact(height, dpi)}). Printful receives that file.`,
  })
  if (!embroidery) {
    lines.push({
      id: 'print-edge',
      label: 'Print area',
      detail:
        'Printful prints to the file edge. Drag, scale, fit, copy, and the bake keep art inside that edge. The faint inner line is a 0.25″ guide and does not move the art.',
    })
    return lines
  }
  const inset = stitchInsets({
    id: 'front',
    label: name,
    printfulType: area.printfulType || '',
    stage: { x: 0, y: 0, w: 1, h: 1 },
    printWidth: width,
    printHeight: height,
    dpi,
  })
  const safeW = Math.round(width * (1 - inset.x * 2))
  const safeH = Math.round(height * (1 - inset.y * 2))
  lines.push({
    id: 'stitch',
    label: 'Stitch margin',
    detail: `Embroidery drops stitches within ${EMBROIDERY_SAFE_INCHES}″ of each edge. Design, drag, scale, fit, copy, and the bake keep art inside ${inchesExact(safeW, dpi)} × ${inchesExact(safeH, dpi)} (${safeW}×${safeH} px). The bright dashed box is that stitch area.`,
  })
  return lines
}

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return 0.6
  return Math.min(1, Math.max(0.15, scale))
}

/** Resize from the corner while the artwork's center stays put. */
export function scalePlacementAboutCenter(
  placement: Pick<ArtPlacement, 'x' | 'y' | 'scale'>,
  heightFraction: number,
  nextScale: number,
): { x: number; y: number; scale: number } {
  const scale = clampScale(nextScale)
  const startScale = placement.scale > 0 ? placement.scale : scale
  const centerX = placement.x + placement.scale / 2
  const centerY = placement.y + heightFraction / 2
  const nextHeight = scale * (heightFraction / startScale)
  return { scale, x: centerX - scale / 2, y: centerY - nextHeight / 2 }
}

export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'merch'
}

export function isPublicFulfillmentUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
    const host = parsed.hostname.toLowerCase()
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return false
    if (host.endsWith('.local')) return false
    return true
  } catch {
    return false
  }
}

export function absoluteUrl(pathOrUrl: string, origin: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
  const base = origin.replace(/\/$/, '')
  return `${base}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`
}

export type MerchDesignPreviewPayload = Pick<
  MerchDesign,
  | 'id'
  | 'blankId'
  | 'catalogProductId'
  | 'family'
  | 'previewColor'
  | 'colors'
  | 'sizes'
  | 'placements'
  | 'activeFileType'
  | 'mockupUrls'
  | 'mockupUrlsByColor'
  | 'mockupAngleTitlesByColor'
  | 'previewColorName'
  | 'printFileUrls'
  | 'embroideryUnlimitedColor'
  | 'embroideryThreads'
>

export type ShopMerchProduct = {
  id: string
  name: string
  slug: string
  thumbnail: string
  images: string[]
  category: string
  previewHex: string | null
  designPreview?: MerchDesignPreviewPayload
  fulfillmentReady: boolean
  variants: Array<{
    id: number
    name: string
    printful_variant_id: number
    retail_price: number
    size: string | null
    color: string | null
    in_stock: boolean
  }>
  status: 'active'
  source: 'design' | 'printful'
}

export function designToShopProduct(design: MerchDesign): ShopMerchProduct | null {
  if (design.status !== 'live') return null
  const variants =
    design.variants.length > 0
      ? design.variants.map((variant, index) => ({
          id: variant.syncVariantId || index + 1,
          name: [variant.color, variant.size].filter(Boolean).join(' / '),
          printful_variant_id: variant.syncVariantId,
          retail_price: variant.retailPrice || design.retailPrice,
          size: variant.size || null,
          color: variant.color || null,
          in_stock: variant.syncVariantId > 0,
        }))
      : design.colors.flatMap((color, colorIndex) =>
          design.sizes.map((size, sizeIndex) => ({
            id: colorIndex * 100 + sizeIndex + 1,
            name: `${color} / ${size}`,
            printful_variant_id: 0,
            retail_price: design.retailPrice,
            size,
            color,
            in_stock: false,
          }))
        )

  if (variants.length === 0) return null
  const images = mockupPhotosForColor(
    design.mockupUrls,
    design.mockupUrlsByColor,
    design.previewColorName,
    design.previewColorName,
  )
  const listed = images.length > 0 ? images : design.mockupUrls.filter(Boolean)
  const titles = mockupTitlesForColor(
    design.mockupAngleTitlesByColor,
    design.previewColorName,
    design.previewColorName,
  )
  const thumbnail = listed[frontPhotoIndex(listed.length, titles)] || ''
  const ready = variants.some((variant) => variant.printful_variant_id > 0)

  return {
    id: design.id,
    name: design.name,
    slug: design.slug,
    thumbnail,
    images: listed,
    designPreview: {
      id: design.id,
      blankId: design.blankId,
      catalogProductId: design.catalogProductId,
      family: design.family,
      previewColor: design.previewColor,
      colors: design.colors,
      sizes: design.sizes,
      placements: design.placements,
      activeFileType: design.activeFileType,
      mockupUrls: design.mockupUrls,
      mockupUrlsByColor: design.mockupUrlsByColor,
      mockupAngleTitlesByColor: design.mockupAngleTitlesByColor,
      previewColorName: design.previewColorName,
      printFileUrls: design.printFileUrls,
      embroideryUnlimitedColor: design.embroideryUnlimitedColor,
      embroideryThreads: design.embroideryThreads,
    },
    category: shopCategoryOf(design),
    previewHex: design.previewColor || null,
    fulfillmentReady: ready,
    variants,
    status: 'active',
    source: 'design',
  }
}
