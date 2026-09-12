import { describe, expect, it } from 'vitest'
import {
  assignMediaSrcIfChanged,
  mediaUrlMatchesTrack,
  mediaUrlsRoughlyEqual,
  peekSyncPlaybackUrl,
} from '@/lib/audio/media-src'

describe('mediaUrlsRoughlyEqual', () => {
  it('treats identical strings as equal', () => {
    expect(mediaUrlsRoughlyEqual('/api/audio/media/a.mp3', '/api/audio/media/a.mp3')).toBe(true)
  })

  it('treats the same pathname with different query tokens as equal', () => {
    expect(
      mediaUrlsRoughlyEqual(
        'https://cdn.example/audio/a.mp3?X-Amz-Expires=90',
        'https://cdn.example/audio/a.mp3?X-Amz-Expires=10',
      ),
    ).toBe(true)
  })

  it('treats relative and absolute forms of the same media path as equal', () => {
    expect(
      mediaUrlsRoughlyEqual(
        '/api/audio/media/unreleased/a.mp3',
        'http://local.test/api/audio/media/unreleased/a.mp3',
      ),
    ).toBe(true)
  })

  it('rejects different tracks', () => {
    expect(
      mediaUrlsRoughlyEqual('/api/audio/media/a.mp3', '/api/audio/media/b.mp3'),
    ).toBe(false)
  })

  it('rejects empty values', () => {
    expect(mediaUrlsRoughlyEqual('', '/a.mp3')).toBe(false)
    expect(mediaUrlsRoughlyEqual(null, '/a.mp3')).toBe(false)
  })
})

describe('mediaUrlMatchesTrack', () => {
  it('matches a proxy URL to the vault file path', () => {
    expect(
      mediaUrlMatchesTrack(
        '/api/audio/media/unreleased/eps/sergik-track.mp3',
        'unreleased/eps/sergik-track.mp3',
      ),
    ).toBe(true)
  })

  it('rejects the previous track after a skip', () => {
    expect(
      mediaUrlMatchesTrack(
        '/api/audio/media/unreleased/eps/track-a.mp3',
        'unreleased/eps/track-b.mp3',
      ),
    ).toBe(false)
  })

  it('matches sibling extensions for the same vault asset', () => {
    expect(
      mediaUrlMatchesTrack(
        '/api/audio/media/unreleased/Playlists/Feelin%20Sendy/SERGIK%20-%20Bender.m4a',
        'unreleased/Playlists/Feelin Sendy/SERGIK - Bender.mp3',
      ),
    ).toBe(true)
  })
})

describe('peekSyncPlaybackUrl', () => {
  it('returns a same-origin media URL for a vault file on the same tick', () => {
    expect(peekSyncPlaybackUrl('unreleased/eps/sergik-track.mp3')).toBe(
      '/api/audio/media/unreleased/eps/sergik-track.mp3',
    )
  })

  it('prefers a cached playable URL', () => {
    const cache = new Map([['vault/a.mp3', '/api/audio/media/vault/a.mp3']])
    expect(peekSyncPlaybackUrl('vault/a.mp3', cache)).toBe('/api/audio/media/vault/a.mp3')
  })
})

type FakeMediaEl = { src: string; currentSrc: string; load(): void }

/** Records load() calls so tests can assert we never re-run the load algorithm. */
function fakeMediaEl(src: string, loads: string[]): FakeMediaEl {
  return {
    src,
    currentSrc: src,
    load() {
      loads.push(this.src)
    },
  }
}

describe('assignMediaSrcIfChanged', () => {
  it('does not call load when the element already has that src', () => {
    const loads: string[] = []
    const el = fakeMediaEl('/api/audio/media/a.mp3', loads) as unknown as HTMLMediaElement

    expect(assignMediaSrcIfChanged(el, '/api/audio/media/a.mp3')).toBe(false)
    expect(loads).toEqual([])
  })

  it('assigns src when it actually changes without calling load()', () => {
    const loads: string[] = []
    const el = fakeMediaEl('/api/audio/media/a.mp3', loads) as unknown as HTMLMediaElement

    expect(assignMediaSrcIfChanged(el, '/api/audio/media/b.mp3')).toBe(true)
    expect(el.src).toBe('/api/audio/media/b.mp3')
    expect(loads).toEqual([])
  })
})
