/**
 * Manual "match the other deck" tempo (double-click the ADJ readout).
 *
 * Shares the half/double-time doctrine used by the auto-mix beatmatcher, so a
 * 174 BPM track pulls onto an 87 BPM deck at rate 1.0 instead of grinding to
 * the deck's slowest stretch.
 */

import { normalizeBpmPair } from './sync'
import { TEMPO_MAX, TEMPO_MIN } from './tempo'

export type TempoMatch = {
  /** playbackRate to apply to this deck. */
  rate: number
  /** BPM this deck reads once the rate lands. */
  matchedBpm: number
  /** Peer BPM as reinterpreted for half / double-time pairings. */
  targetBpm: number
  /** True when the pair needed more stretch than the deck range allows. */
  clamped: boolean
}

/** Rates within this window count as already matched. */
const RATE_EPSILON = 0.0005

function roundTenth(value: number) {
  return Math.round(value * 10) / 10
}

/**
 * Rate that pulls `deckBpm` onto `peerBpm`, or null when either tempo is
 * unknown. `peerBpm` should already include the peer's tempo adjustment.
 */
export function matchDeckTempoRate({
  deckBpm,
  peerBpm,
}: {
  deckBpm: number | null | undefined
  peerBpm: number | null | undefined
}): TempoMatch | null {
  if (!(Number(deckBpm) > 0) || !(Number(peerBpm) > 0)) return null
  const base = Number(deckBpm)
  const peer = Number(peerBpm)
  const { deck: interpreted, ratio } = normalizeBpmPair(peer, base)
  if (!Number.isFinite(ratio) || ratio <= 0) return null
  const rate = Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, ratio))
  return {
    rate,
    matchedBpm: roundTenth(base * rate),
    // interpreted is `base` scaled to the peer's half/double reading, so the
    // peer BPM this match actually chases is peer scaled back the same way.
    targetBpm: roundTenth(peer * (base / interpreted)),
    clamped: Math.abs(rate - ratio) > RATE_EPSILON,
  }
}

/** True when the deck already sits on the matched tempo. */
export function isTempoMatched(currentRate: number, match: TempoMatch | null): boolean {
  if (!match) return false
  return Math.abs(currentRate - match.rate) <= RATE_EPSILON
}
