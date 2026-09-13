import { describe, expect, it } from 'vitest'
import {
  clampSnippetWindow,
  pickRecorderMimeType,
  proxiedArtworkUrl,
  sanitizeStoryFilenamePart,
  STORY_SNIPPET_DURATION_SEC,
  storySnippetFilename,
} from './story-snippet'

describe('story snippet helpers', () => {
  it('clamps duration to track length', () => {
    expect(
      clampSnippetWindow({ startSec: 0, durationSec: 15, trackDurationSec: 8 }),
    ).toEqual({ startSec: 0, durationSec: 8 })
  })

  it('pulls start back when near the end of a short track', () => {
    const w = clampSnippetWindow({ startSec: 90, durationSec: 15, trackDurationSec: 100 })
    expect(w.startSec).toBe(85)
    expect(w.durationSec).toBe(15)
  })

  it('defaults duration to 15s', () => {
    expect(clampSnippetWindow({}).durationSec).toBe(STORY_SNIPPET_DURATION_SEC)
  })

  it('sanitizes filename parts', () => {
    expect(sanitizeStoryFilenamePart('How Be We Like?!')).toBe('How-Be-We-Like')
    expect(sanitizeStoryFilenamePart('')).toBe('track')
  })

  it('builds a story filename', () => {
    expect(storySnippetFilename('FTP', 'SERGIK', 'video/webm')).toBe('SERGIK-FTP-story.webm')
    expect(storySnippetFilename('FTP', 'SERGIK', 'video/mp4')).toBe('SERGIK-FTP-story.mp4')
  })

  it('picks the first supported recorder mime', () => {
    expect(pickRecorderMimeType((m) => m === 'video/webm')).toBe('video/webm')
    expect(pickRecorderMimeType(() => false)).toBeNull()
  })

  it('proxies artwork through the same-origin share proxy', () => {
    expect(proxiedArtworkUrl('https://cdn.example/art.jpg')).toBe(
      `/api/shares/artwork-proxy?src=${encodeURIComponent('https://cdn.example/art.jpg')}`,
    )
    expect(proxiedArtworkUrl('/api/shares/artwork-proxy?src=x')).toBe(
      '/api/shares/artwork-proxy?src=x',
    )
  })
})
