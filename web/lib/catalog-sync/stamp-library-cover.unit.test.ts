import { describe, expect, it } from 'vitest'
import { stampLibraryCover, stampPlaylistCovers } from '@/lib/catalog-sync/stamp-library-cover'

describe('stampLibraryCover', () => {
  it('stamps the matching folder tile and every sibling track', () => {
    const folders = [
      {
        id: 'root',
        artwork: '/old-root.png',
        children: [
          {
            id: 'collection-daze',
            artwork: '/old.png',
            tracks: [
              { id: 't1', folderId: 'collection-daze', artwork: '/old.png' },
              { id: 't2', folderId: 'collection-daze', artwork: '/other.png' },
            ],
          },
        ],
        tracks: [{ id: 'orphan', folderId: 'collection-daze', artwork: '/stale.png' }],
      },
    ]
    const next = stampLibraryCover(folders, 'collection-daze', '/new.png')
    expect(next[0].artwork).toBe('/old-root.png')
    expect(next[0].children?.[0].artwork).toBe('/new.png')
    expect(next[0].children?.[0].tracks?.map((t) => t.artwork)).toEqual(['/new.png', '/new.png'])
    expect(next[0].tracks?.[0].artwork).toBe('/new.png')
  })

  it('stamps a tile whose cover file embeds a different folder id', () => {
    const folders = [
      {
        id: 'collection-are-we-awake',
        artwork: '/images/audio/artwork/folder-1787772055352.jpg',
        tracks: [{ id: 't1', artwork: '/images/audio/artwork/folder-1787772055352.jpg' }],
      },
    ]
    const next = stampLibraryCover(
      folders,
      '1787772055352',
      '/images/audio/artwork/folder-1787772055352.jpg?v=9',
    )
    expect(next[0].artwork).toBe('/images/audio/artwork/folder-1787772055352.jpg?v=9')
    expect(next[0].tracks?.[0].artwork).toBe('/images/audio/artwork/folder-1787772055352.jpg?v=9')
  })

  it('returns the same array when nothing matches', () => {
    const folders = [{ id: 'a', artwork: '/a.png', tracks: [] }]
    expect(stampLibraryCover(folders, 'missing', '/new.png')).toBe(folders)
  })
})

describe('stampPlaylistCovers', () => {
  it('stamps the linked collection playlist', () => {
    const playlists = [
      { id: 'playlist-collection-daze', artwork: '/old.png' },
      { id: 'playlist-other', artwork: '/keep.png' },
    ]
    const next = stampPlaylistCovers(playlists, {
      folderId: 'collection-daze',
      playlistId: 'playlist-collection-daze',
      artwork: '/new.png',
    })
    expect(next[0].artwork).toBe('/new.png')
    expect(next[1].artwork).toBe('/keep.png')
  })
})
