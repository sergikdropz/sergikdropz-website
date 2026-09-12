/**
 * Dual-clock model for Auto DJ / beat grid:
 *
 * - Phrase lattice: always from track start — boundaries at n × 8 × barSec
 * - Beat phase: offset folded into [0, beatSec) so kicks land on beat lines
 *
 * Never treat first-kick absolute time as phrase-1 origin.
 */

import { BARS_PER_PHRASE, beatPeriodSec } from '@/lib/audio/beat-grid'

/** Fold any absolute / legacy offset into within-beat phase [0, beatSec). */
export function toPhaseOnlyOffsetSec(offsetSec: number, beatSec: number): number {
  if (!(beatSec > 0) || !Number.isFinite(offsetSec)) return 0
  const p = ((offsetSec % beatSec) + beatSec) % beatSec
  // Snap tiny float noise to exact 0
  return p < 1e-9 || beatSec - p < 1e-9 ? 0 : p
}

/**
 * Wrap a grid offset into [0, wrapSec).
 * Phase-meter CDJ jog uses a multi-bar wrapSec so whole-beat nudges shift
 * downbeats instead of being crushed by {@link toPhaseOnlyOffsetSec}.
 */
export function wrapOffsetSec(offsetSec: number, wrapSec: number): number {
  if (!(wrapSec > 0) || !Number.isFinite(wrapSec)) return 0
  if (!Number.isFinite(offsetSec)) return 0
  const p = ((offsetSec % wrapSec) + wrapSec) % wrapSec
  return p < 1e-9 || wrapSec - p < 1e-9 ? 0 : p
}

export function phrasePeriodSec(bpm: number, phraseBars = BARS_PER_PHRASE): number | null {
  const beat = beatPeriodSec(bpm)
  if (!beat) return null
  return beat * 4 * Math.max(1, phraseBars)
}

/** Phrase index whose interval contains timeSec (lattice origin = 0). */
export function phraseIndexAt(
  timeSec: number,
  bpm: number,
  phraseBars = BARS_PER_PHRASE,
): number {
  const phraseSec = phrasePeriodSec(bpm, phraseBars)
  if (!phraseSec || !(timeSec >= 0)) return 0
  return Math.floor(timeSec / phraseSec)
}

/**
 * Position inside the current 8-bar cell [0, phraseSec), using the same
 * within-beat offset as `beatPhaseSec` (time − offset).
 */
export function phrasePhaseSec(params: {
  timeSec: number
  bpm: number
  offsetSec?: number | null
  phraseBars?: number
}): number {
  const phrase = phrasePeriodSec(params.bpm, params.phraseBars ?? BARS_PER_PHRASE)
  if (!phrase) return 0
  const offset =
    typeof params.offsetSec === 'number' && Number.isFinite(params.offsetSec)
      ? Math.max(0, params.offsetSec)
      : 0
  const rel = params.timeSec - offset
  return ((rel % phrase) + phrase) % phrase
}

/**
 * How far ahead(+) / behind(−) incoming is vs outgoing inside the phrase cell,
 * mapped onto the outgoing phrase period and wrapped to ±½ phrase.
 */
export function phrasePhaseErrorSec(params: {
  outgoingTimeSec: number
  outgoingBpm: number
  outgoingOffsetSec?: number | null
  incomingTimeSec: number
  incomingBpm: number
  incomingOffsetSec?: number | null
  phraseBars?: number
}): number {
  const bars = params.phraseBars ?? BARS_PER_PHRASE
  const outPhrase = phrasePeriodSec(params.outgoingBpm, bars)
  const inPhrase = phrasePeriodSec(params.incomingBpm, bars)
  if (!outPhrase || !inPhrase) return 0
  const outP = phrasePhaseSec({
    timeSec: params.outgoingTimeSec,
    bpm: params.outgoingBpm,
    offsetSec: params.outgoingOffsetSec,
    phraseBars: bars,
  })
  const inP = phrasePhaseSec({
    timeSec: params.incomingTimeSec,
    bpm: params.incomingBpm,
    offsetSec: params.incomingOffsetSec,
    phraseBars: bars,
  })
  const inOnMaster = (inP / inPhrase) * outPhrase
  let err = inOnMaster - outP
  const half = outPhrase * 0.5
  if (err > half) err -= outPhrase
  if (err < -half) err += outPhrase
  return err
}

