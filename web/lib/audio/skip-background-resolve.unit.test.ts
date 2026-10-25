import { describe, expect, it } from 'vitest'
import {
  shouldSkipBackgroundAudioResolve,
  syncMediaProxyPlaybackUrl,
} from '@/lib/audio/skip-background-resolve'

describe('syncMediaProxyPlaybackUrl', () => {
  it('returns proxy paths unchanged', () => {
    const url = '/api/audio/media/unreleased/a.mp3'
    expect(syncMediaProxyPlaybackUrl(url)).toBe(url)
  })
})

describe('shouldSkipBackgroundAudioResolve', () => {
  it('does not skip the media proxy, so resolve can return a signed R2 URL', () => {
    const file = '/api/audio/media/unreleased/Library/foo.mp3'
    expect(shouldSkipBackgroundAudioResolve(file, file)).toBe(false)
  })

  it('does not skip for bare vault paths without a proxy optimistic URL', () => {
    expect(
      shouldSkipBackgroundAudioResolve('/audio/unreleased/foo.mp3', '/audio/unreleased/foo.mp3'),
    ).toBe(false)
  })
})
