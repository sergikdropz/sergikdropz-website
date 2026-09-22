import { describe, expect, it, vi } from 'vitest'
import {
  classifyStoreUrl,
  defaultVerificationForNewLink,
  isReleaseLiveOnStore,
  summarizeDspVerifyResults,
  verifyStoreLink,
} from '@/lib/studio/dsp-verify'

describe('classifyStoreUrl', () => {
  it('classifies Spotify album vs artist', () => {
    expect(classifyStoreUrl('spotify', 'https://open.spotify.com/album/2NkWmlDlwoFYpM2foerkHH')).toBe(
      'album'
    )
    expect(classifyStoreUrl('spotify', 'https://open.spotify.com/artist/0TnOYISbd1XYRBk9myaseg')).toBe(
      'artist'
    )
    expect(classifyStoreUrl('spotify', 'https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl')).toBe(
      'track'
    )
  })

  it('classifies Apple Music album vs artist', () => {
    expect(
      classifyStoreUrl('apple_music', 'https://music.apple.com/us/album/midnight/1440857781')
    ).toBe('album')
    expect(
      classifyStoreUrl('apple_music', 'https://music.apple.com/us/artist/sergik/1440857781')
    ).toBe('artist')
  })

  it('classifies iHeart album vs artist', () => {
    expect(
      classifyStoreUrl('iheart', 'https://www.iheart.com/artist/sergik-123456/')
    ).toBe('artist')
    expect(
      classifyStoreUrl('iheart', 'https://www.iheart.com/artist/sergik-123456/albums/id-278836343/')
    ).toBe('album')
  })
})

describe('defaultVerificationForNewLink', () => {
  it('marks artist profiles and B2B stores immediately', () => {
    expect(
      defaultVerificationForNewLink({
        store: 'spotify',
        url: 'https://open.spotify.com/artist/1',
      })
    ).toEqual({ verification_status: 'artist_only', verification_detail: 'artist_profile' })

    expect(
      defaultVerificationForNewLink({
        store: 'medianet',
        url: 'https://example.com',
      })
    ).toEqual({ verification_status: 'b2b', verification_detail: 'b2b_submitted' })

    expect(
      defaultVerificationForNewLink({
        store: 'spotify',
        url: 'https://open.spotify.com/album/1',
      })
    ).toEqual({ verification_status: 'unverified', verification_detail: null })
  })
})

describe('verifyStoreLink status matrix', () => {
  const okFetch = vi.fn(async () => new Response(null, { status: 200 }))

  it('short-circuits artist URLs without probing', async () => {
    const fetchImpl = vi.fn()
    const result = await verifyStoreLink({
      store: 'spotify',
      url: 'https://open.spotify.com/artist/0TnOYISbd1XYRBk9myaseg',
      fetchImpl,
    })
    expect(result.status).toBe('artist_only')
    expect(result.detail).toBe('artist_profile')
    expect(result.verified_at).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('returns b2b for DistroKid-submitted B2B stores', async () => {
    const result = await verifyStoreLink({
      store: 'medianet',
      url: 'https://example.com/anything',
      fetchImpl: okFetch,
    })
    expect(result.status).toBe('b2b')
    expect(result.verified_at).toBeNull()
  })

  it('marks probe-ok album without catalog keys as reachable', async () => {
    const result = await verifyStoreLink({
      store: 'spotify',
      url: 'https://open.spotify.com/album/2NkWmlDlwoFYpM2foerkHH',
      fetchImpl: okFetch,
      now: new Date('2026-01-15T12:00:00.000Z'),
    })
    expect(result.status).toBe('reachable')
    expect(result.verified_at).toBe('2026-01-15T12:00:00.000Z')
  })

  it('marks catalog rematch as live', async () => {
    const albumId = '2NkWmlDlwoFYpM2foerkHH'
    const albumUrl = `https://open.spotify.com/album/${albumId}`
    const prevId = process.env.SPOTIFY_CLIENT_ID
    const prevSecret = process.env.SPOTIFY_CLIENT_SECRET
    process.env.SPOTIFY_CLIENT_ID = 'test-id'
    process.env.SPOTIFY_CLIENT_SECRET = 'test-secret'

    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('accounts.spotify.com/api/token')) {
        return new Response(JSON.stringify({ access_token: 't' }), { status: 200 })
      }
      if (url.includes('api.spotify.com') && url.includes('search')) {
        return new Response(
          JSON.stringify({
            tracks: {
              items: [
                {
                  id: 'track1',
                  external_urls: { spotify: 'https://open.spotify.com/track/track1' },
                  album: {
                    id: albumId,
                    external_urls: { spotify: albumUrl },
                  },
                },
              ],
            },
          }),
          { status: 200 }
        )
      }
      if (init?.method === 'HEAD' || init?.method === 'GET' || !init?.method) {
        return new Response(null, { status: 200 })
      }
      return new Response(null, { status: 404 })
    })

    try {
      const result = await verifyStoreLink({
        store: 'spotify',
        url: albumUrl,
        isrcs: ['USRC17607839'],
        fetchImpl,
        now: new Date('2026-01-15T12:00:00.000Z'),
      })
      expect(result.status).toBe('live')
      expect(result.detail).toBe('catalog_match')
      expect(result.verified_at).toBe('2026-01-15T12:00:00.000Z')
    } finally {
      if (prevId === undefined) delete process.env.SPOTIFY_CLIENT_ID
      else process.env.SPOTIFY_CLIENT_ID = prevId
      if (prevSecret === undefined) delete process.env.SPOTIFY_CLIENT_SECRET
      else process.env.SPOTIFY_CLIENT_SECRET = prevSecret
    }
  })

  it('fails dead links', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 404 }))
    const result = await verifyStoreLink({
      store: 'deezer',
      url: 'https://www.deezer.com/album/999999999',
      fetchImpl,
    })
    expect(result.status).toBe('failed')
    expect(result.verified_at).toBeNull()
  })
})

describe('isReleaseLiveOnStore + summarize', () => {
  it('counts only live and reachable toward ops coverage', () => {
    expect(isReleaseLiveOnStore('live')).toBe(true)
    expect(isReleaseLiveOnStore('reachable')).toBe(true)
    expect(isReleaseLiveOnStore('artist_only')).toBe(false)
    expect(isReleaseLiveOnStore('unverified')).toBe(false)

    const summary = summarizeDspVerifyResults([
      {
        store: 'spotify',
        url: 'https://open.spotify.com/album/1',
        status: 'live',
        detail: 'catalog_match',
        verified_at: 'x',
        kind: 'album',
      },
      {
        store: 'apple_music',
        url: 'https://music.apple.com/us/album/x/1',
        status: 'reachable',
        detail: 'http_200',
        verified_at: 'x',
        kind: 'album',
      },
      {
        store: 'beatport',
        url: 'https://www.beatport.com/artist/x/1',
        status: 'artist_only',
        detail: 'artist_profile',
        verified_at: null,
        kind: 'artist',
      },
    ])
    expect(summary.live).toBe(1)
    expect(summary.reachable).toBe(1)
    expect(summary.artist_only).toBe(1)
  })
})
