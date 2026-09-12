import { describe, expect, it } from 'vitest'
import { nextQueueNeighbor } from './idj-queue'

const q = (ids: string[]) => ids.map((id) => ({ id }))

describe('nextQueueNeighbor', () => {
  it('steps forward and wraps without landing on the occupied deck', () => {
    const tracks = q(['a', 'b', 'c', 'd'])
    expect(nextQueueNeighbor(tracks, 'a', 'c', 1)?.id).toBe('b')
    expect(nextQueueNeighbor(tracks, 'b', 'c', 1)?.id).toBe('d')
    expect(nextQueueNeighbor(tracks, 'd', 'c', 1)?.id).toBe('a')
  })

  it('steps backward and wraps', () => {
    const tracks = q(['a', 'b', 'c'])
    expect(nextQueueNeighbor(tracks, 'a', 'b', -1)?.id).toBe('c')
    expect(nextQueueNeighbor(tracks, 'c', 'b', -1)?.id).toBe('a')
  })

  it('dedupes repeated queue ids so skip does not no-op', () => {
    const tracks = q(['a', 'a', 'b', 'b'])
    expect(nextQueueNeighbor(tracks, 'a', null, 1)?.id).toBe('b')
    expect(nextQueueNeighbor(tracks, 'b', 'a', 1)?.id).toBe('b')
  })

  it('can land on the other deck when occupiedId is omitted', () => {
    const tracks = q(['a', 'b', 'c'])
    expect(nextQueueNeighbor(tracks, 'a', null, 1)?.id).toBe('b')
    expect(nextQueueNeighbor(tracks, 'c', null, 1)?.id).toBe('a')
  })

  it('picks a remaining track when current id is the occupied deck', () => {
    const tracks = q(['live', 'idle', 'other'])
    expect(nextQueueNeighbor(tracks, 'idle', 'idle', 1)?.id).toBe('live')
    expect(nextQueueNeighbor(tracks, 'idle', 'idle', -1)?.id).toBe('other')
  })
})
