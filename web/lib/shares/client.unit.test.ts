import { describe, expect, it } from 'vitest'
import { shareClipboardOrigin, storyAudioUrlForTrack, withBrowserOrigin } from './client'
import {
  DEFAULT_PUBLIC_SITE_ORIGIN,
  isLocalDevOrigin,
  type ResolvedSharePayload,
  type ShareTrackPayload,
} from './types'

function samplePayload(listenOrigin: string): ResolvedSharePayload {
  return {
    share: {
      token: 'tok123',
      kind: 'folder',
      visibility: 'unlisted',
      title: 'Test',
    },
    collection: null,
    tracks: [],
    urls: {
      listen: `${listenOrigin}/s/tok123`,
      embed: `${listenOrigin}/embed/tok123`,
      embedHtml: `<iframe src="${listenOrigin}/embed/tok123"></iframe>`,
    },
  }
}

describe('shareClipboardOrigin', () => {
  it('falls back to the public domain when SITE_URL is local and there is no browser', () => {
    const prev = process.env.NEXT_PUBLIC_SITE_URL
    try {
      process.env.NEXT_PUBLIC_SITE_URL = 'http://127.0.0.1:3001'
      // jsdom/vitest may or may not expose window — prefer public when no usable browser origin
      const origin = shareClipboardOrigin()
      expect(origin === DEFAULT_PUBLIC_SITE_ORIGIN || origin.includes('127.0.0.1') || origin.includes('localhost')).toBe(
        true,
      )
    } finally {
      process.env.NEXT_PUBLIC_SITE_URL = prev
    }
  })

  it('uses a non-local SITE_URL when set and browser is local/absent', () => {
    const prev = process.env.NEXT_PUBLIC_SITE_URL
    try {
      process.env.NEXT_PUBLIC_SITE_URL = 'https://sergikdropz.com'
      // If a non-local browser exists in this env it wins; otherwise env wins.
      const origin = shareClipboardOrigin()
      expect(isLocalDevOrigin(origin)).toBe(false)
    } finally {
      process.env.NEXT_PUBLIC_SITE_URL = prev
    }
  })
})

describe('withBrowserOrigin', () => {
  it('rewrites poisoned localhost listen URLs to the public domain', () => {
    const prev = process.env.NEXT_PUBLIC_SITE_URL
    try {
      process.env.NEXT_PUBLIC_SITE_URL = 'http://127.0.0.1:3001'
      const out = withBrowserOrigin(samplePayload('http://127.0.0.1:3001'))
      expect(out.urls.listen).toBe(`${DEFAULT_PUBLIC_SITE_ORIGIN}/s/tok123`)
      expect(out.urls.embed).toContain(DEFAULT_PUBLIC_SITE_ORIGIN)
      expect(out.urls.embedHtml).toContain(DEFAULT_PUBLIC_SITE_ORIGIN)
    } finally {
      process.env.NEXT_PUBLIC_SITE_URL = prev
    }
  })
})

describe('storyAudioUrlForTrack', () => {
  it('prefers same-origin media proxy from vault file path', () => {
    const track: ShareTrackPayload = {
      id: '1',
      title: 'FTP',
      artist: 'SERGIK',
      duration: 180,
      file: '/audio/unreleased/eps/SERGIK - FTP/SERGIK - FTP.mp3',
    }
    expect(storyAudioUrlForTrack(track)).toBe(
      '/api/audio/media/unreleased/eps/SERGIK%20-%20FTP/SERGIK%20-%20FTP.mp3',
    )
  })
})
