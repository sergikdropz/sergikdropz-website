import { describe, expect, it } from 'vitest'
import type { CatalogPrintFile, CatalogVariantRow } from '@/lib/merch/printful-catalog'
import {
  buildProductSpecs,
  formatInches,
  guidelinesForTypes,
  splitDescription,
  templateForPlacement,
} from '@/lib/merch/product-specs'

const files: CatalogPrintFile[] = [
  { fileId: 'front', type: 'front', title: 'Front print', additionalPrice: null, options: [] },
  { fileId: 'back', type: 'back', title: 'Back print', additionalPrice: 5.95, options: [] },
  { fileId: 'sleeve_left', type: 'sleeve_left', title: 'Left sleeve', additionalPrice: 2.49, options: [] },
  { fileId: 'sleeve_right', type: 'sleeve_right', title: 'Right sleeve', additionalPrice: 2.49, options: [] },
]

const variants: CatalogVariantRow[] = [
  {
    id: 1,
    size: 'S',
    color: 'Black',
    in_stock: true,
    availabilityRegions: { US: 'United States' },
    availabilityStatus: [{ region: 'US', status: 'in_stock' }],
    material: [{ name: 'Cotton', percentage: 100 }],
  },
  {
    id: 2,
    size: 'M',
    color: 'Black',
    in_stock: false,
    availabilityRegions: { US: 'United States' },
    availabilityStatus: [{ region: 'US', status: 'out_of_stock' }],
  },
]

describe('product specs', () => {
  it('splits the Printful description into prose and bullets', () => {
    const split = splitDescription(
      'A thick structured tee.\n\n• 100% ring-spun cotton\n• Relaxed fit\n• Blank product sourced from Honduras'
    )
    expect(split.lead).toBe('A thick structured tee.')
    expect(split.bullets).toContain('Relaxed fit')
  })

  it('splits inline "·"-separated spec lists into bullets', () => {
    const split = splitDescription(
      'A heavyweight essential with a relaxed streetwear edge.\n100% USA cotton · Fabric weight: 7.5 oz./yd.² (254 g/m²) · Oversized streetwear fit · Dropped shoulders · Blank product assembled in the USA from globally sourced materials'
    )
    expect(split.lead).toBe('A heavyweight essential with a relaxed streetwear edge.')
    expect(split.bullets).toEqual([
      '100% USA cotton',
      'Fabric weight: 7.5 oz./yd.² (254 g/m²)',
      'Oversized streetwear fit',
      'Dropped shoulders',
      'Blank product assembled in the USA from globally sourced materials',
    ])
  })

  it('formats printfile pixels as inches at 150 DPI', () => {
    expect(formatInches(1800, 150)).toBe('12″')
    expect(formatInches(585, 150)).toBe('3.9″')
  })

  it('groups placements that share a print file and size range', () => {
    const specs = buildProductSpecs({
      description:
        'The t-shirt’s heavyweight fabric gives it a structured look.\n\n• Relaxed fit\n• Fabric weight: 6.1 oz/yd²\n• Blank product sourced from Honduras',
      originCountry: 'Honduras',
      currency: 'USD',
      variants,
      files,
      printfiles: [
        { printfileId: 1, width: 1800, height: 2400, dpi: 150 },
        { printfileId: 2, width: 585, height: 585, dpi: 150 },
      ],
      variantPrintfiles: [
        { variantId: 1, placements: { front: 1, back: 1, sleeve_left: 2, sleeve_right: 2 } },
        { variantId: 2, placements: { front: 1, back: 1, sleeve_left: 2, sleeve_right: 2 } },
      ],
      templates: [
        {
          printfileId: 2,
          placement: 'sleeve_left',
          imageUrl: 'https://files.example/sleeve.png',
          printAreaWidth: 585,
          printAreaHeight: 585,
          printAreaTop: 100,
          printAreaLeft: 50,
          templateWidth: 585,
          templateHeight: 585,
        },
      ],
    })

    expect(specs.lead).toContain('heavyweight fabric')
    expect(specs.styleLines).toContain('Relaxed fit')
    expect(specs.sourcedFrom).toBe('Honduras')
    expect(specs.regions[0]).toMatchObject({ label: 'United States', inStock: 1, total: 2 })
    expect(specs.materials[0]).toEqual({ name: 'Cotton', percentage: 100 })
    expect(specs.guidelinesLive).toBe(true)

    const grouped = guidelinesForTypes(
      specs.guidelines,
      files.map((file) => file.type)
    )
    const sleeves = grouped.find((row) => row.types.includes('sleeve_left'))
    expect(sleeves?.placement).toBe('Left/Right sleeve')
    expect(sleeves?.sizes).toBe('All sizes')
    expect(sleeves?.maxPrintArea).toBe('3.9″ × 3.9″')
    expect(sleeves?.printFileSize).toBe('3.9″ × 3.9″')
    expect(sleeves?.templateUrl).toBe('https://files.example/sleeve.png')
    expect(sleeves?.templateStage).toEqual({
      x: 50 / 585,
      y: 100 / 585,
      w: 585 / 585,
      h: 585 / 585,
    })
    const body = grouped.find((row) => row.types.includes('front'))
    expect(body?.maxPrintArea).toBe('12″ × 16″')
  })

  it('uses the placement template from variant mapping when printfiles are shared', () => {
    const front = {
      templateId: 10,
      printfileId: 1,
      placement: null,
      imageUrl: 'https://files.example/front.png',
      printAreaWidth: 1010,
      printAreaHeight: 1346,
      printAreaTop: 530,
      printAreaLeft: 1006,
      templateWidth: 3000,
      templateHeight: 3000,
    }
    const back = {
      ...front,
      templateId: 11,
      imageUrl: 'https://files.example/back.png',
      printAreaTop: 224,
      printAreaLeft: 987,
    }
    const picked = templateForPlacement([front, back], [{ variantId: 1, placement: 'back', templateId: 11 }], 'back', 1)
    expect(picked?.imageUrl).toBe('https://files.example/back.png')
    expect(picked?.printAreaTop).toBe(224)
  })
})
