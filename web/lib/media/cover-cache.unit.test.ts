import { describe, expect, it } from 'vitest'
import {
  ensureBustedCoverUrl,
  isCacheableCoverUrl,
  prepareCoverPrefetchUrls,
} from '@/lib/media/cover-cache'

describe('cover-cache', () => {
  it('rejects bare artwork paths without a cache bust', () => {
    expect(isCacheableCoverUrl('/images/audio/artwork/folder-daze.jpg')).toBe(false)
    expect(
      isCacheableCoverUrl(
        'https://example.supabase.co/storage/v1/object/public/audio-files/artwork/folder-x.jpg',
      ),
    ).toBe(false)
  })

  it('accepts busted local and next/image cover urls', () => {
    expect(isCacheableCoverUrl('/images/audio/artwork/folder-daze.jpg?v=123')).toBe(true)
    const optimized =
      '/_next/image?url=' +
      encodeURIComponent('/images/audio/artwork/folder-daze.jpg?v=123') +
      '&w=256&q=75'
    expect(isCacheableCoverUrl(optimized)).toBe(true)
  })

  it('ensures bust params on uploaded folder masters', () => {
    const busted = ensureBustedCoverUrl('/images/audio/artwork/folder-1787720929879.jpg')
    expect(busted).toMatch(/folder-1787720929879\.jpg\?v=\d+/)
    expect(isCacheableCoverUrl(busted)).toBe(true)
  })

  it('prepares a capped unique prefetch list', () => {
    const urls = prepareCoverPrefetchUrls(
      [
        '/images/audio/artwork/folder-a.jpg',
        '/images/audio/artwork/folder-a.jpg?v=1',
        '/images/audio/artwork/folder-b.jpg?v=2',
        null,
        '/images/audio/unreleased/eps/cover.jpg',
      ],
      10,
    )
    expect(urls.length).toBeGreaterThanOrEqual(2)
    expect(urls.every((u) => isCacheableCoverUrl(u))).toBe(true)
  })
})
