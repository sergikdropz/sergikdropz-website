import { describe, expect, it } from 'vitest'
import {
  coloredTemplate,
  designGarmentImage,
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

  it('uses the selected variant template on the design stage', () => {
    const detail = mockDetail({
      variants: [
        { id: 10, color: 'Black', size: 'One size', image: 'https://files.example/catalog-black.jpg' },
        { id: 11, color: 'White', size: 'One size', image: 'https://files.example/catalog-white.jpg' },
      ],
      printFiles: [
        {
          fileId: 'front',
          type: 'front',
          title: 'Front',
          additionalPrice: null,
          options: [],
          templateUrl: 'https://files.example/base.png',
          variantTemplates: {
            '10': { imageUrl: 'https://files.example/base.png', backgroundColor: '#2a2a2a' },
            '11': { imageUrl: 'https://files.example/base.png', backgroundColor: '#ffffff' },
          },
          mockupStage: { x: 0.2, y: 0.2, w: 0.4, h: 0.4 },
        },
      ],
    })
    const file = detail.printFiles[0]
    expect(designGarmentImage(detail, file, 'White', 'One size')).toBe('https://files.example/base.png')
    expect(coloredTemplate(detail, file, 'White', 'One size')).toEqual({
      imageUrl: 'https://files.example/base.png',
      backgroundColor: '#ffffff',
    })
    expect(coloredTemplate(detail, file, 'Black', 'One size')?.backgroundColor).toBe('#2a2a2a')
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
