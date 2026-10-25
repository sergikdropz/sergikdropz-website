import { describe, expect, it } from 'vitest'
import {
  campaignHandoffDescription,
  campaignScheduledSendAt,
  isFallbackMusicDestination,
  publicMusicDestinationUrl,
  publicSmartLinkUrl,
  smartLinkKindForDate,
  smartLinkSlugForRelease,
} from '@/lib/studio/launch-handoff'

describe('launch-handoff helpers', () => {
  it('builds a safe smart link slug', () => {
    expect(smartLinkSlugForRelease('release-123')).toBe('presave-release-123')
    expect(smartLinkSlugForRelease('Vice & Virtues!!')).toBe('presave-vice-virtues')
  })

  it('prefers Spotify store link for destination', () => {
    const url = publicMusicDestinationUrl('abc', [
      { store: 'apple_music', url: 'https://music.apple.com/x' },
      { store: 'spotify', url: 'https://open.spotify.com/album/1' },
    ])
    expect(url).toBe('https://open.spotify.com/album/1')
  })

  it('uses a listen slug once the street date has arrived', () => {
    expect(smartLinkKindForDate('2026-10-30', new Date(2026, 9, 8))).toBe('presave')
    expect(smartLinkKindForDate('2026-10-30', new Date(2026, 9, 30))).toBe('listen')
    expect(smartLinkSlugForRelease('release-123', 'listen')).toBe('listen-release-123')
  })

  it('treats the on-site music page as a placeholder destination', () => {
    expect(isFallbackMusicDestination('https://sergikdropz.com/music/abc', 'abc')).toBe(true)
    expect(isFallbackMusicDestination('https://open.spotify.com/album/1', 'abc')).toBe(false)
  })

  it('schedules the draft for noon Pacific and names the fan link', () => {
    expect(campaignScheduledSendAt('2026-10-30')).toBe('2026-10-30T20:00:00.000Z')
    expect(campaignScheduledSendAt('soon')).toBeNull()
    expect(campaignHandoffDescription({ title: 'Walk That Walk', smartUrl: publicSmartLinkUrl('presave-walk') })).toContain(
      '/l/presave-walk'
    )
  })

  it('falls back to public music path', () => {
    const url = publicMusicDestinationUrl('my-ep', [])
    expect(url).toMatch(/\/music\/my-ep$/)
  })
})
