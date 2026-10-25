import { describe, expect, it } from 'vitest'
import {
  filterPrintFilesForTechnique,
  isAllOverCatalogProduct,
  studioPlacementsForProduct,
} from '@/lib/merch/catalog-studio'
import type { CatalogPrintFile } from '@/lib/merch/printful-catalog'
import type { CatalogProductDetail } from '@/lib/merch/printful-catalog'
import { MERCH_BLANKS } from '@/lib/merch/blanks'

function mockDetail(overrides: Partial<CatalogProductDetail>): CatalogProductDetail {
  return {
    product: {
      id: 1,
      title: 'Test Tee',
      type: 'T-SHIRT',
      typeName: 'T-Shirt',
      brand: null,
      model: null,
      image: null,
      variantCount: 1,
      fileTypes: ['front', 'back'],
      isDiscontinued: false,
      techniques: [],
      studioFamily: 'tee',
      studioBlankId: null,
      category: 'tees',
      mainCategoryId: null,
      avgFulfillmentDays: null,
    },
    colors: [],
    sizes: ['M'],
    defaultColors: [],
    defaultSizes: ['M'],
    minWholesale: null,
    fileTypes: ['front', 'back'],
    variants: [],
    techniques: [],
    printFiles: [],
    description: null,
    specs: null,
    ...overrides,
  }
}

describe('catalog-studio', () => {
  it('detects all-over products', () => {
    const detail = mockDetail({
      product: { ...mockDetail({}).product, title: 'All-Over Print Crop Tee' },
      fileTypes: ['default'],
    })
    expect(isAllOverCatalogProduct(detail)).toBe(true)
  })

  it('maps placements from Printful file types', () => {
    const detail = mockDetail({ fileTypes: ['front'] })
    const placements = studioPlacementsForProduct(detail, MERCH_BLANKS[0])
    expect(placements.some((p) => p.id === 'front')).toBe(true)
    expect(placements.some((p) => p.id === 'back')).toBe(false)
  })

  it('filters dad hat files by embroidery vs dtf technique', () => {
    const files: CatalogPrintFile[] = [
      { fileId: 'default', type: 'embroidery_front', title: 'Front', additionalPrice: null, options: [] },
      { fileId: 'front_dtf_hat', type: 'front_dtf_hat', title: 'Front print', additionalPrice: 2.95, options: [] },
    ]
    expect(filterPrintFilesForTechnique(files, 'EMBROIDERY')).toHaveLength(1)
    expect(filterPrintFilesForTechnique(files, 'DTFILM')).toHaveLength(1)
  })
})
