/**
 * Pure AutoDJ orchestration helpers — plan freeze, prepare lead-in, fire refresh, skip blend.
 * Keeps MusicPlayer thin: MixEngine owns DSP; this owns plan snapshots.
 */

import { buildSkipBlendPlan } from '@/lib/audio/mix-engine/skip-blend'
import { exactOverlapDurationSec } from '@/lib/audio/mix-engine/phrase-mix-doctrine'
import { assertInvariant as assertBlendInvariant } from '@/lib/audio/mix-engine/blend-pipeline'
import type {
  InPhraseBars,
  MixPlan,
  MixStyle,
  OutPhraseBars,
  PhraseBars,
} from '@/lib/audio/mix-engine/types'

/** Stamp prepare-only lead-in without rebuilding DNA/phrase math. */
export function applyPrepareLeadIn(plan: MixPlan, leadInSec: number): MixPlan {
  const prepareLeadInSec = Math.max(0, leadInSec || 0)
  if ((plan.prepareLeadInSec ?? 0) === prepareLeadInSec) return plan
  return { ...plan, prepareLeadInSec }
}

export type FirePlanResolveInput = {
  frozen: MixPlan | null | undefined
  fallback: MixPlan
  nowSec: number
  outMarker: number
  beatSec: number
  remainAfterOut: number
  /** When true (doctrine default), never compress below exact 8/16. */
  exactOverlap?: boolean
}

/**
 * Prefer the frozen OUT plan at fire. Only use fallback when the playhead
 * is late past ~¾ beat after the marker (missed rAF).
 */
export function resolveFireMixPlan(input: FirePlanResolveInput): MixPlan {
  const {
    frozen,
    fallback,
    nowSec,
    outMarker,
    beatSec,
    remainAfterOut,
    exactOverlap = true,
  } = input

  const latePastMarker = nowSec > outMarker + beatSec * 0.75
  const base =
    frozen && !latePastMarker
      ? frozen
      : frozen && latePastMarker
        ? {
            ...frozen,
            // Late fire: keep frozen cues/style; shrink only when not exact-overlap doctrine.
            mixDurationSec: frozen.mixDurationSec,
          }
        : fallback

  const forceExact =
    exactOverlap ||
    (base.exactOverlap !== false &&
      base.phrase1Lock !== false &&
      (base.style === 'crossfade' || base.blendFromOut === true))

  const mixDurationSec = forceExact
    ? exactOverlapDurationSec(base.mixDurationSec)
    : Math.min(base.mixDurationSec, Math.max(0.8, remainAfterOut))

  return {
    ...base,
    mixDurationSec,
    startAtOutgoingSec: base.startAtOutgoingSec ?? outMarker,
    mixOutMarkerSec: base.mixOutMarkerSec ?? outMarker,
    phrase1Lock: true,
    blendFromOut: true,
    masterTempoHandoff: true,
  }
}

export type SkipBlendOrchestrateInput = {
  outgoingTrackId: string
  incomingTrackId: string
  nowSec: number
  outgoingBpm: number
  outgoingOffsetSec?: number
  incomingStartSec: number
  overlapBars: PhraseBars
  rateRatio: number
  style: MixStyle
  outPhraseBars: OutPhraseBars
  inPhraseBars: InPhraseBars
  remainSec?: number
  prior?: MixPlan | null
}

/** Build a skip-while-cued plan from the next outgoing beat into parked phrase-1. */
export function orchestrateSkipBlendPlan(input: SkipBlendOrchestrateInput): MixPlan {
  return buildSkipBlendPlan(input)
}

export type FireBlendGateInput = {
  hasIncomingReady: boolean
  plannedOverlapSec: number
  exactOverlapSec: number
  cueDeltaSec?: number
  preArmLocked?: boolean
  requireIncomingReady?: boolean
}

/**
 * Doctrine gate before prepareAndTransition — reject compressed overlaps
 * and (optionally) missing incoming buffers.
 */
export function gateAutoDjFire(input: FireBlendGateInput): {
  ok: boolean
  reason?: string
  mixDurationSec: number
} {
  const planned = Math.max(0.8, input.plannedOverlapSec)
  let exact = Math.max(0.8, input.exactOverlapSec)
  if (exact + 1e-6 < planned * 0.98) {
    // Prefer doctrine length over a compressed remain-based fade.
    exact = exactOverlapDurationSec(planned)
  }

  const check = assertBlendInvariant({
    stage: 'fire',
    preArmLocked: input.preArmLocked ?? true,
    hasIncomingReady: input.hasIncomingReady,
    plannedOverlapSec: planned,
    exactOverlapSec: exact,
    cueDeltaSec: input.cueDeltaSec,
    requireIncomingReady: input.requireIncomingReady ?? false,
  })

  return {
    ok: check.ok,
    reason: check.reason,
    mixDurationSec: exact,
  }
}

/** Prefer trusted pair scoring only — no loose DNA fallback under BeatSync 4/4. */
export function shouldBlockDnaFallback(params: {
  syncMode: 'beat-sync' | 'tempo-sync'
  fourOnFloorOutgoing: boolean
}): boolean {
  return params.syncMode === 'beat-sync' && params.fourOnFloorOutgoing
}
