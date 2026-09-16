import { describe, expect, it } from 'vitest'
import {
  albumReleaseType,
  isoDuration,
  musicAlbumJsonLd,
  seoDescriptionFromCopy,
  storeLinkToPlatform,
} from '@/lib/marketing/music-seo'

describe('isoDuration', () => {
  it('formats minutes and seconds', () => {
    expect(isoDuration(204)).toBe('PT3M24S')
    expect(isoDuration(0)).toBeUndefined()
  })
})

describe('seoDescriptionFromCopy', () => {
  it('prefers elevator pitch and stays under 160 chars', () => {
    const desc = seoDescriptionFromCopy({
      title: 'Night Drive',
      elevator: 'Late-night house for warehouse systems.',
      description: 'A longer press blurb that should not win.',
    })
    expect(desc).toBe('Late-night house for warehouse systems.')
    expect(desc.length).toBeLessThanOrEqual(160)
  })
})

describe('musicAlbumJsonLd', () => {
  it('emits MusicAlbum + MusicRecording with ISRC', () => {
    const json = musicAlbumJsonLd({
      siteUrl: 'https://sergikdropz.com',
      id: 'night-drive',
      title: 'Night Drive',
      type: 'ep',
      genre: 'House',
      subgenre: 'Melodic House',
      releaseDate: '2024-01-01',
      upc: '123456789012',
      tracks: [{ title: 'Neon', duration: 204, isrc: 'QZ1234567890' }],
      storeLinks: [{ store: 'spotify', url: 'https://open.spotify.com/album/x', label: 'Spotify' }],
    })
    expect(json['@type']).toBe('MusicAlbum')
    expect(json.albumReleaseType).toBe('EPRelease')
    expect(albumReleaseType('single')).toBe('SingleRelease')
    expect(json.track?.[0]?.['@type']).toBe('MusicRecording')
    expect(json.track?.[0]?.isrcCode).toBe('QZ1234567890')
    expect(json.sameAs).toContain('https://open.spotify.com/album/x')
    expect(storeLinkToPlatform('apple_music').label).toBe('Apple Music')
  })
})
