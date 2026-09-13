import { describe, expect, it } from 'vitest'
import { coerceLibraryApiTrack, leanCatalogMetadata, mapLibraryTrackToListItem } from './track-list-fields'

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

  it('ships beat_grid_offset including explicit zero for player restore', () => {
    const zero = mapLibraryTrackToListItem({
      id: 't1',
      title: 'Zero Grid',
      beat_grid_offset: 0,
      sonic_dna: { gridManual: true, measured: { gridOffsetSec: 0, gridManual: true } },
    })
    expect(zero.beat_grid_offset).toBe(0)
    expect(zero.grid_manual).toBe(true)

    const phase = mapLibraryTrackToListItem({
      id: 't2',
      title: 'Phased',
      beat_grid_offset: 0.042,
    })
    expect(phase.beat_grid_offset).toBe(0.042)
    expect(phase.grid_manual).toBeUndefined()
  })
})

describe('coerceLibraryApiTrack', () => {
  it('maps a raw PUT row onto list fields and keeps catalog overrides', () => {
    const row = coerceLibraryApiTrack({
      id: 't1',
      title: 'Bird Talk',
      artist: 'Andino x SERGIK',
      genre: 'Experimental Bass',
      folder_id: 'folder-1',
      artwork_url: '/covers/bird.png',
      file_url: '/audio/bird.mp3',
      bpm: 140,
      metadata: { catalog_overrides: { genre: 'Experimental Bass', bpm: 140 } },
    })
    expect(row?.folderId).toBe('folder-1')
    expect(row?.artwork).toContain('/covers/bird.png')
    expect(row?.genre).toBe('Experimental Bass')
    expect(row?.bpm).toBe(140)
    expect(row?.metadata?.catalog_overrides?.genre).toBe('Experimental Bass')
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
