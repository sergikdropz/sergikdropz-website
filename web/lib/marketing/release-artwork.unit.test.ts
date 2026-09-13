import { describe, expect, it } from 'vitest'
import { applyLibraryArtwork, releaseArtworkKey } from './release-artwork'

describe('releaseArtworkKey', () => {
  it('collapses EP titles, folder ids, and release slugs', () => {
    expect(releaseArtworkKey('SERGIK - Daze')).toBe('daze')
    expect(releaseArtworkKey('Daze EP (Digital Download)')).toBe('daze')
    expect(releaseArtworkKey('collection-unreleased-eps-sergik---daze-')).toBe('daze')
    expect(releaseArtworkKey('staying-a-vibe')).toBe('stayingavibe')
    expect(releaseArtworkKey('Staying A Vibe EP')).toBe('stayingavibe')
  })
})

describe('applyLibraryArtwork', () => {
  it('overlays shop products with uploaded library covers', () => {
    const live = new Map([
      ['daze', '/images/audio/artwork/folder-collection-unreleased-eps-sergik---daze.jpg'],
    ])
    const next = applyLibraryArtwork(
      [{ title: 'Daze EP (Digital Download)', release_id: 'daze', artwork: '/old.png' }],
      live,
    )
    expect(next[0].artwork).toContain('folder-collection-unreleased-eps-sergik---daze.jpg')
  })

  it('leaves static artwork when the library cover is the old unreleased path', () => {
    const live = new Map([
      ['ftp', '/images/audio/unreleased/eps/SERGIK%20-%20FTP/cover.jpeg'],
    ])
    const product = { title: 'FTP EP', release_id: 'ftp', artwork: '/shop-ftp.jpeg' }
    expect(applyLibraryArtwork([product], live)[0].artwork).toBe('/shop-ftp.jpeg')
  })
})
