import { describe, expect, it } from 'vitest'
import {
  coverPacketGaps,
  enrichSplitSheet,
  hydrateRightsPacket,
  publisherApplyPatch,
  publisherFromAlbumArtist,
  proPacketStatus,
  resolveNextRightsMove,
  sergikOnlySplits,
  splitsFromCredits,
  suggestedNoSamplesClearance,
  suggestedSergikPaperwork,
  summarizeSplits,
  tracksNeedingSplitSeed,
} from '@/lib/studio/rights-ops'
import type { CopyrightReadiness } from '@/lib/studio/copyright-pipeline'

const sergikSplits = [{ name: 'SERGIK', percentage: 100 }]

function readiness(
  partial: Partial<CopyrightReadiness> & {
    next_best_action: CopyrightReadiness['next_best_action']
  },
): Pick<CopyrightReadiness, 'next_best_action' | 'checks' | 'ops' | 'rights'> {
  return {
    next_best_action: partial.next_best_action,
    checks: {
      has_tracks: true,
      tracks_have_audio: true,
      tracks_have_isrc: true,
      splits_total_100: true,
      has_upc: true,
      rights_intake_complete: false,
      legal_locked: false,
      legal_lock_ready: false,
      contracts_approved: false,
      composition_registered: false,
      master_registered: false,
      pro_registered: false,
      metadata_qa_passed: true,
      dsp_ingest_passed: true,
      ready_to_distribute: false,
      released: false,
      monitoring_enabled: false,
      ...partial.checks,
    },
    ops: {
      owner_name: null,
      role_queue: 'legal',
      split_sheet_status: 'missing',
      producer_agreement_status: 'missing',
      sample_clearance_status: 'missing',
      due_date: null,
      ...partial.ops,
    },
    rights: {
      publisher_name: 'SERGIK Music',
      publisher_ipi: null,
      writer_ipi: null,
      ...partial.rights,
    },
  }
}

describe('publisherFromAlbumArtist', () => {
  it('uses SERGIK Music as the default imprint', () => {
    expect(publisherFromAlbumArtist(null)).toBe('SERGIK Music')
    expect(publisherFromAlbumArtist('SERGIK x OG Coconut')).toBe('SERGIK Music')
  })
})

describe('splits', () => {
  it('summarizes and detects SERGIK-only 100% sheets', () => {
    expect(summarizeSplits(sergikSplits)).toMatchObject({ ok: true, total: 100 })
    expect(sergikOnlySplits([{ splits: sergikSplits }])).toBe(true)
    expect(sergikOnlySplits([{ splits: [{ name: 'SERGIK', percentage: 50 }, { name: 'Mira', percentage: 50 }] }])).toBe(
      false,
    )
  })

  it('suggests split + producer approval for SERGIK-only sheets', () => {
    expect(
      suggestedSergikPaperwork([{ splits: sergikSplits }], {
        split_sheet_status: 'missing',
        producer_agreement_status: 'missing',
      }),
    ).toEqual({
      split_sheet_status: 'approved',
      producer_agreement_status: 'approved',
    })
  })
})

describe('resolveNextRightsMove', () => {
  it('assigns missing ISRCs on Rights instead of leaving the step', () => {
    const move = resolveNextRightsMove(
      readiness({
        next_best_action: { kind: 'assign_isrc', label: 'Assign missing ISRC codes', field: null },
        checks: { tracks_have_isrc: false } as CopyrightReadiness['checks'],
      }),
    )
    expect(move.step).toBe('rights')
    expect(move.run).toBe('assign_isrcs')
  })

  it('seeds splits from credits', () => {
    const move = resolveNextRightsMove(
      readiness({
        next_best_action: { kind: 'fix_splits', label: 'Fix splits', field: null },
      }),
    )
    expect(move.run).toBe('seed_splits')
  })

  it('approves SERGIK paperwork before legal lock', () => {
    const move = resolveNextRightsMove(
      readiness({
        next_best_action: { kind: 'complete_legal_lock', label: 'Approve contracts', field: null },
        checks: {
          tracks_have_isrc: true,
          splits_total_100: true,
          contracts_approved: false,
        } as CopyrightReadiness['checks'],
      }),
      [{ splits: sergikSplits }],
    )
    expect(move.patch).toMatchObject({ split_sheet_status: 'approved' })
  })

  it('opens clearance packets when collab blocks SERGIK one-click paperwork', () => {
    const move = resolveNextRightsMove(
      readiness({
        next_best_action: { kind: 'complete_rights_intake', label: 'Intake', field: 'rights_intake_complete' },
        checks: {
          tracks_have_isrc: true,
          splits_total_100: true,
          contracts_approved: false,
        } as CopyrightReadiness['checks'],
        ops: { sample_clearance_status: 'approved' } as CopyrightReadiness['ops'],
      }),
      [{ splits: [{ name: 'SERGIK', percentage: 50 }, { name: 'OG Coconut', percentage: 50 }] }],
    )
    expect(move.run).toBe('open_contracts')
    expect(move.focus).toBe('contracts')
  })

  it('marks in-panel checklist fields', () => {
    const move = resolveNextRightsMove(
      readiness({
        next_best_action: {
          kind: 'complete_rights_intake',
          label: 'Mark rights intake complete',
          field: 'rights_intake_complete',
        },
        checks: { contracts_approved: true } as CopyrightReadiness['checks'],
      }),
    )
    expect(move.patch).toEqual({ rights_intake_complete: true })
  })
})

