import { describe, expect, it } from 'vitest'
import {
  evaluateReleaseStoreCoverage,
  mergePurchasableTracksFromScan,
  SHOP_CORE_STREAMING_STORES,
} from '@/lib/shop/sync-purchasable-from-distribution'

describe('sync-purchasable-from-distribution', () => {
  it('requires core streaming URLs in core mode', () => {
    const links = new Map(SHOP_CORE_STREAMING_STORES.map((store) => [store, `https://example.com/${store}`]))
    const result = evaluateReleaseStoreCoverage('core', [], links)
    expect(result.eligible).toBe(true)
    expect(result.missingStores).toEqual([])
  })

  it('flags missing core stores', () => {
    const links = new Map([['spotify', 'https://open.spotify.com/track/1']])
    const result = evaluateReleaseStoreCoverage('core', [], links)
    expect(result.eligible).toBe(false)
    expect(result.missingStores).toContain('apple_music')
  })

  it('merges scan candidates without dropping stripe ids', () => {
    const merged = mergePurchasableTracksFromScan(
      [
        {
          id: 'shop-qta532600001',
          title: 'Old title',
          description: 'x',
          price: 4.99,
          formats: [],
          stripePriceId: 'price_live',
          isrc: 'QTA532600001',
          distributionTrackId: 'dtrack-1',
        },
      ],
      [
        {
          id: 'shop-qta532600001',
          title: 'It Is What It Is',
          description: 'new',
          price: 2.99,
          formats: [{ type: 'WAV', file: '/api/audio/media/x.wav' }],
          isrc: 'QTA532600001',
          distributionTrackId: 'dtrack-1',
        },
      ],
    )
    expect(merged).toHaveLength(1)
    expect(merged[0]?.stripePriceId).toBe('price_live')
    expect(merged[0]?.price).toBe(4.99)
    expect(merged[0]?.title).toBe('It Is What It Is')
  })
})
