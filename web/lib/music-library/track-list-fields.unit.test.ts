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

  it('fills duration from audio_files when track.duration is null', () => {
    const row = mapLibraryTrackToListItem(
      { id: 't1', title: 'No Length', duration: null, audio_file_id: 'a1' },
      { audio: { duration_seconds: 227 } },
    )
    expect(row.duration).toBe(227)

    const prefersAudio = mapLibraryTrackToListItem(
      { id: 't2', title: 'Both', duration: 0, audio_file_id: 'a2' },
      { audio: { duration_seconds: 180.4 } },
    )
    expect(prefersAudio.duration).toBe(180.4)
  })

  it('prefers DistroKid release album over playlist folder name', () => {
    const row = mapLibraryTrackToListItem(
      {
        id: 't-dk',
        title: 'Soul Candy',
        artist: 'SERGIK',
        metadata: { album: 'Soul Candy', album_type: 'ep', isrc: 'QZES72569811' },
      },
      { folder: { name: 'Distrokid Exports', type: 'folder' } },
    )
    expect(row.album).toBe('Soul Candy')
    expect(row.albumType).toBe('ep')
  })

  it('marks singles from metadata on playlist dumps', () => {
    const row = mapLibraryTrackToListItem(
      {
        id: 't-single',
        title: 'How Ya',
        metadata: { album: 'How Ya', album_type: 'single' },
      },
      { folder: { name: 'Distrokid Exports', type: 'folder' } },
    )
    expect(row.album).toBe('How Ya')
    expect(row.albumType).toBe('single')
  })

  it('does not inherit crate folder cover onto tracks; EP folders still share art', () => {
    const crate = mapLibraryTrackToListItem(
      { id: 't-crate', title: 'Loose Cut', folder_id: 'deep-n-funky' },
      { folder: { name: 'DEEp n FunKy', type: 'album', artwork_url: '/images/audio/artwork/folder-deep.jpg' } },
    )
    expect(crate.artwork).toBeUndefined()

    const ep = mapLibraryTrackToListItem(
      { id: 't-ep', title: 'Soul Candy', folder_id: 'soul-candy' },
      { folder: { name: 'Soul Candy', type: 'ep', artwork_url: '/images/audio/artwork/folder-soul.jpg' } },
    )
    expect(ep.artwork).toContain('/images/audio/artwork/folder-soul.jpg')
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

  it('uses EP folder name as album when metadata has no release album', () => {
    const row = mapLibraryTrackToListItem(
      {
        id: 't-ep',
        title: 'Soul Candy',
        artist: 'SERGIK',
        folder_id: 'folder-soul-candy',
      },
      { folder: { name: 'Soul Candy', type: 'ep', artwork_url: null } },
    )
    expect(row.album).toBe('Soul Candy')
    expect(row.albumType).toBe('ep')
  })

  it('reads release title stamped under metadata.distribution', () => {
    const row = mapLibraryTrackToListItem(
      {
        id: 't-dist',
        title: 'How Ya',
        artist: 'SERGIK',
        metadata: {
          distribution: { releaseTitle: 'How Ya', releaseType: 'single' },
        },
      },
      { folder: { name: 'Distrokid Exports', type: 'folder' } },
    )
    expect(row.album).toBe('How Ya')
    expect(row.albumType).toBe('single')
  })
})

describe('leanCatalogMetadata', () => {
  it('drops analysis blobs and keeps admin stamps', () => {
    const lean = leanCatalogMetadata({
      original_date: '2018-02-02',
      catalog_overrides: { genre: 'Disco' },
      sonic_dna: { measured: { bpm: 120 } },
      album: 'Soul Candy',
      album_type: 'ep',
    })
    expect(lean).toEqual({
      original_date: '2018-02-02',
      catalog_overrides: { genre: 'Disco' },
      album: 'Soul Candy',
      album_type: 'ep',
    })
  })
})
