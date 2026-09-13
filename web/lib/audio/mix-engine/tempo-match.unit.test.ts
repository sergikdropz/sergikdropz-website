import { describe, expect, it } from 'vitest'
import { TEMPO_MAX, TEMPO_MIN } from './tempo'
import { isTempoMatched, matchDeckTempoRate } from './tempo-match'

describe('matchDeckTempoRate', () => {
  it('pulls a deck onto the peer tempo', () => {
    const match = matchDeckTempoRate({ deckBpm: 124, peerBpm: 128 })
    expect(match?.rate).toBeCloseTo(128 / 124, 6)
    expect(match?.matchedBpm).toBeCloseTo(128, 1)
    expect(match?.clamped).toBe(false)
  })

  it('is a no-op rate when both decks already agree', () => {
    expect(matchDeckTempoRate({ deckBpm: 126, peerBpm: 126 })?.rate).toBeCloseTo(1, 6)
  })

  it('honors the peer tempo adjustment it was handed', () => {
    // Peer sits at 128 orig pushed to 131.2 by its fader.
    const match = matchDeckTempoRate({ deckBpm: 124, peerBpm: 131.2 })
    expect(match?.matchedBpm).toBeCloseTo(131.2, 1)
  })

  it('matches half-time rather than halving the deck', () => {
    const match = matchDeckTempoRate({ deckBpm: 87, peerBpm: 174 })
    expect(match?.rate).toBeCloseTo(1, 6)
    expect(match?.matchedBpm).toBeCloseTo(87, 1)
    expect(match?.targetBpm).toBeCloseTo(87, 1)
  })

  it('matches double-time rather than doubling the deck', () => {
    const match = matchDeckTempoRate({ deckBpm: 172, peerBpm: 88 })
    expect(match?.rate).toBeCloseTo(176 / 172, 6)
    expect(match?.matchedBpm).toBeCloseTo(176, 1)
  })

  it('falls back to a 3:4 reading when neither half nor double is closer', () => {
    // 174 drum & bass against 126 house — 168 (4/3 of 126) beats a 27% stretch.
    const match = matchDeckTempoRate({ deckBpm: 174, peerBpm: 126 })
    expect(match?.matchedBpm).toBeCloseTo(168, 1)
    expect(match?.clamped).toBe(false)
  })

  it('clamps unreachable stretches to the deck tempo range', () => {
    const slow = matchDeckTempoRate({ deckBpm: 210, peerBpm: 50 })
    expect(slow?.rate).toBe(TEMPO_MIN)
    expect(slow?.clamped).toBe(true)

    const fast = matchDeckTempoRate({ deckBpm: 54, peerBpm: 210 })
    expect(fast?.rate).toBe(TEMPO_MAX)
    expect(fast?.clamped).toBe(true)
  })

  it('returns null without a usable tempo on either deck', () => {
    expect(matchDeckTempoRate({ deckBpm: null, peerBpm: 128 })).toBeNull()
    expect(matchDeckTempoRate({ deckBpm: 128, peerBpm: null })).toBeNull()
    expect(matchDeckTempoRate({ deckBpm: 0, peerBpm: 128 })).toBeNull()
    expect(matchDeckTempoRate({ deckBpm: 128, peerBpm: Number.NaN })).toBeNull()
  })
})

describe('isTempoMatched', () => {
  it('recognizes a deck already sitting on the match', () => {
    const match = matchDeckTempoRate({ deckBpm: 124, peerBpm: 128 })
    expect(isTempoMatched(128 / 124, match)).toBe(true)
    expect(isTempoMatched(1, match)).toBe(false)
    expect(isTempoMatched(1, null)).toBe(false)
  })
})
