import { describe, expect, it } from 'vitest'
import {
  autoDetectStreamContinuityPhases,
  evaluateStreamContinuity,
  marketingCopyWithStreamContinuity,
  mergeStreamContinuity,
  parseStreamContinuity,
  streamContinuityFromMarketingCopy,
} from '@/lib/studio/stream-continuity'

describe('stream continuity', () => {
  it('parses and merges checklist state under marketing_copy', () => {
    const copy = marketingCopyWithStreamContinuity(
      { elevator_pitch: 'keep me' },
      {
        source: 'distrokid',
        old_distributor: 'distrokid',
        phases: { captured: true, identity_verified: true },
      },
    )
    expect(copy.elevator_pitch).toBe('keep me')
    const parsed = streamContinuityFromMarketingCopy(copy)
    expect(parsed?.source).toBe('distrokid')
    expect(parsed?.phases.identity_verified).toBe(true)

    const merged = mergeStreamContinuity(parsed, {
      phases: { masters_attached: true, old_takedown_safe: true },
    })
    expect(merged.phases.masters_attached).toBe(true)
    expect(merged.phases.merged_confirmed).toBe(true)
  })

  it('auto-detects masters and identity from release facts', () => {
    const detected = autoDetectStreamContinuityPhases({
      previously_released: true,
      previous_upc: '123456789012',
      upc: '123456789012',
      store_link_count: 2,
      distributor_status: 'live',
      tracks: [
        { title: 'A', isrc_full: 'QZES72569811', wav_url: 'https://cdn.example/a.wav' },
        { title: 'B', isrc_full: 'QZES72569812', wav_url: 'https://cdn.example/b.wav' },
      ],
    })
    expect(detected.captured).toBe(true)
    expect(detected.identity_verified).toBe(true)
    expect(detected.masters_attached).toBe(true)
    expect(detected.submitted_new).toBe(true)
    expect(detected.overlap_live).toBe(true)
  })

  it('blocks takedown until merge is confirmed and warns on dual-live', () => {
    const evaluation = evaluateStreamContinuity({
      previously_released: true,
      previous_isrc: 'QZES72569811',
      upc: '123456789012',
      store_link_count: 1,
      tracks: [{ title: 'A', isrc_full: 'QZES72569811', wav_url: 'https://cdn.example/a.wav' }],
      distributor_status: 'live',
      continuity: parseStreamContinuity({
        source: 'store_url',
        phases: { submitted_new: true, overlap_live: true },
      }),
    })
    expect(evaluation.active).toBe(true)
    expect(evaluation.dual_live_expected).toBe(true)
    expect(evaluation.can_takedown_old).toBe(false)
    expect(evaluation.warnings.join(' ')).toMatch(/Dual-live/i)
  })
})
