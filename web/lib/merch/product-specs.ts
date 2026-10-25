import type { CatalogPrintFile, CatalogVariantRow } from '@/lib/merch/printful-catalog-types'

export type RegionStock = {
  region: string
  label: string
  inStock: number
  total: number
}

export type MaterialShare = {
  name: string
  percentage: number
}

export type PrintfileRecord = {
  printfileId: number
  width: number
  height: number
  dpi: number
}

export type VariantPlacementMap = {
  variantId: number
  placements: Record<string, number>
}

export type TemplateStageRect = {
  x: number
  y: number
  w: number
  h: number
}

export type TemplateRecord = {
  templateId?: number | null
  printfileId: number | null
  placement: string | null
  imageUrl: string | null
  printAreaWidth: number | null
  printAreaHeight: number | null
  printAreaTop: number | null
  printAreaLeft: number | null
  templateWidth: number | null
  templateHeight: number | null
  /** Printful `is_template_on_front`; null when the API did not say. */
  isTemplateOnFront?: boolean | null
}

export type TemplateVariantLink = {
  variantId: number
  placement: string
  templateId: number
}

/** Normalized drop zone from Printful mockup template pixels (matches Design Maker). */
export function stageRectFromTemplate(template: TemplateRecord): TemplateStageRect | null {
  const tw = template.templateWidth
  const th = template.templateHeight
  const pw = template.printAreaWidth
  const ph = template.printAreaHeight
  const left = template.printAreaLeft
  const top = template.printAreaTop
  if (!tw || !th || !pw || !ph || left == null || top == null) return null
  if (tw <= 0 || th <= 0) return null
  return {
    x: left / tw,
    y: top / th,
    w: pw / tw,
    h: ph / th,
  }
}

export type FileGuidelineRow = {
  types: string[]
  placement: string
  sizes: string
  maxPrintArea: string | null
  printFileSize: string | null
  printWidth: number | null
  printHeight: number | null
  dpi: number | null
  templateId: number | null
  templateUrl: string | null
  templateStage: TemplateStageRect | null
  /** Width / height of the Printful template image (1 for square tee templates). */
  templateAspect: number | null
  additionalPrice: number | null
}

export type ProductSpecs = {
  lead: string
  bullets: string[]
  styleLines: string[]
  originCountry: string | null
  sourcedFrom: string | null
  currency: string
  regions: RegionStock[]
  materials: MaterialShare[]
  guidelines: FileGuidelineRow[]
  guidelinesLive: boolean
}

const STYLE_LINE = /fit|fabric|weight|cotton|polyester|streetwear|heavyweight|lightweight|soft|relaxed|structured|garment-dyed|ring-spun/i