/**
 * Incoming media time in phrase 1 that sits on the same bar/beat as outgoing.
 * Stays inside the first 8-bar cell (doctrine IN = phrase 1).
 */
export function incomingCueAtOutgoingPhrase(params: {
  outgoingTimeSec: number
  outgoingBpm: number
  outgoingOffsetSec?: number | null
  incomingBpm: number
  incomingOffsetSec?: number | null
  phraseBars?: number
}): number {
  const bars = params.phraseBars ?? BARS_PER_PHRASE
  const outPhrase = phrasePeriodSec(params.outgoingBpm, bars)
  const inPhrase = phrasePeriodSec(params.incomingBpm, bars)
  if (!outPhrase || !inPhrase) return 0
  const outP = phrasePhaseSec({
    timeSec: params.outgoingTimeSec,
    bpm: params.outgoingBpm,
    offsetSec: params.outgoingOffsetSec,
    phraseBars: bars,
  })
  const inOff =
    typeof params.incomingOffsetSec === 'number' && Number.isFinite(params.incomingOffsetSec)
      ? Math.max(0, params.incomingOffsetSec)
      : 0
  const inPhase = (outP / outPhrase) * inPhrase
  let cue = inPhase + inOff
  cue = ((cue % inPhrase) + inPhrase) % inPhrase
  return cue
}

/** Fold a cue into phrase 1 [0, phraseSec). */
export function clampToPhrase1(
  cueSec: number,
  bpm: number,
  phraseBars = BARS_PER_PHRASE,
): number {
  const phrase = phrasePeriodSec(bpm, phraseBars)
  if (!phrase) return Math.max(0, cueSec)
  return ((cueSec % phrase) + phrase) % phrase
}

/** Seek incoming media so its phrase phase matches outgoing. Result stays in phrase 1. */
export function incomingTimeAfterPhraseSeek(params: {
  incomingTimeSec: number
  incomingBpm: number
  outgoingBpm: number
  phraseErrMasterSec: number
  phraseBars?: number
}): number {
  const bars = params.phraseBars ?? BARS_PER_PHRASE
  const inPhrase = phrasePeriodSec(params.incomingBpm, bars)
  const outPhrase = phrasePeriodSec(params.outgoingBpm, bars)
  if (!inPhrase || !outPhrase) {
    return clampToPhrase1(params.incomingTimeSec, params.incomingBpm, bars)
  }
  const inDelta = params.phraseErrMasterSec * (inPhrase / outPhrase)
  return clampToPhrase1(params.incomingTimeSec - inDelta, params.incomingBpm, bars)
}

/** Absolute start of phrase n on the file-start lattice. */
export function phraseBoundarySec(
  phraseIndex: number,
  bpm: number,
  phraseBars = BARS_PER_PHRASE,
): number {
  const phraseSec = phrasePeriodSec(bpm, phraseBars)
  if (!phraseSec) return 0
  return Math.max(0, phraseIndex) * phraseSec
}

/** Snap time to nearest phrase boundary counted from t=0 (ignores beat phase). */
export function snapToFileStartPhrase(
  timeSec: number,
  bpm: number,
  opts?: {
    phraseBars?: number
    preferEarlier?: boolean
    minSec?: number
    maxSec?: number
  },
): number {
  const bars = opts?.phraseBars && opts.phraseBars > 0 ? opts.phraseBars : BARS_PER_PHRASE
  const phraseSec = phrasePeriodSec(bpm, bars)
  if (!phraseSec) return Math.max(0, timeSec)
  const t = Math.max(0, timeSec)
  const idx = t / phraseSec
  const floorIdx = Math.floor(idx)
  const ceilIdx = Math.ceil(idx)
  const earlier = floorIdx * phraseSec
  const later = ceilIdx * phraseSec
  const distEarlier = Math.abs(t - earlier)
  const distLater = Math.abs(t - later)
  let snapped =
    distEarlier < distLater - 1e-6
      ? earlier
      : distLater < distEarlier - 1e-6
        ? later
        : opts?.preferEarlier
          ? earlier
          : later
  if (typeof opts?.minSec === 'number') snapped = Math.max(opts.minSec, snapped)
  if (typeof opts?.maxSec === 'number') snapped = Math.min(opts.maxSec, snapped)
  return snapped
}
