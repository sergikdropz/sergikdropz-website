import { describe, expect, it } from 'vitest'
import {
  buildFanReleaseCatalogItem,
  releaseDateIsPublic,
  verifiedStoreLinkMap,
} from '@/lib/marketing/shop-fan-releases'
import { evaluateReleaseStoreCoverage, SHOP_CORE_STREAMING_STORES } from '@/lib/shop/sync-purchasable-from-distribution'

describe('shop-fan-releases', () => {
  it('builds fan catalog items with music page href and zero price', () => {
    const item = buildFanReleaseCatalogItem({
      id: 'release-test-ep',
      title: 'Test EP',
      type: 'ep',
      release_date: '2026-01-01',
      trackCount: 5,
    })
    expect(item.price).toBe(0)
    expect(item.fanFree).toBe(true)
    expect(item.href).toBe('/music/release-test-ep')
    expect(item.category).toBe('ep')
    expect(item.description).toContain('free fan account')
    expect(item.description).not.toContain('five-track EP listen')
  })

  it('requires release day on or before today', () => {
    expect(releaseDateIsPublic('2026-10-01', '2026-10-27')).toBe(true)
    expect(releaseDateIsPublic('2026-11-01', '2026-10-27')).toBe(false)
    expect(releaseDateIsPublic(null, '2026-10-27')).toBe(false)
  })

  it('ignores unverified store URLs for platform eligibility', () => {
    const map = verifiedStoreLinkMap(
      SHOP_CORE_STREAMING_STORES.map((store) => ({
        release_id: 'r1',
        store,
        url: `https://example.com/${store}`,
        verification_status: 'unverified',
      })),
    )
    expect(map.size).toBe(0)

    const verified = verifiedStoreLinkMap([
      {
        release_id: 'r1',
        store: 'spotify',
        url: 'https://open.spotify.com/album/1',
        verification_status: 'live',
      },
    ])
    const coverage = evaluateReleaseStoreCoverage('core', [], verified)
    expect(coverage.eligible).toBe(false)
    expect(coverage.missingStores.length).toBe(SHOP_CORE_STREAMING_STORES.length - 1)
  })
})
