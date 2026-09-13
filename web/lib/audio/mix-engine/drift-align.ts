/**
 * Mid-blend drift alignment — incoming-only PI chase.
 *
 * Offset (static phase) → vinyl P-bend.
 * Walk (de/dt) → I-term rate trim on incoming.
 * Kick + clap residuals are the audible error when they agree with the grid.
 * Never seek. Never copy the multiplier onto outgoing.
 */

import { SILENT_VINYL_BEND_MAX } from './pre-audible-nudge'
import {
  VINYL_BEND_CATCH_SEC,
  VINYL_BEND_DEADBAND_SEC,
  VINYL_BEND_MAX,
  microRateCorrection,
} from './sync'

/** Prefer kick when |kick| is inside this window (audible pocket). */
export const DRIFT_KICK_TRUST_SEC = 0.018
/** Clap/snare pocket can be a hair wider than the kick. */
export const DRIFT_CLAP_TRUST_SEC = 0.022
/** Grid vs onset must agree within this or the onset is the wrong transient. */
export const DRIFT_KICK_AGREE_SEC = 0.022
/** |de/dt| at or above this is a BPM walk, not a static offset. */
export const DRIFT_WALK_SEC_PER_SEC = 0.002
export const DRIFT_HISTORY = 12
export const DRIFT_KI = 0.55
export const DRIFT_KD = 0.22
export const DRIFT_POCKET_KICK_WEIGHT = 0.62

export type DriftSample = { tSec: number; errorSec: number }

export type DriftAlignState = {
  samples: DriftSample[]
  integralSec: number
  lastTSec: number | null
}

export type FusedBlendError = {
  errorSec: number
  source: 'kick' | 'clap' | 'pocket' | 'grid'
}

export type DriftEstimate = {
  offsetSec: number
  driftRate: number
}

export type DriftAlignResult = {
  multiplier: number
  nextIntegralSec: number
  kind: 'deadband' | 'offset' | 'walk'
}

export function createDriftAlignState(): DriftAlignState {
  return { samples: [], integralSec: 0, lastTSec: null }
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

function median(values: number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2) return sorted[mid]!
  return (sorted[mid - 1]! + sorted[mid]!) / 2
}

/**
 * Kick / clap residuals share the vinyl-bend sign (incoming early / ahead → +).
 * Chase the pocket the playhead is in: downbeat → kick, backbeat → clap,
 * both slipping the same way → blended pocket. Fall back to grid when the
 * onset is missing, huge, or opposing.
 */
export function fuseBlendError(params: {
  gridPhaseSec: number
  kickResidualSec?: number | null
  clapResidualSec?: number | null
  beatSec: number
  /** FoF×FoF may chase clap; breakbeats keep clap only when it agrees with kick. */
  allowClap?: boolean
  /** False when onsets are peak-derived — hats/shoulders flam the chase. */
  trustOnsets?: boolean
}): FusedBlendError {
  const grid = Number.isFinite(params.gridPhaseSec) ? params.gridPhaseSec : 0
  const beat = params.beatSec > 0 ? params.beatSec : 0.5
  const half = beat * 0.5
  const agree = Math.min(DRIFT_KICK_AGREE_SEC, half * 0.25)
  const allowClap = params.allowClap !== false
  if (params.trustOnsets === false) {
    return { errorSec: grid, source: 'grid' }
  }

  const kickOn = isTrustedOnset(params.kickResidualSec, grid, DRIFT_KICK_TRUST_SEC, agree)
  const clapOn =
    allowClap && isTrustedOnset(params.clapResidualSec, grid, DRIFT_CLAP_TRUST_SEC, agree)

  if (kickOn && clapOn) {
    const k = params.kickResidualSec as number
    const c = params.clapResidualSec as number
    if (Math.abs(k) < 0.002 && Math.abs(c) >= 0.003) {
      return { errorSec: c, source: 'clap' }
    }
    if (Math.abs(c) < 0.002 && Math.abs(k) >= 0.003) {
      return { errorSec: k, source: 'kick' }
    }
    if (k * c < 0 && Math.abs(k) >= 0.003 && Math.abs(c) >= 0.003) {
      return { errorSec: k, source: 'kick' }
    }
    return {
      errorSec: k * DRIFT_POCKET_KICK_WEIGHT + c * (1 - DRIFT_POCKET_KICK_WEIGHT),
      source: 'pocket',
    }
  }
  if (kickOn) return { errorSec: params.kickResidualSec as number, source: 'kick' }
  if (clapOn) return { errorSec: params.clapResidualSec as number, source: 'clap' }
  return { errorSec: grid, source: 'grid' }
}

