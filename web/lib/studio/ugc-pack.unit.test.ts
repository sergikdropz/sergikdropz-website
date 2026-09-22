import { describe, expect, it } from 'vitest'
import {
  mergeUgcPack,
  parseUgcPack,
  SERGIK_UGC_PARTNER,
  ugcPackEligibility,
  ugcPackNextAction,
  ugcPackPartnerLabel,
  ugcPackPlatformCount,
  ugcPackStatusSteps,
} from '@/lib/studio/ugc-pack'

describe('ugc pack', () => {
  it('always belongs to SERGIK, even if an old DistroKid payload is stored', () => {
    expect(parseUgcPack(null)).toMatchObject({
      opted_in: false,
      partner: SERGIK_UGC_PARTNER,
      status: 'not_opted',
      notes: '',
      enrolled_at: null,
      live_at: null,
    })
    expect(parseUgcPack({ opted_in: true, partner: 'distrokid', status: 'submitted' })).toMatchObject({
      opted_in: true,
      partner: SERGIK_UGC_PARTNER,
      status: 'submitted',
      youtube: true,
      tiktok: true,
      meta: true,
    })
    expect(ugcPackPartnerLabel('distrokid')).toBe('SERGIK')
  })

  it('merges patches, stamps enrollment / live times, and keeps SERGIK', () => {
    const enrolledAt = new Date('2026-09-18T12:00:00.000Z')
    const merged = mergeUgcPack(
      { opted_in: false, partner: 'distrokid' },
      { opted_in: true, status: 'submitted', tiktok: false, notes: 'CMS hold' },
      enrolledAt
    )
    expect(merged).toMatchObject({
      opted_in: true,
      partner: SERGIK_UGC_PARTNER,
      status: 'submitted',
      youtube: true,
      tiktok: false,
      meta: true,
      notes: 'CMS hold',
      enrolled_at: enrolledAt.toISOString(),
      live_at: null,
    })

    const liveAt = new Date('2026-09-19T12:00:00.000Z')
    const live = mergeUgcPack(merged, { status: 'live' }, liveAt)
    expect(live.live_at).toBe(liveAt.toISOString())
    expect(live.enrolled_at).toBe(enrolledAt.toISOString())

    // Legacy opted-in rows without enrolled_at get a stamp on any save.
    const backfillAt = new Date('2026-09-20T12:00:00.000Z')
    const backfilled = mergeUgcPack(
      { opted_in: true, status: 'submitted', enrolled_at: null },
      { notes: 're-save' },
      backfillAt
    )
    expect(backfilled.enrolled_at).toBe(backfillAt.toISOString())
  })

  it('queues opt-in on SERGIK and warns on missing clearance', () => {
    const queued = mergeUgcPack(null, { opted_in: true })
    expect(queued.status).toBe('submitted')
    expect(queued.partner).toBe(SERGIK_UGC_PARTNER)

    const result = ugcPackEligibility({
      pack: queued,
      sampleClearance: 'missing',
      masterRegistered: false,
      compositionRegistered: true,
    })
    expect(result.eligible).toBe(false)
    expect(result.warnings.some((note) => note.includes('Sample clearance'))).toBe(true)
    expect(result.warnings.some((note) => note.includes('Queued with SERGIK'))).toBe(false)
    expect(result.warnings.some((note) => /Pick a partner/.test(note))).toBe(false)

    const next = ugcPackNextAction({ pack: queued, eligibility: result })
    expect(next.kind).toBe('clearance')
  })

  it('exposes platform counts, stepper, and live next action', () => {
    const pack = parseUgcPack({
      opted_in: true,
      status: 'live',
      youtube: true,
      tiktok: false,
      meta: true,
    })
    expect(ugcPackPlatformCount(pack)).toBe(2)
    expect(ugcPackStatusSteps('live', true).map((s) => s.state)).toEqual(['done', 'done', 'current'])
    expect(ugcPackNextAction({ pack, eligibility: { eligible: true, warnings: [] } }).kind).toBe(
      'ready'
    )
    expect(ugcPackStatusSteps('ineligible', true).some((s) => s.state === 'blocked')).toBe(true)
  })
})
