import { describe, expect, it } from 'vitest'
import {
  overrideUpcomingQueue,
  parsePlaylistDragTrackIds,
} from '@/lib/audio/library-drag'

describe('library-drag', () => {
  it('parses id JSON and csv payloads', () => {
    expect(parsePlaylistDragTrackIds('["a","b"]')).toEqual(['a', 'b'])
    expect(parsePlaylistDragTrackIds('a,b,c')).toEqual(['a', 'b', 'c'])
    expect(parsePlaylistDragTrackIds('')).toEqual([])
  })

  it('keeps current track and replaces upcoming', () => {
    const queue = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]
    const next = overrideUpcomingQueue(queue, 1, [{ id: 'x' }, { id: 'y' }])
    expect(next.map((t) => t.id)).toEqual(['a', 'b', 'x', 'y'])
  })

  it('replaces entire queue when nothing is current', () => {
    const queue = [{ id: 'a' }, { id: 'b' }]
    const next = overrideUpcomingQueue(queue, -1, [{ id: 'x' }])
    expect(next.map((t) => t.id)).toEqual(['x'])
  })
})
