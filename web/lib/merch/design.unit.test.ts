import { describe, expect, it } from 'vitest'
import { MERCH_BLANKS } from '@/lib/merch/blanks'
import {
  artOutside,
  designPlacementIssues,
  designToShopProduct,
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
  })
})
