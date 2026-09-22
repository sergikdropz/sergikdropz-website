import { describe, expect, it } from 'vitest'
import {
  badgeForPost,
  buildSocialCaptionsScheduleText,
  sanitizeSocialFilename,
  socialPromoKitPaths,
} from '@/lib/studio/social-promo-assets'
import { generateSocialPromoPlan } from '@/lib/studio/social-promo'

describe('social promo asset kit paths', () => {
  it('sanitizes release slugs for zip folders', () => {
    expect(sanitizeSocialFilename('Are We Awake?')).toBe('Are-We-Awake')
    expect(sanitizeSocialFilename('!!!')).toBe('release')
  })

  it('organizes feed / stories / reels / captions folders', () => {
    const paths = socialPromoKitPaths('Are-We-Awake')
    expect(paths.root).toBe('Are-We-Awake-social-kit')
    expect(paths.zipName).toBe('Are-We-Awake-social-kit.zip')
    expect(paths.feedPng).toBe('Are-We-Awake-social-kit/01-feed/ig-feed-1080.png')
    expect(paths.storyStillPng).toBe(
      'Are-We-Awake-social-kit/02-stories/story-still-1080x1920.png'
    )
    expect(paths.vinylStory('webm')).toBe(
      'Are-We-Awake-social-kit/02-stories/vinyl-story-15s.webm'
    )
    expect(paths.vinylReel('mp4')).toBe('Are-We-Awake-social-kit/03-reels/vinyl-reel-15s.mp4')
    expect(paths.captions).toBe('Are-We-Awake-social-kit/04-captions/schedule.txt')
    expect(paths.spotifyCanvas('webm')).toBe(
      'Are-We-Awake-social-kit/05-spotify-canvas/canvas-drift-8s.webm'
    )
    expect(paths.readme).toBe('Are-We-Awake-social-kit/README.txt')
  })

  it('builds caption schedule text from plan slots', () => {
    const plan = generateSocialPromoPlan({
      streetDate: '2026-09-24',
      title: 'Are We Awake?',
      artist: 'SERGIK',
      nowIso: '2026-09-17T20:00:00.000Z',
    })
    const text = buildSocialCaptionsScheduleText({
      title: 'Are We Awake?',
      artist: 'SERGIK',
      streetDate: '2026-09-24',
      plan,
    })
    expect(text).toMatch(/SERGIK social captions/)
    expect(text).toMatch(/Launch feed/)
    expect(text).toMatch(/Launch reel/)
    expect(text).toMatch(/Asset: story_video/)
  })

  it('maps day offset to badge copy', () => {
    expect(badgeForPost({ day_offset: -3 })).toBe('3d out')
    expect(badgeForPost({ day_offset: 0 })).toBe('Out now')
    expect(badgeForPost({ day_offset: 2 })).toBe('Now playing')
  })
})
