/**
 * One overlap clock — fade, EQ, tempo, and phase all read this.
 *
 * Mix length is N bars on the outgoing lattice. Fader/EQ turns sit on those
 * bar lines. Tempo uses the same continuous 0–1 (never stair-stepped).
 */

import { smootherstep } from './curves'

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x))
}

export function overlapBarSec(bpm: number): number {
  return (60 / Math.max(60, bpm)) * 4
}

export type IntegratedMediaClock = {
  mediaSec: number
  rateAtCtx: number
  rate: number
}

export function createIntegratedMediaClock(
  mediaSec: number,
  rateAtCtx: number,
  rate: number,
): IntegratedMediaClock {
  return { mediaSec, rateAtCtx, rate: rate > 0 ? rate : 1 }
}

export function integrateMediaSec(clock: IntegratedMediaClock, nowCtx: number): number {
  const dt = Math.max(0, nowCtx - clock.rateAtCtx)
  const rate = clock.rate > 0 ? clock.rate : 1
  return Math.max(0, clock.mediaSec + dt * rate)
}

export function snapshotIntegratedMedia(
  clock: IntegratedMediaClock,
  nowCtx: number,
  nextRate?: number,
): IntegratedMediaClock {
  const mediaSec = integrateMediaSec(clock, nowCtx)
  return {
    mediaSec,
    rateAtCtx: nowCtx,
    rate: typeof nextRate === 'number' && nextRate > 0 ? nextRate : clock.rate,
  }
}

/** Pull a virtual ctx clock toward the audible HTMLAudio playhead without chasing jitter. */
export function followHeardMedia(
  virtualSec: number,
  heardSec: number,
  alpha = 0.12,
): number {
  if (!Number.isFinite(heardSec) || !Number.isFinite(virtualSec)) {
    return Number.isFinite(virtualSec) ? virtualSec : Math.max(0, heardSec || 0)
  }
  const a = Math.max(0.02, Math.min(0.35, alpha))
  return virtualSec + a * (heardSec - virtualSec)
}

/**
 * Piecewise fade: each bar is one smootherstep slice of 0→1.
 * At integer bar k of N, progress is exactly k/N (bass knee at bar 4 of 8).
 */
export function barAlignedFadeProgress(barsElapsed: number, nBars: number): number {
  const n = Math.max(1e-6, nBars)
  const x = Math.max(0, Math.min(n, barsElapsed))
  if (x <= 0) return 0
  if (x >= n) return 1
  const barStart = Math.floor(x)
  const barEnd = Math.min(n, barStart + 1)
  const local = (x - barStart) / Math.max(1e-6, barEnd - barStart)
  const startU = barStart / n
  const endU = barEnd / n
  return startU + (endU - startU) * smootherstep(local)
}

export type OverlapClockSample = {
  /** Continuous 0–1 on the outgoing bar lattice (tempo + phase progress). */
  raw: number
  /** Bar-aligned fader/EQ (turns on bar lines). */
  fade: number
  eq: number
  /** Same as raw — rates must not stair-step. */
  tempo: number
  barsElapsed: number
  barIndex: number
  overlapBars: number
  barSec: number
  mixSec: number
  done: boolean
}

/**
 * Sample the shared overlap clock.
 * `mixSec` is the audible length (may be shorter than N bars if the outro is late).
 * Knees still land on outgoing bars of that length.
 */
export function sampleOverlapClock(params: {
  mediaElapsedSec: number
  bpm: number
  mixSec: number
  overlapBars?: number
}): OverlapClockSample {
  const barSec = overlapBarSec(params.bpm)
  const mixSec = Math.max(0.25, params.mixSec)
  const plannedBars =
    typeof params.overlapBars === 'number' && params.overlapBars > 0
      ? params.overlapBars
      : mixSec / barSec
  const nBars = Math.max(1, mixSec / barSec)
  const elapsed = Math.max(0, params.mediaElapsedSec)
  const raw = clamp01(elapsed / mixSec)
  const barsElapsed = elapsed / barSec
  const fade = barAlignedFadeProgress(barsElapsed, nBars)
  return {
    raw,
    fade,
    eq: fade,
    tempo: raw,
    barsElapsed,
    barIndex: Math.min(Math.floor(plannedBars), Math.max(0, Math.floor(barsElapsed))),
    overlapBars: plannedBars,
    barSec,
    mixSec,
    done: raw >= 1 || elapsed >= mixSec - 1e-4,
  }
}
