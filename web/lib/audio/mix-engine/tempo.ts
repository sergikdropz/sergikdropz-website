/**
 * DJ tempo / key-lock helpers — clean time-stretch via preservesPitch,
 * formant-aware EQ compensation, smooth rate ramps, and tempo crossfade.
 */

import { smootherstep } from './curves'
import { mixIncomingRateRatio } from './sync'
import type { MixStyle } from './types'

export const TEMPO_MIN = 0.5
export const TEMPO_MAX = 1.5
/** Max single-frame rate step during a mix (micro-nudge smoothing). */
export const MIX_RATE_SLEW = 0.018
/** Soft blend into tempo glide — avoids a hard snap at the phrase knee. */
export const TEMPO_GLIDE_SOFT_KNEE = 0.06
/** Smallest rate delta worth writing (see applyDeckTempo). */
export const TEMPO_RATE_WRITE_EPSILON = 0.0002

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x))
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

export function clampTempoRate(rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) return 1
  return clamp(rate, TEMPO_MIN, TEMPO_MAX)
}

export function tempoPercentToRate(percent: number): number {
  return clampTempoRate(1 + percent / 100)
}

export function rateToTempoPercent(rate: number): number {
  return (clampTempoRate(rate) - 1) * 100
}

export function adjustedBpm(originalBpm: number | null | undefined, rate: number): number | null {
  if (originalBpm == null || !(originalBpm > 0)) return null
  return Math.round(originalBpm * clampTempoRate(rate) * 10) / 10
}

/**
 * Enable browser key-lock (tempo change without vinyl pitch shift).
 *
 * Re-asserting `preservesPitch` flushes the browser's time-stretcher, so this is
 * a no-op when the flag already holds the requested value. The mix loop calls
 * into here every animation frame; writing unconditionally was audible.
 */
export function configureKeyLock(element: HTMLAudioElement, enabled = true): void {
  try {
    if (element.preservesPitch === enabled) return
    element.preservesPitch = enabled
    ;(element as HTMLAudioElement & { mozPreservesPitch?: boolean }).mozPreservesPitch = enabled
    ;(element as HTMLAudioElement & { webkitPreservesPitch?: boolean }).webkitPreservesPitch =
      enabled
  } catch {
    /* ignore */
  }
}

/**
 * Smallest rate change worth writing to a media element. A 0.02% tempo step is
 * far below audibility, but every `playbackRate` write reconfigures the
 * time-stretcher — at 60fps that reconfiguration itself is what you hear.
 */
const RATE_WRITE_EPSILON = TEMPO_RATE_WRITE_EPSILON

/**
 * EQ offsets (dB) to keep time-stretched audio clear — lifts air when slowed,
 * tames harshness when sped up. Add on top of user EQ.
 */
export function formantCompensationGains(rate: number): {
  low: number
  mid: number
  high: number
} {
  const r = clampTempoRate(rate)
  const dev = r - 1
  if (Math.abs(dev) < 0.006) return { low: 0, mid: 0, high: 0 }
  const slow = dev < 0 ? -dev : 0
  const fast = dev > 0 ? dev : 0
  return {
    low: slow * 2.4 - fast * 1.0,
    mid: slow * 0.6 - fast * 1.8,
    high: slow * 3.8 - fast * 1.2,
  }
}

export function mergeEqWithFormantCompensation(
  base: { low: number; mid: number; high: number },
  rate: number
): { low: number; mid: number; high: number } {
  const comp = formantCompensationGains(rate)
  return {
    low: clamp(base.low + comp.low, -40, 12),
    mid: clamp(base.mid + comp.mid, -40, 12),
    high: clamp(base.high + comp.high, -40, 12),
  }
}

