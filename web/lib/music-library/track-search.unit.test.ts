import { describe, expect, it } from 'vitest'
import {
  buildTrackLibrarySearchOrFilter,
  filterTracksForLibraryBrowse,
  librarySearchTokens,
  trackMatchesLibrarySearch,
  trackSearchHaystack,
} from './track-search'

describe('track-search', () => {
  it('tokenizes queries', () => {
    expect(librarySearchTokens('  slick   floyd ')).toEqual(['slick', 'floyd'])
  })

  it('builds PostgREST or filter across fields', () => {
    const or = buildTrackLibrarySearchOrFilter('slick')
    expect(or).toContain('title.ilike.%slick%')
    expect(or).toContain('file_url.ilike.%slick%')
  })

  it('matches multi-token haystack', () => {
    const track = {
      title: 'If you want to',
      artist: 'SERGIK',
      album: 'Unreleased',
      file: '/audio/unreleased/Library/Sergik x Slick Floyd - If you want to.wav',
    }
    expect(trackSearchHaystack(track)).toContain('slick')
    expect(trackMatchesLibrarySearch(track, 'slick')).toBe(true)
    expect(trackMatchesLibrarySearch(track, 'slick floyd')).toBe(true)
    expect(trackMatchesLibrarySearch(track, 'slick missing')).toBe(false)
  })

  it('filterTracksForLibraryBrowse applies search on album and file haystack', () => {
    const tracks = [
      { id: '1', title: 'Other', artist: 'A', album: 'X' },
      {
        id: '2',
        title: 'If you want to',
        artist: 'SERGIK',
        file: '/audio/Sergik x Slick Floyd - If you want to.wav',
      },
    ]
    expect(filterTracksForLibraryBrowse(tracks, { search: 'slick' }).map((t) => t.id)).toEqual(['2'])
  })
})
