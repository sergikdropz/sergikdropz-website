import { describe, expect, it } from 'vitest'
import {
  clipFileShareFields,
  clipReadySharePrompt,
  clipShareCaption,
  parseClipCue,
  prepareClipHandoff,
  socialIntentUrl,
  timedListenUrl,
  videoAppUrl,
} from '@/lib/shares/clip-share'

describe('clip share', () => {
  it('reads a start time and track from the listen URL', () => {
    expect(parseClipCue('?t=83&track=pre-party')).toEqual({ startSec: 83, trackId: 'pre-party' })
    expect(parseClipCue('?t=0')).toBeNull()
    expect(parseClipCue('')).toBeNull()
  })

  it('builds one timed link that every platform can open', () => {
    const url = new URL(
      timedListenUrl('https://sergikdropz.com/s/abc', {
        startSec: 83.4,
        trackId: 'pre-party',
        platform: 'x',
        campaign: 'Staying A Vibe',
      }),
    )
    expect(url.searchParams.get('t')).toBe('83')
    expect(url.searchParams.get('track')).toBe('pre-party')
    expect(url.searchParams.get('utm_source')).toBe('x')
    expect(url.searchParams.get('utm_campaign')).toBe('staying-a-vibe')
  })

  it('puts the moment in the caption and the intent URL', () => {
    const url = 'https://sergikdropz.com/s/abc?t=12'
    const text = clipShareCaption({
      title: 'Pre Party',
      artist: 'SERGIK',
      url,
      startSec: 12,
    })
    expect(text).toContain('Listen from 0:12')
    expect(text).toContain(url)
    expect(socialIntentUrl('whatsapp', { text, url })).toContain('wa.me')
    expect(socialIntentUrl('facebook', { text, url })).toContain(encodeURIComponent(url))
    expect(socialIntentUrl('x', { text, url })).toContain('twitter.com/intent/tweet')
    expect(videoAppUrl('instagram')).toContain('instagram.com')
    expect(videoAppUrl('tiktok')).toContain('tiktok.com/upload')
    expect(videoAppUrl('youtube')).toContain('youtube.com/upload')
  })

  it('shares Instagram as a video file so Stories can take it', () => {
    expect(clipFileShareFields({ filesOnly: true, title: 'FTP', text: 'https://sergikdropz.com/s/abc' })).toEqual({})
    expect(clipFileShareFields({ filesOnly: false, title: 'FTP', text: 'https://sergikdropz.com/s/abc' })).toEqual({
      title: 'FTP',
      text: 'https://sergikdropz.com/s/abc',
    })
    expect(clipReadySharePrompt('instagram', 'sheet').actionLabel).toBe('Add to Instagram Story')
  })

  it('keeps a rendered Instagram clip in the story step', () => {
    const prepared = prepareClipHandoff({
      platform: 'instagram',
      blob: new Blob(['mp4'], { type: 'video/mp4' }),
      filename: 'SERGIK-FTP-story.mp4',
      title: 'FTP — SERGIK',
      text: 'https://sergikdropz.com/s/abc',
      moment: 'https://sergikdropz.com/s/abc?t=12',
      mimeType: 'video/mp4',
    })
    expect(prepared.ok).toBe(true)
    if (!prepared.ok) return
    expect(prepared.clip.platform).toBe('instagram')
    expect(prepared.clip.mode === 'sheet' || prepared.clip.mode === 'save').toBe(true)
    expect(prepared.clip.moment).toContain('t=12')
  })

  it('does not hand Instagram a WebM clip', () => {
    const prepared = prepareClipHandoff({
      platform: 'instagram',
      blob: new Blob(['webm'], { type: 'video/webm' }),
      filename: 'story.webm',
      title: 'FTP',
      text: 'https://sergikdropz.com/s/abc',
      moment: 'https://sergikdropz.com/s/abc',
      mimeType: 'video/webm',
    })
    expect(prepared.ok).toBe(false)
  })
})