/** Apply tempo with key-lock; optional instant vs slewed update. */
export function applyDeckTempo(
  element: HTMLAudioElement,
  rate: number,
  opts?: { keyLock?: boolean; currentRate?: number; slew?: number; instant?: boolean }
): number {
  const keyLock = opts?.keyLock !== false
  configureKeyLock(element, keyLock)
  const target = clampTempoRate(rate)
  const current =
    typeof opts?.currentRate === 'number' && opts.currentRate > 0
      ? opts.currentRate
      : Number.isFinite(element.playbackRate) && element.playbackRate > 0
        ? element.playbackRate
        : 1
  let next = target
  if (!opts?.instant) {
    const slew = typeof opts?.slew === 'number' && opts.slew > 0 ? opts.slew : MIX_RATE_SLEW
    const delta = target - current
    if (Math.abs(delta) <= slew) next = target
    else next = current + Math.sign(delta) * slew
  }
  next = clampTempoRate(next)
  try {
    // Skip inaudible deltas so a 60fps caller doesn't thrash the stretcher.
    if (Math.abs(element.playbackRate - next) >= RATE_WRITE_EPSILON) {
      element.playbackRate = next
    }
  } catch {
    /* ignore */
  }
  return next
}

export type MixDeckRates = {
  outgoingRate: number
  /** Locked rate during overlap (matches outgoing effective BPM) */
  incomingRate: number
  /** Final rate after crossfade (incoming native + user target) */
  incomingTargetRate: number
  effectiveOutBpm: number
  effectiveInBpm: number
}

export type TempoCrossfadePlan = {
  outgoingRate: number
  /** Incoming rate at mix entry — locks kicks/claps to outgoing */
  mixStartRate: number
  /** Rate at end of overlap — incoming's natural tempo (+ user slider) */
  mixEndRate: number
  /** Mix progress 0–1 where glide to mixEndRate begins */
  glideStart: number
  effectiveOutBpm: number
  effectiveInBpm: number
  /** Base catalog BPMs (media-time clocks) */
  outBaseBpm: number
  inBaseBpm: number
  /** Master clock at mix start (outgoing effective) */
  masterStartBpm: number
  /** Master clock at mix end (incoming native / target) */
  masterEndBpm: number
  /** When true, both decks follow masterBpm(p) together */
  dualMasterGlide: boolean
  /** Outgoing playbackRate at mix end (follows master → incoming native) */
  outEndRate: number
}

/** Max relative BPM delta for dual-deck master glide (else hold lock longer / smaller glide). */
export const MASTER_GLIDE_BPM_REL_CAP = 0.08

/** Perceptual BPM interpolation — log-linear feels more even than linear Hz steps. */
function interpolateMasterBpm(start: number, end: number, u: number): number {
  const t = smootherstep(u)
  if (Math.abs(start - end) < 0.08) return start + (end - start) * t
  return Math.exp(Math.log(start) + (Math.log(end) - Math.log(start)) * t)
}

/** 0 during hold, smooth 0→1 from soft knee through mix end. */
export function tempoMixProgress(plan: TempoCrossfadePlan, mixProgress: number): number {
  const p = clamp01(mixProgress)
  if (Math.abs(plan.masterEndBpm - plan.masterStartBpm) < 0.05) return 0
  const knee = Math.max(0, plan.glideStart - TEMPO_GLIDE_SOFT_KNEE)
  if (p <= knee) return 0
  const u = (p - knee) / Math.max(1e-6, 1 - knee)
  return smootherstep(u)
}

/** 0 before glide knee, 0→1 through the glide region (alias of tempoMixProgress). */
export function tempoGlideProgress(plan: TempoCrossfadePlan, mixProgress: number): number {
  return tempoMixProgress(plan, mixProgress)
}

/** Full mix tempo plan — honors live outgoing slider + beatmatch ratio. */
export function computeMixDeckRates(params: {
  outgoingBpm: number | null | undefined
  incomingBpm: number | null | undefined
  outgoingPlaybackRate?: number
  incomingTargetRate?: number
}): MixDeckRates {
  const plan = computeTempoCrossfadePlan({
    outgoingBpm: params.outgoingBpm,
    incomingBpm: params.incomingBpm,
    outgoingPlaybackRate: params.outgoingPlaybackRate,
    incomingTargetRate: params.incomingTargetRate,
    style: 'crossfade',
  })
  return {
    outgoingRate: plan.outgoingRate,
    incomingRate: plan.mixStartRate,
    incomingTargetRate: plan.mixEndRate,
    effectiveOutBpm: plan.effectiveOutBpm,
    effectiveInBpm: plan.effectiveInBpm,
  }
}

