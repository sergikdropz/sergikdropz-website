import { describe, expect, it } from 'vitest'
import {
  assembleSmartLinkLanding,
  resolveSmartLinkTarget,
  smartLinkGoHref,
} from '@/lib/smartlinks/landing'

const walk = {
  slug: 'presave-walk',
  title: 'Pre-save: Walk That Walk',
  destinationUrl: 'https://open.spotify.com/artist/7MnvMhWoSe4wYXuiI6iQ8H',
  release: {
    id: 'release-1',
    title: 'Walk That Walk',
    artist: 'SERGIK x Breauxx',
    artworkUrl: 'https://cdn.example/cover.jpg',
    releaseDate: '2026-10-30',
    elevator: 'Funky house for the room.',
  },
  stores: [
    { store: 'spotify', url: 'https://open.spotify.com/artist/7MnvMhWoSe4wYXuiI6iQ8H' },
    { store: 'apple_music', url: 'https://music.apple.com/us/album/walk-that-walk-ep/6827013965' },
    { store: 'qobuz', url: 'https://www.qobuz.com/us-en/search?q=Walk' },
    { store: 'shazam', url: 'https://www.shazam.com/album/6827013965' },
    { store: 'kuack_media', url: 'http://127.0.0.1:3001/music/release-1' },
    { store: 'amazon', url: 'https://music.amazon.com/artists/B09B2LNNSF/sergik' },
  ],
  shareToken: 'tok_123',
  now: new Date(2026, 9, 30),
}

describe('smart link landing', () => {
  it('pins Spotify, Apple Music, and the site listen link ahead of other release pages', () => {
    const page = assembleSmartLinkLanding(walk)
    expect(page.title).toBe('Walk That Walk')
    expect(page.artist).toBe('SERGIK x Breauxx')
    expect(page.kind).toBe('listen')
    expect(page.description).toBe('Funky house for the room.')
    expect(page.destinations.map((dest) => dest.id)).toEqual([
      'site',
      'spotify',
      'apple_music',
      'shazam',
      'amazon',
      'qobuz',
    ])
    expect(page.destinations.some((dest) => dest.id === 'kuack_media')).toBe(false)
    expect(page.destinations.find((dest) => dest.id === 'spotify')).toMatchObject({
      label: 'Spotify',
      kind: 'artist',
      href: 'https://open.spotify.com/artist/7MnvMhWoSe4wYXuiI6iQ8H',
      embedUrl: 'https://open.spotify.com/embed/artist/7MnvMhWoSe4wYXuiI6iQ8H?utm_source=generator&theme=0',
      embedHeight: 352,
    })
    expect(page.destinations.find((dest) => dest.id === 'apple_music')).toMatchObject({
      label: 'Apple Music',
      kind: 'release',
      embedUrl: 'https://embed.music.apple.com/us/album/walk-that-walk-ep/6827013965',
    })
    expect(page.destinations[0]).toEqual({
      id: 'site',
      label: 'SERGIK',
      href: '/s/tok_123',
      kind: 'site',
      embedUrl: '/embed/tok_123',
      embedHeight: 560,
    })
  })

  it('prefers a Spotify album over the artist profile when both exist', () => {
    const page = assembleSmartLinkLanding({
      ...walk,
      stores: [
        { store: 'spotify', url: 'https://open.spotify.com/artist/7MnvMhWoSe4wYXuiI6iQ8H' },
        { store: 'spotify', url: 'https://open.spotify.com/album/abc' },
        { store: 'apple_music', url: 'https://music.apple.com/us/album/walk-that-walk-ep/6827013965' },
      ],
    })
    expect(page.destinations.find((dest) => dest.id === 'spotify')).toMatchObject({
      id: 'spotify',
      href: 'https://open.spotify.com/album/abc',
      kind: 'release',
      embedUrl: 'https://open.spotify.com/embed/album/abc?utm_source=generator&theme=0',
    })
  })

  it('falls back to the music page when there is no share token', () => {
    const page = assembleSmartLinkLanding({ ...walk, shareToken: null })
    const site = page.destinations.find((dest) => dest.id === 'site')
    expect(site?.href).toBe('/music/release-1')
    expect(site?.embedUrl).toBeNull()
  })

  it('keeps a lone destination when the link has no release', () => {
    const page = assembleSmartLinkLanding({
      slug: 'drop',
      title: 'Listen: Night Drive',
      destinationUrl: 'https://open.spotify.com/album/night',
    })
    expect(page.title).toBe('Night Drive')
    expect(page.destinations).toEqual([
      {
        id: 'spotify',
        label: 'Spotify',
        href: 'https://open.spotify.com/album/night',
        kind: 'release',
        embedUrl: 'https://open.spotify.com/embed/album/night?utm_source=generator&theme=0',
        embedHeight: 352,
      },
    ])
  })

  it('builds a tracked go link and only allows http or site paths', () => {
    expect(
      smartLinkGoHref('presave-walk', 'spotify', { utm_source: 'instagram', unused: 'no' }),
    ).toBe('/api/go/presave-walk?dest=spotify&utm_source=instagram')
    expect(resolveSmartLinkTarget('/s/tok', 'http://localhost:3001')).toBe('http://localhost:3001/s/tok')
    expect(resolveSmartLinkTarget('https://music.apple.com/us/album/walk/1', 'http://localhost:3001')).toBe(
      'https://music.apple.com/us/album/walk/1',
    )
    expect(resolveSmartLinkTarget('javascript:alert(1)', 'http://localhost:3001')).toBeNull()
    expect(resolveSmartLinkTarget('http://127.0.0.1:3001/music/x', 'https://sergikdropz.com')).toBeNull()
  })
})
