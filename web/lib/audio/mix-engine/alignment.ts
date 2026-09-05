/**
 * Multi-factor alignment solver for Auto DJ BeatSync.
 *
 * Doctrine (see knowledge/DJ_SYNC_DOCTRINE.md):
 * - Phase is computed in *media time* with *base BPM* (never bpm × playbackRate).
 * - One AlignmentState is produced and consumed; consumers must not re-snap unless conf drops.
 * - Snare pocket only when both decks are four-on-the-floor (groove-aware).
 * - Kick + snare/clap onset residuals always micro-nudge (±20 ms) when series exist.
 */

import { resolveIncomingMixCue, beatPhaseErrorSec } from './sync'
import { resolveKickOnsetSec, resolveSnareClapOnsetSec } from './kick-onsets'
import {
  dualOnsetResidualNudgeSec,
  transientPocketNudgeSec,
  type MixPeakSample,
} from './transient-align'
import { isFourOnFloorPocket } from './mix-techniques'

export type AlignmentWeights = {
  beat: number
  phrase: number
  snare: number
  onset: number
}

export type AlignmentState = {
  /** Incoming media cue (seconds) after fusion */
  incomingCueSec: number
  /** Planned cue before pocket/transient (for diagnostics) */
  plannedIncomingSec: number
  /** Beat-phase error at resolve time using media-time BPMs */
  phaseErrSec: number
  /** Combined confidence 0–1 */
  confidence: number
  /** Whether kick/phrase snap was allowed */
  phraseLock: boolean
  /** Whether snare pocket was applied */
  snareLock: boolean
  /** Factors that contributed */
  sources: string[]
  weights: AlignmentWeights
}

/** Honest default when DNA bpmConfidence is missing — do NOT invent high confidence. */
export const MISSING_BPM_CONFIDENCE = 0.35

/** Minimum pair confidence to allow BeatSync phrase lock. */
export const BEATSYNC_CONFIDENCE_FLOOR = 0.45

/** Soft-lock score that Auto DJ treats as grid-ready. */
export const AUTO_GRID_LOCK_SCORE = 0.55

export function readPairBpmConfidence(outDna: unknown, inDna: unknown): number {
  const outC = readOneBpmConfidence(outDna)
  const inC = readOneBpmConfidence(inDna)
  return Math.min(outC, inC)
}

function readOneBpmConfidence(sonicDna: unknown): number {
  if (!sonicDna || typeof sonicDna !== 'object') return MISSING_BPM_CONFIDENCE
  const root = sonicDna as Record<string, unknown>
  const measured =
    root.measured && typeof root.measured === 'object'
      ? (root.measured as Record<string, unknown>)
      : root
  const raw = measured.bpmConfidence ?? measured.bpm_confidence
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return MISSING_BPM_CONFIDENCE
  return Math.max(0, Math.min(1, n))
}

/**
 * Solve a single AlignmentState for mix start.
 * Uses base BPM on media timelines; snare only for FoF×FoF pairs.
 */
