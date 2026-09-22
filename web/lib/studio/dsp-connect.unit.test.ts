import { describe, expect, it } from 'vitest'
import { ALL_DSP_STORE_IDS, DSP_STORES } from '@/lib/studio/constants'
import {
  buildDspCoverage,
  buildStoreSearchUrl,
  deriveSecondaryDspLinks,
  dspConnectHint,
  formatDspCoverageSummary,
  iheartUrlFromTidal,
  mapOdesliPlatform,
  mergeResolvedLinks,
  normalizeIsrc,
  normalizeUpc,
  parseKnownStoreUrl,
  parseOdesliLinks,
  pickLookupSeeds,
  planFillMissingStoreLinks,
  titlesMatch,
  appleMusicIdFromUrl,
  shazamUrlFromAppleMusic,
  tidalAlbumIdFromUrl,
  connectReleaseToDsps,
} from '@/lib/studio/dsp-connect'

const odesliPayload = {
  pageUrl: 'https://song.link/s/abc',
  linksByPlatform: {
    itunes: { url: 'https://music.apple.com/us/album/itunes-fallback' },
    appleMusic: { url: 'https://music.apple.com/us/album/live' },
    spotify: { url: 'https://open.spotify.com/album/1' },
    youtube: { url: 'https://www.youtube.com/watch?v=abc123defgh' },
    youtubeMusic: { url: 'https://music.youtube.com/watch?v=abc123defgh' },
    amazonMusic: { url: 'https://music.amazon.com/albums/B0EXAMPLE' },
    pandora: { url: 'https://www.pandora.com/artist/sergik/album/xyz' },
    tidal: { url: 'https://tidal.com/album/1' },
    anghami: { url: 'https://play.anghami.com/album/1' },
    boomplay: { url: 'https://www.boomplay.com/albums/1' },
  },
}

describe('DSP identifier helpers', () => {
  it('normalizes ISRCs and UPCs', () => {
    expect(normalizeIsrc('qz-da1-26-00001')).toBe('QZDA12600001')
    expect(normalizeIsrc('short')).toBeUndefined()
    expect(normalizeUpc('1 23456 789012')).toBe('123456789012')
    expect(normalizeUpc('123')).toBeUndefined()
  })

  it('maps Odesli platforms onto studio stores', () => {
    expect(mapOdesliPlatform('appleMusic')).toBe('apple_music')
    expect(mapOdesliPlatform('youtubeMusic')).toBe('youtube_music')
    expect(mapOdesliPlatform('amazonStore')).toBe('amazon')
    expect(mapOdesliPlatform('pandora')).toBe('pandora')
    expect(mapOdesliPlatform('anghami')).toBe('anghami')
    expect(mapOdesliPlatform('boomplay')).toBe('boomplay')
    expect(mapOdesliPlatform('yandex')).toBeNull()
  })

  it('parses known store URLs', () => {
    expect(parseKnownStoreUrl('https://open.spotify.com/album/2zkqOMl5kMNdTvev330BGY')).toMatchObject({
      store: 'spotify',
      source: 'seed',
    })
    expect(parseKnownStoreUrl('https://www.shazam.com/song/123')).toMatchObject({ store: 'shazam' })
    expect(parseKnownStoreUrl('https://www.pandora.com/artist/sergik/ARz95KfVdbj3P5Z')).toMatchObject({
      store: 'pandora',
    })
    expect(parseKnownStoreUrl('https://www.traxsource.com/artist/sergik/1')).toMatchObject({
      store: 'traxsource',
    })
    expect(parseKnownStoreUrl('https://www.mixcloud.com/sergikdropz')).toMatchObject({
      store: 'mixcloud',
    })
    expect(parseKnownStoreUrl('http://www.amazon.com/gp/product/B0D9BGZDWK/?tag=distrokid06-20')).toMatchObject({
      store: 'amazon',
    })
    expect(parseKnownStoreUrl('https://www.iheart.com/artist/id-36587473/albums/id-278836343')).toMatchObject({
      store: 'iheart',
    })
    expect(parseKnownStoreUrl('https://example.com/x')).toBeNull()
  })

  it('derives a Shazam album page from Apple Music', () => {
    expect(appleMusicIdFromUrl('https://music.apple.com/us/album/soul-candy-ep/1796383233')).toBe(
      '1796383233'
    )
    expect(shazamUrlFromAppleMusic('https://music.apple.com/us/album/soul-candy-ep/1796383233')).toBe(
      'https://www.shazam.com/album/1796383233'
    )
  })

  it('derives iHeart album URLs from Tidal album ids', () => {
    expect(tidalAlbumIdFromUrl('https://tidal.com/album/278836343')).toBe('278836343')
    expect(
      iheartUrlFromTidal(
        'https://tidal.com/album/278836343',
        'https://www.iheart.com/artist/id-36587473/'
      )
    ).toBe('https://www.iheart.com/artist/id-36587473/albums/id-278836343')
    expect(iheartUrlFromTidal('https://tidal.com/album/278836343')).toBe(
      'https://www.iheart.com/album/278836343/'
    )
  })

  it('matches release titles across EP suffixes', () => {
    expect(titlesMatch('Soul Candy', 'Soul Candy - EP')).toBe(true)
    expect(titlesMatch('Soul Candy', 'Night Drive')).toBe(false)
  })
})

