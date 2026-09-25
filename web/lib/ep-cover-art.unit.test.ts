import { describe, expect, it } from 'vitest'
import {
  artworkResolutionScore,
  catalogArtworkForRelease,
  collectEpCoverTiles,
  collectReleaseCoverTiles,
  dedupeArtworkByReleaseLabel,
  isMusicVaultPath,
  mosaicVariantForPath,
  normalizeReleaseKey,
} from './ep-cover-art'

describe('ep-cover-art', () => {
  it('collects unique resolved EP covers', () => {
    const tiles = collectEpCoverTiles()
    const srcs = tiles.map((t) => t.src)
    expect(tiles.length).toBeGreaterThanOrEqual(11)
    expect(new Set(srcs).size).toBe(srcs.length)
    expect(tiles.every((t) => t.src && t.alt)).toBe(true)
    expect(tiles.some((t) => t.src.includes('Are%20We%20Awake') || t.src.includes('Are We Awake'))).toBe(true)
  })

  it('keeps a single Soul Candy cover and prefers the local master over Spotify', () => {
    const tiles = collectEpCoverTiles()
    const soul = tiles.filter((t) => normalizeReleaseKey(t.alt) === 'soul candy')
    expect(soul).toHaveLength(1)
    expect(soul[0]?.src).not.toMatch(/i\.scdn\.co/)
    expect(soul[0]?.src).toMatch(/Soul(%20| )Candy|57A67CAB/i)
    expect(artworkResolutionScore(soul[0]!.src)).toBeGreaterThan(
      artworkResolutionScore('https://i.scdn.co/image/ab67616d00001e02deb7fda8d70e348aaa078b3f'),
    )
  })

  it('prefers uploaded folder masters over legacy unreleased EP UUID files', () => {
    const folder = '/images/audio/artwork/folder-collection-unreleased-eps-sergik---soul-candy.jpg'
    const legacy =
      '/images/audio/unreleased/eps/SERGIK%20-%20Soul%20Candy/57A67CAB-0A23-4AB6-AE83-C840B0E0D3E4.jpeg'
    expect(artworkResolutionScore(folder)).toBeGreaterThan(artworkResolutionScore(legacy))
    const out = dedupeArtworkByReleaseLabel([
      { id: 'legacy', src: legacy, label: 'Soul Candy cover art' },
      { id: 'folder', src: folder, label: 'Soul Candy EP cover art' },
    ])
    expect(out).toHaveLength(1)
    expect(out[0]?.src).toContain('folder-collection-unreleased-eps-sergik---soul-candy.jpg')
  })

  it('keeps distinct covers that only share a generic Album label', () => {
    const out = dedupeArtworkByReleaseLabel([
      { id: 'a', src: '/images/audio/artwork/folder-1.jpg', label: 'Album cover art' },
      { id: 'b', src: '/images/audio/artwork/folder-2.jpg', label: 'Album cover art' },
      { id: 'c', src: '/images/audio/artwork/folder-daze.jpg', label: 'Daze cover art' },
      { id: 'd', src: '/images/audio/artwork/folder-daze-v2.jpg', label: 'Daze EP cover art' },
    ])
    expect(out).toHaveLength(3)
    expect(out.filter((x) => /folder-[12]\.jpg/.test(x.src))).toHaveLength(2)
    expect(out.filter((x) => /folder-daze/.test(x.src))).toHaveLength(1)
  })

  it('dedupes artwork choices by release label keeping highest resolution', () => {
    const out = dedupeArtworkByReleaseLabel([
      {
        id: 'spotify',
        src: 'https://i.scdn.co/image/ab67616d00001e02deb7fda8d70e348aaa078b3f',
        label: 'Soul Candy EP cover art',
      },
      {
        id: 'local',
        src: '/images/audio/unreleased/eps/SERGIK - Soul Candy/57A67CAB-0A23-4AB6-AE83-C840B0E0D3E4.jpeg',
        label: 'Soul Candy EP (Digital Download) cover art',
      },
    ])
    expect(out).toHaveLength(1)
    expect(out[0]?.id).toBe('local')
  })

  it('collects unique release covers for the music catalog mosaic', () => {
    const tiles = collectReleaseCoverTiles()
    const srcs = tiles.map((t) => t.src)
    expect(tiles.length).toBeGreaterThanOrEqual(collectEpCoverTiles().length)
    expect(new Set(srcs).size).toBe(srcs.length)
    expect(tiles.every((t) => t.src && t.alt)).toBe(true)
  })

  it('resolves catalog cover art from a folder name', () => {
    const src = catalogArtworkForRelease('Staying A Vibe')
    expect(src).toBeTruthy()
    expect(src).toMatch(/staying-a-vibe/i)
    expect(catalogArtworkForRelease('Staying A Vibe EP')).toBe(src)
    expect(catalogArtworkForRelease('unknown release')).toBeUndefined()
  })

  it('detects mosaic variants from the path', () => {
    expect(isMusicVaultPath('/music-library')).toBe(true)
    expect(isMusicVaultPath('/music-library/unlock')).toBe(true)
    expect(isMusicVaultPath('/music')).toBe(false)
    expect(isMusicVaultPath(null)).toBe(false)
    expect(mosaicVariantForPath('/music-library')).toBe('vault')
    expect(mosaicVariantForPath('/music')).toBe('music')
    expect(mosaicVariantForPath('/music/soul-candy')).toBe('music')
    expect(mosaicVariantForPath('/shop')).toBe('gallery')
  })
})
