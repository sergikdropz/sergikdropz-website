import { describe, expect, it, beforeEach } from 'vitest'
import {
  mergeMosaicTiles,
  upsertLiveMosaicCover,
  getLiveMosaicCovers,
  removeLiveMosaicCover,
  resetLiveMosaicCoversForTests,
  isMosaicPathSuppressed,
} from '@/lib/catalog-sync/live-mosaic-covers'

describe('live-mosaic-covers', () => {
  beforeEach(() => {
    resetLiveMosaicCoversForTests()
  })

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

  it('dedupes the same release label — live uploaded art wins over static EP path', () => {
    const staticTiles = [
      {
        id: 'ep-daze',
        src: '/images/audio/unreleased/eps/SERGIK%20-%20Daze/cover.jpeg',
        alt: 'Daze cover art',
      },
    ]
    const live = [
      {
        id: 'live-folder-collection-daze',
        src: '/images/audio/artwork/folder-collection-daze.jpg?v=2',
        alt: 'Daze cover art',
      },
    ]
    const merged = mergeMosaicTiles(staticTiles, live)
    expect(merged).toHaveLength(1)
    expect(merged[0]?.id).toBe('live-folder-collection-daze')
    expect(merged[0]?.src).toContain('folder-collection-daze')
  })

  it('suppresses the replaced path so it cannot re-enter from static tiles', () => {
    upsertLiveMosaicCover({
      id: 'live-folder-daze',
      src: '/images/audio/artwork/folder-daze-old.png',
      alt: 'Daze cover art',
    })
    upsertLiveMosaicCover({
      id: 'live-folder-daze',
      src: '/images/audio/artwork/folder-daze-new.png',
      alt: 'Daze cover art',
    })
    expect(isMosaicPathSuppressed('/images/audio/artwork/folder-daze-old.png')).toBe(true)

    const merged = mergeMosaicTiles(
      [
        {
          id: 'static-old',
          src: '/images/audio/artwork/folder-daze-old.png',
          alt: 'Daze cover art',
        },
        {
          id: 'static-other',
          src: '/images/audio/unreleased/eps/other/cover.jpeg',
          alt: 'Other cover art',
        },
      ],
      getLiveMosaicCovers(),
    )
    expect(merged.every((t) => !t.src.includes('folder-daze-old'))).toBe(true)
    expect(merged.some((t) => t.src.includes('folder-daze-new'))).toBe(true)
    expect(merged.some((t) => t.id === 'static-other')).toBe(true)
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
    expect(isMosaicPathSuppressed('/images/audio/artwork/folder-test.png')).toBe(true)
  })

  it('keeps getLiveMosaicCovers referentially stable between updates', () => {
    const a = getLiveMosaicCovers()
    const b = getLiveMosaicCovers()
    expect(a).toBe(b)
  })
})
