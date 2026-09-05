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
    expect(src).toMatch(/Staying(%20| )A(%20| )Vibe/)
    expect(src).toMatch(/staying-a-vibe-cover\.jpg/)
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
