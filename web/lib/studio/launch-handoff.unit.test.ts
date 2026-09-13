import { describe, expect, it } from 'vitest'
import {
  publicMusicDestinationUrl,
  smartLinkSlugForRelease,
} from '@/lib/studio/launch-handoff'

describe('launch-handoff helpers', () => {
  it('builds a safe smart link slug', () => {
    expect(smartLinkSlugForRelease('release-123')).toBe('presave-release-123')
    expect(smartLinkSlugForRelease('Vice & Virtues!!')).toBe('presave-vice-virtues')
  })

  it('prefers Spotify store link for destination', () => {
    const url = publicMusicDestinationUrl('abc', [
      { store: 'apple_music', url: 'https://music.apple.com/x' },
      { store: 'spotify', url: 'https://open.spotify.com/album/1' },
    ])
    expect(url).toBe('https://open.spotify.com/album/1')
  })

  it('falls back to public music path', () => {
    const url = publicMusicDestinationUrl('my-ep', [])
    expect(url).toMatch(/\/music\/my-ep$/)
  })
})
