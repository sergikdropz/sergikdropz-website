/**
 * BPM / phase sync helpers for dual-deck mixing.
 * Prefer beat-grid phase lock + half/double tempo awareness.
 */

import { quantizeToDnaGrid, secondsToNextPhraseBoundary, signedSnareOffsetSec } from '@/lib/audio/sonic-dna-mix'

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

/**
 * Pick the tempo interpretation that minimizes rate stretch.
 * e.g. 174 vs 87 → treat slave as 174 (double) so ratio ≈ 1.
 */
export function normalizeBpmPair(
  masterBpm: number,
  deckBpm: number
): { master: number; deck: number; ratio: number } {
  if (!(masterBpm > 0) || !(deckBpm > 0)) {
    return { master: masterBpm || 120, deck: deckBpm || 120, ratio: 1 }
  }
  const candidates = [
    deckBpm,
    deckBpm * 2,
    deckBpm / 2,
    deckBpm * 0.5,
    deckBpm * 4 / 3,
    deckBpm * 3 / 4,
  ].filter((b) => b >= 55 && b <= 220)

  let best = deckBpm
  let bestRatio = masterBpm / deckBpm
  let bestDist = Math.abs(Math.log(bestRatio))
  for (const c of candidates) {
    const r = masterBpm / c
    const dist = Math.abs(Math.log(r))
    if (dist < bestDist) {
      bestDist = dist
      best = c
      bestRatio = r
    }
  }
  return { master: masterBpm, deck: best, ratio: bestRatio }
}

export function bpmRateRatio(masterBpm: number, deckBpm: number): number {
  if (!(masterBpm > 0) || !(deckBpm > 0)) return 1
  const { ratio } = normalizeBpmPair(masterBpm, deckBpm)
  return clamp(ratio, 0.88, 1.12)
}

/** Effective BPM on a deck including user tempo (ExpandedPlayerControls slider). */
export function effectiveDeckBpm(bpm: number | null | undefined, playbackRate = 1): number {
  const base = typeof bpm === 'number' && bpm > 0 ? bpm : 120
  const rate = typeof playbackRate === 'number' && playbackRate > 0 ? playbackRate : 1
  return base * rate
}

/**
 * Incoming deck playbackRate to beatmatch against the live outgoing deck,
 * honoring the user's tempo adjustment on the master channel.
 */
export function mixIncomingRateRatio(params: {
  outgoingBpm: number | null | undefined
  incomingBpm: number | null | undefined
  outgoingPlaybackRate?: number
}): number {
  const outEffective = effectiveDeckBpm(params.outgoingBpm, params.outgoingPlaybackRate ?? 1)
  const inBpm = typeof params.incomingBpm === 'number' && params.incomingBpm > 0 ? params.incomingBpm : outEffective
  return bpmRateRatio(outEffective, inBpm)
}

/** Seconds until next downbeat/phrase on a deck timeline. */
export function secondsToAlignedBoundary(params: {
  timeSec: number
  bpm: number
  offsetSec?: number
  phraseBars?: 2 | 4 | 8 | 16 | 32
}): number {
  return secondsToNextPhraseBoundary({
    timeSec: params.timeSec,
    bpm: params.bpm,
    offsetSec: params.offsetSec ?? 0,
    phraseBars: params.phraseBars ?? 8,
    beatsPerBar: 4,
  })
}

/** Phase within one beat [0, beatSec). */
export function beatPhaseSec(params: {
  timeSec: number
  bpm: number
  offsetSec?: number
}): number {
  const beat = params.bpm > 0 ? 60 / params.bpm : 0.5
  const offset = Number.isFinite(params.offsetSec) ? Math.max(0, params.offsetSec!) : 0
  const rel = params.timeSec - offset
  return ((rel % beat) + beat) % beat
}

/**
 * Signed phase error: how far ahead(+) / behind(−) incoming is vs outgoing,
 * measured on the beat grid (wrapped to ±half beat).
 */
