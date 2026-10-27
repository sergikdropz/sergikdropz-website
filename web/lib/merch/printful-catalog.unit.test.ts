import { describe, expect, it } from 'vitest'
import {
  categorizeCatalogProduct,
  filterCatalogProducts,
  reconcileCatalogProductStudio,
  resolvePlacementPrintArea,
  variantsToMerchOptions,
} from '@/lib/merch/printful-catalog'

describe('printful-catalog', () => {
  it('categorizes apparel types', () => {
    expect(categorizeCatalogProduct('Unisex Staple T-Shirt', 'T-Shirt')).toBe('tees')
    expect(categorizeCatalogProduct('Fleece Hoodie', 'Hoodie')).toBe('hoodies')
  })

  it('treats short sleeve shirts as tees, not shorts/pants', () => {
    const title = 'Unisex Max Heavyweight Short Sleeve | Shaka Wear SHMHSS'
    expect(categorizeCatalogProduct(title, title, 'T-SHIRT')).toBe('tees')
    const reconciled = reconcileCatalogProductStudio({
      id: 1636,
      title,
      type: 'T-SHIRT',
      typeName: title,
      brand: 'Shaka Wear',
      model: 'SHMHSS',
      image: null,
      variantCount: 1,
      fileTypes: ['front', 'back', 'sleeve_left', 'sleeve_right'],
      isDiscontinued: false,
      techniques: ['DTG'],
      studioFamily: 'sweatpants',
      studioBlankId: 'sweatpants-fleece',
      category: 'pants',
      mainCategoryId: null,
      avgFulfillmentDays: null,
    })
    expect(reconciled.studioFamily).toBe('tee')
    expect(reconciled.studioBlankId).toBe('tee-staple')
    expect(reconciled.category).toBe('tees')
  })

  it('filters by query and category', () => {
    const products = [
      {
        id: 1,
        title: 'Staple Tee',
        type: 'T-SHIRT',
        typeName: 'T-Shirt',
        brand: null,
        model: null,
        image: null,
        variantCount: 10,
        fileTypes: ['front'],
        isDiscontinued: false,
        techniques: [],
        studioFamily: 'tee' as const,
        studioBlankId: null,
        category: 'tees',
        mainCategoryId: null,
        avgFulfillmentDays: null,
      },
    ]
    expect(filterCatalogProducts(products, { q: 'staple' })).toHaveLength(1)
    expect(filterCatalogProducts(products, { q: 'hoodie' })).toHaveLength(0)
  })

  it('derives colors and sizes from variants', () => {
    const options = variantsToMerchOptions([
      { id: 1, color: 'Black', size: 'M', price: '13.25' },
      { id: 2, color: 'White', size: 'L', price: '13.50' },
    ])
    expect(options.colors.map((c) => c.name)).toEqual(['Black', 'White'])
  })

  it('keeps Printful two-tone colors as one swatch with both codes', () => {
    const options = variantsToMerchOptions([
      { id: 1, color: 'Black', size: 'One size', color_code: '#2a2a2a', price: '20' },
      { id: 2, color: 'black', size: 'One size', color_code: '#2a2a2a', price: '20' },
      { id: 3, color: 'Black/ Red', size: 'One size', color_code: '#2a2a2a', color_code2: '#dd0b2e', price: '20' },
    ])
    expect(options.colors).toEqual([
      { name: 'Black', hex: '#2a2a2a', hex2: null },
      { name: 'Black/ Red', hex: '#2a2a2a', hex2: '#dd0b2e' },
    ])
  })

  it('resolves placement print areas with sensible fallbacks', () => {
    const areas = {
      front: { width: 1800, height: 2400, dpi: 150 },
      default: { width: 4962, height: 3507, dpi: 300 },
    }
    // exact placement wins
    expect(resolvePlacementPrintArea(areas, 'front')).toEqual(areas.front)
    // unknown placement falls back to default
    expect(resolvePlacementPrintArea(areas, 'sleeve_left')).toEqual(areas.default)
    // no default → first available (never a hardcoded tee)
    expect(resolvePlacementPrintArea({ embroidery_front_large: { width: 1650, height: 600, dpi: 300 } }, 'back')).toEqual({
      width: 1650,
      height: 600,
      dpi: 300,
    })
    // empty → null (caller supplies its own fallback)
    expect(resolvePlacementPrintArea({}, 'front')).toBeNull()
  })
})
