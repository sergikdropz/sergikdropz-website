import type { BlankPlacement, MerchBlank, PlacementId } from '@/lib/merch/blanks'
import type {
  CatalogPrintFile,
  CatalogProductDetail,
  CatalogVariantRow,
} from '@/lib/merch/printful-catalog-types'

const NON_PRINT_FILE = new Set(['mockup', 'preview'])

export function pickPreviewVariant(
  variants: CatalogVariantRow[],
  colorName: string | null,
  size: string | null
): CatalogVariantRow | null {
  if (variants.length === 0) return null
  const color = (colorName || '').trim().toLowerCase()
  const sizeNorm = (size || '').trim().toLowerCase()
  if (color && sizeNorm) {
    const exact = variants.find(
      (row) => row.color?.toLowerCase() === color && row.size?.toLowerCase() === sizeNorm
    )
    if (exact) return exact
  }
  if (color) {
    const byColor = variants.find((row) => row.color?.toLowerCase() === color)
    if (byColor) return byColor
  }
  if (sizeNorm) {
    const bySize = variants.find((row) => row.size?.toLowerCase() === sizeNorm)
    if (bySize) return bySize
  }
  return variants.find((row) => row.in_stock !== false) || variants[0]
}

/** Color the stage is showing. Saved preview hex wins over the first sell color. */
export function designPreviewColorName(
  colors: { name: string; hex: string }[],
  previewColor: string | null | undefined,
  fallbackNames: string[] = [],
): string {
  const hex = previewColor?.trim().toLowerCase()
  if (hex) {
    const match = colors.find((color) => color.hex.trim().toLowerCase() === hex)
    if (match?.name) return match.name
  }
  return fallbackNames.find((name) => name.trim()) || 'Black'
}

export function sameColorKey(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase()
}

/** A Printful photo title such as "Right" lines up with the template for that side. */
export function angleMatchesFile(title: string, file: { title?: string | null; type?: string | null }): boolean {
  const shot = title.trim().toLowerCase()
  const name = `${file.title || ''} ${file.type || ''}`.toLowerCase()
  if (!shot || !name.trim()) return false
  if (shot.includes('back')) return name.includes('back')
  if (shot.includes('left')) return name.includes('left')
  if (shot.includes('right')) return name.includes('right')
  if (shot.includes('front')) return name.includes('front') && !name.includes('back')
  return false
}

/**
 * Put template views in the same order as the photographed angles.
 * An angle with no template is left out. With no matches, the original list stays.
 */
export function orderPrintFilesByAngles<T extends { title?: string | null; type?: string | null }>(
  files: T[],
  titles: string[],
): T[] {
  if (titles.length === 0 || files.length === 0) return files
  const used = new Set<T>()
  const ordered: T[] = []
  for (const title of titles) {
    const match = files.find((file) => !used.has(file) && angleMatchesFile(title, file))
    if (!match) continue
    used.add(match)
    ordered.push(match)
  }
  return ordered.length > 0 ? ordered : files
}

/** Angle photos for one color. A single saved set stays on the color it was made in. */
export function mockupPhotosForColor(
  mockupUrls: string[] | null | undefined,
  mockupUrlsByColor: Record<string, string[]> | null | undefined,
  colorName: string | null | undefined,
  savedColorName: string | null | undefined,
): string[] {
  const wanted = (colorName || '').trim()
  if (wanted && mockupUrlsByColor) {
    const match = Object.entries(mockupUrlsByColor).find(([name]) => sameColorKey(name, wanted))
    const urls = (match?.[1] || []).filter(Boolean)
    if (urls.length > 0) return urls
  }
  const legacy = (mockupUrls || []).filter(Boolean)
  if (legacy.length === 0) return []
  if (!wanted || !savedColorName || sameColorKey(wanted, savedColorName)) return legacy
  return []
}

