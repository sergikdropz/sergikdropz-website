import type { ArtPlacement } from '@/lib/merch/design'
import type { CatalogPrintFile } from '@/lib/merch/printful-catalog-types'

export type CatalogAddOnRow = { id: string; label: string; price: number }

/** Printful surcharges for placements (and options) that actually have art on them. */
export function usedCatalogAddOnRows(
  printFiles: CatalogPrintFile[],
  catalogFileLayers: Record<string, ArtPlacement | undefined>,
  embroideryUnlimitedColor: boolean,
): CatalogAddOnRow[] {
  const rows: CatalogAddOnRow[] = []

  for (const file of printFiles) {
    const art = catalogFileLayers[file.type]
    if (!art?.assetUrl) continue
    const filePrice = file.additionalPrice ?? 0
    if (filePrice > 0) {
      rows.push({
        id: file.type,
        label: file.title || file.type,
        price: filePrice,
      })
    }
  }

  if (embroideryUnlimitedColor) {
    const host = printFiles.find(
      (file) =>
        catalogFileLayers[file.type]?.assetUrl &&
        file.options.some((option) => option.id === 'full_color' && (option.additionalPrice ?? 0) > 0),
    )
    const option = host?.options.find((row) => row.id === 'full_color')
    if (option && (option.additionalPrice ?? 0) > 0) {
      rows.push({
        id: 'full_color',
        label: option.title,
        price: option.additionalPrice!,
      })
    }
  }

  return rows
}

export function sumCatalogAddOnRows(rows: CatalogAddOnRow[]): number {
  return rows.reduce((total, row) => total + row.price, 0)
}
