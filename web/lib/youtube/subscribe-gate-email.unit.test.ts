import { describe, expect, it } from 'vitest'
import {
  fanTagsConfirmYoutubeSubscriber,
  normalizeGateEmail,
} from '@/lib/youtube/subscribe-gate-email'

describe('youtube subscriber email', () => {
  it('accepts a normal email and rejects blanks', () => {
    expect(normalizeGateEmail('  Fan@Gmail.com ')).toBe('fan@gmail.com')
    expect(normalizeGateEmail('not-an-email')).toBeNull()
    expect(normalizeGateEmail('')).toBeNull()
  })

  it('unlocks only a confirmed subscriber tag', () => {
    expect(fanTagsConfirmYoutubeSubscriber(['youtube-subscriber'])).toBe(true)
    expect(fanTagsConfirmYoutubeSubscriber(['youtube', 'subscriber'])).toBe(true)
    expect(fanTagsConfirmYoutubeSubscriber(['youtube-pending'])).toBe(false)
    expect(fanTagsConfirmYoutubeSubscriber(['youtube'])).toBe(false)
  })
})
