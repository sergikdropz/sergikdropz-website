import { describe, expect, it, vi } from 'vitest'
import {
  parseSpotifyAlbumId,
  parseSpotifyTrackId,
  studioReleaseIdFromStoreUrl,
  summarizeStoreUrlDraft,
  resolveStoreUrlToReleaseDraft,
} from '@/lib/studio/store-url-import'

describe('store URL import helpers', () => {
  it('parses Spotify album and track ids', () => {
    expect(parseSpotifyAlbumId('https://open.spotify.com/album/2zkqOMl5kMNdTvev330BGY')).toBe(
      '2zkqOMl5kMNdTvev330BGY',
    )
    expect(parseSpotifyTrackId('https://open.spotify.com/track/abc123XYZ')).toBe('abc123XYZ')
    expect(studioReleaseIdFromStoreUrl('https://open.spotify.com/album/2zkqOMl5kMNdTvev330BGY')).toMatch(
      /^release-url-spotify-2zkq/,
    )
  })

  it('rejects non Spotify/Apple seeds', async () => {
    await expect(
      resolveStoreUrlToReleaseDraft('https://example.com/album/1', {
        fetchImpl: vi.fn() as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/Spotify or Apple Music/)
  })

  it('builds a draft from Apple Music / iTunes lookup', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('itunes.apple.com/lookup')) {
        return {
          ok: true,
          json: async () => ({
            results: [
              {
                wrapperType: 'collection',
                collectionName: 'Soul Candy - EP',
                artistName: 'SERGIK',
                releaseDate: '2025-03-01T00:00:00Z',
                upc: '198704123456',
                artworkUrl100: 'https://example.com/100x100bb.jpg',
              },
              {
                wrapperType: 'track',
                kind: 'song',
                trackName: 'Soul Candy',
                trackNumber: 1,
                isrc: 'QZES72569811',
                trackTimeMillis: 210000,
                artistName: 'SERGIK',
              },
              {
                wrapperType: 'track',
                kind: 'song',
                trackName: 'Night Drive',
                trackNumber: 2,
                isrc: 'QZES72569812',
                trackTimeMillis: 200000,
                artistName: 'SERGIK',
              },
            ],
          }),
        } as Response
      }
      return { ok: false, json: async () => ({}) } as Response
    }) as unknown as typeof fetch

    const draft = await resolveStoreUrlToReleaseDraft(
      'https://music.apple.com/us/album/soul-candy-ep/1796383233',
      { fetchImpl },
    )

    expect(draft.previously_released).toBe(true)
    expect(draft.title).toMatch(/Soul Candy/i)
    expect(draft.upc).toBe('198704123456')
    expect(draft.tracks).toHaveLength(2)
    expect(draft.tracks[0].isrc_full).toBe('QZES72569811')
    expect(draft.marketing_meta.source).toBe('store_url')

    const summary = summarizeStoreUrlDraft(draft)
    expect(summary.withIsrc).toBe(2)
    expect(summary.upc).toBe('198704123456')
  })
})
