/**
 * Unified Phrase Mix Doctrine — one DJ phrasing model for Auto DJ.
 *
 * Rules:
 * - Phrase cell = 8 bars (always the snap / lock grid).
 * - OUT = last outDepth on outgoing 8-bar lines.
 * - IN  = first 8-bar phrase of incoming (grid origin).
 * - Overlap = exact N×8 bars on the master (outgoing) bar clock.
 * - Tempo Master = outgoing for the whole overlap.
 * - BeatSync only when both grids are locked (else TempoSync).
 * - EQ / gain / tempo unlock share one progress 0→1 (phrase-quantized knees).
 * - Residual seeks capped to ±½ beat; larger → no seek (micro or TempoSync).
 */

import type {
  AutoDJConfig,
  BpmStrategy,
  CuePriority,
  EnergyCurve,
  MixLengthBias,
  SyncMode,
} from '@/lib/audio/auto-dj-preferences'
import { isGridLocked } from './kick-onsets'
import { BARS_PER_PHRASE } from '@/lib/audio/beat-grid'
import type { MixQualityGrade } from './mix-quality'
import type { InPhraseBars, OutPhraseBars, PhraseBars } from './types'

/** Fixed 8-bar DNA phrase cell. */
export const PHRASE_CELL_BARS = BARS_PER_PHRASE as PhraseBars

/** DJ-mode overlap choices (multiples of the phrase cell). */
export const DJ_OVERLAP_OPTIONS: PhraseBars[] = [8, 16]

/** Freeze plan this many media-seconds before OUT. */
export const PLAN_FREEZE_SEC = 4

/** Pre-arm / cue idle this many bars before OUT (1 phrase). */
export const PREARM_PHRASE_BARS = PHRASE_CELL_BARS

/** Max BPM relative delta for BeatSync-compatible queue picks. */
export const BPM_COMPAT_REL = 0.06

/** Phrase knees for EQ/gain (quarters of the overlap). */
export const PHRASE_EQ_STEPS = 4

export type ResolvedPhraseMix = {
  outPhraseBars: OutPhraseBars
  inPhraseBars: InPhraseBars
  overlapBars: PhraseBars
  syncMode: SyncMode
  bpmStrategy: BpmStrategy
  cuePriority: CuePriority
  energyCurve: EnergyCurve
  mixLengthBias: MixLengthBias
  /** Exact overlap — ignore energy/bias scalers */
  exactOverlap: boolean
  canonicalPhraseCues: boolean
  summary: string
}

/** Snap overlap to DJ doctrine (8 or 16). Legacy 2/4 → 8; 32 → 16. */
export function normalizeDjOverlapBars(n: unknown): PhraseBars {
  if (n === 16) return 16
  if (n === 32) return 16
  return 8
}

/** Resolve Auto DJ knobs into one consistent phrase-mix contract. */
export function resolvePhraseMixSettings(
  config: Pick<
    AutoDJConfig,
    | 'outPhraseBars'
    | 'inPhraseBars'
    | 'overlapBars'
    | 'syncMode'
    | 'bpmStrategy'
    | 'cuePriority'
    | 'energyCurve'
    | 'mixLengthBias'
  >,
  opts?: {
    /** When last mix graded poor, force safer defaults */
    qualityGate?: MixQualityGrade | null
  },
): ResolvedPhraseMix {
  const outPhraseBars =
    config.outPhraseBars === 16 || config.outPhraseBars === 24 || config.outPhraseBars === 32
      ? config.outPhraseBars
      : 8

  let overlapBars = normalizeDjOverlapBars(config.overlapBars)
  let syncMode: SyncMode = config.syncMode === 'tempo-sync' ? 'tempo-sync' : 'beat-sync'
  let bpmStrategy: BpmStrategy =
    config.bpmStrategy === 'native' || config.bpmStrategy === 'manual'
      ? config.bpmStrategy
      : 'match-outgoing'

  const gate = opts?.qualityGate
  if (gate === 'poor' || gate === 'fair') {
    syncMode = 'tempo-sync'
    overlapBars = 8
    bpmStrategy = 'match-outgoing'
  }

  // Doctrine: always phrase-1 IN, exact overlap, first-downbeat.
  return {
    outPhraseBars,
    inPhraseBars: 8,
    overlapBars,
    syncMode,
    bpmStrategy,
    cuePriority: 'first-downbeat',
    energyCurve: 'hold',
    mixLengthBias: 'normal',
    exactOverlap: true,
    canonicalPhraseCues: true,
    summary: doctrineSummaryLine({
      outPhraseBars,
      overlapBars,
      syncMode,
      bpmStrategy,
    }),
  }
}

