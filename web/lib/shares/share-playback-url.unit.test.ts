import { describe, expect, it } from 'vitest'
import { syncMediaProxyPlaybackUrl } from '@/lib/audio/skip-background-resolve'

describe('share playback URL fast path', () => {
  it('uses proxy URL without server resolve when catalog already has media proxy paths', () => {
    const file = '/api/audio/media/unreleased/Library/SERGIK%20-%20FTP.mp3'
    expect(syncMediaProxyPlaybackUrl(file)).toBe(
      '/api/audio/media/unreleased/Library/SERGIK%20-%20FTP.mp3',
    )
  })
})