/** Angle names for one color, in the same order as `mockupPhotosForColor`. */
export function mockupTitlesForColor(
  mockupAngleTitlesByColor: Record<string, string[]> | null | undefined,
  colorName: string | null | undefined,
  savedColorName: string | null | undefined,
): string[] {
  if (!mockupAngleTitlesByColor) return []
  const wanted = (colorName || '').trim()
  const saved = (savedColorName || '').trim()
  const pick = (name: string) =>
    Object.entries(mockupAngleTitlesByColor)
      .find(([key]) => sameColorKey(key, name))?.[1]
      ?.filter(Boolean) || []
  if (wanted) {
    const titles = pick(wanted)
    if (titles.length > 0) return titles
    if (saved && !sameColorKey(wanted, saved)) return []
  }
  return saved ? pick(saved) : []
}

/**
 * Printful stores the straight-on Front after Back and the side angles.
 * Shop cards and the opened product start on Front.
 */
export function frontMockupIndex(titles: string[] | null | undefined): number {
  if (!titles?.length) return 0
  const names = titles.map((title) => title.trim().toLowerCase())
  const exact = names.findIndex((title) => title === 'front')
  if (exact >= 0) return exact
  const loose = names.findIndex(
    (title) =>
      title.includes('front') && !title.includes('back') && !title.includes('left') && !title.includes('right'),
  )
  return loose >= 0 ? loose : 0
}

export function frontPhotoIndex(photoCount: number, titles: string[] | null | undefined): number {
  if (photoCount <= 0) return 0
  return Math.min(frontMockupIndex(titles), photoCount - 1)
}

export function shopFrontPhotoIndex(
  design: {
    mockupUrls?: string[] | null
    mockupUrlsByColor?: Record<string, string[]> | null
    mockupAngleTitlesByColor?: Record<string, string[]> | null
    previewColorName?: string | null
  },
  colorName?: string | null,
): number {
  const saved = design.previewColorName
  const requested = colorName || saved
  const photos = mockupPhotosForColor(design.mockupUrls, design.mockupUrlsByColor, requested, saved)
  const titles = mockupTitlesForColor(design.mockupAngleTitlesByColor, requested, saved)
  return frontPhotoIndex(photos.length, titles)
}

/**
 * A put-out photo is one garment color. Keep it until the catalog can name that
 * color, then switch to the live color preview when the shopper picks another.
 */
export function previewUsesMockupPhoto(
  mockupUrl: string | null | undefined,
  savedColorName: string,
  requestedColorName: string | null | undefined,
  catalogReady: boolean,
): boolean {
  if (!mockupUrl) return false
  const requested = (requestedColorName || '').trim()
  if (!requested) return true
  if (!catalogReady) return true
  return sameColorKey(requested, savedColorName)
}

/**
 * Where an `object-contain` image sits inside a frame, as fractions of the frame.
 * Art that was measured on the image has to use this box, or a portrait photo in a
 * square card shifts the print off the garment.
 */
export function containedImageBox(
  containerAspect: number,
  imageAspect: number,
): { x: number; y: number; w: number; h: number } {
  if (!(containerAspect > 0) || !(imageAspect > 0)) return { x: 0, y: 0, w: 1, h: 1 }
  if (imageAspect >= containerAspect) {
    const h = containerAspect / imageAspect
    return { x: 0, y: (1 - h) / 2, w: 1, h }
  }
  const w = imageAspect / containerAspect
  return { x: (1 - w) / 2, y: 0, w, h: 1 }
}

export function previewGarmentImage(
  detail: CatalogProductDetail | null,
  colorName: string | null,
  size: string | null
): string | null {
  if (!detail) return null
  const variant = pickPreviewVariant(detail.variants, colorName, size)
  if (variant?.image) return variant.image
  return detail.product.image
}

export type GarmentTemplate = {
  imageUrl: string
  /** Drawn behind a transparent Printful ghost template. Opaque photos hide it. */
  backgroundColor: string | null
}

