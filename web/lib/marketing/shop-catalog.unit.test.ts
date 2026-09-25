import { describe, expect, it } from 'vitest'
import { findShopProductBySlug, isPurchasableCatalogTrack } from '@/lib/marketing/shop-catalog'

describe('shop-catalog', () => {
  it('filters placeholder purchasable tracks', () => {
    expect(
      isPurchasableCatalogTrack({
        id: 'track-1',
        title: 'Track Name',
        slug: 'track-name',
        description: '',
        price: 2.99,
        formats: [],
        freeDownload: false,
        stripePriceId: 'price_xxxxx',
      } as any),
    ).toBe(false)
  })

  it('finds products by slug or id', () => {
    const data = {
      products: [
        {
          id: 'ep-test',
          slug: 'test-ep',
          title: 'Test EP',
          status: 'active',
          productType: 'ep-bundle' as const,
        },
      ],
      tracks: [],
      licenseTiers: [],
      categories: [],
    }
    expect(findShopProductBySlug(data as any, 'test-ep')?.title).toBe('Test EP')
    expect(findShopProductBySlug(data as any, 'ep-test')?.title).toBe('Test EP')
    expect(findShopProductBySlug(data as any, 'missing')).toBeNull()
  })
})
