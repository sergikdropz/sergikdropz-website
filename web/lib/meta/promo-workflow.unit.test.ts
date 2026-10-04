import { describe, expect, it } from 'vitest'
import { generateSocialPromoPlan } from '@/lib/studio/social-promo'
import {
  armImageSlots,
  imageSlotsToArm,
  inferMetaPromoAction,
  isMetaPromoIntent,
} from '@/lib/meta/promo-workflow'

describe('meta promo workflow intent', () => {
  it('routes promo publishing away from a generic strategy pack', () => {
    expect(isMetaPromoIntent('Publish the Meta promo schedule for this release')).toBe(true)
    expect(isMetaPromoIntent('site audit of the homepage CTA')).toBe(false)
    expect(inferMetaPromoAction('status of the social promo schedule')).toBe('status')
    expect(inferMetaPromoAction('generate the promo schedule')).toBe('generate')
    expect(inferMetaPromoAction('arm image slots as assets ready')).toBe('arm')
    expect(inferMetaPromoAction('publish due Instagram slots')).toBe('publish')
    expect(inferMetaPromoAction('run the automated promo pipeline')).toBe('advance')
  })

  it('arms only planned image slots', () => {
    const plan = generateSocialPromoPlan({ streetDate: '2026-09-24', title: 'Are We Awake?' })
    const ids = imageSlotsToArm(plan.posts)
    expect(ids.length).toBeGreaterThan(0)
    expect(ids).not.toContain('spotlight-story')
    const armed = armImageSlots(plan)
    expect(armed.posts.find((post) => post.id === ids[0])?.status).toBe('ready')
    expect(armed.posts.find((post) => post.channel === 'instagram_reel')?.status).toBe('planned')
  })
})