/**
 * Printful's mockup for this color. Ghost templates are a shading PNG plus
 * `background_color`; full-color photos already include the garment.
 */
export function coloredTemplate(
  detail: CatalogProductDetail | null,
  file: CatalogPrintFile | undefined | null,
  colorName: string | null,
  size: string | null,
): GarmentTemplate | null {
  if (!file?.templateUrl) return null
  const variant = detail ? pickPreviewVariant(detail.variants, colorName, size) : null
  const specific = variant ? file.variantTemplates?.[String(variant.id)] : undefined
  if (specific?.imageUrl) return specific
  return { imageUrl: file.templateUrl, backgroundColor: null }
}

/** Shared Printful positioning sheet. The garment itself is a transparent hole. */
export function isPositioningTemplate(url: string | null | undefined): boolean {
  return Boolean(url && /positioning/i.test(url))
}

function frontColorPhotoRank(type: string): number {
  const name = type.toLowerCase()
  if (
    name === 'front' ||
    name === 'default' ||
    name === 'front_dtf' ||
    name === 'front_large' ||
    name === 'front_large_dtf'
  ) {
    return 0
  }
  if (name.includes('front') && !name.includes('back') && !name.includes('sleeve') && !name.includes('label')) {
    return 1
  }
  return 2
}

/** Opaque color photo for this variant. A sheet shared by every color is a ghost, not a photo. */
export function colorwayGarmentPhoto(
  detail: CatalogProductDetail | null,
  colorName: string | null,
  size: string | null,
): string | null {
  if (!detail) return null
  const variant = pickPreviewVariant(detail.variants, colorName, size)
  if (!variant) return null
  const files = [...detail.printFiles].sort((a, b) => frontColorPhotoRank(a.type) - frontColorPhotoRank(b.type))
  for (const file of files) {
    if (frontColorPhotoRank(file.type) > 1) continue
    const templates = file.variantTemplates || {}
    const url = templates[String(variant.id)]?.imageUrl
    if (!url || isPositioningTemplate(url)) continue
    const distinct = new Set(
      Object.values(templates)
        .map((row) => row?.imageUrl)
        .filter((row): row is string => Boolean(row)),
    )
    if (distinct.size > 1) return url
  }
  return null
}

/**
 * When the face is only a positioning hole, fill it with that color's front photo.
 * Solid garments keep their `background_color` instead.
 */
export function positioningPatternUrl(
  detail: CatalogProductDetail | null,
  templateUrl: string | null | undefined,
  colorName: string | null,
  size: string | null,
): string | null {
  if (!isPositioningTemplate(templateUrl)) return null
  const photo = colorwayGarmentPhoto(detail, colorName, size)
  if (!photo || photo === templateUrl) return null
  return photo
}

export function coloredTemplateUrl(
  detail: CatalogProductDetail | null,
  file: CatalogPrintFile | undefined | null,
  colorName: string | null,
  size: string | null,
): string | null {
  return coloredTemplate(detail, file, colorName, size)?.imageUrl ?? null
}

/** Prefer Printful positioning template when drop zone is template-calibrated. */
export function designGarmentImage(
  detail: CatalogProductDetail | null,
  activeFile: CatalogPrintFile | undefined,
  colorName: string | null,
  size: string | null
): string | null {
  if (activeFile?.templateUrl && activeFile.mockupStage) {
    return coloredTemplate(detail, activeFile, colorName, size)?.imageUrl ?? activeFile.templateUrl
  }
  return previewGarmentImage(detail, colorName, size)
}

export function isAllOverCatalogProduct(detail: CatalogProductDetail): boolean {
  const title = detail.product.title.toLowerCase()
  if (title.includes('all-over') || title.includes('all over')) return true
  return detail.fileTypes.some((type) => type.includes('all_over') || type === 'default')
}

