import { describe, expect, it } from 'vitest'
import {
  partyFromWriterLegalLabel,
  parseIssueTrackId,
  resolveCopyrightActionTarget,
  resolveIngestIssueTarget,
  studioTargetForBlocker,
  studioTargetLabel,
} from './rights-action-target'

describe('rights-action-target', () => {
  it('routes writer legal blockers to Catalog legal-name field', () => {
    const label = 'Add a collaborator legal name for Lugh Haurie (first and last, not the stage name).'
    expect(partyFromWriterLegalLabel(label)).toBe('Lugh Haurie')
    expect(
      resolveIngestIssueTarget({
        id: 'writer:track-123',
        label,
      }),
    ).toEqual({
      step: 'catalog',
      section: 'writer_legal',
      trackId: 'track-123',
      party: 'Lugh Haurie',
    })
  })

  it('parses track ids from issue prefixes', () => {
    expect(parseIssueTrackId('apple:abc')).toBe('abc')
    expect(parseIssueTrackId('genre')).toBeUndefined()
  })

  it('routes genre and artist profile blockers', () => {
    expect(resolveIngestIssueTarget({ id: 'genre', label: 'Pick a DSP primary genre' })).toEqual({
      step: 'metadata',
      section: 'genre',
    })
    expect(
      resolveIngestIssueTarget({
        id: 'youtube-artist',
        label: 'Add the YouTube channel',
      }),
    ).toEqual({
      step: 'delivery',
      section: 'artist_profiles',
    })
  })

  it('uses issue_id on complete_dsp_ingest actions', () => {
    expect(
      resolveCopyrightActionTarget({
        kind: 'complete_dsp_ingest',
        label: 'Apple Music needs a producer credit.',
        issue_id: 'apple:t1',
      }),
    ).toEqual({
      step: 'catalog',
      section: 'credits',
      trackId: 't1',
    })
  })

  it('routes mission blocker sentences to the matching studio area', () => {
    expect(
      studioTargetForBlocker(
        'Track splits must total 100% on every table (master and composition each, once both tables exist).',
      ),
    ).toEqual({ step: 'catalog', section: 'splits' })
    expect(studioTargetForBlocker('Assign ISRC codes to all tracks.')).toEqual({
      step: 'rights',
      section: 'isrc',
    })
    expect(studioTargetForBlocker('All contract statuses must be approved.')).toEqual({
      step: 'rights',
      section: 'contracts',
    })
    expect(
      studioTargetLabel({ step: 'catalog', section: 'splits' }),
    ).toBe('Catalog · Splits')
  })

  it('prefers the ingest issue id when the blocker text matches', () => {
    expect(
      studioTargetForBlocker('Apple Music needs a producer credit.', [
        { id: 'apple:t1', label: 'Apple Music needs a producer credit.' },
      ]),
    ).toEqual({
      step: 'catalog',
      section: 'credits',
      trackId: 't1',
    })
  })

  it('routes register and contract actions on Rights', () => {
    expect(
      resolveCopyrightActionTarget({
        kind: 'register_pro',
        label: 'Open PRO',
      }),
    ).toEqual({ step: 'rights', section: 'pro' })
    expect(
      resolveCopyrightActionTarget({
        kind: 'complete_legal_lock',
        label: 'Approve contracts',
        field: null,
      }),
    ).toEqual({ step: 'rights', section: 'contracts' })
  })
})
