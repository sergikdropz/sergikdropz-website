import { describe, expect, it } from 'vitest'
import {
  buildReleasePackageSeeds,
  generateCatalogNumber,
  normalizeIpi,
  normalizeIswc,
  parseAppleMusicArtistId,
  parseFacebookPage,
  parseInstagramHandle,
  parseSpotifyArtistId,
  parseYoutubeChannelId,
} from '@/lib/studio/dsp-package'

describe('DSP artist IDs', () => {
  it('parses Spotify and Apple artist URLs', () => {
    expect(parseSpotifyArtistId('https://open.spotify.com/artist/7MnvMhWoSe4wYXuiI6iQ8H')).toBe(
      '7MnvMhWoSe4wYXuiI6iQ8H',
    )
    expect(parseAppleMusicArtistId('https://music.apple.com/us/artist/sergik/1577778284')).toBe(
      '1577778284',
    )
    expect(parseYoutubeChannelId('https://music.youtube.com/channel/UCBWcROfNv8PeY6KdrnNM_pw')).toBe(
      'UCBWcROfNv8PeY6KdrnNM_pw',
    )
    expect(parseInstagramHandle('https://instagram.com/sergikdropz')).toBe('sergikdropz')
    expect(parseFacebookPage('https://www.facebook.com/sergikdropz')).toBe('sergikdropz')
  })
})

describe('composition identifiers', () => {
  it('normalizes IPI/CAE and ISWC', () => {
    expect(normalizeIpi('123456789')).toBe('00123456789')
    expect(normalizeIpi('bad')).toBeNull()
    expect(normalizeIswc('T0034567891')).toBe('T-003.456.789-1')
    expect(normalizeIswc('T-003.456.789-1')).toBe('T-003.456.789-1')
    expect(normalizeIswc('nope')).toBeNull()
  })
})

describe('buildReleasePackageSeeds', () => {
  it('fills album artist, catalog number, notices, and DSP ids without overwriting', () => {
    const seed = buildReleasePackageSeeds(
      {
        title: 'Are We Awake?',
        label_name: 'SERGIKdropz',
        release_date: '2026-01-01',
      },
      {
        upc: '0199991234564',
        spotifyArtistId: 'https://open.spotify.com/artist/7MnvMhWoSe4wYXuiI6iQ8H',
        appleArtistId: 'https://music.apple.com/us/artist/sergik/1577778284',
      },
    )
    expect(seed.album_artist).toBe('SERGIKdropz')
    expect(seed.upc).toBe('0199991234564')
    expect(seed.original_release_date).toBe('2026-01-01')
    expect(seed.catalog_number).toBe(generateCatalogNumber('Are We Awake?', 2026))
    expect(seed.p_line_year).toBe(2026)
    expect(seed.c_line_year).toBe(2026)
    expect(seed.spotify_artist_id).toBe('7MnvMhWoSe4wYXuiI6iQ8H')
    expect(seed.apple_artist_id).toBe('1577778284')
  })

  it('seeds YouTube, Instagram, and Facebook from profile URLs', () => {
    const seed = buildReleasePackageSeeds(
      { title: 'Are We Awake?', label_name: 'SERGIKdropz' },
      {
        youtubeArtistId: 'https://music.youtube.com/channel/UCBWcROfNv8PeY6KdrnNM_pw',
        instagramHandle: 'https://instagram.com/sergikdropz',
        facebookPageId: 'https://www.facebook.com/sergikdropz',
      },
    )
    expect(seed.youtube_artist_id).toBe('UCBWcROfNv8PeY6KdrnNM_pw')
    expect(seed.instagram_handle).toBe('sergikdropz')
    expect(seed.facebook_page_id).toBe('sergikdropz')
  })

  it('keeps existing package fields', () => {
    const seed = buildReleasePackageSeeds({
      album_artist: 'SERGIK x OG Coconut',
      label_name: 'SERGIKdropz',
      upc: '123',
      catalog_number: 'KEEP',
      p_line_year: 2024,
      c_line_year: 2024,
      spotify_artist_id: '7MnvMhWoSe4wYXuiI6iQ8H',
      apple_artist_id: '1577778284',
    })
    expect(seed).toEqual({})
  })
})
