import { describe, expect, it } from 'vitest'
import { filterVaultFolderTiles, playlistCompanionFolderId } from './filter-vault-folder-tiles'

describe('filterVaultFolderTiles', () => {
  it('maps playlist ids to companion folder ids', () => {
    expect(playlistCompanionFolderId('playlist-1787720929879')).toBe('1787720929879')
    expect(playlistCompanionFolderId('1787720929879')).toBe('1787720929879')
  })

  it('hides playlist companion folders from the vault grid', () => {
    const folders = [
      { id: 'folder-discography', name: 'Discography' },
      { id: '1787720929879', name: 'Happy Camper' },
    ]
    const playlists = [{ id: 'playlist-1787720929879', name: 'Happy Camper' }]
    expect(filterVaultFolderTiles(folders, playlists).map((f) => f.id)).toEqual(['folder-discography'])
  })

  it('hides Name (copy) when Name already exists as a playlist', () => {
    const folders = [
      { id: 'folder-discography', name: 'Discography' },
      { id: 'copy-1', name: 'Happy Camper (copy)' },
    ]
    const playlists = [{ id: 'playlist-1', name: 'Happy Camper' }]
    expect(filterVaultFolderTiles(folders, playlists).map((f) => f.name)).toEqual(['Discography'])
  })

  it('keeps an unrelated (copy) folder when no original exists', () => {
    const folders = [{ id: 'copy-1', name: 'Solo Draft (copy)' }]
    expect(filterVaultFolderTiles(folders, []).map((f) => f.name)).toEqual(['Solo Draft (copy)'])
  })
})