/**
 * Tempo crossfade: hold beatmatch, then glide a shared master clock toward
 * incoming native BPM. Both decks follow the master so phase stays locked.
 */
export function computeTempoCrossfadePlan(params: {
  outgoingBpm: number | null | undefined
  incomingBpm: number | null | undefined
  outgoingPlaybackRate?: number
  incomingTargetRate?: number
  style?: MixStyle
  /** Dual-deck master handoff (default true for DJ blends) */
  dualMasterGlide?: boolean
  /** Pre-armed incoming playbackRate (outgoing BPM / incoming BPM). */
  mixStartRate?: number
}): TempoCrossfadePlan {
  const outRate = clampTempoRate(params.outgoingPlaybackRate ?? 1)
  const inTarget = clampTempoRate(params.incomingTargetRate ?? 1)
  const outBpm = typeof params.outgoingBpm === 'number' && params.outgoingBpm > 0 ? params.outgoingBpm : 120
  const inBpm = typeof params.incomingBpm === 'number' && params.incomingBpm > 0 ? params.incomingBpm : outBpm
  const computedStart = mixIncomingRateRatio({
    outgoingBpm: outBpm,
    incomingBpm: inBpm,
    outgoingPlaybackRate: outRate,
  })
  const armed =
    typeof params.mixStartRate === 'number' &&
    Number.isFinite(params.mixStartRate) &&
    params.mixStartRate > 0
      ? clampTempoRate(params.mixStartRate)
      : computedStart
  const mixStartRate = armed
  const masterStartBpm = outBpm * outRate
  const masterEndBpm = inBpm * inTarget
  const bpmRel =
    masterStartBpm > 0 ? Math.abs(masterEndBpm - masterStartBpm) / masterStartBpm : 0
  // Shared master clock keeps both decks on the same effective BPM through the blend.
  const dual = params.dualMasterGlide !== false

  // Hold beatmatch through the first half+ of the blend, then glide.
  // Smooth crossfade holds longer; large ΔBPM holds even longer.
  const style = params.style ?? 'crossfade'
  let glideStart =
    style === 'cut'
      ? 0.67
      : style === 'crossfade'
        ? 0.58
        : style === 'filter-eq'
          ? 0.54
          : 0.5
  if (bpmRel > MASTER_GLIDE_BPM_REL_CAP) glideStart = Math.max(glideStart, 0.68)
  else if (bpmRel < 0.02) glideStart = 0.78
  const knees = [0.5, 0.54, 0.58, 0.67, 0.68, 0.78]
  glideStart = knees.reduce((best, k) =>
    Math.abs(k - glideStart) < Math.abs(best - glideStart) ? k : best,
  )

  const outEndRate = clampTempoRate(masterEndBpm / Math.max(1e-6, outBpm))

  return {
    outgoingRate: outRate,
    mixStartRate: clampTempoRate(mixStartRate),
    mixEndRate: inTarget,
    glideStart,
    effectiveOutBpm: masterStartBpm,
    effectiveInBpm: inBpm * mixStartRate,
    outBaseBpm: outBpm,
    inBaseBpm: inBpm,
    masterStartBpm,
    masterEndBpm,
    dualMasterGlide: dual,
    outEndRate,
  }
}

/** Master BPM along the shared clock (hold then perceptual log-linear glide). */
export function masterBpmAt(plan: TempoCrossfadePlan, mixProgress: number): number {
  const t = tempoMixProgress(plan, mixProgress)
  if (t <= 0) return plan.masterStartBpm
  if (Math.abs(plan.masterEndBpm - plan.masterStartBpm) < 0.05) return plan.masterStartBpm
  return interpolateMasterBpm(plan.masterStartBpm, plan.masterEndBpm, t)
}

