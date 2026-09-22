import { describe, expect, it } from 'vitest'
import {
  indexVaultLinks,
  isStudioVaultEpFolderType,
  isStudioVaultImportFolderType,
  isStudioVaultLibraryFolderType,
  studioVaultCatalogKind,
  studioVaultCatalogLabel,
  vaultLinkForTrack,
  vaultTrackAvailability,
} from '@/lib/studio/vault-picker'

describe('vaultTrackAvailability', () => {
  const links = indexVaultLinks([
    { music_library_track_id: 'a', release_id: 'rel-1', release_title: 'Alpha' },
    { music_library_track_id: 'b', release_id: 'rel-2', release_title: 'In The Streets' },
    { music_library_track_id: 'c', release_id: null },
  ])

  it('treats unlinked and unassigned dist rows as available', () => {
    expect(vaultTrackAvailability('c', 'rel-1', links)).toBe('available')
    expect(vaultTrackAvailability('z', 'rel-1', links)).toBe('available')
  })

  it('hides tracks already on this release', () => {
    expect(vaultTrackAvailability('a', 'rel-1', links)).toBe('on_this_release')
  })

  it('flags tracks parked on another release', () => {
    expect(vaultTrackAvailability('b', 'rel-1', links)).toBe('on_other_release')
    expect(vaultLinkForTrack('b', links)?.releaseTitle).toBe('In The Streets')
  })
})

describe('studio vault catalog types', () => {
  it('treats crate and typed-single tracks as singles, EPs as EPs', () => {
    expect(isStudioVaultLibraryFolderType('album')).toBe(true)
    expect(isStudioVaultLibraryFolderType('ep')).toBe(true)
    expect(isStudioVaultLibraryFolderType('playlist')).toBe(false)
    expect(isStudioVaultImportFolderType('album')).toBe(false)
    expect(isStudioVaultImportFolderType('ep')).toBe(true)
    expect(isStudioVaultEpFolderType('ep')).toBe(true)
    expect(isStudioVaultEpFolderType('remix')).toBe(true)
    expect(isStudioVaultEpFolderType('album')).toBe(false)
    expect(studioVaultCatalogKind('album')).toBe('single')
    expect(studioVaultCatalogKind('single')).toBe('single')
    expect(studioVaultCatalogKind('ep')).toBe('ep')
    expect(studioVaultCatalogKind('remix')).toBe('ep')
    expect(studioVaultCatalogLabel('album')).toBe('Single')
    expect(studioVaultCatalogLabel('ep')).toBe('EP')
  })
})
