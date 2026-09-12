import { describe, expect, it } from 'vitest'
import {
  defaultSongTableOptionalColumns,
  reorderColumns,
  sortSongTableTracks,
  SONG_TABLE_EP_DEFAULT_OPTIONAL_COLUMNS,
  visibleColumnOrder,
  visibleSelectionRangeIds,
  type SongTableReorderableColumn,
} from './song-table-columns'
import type { Track } from '@/utils/musicLibraryApi'

const sample = (overrides: Partial<Track> = {}): Track =>
  ({
    id: '1',
    title: 'Alpha',
    artist: 'SERGIK',
    file: 'a.mp3',
    ...overrides,
  }) as Track

describe('reorderColumns', () => {
  it('moves a column before the drop target', () => {
    const order: SongTableReorderableColumn[] = ['title', 'artist', 'album', 'bpm']
    expect(reorderColumns(order, 'bpm', 'artist')).toEqual(['title', 'bpm', 'artist', 'album'])
  })
})

describe('visibleColumnOrder', () => {
  it('filters dna without admin and hidden optional columns', () => {
    const order: SongTableReorderableColumn[] = ['title', 'dna', 'artist', 'bpm']
    const visible = new Set(['artist'] as const)
    expect(visibleColumnOrder(order, visible, false)).toEqual(['title', 'artist'])
    expect(visibleColumnOrder(order, visible, true)).toEqual(['title', 'dna', 'artist'])
  })
})

describe('EP column defaults', () => {
  it('defaults EP optional columns to Artist, Album, Time, Genre, Subgenre', () => {
    expect(SONG_TABLE_EP_DEFAULT_OPTIONAL_COLUMNS).toEqual([
      'artist',
      'album',
      'duration',
      'genre',
      'subgenre',
    ])
    expect(defaultSongTableOptionalColumns('ep')).toEqual(SONG_TABLE_EP_DEFAULT_OPTIONAL_COLUMNS)
  })
})

describe('sortSongTableTracks', () => {
  it('sorts by title ascending and descending', () => {
    const tracks = [sample({ id: 'b', title: 'Beta' }), sample({ id: 'a', title: 'Alpha' })]
    expect(sortSongTableTracks(tracks, 'title', 'asc').map((t) => t.title)).toEqual(['Alpha', 'Beta'])
    expect(sortSongTableTracks(tracks, 'title', 'desc').map((t) => t.title)).toEqual(['Beta', 'Alpha'])
  })

  it('sorts by track number using display_order then track_number', () => {
    const tracks = [
      sample({ id: '1', title: 'C', track_number: 3, display_order: 30 }),
      sample({ id: '2', title: 'A', track_number: 1, display_order: 10 }),
      sample({ id: '3', title: 'B', track_number: 2, display_order: 20 }),
    ]
    expect(sortSongTableTracks(tracks, 'track_number', 'asc').map((t) => t.id)).toEqual(['2', '3', '1'])
  })
})

describe('visibleSelectionRangeIds', () => {
  it('selects the visible range after a descending track-number sort', () => {
    const source = [
      sample({ id: '1', title: 'One', track_number: 1 }),
      sample({ id: '2', title: 'Two', track_number: 2 }),
      sample({ id: '3', title: 'Three', track_number: 3 }),
      sample({ id: '4', title: 'Four', track_number: 4 }),
      sample({ id: '5', title: 'Whats the Reason', track_number: 5 }),
    ]
    const visible = sortSongTableTracks(source, 'track_number', 'desc')
    expect(visible.map((t) => t.id)).toEqual(['5', '4', '3', '2', '1'])
    expect(visibleSelectionRangeIds(visible, 0, null)).toEqual(['5'])
    expect(visibleSelectionRangeIds(visible, 2, '5')).toEqual(['5', '4', '3'])
  })
})
