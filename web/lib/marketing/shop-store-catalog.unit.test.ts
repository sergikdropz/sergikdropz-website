import { describe, expect, it } from 'vitest'
import {
  buildStoreCatalogFromProducts,
  compareByReleaseDateNewestFirst,
  matchProductReleaseId,
  productMatchesStoreRef,
  staticStreamingStoreRefs,
} from '@/lib/marketing/shop-store-catalog'
import type { ShopCatalogProduct } from '@/lib/marketing/shop-catalog'

describe('shop-store-catalog', () => {
  it('maps Staying A Vibe distribution ids to product release_id', () => {
    expect(matchProductReleaseId('Staying A Vibe', 'release-collection-unreleased-eps-sergik---stayi-mu5pzoor')).toBe(
      'staying-a-vibe',
    )
  })

  it('static refs include Apple Music releases and Staying A Vibe schedule row', () => {
    const refs = staticStreamingStoreRefs('2026-10-27')
    const titles = refs.map((r) => r.title)
    expect(titles).toContain('Staying A Vibe')
    expect(titles).toContain('ROOS VA')
    expect(titles).toContain('Hold Up')
    expect(titles).not.toContain('Are We Awake?')
  })

  it('sorts catalog newest release date first', () => {
    const products = [
      {
        id: 'ep-old',
        title: 'Old EP (Digital Download)',
        release_id: 'old',
        status: 'active',
        category: 'ep-bundles',
        trackCount: 5,
        price: 6.45,
        productType: 'ep-bundle' as const,
        formatPrices: { MP3: 6.45, WAV: 9.95 },
      },
      {
        id: 'single-new',
        title: 'New Single (Digital Download)',
        release_id: 'new',
        status: 'active',
        category: 'singles',
        trackCount: 1,
        price: 1.29,
        productType: 'ep-bundle' as const,
        formatPrices: { MP3: 1.29, WAV: 1.99 },
      },
    ] as ShopCatalogProduct[]

    const refs = [
      { releaseId: 'new', title: 'New Single', sortDate: '2026-10-20', source: 'releases-json' as const },
      { releaseId: 'old', title: 'Old EP', sortDate: '2021-07-26', source: 'releases-json' as const },
    ]

    const catalog = buildStoreCatalogFromProducts(products, refs)
    expect(catalog.map((p) => p.id)).toEqual(['single-new', 'ep-old'])
    expect(compareByReleaseDateNewestFirst(catalog[0], catalog[1])).toBeLessThan(0)
  })

  it('merges streaming refs with active products by release_id', () => {
    const products = [
      {
        id: 'single-a-good-day',
        title: 'A Good Day (feat. Be Janis) (Digital Download)',
        release_id: 'a-good-day',
        status: 'active',
        category: 'singles',
        trackCount: 1,
        price: 1.29,
        productType: 'ep-bundle' as const,
        formatPrices: { MP3: 1.29, WAV: 1.99 },
      },
    ] as ShopCatalogProduct[]

    const refs = [
      { releaseId: 'a-good-day', title: 'A Good Day (feat. Be Janis)', sortDate: '2025-06-15', source: 'releases-json' as const },
    ]

    expect(buildStoreCatalogFromProducts(products, refs).map((p) => p.id)).toEqual(['single-a-good-day'])
  })

  it('builds catalog from products that match streaming refs only', () => {
    const products = [
      {
        id: 'ep-staying-a-vibe',
        title: 'Staying A Vibe EP (Digital Download)',
        release_id: 'staying-a-vibe',
        status: 'active',
        category: 'ep-bundles',
        trackCount: 5,
        price: 6.45,
        productType: 'ep-bundle' as const,
        formatPrices: { MP3: 6.45, WAV: 9.95 },
      },
      {
        id: 'ep-are-we-awake',
        title: 'Are We Awake EP (Digital Download)',
        release_id: 'are-we-awake',
        status: 'inactive',
        category: 'ep-bundles',
        trackCount: 5,
        price: 6.45,
        productType: 'ep-bundle' as const,
        formatPrices: { MP3: 6.45, WAV: 9.95 },
      },
    ] as ShopCatalogProduct[]

    const refs = [
      { releaseId: 'staying-a-vibe', title: 'Staying A Vibe', sortDate: '2026-10-08', source: 'release-schedule' as const },
      { releaseId: 'are-we-awake', title: 'Are We Awake?', sortDate: '2026-09-24', source: 'release-schedule' as const },
    ]

    const catalog = buildStoreCatalogFromProducts(products, refs)
    expect(catalog.map((p) => p.id)).toEqual(['ep-staying-a-vibe'])
    expect(productMatchesStoreRef(products[0], refs[0])).toBe(true)
  })
})