describe('parseOdesliLinks', () => {
  it('prefers Apple Music streaming over iTunes storefront', () => {
    const parsed = parseOdesliLinks(odesliPayload)
    expect(parsed.pageUrl).toBe('https://song.link/s/abc')
    expect(parsed.links.find((link) => link.store === 'apple_music')?.url).toBe(
      'https://music.apple.com/us/album/live'
    )
    expect(parsed.links.map((link) => link.store)).toEqual([
      'spotify',
      'apple_music',
      'youtube_music',
      'youtube',
      'amazon',
      'tidal',
      'pandora',
      'boomplay',
      'anghami',
    ])
  })
})

describe('mergeResolvedLinks', () => {
  it('prefers Spotify catalog URLs over pasted copies', () => {
    const merged = mergeResolvedLinks([
      [{ store: 'spotify', url: 'https://open.spotify.com/track/seed', source: 'seed' }],
      [{ store: 'spotify', url: 'https://open.spotify.com/track/catalog', source: 'spotify' }],
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({
      store: 'spotify',
      url: 'https://open.spotify.com/track/catalog',
      source: 'spotify',
    })
  })
})

describe('pickLookupSeeds', () => {
  it('collects the first valid ISRC and HTTP URLs', () => {
    const seeds = pickLookupSeeds({
      upc: '123456789012',
      isrcs: ['bad', 'USRC17607839'],
      seedUrl: 'https://open.spotify.com/track/1',
      existingUrls: ['not-a-url', 'https://music.apple.com/us/album/2'],
    })
    expect(seeds).toEqual({
      urls: ['https://open.spotify.com/track/1', 'https://music.apple.com/us/album/2'],
      isrc: 'USRC17607839',
      upc: '123456789012',
    })
    expect(dspConnectHint({ urls: [] })).toMatch(/ISRC, UPC/)
    expect(dspConnectHint(seeds)).toMatch(/ISRC USRC17607839/)
  })
})

describe('connectReleaseToDsps', () => {
  it('keeps a pasted Spotify URL and enriches Apple Music + Deezer', async () => {
    const result = await connectReleaseToDsps(
      {
        seedUrl: 'https://open.spotify.com/album/2zkqOMl5kMNdTvev330BGY',
        title: 'Soul Candy',
      },
      {
        fetchImpl: async (input) => {
          const url = String(input)
          if (url.includes('open.spotify.com/oembed')) {
            return new Response(JSON.stringify({ title: 'Soul Candy' }), { status: 200 })
          }
          if (url.includes('itunes.apple.com')) {
            return new Response(
              JSON.stringify({
                results: [
                  {
                    artistName: 'Sergik',
                    collectionName: 'Soul Candy - EP',
                    collectionViewUrl: 'https://music.apple.com/us/album/soul-candy-ep/1796383233',
                  },
                ],
              }),
              { status: 200 }
            )
          }
          if (url.includes('api.deezer.com')) {
            return new Response(
              JSON.stringify({
                data: [
                  {
                    title: 'Soul Candy',
                    artist: { name: 'Sergik' },
                    link: 'https://www.deezer.com/album/711004781',
                  },
                ],
              }),
              { status: 200 }
            )
          }
          return new Response('{}', { status: 404 })
        },
      }
    )

    expect(result.links.map((link) => link.store)).toEqual(
      expect.arrayContaining([
        'spotify',
        'apple_music',
        'deezer',
        'shazam',
        'youtube',
        'youtube_music',
        'soundcloud',
        'instagram',
        'beatport',
        'amazon',
        'tidal',
        'tiktok',
        'pandora',
      ])
    )
    expect(result.links.find((link) => link.store === 'beatport')?.url).toContain('beatport.com/artist/sergik')
    expect(result.links.find((link) => link.store === 'pandora')?.url).toContain('pandora.com/artist/sergik')
    expect(result.notes.some((note) => note.includes('Bandcamp'))).toBe(true)
    expect(result.notes.some((note) => note.includes('Traxsource'))).toBe(true)
    expect(result.notes.some((note) => note.includes('Mixcloud'))).toBe(true)
    expect(result.catalog?.length).toBeGreaterThan(20)
    expect(result.providers.musicbrainz).toBe(true)
    expect(result.coverage.total).toBe(ALL_DSP_STORE_IDS.length)
    expect(result.coverage.rows).toHaveLength(33)
    expect(result.targetStores).toEqual([...ALL_DSP_STORE_IDS])
    expect(result.coverage.accounted).toBe(
      result.coverage.live +
        result.coverage.linked +
        result.coverage.artist +
        result.coverage.b2b
    )
    expect(result.notes[0]).toMatch(/33 targets/)
  })

  it('fans out MusicBrainz url-rels onto studio stores', async () => {
    const result = await connectReleaseToDsps(
      {
        upc: '198669278325',
        title: 'FTP',
      },
      {
        fetchImpl: async (input) => {
          const url = String(input)
          if (url.includes('musicbrainz.org/ws/2/release/?query=barcode:')) {
            return new Response(JSON.stringify({ releases: [{ id: 'mbid-ftp' }] }), { status: 200 })
          }
          if (url.includes('musicbrainz.org/ws/2/release/mbid-ftp')) {
            return new Response(
              JSON.stringify({
                relations: [
                  { url: { resource: 'https://open.spotify.com/album/2NkWmlDlwoFYpM2foerkHH' } },
                  { url: { resource: 'https://www.deezer.com/album/615102062' } },
                  { url: { resource: 'https://tidal.com/album/278836343' } },
                  { url: { resource: 'https://www.qobuz.com/album/ftp' } },
                ],
              }),
              { status: 200 }
            )
          }
          if (url.includes('itunes.apple.com') || url.includes('api.deezer.com')) {
            return new Response(JSON.stringify({ results: [], data: [] }), { status: 200 })
          }
          return new Response('{}', { status: 404 })
        },
      }
    )

    expect(result.links.find((l) => l.store === 'spotify')?.source).toBe('musicbrainz')
    expect(result.links.find((l) => l.store === 'tidal')?.source).toBe('musicbrainz')
    expect(result.links.find((l) => l.store === 'qobuz')?.url).toContain('qobuz.com')
    expect(result.links.find((l) => l.store === 'iheart')?.url).toContain('iheart.com')
    expect(result.links.find((l) => l.store === 'iheart')?.source).toBe('derived')
  })
})

describe('deriveSecondaryDspLinks', () => {
  it('adds iHeart from Tidal and Shazam from Apple', () => {
    const derived = deriveSecondaryDspLinks([
      {
        store: 'apple_music',
        url: 'https://music.apple.com/us/album/soul-candy-ep/1796383233',
        source: 'itunes',
      },
      { store: 'tidal', url: 'https://tidal.com/album/278836343', source: 'odesli' },
    ])
    expect(derived.find((l) => l.store === 'shazam')?.url).toContain('1796383233')
    expect(derived.find((l) => l.store === 'iheart')?.url).toContain('278836343')
  })
})

describe('buildDspCoverage', () => {
  it('covers all 33 DSP targets; bare URLs are linked until verified live', () => {
    expect(DSP_STORES).toHaveLength(33)
    const coverage = buildDspCoverage([
      {
        store: 'spotify',
        url: 'https://open.spotify.com/album/1',
        source: 'spotify',
        verification_status: 'live',
      },
      {
        store: 'apple_music',
        url: 'https://music.apple.com/us/album/x/1',
        source: 'odesli',
      },
      { store: 'beatport', url: 'https://www.beatport.com/artist/sergik/1', source: 'artist' },
    ])
    expect(coverage.total).toBe(33)
    expect(coverage.rows).toHaveLength(33)
    expect(coverage.live).toBe(1)
    expect(coverage.linked).toBe(1)
    expect(coverage.artist).toBe(1)
    expect(coverage.b2b).toBeGreaterThanOrEqual(5)
    expect(coverage.needs_paste).toBe(coverage.total - coverage.accounted)
    expect(coverage.rows.find((r) => r.id === 'medianet')?.kind).toBe('b2b')
    expect(coverage.rows.find((r) => r.id === 'bandcamp')?.kind).toBe('needs_paste')
    expect(coverage.rows.find((r) => r.id === 'iheart')?.kind).toBe('needs_paste')
    expect(coverage.rows.find((r) => r.id === 'apple_music')?.kind).toBe('linked')
    expect(formatDspCoverageSummary(coverage)).toMatch(/^33 targets ·/)
    expect(coverage.rows.map((r) => r.id).sort()).toEqual([...ALL_DSP_STORE_IDS].sort())
  })
})

describe('planFillMissingStoreLinks', () => {
  it('fills every missing DSP with artist, search, or B2B hub', () => {
    const links = planFillMissingStoreLinks({
      existingStores: ['spotify', 'apple_music'],
      title: 'FTP',
      artist: 'SERGIK',
      songLinkUrl: 'https://album.link/s/ftp',
      sergikMusicUrl: 'https://sergikdropz.com/music/release-ftp',
    })
    expect(links.length).toBe(ALL_DSP_STORE_IDS.length - 2)
    expect(links.find((l) => l.store === 'spotify')).toBeUndefined()
    expect(links.find((l) => l.store === 'beatport')?.source).toBe('artist')
    expect(links.find((l) => l.store === 'bandcamp')?.platform).toBe('search')
    expect(links.find((l) => l.store === 'medianet')?.platform).toBe('b2b_hub')
    expect(links.find((l) => l.store === 'medianet')?.url).toContain('album.link')
    expect(buildStoreSearchUrl('qobuz', 'SERGIK', 'FTP')).toContain('qobuz.com')
  })
})
