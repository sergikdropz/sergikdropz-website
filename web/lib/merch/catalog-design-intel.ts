import { angleMatchesFile } from '@/lib/merch/catalog-studio'
import { auditPlacementTemplates } from '@/lib/merch/placement-audit'
import type { PlacementConflict } from '@/lib/merch/product-specs'
import type {
  CatalogDesignIntel,
  CatalogGarmentAngle,
  CatalogPrintFile,
  CatalogProductDetail,
} from '@/lib/merch/printful-catalog-types'

export type { CatalogDesignIntel, CatalogGarmentAngle, PlacementConflict }

const PRIMARY_VIEW =
  /^(front|back|left|right|left front|right front|left sleeve|right sleeve)$/i

export function viewRank(view: string): number {
  const name = view.trim().toLowerCase()
  if (name === 'front') return 0
  if (name === 'back') return 1
  if (name === 'left' || name === 'left front') return 2
  if (name === 'right' || name === 'right front') return 3
  if (name.includes('left')) return 4
  if (name.includes('right')) return 5
  return 6
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    const key = trimmed.toLowerCase()
    if (!trimmed || seen.has(key)) continue
    seen.add(key)
    out.push(trimmed)
  }
  return out
}

/**
 * Flat views from `GET /v2/catalog-products/{id}/mockup-styles`.
 * The same style list is repeated on every placement, so views are deduped.
 */
export function flatAnglesFromMockupStyles(payload: unknown): {
  angles: CatalogGarmentAngle[]
  total: number
  offset: number
  rowCount: number
} {
  const body = payload as {
    data?: unknown[]
    paging?: { total?: number; offset?: number; limit?: number }
  } | null
  const rows = Array.isArray(body?.data) ? body.data : []
  const seen = new Set<string>()
  const angles: CatalogGarmentAngle[] = []
  for (const item of rows) {
    const row = item as {
      technique?: string
      mockup_styles?: Array<{ id?: number; category_name?: string; view_name?: string }>
    }
    for (const style of row.mockup_styles || []) {
      if ((style.category_name || '').trim().toLowerCase() !== 'flat') continue
      const view = (style.view_name || '').trim()
      const key = view.toLowerCase()
      if (!view || seen.has(key)) continue
      seen.add(key)
      const styleId = Number(style.id)
      angles.push({
        styleId: Number.isFinite(styleId) && styleId > 0 ? styleId : null,
        view,
        group: 'Flat',
        placement: null,
        technique: row.technique || null,
      })
    }
  }
  return {
    angles,
    total: Number(body?.paging?.total) || rows.length,
    offset: Number(body?.paging?.offset) || 0,
    rowCount: rows.length,
  }
}

/** Print file a photographed view should open. Prefer the plain placement over large, DTF, or embroidery extras. */
export function placementForAngle(view: string, files: CatalogPrintFile[]): string | null {
  const candidates = files.filter(
    (file) => file.mockupSupported !== false && angleMatchesFile(view, file),
  )
  if (candidates.length === 0) return null
  const shot = view.trim().toLowerCase()
  let pool = candidates
  if (!shot.includes('embroider')) pool = pool.filter((file) => !/embroidery/i.test(file.type))
  if (!shot.includes('label')) pool = pool.filter((file) => !/label/i.test(file.type))
  if (!shot.includes('large') && !shot.includes('wide')) {
    pool = pool.filter((file) => !/large|wide/i.test(file.type))
  }
  if (!shot.includes('dtf')) pool = pool.filter((file) => !/dtf/i.test(file.type))
  if (pool.length === 0) pool = candidates
  const exact = pool.find((file) => file.type.toLowerCase() === shot.replace(/\s+/g, '_'))
  return (exact || pool[0]).type
}

export function buildCatalogDesignIntel(input: {
  printFiles: CatalogPrintFile[]
  catalogAngles: CatalogGarmentAngle[]
  styleGroups: string[]
  styleViews: string[]
  conflicts: PlacementConflict[]
}): CatalogDesignIntel {
  const styleGroups = uniqueStrings(input.styleGroups)
  const styleViews = uniqueStrings(input.styleViews)
  const detail = { printFiles: input.printFiles } as CatalogProductDetail
  let angles = input.catalogAngles.map((angle) => ({ ...angle }))
  if (angles.length === 0) {
    const group = styleGroups.find((item) => item.toLowerCase() === 'flat') || 'Flat'
    angles = styleViews
      .filter((view) => PRIMARY_VIEW.test(view))
      .map((view) => ({
        styleId: null,
        view,
        group,
        placement: null,
        technique: null,
      }))
  }
  for (const angle of angles) {
    angle.placement = placementForAngle(angle.view, input.printFiles)
  }
  angles.sort((a, b) => viewRank(a.view) - viewRank(b.view) || a.view.localeCompare(b.view))
  const conflicts = mergeConflicts(input.conflicts)
  return {
    angles,
    styleGroups,
    styleViews,
    conflicts,
    audit: auditPlacementTemplates(detail),
  }
}

function mergeConflicts(rows: PlacementConflict[]): PlacementConflict[] {
  const map = new Map<string, Set<string>>()
  for (const row of rows) {
    const placement = row.placement.trim()
    if (!placement) continue
    const bucket = map.get(placement) || new Set<string>()
    for (const other of row.conflicts) {
      if (other && other !== placement) bucket.add(other)
    }
    map.set(placement, bucket)
  }
  return [...map.entries()]
    .filter(([, conflicts]) => conflicts.size > 0)
    .map(([placement, conflicts]) => ({ placement, conflicts: [...conflicts] }))
}

/** Style filter for a mockup task: Flat views that match a real print file. */
export function photographStyleOptions(intel: CatalogDesignIntel): {
  optionGroups: string[]
  options: string[]
} {
  const group = intel.styleGroups.find((item) => item.toLowerCase() === 'flat')
  const allowed = new Set(intel.styleViews.map((view) => view.toLowerCase()))
  const options = uniqueStrings(
    intel.angles
      .filter((angle) => angle.placement && PRIMARY_VIEW.test(angle.view))
      .filter((angle) => allowed.size === 0 || allowed.has(angle.view.toLowerCase()))
      .sort((a, b) => viewRank(a.view) - viewRank(b.view))
      .map((angle) => angle.view),
  ).slice(0, 6)
  return {
    optionGroups: group ? [group] : [],
    options,
  }
}

/** First surface to open: the Flat Front file when Printful listed one. */
export function openingPrintFile<T extends { type: string; title?: string | null }>(
  files: T[],
  angles: Array<{ view: string; placement: string | null }> = [],
): T | undefined {
  const front = angles.find((angle) => /^front$/i.test(angle.view) && angle.placement)
  if (front) {
    const match = files.find((file) => file.type === front.placement)
    if (match) return match
  }
  return files.find((file) => angleMatchesFile('Front', file)) || files[0]
}

/** Placements on the garment that Printful will not print together. */
export function conflictingPlacementProblems(
  placedTypes: string[],
  conflicts: PlacementConflict[],
): string[] {
  const placed = new Set(placedTypes.filter(Boolean))
  const problems: string[] = []
  const seen = new Set<string>()
  for (const row of conflicts) {
    if (!placed.has(row.placement)) continue
    const hit = row.conflicts.filter((type) => placed.has(type))
    if (hit.length === 0) continue
    const key = [row.placement, ...hit].sort().join('|')
    if (seen.has(key)) continue
    seen.add(key)
    problems.push(`${row.placement} cannot print with ${hit.join(', ')}`)
  }
  return problems
}
