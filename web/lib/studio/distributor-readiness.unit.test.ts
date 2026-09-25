import { describe, expect, it } from 'vitest'
import type { CopyrightReadiness } from '@/lib/studio/copyright-pipeline'
import { evaluateDistributorReadiness } from '@/lib/studio/distributor-readiness'

function baseCopyright(partial?: Partial<CopyrightReadiness['checks']>): CopyrightReadiness {
  return ({
    stage: 'ready_to_distribute',
    stage_age_days: 0,
    readiness_score: 80,
    next_best_action: { kind: 'ready', label: 'Ready', field: null },
    party_contacts: [],
    rights_packets: {},
    ops: {
      split_sheet_status: 'approved',
      producer_agreement_status: 'approved',
      sample_clearance_status: 'n_a',
      due_date: null,
      owner_name: null,
      role_queue: 'legal',
    },
    rights: {
      publisher_name: null,
      publisher_ipi: null,
      writer_ipi: null,
    },
    blockers: [],
    actions: [],
    checks: {
      has_tracks: true,
      tracks_have_audio: true,
      tracks_have_isrc: true,
      splits_total_100: true,
      has_upc: true,
      rights_intake_complete: true,
      legal_locked: true,
      legal_lock_ready: true,
      contracts_approved: true,
      composition_registered: true,
      master_registered: true,
      pro_registered: true,
      metadata_qa_passed: true,
      dsp_ingest_passed: true,
      ready_to_distribute: true,
      released: false,
      monitoring_enabled: false,
      ...partial,
    },
    ugc_pack: { opted_in: false, status: 'off' } as unknown as CopyrightReadiness['ugc_pack'],
    ugc: {} as CopyrightReadiness['ugc'],
    ingest: {
      ok: true,
      blockers: [],
      warnings: [],
      issues: [],
      checks: {
        titles_clean: true,
        apple_credits: true,
        legal_writers: true,
        collab_splits: true,
        ai_declared: true,
        origin_ok: true,
        previously_released_declared: true,
        attestations_complete: true,
        artwork_policy: true,
        dsp_genre: true,
        artist_profiles: true,
        street_date_lead: true,
        preview_clip: true,
        radio_pair: true,
        stream_continuity_masters: true,
        stream_continuity_isrcs: true,
      },
    },
  }) as unknown as CopyrightReadiness
}

describe('evaluateDistributorReadiness', () => {
  it('is partner-ready when imprint + hard delivery fields pass', () => {
    const result = evaluateDistributorReadiness(
      {
        title: 'UTOPIA',
        album_artist: 'SERGIK',
        label_name: 'SERGIKdropz',
        upc: '123',
        artwork_url: 'https://example.com/a.jpg',
        genre: 'Dance',
        release_date: '2026-10-30',
        p_line_year: 2026,
        c_line_year: 2026,
        spotify_artist_id: '7MnvMhWoSe4wYXuiI6iQ8H',
      },
      baseCopyright(),
    )
    expect(result.partnerReady).toBe(true)
    expect(result.ok).toBe(true)
    expect(result.blockers).toEqual([])
    expect(result.items.find((i) => i.id === 'imprint')?.ok).toBe(true)
    expect(result.items.find((i) => i.id === 'ddex-path')?.ok).toBe(false)
    expect(result.phases.partner_delivery.ok).toBe(true)
  })

  it('blocks when label is missing or artist-only SERGIK', () => {
    const missing = evaluateDistributorReadiness(
      { title: 'X', label_name: null, artwork_url: '/a.png', genre: 'Dance', release_date: '2026-10-01' },
      baseCopyright(),
    )
    expect(missing.partnerReady).toBe(false)
    expect(missing.blockers.some((b) => /imprint/i.test(b))).toBe(true)

    const artistAsLabel = evaluateDistributorReadiness(
      {
        title: 'X',
        label_name: 'SERGIK',
        artwork_url: '/a.png',
        genre: 'Dance',
        release_date: '2026-10-01',
      },
      baseCopyright(),
    )
    expect(artistAsLabel.items.find((i) => i.id === 'imprint')?.ok).toBe(false)
  })

  it('surfaces royalty-ops soft items from copyright checks', () => {
    const result = evaluateDistributorReadiness(
      {
        title: 'X',
        label_name: 'SERGIKdropz',
        artwork_url: '/a.png',
        genre: 'Dance',
        release_date: '2026-10-01',
      },
      baseCopyright({ splits_total_100: false, contracts_approved: false }),
    )
    expect(result.items.find((i) => i.id === 'splits-100')?.ok).toBe(false)
    expect(result.items.find((i) => i.id === 'contracts')?.ok).toBe(false)
    expect(result.items.find((i) => i.id === 'statement-ingest')?.ok).toBe(false)
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  it('greens statement / ledger / payout soft items when royalty ops signals are present', () => {
    const result = evaluateDistributorReadiness(
      {
        title: 'X',
        label_name: 'SERGIKdropz',
        artwork_url: '/a.png',
        genre: 'Dance',
        release_date: '2026-10-01',
      },
      baseCopyright(),
      {
        statementCount: 1,
        payeeCount: 2,
        ledgerEntryCount: 4,
        payoutCount: 1,
        owedCents: 0,
      },
    )
    expect(result.items.find((i) => i.id === 'statement-ingest')?.ok).toBe(true)
    expect(result.items.find((i) => i.id === 'payee-ledger')?.ok).toBe(true)
    expect(result.items.find((i) => i.id === 'payout-run')?.ok).toBe(true)
  })
})
