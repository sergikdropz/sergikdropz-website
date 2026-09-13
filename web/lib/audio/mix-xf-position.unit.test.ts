import { describe, expect, it } from 'vitest'
import { mixCrossfaderPosition } from './mix-xf-position'

describe('mixCrossfaderPosition', () => {
  it('rests on A when the live deck is A', () => {
    expect(mixCrossfaderPosition({ liveDeck: 'a' })).toBe(0)
    expect(mixCrossfaderPosition({ liveDeck: 'a', blendProgress: null })).toBe(0)
  })

  it('rests on B when the live deck is B', () => {
    expect(mixCrossfaderPosition({ liveDeck: 'b' })).toBe(1)
    expect(mixCrossfaderPosition({ liveDeck: 'b', blendProgress: null })).toBe(1)
  })

  it('moves A→B while outgoing is A', () => {
    expect(mixCrossfaderPosition({ liveDeck: 'a', blendProgress: 0 })).toBe(0)
    expect(mixCrossfaderPosition({ liveDeck: 'a', blendProgress: 0.5 })).toBe(0.5)
    expect(mixCrossfaderPosition({ liveDeck: 'a', blendProgress: 1 })).toBe(1)
  })

  it('moves B→A while outgoing is B', () => {
    expect(mixCrossfaderPosition({ liveDeck: 'b', blendProgress: 0 })).toBe(1)
    expect(mixCrossfaderPosition({ liveDeck: 'b', blendProgress: 0.5 })).toBe(0.5)
    expect(mixCrossfaderPosition({ liveDeck: 'b', blendProgress: 1 })).toBe(0)
  })
})
