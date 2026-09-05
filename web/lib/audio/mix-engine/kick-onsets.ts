/**
 * Kick / snare-clap onset series for Auto DJ BeatSync.
 * Prefer stored measured.*.OnsetSec; else project DNA steps; else derive from peaks.
 */

import { extractMeasured } from '@/lib/audio/sonic-dna-quality'
import { mergeSnareClapSteps } from '@/lib/audio/sonic-dna-mix'
import type { MixPeakSample } from './transient-align'

function sampleAmp(s: MixPeakSample): number {
  if (typeof s === 'number') return Math.abs(s)
  const p = Math.abs(Number(s.positive) || 0)
  const n = Math.abs(Number(s.negative) || 0)
  const r = Math.abs(Number(s.rms) || 0)
  return Math.max(p, n, r)
}

/** Seconds from `timeSec` to nearest onset in ±window (positive = onset later). */
export function nearestOnsetResidualSec(params: {
  timeSec: number
  onsetsSec: number[] | null | undefined
  windowSec?: number
}): number {
  const onsets = params.onsetsSec
  if (!onsets?.length || !Number.isFinite(params.timeSec)) return 0
  const window = Math.max(0.012, Math.min(0.05, params.windowSec ?? 0.028))
  const t = params.timeSec
  let best = 0
  let bestAbs = window + 1
  for (const o of onsets) {
    if (!Number.isFinite(o)) continue
    const d = o - t
    const a = Math.abs(d)
    if (a <= window && a < bestAbs) {
      bestAbs = a
      best = d
    }
  }
  return bestAbs <= window ? best : 0
}

/** Project DNA step indices onto the media timeline. */
export function kickOnsetsFromSteps(params: {
  bpm: number
  offsetSec?: number
  kickSteps?: number[] | null
  stepsPerBar?: number
  durationSec: number
  /** Repeat pattern across the track (default true). */
  tile?: boolean
}): number[] {
  const bpm = params.bpm
  const steps = params.kickSteps
  if (!(bpm > 0) || !steps?.length || !(params.durationSec > 0)) return []
  const spb = Math.max(4, Math.floor(params.stepsPerBar || 16))
  const beat = 60 / bpm
  const stepSec = (beat * 4) / spb
  const offset = Math.max(0, params.offsetSec ?? 0)
  const barSec = beat * 4
  const out: number[] = []
  const tile = params.tile !== false
  const unique = [...new Set(steps.filter((s) => Number.isFinite(s) && s >= 0))]
  if (!tile) {
    for (const s of unique) {
      const t = offset + s * stepSec
      if (t >= 0 && t < params.durationSec) out.push(t)
    }
    return out.sort((a, b) => a - b)
  }
  const bars = Math.ceil(params.durationSec / barSec) + 1
  for (let bar = 0; bar < bars; bar++) {
    for (const s of unique) {
      if (s >= spb) continue
      const t = offset + bar * barSec + s * stepSec
      if (t >= 0 && t < params.durationSec) out.push(t)
    }
  }
  return out
}

/**
 * Derive kick-like onsets from waveform peaks: local amp maxima with a rise,
 * quantized toward the beat grid when BPM is known.
 */
export function deriveKickOnsetSec(params: {
  peaks: MixPeakSample[] | null | undefined
  durationSec: number
  bpm?: number | null
  offsetSec?: number
  maxOnsets?: number
  /** Prefer backbeat-ish peaks (snare/clap) — offset snap by half-beat. */
  preferBackbeat?: boolean
}): number[] {
  const peaks = params.peaks
  const dur = params.durationSec
  if (!peaks?.length || !(dur > 0)) return []
  const n = peaks.length
  const amps = peaks.map(sampleAmp)
  let mean = 0
  for (const a of amps) mean += a
  mean /= n
  const thresh = Math.max(0.04, mean * (params.preferBackbeat ? 1.2 : 1.35))
  const candidates: { t: number; amp: number }[] = []
  for (let i = 2; i < n - 2; i++) {
    const a = amps[i]!
    if (a < thresh) continue
    if (a < amps[i - 1]! || a < amps[i + 1]!) continue
    const rise = a - Math.min(amps[i - 2]!, amps[i - 1]!)
    if (rise < mean * 0.12) continue
    const t = (i / Math.max(1, n - 1)) * dur
    candidates.push({ t, amp: a })
  }
  candidates.sort((a, b) => b.amp - a.amp)
  const max = Math.max(8, Math.min(params.maxOnsets ?? 256, 512))
  const minGap =
    typeof params.bpm === 'number' && params.bpm > 0 ? (60 / params.bpm) * 0.4 : 0.12
  const picked: number[] = []
  for (const c of candidates) {
    if (picked.length >= max) break
    if (picked.some((p) => Math.abs(p - c.t) < minGap)) continue
    let t = c.t
    if (typeof params.bpm === 'number' && params.bpm > 0) {
      const beat = 60 / params.bpm
      const off = Math.max(0, params.offsetSec ?? 0)
      const half = params.preferBackbeat ? beat * 0.5 : 0
      const k = Math.round((t - off - half) / beat)
      const snapped = off + half + k * beat
      if (Math.abs(snapped - t) <= beat * 0.22) t = snapped
    }
    picked.push(t)
  }
  return picked.sort((a, b) => a - b)
}

