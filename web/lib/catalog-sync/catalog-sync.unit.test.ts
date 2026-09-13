import { describe, expect, it } from 'vitest'
import {
  emitCatalogSync,
  folderIdFromPlaylistId,
  normalizeArtworkPatch,
  playlistIdForFolder,
  stripArtworkCacheBust,
  subscribeCatalogSync,
  withArtworkCacheBust,
  isUploadedFolderArtwork,
  artworkUploadRejectReason,
  playerTrackMatchesCoverEvent,
  catalogItemMatchesCoverEvent,
  collectionIdFromArtwork,
  stampAllTrackArtwork,
  trackHasOwnArtwork,
  trackShouldUseCrateMosaic,
} from '@/lib/catalog-sync'

describe('catalog-sync artwork helpers', () => {
  it('strips and re-busts artwork urls', () => {
    expect(stripArtworkCacheBust('/images/audio/artwork/foo.png?v=1')).toBe(
      '/images/audio/artwork/foo.png',
    )
    const busted = withArtworkCacheBust('/images/audio/artwork/foo.png?v=old')
    expect(busted.startsWith('/images/audio/artwork/foo.png?v=')).toBe(true)
    expect(normalizeArtworkPatch('/images/audio/artwork/foo.png')).toMatch(
      /^\/images\/audio\/artwork\/foo\.png\?v=\d+$/,
    )
    expect(normalizeArtworkPatch('')).toBeUndefined()
    expect(normalizeArtworkPatch(null)).toBeUndefined()
  })

  it('treats local and cloud folder covers as uploaded artwork', () => {
    expect(isUploadedFolderArtwork('/images/audio/artwork/folder-x.png?v=1')).toBe(true)
    expect(
      isUploadedFolderArtwork(
        'https://example.supabase.co/storage/v1/object/public/audio-files/artwork/folder-x.jpg',
      ),
    ).toBe(true)
    expect(isUploadedFolderArtwork('/images/audio/unreleased/eps/cover.jpg')).toBe(false)
    expect(isUploadedFolderArtwork('')).toBe(false)
  })

  it('detects stamped folder covers vs track-own artwork', () => {
    expect(
      trackHasOwnArtwork({
        artwork: '/images/audio/artwork/folder-1789130620706.jpg',
        folderId: '1789130620706',
      }),
    ).toBe(false)
    expect(
      trackHasOwnArtwork({
        artwork: '/images/audio/unreleased/eps/cover.jpg',
        folderId: 'collection-daze',
      }),
    ).toBe(true)
    expect(trackHasOwnArtwork({ artwork: '', folderId: 'x' })).toBe(false)
    expect(
      trackShouldUseCrateMosaic({
        artwork: '/images/audio/artwork/folder-1789130620706.jpg',
        folderId: '1789130620706',
        albumType: 'album',
      }),
    ).toBe(true)
    expect(
      trackShouldUseCrateMosaic({
        artwork: '/images/audio/artwork/folder-daze.jpg',
        folderId: 'daze',
        albumType: 'ep',
      }),
    ).toBe(false)
    expect(
      trackShouldUseCrateMosaic({
        artwork: '/images/audio/artwork/folder-ftp.jpg',
        folderId: 'collection-unreleased-eps-sergik---ftp-',
      }),
    ).toBe(false)
    expect(
      trackHasOwnArtwork({
        artwork: '/images/audio/unreleased/eps/SERGIK%20-%20FTP/cover.jpeg',
        folderId: 'collection-unreleased-eps-sergik---ftp-',
      }),
    ).toBe(true)
  })

  it('rejects HEIC uploads that would be stored as a broken JPEG', () => {
    const heic = new File([new Uint8Array([0])], 'cover.heic', { type: 'image/heic' })
    expect(artworkUploadRejectReason(heic)).toMatch(/HEIC/)
    const jpeg = new File([new Uint8Array([0])], 'cover.jpg', { type: 'image/jpeg' })
    expect(artworkUploadRejectReason(jpeg)).toBeNull()
  })
})

