import { describe, expect, it } from 'vitest'
import { metaMonetizationSystems } from '@/lib/studio/monetization-readiness'

const base = {
  pageName: 'Sergikdropz',
  igUsername: 'sergikdropz',
  recordingCents: 927,
  creatorCents: 0,
  instagramInsights: true,
}

describe('monetization readiness', () => {
  it('keeps Stars and Subscriptions closed below Meta’s follower rules', () => {
    const systems = metaMonetizationSystems({ ...base, pageFollowers: 302, igFollowers: 2164 })
    expect(systems.find((row) => row.id === 'facebook_stars')?.state).toBe('blocked')
    expect(systems.find((row) => row.id === 'meta_subscriptions')?.state).toBe('blocked')
    expect(systems.find((row) => row.id === 'facebook_stars')?.detail).toContain('302')
    expect(systems.find((row) => row.id === 'meta_subscriptions')?.detail).toContain('2,164')
    expect(systems.some((row) => row.state === 'running' && /enrolled/i.test(row.detail))).toBe(false)
  })

  it('opens Stars at 500 followers and Subscriptions only at 5,000', () => {
    const stars = metaMonetizationSystems({ ...base, pageFollowers: 500, igFollowers: 2164 })
    expect(stars.find((row) => row.id === 'facebook_stars')?.state).toBe('waiting')
    expect(stars.find((row) => row.id === 'meta_subscriptions')?.state).toBe('blocked')

    const both = metaMonetizationSystems({ ...base, pageFollowers: 302, igFollowers: 5000 })
    expect(both.find((row) => row.id === 'meta_subscriptions')?.state).toBe('waiting')
  })

  it('keeps recording royalties running when a statement has money', () => {
    const systems = metaMonetizationSystems({ ...base, pageFollowers: 302, igFollowers: 2164 })
    expect(systems.find((row) => row.id === 'recording_royalties')?.state).toBe('running')
    expect(systems.find((row) => row.id === 'instagram_creator')?.detail).toContain('writes nothing')
  })
})
