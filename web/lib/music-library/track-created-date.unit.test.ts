import { describe, expect, it } from 'vitest'
import {
  createdDateFromTrack,
  normalizeTrackCreatedDate,
  persistedCreatedDateFields,
  preserveCreatedDateMetadata,
} from './track-created-date'

describe('track created date', () => {
  it('normalizes ISO and YYYY-MM-DD', () => {
    expect(normalizeTrackCreatedDate('2019-04-12')).toBe('2019-04-12')
    expect(normalizeTrackCreatedDate('2019-04-12T08:11:00.000Z')).toBe('2019-04-12')
    expect(normalizeTrackCreatedDate('')).toBe(null)
    expect(normalizeTrackCreatedDate(null)).toBe(null)
  })

  it('prefers date_created column over metadata', () => {
    expect(
      createdDateFromTrack({
        date_created: '2018-01-02',
        metadata: { original_date: '2020-09-09' },
      }),
    ).toBe('2018-01-02')
  })

  it('does not let empty sync metadata wipe an existing created date', () => {
    const merged = preserveCreatedDateMetadata(
      { original_date: '2016-07-04', original_date_source: 'export_folder' },
      {},
    )
    expect(merged.original_date).toBe('2016-07-04')
    expect(merged.original_date_source).toBe('export_folder')
  })

  it('ignores accidental original_date null from an empty form save', () => {
    const merged = preserveCreatedDateMetadata(
      { original_date: '2016-07-04' },
      { original_date: null, sonic_dna_updated_at: 'now' },
    )
    expect(merged.original_date).toBe('2016-07-04')
  })

  it('stamps date_created + metadata together for upserts', () => {
    const persisted = persistedCreatedDateFields({
      existing: { metadata: { original_date: '2014-03-01' }, date_created: '2014-03-01', year: 2014 },
      incoming: { metadata: {} },
    })
    expect(persisted.date_created).toBe('2014-03-01')
    expect(persisted.metadata.original_date).toBe('2014-03-01')
    expect(persisted.year).toBe(2014)
  })
})
