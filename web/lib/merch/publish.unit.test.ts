import { describe, expect, it } from 'vitest'
import {
  collectMockupsByVariant,
  createdSyncProductId,
  freshPrintfulUrl,
  mockupAnglesByColorFromTask,
  mockupPhotoKey,
  mockupsByColorFromTask,
  photosMatchKey,
  previewVariantId,
  variantIdsForColors,
} from '@/lib/merch/publish'

describe('createdSyncProductId', () => {
  it('reads Printful create-product result.id', () => {
    expect(createdSyncProductId({ code: 200, result: { id: 79348732, name: 'Valle Del Sol - Backprint Tee', variants: 2 } })).toBe(
      '79348732',
    )
  })

  it('still reads the older result.sync_product.id shape', () => {
    expect(createdSyncProductId({ result: { sync_product: { id: 13 } } })).toBe('13')
  })
})

describe('freshPrintfulUrl', () => {
  it('adds a cache buster so Printful fetches the replaced file', () => {
    const url = freshPrintfulUrl('https://sergikdropz.com/api/merch/art/abc.png')
    expect(url.startsWith('https://sergikdropz.com/api/merch/art/abc.png?pf=')).toBe(true)
    const again = freshPrintfulUrl('https://sergikdropz.com/api/merch/art/abc.png?v=1')
    expect(again.startsWith('https://sergikdropz.com/api/merch/art/abc.png?v=1&pf=')).toBe(true)
  })
})

describe('variantIdsForColors', () => {
  const variants = [
    { id: 1, color: 'Black', size: 'One size' },
    { id: 2, color: 'White', size: 'One size' },
    { id: 3, color: 'Black', size: 'M' },
  ]

  it('keeps one variant per color and puts the preview color first', () => {
    expect(variantIdsForColors(variants, 'One size', 'White')).toEqual([2, 1])
    expect(previewVariantId(variants, 'One size', 'White')).toBe(2)
  })
})

describe('mockupPhotoKey', () => {
  const base = {
    catalogProductId: 99,
    colorName: 'Black',
    files: [{ type: 'embroidery_front_large', url: 'https://sergikdropz.com/api/merch/art/a.png?pf=1' }],
    placements: [
      {
        fileType: 'embroidery_front_large',
        placement: 'front' as const,
        assetUrl: '/api/merch/art/a.png?v=1',
        x: 0.1,
        y: 0.2,
        scale: 0.3,
        rotation: 0,
      },
    ],
    unlimited: false,
    threads: { thread_colors_front_large: ['#FFFFFF', '#000000'] },
  }

  it('ignores cache busters and changes when the color or placement changes', () => {
    const key = mockupPhotoKey(base)
    expect(mockupPhotoKey({ ...base, files: [{ type: 'embroidery_front_large', url: 'https://sergikdropz.com/api/merch/art/a.png' }] })).toBe(key)
    expect(mockupPhotoKey({ ...base, colorName: 'White' })).not.toBe(key)
    expect(mockupPhotoKey({ ...base, placements: [{ ...base.placements[0], x: 0.5 }] })).not.toBe(key)
    expect(
      photosMatchKey(
        {
          previewColorName: 'Black',
          mockupUrlsByColor: { Black: ['/api/merch/art/photo.jpg'] },
          mockupPhotoKeysByColor: { Black: key },
        },
        key,
      ),
    ).toBe(true)
    expect(
      photosMatchKey(
        {
          previewColorName: 'White',
          mockupUrlsByColor: { Black: ['/api/merch/art/photo.jpg'] },
          mockupPhotoKeysByColor: { Black: key },
        },
        key,
      ),
    ).toBe(false)
  })
})

describe('mockupsByColorFromTask', () => {
  it('keeps each color’s angle photos', () => {
    const result = {
      mockups: [
        {
          variant_ids: [1],
          extra: [
            { url: 'https://files.example/black-front.jpg' },
            { url: 'https://files.example/black-side.jpg' },
          ],
        },
        {
          variant_ids: [2],
          extra: [
            { url: 'https://files.example/white-front.jpg' },
            { url: 'https://files.example/white-side.jpg' },
          ],
        },
      ],
    }
    expect(collectMockupsByVariant(result).get(2)).toEqual([
      'https://files.example/white-front.jpg',
      'https://files.example/white-side.jpg',
    ])
    expect(mockupsByColorFromTask(result, new Map([[1, 'Black'], [2, 'White']]), 'Black')).toEqual({
      Black: ['https://files.example/black-front.jpg', 'https://files.example/black-side.jpg'],
      White: ['https://files.example/white-front.jpg', 'https://files.example/white-side.jpg'],
    })
    expect(mockupAnglesByColorFromTask(result, new Map([[1, 'Black']]), null).Black?.map((angle) => angle.url)).toEqual([
      'https://files.example/black-front.jpg',
      'https://files.example/black-side.jpg',
    ])
  })
})