function resolvePrintfulType(preferred: string, available: Set<string>): string {
  if (available.has(preferred)) return preferred
  if (preferred === 'front' && available.has('default')) return 'default'
  if (preferred === 'back' && available.has('back_dtf')) return 'back_dtf'
  return preferred
}

export function studioPlacementsForProduct(detail: CatalogProductDetail, template: MerchBlank): BlankPlacement[] {
  const printable = new Set(
    detail.fileTypes.filter((type) => type && !NON_PRINT_FILE.has(type))
  )

  if (isAllOverCatalogProduct(detail)) {
    const printfulType = printable.has('default')
      ? 'default'
      : [...printable][0] || 'default'
    return [
      {
        id: 'front',
        label: 'All-over',
        printfulType,
        stage: { x: 0.06, y: 0.1, w: 0.88, h: 0.8 },
        printWidth: 4500,
        printHeight: 5400,
      },
    ]
  }

  const mapped: BlankPlacement[] = []
  for (const placement of template.placements) {
    const canFront = placement.id === 'front' && (printable.has('front') || printable.has('default'))
    const canBack = placement.id === 'back' && (printable.has('back') || printable.has('back_dtf'))
    if (printable.has(placement.printfulType) || canFront || canBack) {
      mapped.push({
        ...placement,
        printfulType: resolvePrintfulType(placement.printfulType, printable),
      })
    }
  }

  if (mapped.length > 0) return mapped

  const fallbackType = [...printable][0] || 'default'
  return [
    {
      id: 'front' as PlacementId,
      label: 'Print',
      printfulType: fallbackType,
      stage: template.placements[0]?.stage || { x: 0.2, y: 0.2, w: 0.6, h: 0.5 },
      printWidth: template.placements[0]?.printWidth || 1800,
      printHeight: template.placements[0]?.printHeight || 2400,
    },
  ]
}

export function printfulProductUrl(productId: number): string {
  return `https://www.printful.com/custom?product=${productId}`
}

export { resolveBlankForCatalogProduct } from '@/lib/merch/catalog-product-meta'

function parseTechniqueKey(technique: string): string {
  return technique.trim().toUpperCase()
}

/**
 * Drop files Printful cannot place (no printfile, no template under any
 * technique) as long as a placeable file remains — otherwise keep everything
 * so the designer still has a surface.
 */
export function placeablePrintFiles(files: CatalogPrintFile[]): CatalogPrintFile[] {
  const supported = files.filter((file) => file.mockupSupported !== false)
  return supported.length > 0 ? supported : files
}

/** Technique that owns a saved print file, so opening a product shows that design. */
export function techniqueKeyForPrintFile(fileType: string | null | undefined): 'EMBROIDERY' | 'DTFILM' | 'DTG' | null {
  if (!fileType) return null
  const type = fileType.toLowerCase()
  if (type.includes('embroidery')) return 'EMBROIDERY'
  if (type.includes('dtf')) return 'DTFILM'
  if (
    type.includes('dtg') ||
    type === 'front' ||
    type === 'back' ||
    type.includes('default') ||
    type.includes('sleeve') ||
    type.includes('label')
  ) {
    return 'DTG'
  }
  return null
}

/** Product technique key for a saved file. Prefers the key this catalog actually lists. */
export function techniqueForSavedFile(
  techniques: Array<{ key: string; isDefault?: boolean }>,
  fileType: string | null | undefined,
): string | null {
  const wanted = techniqueKeyForPrintFile(fileType)
  if (!wanted) return null
  const upper = (key: string) => key.trim().toUpperCase()
  const exact = techniques.find((row) => upper(row.key) === wanted)
  if (exact) return exact.key
  if (wanted === 'DTFILM') {
    const dtf = techniques.find((row) => upper(row.key).includes('DTF'))
    if (dtf) return dtf.key
  }
  if (wanted === 'DTG') {
    const dtg = techniques.find((row) => /DTG|DIRECT/.test(upper(row.key)) && !upper(row.key).includes('DTF'))
    if (dtg) return dtg.key
  }
  if (wanted === 'EMBROIDERY') {
    const embroidery = techniques.find((row) => upper(row.key).includes('EMBROID'))
    if (embroidery) return embroidery.key
  }
  return techniques.find((row) => row.isDefault)?.key || techniques[0]?.key || wanted
}

