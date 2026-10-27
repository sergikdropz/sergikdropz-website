import { describe, expect, it } from 'vitest'
import { sumCatalogAddOnRows, usedCatalogAddOnRows } from '@/lib/merch/catalog-add-ons'
import type { CatalogPrintFile } from '@/lib/merch/printful-catalog-types'

const files: CatalogPrintFile[] = [
  { fileId: 'f', type: 'embroidery_front', title: 'Front', additionalPrice: 2.95, options: [] },
  { fileId: 'b', type: 'embroidery_back', title: 'Back', additionalPrice: 2.95, options: [] },
  {
    fileId: 'x',
    type: 'embroidery_chest',
    title: 'Chest',
    additionalPrice: null,
    options: [{ id: 'full_color', type: 'full_color', title: 'Unlimited color', additionalPrice: 3.5 }],
  },
]

describe('usedCatalogAddOnRows', () => {
  it('lists surcharges only for placements with art', () => {
    const rows = usedCatalogAddOnRows(
      files,
      {
        embroidery_front: {
          placement: 'front',
          assetUrl: 'https://x/a.png',
          assetWidth: 100,
          assetHeight: 100,
          x: 0.5,
          y: 0.5,
          scale: 1,
          rotation: 0,
        },
        embroidery_back: {
          placement: 'back',
          assetUrl: '',
          assetWidth: 0,
          assetHeight: 0,
          x: 0.5,
          y: 0.5,
          scale: 1,
          rotation: 0,
        },
      },
      false,
    )
    expect(rows).toEqual([{ id: 'embroidery_front', label: 'Front', price: 2.95 }])
    expect(sumCatalogAddOnRows(rows)).toBe(2.95)
  })

  it('adds unlimited color once when selected and embroidery is placed', () => {
    const rows = usedCatalogAddOnRows(
      files,
      {
        embroidery_chest: {
          placement: 'front',
          assetUrl: 'https://x/b.png',
          assetWidth: 100,
          assetHeight: 100,
          x: 0.5,
          y: 0.5,
          scale: 1,
          rotation: 0,
        },
      },
      true,
    )
    expect(rows).toEqual([{ id: 'full_color', label: 'Unlimited color', price: 3.5 }])
  })
})
