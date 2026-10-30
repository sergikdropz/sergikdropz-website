import { describe, expect, it } from 'vitest'
import {
  buildCatalogDesignIntel,
  conflictingPlacementProblems,
  flatAnglesFromMockupStyles,
  openingPrintFile,
  photographStyleOptions,
  placementForAngle,
} from '@/lib/merch/catalog-design-intel'
import type { CatalogPrintFile } from '@/lib/merch/printful-catalog-types'

const files: CatalogPrintFile[] = [
  { fileId: 'front', type: 'front', title: 'Front print', additionalPrice: null, options: [], mockupSupported: true },
  { fileId: 'back', type: 'back', title: 'Back print', additionalPrice: null, options: [], mockupSupported: true },
  { fileId: 'front_large', type: 'front_large', title: 'Large front print', additionalPrice: 2, options: [], mockupSupported: true },
  { fileId: 'sleeve_left', type: 'sleeve_left', title: 'Left sleeve', additionalPrice: null, options: [], mockupSupported: true },
  {
    fileId: 'emb',
    type: 'embroidery_chest_left',
    title: 'Left chest',
    additionalPrice: null,
    options: [],
    mockupSupported: true,
  },
]

const stylesPayload = {
  data: [
    {
      placement: 'front',
      technique: 'dtg',
      mockup_styles: [
        { id: 744, category_name: "Men's Lifestyle", view_name: 'Front' },
        { id: 849, category_name: 'Flat', view_name: 'Front' },
        { id: 850, category_name: 'Flat', view_name: 'Back' },
        { id: 851, category_name: 'Flat', view_name: 'Left sleeve' },
      ],
    },
    {
      placement: 'back',
      technique: 'dtg',
      mockup_styles: [
        { id: 849, category_name: 'Flat', view_name: 'Front' },
        { id: 850, category_name: 'Flat', view_name: 'Back' },
      ],
    },
  ],
  paging: { total: 2, offset: 0, limit: 100 },
}

describe('catalog design intel', () => {
  it('keeps one Flat view per camera angle and drops lifestyle shots', () => {
    const parsed = flatAnglesFromMockupStyles(stylesPayload)
    expect(parsed.angles.map((angle) => angle.view)).toEqual(['Front', 'Back', 'Left sleeve'])
    expect(parsed.angles[0].styleId).toBe(849)
    expect(parsed.rowCount).toBe(2)
  })

  it('ties Front to the plain front file, not the large or embroidery extra', () => {
    expect(placementForAngle('Front', files)).toBe('front')
    expect(placementForAngle('Left sleeve', files)).toBe('sleeve_left')
    expect(placementForAngle('Back', files)).toBe('back')
  })

  it('builds angles, photo options, and an audit from the catalog payload', () => {
    const intel = buildCatalogDesignIntel({
      printFiles: files.map((file, index) => ({
        ...file,
        templateId: index + 1,
        templateUrl: `https://files.example/${file.type}.png`,
        mockupStage: { x: 0.1 + index * 0.05, y: 0.2, w: 0.4, h: 0.4 },
        printWidth: 1800,
        printHeight: 2400,
      })),
      catalogAngles: flatAnglesFromMockupStyles(stylesPayload).angles,
      styleGroups: ['Flat', "Men's Lifestyle", 'Flat'],
      styleViews: ['Front', 'Back', 'Left sleeve', 'Zoomed-in'],
      conflicts: [
        { placement: 'front', conflicts: ['front_large'] },
        { placement: 'front_large', conflicts: ['front'] },
      ],
    })
    expect(intel.angles.map((angle) => [angle.view, angle.placement])).toEqual([
      ['Front', 'front'],
      ['Back', 'back'],
      ['Left sleeve', 'sleeve_left'],
    ])
    expect(intel.styleGroups).toEqual(['Flat', "Men's Lifestyle"])
    expect(intel.audit.problems).toEqual([])
    expect(photographStyleOptions(intel)).toEqual({
      optionGroups: ['Flat'],
      options: ['Front', 'Back', 'Left sleeve'],
    })
    expect(openingPrintFile(files, intel.angles)?.type).toBe('front')
    expect(conflictingPlacementProblems(['front', 'front_large'], intel.conflicts)).toEqual([
      'front cannot print with front_large',
    ])
    expect(conflictingPlacementProblems(['front', 'back'], intel.conflicts)).toEqual([])
  })

  it('falls back to printfile view names when mockup styles did not load', () => {
    const intel = buildCatalogDesignIntel({
      printFiles: files,
      catalogAngles: [],
      styleGroups: ['Flat'],
      styleViews: ['Back', 'Front', 'Product details'],
      conflicts: [],
    })
    expect(intel.angles.map((angle) => angle.view)).toEqual(['Front', 'Back'])
    expect(intel.angles[0].placement).toBe('front')
  })
})