function resolveOffsetSec(
  offsetSec: number | null | undefined,
  measured: ReturnType<typeof extractMeasured>,
): number {
  if (typeof offsetSec === 'number' && Number.isFinite(offsetSec)) return offsetSec
  if (typeof measured?.gridOffsetSec === 'number' && Number.isFinite(measured.gridOffsetSec)) {
    return measured.gridOffsetSec
  }
  if (typeof measured?.window?.startSec === 'number') return measured.window.startSec
  return 0
}

function resolveBpm(
  bpm: number | null | undefined,
  measured: ReturnType<typeof extractMeasured>,
): number {
  if (typeof bpm === 'number' && bpm > 0) return bpm
  const m = Number(measured?.bpm)
  return m > 0 ? m : 0
}

function sanitizeOnsets(raw: unknown, durationSec: number): number[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map(Number)
    .filter((t) => Number.isFinite(t) && t >= 0 && t < durationSec + 0.5)
    .sort((a, b) => a - b)
}

/** Resolve best available kick onset series for a track. */
export function resolveKickOnsetSec(params: {
  sonicDna?: unknown
  peaks?: MixPeakSample[] | null
  durationSec: number
  bpm?: number | null
  offsetSec?: number | null
}): number[] {
  const measured = extractMeasured(params.sonicDna)
  const stored = sanitizeOnsets(measured?.kickOnsetSec, params.durationSec)
  if (stored.length >= 4) return stored

  const bpm = resolveBpm(params.bpm, measured)
  const offset = resolveOffsetSec(params.offsetSec, measured)
  const fromSteps = kickOnsetsFromSteps({
    bpm,
    offsetSec: offset,
    kickSteps: measured?.kickSteps || measured?.kickPhraseSteps,
    stepsPerBar: measured?.stepsPerBar || 16,
    durationSec: params.durationSec,
  })
  if (fromSteps.length >= 4) return fromSteps
  return deriveKickOnsetSec({
    peaks: params.peaks,
    durationSec: params.durationSec,
    bpm: bpm || null,
    offsetSec: offset,
  })
}

/** Resolve snare/clap onset series (backbeat pocket). */
export function resolveSnareClapOnsetSec(params: {
  sonicDna?: unknown
  peaks?: MixPeakSample[] | null
  durationSec: number
  bpm?: number | null
  offsetSec?: number | null
}): number[] {
  const measured = extractMeasured(params.sonicDna)
  const stored = sanitizeOnsets(measured?.snareClapOnsetSec, params.durationSec)
  if (stored.length >= 4) return stored

  const bpm = resolveBpm(params.bpm, measured)
  const offset = resolveOffsetSec(params.offsetSec, measured)
  const stepsPerBar = measured?.stepsPerBar || 16
  const barSteps = mergeSnareClapSteps(measured?.snareSteps, measured?.clapSteps, stepsPerBar)
  const phraseSteps = mergeSnareClapSteps(
    measured?.snarePhraseSteps,
    measured?.clapPhraseSteps,
    stepsPerBar * (measured?.phraseBars || 8),
  )
  const fromSteps = kickOnsetsFromSteps({
    bpm,
    offsetSec: offset,
    kickSteps: barSteps.length ? barSteps : phraseSteps.length ? phraseSteps : [4, 12],
    stepsPerBar,
    durationSec: params.durationSec,
  })
  if (fromSteps.length >= 4) return fromSteps
  return deriveKickOnsetSec({
    peaks: params.peaks,
    durationSec: params.durationSec,
    bpm: bpm || null,
    offsetSec: offset,
    preferBackbeat: true,
  })
}

export type GridOnsetBundle = {
  kickOnsetSec: number[]
  snareClapOnsetSec: number[]
}