export function solveAlignmentState(params: {
  plannedIncomingSec: number
  outgoingTimeSec: number
  /** Catalog / DNA BPM — NOT rate-scaled */
  outgoingBpm: number
  outgoingOffsetSec?: number | null
  outgoingSonicDna?: unknown
  outgoingPeaks?: MixPeakSample[] | null
  outgoingDurationSec?: number
  incomingBpm: number
  incomingOffsetSec?: number | null
  incomingSonicDna?: unknown
  incomingPeaks?: MixPeakSample[] | null
  incomingDurationSec?: number
  phraseBars?: 2 | 4 | 8 | 16 | 32
  /** Override; default from pair bpmConfidence */
  dnaConfidence?: number
  phraseLock?: boolean
  /**
   * Cap cue displacement to ±½ beat from plannedIncomingSec (phrase-1 doctrine).
   * Pocket/kick may micro-nudge only — never leave the first phrase.
   */
  phrase1Lock?: boolean
}): AlignmentState {
  const confidence =
    typeof params.dnaConfidence === 'number' && Number.isFinite(params.dnaConfidence)
      ? Math.max(0, Math.min(1, params.dnaConfidence))
      : readPairBpmConfidence(params.outgoingSonicDna, params.incomingSonicDna)

  const phraseLock =
    params.phraseLock !== undefined
      ? params.phraseLock
      : confidence >= BEATSYNC_CONFIDENCE_FLOOR && (params.phraseBars ?? 8) > 0

  const bothFoF =
    isFourOnFloorPocket(params.outgoingSonicDna) &&
    isFourOnFloorPocket(params.incomingSonicDna)
  // Phrase-1 doctrine: no large snare pocket seek — FoF still gets micro snare weight below.
  const snareLock = phraseLock && bothFoF && confidence >= 0.5 && !params.phrase1Lock

  const sources: string[] = ['beat']
  const weights: AlignmentWeights = {
    beat: 1,
    phrase: phraseLock ? 0.65 : 0,
    snare: snareLock ? 0.68 : 0,
    onset: 0,
  }
  if (phraseLock) sources.push('phrase')
  if (snareLock) sources.push('snare')

  const planned = Math.max(0, params.plannedIncomingSec)
  let cue = resolveIncomingMixCue({
    plannedIncomingSec: planned,
    outgoingTimeSec: params.outgoingTimeSec,
    outgoingBpm: params.outgoingBpm,
    outgoingOffsetSec: params.outgoingOffsetSec,
    outgoingSonicDna: params.outgoingSonicDna,
    incomingBpm: params.incomingBpm,
    incomingOffsetSec: params.incomingOffsetSec,
    incomingSonicDna: params.incomingSonicDna,
    phraseBars: phraseLock ? params.phraseBars ?? 8 : 8,
    snareLock,
  })

  // Kick + snare/clap onset residual (micro only) — runs even under phrase1Lock.
  if (phraseLock && confidence >= 0.4) {
    const outDur = params.outgoingDurationSec ?? 0
    const inDur = params.incomingDurationSec ?? 0
    const outKick = resolveKickOnsetSec({
      sonicDna: params.outgoingSonicDna,
      peaks: params.outgoingPeaks,
      durationSec: outDur > 0 ? outDur : 180,
      bpm: params.outgoingBpm,
      offsetSec: params.outgoingOffsetSec,
    })
    const inKick = resolveKickOnsetSec({
      sonicDna: params.incomingSonicDna,
      peaks: params.incomingPeaks,
      durationSec: inDur > 0 ? inDur : 180,
      bpm: params.incomingBpm,
      offsetSec: params.incomingOffsetSec,
    })
    const outSnare = resolveSnareClapOnsetSec({
      sonicDna: params.outgoingSonicDna,
      peaks: params.outgoingPeaks,
      durationSec: outDur > 0 ? outDur : 180,
      bpm: params.outgoingBpm,
      offsetSec: params.outgoingOffsetSec,
    })
    const inSnare = resolveSnareClapOnsetSec({
      sonicDna: params.incomingSonicDna,
      peaks: params.incomingPeaks,
      durationSec: inDur > 0 ? inDur : 180,
      bpm: params.incomingBpm,
      offsetSec: params.incomingOffsetSec,
    })

    let nudge = 0
    if (outKick.length >= 4 || inKick.length >= 4 || outSnare.length >= 4 || inSnare.length >= 4) {
      nudge = dualOnsetResidualNudgeSec({
        outgoingTimeSec: params.outgoingTimeSec,
        incomingTimeSec: cue,
        outgoingKickOnsets: outKick,
        incomingKickOnsets: inKick,
        outgoingSnareOnsets: outSnare,
        incomingSnareOnsets: inSnare,
        snareWeight: bothFoF ? 0.42 : 0.18,
      })
      if (Math.abs(nudge) > 0.001) {
        sources.push('kick-snare-onset')
        weights.onset = 1
      }
    } else {
      nudge = transientPocketNudgeSec({
        outgoingTimeSec: params.outgoingTimeSec,
        incomingTimeSec: cue,
        outgoingPeaks: params.outgoingPeaks,
        incomingPeaks: params.incomingPeaks,
        outgoingDurationSec: params.outgoingDurationSec,
        incomingDurationSec: params.incomingDurationSec,
      })
      if (Math.abs(nudge) > 0.001) {
        sources.push('onset')
        weights.onset = 1
      }
    }
    if (Math.abs(nudge) > 0.001) {
      cue = Math.max(0, cue + nudge)
    }
  }

  // Phrase-1 doctrine: never leave the planned first-phrase cue by more than ½ beat.
  if (params.phrase1Lock) {
    const bpm = params.incomingBpm > 0 ? params.incomingBpm : 120
    const halfBeat = (60 / bpm) * 0.5
    const delta = cue - planned
    if (Math.abs(delta) > halfBeat) {
      cue = planned + Math.sign(delta) * halfBeat
      sources.push('phrase1-cap')
    }
  }

  const phaseErrSec = beatPhaseErrorSec({
    outgoingTimeSec: params.outgoingTimeSec,
    outgoingBpm: params.outgoingBpm,
    outgoingOffsetSec:
      typeof params.outgoingOffsetSec === 'number' ? params.outgoingOffsetSec : undefined,
    incomingTimeSec: cue,
    incomingBpm: params.incomingBpm,
    incomingOffsetSec:
      typeof params.incomingOffsetSec === 'number' ? params.incomingOffsetSec : undefined,
  })

  return {
    incomingCueSec: cue,
    plannedIncomingSec: params.plannedIncomingSec,
    phaseErrSec,
    confidence,
    phraseLock,
    snareLock,
    sources,
    weights,
  }
}

/**
 * Wall-clock delay until a media-time cue, accounting for outgoing playbackRate.
 * delayMediaSec is (startAt - now) on the media timeline.
 */
export function mediaDelayToWallMs(delayMediaSec: number, outgoingPlaybackRate: number): number {
  const rate =
    typeof outgoingPlaybackRate === 'number' && outgoingPlaybackRate > 0.05
      ? outgoingPlaybackRate
      : 1
  return Math.max(0, (delayMediaSec / rate) * 1000)
}

/** BeatSync lock should cover most of the audible overlap when confidence is high. */
export function beatSyncLockProgress(params: {
  tempoGlideStart: number
  dnaConfidence: number
  /** When true (match-outgoing), keep lock later */
  holdBeatmatch?: boolean
}): number {
  const conf = Math.max(0, Math.min(1, params.dnaConfidence))
  const hold = params.holdBeatmatch !== false
  // High conf + hold → lock until 0.88; low conf → respect tempo glide earlier
  const target = hold ? 0.55 + conf * 0.33 : params.tempoGlideStart
  return Math.max(params.tempoGlideStart, Math.min(0.92, target))
}