/** Printful dashboard: technique tabs filter which placements appear. */
export function filterPrintFilesForTechnique(
  files: CatalogPrintFile[],
  technique: string
): CatalogPrintFile[] {
  if (files.length === 0) return []
  const key = parseTechniqueKey(technique)
  const matched = (() => {
    if (key === 'EMBROIDERY') {
      return files.filter((file) => file.type.toLowerCase().includes('embroidery'))
    }
    if (key === 'DTFILM' || key === 'DTG' || key === 'DIRECT_TO_GARMENT') {
      const printable = files.filter((file) => {
        const type = file.type.toLowerCase()
        if (type.includes('embroidery')) return false
        return (
          type.includes('dtf') ||
          type.includes('dtg') ||
          type.includes('front') ||
          type.includes('back') ||
          type.includes('sleeve') ||
          type.includes('label') ||
          type.includes('default')
        )
      })
      // Printful names DTF placements `*_dtf`; DTG uses the plain names. Keep each
      // technique to its own files so the designer never shows both sets at once.
      const dtf = printable.filter((file) => file.type.toLowerCase().includes('dtf'))
      const dtg = printable.filter((file) => !file.type.toLowerCase().includes('dtf'))
      if (key === 'DTFILM') return dtf.length > 0 ? dtf : printable
      return dtg.length > 0 ? dtg : printable
    }
    if (key === 'SUBLIMATION' || key === 'CUT_SEW') {
      return files.filter((file) => {
        const type = file.type.toLowerCase()
        return type.includes('default') || type.includes('all_over') || type.includes('sublimation')
      })
    }
    return files
  })()
  return placeablePrintFiles(matched)
}

function printDimensionsForFile(type: string, template: MerchBlank): { printWidth: number; printHeight: number } {
  const lower = type.toLowerCase()
  const base = template.placements[0] || {
    printWidth: 1800,
    printHeight: 2400,
  }
  if (lower.includes('embroidery') || lower.includes('hat') || lower.includes('cap')) {
    return { printWidth: 1200, printHeight: 675 }
  }
  if (lower.includes('large')) {
    return {
      printWidth: Math.round(base.printWidth * 1.15),
      printHeight: Math.round(base.printHeight * 1.15),
    }
  }
  return { printWidth: base.printWidth, printHeight: base.printHeight }
}

function stageForPrintFileType(type: string, template: MerchBlank): {
  id: PlacementId
  label: string
  stage: BlankPlacement['stage']
} {
  const lower = type.toLowerCase()
  const front = template.placements.find((item) => item.id === 'front') || template.placements[0]
  const back = template.placements.find((item) => item.id === 'back')
  if (lower.includes('back')) {
    return {
      id: 'back',
      label: 'Back',
      stage: back?.stage || front.stage,
    }
  }
  if (lower.includes('sleeve') && lower.includes('left')) {
    return {
      id: 'front',
      label: 'Left sleeve',
      stage: { x: 0.1, y: 0.34, w: 0.16, h: 0.14 },
    }
  }
  if (lower.includes('sleeve') && lower.includes('right')) {
    return {
      id: 'front',
      label: 'Right sleeve',
      stage: { x: 0.74, y: 0.34, w: 0.16, h: 0.14 },
    }
  }
  if (lower.includes('large')) {
    return {
      id: 'front',
      label: 'Front (large)',
      stage: {
        x: Math.max(0.06, front.stage.x - 0.04),
        y: Math.max(0.06, front.stage.y - 0.02),
        w: Math.min(0.92, front.stage.w + 0.08),
        h: Math.min(0.92, front.stage.h + 0.04),
      },
    }
  }
  return { id: 'front', label: front.label || 'Front', stage: front.stage }
}

