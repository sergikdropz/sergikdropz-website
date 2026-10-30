import { describe, expect, it } from 'vitest'
import { MERCH_BLANKS } from '@/lib/merch/blanks'
import {
  artBox,
  artOutside,
  containPlacement,
  fitPlacement,
  maxScaleInMitigation,
  optimizePlacementForPrint,
  mitigationGuidelines,
  stitchInsets,
  scalePlacementAboutCenter,
  designPlacementIssues,
  designToShopProduct,
  previewArtPlacement,
  dpiGrade,
  effectiveDpi,
  isPublicFulfillmentUrl,
  slugify,
  suggestRetail,
  youKeep,
  type MerchDesign,
} from '@/lib/merch/design'

const teeFront = MERCH_BLANKS[0].placements[0]

function placement(overrides: Partial<Parameters<typeof artOutside>[0]> = {}) {
  return {
    placement: 'front' as const,
    assetUrl: '/art.png',
    assetWidth: 3000,
    assetHeight: 3000,
    x: 0.2,
    y: 0.2,
    scale: 0.5,
    rotation: 0,
    ...overrides,
  }
}

describe('merch design math', () => {
  it('keeps the artwork center fixed while the corner resize changes its size', () => {
    const start = { x: 0.2, y: 0.3, scale: 0.4 }
    const height = 0.5
    const next = scalePlacementAboutCenter(start, height, 0.6)
    expect(next.x + next.scale / 2).toBeCloseTo(start.x + start.scale / 2)
    expect(next.y + (0.6 * (height / start.scale)) / 2).toBeCloseTo(start.y + height / 2)
  })

  it('rounds a retail price up to a clean dollar above cost and a 2.2× mark', () => {
    expect(suggestRetail(13)).toBe(29)
    expect(suggestRetail(8)).toBe(20)
  })

  it('subtracts wholesale and the card fee from retail', () => {
    expect(youKeep(36, 13)).toBeCloseTo(21.66, 2)
  })

  it('grades print DPI from how large the file is drawn', () => {
    const sharp = placement({ assetWidth: 3000, scale: 0.5 })
    expect(dpiGrade(effectiveDpi(sharp, teeFront))).toBe('good')
    const soft = placement({ assetWidth: 400, scale: 0.8 })
    expect(dpiGrade(effectiveDpi(soft, teeFront))).toBe('low')
  })

  it('collects outside and low DPI issues across placements', () => {
    const soft = placement({ assetWidth: 400, scale: 0.5 })
    const issues = designPlacementIssues([{ label: 'Front', art: soft, area: teeFront }])
    expect(issues.lowDpi).toEqual(['Front'])
    const outsideArt = placement({ x: -0.2 })
    expect(designPlacementIssues([{ label: 'Front', art: outsideArt, area: teeFront }]).outside).toEqual([
      'Front',
    ])
  })

  it('pulls a full-bleed embroidery logo inside the stitch margin', () => {
    const hat: typeof teeFront = {
      ...teeFront,
      printfulType: 'addon_embroidery_front',
      printWidth: 675,
      printHeight: 675,
      dpi: 300,
    }
    const filled = placement({
      x: 0.022897528352563812,
      y: 0.022897528352563645,
      scale: 0.9542049432948724,
      assetWidth: 675,
      assetHeight: 675,
    })
    const inset = stitchInsets(hat)
    expect(inset.x).toBeCloseTo(0.3 * 300 / 675, 5)
    const next = containPlacement(filled, hat)
    const box = artBox(next, hat)
    expect(box.x).toBeGreaterThanOrEqual(inset.x - 0.001)
    expect(box.y).toBeGreaterThanOrEqual(inset.y - 0.001)
    expect(box.x + box.w).toBeLessThanOrEqual(1 - inset.x + 0.001)
    expect(box.y + box.h).toBeLessThanOrEqual(1 - inset.y + 0.001)
    expect(next.scale).toBeLessThan(filled.scale)
    const again = containPlacement(next, hat)
    expect(again.scale).toBeCloseTo(next.scale, 5)
    expect(artBox(containPlacement(filled, teeFront), teeFront).x).toBeGreaterThanOrEqual(-0.001)
  })

  it('pulls print art back inside the print file on every product', () => {
    const hung = placement({ x: -0.2, y: 1.1, scale: 0.4, assetWidth: 1000, assetHeight: 1000 })
    const next = containPlacement(hung, teeFront)
    const box = artBox(next, teeFront)
    expect(box.x).toBeGreaterThanOrEqual(-0.001)
    expect(box.y).toBeGreaterThanOrEqual(-0.001)
    expect(box.x + box.w).toBeLessThanOrEqual(1.001)
    expect(box.y + box.h).toBeLessThanOrEqual(1.001)
    expect(containPlacement(placement(), teeFront)).toEqual(placement())
  })

  it('states the embroidery stitch area in the same inches the bake uses', () => {
    const lines = mitigationGuidelines({
      printfulType: 'addon_embroidery_front',
      label: 'Front',
      printWidth: 675,
      printHeight: 675,
      dpi: 300,
    })
    const byId = Object.fromEntries(lines.map((line) => [line.id, line.detail]))
    expect(byId['print-file']).toContain('675×675 px PNG at 300 DPI (2.25″ × 2.25″)')
    expect(byId.stitch).toContain('0.3″')
    expect(byId.stitch).toContain('495×495 px')
    expect(byId.stitch).toContain('1.65″ × 1.65″')
    expect(byId.design).toContain('bright dashed box is the stitch area')
    expect(byId.stitch).toContain('bright dashed box is that stitch area')
    expect(byId.preview).toContain('Another color draws that garment')
    expect(lines.some((line) => line.id === 'print-edge')).toBe(false)
  })

  it('states that a print file keeps the art on the edge', () => {
    const lines = mitigationGuidelines({
      printfulType: 'front',
      label: 'Front print',
      printWidth: 1800,
      printHeight: 2400,
      dpi: 150,
    })
    const edge = lines.find((line) => line.id === 'print-edge')
    expect(edge?.detail).toContain('0.25″ guide and does not move the art')
    expect(lines.find((line) => line.id === 'design')?.detail).toContain('stay inside it')
    expect(lines.find((line) => line.id === 'print-file')?.detail).toContain('1800×2400 px PNG at 150 DPI (12″ × 16″)')
    expect(lines.some((line) => line.id === 'stitch')).toBe(false)
  })

  it('names Design and Preview before the catalog file has a size', () => {
    const lines = mitigationGuidelines({ printfulType: 'front', printWidth: 0, printHeight: 0, dpi: null })
    expect(lines.map((line) => line.id)).toEqual(['design', 'preview', 'print-file'])
    expect(lines[2].detail).toContain('once the catalog file has loaded')
  })

  it('treats embroidery in the stitch margin as outside the design area', () => {
    const hat: typeof teeFront = {
      ...teeFront,
      printfulType: 'addon_embroidery_front',
      printWidth: 675,
      printHeight: 675,
      dpi: 300,
    }
    const fitted = fitPlacement(675, 675, hat)
    const box = artBox({ ...placement(), ...fitted, assetWidth: 675, assetHeight: 675 }, hat)
    const inset = stitchInsets(hat)
    expect(box.x).toBeGreaterThanOrEqual(inset.x - 0.001)
    expect(box.x + box.w).toBeLessThanOrEqual(1 - inset.x + 0.001)
    expect(artOutside({ ...placement(), x: 0.02, y: 0.02, scale: 0.2 }, hat)).toBe(true)
    expect(maxScaleInMitigation({ assetWidth: 675, assetHeight: 675, rotation: 0 }, hat)).toBeLessThan(0.75)
    expect(fitPlacement(1000, 1000, teeFront).scale).toBeCloseTo(0.86, 2)
  })

  it('sizes embroidery to the stitch box without stretching a small file', () => {
    const hat: typeof teeFront = {
      ...teeFront,
      printfulType: 'addon_embroidery_front',
      printWidth: 675,
      printHeight: 675,
      dpi: 300,
    }
    const logo = placement({
      x: 0,
      y: 0,
      scale: 0.95,
      rotation: 0,
      assetWidth: 675,
      assetHeight: 675,
    })
    const next = optimizePlacementForPrint(logo, hat)
    const box = artBox(next, hat)
    const inset = stitchInsets(hat)
    expect(artOutside(next, hat)).toBe(false)
    expect(box.x).toBeGreaterThanOrEqual(inset.x - 0.001)
    expect(box.x + box.w).toBeLessThanOrEqual(1 - inset.x + 0.001)
    expect(next.scale).toBeCloseTo(maxScaleInMitigation(logo, hat), 4)
    expect(box.x).toBeCloseTo(inset.x, 3)
    const again = optimizePlacementForPrint(next, hat)
    expect(again.scale).toBeCloseTo(next.scale, 4)
    expect(again.x).toBeCloseTo(next.x, 4)

    const small = placement({ assetWidth: 200, assetHeight: 200, scale: 0.9, x: -0.1, y: 0.2 })
    const sharp = optimizePlacementForPrint(small, hat)
    expect(sharp.scale).toBeCloseTo(200 / 675, 4)
    expect(artOutside(sharp, hat)).toBe(false)
    expect(dpiGrade(effectiveDpi(sharp, hat))).toBe('good')
  })

  it('keeps a rotated print inside the file and at native pixels', () => {
    const hung = placement({ x: -0.2, y: 0.1, scale: 0.9, rotation: 45, assetWidth: 1000, assetHeight: 1000 })
    const next = optimizePlacementForPrint(hung, teeFront)
    expect(artOutside(next, teeFront)).toBe(false)
    expect(next.rotation).toBe(45)
    expect(next.scale).toBeLessThanOrEqual(1000 / teeFront.printWidth + 0.001)
    expect(next.scale).toBeCloseTo(Math.min(maxScaleInMitigation(hung, teeFront), 1000 / teeFront.printWidth), 3)
  })

  it('flags art that leaves the print area, including when rotated', () => {
    expect(artOutside(placement(), teeFront)).toBe(false)
    expect(artOutside(placement({ x: -0.2 }), teeFront)).toBe(true)
    expect(artOutside(placement({ x: 0.1, y: 0.1, scale: 0.9, rotation: 45 }), teeFront)).toBe(true)
  })

  it('treats localhost art as unreachable by the printer', () => {
    expect(isPublicFulfillmentUrl('https://sergik.com/api/merch/art/abc')).toBe(true)
    expect(isPublicFulfillmentUrl('http://localhost:3001/api/merch/art/abc')).toBe(false)
    expect(isPublicFulfillmentUrl('/api/merch/art/abc')).toBe(false)
  })

  it('slugifies a product name', () => {
    expect(slugify('Night Drive Tee')).toBe('night-drive-tee')
  })

  it('hides drafts from the shop and keeps live pieces that have a sync variant', () => {
    const base: MerchDesign = {
      id: 'd1',
      name: 'Night Drive Tee',
      slug: 'night-drive-tee',
      blankId: 'tee-staple',
      family: 'tee',
      placements: [placement()],
      colors: ['Black'],
      sizes: ['M'],
      previewColor: '#1a1a1a',
      retailPrice: 36,
      wholesaleCost: 13,
      status: 'draft',
      printfulSyncProductId: null,
      mockupTaskKey: null,
      mockupUrls: [],
      variants: [
        {
          catalogVariantId: 4012,
          syncVariantId: 88,
          size: 'M',
          color: 'Black',
          retailPrice: 36,
        },
      ],
      publishNote: null,
      createdAt: '2026-10-17T00:00:00.000Z',
      updatedAt: '2026-10-17T00:00:00.000Z',
    }
    expect(designToShopProduct(base)).toBeNull()
    const live = designToShopProduct({ ...base, status: 'live' })
    expect(live?.fulfillmentReady).toBe(true)
    expect(live?.variants[0].printful_variant_id).toBe(88)
    expect(live?.category).toBe('tees')
    const hats = designToShopProduct({
      ...base,
      status: 'live',
      family: 'hat',
      blankId: 'hat-dad',
      previewColorName: 'Black',
      mockupUrls: [
        '/api/merch/art/back.jpg',
        '/api/merch/art/left.jpg',
        '/api/merch/art/front.jpg',
      ],
      mockupAngleTitlesByColor: { Black: ['Back', 'Left Front', 'Front'] },
    })
    expect(hats?.thumbnail).toBe('/api/merch/art/front.jpg')
    expect(hats?.designPreview?.mockupAngleTitlesByColor?.Black?.[2]).toBe('Front')
  })
})

describe('previewArtPlacement', () => {
  it('uses the file open on the stage instead of the first front mark', () => {
    const chest = placement({ fileType: 'embroidery_chest_left', scale: 0.2 })
    const front = placement({ fileType: 'front_dtf', scale: 1 })
    expect(previewArtPlacement([chest, front], 'front_dtf')?.fileType).toBe('front_dtf')
    expect(previewArtPlacement([chest, front], null)?.fileType).toBe('front_dtf')
    expect(previewArtPlacement([chest, front], 'missing')?.fileType).toBe('front_dtf')
  })
})
