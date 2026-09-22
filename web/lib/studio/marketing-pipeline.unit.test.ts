import { describe, expect, it } from 'vitest'
import {
  buildMarketingNextAction,
  daysUntilLocalDate,
  marketingCountdownLabel,
  parseLocalDateOnly,
  resolveMarketingPhase,
  summarizeMarketingPipelineAlerts,
  type MarketingPipelineRow,
} from '@/lib/studio/marketing-pipeline'
import { DEFAULT_UGC_PACK } from '@/lib/studio/ugc-pack'

function row(partial: Partial<MarketingPipelineRow>): MarketingPipelineRow {
  return {
    id: 'r1',
    title: 'Test',
    type: 'Ep',
    release_date: null,
    slate_date: null,
    presave_date: null,
    genre: 'Dance',
    artwork: null,
    description: 'x'.repeat(100),
    source: 'distribution',
    distributor_status: 'draft',
    album_artist: 'SERGIK',
    upc: null,
    track_count: 5,
    target_store_count: 16,
    store_link_count: 0,
    store_live_count: 0,
    store_links: [],
    has_press: true,
    has_marketing_copy: true,
    marketing_copy_filled: 3,
    campaign: null,
    smart_link_data: null,
    collab: { collaboratorCount: 0, pendingReviews: 0 },
    copyright: {
      stage: 'rights_intake',
      readiness_score: 40,
      next_best_action: { kind: 'complete_dsp_ingest', label: 'Set a street date.', field: null },
      checks: {
        dsp_ingest_passed: false,
        contracts_approved: false,
        ready_to_distribute: false,
      },
      ugc_pack: { ...DEFAULT_UGC_PACK },
      party_contact_count: 0,
      ingest_blocker: 'Set a street date.',
    },
    phase: 'date_tbd',
    days_to_release: null,
    date_label: 'Date TBD',
    countdown_label: 'Date TBD',
    integrations: [],
    next_action: {
      kind: 'catalog',
      label: 'Set street date',
      href: '/studio/releases/r1?step=metadata',
    },
    social_promo: {
      total: 0,
      posted: 0,
      ready: 0,
      planned: 0,
      next_at: null,
      next_label: null,
      has_plan: false,
    },
    ...partial,
  }
}

describe('marketing pipeline dates', () => {
  it('parses YYYY-MM-DD as local calendar day', () => {
    const date = parseLocalDateOnly('2026-01-01')
    expect(date?.getFullYear()).toBe(2026)
    expect(date?.getMonth()).toBe(0)
    expect(date?.getDate()).toBe(1)
  })

  it('does not mark a future local date as released via UTC shift', () => {
    const now = new Date(2026, 8, 17) // Sep 17 2026 local
    expect(daysUntilLocalDate('2026-09-24', now)).toBe(7)
    expect(resolveMarketingPhase({
      distributorStatus: 'draft',
      releaseDate: null,
      hasCampaign: false,
      hasSmartLink: false,
      now,
    })).toBe('date_tbd')
    expect(resolveMarketingPhase({
      distributorStatus: 'draft',
      releaseDate: '2026-01-01',
      hasCampaign: false,
      hasSmartLink: false,
      now,
    })).toBe('past_undelivered')
    expect(marketingCountdownLabel('date_tbd', null)).toBe('Date TBD')
  })
})

describe('marketing next action + alerts', () => {
  it('prioritizes press then campaign launch', () => {
    expect(
      buildMarketingNextAction({
        id: 'abc',
        phase: 'date_tbd',
        hasCampaign: false,
        hasSmartLink: false,
        hasPress: false,
        storeLinkCount: 0,
        storeLiveCount: 0,
        targetStoreCount: 16,
        collab: { collaboratorCount: 0, pendingReviews: 0 },
        copyright: null,
      }).kind
    ).toBe('press')

    expect(
      buildMarketingNextAction({
        id: 'abc',
        phase: 'needs_launch',
        hasCampaign: false,
        hasSmartLink: false,
        hasPress: true,
        storeLinkCount: 0,
        storeLiveCount: 0,
        targetStoreCount: 16,
        collab: { collaboratorCount: 0, pendingReviews: 0 },
        copyright: null,
      }).label
    ).toMatch(/campaign/i)
  })

  it('scopes integration alerts to non-live rows and respects target stores', () => {
    const alerts = summarizeMarketingPipelineAlerts([
      row({
        phase: 'date_tbd',
        target_store_count: 16,
        store_link_count: 0,
        campaign: null,
        has_press: true,
      }),
      row({
        id: 'live',
        phase: 'live',
        distributor_status: 'live',
        target_store_count: 0,
        store_link_count: 0,
        copyright: {
          stage: 'released',
          readiness_score: 100,
          next_best_action: { kind: 'ready', label: 'Ready', field: null },
          checks: {
            dsp_ingest_passed: false,
            contracts_approved: false,
            ready_to_distribute: true,
          },
          ugc_pack: { ...DEFAULT_UGC_PACK },
          party_contact_count: 0,
          ingest_blocker: null,
        },
      }),
    ])

    expect(alerts.date_tbd_count).toBe(1)
    expect(alerts.live_count).toBe(1)
    expect(alerts.stores_empty_count).toBe(0) // 16 targets on active row
    expect(alerts.dsp_gap_count).toBe(1) // live excluded
    expect(alerts.missing_campaign_count).toBe(1)
  })
})