export function cleanPrintfulDescription(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function splitDescription(text: string): { lead: string; bullets: string[] } {
  const bullets: string[] = []
  const prose: string[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (/^[•\-*]\s+/.test(trimmed)) bullets.push(trimmed.replace(/^[•\-*]\s+/, ''))
    else if (trimmed.includes(' · ') || trimmed.includes(' • ')) {
      // Some Printful blanks inline their spec list as "100% cotton · Fabric weight: … · Relaxed fit".
      for (const part of trimmed.split(/\s+[·•]\s+/)) {
        const item = part.trim()
        if (item) bullets.push(item)
      }
    } else prose.push(trimmed)
  }
  return { lead: prose.join(' '), bullets }
}

export function styleLinesFromBullets(bullets: string[]): string[] {
  return bullets.filter((line) => STYLE_LINE.test(line) && !/sourced from/i.test(line)).slice(0, 6)
}

export function sourcedFromBullet(bullets: string[]): string | null {
  const line = bullets.find((item) => /sourced from/i.test(item))
  if (!line) return null
  return line.replace(/^blank product sourced from\s+/i, '').replace(/\.$/, '')
}

export function summarizeAvailability(variants: CatalogVariantRow[]): RegionStock[] {
  const map = new Map<string, RegionStock>()
  for (const variant of variants) {
    const statuses = variant.availabilityStatus || []
    for (const row of statuses) {
      if (!row.region) continue
      const current = map.get(row.region) || {
        region: row.region,
        label: variant.availabilityRegions?.[row.region] || row.region,
        inStock: 0,
        total: 0,
      }
      current.total += 1
      if (row.status === 'in_stock' || row.status === 'stocked_on_demand') current.inStock += 1
      map.set(row.region, current)
    }
  }
  return [...map.values()].sort((a, b) => b.total - a.total)
}

export function summarizeMaterials(variants: CatalogVariantRow[]): MaterialShare[] {
  for (const variant of variants) {
    const rows = (variant.material || []).filter((item) => item.name && Number.isFinite(item.percentage))
    if (rows.length > 0) return rows
  }
  return []
}

export function formatInches(pixels: number, dpi: number): string {
  if (!dpi) return ''
  const value = Math.round((pixels / dpi) * 10) / 10
  return Number.isInteger(value) ? `${value.toFixed(0)}″` : `${value.toFixed(1)}″`
}

function sizeLabel(sizes: string[], everySize: Set<string>): string {
  const unique = [...new Set(sizes.filter(Boolean))]
  if (unique.length === 0) return 'All sizes'
  if (everySize.size > 0 && unique.length >= everySize.size && unique.every((size) => everySize.has(size))) {
    return 'All sizes'
  }
  if (unique.length === 1) return unique[0]
  return unique.join(', ')
}

function dimensionLabel(width: number | null, height: number | null, dpi: number | null): string | null {
  if (!width || !height) return null
  if (!dpi) return `${width} × ${height} px`
  return `${formatInches(width, dpi)} × ${formatInches(height, dpi)}`
}

/** Printful lists placement on variant_mapping, not on the template row. */
export function templateForPlacement(
  templates: TemplateRecord[],
  links: TemplateVariantLink[],
  placement: string,
  printfileId: number | null
): TemplateRecord | undefined {
  const byId = new Map<number, TemplateRecord>()
  for (const template of templates) {
    if (template.templateId != null) byId.set(template.templateId, template)
  }
  const counts = new Map<number, number>()
  for (const link of links) {
    if (link.placement !== placement) continue
    counts.set(link.templateId, (counts.get(link.templateId) || 0) + 1)
  }
  const winner = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  if (winner != null && byId.has(winner)) return byId.get(winner)
  const byPlacement = templates.find((template) => template.placement === placement)
  if (byPlacement) return byPlacement
  if (printfileId == null) return undefined
  // No variant mapping: several placements can share one printfile (front/back,
  // left/right sleeve). Use the template's front/back flag to break the tie.
  const sharing = templates.filter((template) => template.printfileId === printfileId)
  if (sharing.length <= 1) return sharing[0]
  const wantsBack = /back/i.test(placement)
  return (
    sharing.find((template) =>
      wantsBack ? template.isTemplateOnFront === false : template.isTemplateOnFront !== false
    ) || sharing[0]
  )
}

export function buildFileGuidelines(input: {
  files: CatalogPrintFile[]
  variants: CatalogVariantRow[]
  printfiles: PrintfileRecord[]
  variantPrintfiles: VariantPlacementMap[]
  templates: TemplateRecord[]
  templateLinks?: TemplateVariantLink[]
}): FileGuidelineRow[] {
  const printfileById = new Map(input.printfiles.map((file) => [file.printfileId, file]))
  const sizeByVariant = new Map(input.variants.map((row) => [row.id, (row.size || 'One size').trim()]))
  const everySize = new Set([...sizeByVariant.values()])
  const placementsByVariant = new Map(input.variantPrintfiles.map((row) => [row.variantId, row.placements]))

  const rows: FileGuidelineRow[] = input.files.map((file) => {
    const used = new Map<number, string[]>()
    for (const [variantId, placements] of placementsByVariant) {
      const printfileId = placements[file.type]
      if (!printfileId) continue
      const sizes = used.get(printfileId) || []
      sizes.push(sizeByVariant.get(variantId) || 'One size')
      used.set(printfileId, sizes)
    }
    const primaryId =
      [...used.entries()].sort((a, b) => b[1].length - a[1].length)[0]?.[0] ?? null
    const printfile = primaryId != null ? printfileById.get(primaryId) : undefined
    const template = templateForPlacement(
      input.templates,
      input.templateLinks || [],
      file.type,
      primaryId
    )
    const dpi = printfile?.dpi || null
    // The printfile is the real print-file size (e.g. 1800×2400 @150 DPI). Template
    // print_area_* values are mockup-image pixels and only serve as a fallback.
    const fileWidth = printfile?.width || template?.printAreaWidth || file.printWidth || null
    const fileHeight = printfile?.height || template?.printAreaHeight || file.printHeight || null
    const sizes = primaryId != null ? used.get(primaryId) || [] : []
    const templateStage = template ? stageRectFromTemplate(template) : null
    const templateAspect =
      template?.templateWidth && template?.templateHeight && template.templateHeight > 0
        ? template.templateWidth / template.templateHeight
        : null
    return {
      types: [file.type],
      placement: file.title || file.type,
      sizes: sizeLabel(sizes, everySize),
      maxPrintArea: dimensionLabel(fileWidth, fileHeight, dpi),
      printFileSize: dimensionLabel(fileWidth, fileHeight, dpi),
      printWidth: fileWidth,
      printHeight: fileHeight,
      dpi,
      templateId: template?.templateId ?? null,
      templateUrl: template?.imageUrl || null,
      templateStage,
      templateAspect,
      additionalPrice: file.additionalPrice,
    }
  })

  return rows
}

export function groupGuidelineRows(rows: FileGuidelineRow[]): FileGuidelineRow[] {
  const groups: FileGuidelineRow[] = []
  for (const row of rows) {
    const match = groups.find(
      (item) =>
        item.sizes === row.sizes &&
        item.maxPrintArea === row.maxPrintArea &&
        item.printFileSize === row.printFileSize &&
        item.dpi === row.dpi &&
        item.templateUrl === row.templateUrl &&
        item.additionalPrice === row.additionalPrice &&
        item.maxPrintArea != null
    )
    if (!match) {
      groups.push({ ...row, types: [...row.types] })
      continue
    }
    match.types.push(...row.types)
    match.placement = joinPlacementLabels(match.placement, row.placement)
  }
  return groups
}

function joinPlacementLabels(current: string, next: string): string {
  const parts = current.split(' · ')
  if (!parts.includes(next)) parts.push(next)
  if (parts.length === 2) {
    const [a, b] = parts
    if (/sleeve/i.test(a) && /sleeve/i.test(b)) return `${shortSide(a)}/${shortSide(b)} sleeve`
    if (/front/i.test(a) && /back/i.test(b)) return 'Front and back'
    if (/back/i.test(a) && /front/i.test(b)) return 'Front and back'
  }
  return parts.join(' · ')
}

function shortSide(label: string): string {
  if (/left/i.test(label)) return 'Left'
  if (/right/i.test(label)) return 'Right'
  return label.replace(/\s*sleeve.*/i, '')
}

export function buildProductSpecs(input: {
  description: string | null
  originCountry: string | null
  currency: string | null
  variants: CatalogVariantRow[]
  files: CatalogPrintFile[]
  printfiles: PrintfileRecord[]
  variantPrintfiles: VariantPlacementMap[]
  templates: TemplateRecord[]
  templateLinks?: TemplateVariantLink[]
}): ProductSpecs {
  const text = cleanPrintfulDescription(input.description)
  const { lead, bullets } = splitDescription(text)
  const guidelines = buildFileGuidelines({
    files: input.files,
    variants: input.variants,
    printfiles: input.printfiles,
    variantPrintfiles: input.variantPrintfiles,
    templates: input.templates,
    templateLinks: input.templateLinks,
  })
  return {
    lead,
    bullets,
    styleLines: styleLinesFromBullets(bullets),
    originCountry: input.originCountry,
    sourcedFrom: sourcedFromBullet(bullets),
    currency: input.currency || 'USD',
    regions: summarizeAvailability(input.variants),
    materials: summarizeMaterials(input.variants),
    guidelines,
    guidelinesLive: input.printfiles.length > 0,
  }
}

export function parsePrintfilesPayload(payload: unknown): {
  printfiles: PrintfileRecord[]
  variantPrintfiles: VariantPlacementMap[]
} {
  const result = (payload as { result?: unknown } | null)?.result as
    | {
        printfiles?: Array<{ printfile_id?: number; width?: number; height?: number; dpi?: number }>
        variant_printfiles?: Array<{ variant_id?: number; placements?: Record<string, number> }>
      }
    | undefined
  if (!result || !Array.isArray(result.printfiles)) return { printfiles: [], variantPrintfiles: [] }
  return {
    printfiles: result.printfiles
      .map((file) => ({
        printfileId: Number(file.printfile_id),
        width: Number(file.width),
        height: Number(file.height),
        dpi: Number(file.dpi) || 150,
      }))
      .filter((file) => file.printfileId > 0 && file.width > 0 && file.height > 0),
    variantPrintfiles: (result.variant_printfiles || [])
      .map((row) => ({
        variantId: Number(row.variant_id),
        placements: row.placements || {},
      }))
      .filter((row) => row.variantId > 0),
  }
}

export function parseTemplatesPayload(payload: unknown): TemplateRecord[] {
  const result = (payload as { result?: { templates?: unknown[] } | unknown[] } | null)?.result
  const list = Array.isArray(result)
    ? result
    : Array.isArray((result as { templates?: unknown[] } | undefined)?.templates)
      ? (result as { templates: unknown[] }).templates
      : []
  return list
    .map((item) => {
      const row = item as {
        template_id?: number
        printfile_id?: number
        placement?: string
        image_url?: string
        template_url?: string
        print_area_width?: number
        print_area_height?: number
        print_area_top?: number
        print_area_left?: number
        template_width?: number
        template_height?: number
        is_template_on_front?: boolean
      }
      return {
        isTemplateOnFront:
          typeof row.is_template_on_front === 'boolean' ? row.is_template_on_front : null,
        templateId: row.template_id != null ? Number(row.template_id) : null,
        printfileId: row.printfile_id != null ? Number(row.printfile_id) : null,
        placement: row.placement || null,
        imageUrl: row.image_url || row.template_url || null,
        printAreaWidth: numberOrNull(row.print_area_width),
        printAreaHeight: numberOrNull(row.print_area_height),
        printAreaTop: coordinateOrNull(row.print_area_top),
        printAreaLeft: coordinateOrNull(row.print_area_left),
        templateWidth: numberOrNull(row.template_width),
        templateHeight: numberOrNull(row.template_height),
      }
    })
    .filter((row) => row.imageUrl || row.printfileId || row.placement)
}

function numberOrNull(value: unknown): number | null {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

function coordinateOrNull(value: unknown): number | null {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}

export function parseTemplateVariantLinks(payload: unknown): TemplateVariantLink[] {
  const result = (payload as { result?: { variant_mapping?: unknown[] } } | null)?.result
  const rows = Array.isArray(result?.variant_mapping) ? result.variant_mapping : []
  const links: TemplateVariantLink[] = []
  for (const item of rows) {
    const row = item as { variant_id?: number; templates?: Array<{ placement?: string; template_id?: number }> }
    const variantId = Number(row.variant_id)
    if (!variantId) continue
    for (const template of row.templates || []) {
      const templateId = Number(template.template_id)
      if (!template.placement || !templateId) continue
      links.push({ variantId, placement: template.placement, templateId })
    }
  }
  return links
}

export function guidelinesForTypes(rows: FileGuidelineRow[], types: string[]): FileGuidelineRow[] {
  const wanted = new Set(types)
  const matched = rows.filter((row) => row.types.some((type) => wanted.has(type)))
  return groupGuidelineRows(matched.map((row) => ({ ...row, types: row.types.filter((type) => wanted.has(type)) })))
}
