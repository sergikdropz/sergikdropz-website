/**
 * Skip-while-cued: start a dual-deck blend from the next outgoing beat
 * into the parked phrase-1 incoming cue. Do not cold-load the live deck.
 */

import type { InPhraseBars, MixPlan, MixStyle, OutPhraseBars, PhraseBars } from './types'

/** Next grid line after `nowSec` (never snaps backward). */
export function nextGridSec(
  nowSec: number,
  bpm: number,
  offsetSec = 0,
  periodBeats = 1,
): number {
  if (!Number.isFinite(nowSec) || !Number.isFinite(bpm) || bpm <= 0) {
    return Math.max(0, nowSec || 0)
  }
  const beat = 60 / bpm
  const period = beat * Math.max(1, periodBeats)
  const origin = Number.isFinite(offsetSec) ? offsetSec : 0
  const n = Math.ceil((nowSec - origin + 1e-3) / period)
  return Math.max(0, origin + n * period)
}

export type SkipBlendPlanInput = {
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

/**
 * Build a skip mix: fire on the next outgoing beat, incoming stays on phrase 1.
 * Reuses a frozen/last plan's IN cue and style when it matches this pair.
 */
export function buildSkipBlendPlan(input: SkipBlendPlanInput): MixPlan {
  const prior =
    input.prior && input.prior.incomingTrackId === input.incomingTrackId ? input.prior : null
  const fireAt = nextGridSec(input.nowSec, input.outgoingBpm, input.outgoingOffsetSec ?? 0, 1)
  const barSec = (60 / Math.max(1, input.outgoingBpm)) * 4
  const overlapBars = (prior?.overlapBars ?? input.overlapBars) as PhraseBars
  let mixSec =
    typeof prior?.mixDurationSec === 'number' && prior.mixDurationSec > 0
      ? prior.mixDurationSec
      : overlapBars * barSec
  if (typeof input.remainSec === 'number' && Number.isFinite(input.remainSec)) {
    mixSec = Math.max(0.8, Math.min(mixSec, input.remainSec - 0.15, 48))
  } else {
    mixSec = Math.max(0.8, Math.min(mixSec, 48))
  }

  return {
    outgoingTrackId: input.outgoingTrackId,
    incomingTrackId: input.incomingTrackId,
    startAtOutgoingSec: fireAt,
    mixOutMarkerSec: fireAt,
    incomingStartSec: prior?.incomingStartSec ?? input.incomingStartSec,
    resolvedIncomingSec: prior?.resolvedIncomingSec,
    mixDurationSec: mixSec,
    rateRatio: input.rateRatio,
    style: prior?.style ?? input.style,
    curve: prior?.curve ?? 'equal-power',
    outPhraseBars: prior?.outPhraseBars ?? input.outPhraseBars,
    inPhraseBars: prior?.inPhraseBars ?? input.inPhraseBars,
    overlapBars,
    phraseBars: prior?.phraseBars ?? overlapBars,
    reason: 'Skip blend',
    phrase1Lock: true,
    blendFromOut: true,
    masterTempoHandoff: true,
    holdBeatmatch: prior?.holdBeatmatch ?? true,
    dnaConfidence: prior?.dnaConfidence,
    phraseLock: prior?.phraseLock,
  }
}