describe('splitsFromCredits', () => {
  it('splits billed primaries equally and defaults to SERGIK', () => {
    expect(splitsFromCredits([{ role: 'primary', name: 'SERGIK x OG Coconut' }])).toEqual([
      {
        name: 'SERGIK',
        percentage: 50,
        legal_name: 'Jordan Caboga',
        role: 'performer',
        publisher: 'SERGIK Music',
        ipi: null,
        pro: null,
      },
      {
        name: 'OG Coconut',
        percentage: 50,
        legal_name: null,
        role: 'performer',
        publisher: null,
        ipi: null,
        pro: null,
      },
    ])
    expect(splitsFromCredits([])).toEqual([
      {
        name: 'SERGIK',
        percentage: 100,
        legal_name: 'Jordan Caboga',
        role: 'performer',
        publisher: 'SERGIK Music',
        ipi: null,
        pro: null,
      },
    ])
  })

  it('reseeds a SERGIK-only sheet when a collab is billed', () => {
    const contributors = [
      { role: 'primary', name: 'SERGIK' },
      { role: 'primary', name: 'OG Coconut' },
    ]
    expect(
      enrichSplitSheet([{ name: 'SERGIK', percentage: 100 }], contributors, 'Jordan Caboga'),
    ).toMatchObject([
      { name: 'SERGIK', percentage: 50, legal_name: 'Jordan Caboga' },
      { name: 'OG Coconut', percentage: 50 },
    ])
    expect(
      tracksNeedingSplitSeed([
        { id: 't1', contributors, splits: [{ name: 'SERGIK', percentage: 100 }] },
      ]),
    ).toHaveLength(1)
  })
})

describe('cover and PRO packets', () => {
  it('flags covers missing original title or mechanical license', () => {
    expect(
      coverPacketGaps([
        { origin: 'cover', cover_original_title: 'Billie Jean', cover_original_artist: 'MJ', mechanical_licensed: true },
        { origin: 'cover', cover_original_title: '', cover_original_artist: 'MJ' },
      ]),
    ).toHaveLength(1)
  })

  it('approves sample clearance only for originals without samples', () => {
    expect(
      suggestedNoSamplesClearance([{ origin: 'original', contains_samples: false }], {
        sample_clearance_status: 'missing',
      }),
    ).toEqual({ sample_clearance_status: 'approved' })
    expect(
      suggestedNoSamplesClearance([{ origin: 'cover', contains_samples: false }], {
        sample_clearance_status: 'missing',
      }),
    ).toBeNull()
  })

  it('reads cover flags from sonic_snapshot when columns are absent', () => {
    const hydrated = hydrateRightsPacket({
      sonic_snapshot: { mechanical_licensed: true, contains_samples: false },
    })
    expect(hydrated.mechanical_licensed).toBe(true)
    expect(hydrated.contains_samples).toBe(false)
  })

  it('requires ISRCs, publisher, and writers before PRO registration', () => {
    expect(
      proPacketStatus([{ isrc_full: 'US-S6K-26-00001', contributors: [{ role: 'writer', name: 'Mach' }] }], {
        publisher_name: 'SERGIK Music',
        writer_ipi: null,
      }),
    ).toEqual({ ok: true, missing: [] })
    expect(proPacketStatus([], { publisher_name: null, writer_ipi: null }).missing).toContain('Add tracks')
  })

  it('opens the PRO packet instead of ticking honor-system registration', () => {
    const move = resolveNextRightsMove(
      readiness({
        next_best_action: { kind: 'register_pro', label: 'Open PRO', field: null },
        checks: { contracts_approved: true } as CopyrightReadiness['checks'],
      }),
    )
    expect(move.run).toBe('open_pro')
    expect(move.focus).toBe('pro')
  })
})

describe('publisherApplyPatch', () => {
  it('fills empty track publisher from the release default', () => {
    expect(publisherApplyPatch({ publisher_name: null }, { name: 'SERGIK Music', ipi: '001' })).toEqual({
      publisher_name: 'SERGIK Music',
      publisher_ipi: '001',
    })
    expect(
      publisherApplyPatch({ publisher_name: 'SERGIK Music', publisher_ipi: '001' }, { name: 'SERGIK Music', ipi: '001' }),
    ).toBeNull()
  })
})
