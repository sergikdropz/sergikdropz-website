import { describe, expect, it } from 'vitest'
import {
  buildSocialPromoBrowserHydrate,
  deskForSocialPromoChannel,
} from '@/lib/ai/social-promo-browser-hydrate'

describe('social-promo-browser-hydrate', () => {
  it('maps IG channels to Instagram desk and FB to Facebook', () => {
    expect(deskForSocialPromoChannel('instagram_feed')).toBe('instagram')
    expect(deskForSocialPromoChannel('instagram_reel')).toBe('instagram')
    expect(deskForSocialPromoChannel('facebook_post')).toBe('facebook')
    expect(deskForSocialPromoChannel('facebook_story')).toBe('facebook')
  })

  it('builds a paste-on-demand hydrate payload with caption + desk URL', () => {
    const detail = buildSocialPromoBrowserHydrate({
      releaseId: 'release-abc',
      releaseTitle: 'Soul Candy',
      post: {
        id: 'launch-feed',
        channel: 'instagram_feed',
        label: 'Launch feed',
        caption: 'OUT NOW — Soul Candy 🎧',
        hint: 'Street-day morning',
        asset: 'feed_square',
      },
    })
    expect(detail.kind).toBe('social_promo')
    expect(detail.desk).toBe('instagram')
    expect(detail.deskLabel).toBe('Instagram')
    expect(detail.url).toContain('instagram.com')
    expect(detail.caption).toContain('OUT NOW')
    expect(detail.pasteOnDemand).toBe(true)
  })
})
