import { describe, expect, it } from 'vitest'
import {
  defaultMonetizationEnrollment,
  mergeMonetizationEnrollment,
  parseMonetizationEnrollment,
  rightsManagerFromUgc,
  socialMediaPackAttempted,
} from '@/lib/studio/monetization-enrollment'

describe('monetization enrollment', () => {
  it('starts every program unknown', () => {
    const enrollment = defaultMonetizationEnrollment()
    expect(enrollment.distrokid_audio_library.status).toBe('unknown')
    expect(enrollment.sergik_meta_rights_manager.status).toBe('unknown')
    expect(enrollment.meta_creator_facebook.annualCostCents).toBeNull()
  })

  it('rejects DistroKid Social Media Pack as a program', () => {
    const raw = { distrokid_social_media_pack: { status: 'enrolled' } }
    expect(socialMediaPackAttempted(raw)).toBe(true)
    expect(parseMonetizationEnrollment(raw).distrokid_audio_library.status).toBe('unknown')
  })

  it('keeps a release fee on the release and ignores a bad status', () => {
    const parsed = parseMonetizationEnrollment({
      distrokid_audio_library: {
        status: 'enrolled',
        sourceUrl: 'https://support.distrokid.com/hc/en-us/articles/32587715243667',
        checkedOn: '2026-10-11',
        annualCostCents: 0,
        commissionPercent: 20,
      },
      sergik_meta_rights_manager: { status: 'live' },
    })
    expect(parsed.distrokid_audio_library.status).toBe('enrolled')
    expect(parsed.distrokid_audio_library.annualCostCents).toBe(0)
    expect(parsed.distrokid_audio_library.commissionPercent).toBe(20)
    expect(parsed.sergik_meta_rights_manager.status).toBe('unknown')
  })

  it('patches one program without clearing the others', () => {
    const current = parseMonetizationEnrollment({
      meta_creator_instagram: { status: 'pending', checkedOn: '2026-10-01' },
    })
    const next = mergeMonetizationEnrollment(current, {
      meta_creator_facebook: { status: 'not_enrolled' },
    })
    expect(next.meta_creator_instagram.status).toBe('pending')
    expect(next.meta_creator_facebook.status).toBe('not_enrolled')
  })

  it('copies only the SERGIK Meta claim from the UGC pack', () => {
    const live = rightsManagerFromUgc({ optedIn: true, meta: true, status: 'live' }, '2026-10-11')
    expect(live.status).toBe('enrolled')
    expect(live.reviewer).toBe('ugc_pack')
    expect(rightsManagerFromUgc({ optedIn: false, meta: true, status: 'live' }, '2026-10-11').status).toBe('not_enrolled')
    expect(rightsManagerFromUgc({ optedIn: true, meta: false, status: 'live' }, '2026-10-11').status).toBe('not_enrolled')
  })
})
