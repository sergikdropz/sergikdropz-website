import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import {
  isDirectPlayableUrl,
  isEdgePlaybackUrl,
  isMediaProxyUrl,
  isR2BrowserPlayEnabled,
  isSignedEdgeUrl,
  isStaleTunnelUrl,
  shouldPreferResolveOverProxy,
} from '@/lib/audio/edge-playback-url'

describe('edge-playback-url', () => {
  const prev = {
    cdn: process.env.NEXT_PUBLIC_MEDIA_CDN_URL,
    play: process.env.R2_BROWSER_PLAY,
    publicPlay: process.env.NEXT_PUBLIC_R2_BROWSER_PLAY,
  }

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_MEDIA_CDN_URL
    delete process.env.R2_BROWSER_PLAY
    delete process.env.NEXT_PUBLIC_R2_BROWSER_PLAY
  })

  afterEach(() => {
    if (prev.cdn == null) delete process.env.NEXT_PUBLIC_MEDIA_CDN_URL
    else process.env.NEXT_PUBLIC_MEDIA_CDN_URL = prev.cdn
    if (prev.play == null) delete process.env.R2_BROWSER_PLAY
    else process.env.R2_BROWSER_PLAY = prev.play
    if (prev.publicPlay == null) delete process.env.NEXT_PUBLIC_R2_BROWSER_PLAY
    else process.env.NEXT_PUBLIC_R2_BROWSER_PLAY = prev.publicPlay
  })

  it('recognizes presigned R2 object URLs', () => {
    const url =
      'https://sergik-vault.e7b3fe976b079a994da8533ba6274a5d.r2.cloudflarestorage.com/audio/unreleased/a.mp3?X-Amz-Algorithm=AWS4-HMAC-SHA256'
    expect(isEdgePlaybackUrl(url)).toBe(true)
    expect(isDirectPlayableUrl(url)).toBe(false)
    expect(shouldPreferResolveOverProxy(url)).toBe(false)
  })

  it('rejects tunnels and the Vercel media proxy', () => {
    expect(isStaleTunnelUrl('https://themes-reproductive.trycloudflare.com/audio/a.mp3')).toBe(true)
    expect(isEdgePlaybackUrl('https://themes-reproductive.trycloudflare.com/audio/a.mp3')).toBe(false)
    expect(isMediaProxyUrl('/api/audio/media/unreleased/a.mp3')).toBe(true)
    expect(isDirectPlayableUrl('/api/audio/media/unreleased/a.mp3')).toBe(true)
    expect(shouldPreferResolveOverProxy('/api/audio/media/unreleased/a.mp3')).toBe(false)
  })

  it('honors a real public CDN base', () => {
    process.env.NEXT_PUBLIC_MEDIA_CDN_URL = 'https://media.example.com'
    expect(isEdgePlaybackUrl('https://media.example.com/audio/unreleased/a.mp3')).toBe(true)
  })

  it('never treats signed R2 as direct-playable while browser-play is hard-disabled', () => {
    const url =
      'https://sergik-vault.e7b3fe976b079a994da8533ba6274a5d.r2.cloudflarestorage.com/audio/unreleased/a.mp3?X-Amz-Algorithm=AWS4-HMAC-SHA256'
    expect(isR2BrowserPlayEnabled()).toBe(false)
    expect(isSignedEdgeUrl(url)).toBe(true)
    expect(isDirectPlayableUrl(url)).toBe(false)
    process.env.NEXT_PUBLIC_R2_BROWSER_PLAY = '1'
    expect(isR2BrowserPlayEnabled()).toBe(false)
    expect(isDirectPlayableUrl(url)).toBe(false)
  })
})
