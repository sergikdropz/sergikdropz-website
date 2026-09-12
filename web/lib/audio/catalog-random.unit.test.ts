import { describe, expect, it } from 'vitest'
import {
  catalogScopeLabel,
  collectReleaseFoldersFromTree,
  isOrderedReleaseRandomScope,
  pickNextOrderedTracks,
  pickRandomReleaseFolder,
  pickRandomUnusedTracks,
  pushRecentPlayedId,
  resolveNoRepeatExcludeIds,
  sortTracksInReleaseOrder,
  CATALOG_RANDOM_NO_REPEAT_WINDOW,
} from './catalog-random'

const tracks = (ids: string[]) => ids.map((id) => ({ id }))

describe('pickRandomUnusedTracks', () => {
  it('returns an empty list when the pool or count is empty', () => {
    expect(pickRandomUnusedTracks(tracks(['a']), [], 0)).toEqual([])
    expect(pickRandomUnusedTracks([], ['a'], 3)).toEqual([])
  })

  it('skips already queued or played ids', () => {
    const picked = pickRandomUnusedTracks(tracks(['a', 'b', 'c']), ['a', 'c'], 2, {
      recentIds: [],
      random: () => 0,
    })
    expect(picked.map((t) => t.id)).toEqual(['b'])
  })

  it('avoids the recent no-repeat window before reshuffling', () => {
    const pool = tracks(Array.from({ length: 40 }, (_, i) => `t${i}`))
    const recent = Array.from({ length: CATALOG_RANDOM_NO_REPEAT_WINDOW }, (_, i) => `t${i}`)
    const picked = pickRandomUnusedTracks(pool, [], 3, {
      recentIds: recent,
      keepExcluded: ['t0'],
      random: () => 0,
    })
    expect(picked).toHaveLength(3)
    for (const track of picked) {
      expect(recent.includes(track.id)).toBe(false)
    }
  })

  it('reshuffles the oldest recent tracks when the pool is exhausted', () => {
    const picked = pickRandomUnusedTracks(tracks(['a', 'b', 'c']), ['a', 'b', 'c'], 2, {
      allowReshuffle: true,
      keepExcluded: ['a'],
      recentIds: ['b', 'c', 'a'],
      noRepeatWindow: 35,
    })
    expect(picked.map((t) => t.id)).toEqual(['b', 'c'])
    expect(picked.some((t) => t.id === 'a')).toBe(false)
  })

  it('does not reshuffle unless asked', () => {
    expect(
      pickRandomUnusedTracks(tracks(['a', 'b']), ['a', 'b'], 2, {
        recentIds: ['a', 'b'],
        random: () => 0,
      }),
    ).toEqual([])
  })

  it('softens only the recent window, not hard queue excludes', () => {
    const pool = tracks(['a', 'b', 'c', 'd'])
    const picked = pickRandomUnusedTracks(pool, ['a', 'b'], 1, {
      recentIds: ['c', 'd'],
      noRepeatWindow: 35,
      random: () => 0,
    })
    expect(picked.map((t) => t.id)).toEqual(['c'])
  })
})

describe('pushRecentPlayedId', () => {
  it('caps history to the no-repeat window and moves repeats to the end', () => {
    let recent: string[] = []
    for (let i = 0; i < 40; i++) {
      recent = pushRecentPlayedId(recent, `t${i}`, 35)
    }
    expect(recent).toHaveLength(35)
    expect(recent[0]).toBe('t5')
    expect(recent[34]).toBe('t39')

    recent = pushRecentPlayedId(recent, 't5', 35)
    expect(recent).toHaveLength(35)
    expect(recent.includes('t5')).toBe(true)
    expect(recent[34]).toBe('t5')
    expect(recent.filter((id) => id === 't5')).toHaveLength(1)
  })
})

