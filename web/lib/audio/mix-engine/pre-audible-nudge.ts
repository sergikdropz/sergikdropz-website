/**
 * Phase nudge while incoming is still silent (pre-arm / first 2% of mix).
 * Seeks up to ±½ beat; vinyl-bends harder than the audible chase.
 */

import { beatPhaseErrorSec, microRateCorrection, VINYL_BEND_DEADBAND_SEC } from './sync'
import { clampResidualSeekSec } from './phrase-mix-doctrine'

/** Tighter than audible chase — incoming fader is 0 so a seek cannot click. */
export const SILENT_NUDGE_MIN_SEC = 0.008
export const SILENT_VINYL_BEND_MAX = 0.035
export const PRE_AUDIBLE_LOCK_SEC = 0.008

export type PreAudibleNudge = {
  phaseErrSec: number
  seekDeltaSec: number | null
  bendMultiplier: number
  locked: boolean
}

export function measurePairPhaseErr(params: {
  outgoingTimeSec: number
  outgoingBpm: number
  outgoingOffsetSec?: number | null
  incomingTimeSec: number
  incomingBpm: number
  incomingOffsetSec?: number | null
}): number {
  return beatPhaseErrorSec({
    outgoingTimeSec: params.outgoingTimeSec,
    outgoingBpm: params.outgoingBpm,
    outgoingOffsetSec: params.outgoingOffsetSec ?? undefined,
    incomingTimeSec: params.incomingTimeSec,
    incomingBpm: params.incomingBpm,
    incomingOffsetSec: params.incomingOffsetSec ?? undefined,
  })
}

/** Resolve a silent-deck nudge: seek first, then a stronger vinyl bend. */
export function resolvePreAudibleNudge(params: {
  phaseErrSec: number
  bpm: number
  /** Incoming is inaudible — allow half-beat seeks. */
  silent?: boolean
}): PreAudibleNudge {
  const err = Number.isFinite(params.phaseErrSec) ? params.phaseErrSec : 0
  const abs = Math.abs(err)
  const locked = abs < PRE_AUDIBLE_LOCK_SEC
  const silent = params.silent !== false
  const halfBeat = (60 / Math.max(60, params.bpm)) * 0.5

  const seekDeltaSec = silent
    ? clampResidualSeekSec({
        phaseErrSec: err,
        bpm: params.bpm,
        minAbsSec: SILENT_NUDGE_MIN_SEC,
        maxAbsSec: halfBeat,
      })
    : clampResidualSeekSec({
        phaseErrSec: err,
        bpm: params.bpm,
        minAbsSec: 0.022,
        maxAbsSec: 0.06,
      })

  if (locked || abs < VINYL_BEND_DEADBAND_SEC) {
    return { phaseErrSec: err, seekDeltaSec, bendMultiplier: 1, locked }
  }

  const bend = microRateCorrection({
    phaseErrorSec: seekDeltaSec != null ? 0 : err,
    bpm: params.bpm,
    strength: 1,
    catchSec: silent ? 0.4 : 0.65,
  })
  const max = silent ? SILENT_VINYL_BEND_MAX : 0.018
  const bendMultiplier = Math.max(1 - max, Math.min(1 + max, bend))
  return { phaseErrSec: err, seekDeltaSec, bendMultiplier, locked: false }
}
