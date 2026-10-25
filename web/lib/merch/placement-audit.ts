import type { CatalogPrintFile, CatalogProductDetail } from '@/lib/merch/printful-catalog-types'

export type PlacementAuditRow = {
  type: string
  title: string
  templateId: number | null
  templateUrl: string | null
  stage: { x: number; y: number; w: number; h: number } | null
  printWidth: number | null
  printHeight: number | null
  dpi: number | null
}

export type PlacementAudit = {
  rows: PlacementAuditRow[]
  /** Wiring failures on our side — something Printful provides that we did not resolve. */
  problems: string[]
  /** Placements Printful itself exposes no geometry for; hidden from the designer. */
  warnings: string[]
}

const NON_PRINT_FILE = new Set(['mockup', 'preview'])

function stageInBounds(stage: { x: number; y: number; w: number; h: number }): boolean {
  const slop = 0.001
  return (
    stage.w > 0 &&
    stage.h > 0 &&
    stage.x >= -slop &&
    stage.y >= -slop &&
    stage.x + stage.w <= 1 + slop &&
    stage.y + stage.h <= 1 + slop
  )
}

/** Pairs that must never share one template (they sit on different sides of the product). */
const DISTINCT_PAIRS: Array<[RegExp, RegExp, string]> = [
  [/^front$/i, /^back$/i, 'front and back'],
  [/sleeve_left/i, /sleeve_right/i, 'left and right sleeve'],
  [/^front$/i, /^front_large$/i, 'front and front (large)'],
  [/label_inside/i, /label_outside/i, 'inside and outside label'],
]

/**
 * Checks that every print file on a catalog product has what the designer
 * needs: a Printful template (image + drop zone inside the image) and a
 * print-file size, and that opposite placements got different templates.
 * Pure — safe for unit tests and the verify script.
 */
export function auditPlacementTemplates(detail: CatalogProductDetail): PlacementAudit {
  const files = detail.printFiles.filter((file) => !NON_PRINT_FILE.has(file.type))
  const rows: PlacementAuditRow[] = files.map((file) => ({
    type: file.type,
    title: file.title,
    templateId: file.templateId ?? null,
    templateUrl: file.templateUrl ?? null,
    stage: file.mockupStage ?? null,
    printWidth: file.printWidth ?? null,
    printHeight: file.printHeight ?? null,
    dpi: file.dpi ?? null,
  }))
  const problems: string[] = []
  const warnings: string[] = []

  if (files.length === 0) problems.push('no print files on product')

  for (const row of rows) {
    const file = files.find((item) => item.type === row.type)
    if (file?.mockupSupported === false) {
      warnings.push(
        `${row.type}: Printful exposes no printfile or template under any technique — hidden from the designer`
      )
      continue
    }
    if (!row.templateUrl) problems.push(`${row.type}: no template image`)
    if (!row.stage) problems.push(`${row.type}: no drop zone (template print_area_* missing)`)
    else if (!stageInBounds(row.stage)) problems.push(`${row.type}: drop zone outside the template image`)
    if (!row.printWidth || !row.printHeight) problems.push(`${row.type}: no print-file size`)
  }
  if (rows.length > 0 && rows.every((row) => files.find((f) => f.type === row.type)?.mockupSupported === false)) {
    problems.push('no placement on this product has Printful geometry')
  }

  const byType = new Map(rows.map((row) => [row.type, row]))
  for (const [a, b, label] of DISTINCT_PAIRS) {
    const left = [...byType.values()].find((row) => a.test(row.type))
    const right = [...byType.values()].find((row) => b.test(row.type))
    if (!left || !right) continue
    const sameTemplate =
      left.templateId != null && left.templateId === right.templateId
    const sameStage =
      left.stage && right.stage && JSON.stringify(left.stage) === JSON.stringify(right.stage)
    if (sameTemplate || (left.templateId == null && sameStage)) {
      problems.push(`${label} resolved to the same template (${left.type} / ${right.type})`)
    }
  }

  return { rows, problems, warnings }
}

/** Convenience for tests: quick predicate on a single file. */
export function printFileIsCalibrated(file: CatalogPrintFile): boolean {
  return Boolean(file.templateUrl && file.mockupStage && file.printWidth && file.printHeight)
}