/** Build kick + snare/clap onsets for persist / MixEngine. */
export function buildGridOnsetBundle(params: {
  sonicDna?: unknown
  peaks?: MixPeakSample[] | null
  durationSec: number
  bpm?: number | null
  offsetSec?: number | null
}): GridOnsetBundle {
  return {
    kickOnsetSec: resolveKickOnsetSec(params),
    snareClapOnsetSec: resolveSnareClapOnsetSec(params),
  }
}

/**
 * Boost peak samples nearest to onset times so waveform paint lines up with
 * the beat grid / transient pocket (visual lock — does not change MixEngine math).
 */
export function emphasizePeaksNearOnsets(
  peaks: number[],
  onsetsSec: number[],
  durationSec: number,
  boost = 0.35,
): number[] {
  if (!peaks.length || !onsetsSec.length || !(durationSec > 0)) return peaks
  const n = peaks.length
  const out = peaks.slice()
  const radius = Math.max(1, Math.round(n * 0.0015))
  for (const t of onsetsSec) {
    if (!Number.isFinite(t) || t < 0 || t > durationSec) continue
    const center = Math.round((t / durationSec) * (n - 1))
    for (let d = -radius; d <= radius; d++) {
      const i = center + d
      if (i < 0 || i >= n) continue
      const w = 1 - Math.abs(d) / (radius + 1)
      const cur = out[i]!
      out[i] = Math.min(1, cur + (1 - cur) * boost * w)
    }
  }
  return out
}

export function isGridLocked(sonicDna: unknown): boolean {
  if (!sonicDna || typeof sonicDna !== 'object') return false
  const root = sonicDna as Record<string, unknown>
  if (root.gridLocked === true) return true
  const measured = extractMeasured(sonicDna)
  return Boolean(measured && (measured as { gridLocked?: boolean }).gridLocked)
}

export function readGridLockScore(sonicDna: unknown): number | null {
  const measured = extractMeasured(sonicDna)
  const n = Number((measured as { gridLockScore?: number } | null)?.gridLockScore)
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : null
}

export type GridDnaExtras = {
  kickOnsetSec?: number[]
  snareClapOnsetSec?: number[]
  gridLockScore?: number
  /** Absolute phrase-1 downbeat (same as beat_grid_offset). */
  gridOffsetSec?: number
}

/** Merge gridLocked (+ optional onset series) into a sonic_dna blob. */
export function withGridLockOnDna(
  sonicDna: unknown,
  locked: boolean,
  extras?: GridDnaExtras,
): Record<string, unknown> {
  const base =
    sonicDna && typeof sonicDna === 'object'
      ? { ...(sonicDna as Record<string, unknown>) }
      : {}
  const measuredRaw =
    base.measured && typeof base.measured === 'object'
      ? { ...(base.measured as Record<string, unknown>) }
      : {}
  measuredRaw.gridLocked = locked
  if (extras?.kickOnsetSec?.length) measuredRaw.kickOnsetSec = extras.kickOnsetSec
  if (extras?.snareClapOnsetSec?.length) measuredRaw.snareClapOnsetSec = extras.snareClapOnsetSec
  if (typeof extras?.gridLockScore === 'number') measuredRaw.gridLockScore = extras.gridLockScore
  if (
    typeof extras?.gridOffsetSec === 'number' &&
    Number.isFinite(extras.gridOffsetSec) &&
    extras.gridOffsetSec >= 0
  ) {
    measuredRaw.gridOffsetSec = extras.gridOffsetSec
  }
  base.measured = measuredRaw
  base.gridLocked = locked
  return base
}

/** Persist onset analysis without forcing UI lock state. */
export function withGridAnalysisOnDna(
  sonicDna: unknown,
  extras: GridDnaExtras & { gridLocked?: boolean; offsetSec?: number },
): Record<string, unknown> {
  const locked =
    typeof extras.gridLocked === 'boolean' ? extras.gridLocked : isGridLocked(sonicDna)
  const gridOffsetSec =
    typeof extras.gridOffsetSec === 'number'
      ? extras.gridOffsetSec
      : typeof extras.offsetSec === 'number'
        ? extras.offsetSec
        : undefined
  return withGridLockOnDna(sonicDna, locked, {
    kickOnsetSec: extras.kickOnsetSec,
    snareClapOnsetSec: extras.snareClapOnsetSec,
    gridLockScore: extras.gridLockScore,
    gridOffsetSec,
  })
}
