import { describe, expect, it } from 'vitest'
import type { CopyrightReadiness } from '@/lib/studio/copyright-pipeline'
import {
  buildPipelineIntegrationChips,
  integrationRiskBoost,
  nextActionStep,
  summarizePipelineIntegrationAlerts,
} from '@/lib/studio/pipeline-integrations'
import { DEFAULT_UGC_PACK } from '@/lib/studio/ugc-pack'

function baseCopyright(overrides: Partial<CopyrightReadiness> = {}): CopyrightReadiness {
  return {
    stage: 'rights_intake',
    readiness_score: 40,
    stage_age_days: 2,
    next_best_action: {
      kind: 'complete_dsp_ingest',
      label: 'Add songwriter legal names',
      field: null,
    },
    ops: {
      owner_name: null,
      role_queue: 'legal',
      split_sheet_status: 'missing',
      producer_agreement_status: 'missing',
      sample_clearance_status: 'approved',
      due_date: null,
    },
    rights: { publisher_name: null, publisher_ipi: null, writer_ipi: null },
    party_contacts: [],
    rights_packets: {},
    blockers: ['DSP ingest incomplete'],
    actions: [],
    checks: {
      has_tracks: true,
      tracks_have_audio: true,
      tracks_have_isrc: true,
      splits_total_100: true,
      has_upc: true,
      rights_intake_complete: true,
      legal_locked: false,
      legal_lock_ready: false,
      contracts_approved: false,
      composition_registered: false,
      master_registered: false,
      pro_registered: false,
      metadata_qa_passed: false,
      dsp_ingest_passed: false,
      ready_to_distribute: false,
      released: false,
      monitoring_enabled: false,
    },
    ugc_pack: { ...DEFAULT_UGC_PACK },
    ugc: { eligible: true, warnings: [] },
    ingest: {
      ok: false,
      blockers: ['Add songwriter legal names'],
      warnings: [],
      issues: [],
      checks: {
        titles_clean: true,
        apple_credits: true,
        legal_writers: false,
        collab_splits: true,
        ai_declared: true,
        origin_ok: true,
        previously_released_declared: true,
        attestations_complete: false,
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
    ...overrides,
  }
}

describe('pipeline integrations', () => {
  it('builds chips for DSP, contracts, UGC, stores, collab, marketing', () => {
    const chips = buildPipelineIntegrationChips({
      copyright: baseCopyright({
        ugc_pack: { ...DEFAULT_UGC_PACK, opted_in: true, status: 'submitted' },
        party_contacts: [{ stage: 'OG Coconut', email: 'og@example.com' }],
        ops: {
          owner_name: 'Jordan',
          role_queue: 'legal',
          split_sheet_status: 'pending',
          producer_agreement_status: 'pending',
          sample_clearance_status: 'approved',
          due_date: null,
        },
      }),
      storeLinkCount: 0,
      targetStoreCount: 3,
      collab: { collaboratorCount: 2, pendingReviews: 1 },
      hasCampaign: false,
      hasSmartLink: true,
    })

    expect(chips.map((c) => c.id)).toEqual([
      'marketing',
      'press',
      'delivery',
      'ingest',
      'contracts',
      'ugc',
      'collab',
    ])
    expect(chips.find((c) => c.id === 'ingest')?.tone).toBe('bad')
    expect(chips.find((c) => c.id === 'ugc')?.detail).toBe('Queued')
    expect(chips.find((c) => c.id === 'collab')?.detail).toBe('1 pending')
    expect(chips.find((c) => c.id === 'delivery')?.detail).toBe('3 target(s)')
    expect(chips.find((c) => c.id === 'marketing')?.detail).toBe('Link only')
  })

  it('summarizes cross-release integration alerts', () => {
    const alerts = summarizePipelineIntegrationAlerts([
      {
        copyright: baseCopyright(),
        storeLinkCount: 0,
        collab: { collaboratorCount: 1, pendingReviews: 2 },
      },
      {
        copyright: baseCopyright({
          checks: {
            ...baseCopyright().checks,
            dsp_ingest_passed: true,
            contracts_approved: true,
          },
          ugc_pack: { ...DEFAULT_UGC_PACK, opted_in: true, status: 'submitted' },
        }),
        storeLinkCount: 2,
        collab: { collaboratorCount: 0, pendingReviews: 0 },
      },
    ])

    expect(alerts.dsp_gap_count).toBe(1)
    expect(alerts.ugc_queued_count).toBe(1)
    expect(alerts.collab_pending_count).toBe(2)
    expect(alerts.contracts_open_count).toBe(1)
    expect(alerts.stores_empty_count).toBe(1)
  })

  it('boosts risk for ingest gaps and pending collab', () => {
    expect(
      integrationRiskBoost(
        {
          copyright: baseCopyright(),
          collab: { collaboratorCount: 1, pendingReviews: 1 },
        },
        10
      )
    ).toBeGreaterThanOrEqual(25)
    expect(nextActionStep(baseCopyright())).toBe('rights')
  })
})