describe('resolveNoRepeatExcludeIds', () => {
  it('honors a 35-track window when the catalog is large enough', () => {
    const recent = Array.from({ length: 35 }, (_, i) => `r${i}`)
    const blocked = resolveNoRepeatExcludeIds({
      poolSize: 80,
      excludeIds: ['queued'],
      recentIds: recent,
      keepExcluded: ['now'],
      count: 4,
    })
    expect(blocked.has('queued')).toBe(true)
    expect(blocked.has('now')).toBe(true)
    expect(blocked.has('r0')).toBe(true)
    expect(blocked.has('r34')).toBe(true)
    expect(blocked.size).toBeGreaterThanOrEqual(37)
  })

  it('drops the oldest recent ids when the pool is smaller than the window', () => {
    const recent = ['a', 'b', 'c', 'd', 'e']
    const blocked = resolveNoRepeatExcludeIds({
      poolSize: 5,
      excludeIds: [],
      recentIds: recent,
      keepExcluded: ['e'],
      count: 1,
      windowSize: 35,
    })
    expect(blocked.has('e')).toBe(true)
    expect(blocked.has('a')).toBe(false)
    expect(blocked.has('b')).toBe(true)
    expect(blocked.has('d')).toBe(true)
  })
})

describe('ordered release playback', () => {
  it('sorts by display_order then track_number', () => {
    const ordered = sortTracksInReleaseOrder([
      { id: 'c', track_number: 1, title: 'C' },
      { id: 'a', display_order: 2, title: 'A' },
      { id: 'b', display_order: 1, title: 'B' },
    ])
    expect(ordered.map((t) => t.id)).toEqual(['b', 'a', 'c'])
  })

  it('continues an EP in order then wraps to earlier unplayed tracks', () => {
    const pool = [
      { id: '1', display_order: 1 },
      { id: '2', display_order: 2 },
      { id: '3', display_order: 3 },
      { id: '4', display_order: 4 },
    ]
    expect(
      pickNextOrderedTracks(pool, ['2'], 2, { preferAfterId: '2' }).map((t) => t.id),
    ).toEqual(['3', '4'])
    expect(
      pickNextOrderedTracks(pool, ['2', '3', '4'], 2, { preferAfterId: '2' }).map((t) => t.id),
    ).toEqual(['1'])
  })

  it('marks folder sources as ordered-release random scope', () => {
    expect(isOrderedReleaseRandomScope({ type: 'folder', id: 'ep-1' })).toBe(true)
    expect(isOrderedReleaseRandomScope({ type: 'playlist', id: 'pl-1' })).toBe(false)
    expect(isOrderedReleaseRandomScope(null)).toBe(false)
  })
})

describe('pickRandomReleaseFolder', () => {
  it('collects visible crates and EPs from a folder tree', () => {
    const releases = collectReleaseFoldersFromTree([
      {
        id: 'root',
        type: 'folder',
        children: [
          { id: 'ep-1', type: 'ep', name: 'EP One' },
          { id: 'crate-1', type: 'album', name: 'Crate', hidden: true },
          { id: 'crate-2', type: 'album', name: 'Crate Two' },
          { id: 'nested', type: 'folder', children: [{ id: 'ep-2', type: 'ep', name: 'EP Two' }] },
        ],
      },
    ])
    expect(releases.map((r) => r.id).sort()).toEqual(['crate-2', 'ep-1', 'ep-2'])
  })

  it('picks a random different release, not the excluded current one', () => {
    const releases = [
      { id: 'ep-1', type: 'ep' },
      { id: 'ep-2', type: 'ep' },
      { id: 'crate-1', type: 'album' },
    ]
    const picked = pickRandomReleaseFolder(releases, {
      keepExcluded: ['ep-1'],
      recentIds: [],
      random: () => 0,
    })
    expect(picked?.id).not.toBe('ep-1')
    expect(['ep-2', 'crate-1']).toContain(picked?.id)
  })

  it('avoids recently played releases when alternatives exist', () => {
    const releases = Array.from({ length: 20 }, (_, i) => ({
      id: `ep-${i}`,
      type: 'ep',
    }))
    const recent = Array.from({ length: 12 }, (_, i) => `ep-${i}`)
    const picked = pickRandomReleaseFolder(releases, {
      keepExcluded: ['ep-0'],
      recentIds: recent,
      random: () => 0,
    })
    expect(picked).toBeTruthy()
    expect(recent.includes(picked!.id)).toBe(false)
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
