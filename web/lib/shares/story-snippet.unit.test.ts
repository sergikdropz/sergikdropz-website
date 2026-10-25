import { describe, expect, it } from 'vitest'
import { VINYL_33_RPM_SEC } from './vinyl-spin-clock'
import {
  clampSnippetWindow,
  pickRecorderMimeType,
  proxiedArtworkUrl,
  resolveStoryClipDuration,
  sanitizeStoryFilenamePart,
  STORY_SNIPPET_DURATION_SEC,
  storyClipLengthChoices,
  storyClipLengthLabel,
  storySnippetFilename,
  vinylStoryRotationDeg,
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

  it('offers 15s steps up to a minute, then the full song', () => {
    expect(storyClipLengthChoices(200)).toEqual([15, 30, 45, 60, 'full'])
    expect(storyClipLengthChoices(50)).toEqual([15, 30, 45, 'full'])
    expect(storyClipLengthChoices(12)).toEqual(['full'])
    expect(storyClipLengthChoices(null)).toEqual([15, 30, 45, 60, 'full'])
    expect(storyClipLengthLabel(60)).toBe('1:00')
    expect(storyClipLengthLabel('full')).toBe('Full')
    expect(resolveStoryClipDuration(30, 200)).toBe(30)
    expect(resolveStoryClipDuration('full', 200)).toBe(200)
    expect(resolveStoryClipDuration('full', null)).toBe(15)
    expect(resolveStoryClipDuration(60, 40)).toBe(40)
  })

  it('sanitizes filename parts', () => {
    expect(sanitizeStoryFilenamePart('How Be We Like?!')).toBe('How-Be-We-Like')
    expect(sanitizeStoryFilenamePart('')).toBe('track')
  })

  it('builds a story filename', () => {
    expect(storySnippetFilename('FTP', 'SERGIK', 'video/webm')).toBe('SERGIK-FTP-story.webm')
    expect(storySnippetFilename('FTP', 'SERGIK', 'video/mp4')).toBe('SERGIK-FTP-story.mp4')
    expect(storySnippetFilename('FTP', 'SERGIK', 'video/mp4', 'sleeve-gold-solid')).toBe(
      'SERGIK-FTP-story-sleeve-gold-solid.mp4'
    )
  })

  it('picks the first supported recorder mime', () => {
    expect(pickRecorderMimeType((m) => m === 'video/webm')).toBe('video/webm')
    expect(pickRecorderMimeType((m) => m.startsWith('video/mp4'))).toBe(
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    )
    expect(pickRecorderMimeType(() => false)).toBeNull()
  })

  it('prefers MPEG-4 over WebM when both are supported', () => {
    expect(
      pickRecorderMimeType((m) => m === 'video/mp4' || m === 'video/webm'),
    ).toBe('video/mp4')
  })

  it('proxies artwork through the same-origin share proxy', () => {
    expect(proxiedArtworkUrl('https://cdn.example/art.jpg')).toBe(
      `/api/shares/artwork-proxy?src=${encodeURIComponent('https://cdn.example/art.jpg')}`,
    )
    expect(proxiedArtworkUrl('/api/shares/artwork-proxy?src=x')).toBe(
      '/api/shares/artwork-proxy?src=x',
    )
  })

  it('keeps same-origin relative artwork paths unproxied', () => {
    expect(
      proxiedArtworkUrl(
        '/images/audio/unreleased/eps/SERGIK%20-%20Soul%20Candy/cover.jpeg',
      ),
    ).toBe('/images/audio/unreleased/eps/SERGIK%20-%20Soul%20Candy/cover.jpeg')
  })

  it('rotates vinyl story frames at 33⅓ RPM', () => {
    expect(vinylStoryRotationDeg(0)).toBe(0)
    expect(vinylStoryRotationDeg(VINYL_33_RPM_SEC)).toBeCloseTo(360, 5)
    expect(vinylStoryRotationDeg(VINYL_33_RPM_SEC / 2)).toBeCloseTo(180, 5)
  })
})