export function beatPhaseErrorSec(params: {
  outgoingTimeSec: number
  outgoingBpm: number
  outgoingOffsetSec?: number
  incomingTimeSec: number
  incomingBpm: number
  incomingOffsetSec?: number
}): number {
  const outBeat = params.outgoingBpm > 0 ? 60 / params.outgoingBpm : 0.5
  const inBeat = params.incomingBpm > 0 ? 60 / params.incomingBpm : outBeat
  // Compare on master's beat period
  const outPhase = beatPhaseSec({
    timeSec: params.outgoingTimeSec,
    bpm: params.outgoingBpm,
    offsetSec: params.outgoingOffsetSec,
  })
  // Map incoming phase into master beat space via rate-normalized time
  const inPhaseRaw = beatPhaseSec({
    timeSec: params.incomingTimeSec,
    bpm: params.incomingBpm,
    offsetSec: params.incomingOffsetSec,
  })
  // Scale incoming phase to master beat length
  const inPhase = inBeat > 0 ? (inPhaseRaw / inBeat) * outBeat : inPhaseRaw
  let err = inPhase - outPhase
  const half = outBeat * 0.5
  if (err > half) err -= outBeat
  if (err < -half) err += outBeat
  return err
}

/**
 * How far to nudge incoming so beats (and ideally phrase) land together.
 * Positive => delay incoming (seek backward); negative => skip forward.
 * Prefers beat lock; adds a bar/phrase snap when close.
 */
export function phaseAlignSeekDelta(params: {
  outgoingTimeSec: number
  outgoingBpm: number
  outgoingOffsetSec?: number
  incomingTimeSec: number
  incomingBpm: number
  incomingOffsetSec?: number
  phraseBars?: 2 | 4 | 8 | 16 | 32
}): number {
  const bars = params.phraseBars ?? 8
  const outBpm = params.outgoingBpm
  const inBpm = params.incomingBpm
  if (!(outBpm > 0) || !(inBpm > 0)) return 0

  const beat = 60 / outBpm
  // Primary: beat-phase error (most audible sync)
  let delta = beatPhaseErrorSec(params)

  // Secondary: if we're near a phrase boundary on master, prefer phrase snap
  const outRemain = secondsToAlignedBoundary({
    timeSec: params.outgoingTimeSec,
    bpm: outBpm,
    offsetSec: params.outgoingOffsetSec,
    phraseBars: bars,
  })
  const inRemain = secondsToAlignedBoundary({
    timeSec: params.incomingTimeSec,
    bpm: inBpm,
    offsetSec: params.incomingOffsetSec,
    phraseBars: bars,
  })
  const phraseDelta = inRemain - outRemain
  // Blend phrase snap only when it's within ~2 beats of beat lock
  if (Math.abs(phraseDelta - delta) < beat * 2.1) {
    delta = delta * 0.35 + phraseDelta * 0.65
  }

  // Cap to ±1 beat — larger jumps sound like skips
  return clamp(delta, -beat, beat)
}

/**
 * Dual-deck pocket align: beat + phrase + snare/clap when Sonic DNA is available.
 * Positive delta => delay incoming (seek backward).
 */
export function mixPocketAlignSeekDelta(params: {
  outgoingTimeSec: number
  outgoingBpm: number
  outgoingOffsetSec?: number
  outgoingSonicDna?: unknown
  incomingTimeSec: number
  incomingBpm: number
  incomingOffsetSec?: number
  incomingSonicDna?: unknown
  phraseBars?: 2 | 4 | 8 | 16 | 32
  /** When true, blend snare/clap grid alignment (default: both tracks have DNA). */
  snareLock?: boolean
}): number {
  let delta = phaseAlignSeekDelta(params)
  const useSnare =
    params.snareLock !== false &&
    params.outgoingSonicDna != null &&
    params.incomingSonicDna != null
  if (!useSnare) return delta

  const outSnare = signedSnareOffsetSec({
    timeSec: params.outgoingTimeSec,
    bpm: params.outgoingBpm,
    offsetSec: params.outgoingOffsetSec,
    sonicDna: params.outgoingSonicDna,
  })
  const inSnare = signedSnareOffsetSec({
    timeSec: params.incomingTimeSec,
    bpm: params.incomingBpm,
    offsetSec: params.incomingOffsetSec,
    sonicDna: params.incomingSonicDna,
  })
  if (outSnare == null || inSnare == null) return delta

  const beat = params.outgoingBpm > 0 ? 60 / params.outgoingBpm : 0.5
  const snareDelta = inSnare - outSnare
  if (Math.abs(snareDelta - delta) < beat * 2.5) {
    delta = delta * 0.32 + snareDelta * 0.68
  }
  return clamp(delta, -beat, beat)
}

