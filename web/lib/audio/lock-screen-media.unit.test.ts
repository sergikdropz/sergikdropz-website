import { describe, expect, it } from 'vitest'
import {
  LOCK_SCREEN_FALLBACK_ARTWORK,
  absoluteMediaArtworkUrl,
  artworkMimeType,
  buildLockScreenArtworkEntries,
  buildMediaSessionArtworkFromRef,
  mediaSessionArtworkFetchUrl,
  resolveMediaSessionOrigin,
  lockScreenPrefersTrackSkip,
} from './lock-screen-media'

describe('lock-screen-media', () => {
  it('detects mime from extension', () => {
    expect(artworkMimeType('/images/cover.png')).toBe('image/png')
    expect(artworkMimeType('https://cdn.example/a.JPG?v=1')).toBe('image/jpeg')
    expect(artworkMimeType('/x.webp')).toBe('image/webp')
  })

  it('absolutizes relative artwork for MediaMetadata', () => {
    expect(absoluteMediaArtworkUrl('/images/logo.png', 'https://sergikdropz.com')).toBe(
      'https://sergikdropz.com/images/logo.png',
    )
    expect(absoluteMediaArtworkUrl('https://cdn.example/a.jpg', 'https://sergikdropz.com')).toBe(
      'https://cdn.example/a.jpg',
    )
  })

  it('prefers HTTPS NEXT_PUBLIC_SITE_URL when page origin is http', () => {
    const prev = process.env.NEXT_PUBLIC_SITE_URL
    process.env.NEXT_PUBLIC_SITE_URL = 'https://sergikdropz.com'
    expect(resolveMediaSessionOrigin('http://192.168.1.10:3001')).toBe('https://sergikdropz.com')
    process.env.NEXT_PUBLIC_SITE_URL = prev
  })

  it('routes local covers through session-artwork API', () => {
    const url = mediaSessionArtworkFetchUrl('/images/audio/artwork/folder-x.jpg', 'https://sergikdropz.com')
    expect(url).toBe(
      'https://sergikdropz.com/api/media/session-artwork?path=%2Fimages%2Faudio%2Fartwork%2Ffolder-x.jpg',
    )
  })

  it('falls back to brand mark when cover missing', () => {
    const entries = buildLockScreenArtworkEntries(undefined, 'https://sergikdropz.com')
    expect(entries.length).toBeGreaterThan(0)
    expect(entries[0]?.src).toContain('/api/media/session-artwork?')
    expect(entries[0]?.src).toContain(encodeURIComponent(LOCK_SCREEN_FALLBACK_ARTWORK))
    expect(entries[0]?.type).toBe('image/png')
  })

  it('builds artwork from catalog ref', () => {
    const entries = buildMediaSessionArtworkFromRef('/images/logo.png', 'https://sergikdropz.com')
    expect(entries[0]?.src).toContain('session-artwork')
  })

  it('prefers track skip on iPhone / iPad / Android', () => {
    expect(lockScreenPrefersTrackSkip('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe(
      true,
    )
    expect(
      lockScreenPrefersTrackSkip('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5),
    ).toBe(true)
    expect(lockScreenPrefersTrackSkip('Mozilla/5.0 (Linux; Android 14)')).toBe(true)
    expect(lockScreenPrefersTrackSkip('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(
      false,
    )
  })
})
