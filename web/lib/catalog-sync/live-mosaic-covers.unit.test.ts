import { describe, expect, it } from 'vitest'
import { mergeMosaicTiles, upsertLiveMosaicCover, getLiveMosaicCovers, removeLiveMosaicCover } from '@/lib/catalog-sync/live-mosaic-covers'

describe('live-mosaic-covers', () => {
  it('merges live covers ahead of static tiles and dedupes by path', () => {
    const staticTiles = [
      { id: 'static-1', src: '/images/a.png', alt: 'A' },
      { id: 'static-2', src: '/images/b.png', alt: 'B' },
    ]
    const live = [{ id: 'live-1', src: '/images/audio/artwork/folder-x.png?v=1', alt: 'X' }]
    const merged = mergeMosaicTiles(staticTiles, live)
    expect(merged[0]?.id).toBe('live-1')
    expect(merged.map((t) => t.id)).toContain('static-1')
  })

  it('upserts and removes live covers', () => {
    upsertLiveMosaicCover({
      id: 'live-folder-test',
      src: '/images/audio/artwork/folder-test.png',
      alt: 'Test',
    })
    expect(getLiveMosaicCovers().some((t) => t.id === 'live-folder-test')).toBe(true)
    removeLiveMosaicCover('live-folder-test')
    expect(getLiveMosaicCovers().some((t) => t.id === 'live-folder-test')).toBe(false)
  })

  it('keeps getLiveMosaicCovers referentially stable between updates', () => {
    const a = getLiveMosaicCovers()
    const b = getLiveMosaicCovers()
    expect(a).toBe(b)
  })
})
