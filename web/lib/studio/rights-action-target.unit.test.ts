import { describe, expect, it } from 'vitest'
import {
  partyFromWriterLegalLabel,
  parseIssueTrackId,
  resolveCopyrightActionTarget,
  resolveIngestIssueTarget,
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
