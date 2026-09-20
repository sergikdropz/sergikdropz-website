import { describe, expect, it } from 'vitest'
import {
  LOCK_SCREEN_FALLBACK_ARTWORK,
  absoluteMediaArtworkUrl,
  artworkMimeType,
  buildLockScreenArtworkEntries,
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

  it('falls back to brand mark when cover missing', () => {
    const entries = buildLockScreenArtworkEntries(undefined, 'https://sergikdropz.com')
    expect(entries.length).toBeGreaterThan(0)
    expect(entries[0]?.src).toBe(`https://sergikdropz.com${LOCK_SCREEN_FALLBACK_ARTWORK}`)
    expect(entries[0]?.type).toBe('image/png')
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
