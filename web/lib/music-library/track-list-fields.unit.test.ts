import { describe, expect, it } from 'vitest'
import { leanCatalogMetadata, mapLibraryTrackToListItem } from './track-list-fields'

describe('mapLibraryTrackToListItem', () => {
  it('keeps created date and catalog overrides on lean list rows', () => {
    const row = mapLibraryTrackToListItem({
      id: 't1',
      title: 'Old Title',
      artist: 'SERGIK',
      genre: 'Hip-Hop',
      date_created: '2019-04-12',
      year: 2019,
      date: '2020-01-01',
      metadata: {
        original_date: '2019-04-12',
        original_date_source: 'manual',
        catalog_overrides: { genre: 'Funky House', bpm: 118, title: 'Locked Title' },
        sonic_dna: { huge: true },
      },
    })
    expect(row.date_created).toBe('2019-04-12')
    expect(row.date).toBe('2020-01-01')
    expect(row.year).toBe(2019)
    expect(row.genre).toBe('Funky House')
    expect(row.title).toBe('Locked Title')
    expect(row.bpm).toBe(118)
    expect(row.metadata?.original_date).toBe('2019-04-12')
    expect(row.metadata?.catalog_overrides?.genre).toBe('Funky House')
    expect(row.metadata?.sonic_dna).toBeUndefined()
  })
})

describe('leanCatalogMetadata', () => {
  it('drops analysis blobs and keeps admin stamps', () => {
    const lean = leanCatalogMetadata({
      original_date: '2018-02-02',
      catalog_overrides: { genre: 'Disco' },
      sonic_dna: { measured: { bpm: 120 } },
    })
    expect(lean).toEqual({
      original_date: '2018-02-02',
      catalog_overrides: { genre: 'Disco' },
    })
  })
})