describe('playerTrackMatchesCoverEvent', () => {
  it('matches queue tracks by folder artwork path when folderId is missing', () => {
    const track = {
      id: 't1',
      artwork: '/images/audio/artwork/folder-1787772055352.jpg',
    }
    expect(
      playerTrackMatchesCoverEvent(track, { folderId: '1787772055352' }),
    ).toBe(true)
    expect(collectionIdFromArtwork(track.artwork)).toBe('1787772055352')
    expect(
      playerTrackMatchesCoverEvent(track, { folderId: 'collection-other' }),
    ).toBe(false)
  })

  it('matches EP tiles by artwork path when folder ids differ', () => {
    expect(
      catalogItemMatchesCoverEvent(
        {
          id: 'collection-are-we-awake',
          artwork: '/images/audio/artwork/folder-1787772055352.jpg',
        },
        '1787772055352',
      ),
    ).toBe(true)
    expect(
      catalogItemMatchesCoverEvent(
        { id: 'collection-daze', artwork: '/images/audio/artwork/folder-collection-daze.png' },
        'collection-daze',
      ),
    ).toBe(true)
  })

  it('stamps every track in a collection list', () => {
    const tracks = [
      { id: 't1', artwork: '/old-a.png' },
      { id: 't2', artwork: '/old-b.png' },
      { id: 't3' },
    ]
    const next = stampAllTrackArtwork(tracks, '/new.png')
    expect(next.map((t) => t.artwork)).toEqual(['/new.png', '/new.png', '/new.png'])
  })

  it('matches the playing folder source even without per-track folderId', () => {
    expect(
      playerTrackMatchesCoverEvent(
        { id: 't1' },
        { folderId: '1787772055352', sourceFolderId: '1787772055352' },
      ),
    ).toBe(true)
  })
})

describe('catalog-sync ids', () => {
  it('links folder and playlist ids', () => {
    expect(playlistIdForFolder('collection-daze')).toBe('playlist-collection-daze')
    expect(folderIdFromPlaylistId('playlist-collection-daze')).toBe('collection-daze')
  })
})

describe('catalog-sync bus', () => {
  it('enriches folder events with playlist ids and notifies listeners', () => {
    const seen: string[] = []
    const stop = subscribeCatalogSync((event) => {
      seen.push(`${event.entity}:${event.folderId}:${event.playlistId}:${event.patch.artwork || ''}`)
    })
    const event = emitCatalogSync({
      entity: 'folder',
      entityId: 'collection-daze',
      patch: { artwork: '/images/audio/artwork/folder-collection-daze.png' },
    })
    stop()
    expect(event.folderId).toBe('collection-daze')
    expect(event.playlistId).toBe('playlist-collection-daze')
    expect(event.patch.artwork).toMatch(/folder-collection-daze\.png\?v=/)
    expect(seen.length).toBe(1)
    expect(seen[0]).toContain('folder:collection-daze:playlist-collection-daze:')
  })

  it('broadcasts admin Orig BPM on track entities', () => {
    const seen: number[] = []
    const stop = subscribeCatalogSync((event) => {
      if (event.entity === 'track' && typeof event.patch.bpm === 'number') {
        seen.push(event.patch.bpm)
      }
    })
    emitCatalogSync({
      entity: 'track',
      entityId: '22222222-2222-2222-2222-222222222222',
      patch: { bpm: 128 },
    })
    stop()
    expect(seen).toEqual([128])
  })

  it('broadcasts edit-track catalog fields', () => {
    const seen: Array<{ title?: string; genre?: string }> = []
    const stop = subscribeCatalogSync((event) => {
      if (event.entity === 'track') {
        seen.push({ title: event.patch.title, genre: event.patch.genre })
      }
    })
    emitCatalogSync({
      entity: 'track',
      entityId: '22222222-2222-2222-2222-222222222222',
      patch: { title: 'Bird Talk', genre: 'Experimental Bass' },
    })
    stop()
    expect(seen).toEqual([{ title: 'Bird Talk', genre: 'Experimental Bass' }])
  })
})
