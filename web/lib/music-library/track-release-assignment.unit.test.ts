import { describe, expect, it } from 'vitest'
import {
  buildTrackFolderMembershipMap,
  releaseFolderTypeMap,
  trackEpReleaseNames,
  trackReleaseBadgeFlags,
} from '@/lib/music-library/track-release-assignment'

describe('trackReleaseBadgeFlags', () => {
  const releaseFolderTypes = {
    'folder-ep-1': 'ep',
    'folder-crate-1': 'album',
    'folder-playlist-dump': 'folder',
  }
  const releaseCatalogTiles = [
    { id: 'folder-ep-1', name: 'Vice & Virtues', type: 'ep' },
    { id: 'folder-crate-1', name: 'Feelin Sendy', type: 'album' },
  ]
  const playlistCompanionFolderIds = new Set(['folder-playlist-dump'])

  it('marks EP from metadata album_type even when folder is a playlist dump', () => {
    const flags = trackReleaseBadgeFlags(
      {
        folderId: 'folder-playlist-dump',
        album: 'Vice & Virtues',
        albumType: 'ep',
      },
      { releaseFolderTypes, releaseCatalogTiles, playlistCompanionFolderIds },
    )
    expect(flags).toEqual({ ep: true, crate: false })
  })

  it('marks crate from folder_id and from album name match', () => {
    expect(
      trackReleaseBadgeFlags(
        { folderId: 'folder-crate-1', album: 'Feelin Sendy' },
        { releaseFolderTypes, releaseCatalogTiles },
      ),
    ).toEqual({ ep: false, crate: true })
  })

  it('can show both EP and crate when membership map says so', () => {
    const membershipByTrackId = new Map([
      ['t-1', { ep: true, crate: true }],
    ])
    expect(
      trackReleaseBadgeFlags(
        { id: 't-1', album: 'Vice & Virtues', albumType: 'ep' },
        { releaseFolderTypes, releaseCatalogTiles, membershipByTrackId },
      ),
    ).toEqual({ ep: true, crate: true })
  })

  it('membership map marks both EP and crate for the same track id', () => {
    const map = buildTrackFolderMembershipMap(
      {
        'folder-ep-1': [{ id: 't-1' }],
        'folder-crate-1': [{ id: 't-1' }],
      },
      releaseFolderTypes,
    )
    expect(map.get('t-1')).toEqual({ ep: true, crate: true })
  })

  it('builds release folder type map from albums and folder meta', () => {
    const map = releaseFolderTypeMap(
      [{ id: 'a1', type: 'ep' }],
      { b1: { type: 'album' } },
    )
    expect(map).toEqual({ a1: 'ep', b1: 'album' })
  })

  it('resolves EP release names from folder and membership', () => {
    expect(
      trackEpReleaseNames(
        { id: 't-1', folderId: 'folder-ep-1' },
        { releaseFolderTypes, releaseCatalogTiles },
      ),
    ).toEqual(['Vice & Virtues'])
    expect(
      trackEpReleaseNames(
        { id: 't-2', album: 'Vice & Virtues', albumType: 'ep' },
        { releaseFolderTypes, releaseCatalogTiles },
      ),
    ).toEqual(['Vice & Virtues'])
  })
})