/**
 * Dual-deck rates for a shared master clock.
 * Incoming-only fallback when dualMasterGlide is false.
 */
export function masterDeckRatesAt(
  plan: TempoCrossfadePlan,
  mixProgress: number,
): { masterBpm: number; outRate: number; inRate: number } {
  const glide = tempoMixProgress(plan, mixProgress)
  if (!plan.dualMasterGlide) {
    const u = glide
    const inRate =
      u <= 0
        ? plan.mixStartRate
        : Math.abs(plan.mixEndRate - plan.mixStartRate) < 0.002
          ? plan.mixStartRate
          : clampTempoRate(plan.mixStartRate + (plan.mixEndRate - plan.mixStartRate) * u)
    const outRate = clampTempoRate(
      plan.outgoingRate + (plan.outEndRate - plan.outgoingRate) * u,
    )
    return {
      masterBpm: plan.inBaseBpm * inRate,
      outRate,
      inRate,
    }
  }
  if (glide <= 0) {
    return {
      masterBpm: plan.masterStartBpm,
      outRate: plan.outgoingRate,
      inRate: plan.mixStartRate,
    }
  }
  const masterBpm = masterBpmAt(plan, mixProgress)
  return {
    masterBpm,
    outRate: clampTempoRate(masterBpm / Math.max(1e-6, plan.outBaseBpm)),
    inRate: clampTempoRate(masterBpm / Math.max(1e-6, plan.inBaseBpm)),
  }
}

/** Incoming playbackRate for a given mix progress (0 = start, 1 = end). */
export function tempoCrossfadeRateAt(plan: TempoCrossfadePlan, mixProgress: number): number {
  if (plan.dualMasterGlide) {
    return masterDeckRatesAt(plan, mixProgress).inRate
  }
  const glide = tempoMixProgress(plan, mixProgress)
  if (glide <= 0) return plan.mixStartRate
  if (Math.abs(plan.mixEndRate - plan.mixStartRate) < 0.002) return plan.mixStartRate
  return clampTempoRate(plan.mixStartRate + (plan.mixEndRate - plan.mixStartRate) * glide)
}

/** Suggest lead-in seconds so the engine can lock phase before OUT. */
export function suggestLeadInSec(params: {
  startAtOutgoingSec: number
  nowSec: number
  bpm: number
  outPhraseBars?: number
  maxSec?: number
}): number {
  const delay = params.startAtOutgoingSec - params.nowSec
  if (!(delay > 0.25) || delay > 12) return 0
  const beat = params.bpm > 0 ? 60 / params.bpm : 0.5
  const phraseSec = beat * 4 * (params.outPhraseBars ?? 8)
  const cap = params.maxSec ?? 3
  // ~¼ phrase pre-roll, capped by time until OUT
  return Math.min(cap, Math.max(0, Math.min(delay - 0.1, phraseSec * 0.28)))
}

/** Smoothly ramp an element's playbackRate (returns cancel fn). */
export function rampDeckTempo(
  element: HTMLAudioElement,
  fromRate: number,
  toRate: number,
  durationMs: number,
  opts?: { keyLock?: boolean; onTick?: (rate: number) => void; onFormant?: (rate: number) => void }
): () => void {
  configureKeyLock(element, opts?.keyLock !== false)
  const start = performance.now()
  let raf = 0
  const step = (now: number) => {
    const u = Math.min(1, (now - start) / Math.max(16, durationMs))
    const eased = u * u * u * (u * (u * 6 - 15) + 10)
    const rate = clampTempoRate(fromRate + (toRate - fromRate) * eased)
    try {
      element.playbackRate = rate
    } catch {
      /* ignore */
    }
    opts?.onTick?.(rate)
    opts?.onFormant?.(rate)
    if (u < 1) raf = requestAnimationFrame(step)
  }
  raf = requestAnimationFrame(step)
  return () => {
    if (raf) cancelAnimationFrame(raf)
  }
}
