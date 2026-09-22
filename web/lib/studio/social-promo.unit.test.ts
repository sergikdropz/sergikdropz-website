import { describe, expect, it } from 'vitest'
import {
  addDaysYmd,
  defaultCaptionForSlot,
  generateSocialPromoPlan,
  mergeSocialPromoPlan,
  parseSocialPromoPlan,
  summarizeSocialPromo,
  zonedDateTimeIso,
} from '@/lib/studio/social-promo'

describe('social promo schedule', () => {
  it('offsets street date and stamps PT local windows', () => {
    expect(addDaysYmd('2026-09-24', -7)).toBe('2026-09-17')
    expect(addDaysYmd('2026-09-24', 0)).toBe('2026-09-24')
    const iso = zonedDateTimeIso('2026-09-24', '12:00')
    expect(iso).toBeTruthy()
    expect(iso!.endsWith('Z')).toBe(true)
  })

  it('generates Meta/IG cadence with captions', () => {
    const plan = generateSocialPromoPlan({
      streetDate: '2026-09-24',
      title: 'Are We Awake?',
      artist: 'SERGIK',
      socialCaption: 'OUT NOW — Are We Awake?',
      smartLink: 'https://sergikdropz.com/l/awake',
      nowIso: '2026-09-17T20:00:00.000Z',
    })

    expect(plan.posts.length).toBeGreaterThanOrEqual(10)
    expect(plan.street_date).toBe('2026-09-24')
    expect(plan.posts.some((p) => p.channel === 'instagram_reel')).toBe(true)
    expect(plan.posts.some((p) => p.channel === 'facebook_story')).toBe(true)
    expect(plan.posts.every((p) => p.scheduled_at)).toBe(true)

    const launch = plan.posts.find((p) => p.id === 'launch-feed')
    expect(launch?.caption).toMatch(/OUT NOW/)
    expect(
      defaultCaptionForSlot(
        { id: 'teaser', label: 'Teaser', day_offset: -14 },
        { title: 'UTOPIA', artist: 'SERGIK' }
      )
    ).toMatch(/14 days out/)
  })

  it('parses and summarizes plans', () => {
    const plan = generateSocialPromoPlan({
      streetDate: '2026-10-08',
      title: 'Staying A Vibe',
    })
    plan.posts[0]!.status = 'posted'
    plan.posts[1]!.status = 'ready'
    const summary = summarizeSocialPromo(plan)
    expect(summary.has_plan).toBe(true)
    expect(summary.posted).toBe(1)
    expect(summary.ready).toBe(1)
    expect(summary.next_label).toBeTruthy()

    const roundTrip = parseSocialPromoPlan(JSON.parse(JSON.stringify(plan)))
    expect(roundTrip.posts).toHaveLength(plan.posts.length)
  })

  it('merges partial post status patches without dropping the row', () => {
    const plan = generateSocialPromoPlan({
      streetDate: '2026-09-24',
      title: 'Are We Awake?',
    })
    const firstId = plan.posts[0]!.id
    const merged = mergeSocialPromoPlan(plan, {
      posts: [{ id: firstId, status: 'ready' }],
    })
    expect(merged.posts.find((p) => p.id === firstId)?.status).toBe('ready')
    expect(merged.posts.find((p) => p.id === firstId)?.channel).toBe(plan.posts[0]!.channel)
    expect(merged.posts).toHaveLength(plan.posts.length)
  })

  it('allows plans without street date (unscheduled slots)', () => {
    const plan = generateSocialPromoPlan({ streetDate: null, title: 'In The Streets' })
    expect(plan.posts.every((p) => p.scheduled_at === null)).toBe(true)
    expect(summarizeSocialPromo(plan).next_at).toBeNull()
  })
})