/** True when the file can be placed on its Printful positioning template. */
export function hasTemplateStage(file: CatalogPrintFile | undefined | null): boolean {
  return Boolean(file?.templateUrl && file.mockupStage)
}

export function placementForPrintFile(
  file: CatalogPrintFile,
  template: MerchBlank,
  options: {
    /**
     * `template` (default): drop zone from the Printful template image.
     * `photo`: drop zone from the studio blank, for faces drawn with a variant photo.
     */
    surface?: 'template' | 'photo'
  } = {}
): BlankPlacement {
  const mapped = stageForPrintFileType(file.type, template)
  const dims =
    file.printWidth && file.printHeight
      ? { printWidth: file.printWidth, printHeight: file.printHeight }
      : printDimensionsForFile(file.type, template)
  const stage = options.surface === 'photo' ? mapped.stage : file.mockupStage || mapped.stage
  return {
    id: mapped.id,
    label: file.title || mapped.label,
    printfulType: file.type,
    stage,
    printWidth: dims.printWidth,
    printHeight: dims.printHeight,
    dpi: file.dpi ?? null,
  }
}

export function fileGuidelineLines(area: BlankPlacement): string[] {
  const dpi = area.dpi && area.dpi > 0 ? area.dpi : /embroidery/i.test(area.printfulType) ? 300 : 150
  const widthIn = (area.printWidth / dpi).toFixed(2)
  const heightIn = (area.printHeight / dpi).toFixed(2)
  return [
    `${area.printWidth} × ${area.printHeight} px (${widthIn}″ × ${heightIn}″ at ${dpi} DPI)`,
    'PNG or JPEG with transparent background when possible.',
    `Printful file type: ${area.printfulType}`,
  ]
}

/** Primary print surface for a side (plain front/back, not sleeves/labels/large variants). */
function isPrimarySideFile(file: CatalogPrintFile): boolean {
  const lower = file.type.toLowerCase()
  return !/(sleeve|large|label|inside|outside|pocket|dtf)/.test(lower)
}

/**
 * Restore saved art onto the catalog print files it was designed for.
 * New designs carry `fileType`, so sleeves and labels return to their own
 * surface. Legacy designs (front/back only) land on the primary file for that side.
 */
export function restoreCatalogFileLayers<T extends { placement: PlacementId; fileType?: string }>(
  placements: T[],
  files: CatalogPrintFile[],
  template: MerchBlank
): Record<string, T> {
  const mapped: Record<string, T> = {}
  const byType = new Map(files.map((file) => [file.type, file]))
  const pending: T[] = []
  for (const placement of placements) {
    if (placement.fileType && byType.has(placement.fileType)) {
      if (!mapped[placement.fileType]) mapped[placement.fileType] = placement
    } else {
      pending.push(placement)
    }
  }
  for (const placement of pending) {
    const candidates = files.filter(
      (file) => !mapped[file.type] && placementForPrintFile(file, template).id === placement.placement
    )
    const file = candidates.find(isPrimarySideFile) || candidates[0]
    if (file) mapped[file.type] = placement
  }
  return mapped
}

export function studioPlacementsForTechnique(
  detail: CatalogProductDetail,
  template: MerchBlank,
  technique: string
): BlankPlacement[] {
  const files = filterPrintFilesForTechnique(detail.printFiles, technique)
  if (files.length > 0) {
    const bySide = new Map<PlacementId, BlankPlacement>()
    for (const file of files) {
      const placement = placementForPrintFile(file, template)
      if (!bySide.has(placement.id)) bySide.set(placement.id, placement)
    }
    return [...bySide.values()]
  }
  return studioPlacementsForProduct(detail, template)
}
