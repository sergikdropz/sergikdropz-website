import { describe, expect, it } from 'vitest'
import { catalogScopeLabel, pickRandomUnusedTracks } from './catalog-random'

const tracks = (ids: string[]) => ids.map((id) => ({ id }))

describe('pickRandomUnusedTracks', () => {
  it('returns an empty list when the pool or count is empty', () => {
    expect(pickRandomUnusedTracks(tracks(['a']), [], 0)).toEqual([])
    expect(pickRandomUnusedTracks([], ['a'], 3)).toEqual([])
  })

  it('skips already queued or played ids', () => {
    const picked = pickRandomUnusedTracks(tracks(['a', 'b', 'c']), ['a', 'c'], 2, {
      random: () => 0,
    })
    expect(picked.map((t) => t.id)).toEqual(['b'])
  })

  it('reshuffles the pool when every track was already used', () => {
    const picked = pickRandomUnusedTracks(tracks(['a', 'b', 'c']), ['a', 'b', 'c'], 2, {
      allowReshuffle: true,
      keepExcluded: ['a'],
      random: () => 0,
    })
    expect(picked.map((t) => t.id)).toEqual(['c', 'b'])
    expect(picked.some((t) => t.id === 'a')).toBe(false)
  })

  it('does not reshuffle unless asked', () => {
    expect(
      pickRandomUnusedTracks(tracks(['a', 'b']), ['a', 'b'], 2, { random: () => 0 }),
    ).toEqual([])
  })
})

describe('catalogScopeLabel', () => {
  it('names the selected folder, playlist, or full catalog', () => {
    expect(catalogScopeLabel({ type: 'folder', id: 'ep-1' })).toBe('folder')
    expect(catalogScopeLabel({ type: 'playlist', id: 'pl-1' })).toBe('playlist')
    expect(catalogScopeLabel(null)).toBe('catalog')
    expect(catalogScopeLabel({ type: null, id: null })).toBe('catalog')
  })
})