function isTrustedOnset(
  onset: number | null | undefined,
  grid: number,
  trustSec: number,
  agreeSec: number,
): boolean {
  if (onset == null || !Number.isFinite(onset)) return false
  if (Math.abs(onset) > trustSec) return false
  if (Math.abs(onset) < 0.0008 && Math.abs(grid) > 0.004) return false
  if (Math.abs(onset - grid) > agreeSec) return false
  return true
}

export function pushDriftSample(state: DriftAlignState, tSec: number, errorSec: number) {
  if (!Number.isFinite(tSec) || !Number.isFinite(errorSec)) return
  state.samples.push({ tSec, errorSec })
  if (state.samples.length > DRIFT_HISTORY) state.samples.shift()
}

/** Median offset + linear-regression walk (seconds of phase per second of wall). */
export function estimateDrift(samples: DriftSample[]): DriftEstimate {
  if (!samples.length) return { offsetSec: 0, driftRate: 0 }
  const offsetSec = median(samples.map((s) => s.errorSec))
  if (samples.length < 4) return { offsetSec, driftRate: 0 }
  const span = samples[samples.length - 1]!.tSec - samples[0]!.tSec
  if (!(span >= 0.08)) return { offsetSec, driftRate: 0 }

  const n = samples.length
  let sumT = 0
  let sumE = 0
  let sumTT = 0
  let sumTE = 0
  for (const s of samples) {
    sumT += s.tSec
    sumE += s.errorSec
    sumTT += s.tSec * s.tSec
    sumTE += s.tSec * s.errorSec
  }
  const denom = n * sumTT - sumT * sumT
  if (Math.abs(denom) < 1e-12) return { offsetSec, driftRate: 0 }
  const driftRate = (n * sumTE - sumT * sumE) / denom
  return { offsetSec, driftRate: Number.isFinite(driftRate) ? driftRate : 0 }
}

/**
 * Incoming playbackRate multiplier that closes fused phase error.
 * P handles offset; I+D handle a walking BPM mismatch. Clamped ±1.8% audible
 * / ±3.5% silent. Anti-windup freezes ∫e when the clamp is hit.
 */
export function driftAlignRate(params: {
  errorSec: number
  driftRate: number
  integralSec: number
  bpm: number
  strength?: number
  dtSec: number
  silent?: boolean
}): DriftAlignResult {
  const beat = params.bpm > 0 ? 60 / params.bpm : 0.5
  const half = beat * 0.5
  const e = clamp(Number.isFinite(params.errorSec) ? params.errorSec : 0, -half, half)
  const abs = Math.abs(e)
  const strength = clamp(params.strength ?? 0.75, 0, 1)
  const dt = clamp(Number.isFinite(params.dtSec) ? params.dtSec : 1 / 60, 0.008, 0.08)
  const maxBend = params.silent ? SILENT_VINYL_BEND_MAX : VINYL_BEND_MAX
  const walk =
    Number.isFinite(params.driftRate) && Math.abs(params.driftRate) >= DRIFT_WALK_SEC_PER_SEC

  if (abs < VINYL_BEND_DEADBAND_SEC && !walk) {
    return {
      multiplier: 1,
      nextIntegralSec: params.integralSec * 0.85,
      kind: 'deadband',
    }
  }

  const ki = walk ? DRIFT_KI * (0.55 + 0.45 * strength) : DRIFT_KI * 0.35 * strength
  const kd = DRIFT_KD * strength
  let nextI = params.integralSec + e * dt
  nextI *= walk ? 0.995 : 0.92

  const p = microRateCorrection({
    phaseErrorSec: e,
    bpm: params.bpm,
    strength,
    catchSec: VINYL_BEND_CATCH_SEC,
  }) - 1
  const iTerm = -ki * nextI
  const dTerm = -kd * clamp(params.driftRate, -0.02, 0.02)
  const raw = 1 + p + iTerm + dTerm
  const lo = 1 - maxBend
  const hi = 1 + maxBend
  const multiplier = clamp(raw, lo, hi)
  // Anti-windup: freeze ∫e when the clamp is already fighting this error.
  if ((raw < lo && e > 0) || (raw > hi && e < 0)) nextI = params.integralSec

  return {
    multiplier,
    nextIntegralSec: nextI,
    kind: walk ? 'walk' : 'offset',
  }
}
