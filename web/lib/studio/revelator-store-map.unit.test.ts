import { describe, expect, it } from 'vitest'
import {
  buildAggregatorStoreMatrix,
  resolveRevelatorTargetStores,
} from '@/lib/studio/revelator-store-map'

describe('revelator-store-map', () => {
  it('queues curated IDs and lists unsupported honestly', () => {
    const resolved = resolveRevelatorTargetStores(['spotify', 'apple_music', 'amazon', 'beatport'])
    expect(resolved.storeIds).toEqual([1, 9])
    expect(resolved.queued.sort()).toEqual(['apple_music', 'spotify'])
    expect(resolved.unsupported.map((u) => u.store).sort()).toEqual(['amazon', 'beatport'])
  })

  it('buildAggregatorStoreMatrix marks curated vs unsupported', () => {
    const matrix = buildAggregatorStoreMatrix({
      targets: ['spotify', 'amazon', 'tidal'],
      lookupStores: [{ distributorStoreId: 42, name: 'Amazon Music', isActive: true }],
    })
    const spotify = matrix.find((r) => r.store === 'spotify')!
    const amazon = matrix.find((r) => r.store === 'amazon')!
    const tidal = matrix.find((r) => r.store === 'tidal')!
    expect(spotify.honesty).toBe('curated')
    expect(spotify.queueable).toBe(true)
    expect(amazon.honesty).toBe('lookup')
    expect(amazon.lookupId).toBe(42)
    expect(amazon.queueable).toBe(true)
    expect(tidal.honesty).toBe('unsupported')
    expect(tidal.queueable).toBe(false)
  })
})
