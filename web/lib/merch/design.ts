import { getBlank, type BlankPlacement, type GarmentFamily, type PlacementId } from '@/lib/merch/blanks'

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
  retailPrice: number
  wholesaleCost: number | null
  status: DesignStatus
  printfulSyncProductId: string | null
  mockupTaskKey: string | null
  mockupUrls: string[]
  variants: DesignVariant[]
  publishNote: string | null
  createdAt: string
  updatedAt: string
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
  const slop = 0.004
  return box.x < -slop || box.y < -slop || box.x + box.w > 1 + slop || box.y + box.h > 1 + slop
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
  | 'mockupUrls'
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
  const blank = getBlank(design.blankId)
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
  const images = design.mockupUrls.filter(Boolean)
  const thumbnail = images[0] || ''
  const ready = variants.some((variant) => variant.printful_variant_id > 0)

  return {
    id: design.id,
    name: design.name,
    slug: design.slug,
    thumbnail,
    images,
    designPreview: {
      id: design.id,
      blankId: design.blankId,
      catalogProductId: design.catalogProductId,
      family: design.family,
      previewColor: design.previewColor,
      colors: design.colors,
      sizes: design.sizes,
      placements: design.placements,
      mockupUrls: design.mockupUrls,
    },
    category: blank?.category || 'tees',
    previewHex: design.previewColor || null,
    fulfillmentReady: ready,
    variants,
    status: 'active',
    source: 'design',
  }
}
