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
 * Signed phase error: how far ahead(+) / behind(−) incoming is vs outgoing.
 * `periodBeats` sets the lattice (1 = ±½ beat; CDJ meter uses full window beats).
 */
export function beatPhaseErrorSec(params: {
  outgoingTimeSec: number
  outgoingBpm: number
  outgoingOffsetSec?: number
  incomingTimeSec: number
  incomingBpm: number
  incomingOffsetSec?: number
  /** Full lattice width in master beats (default 1 = classic ±½-beat wrap). */
  periodBeats?: number
}): number {
  const outBeat = params.outgoingBpm > 0 ? 60 / params.outgoingBpm : 0.5
  const inBeat = params.incomingBpm > 0 ? 60 / params.incomingBpm : outBeat
  const periodBeats =
    typeof params.periodBeats === 'number' && params.periodBeats > 0 ? params.periodBeats : 1
  const period = outBeat * periodBeats
  const half = period * 0.5

  const outOff =
    typeof params.outgoingOffsetSec === 'number' && Number.isFinite(params.outgoingOffsetSec)
      ? Math.max(0, params.outgoingOffsetSec)
      : 0
  const inOff =
    typeof params.incomingOffsetSec === 'number' && Number.isFinite(params.incomingOffsetSec)
      ? Math.max(0, params.incomingOffsetSec)
      : 0

  // Absolute phase on the master lattice (incoming scaled into master beat time).
  const outRel = params.outgoingTimeSec - outOff
  const inRel = params.incomingTimeSec - inOff
  const outPhase = ((outRel % period) + period) % period
  const inMaster = inBeat > 0 ? (inRel / inBeat) * outBeat : inRel
  const inPhase = ((inMaster % period) + period) % period
  let err = inPhase - outPhase
  if (err > half) err -= period
  if (err < -half) err += period
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
 * How far to seek incoming so it lands on the outgoing beat / bar / phrase grid.
 * Same sign as phaseAlignSeekDelta: positive = delay incoming (seek backward).
 */
export function gridAlignSeekDelta(params: {
  outgoingTimeSec: number
  outgoingBpm: number
  outgoingOffsetSec?: number
  incomingTimeSec: number
  incomingBpm: number
  incomingOffsetSec?: number
  grid?: 'beat' | 'bar' | 'phrase'
  /** Bars per phrase when grid === 'phrase' (default 8). */
  phraseBars?: number
  beatsPerBar?: number
}): number {
  const grid = params.grid ?? 'beat'
  if (grid === 'beat') {
    return beatPhaseErrorSec(params)
  }
  const beatsPerBar =
    typeof params.beatsPerBar === 'number' && params.beatsPerBar > 0
      ? Math.round(params.beatsPerBar)
      : 4
  const phraseBars =
    typeof params.phraseBars === 'number' && params.phraseBars > 0
      ? Math.round(params.phraseBars)
      : 8
  const bars = grid === 'bar' ? 1 : phraseBars
  const outBpm = params.outgoingBpm
  const inBpm = params.incomingBpm
  if (!(outBpm > 0) || !(inBpm > 0)) return 0
  const beat = 60 / outBpm
  const outRemain = secondsToNextPhraseBoundary({
    timeSec: params.outgoingTimeSec,
    bpm: outBpm,
    offsetSec: params.outgoingOffsetSec,
    phraseBars: bars,
    beatsPerBar,
  })
  const inRemain = secondsToNextPhraseBoundary({
    timeSec: params.incomingTimeSec,
    bpm: inBpm,
    offsetSec: params.incomingOffsetSec,
    phraseBars: bars,
    beatsPerBar,
  })
  const cap = beat * beatsPerBar * bars
  return clamp(inRemain - outRemain, -cap, cap)
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
 * Vinyl-style pitch bend — temporarily offset *incoming* playbackRate so
 * residual beat-phase error closes, then return to 1.0.
 *
 * Dual-master mixes must apply this to the incoming deck only. Copying the
 * same multiplier onto outgoing keeps relative rate at 1 and freezes the error
 * (the previous "poor blend" failure mode).
 */
export const VINYL_BEND_MAX = 0.018
/** Seconds to close a typical residual (DJ nudge window). */
export const VINYL_BEND_CATCH_SEC = 0.65
/** Already-excellent lock — stop chasing. */
export const VINYL_BEND_DEADBAND_SEC = 0.002

/**
 * PlaybackRate multiplier to close residual phase error.
 * Ahead (+) → slow incoming; behind (−) → speed up. Clamped to ±1.8%.
 */
export function microRateCorrection(params: {
  phaseErrorSec: number
  bpm: number
  /** How aggressively to chase (0–1) */
  strength?: number
  /** Seconds to close the error (default VINYL_BEND_CATCH_SEC) */
  catchSec?: number
}): number {
  const err = params.phaseErrorSec
  if (!Number.isFinite(err) || Math.abs(err) < VINYL_BEND_DEADBAND_SEC) return 1
  const beat = params.bpm > 0 ? 60 / params.bpm : 0.5
  const strength = clamp(params.strength ?? 0.75, 0, 1)
  const capped = clamp(err, -beat * 0.5, beat * 0.5)
  const catchSec = Math.max(0.28, params.catchSec ?? VINYL_BEND_CATCH_SEC)
  // Close `capped` seconds of media-time error over catchSec of wall time.
  const raw = -capped / catchSec
  const scaled = raw * (0.58 + 0.42 * strength)
  return clamp(1 + scaled, 1 - VINYL_BEND_MAX, 1 + VINYL_BEND_MAX)
}

/**
 * Incoming-only vinyl bend. Outgoing stays on the master clock so relative
 * rate can actually catch the phase error.
 */
export function applyVinylBendToDeckRates(params: {
  outRate: number
  inRate: number
  microMultiplier: number
}): { outRate: number; inRate: number } {
  const micro =
    Number.isFinite(params.microMultiplier) && params.microMultiplier > 0
      ? params.microMultiplier
      : 1
  return {
    outRate: params.outRate,
    inRate: clamp(params.inRate * micro, 0.5, 1.5),
  }
}

/** Faster attack when residual is audible; slower when already tight. */
export function smoothVinylBend(prev: number, next: number, absErrSec: number): number {
  const attack = absErrSec > 0.012 ? 0.28 : absErrSec > 0.005 ? 0.5 : 0.78
  return prev * attack + next * (1 - attack)
}

/** Ease the bend multiplier back to 1.0 once phase is inside the deadband. */
export function settleVinylBend(prev: number, absErrSec: number): number {
  if (absErrSec >= VINYL_BEND_DEADBAND_SEC) return prev
  return prev * 0.7 + 0.3
}

/** Chase every frame when loose, every 2–4 when locking. */
export function vinylBendTickInterval(absErrSec: number): number {
  if (absErrSec > 0.01) return 1
  if (absErrSec > 0.004) return 2
  return 4
}

/** Low-pass weight for live currentTime jitter (~80 ms at 60 fps). */
export const PHASE_ERR_FILTER_ALPHA = 0.25

/** Smooth measured phase so vinyl bend does not chase stretcher noise. */
export function filterPhaseErrorSec(
  prev: number,
  sample: number,
  alpha = PHASE_ERR_FILTER_ALPHA,
): number {
  if (!Number.isFinite(sample)) return Number.isFinite(prev) ? prev : 0
  if (!Number.isFinite(prev)) return sample
  const a = Math.max(0.05, Math.min(1, alpha))
  return prev * (1 - a) + sample * a
}

/** Ease chase off in the last 15% so the handoff settles. */
export function phaseChaseStrength(rawProgress: number): number {
  const p = Math.max(0, Math.min(1, rawProgress))
  if (p <= 0.85) return 1
  return Math.max(0.2, 1 - (p - 0.85) / 0.15)
}
