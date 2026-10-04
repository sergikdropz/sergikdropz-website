import { describe, expect, it } from 'vitest'
import { generateSocialPromoPlan } from '@/lib/studio/social-promo'
import { publicHttpsImageUrl, selectPostsToPublish } from '@/lib/meta/publish-eligibility'

const ART = 'https://cdn.example.com/artwork.jpg'

describe('meta publish eligibility', () => {
  it('accepts public https artwork and rejects local files', () => {
    expect(publicHttpsImageUrl(ART)).toBe(ART)
    expect(publicHttpsImageUrl('/images/cover.jpg', 'https://sergikdropz.com')).toBe(
      'https://sergikdropz.com/images/cover.jpg'
    )
    expect(publicHttpsImageUrl('http://cdn.example.com/a.jpg')).toBeNull()
    expect(publicHttpsImageUrl('https://localhost/a.jpg')).toBeNull()
    expect(publicHttpsImageUrl('/images/cover.jpg', 'http://localhost:3001')).toBeNull()
  })

  it('publishes ready image slots that are due and waits on future Instagram', () => {
    const plan = generateSocialPromoPlan({
      streetDate: '2026-09-24',
      title: 'Are We Awake?',
      nowIso: '2026-09-01T00:00:00.000Z',
    })
    for (const post of plan.posts) post.status = 'ready'
    const feed = plan.posts.find((post) => post.id === 'artwork-feed')!
    const fb = plan.posts.find((post) => post.id === 'artwork-fb')!
    const reel = plan.posts.find((post) => post.channel === 'instagram_reel')!

    const due = selectPostsToPublish(plan, {
      mode: 'due',
      now: new Date('2026-09-17T19:05:00.000Z'),
      imageUrl: ART,
    })
    expect(due.find((row) => row.post.id === feed.id)?.action).toBe('ig_feed')
    const fbDecision = due.find((row) => row.post.id === fb.id)
    expect(fbDecision?.action).toBe('fb_feed')
    expect(fbDecision?.scheduledUnix).toBeTruthy()
    expect(due.find((row) => row.post.id === reel.id)?.action).toBe('skip')

    const early = selectPostsToPublish(plan, {
      mode: 'due',
      now: new Date('2026-09-01T00:00:00.000Z'),
      imageUrl: ART,
    })
    expect(early.find((row) => row.post.id === feed.id)?.reason).toMatch(/scheduled time/i)

    feed.meta_id = '123'
    const again = selectPostsToPublish(plan, {
      mode: 'now',
      postId: feed.id,
      now: new Date('2026-09-17T19:05:00.000Z'),
      imageUrl: ART,
    })
    expect(again[0]?.action).toBe('skip')
    expect(again[0]?.reason).toMatch(/Already published/)
  })

  it('does not auto-publish slots that are still planned', () => {
    const plan = generateSocialPromoPlan({
      streetDate: '2026-09-24',
      title: 'Are We Awake?',
    })
    const feed = plan.posts.find((post) => post.channel === 'instagram_feed')!
    const due = selectPostsToPublish(plan, {
      mode: 'due',
      now: new Date('2099-01-01T00:00:00.000Z'),
      imageUrl: ART,
    })
    expect(due.find((row) => row.post.id === feed.id)).toBeUndefined()

    const now = selectPostsToPublish(plan, {
      mode: 'now',
      postId: feed.id,
      now: new Date('2020-01-01T00:00:00.000Z'),
      imageUrl: null,
    })
    expect(now[0]?.reason).toMatch(/https/)
  })
})
