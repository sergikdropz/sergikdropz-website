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

/** Prefer Printful positioning template when drop zone is template-calibrated. */
export function designGarmentImage(
  detail: CatalogProductDetail | null,
  activeFile: CatalogPrintFile | undefined,
  colorName: string | null,
  size: string | null
): string | null {
  if (activeFile?.templateUrl && activeFile.mockupStage) return activeFile.templateUrl
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
  }
}

export function fileGuidelineLines(area: BlankPlacement): string[] {
  const widthIn = (area.printWidth / 150).toFixed(2)
  const heightIn = (area.printHeight / 150).toFixed(2)
  return [
    `${area.printWidth} × ${area.printHeight} px (${widthIn}″ × ${heightIn}″ at 150 DPI)`,
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
