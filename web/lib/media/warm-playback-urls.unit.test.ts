import { describe, expect, it } from 'vitest'
import { resolveWarmPlaybackUrl } from '@/lib/media/warm-playback-urls'

describe('resolveWarmPlaybackUrl', () => {
  it('returns media proxy paths for warming', () => {
    expect(
      resolveWarmPlaybackUrl('/api/audio/media/unreleased/Library/foo.mp3'),
    ).toBe('/api/audio/media/unreleased/Library/foo.mp3')
  })
})
