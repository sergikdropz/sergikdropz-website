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

/** Bin-center index for a time on a uniform peak tape (matches `indexToTimeSec`). */
function onsetBinIndex(timeSec: number, sampleCount: number, durationSec: number): number {
  if (sampleCount <= 0 || durationSec <= 0) return 0
  return Math.max(0, Math.min(sampleCount - 1, Math.round((timeSec / durationSec) * sampleCount - 0.5)))
}

type RemeshablePeak = {
  positive: number
  negative: number
  rms?: number
  flux?: number
  bands?: { low: number; mid: number; high: number }
  timeSec?: number
}

function peakAmp(s: RemeshablePeak): number {
  return Math.max(s.positive, s.negative, s.rms ?? 0)
}

/**
 * Move crest energy onto kick/snare onset bins so the painted silhouette
 * locks to transients (visual only — does not change MixEngine math).
 */
export function remeshPeaksOntoOnsets<T extends RemeshablePeak>(
  samples: T[],
  onsetsSec: number[],
  durationSec: number,
  options?: { searchSec?: number; boost?: number },
): T[] {
  if (!samples.length || !onsetsSec.length || !(durationSec > 0)) return samples
  const n = samples.length
  const searchSec = Math.max(0.018, Math.min(0.08, options?.searchSec ?? 0.048))
  const boost = options?.boost ?? 0.28
  const out = samples.map((s) => ({ ...s }))
  const hasTime = typeof out[0]?.timeSec === 'number'
  const searchBins = Math.max(1, Math.round((searchSec / durationSec) * n))
  const boostRadius = Math.max(1, Math.round(n * 0.0012))

  const indexNearTime = (t: number): number => {
    if (!hasTime) return onsetBinIndex(t, n, durationSec)
    // Monotonic tape — binary search closest timeSec.
    let lo = 0
    let hi = n - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if ((out[mid]!.timeSec ?? 0) < t) lo = mid + 1
      else hi = mid
    }
    const i = lo
    if (i > 0) {
      const a = Math.abs((out[i - 1]!.timeSec ?? 0) - t)
      const b = Math.abs((out[i]!.timeSec ?? 0) - t)
      if (a <= b) return i - 1
    }
    return i
  }

  for (const t of onsetsSec) {
    if (!Number.isFinite(t) || t < 0 || t > durationSec) continue
    const target = indexNearTime(t)
    let maxI = target
    let maxA = peakAmp(out[target]!)
    const iLo = Math.max(0, target - searchBins)
    const iHi = Math.min(n - 1, target + searchBins)
    for (let i = iLo; i <= iHi; i++) {
      const a = peakAmp(out[i]!)
      if (a > maxA) {
        maxA = a
        maxI = i
      }
    }

    if (maxI !== target && maxA > 0.04) {
      const crest = out[maxI]!
      const dest = out[target]!
      out[target] = {
        ...dest,
        positive: Math.max(dest.positive, crest.positive),
        negative: Math.max(dest.negative, crest.negative),
        rms: Math.max(dest.rms ?? 0, crest.rms ?? 0) || dest.rms,
        flux: Math.max(dest.flux ?? 0, crest.flux ?? 0, 0.55) || dest.flux,
        bands: crest.bands
          ? {
              low: Math.max(dest.bands?.low ?? 0, crest.bands.low),
              mid: Math.max(dest.bands?.mid ?? 0, crest.bands.mid),
              high: Math.max(dest.bands?.high ?? 0, crest.bands.high),
            }
          : dest.bands,
      }
      // Soften the old crest so the silhouette doesn't double-hit.
      out[maxI] = {
        ...crest,
        positive: crest.positive * 0.52,
        negative: crest.negative * 0.52,
        rms: crest.rms != null ? crest.rms * 0.55 : crest.rms,
        flux: crest.flux != null ? crest.flux * 0.45 : crest.flux,
      }
    }

    for (let d = -boostRadius; d <= boostRadius; d++) {
      const i = target + d
      if (i < 0 || i >= n) continue
      const w = 1 - Math.abs(d) / (boostRadius + 1)
      const cur = out[i]!
      const p = Math.min(1, cur.positive + (1 - cur.positive) * boost * w)
      const neg = Math.min(1, cur.negative + (1 - cur.negative) * boost * w * 0.85)
      out[i] = {
        ...cur,
        positive: p,
        negative: neg,
        flux: Math.max(cur.flux ?? 0, 0.4 * w) || cur.flux,
      }
    }
  }
  return out
}

/**
 * Boost peak samples nearest to onset times so waveform paint lines up with
 * the beat grid / transient pocket (visual lock — does not change MixEngine math).
 * Prefer `remeshPeaksOntoOnsets` when full sample objects are available.
 */
export function emphasizePeaksNearOnsets(
  peaks: number[],
  onsetsSec: number[],
  durationSec: number,
  boost = 0.35,
): number[] {
  if (!peaks.length || !onsetsSec.length || !(durationSec > 0)) return peaks
  const asSamples = peaks.map((positive) => ({ positive, negative: positive * 0.85 }))
  const remeshed = remeshPeaksOntoOnsets(asSamples, onsetsSec, durationSec, { boost })
  return remeshed.map((s) => s.positive)
}

/** Stored kick onsets on DNA (empty when only peak-derived). */
export function storedKickOnsetCount(sonicDna: unknown, durationSec = Number.POSITIVE_INFINITY): number {
  const measured = extractMeasured(sonicDna)
  return sanitizeOnsets(measured?.kickOnsetSec, durationSec).length
}

/** True when Auto DJ should rebuild kick onsets from peaks / steps. */
export function needsKickRemeasure(
  sonicDna: unknown,
  durationSec = Number.POSITIVE_INFINITY,
): boolean {
  return storedKickOnsetCount(sonicDna, durationSec) < 4
}

export function isGridLocked(sonicDna: unknown): boolean {
  if (!sonicDna || typeof sonicDna !== 'object') return false
  const root = sonicDna as Record<string, unknown>
  if (root.gridLocked === true) return true
  const measured = extractMeasured(sonicDna)
  return Boolean(measured && (measured as { gridLocked?: boolean }).gridLocked)
}

/** True when the user nudged / set the grid and it must not be auto-realigned. */
export function isGridManual(sonicDna: unknown): boolean {
  if (!sonicDna || typeof sonicDna !== 'object') return false
  const root = sonicDna as Record<string, unknown>
  if (root.gridManual === true) return true
  const measured = extractMeasured(sonicDna)
  return Boolean(measured && (measured as { gridManual?: boolean }).gridManual)
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
  /** User-set phase — persist and do not let tape auto-align overwrite. */
  gridManual?: boolean
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
  if (typeof extras?.gridManual === 'boolean') {
    measuredRaw.gridManual = extras.gridManual
    base.gridManual = extras.gridManual
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
    gridManual: extras.gridManual,
  })
}