export function doctrineSummaryLine(params: {
  outPhraseBars: OutPhraseBars
  overlapBars: PhraseBars
  syncMode: SyncMode
  bpmStrategy?: BpmStrategy
}): string {
  const sync = params.syncMode === 'beat-sync' ? 'BeatSync' : 'TempoSync'
  const bpm =
    params.bpmStrategy === 'manual'
      ? 'glide → slider'
      : 'master → incoming BPM'
  return `OUT last ${params.outPhraseBars} · blend ${params.overlapBars} · IN phrase 1 @ OUT · ${sync} · ${bpm}`
}

/** True when both decks have a locked grid or a persisted beat-grid offset. */
export function bothGridsReady(
  outgoingSonicDna: unknown,
  incomingSonicDna: unknown,
  outgoingOffset?: number | null,
  incomingOffset?: number | null,
): boolean {
  const ready = (dna: unknown, offset?: number | null) => {
    if (isGridLocked(dna)) return true
    return typeof offset === 'number' && Number.isFinite(offset)
  }
  return (
    ready(outgoingSonicDna, outgoingOffset) && ready(incomingSonicDna, incomingOffset)
  )
}

/** @deprecated prefer bothGridsReady (offset-aware) */
export function bothGridsLocked(
  outgoingSonicDna: unknown,
  incomingSonicDna: unknown,
): boolean {
  return bothGridsReady(outgoingSonicDna, incomingSonicDna)
}

/** Relative BPM compatibility (|Δ| / master ≤ BPM_COMPAT_REL). */
export function pairBpmCompatible(
  outgoingBpm: number | null | undefined,
  incomingBpm: number | null | undefined,
  maxRel = BPM_COMPAT_REL,
): boolean {
  const a = Number(outgoingBpm)
  const b = Number(incomingBpm)
  if (!(a > 0) || !(b > 0)) return true
  const rel = Math.abs(a - b) / Math.max(a, b)
  return rel <= maxRel
}

/**
 * Quantize mix progress onto N phrase knees (default quarters).
 * Keeps EQ / bass-swap aligned with bar lines rather than free float.
 */
export function phraseQuantizedProgress(
  rawProgress: number,
  steps: number = PHRASE_EQ_STEPS,
): number {
  const x = Math.max(0, Math.min(1, rawProgress))
  const n = Math.max(1, Math.floor(steps))
  if (n <= 1) return x
  // Soft stair: snap toward nearest knee but keep continuous for ramps.
  const step = 1 / n
  const idx = Math.round(x / step)
  const snapped = Math.max(0, Math.min(1, idx * step))
  // Blend 70% snapped / 30% raw so automation isn't stair-stepped audibly.
  return snapped * 0.7 + x * 0.3
}

/**
 * Cap residual media seek to ±½ beat. Returns null when seek should be skipped
 * (error too large to redefine phrase — use micro-rate or TempoSync instead).
 */
export function clampResidualSeekSec(params: {
  phaseErrSec: number
  bpm: number
  /** Soft seek window (default 18–120 ms legacy band) */
  minAbsSec?: number
  maxAbsSec?: number
}): number | null {
  const bpm = params.bpm > 0 ? params.bpm : 120
  const halfBeat = (60 / bpm) * 0.5
  const err = params.phaseErrSec
  const abs = Math.abs(err)
  const minAbs = params.minAbsSec ?? 0.018
  const maxAbs = Math.min(params.maxAbsSec ?? 0.12, halfBeat)
  if (!(abs > minAbs) || abs >= maxAbs) return null
  if (abs > halfBeat) return null
  return Math.max(-halfBeat, Math.min(halfBeat, err))
}

/** Media seconds to pre-arm before OUT (1 phrase @ master BPM). */
export function prearmLeadSec(bpm: number, phraseBars = PREARM_PHRASE_BARS): number {
  const use = bpm > 0 ? bpm : 120
  return (60 / use) * 4 * phraseBars
}

/** Whether a poor mix quality should force safer next-mix defaults. */
export function shouldApplyQualityGate(grade: MixQualityGrade | null | undefined): boolean {
  return grade === 'poor' || grade === 'fair'
}