const KICK_SNAP_PHASE_SLACK_SEC = 0.008

/**
 * Incoming cue at mix start: pocket (beat + 8-bar phrase + snare/clap), then
 * kick-quantize only when it does not worsen beat-phase lock vs the master.
 */
export function resolveIncomingMixCue(params: {
  plannedIncomingSec: number
  outgoingTimeSec: number
  outgoingBpm: number
  outgoingOffsetSec?: number | null
  outgoingSonicDna?: unknown
  incomingBpm: number
  incomingOffsetSec?: number | null
  incomingSonicDna?: unknown
  phraseBars?: 2 | 4 | 8 | 16 | 32
  snareLock?: boolean
}): number {
  const cue = Math.max(0, params.plannedIncomingSec)
  const outOff =
    typeof params.outgoingOffsetSec === 'number' && Number.isFinite(params.outgoingOffsetSec)
      ? params.outgoingOffsetSec
      : undefined
  const inOff =
    typeof params.incomingOffsetSec === 'number' && Number.isFinite(params.incomingOffsetSec)
      ? params.incomingOffsetSec
      : undefined

  const delta = mixPocketAlignSeekDelta({
    outgoingTimeSec: params.outgoingTimeSec,
    outgoingBpm: params.outgoingBpm,
    outgoingOffsetSec: outOff,
    outgoingSonicDna: params.outgoingSonicDna,
    incomingTimeSec: cue,
    incomingBpm: params.incomingBpm,
    incomingOffsetSec: inOff,
    incomingSonicDna: params.incomingSonicDna,
    phraseBars: params.phraseBars,
    snareLock: params.snareLock,
  })
  const pocketCue = Math.max(0, cue - delta)
  if (params.incomingSonicDna == null) return pocketCue

  const kicked = quantizeToDnaGrid({
    timeSec: pocketCue,
    bpm: params.incomingBpm,
    offsetSec: inOff,
    sonicDna: params.incomingSonicDna,
    mode: 'kick',
  })
  const errAt = (incomingTimeSec: number) =>
    Math.abs(
      beatPhaseErrorSec({
        outgoingTimeSec: params.outgoingTimeSec,
        outgoingBpm: params.outgoingBpm,
        outgoingOffsetSec: outOff,
        incomingTimeSec,
        incomingBpm: params.incomingBpm,
        incomingOffsetSec: inOff,
      }),
    )
  return errAt(kicked) <= errAt(pocketCue) + KICK_SNAP_PHASE_SLACK_SEC ? kicked : pocketCue
}

/**
 * Tiny playbackRate correction to close residual phase error during a mix.
 * Returns a multiplier near 1.0 (e.g. 0.997–1.003).
 */
export function microRateCorrection(params: {
  phaseErrorSec: number
  bpm: number
  /** How aggressively to chase (0–1) */
  strength?: number
}): number {
  const beat = params.bpm > 0 ? 60 / params.bpm : 0.5
  const strength = clamp(params.strength ?? 0.55, 0, 1)
  // Normalize error to ±1 beat
  const norm = clamp(params.phaseErrorSec / beat, -1, 1)
  // Ahead (+) → slow down slightly; behind (−) → speed up
  const corr = 1 - norm * 0.0045 * strength
  return clamp(corr, 0.994, 1.006)
}
