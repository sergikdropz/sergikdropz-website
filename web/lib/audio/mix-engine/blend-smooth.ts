/**
 * Smooth-blend shaping — bar knees, incoming delay, bass/mid handoff, echo tail.
 * Does not change phrase lock or incoming-only vinyl bend.
 */

import { smootherstep } from './curves'

export {
  BASS_INCOMING_KNEE,
  BASS_KNEE_WIDTH,
  MID_KILL_DB,
  bassOpenU,
  complementaryMidDb,
  midDuckDb,
} from './curves'

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x))
}

/** Stretch Smooth to 16 bars when |ΔBPM| / master exceeds this. */
export const LONG_BLEND_BPM_REL = 0.04

/** ½–1 bar of delay on Smooth so incoming mids don’t slap on frame 0. */
export function smoothIncomingDelay(params: {
  vocalWeight?: number
  incomingBass?: number
}): number {
  const vocal = params.vocalWeight ?? 0
  const bass = params.incomingBass ?? 0
  if (vocal > 0.4) return 0.08
  if (vocal > 0.28 || bass > 0.35) return 0.06
  return 0.04
}

/** 16-bar Smooth when BPM walk is large or outgoing is still a drop. */
export function preferLongSmoothOverlap(params: {
  bpmRelDelta?: number
  outgoingSection?: string | null
  qualityGated?: boolean
}): boolean {
  if (params.qualityGated) return false
  if ((params.bpmRelDelta ?? 0) > LONG_BLEND_BPM_REL) return true
  return params.outgoingSection === 'drop'
}

/**
 * Echo follows outgoing fader, then dies over the last beat of the mix
 * so the handoff isn’t a hole or a leftover slap.
 */
export function echoSendAtProgress(params: {
  echoSend: number
  outgoingGain: number
  progress: number
  mixSec: number
  beatSec: number
}): number {
  const send = Math.max(0, params.echoSend)
  const outG = clamp01(params.outgoingGain)
  const base = send * (1 - outG)
  if (!(base > 0.001)) return 0
  const mixSec = Math.max(0.25, params.mixSec)
  const beatSec = Math.max(0.2, params.beatSec)
  const lastBeatStart = 1 - Math.min(0.25, beatSec / mixSec)
  const p = clamp01(params.progress)
  if (p < lastBeatStart) return base
  const u = smootherstep((p - lastBeatStart) / Math.max(1e-6, 1 - lastBeatStart))
  return base * (1 - u)
}

/** Wall-clock ms for EQ/filter settle — one beat, not a fixed 280ms. */
export function handoffSettleMs(bpm: number): number {
  const beatMs = (60 / Math.max(60, bpm)) * 1000
  return Math.max(180, Math.min(800, beatMs))
}

/** Pull LPF/HPF toward open over the last bar of the blend. */
export function filterSettleTowardOpen(params: {
  lpfHz: number
  hpfHz: number
  progress: number
  lastStart?: number
}): { lpfHz: number; hpfHz: number } {
  const start = params.lastStart ?? 0.875
  const p = clamp01(params.progress)
  if (p < start) return { lpfHz: params.lpfHz, hpfHz: params.hpfHz }
  const u = smootherstep((p - start) / Math.max(1e-6, 1 - start))
  const lpf = params.lpfHz * Math.pow(20000 / Math.max(80, params.lpfHz), u)
  const hpf = params.hpfHz * Math.pow(20 / Math.max(20, params.hpfHz), u)
  return { lpfHz: lpf, hpfHz: hpf }
}
