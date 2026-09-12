/**
 * Professional waveform DSP envelopes — how DAWs / CDJs / MiniMeters turn PCM
 * into a readable tape:
 *
 * 1. Per-bucket Peak (transients) + RMS (body) — never bake them into one number
 * 2. 1-pole filterbank Low (~<250 Hz) / Mid (~250–2500) / High (~>2500) energies
 *    (same crossover idea as MiniMeters Multi-Band / Pioneer overview color)
 * 3. Spectral flux (frame-to-frame high-band change) for attack accents
 * 4. Mid channel when stereo: (L+R)/2
 * 5. Single perceptual dB display scale (MiniMeters Scaled via fasterlog2)
 *
 * Legacy mono peak arrays are lifted into this shape via crest/flux proxies until
 * tracks are re-analyzed with the rich extractor.
 */

import {
  applyLocalAmplitudeContrast,
  expandPeakValley,
  multiBandRgbColor,
  type WaveformBands,
  type WaveformSample,
} from '@/lib/audio/waveform-view'
import { scopeAmplitude } from '@/lib/audio/waveform-scope-scale'

/** Default overview densify — CDJ-readable hats need ~4k buckets on long tracks. */
export const DEFAULT_WAVEFORM_BUCKETS = 4096
export const MAX_WAVEFORM_BUCKETS = 8192

export type DspEnvelopeBucket = {
  /** Max |sample| in bucket (linear 0..1-ish) */
  peak: number
  /** RMS in bucket */
  rms: number
  /** Filterbank band energies (linear, relative) */
  low: number
  mid: number
  high: number
  /** Spectral flux / attack strength in [0,1] after normalize */
  flux: number
}

export type RichPeakData = {
  /** Legacy mono blend for DB / older clients: 0.7*rms + 0.3*peak */
  data: number[]
  envelopes: DspEnvelopeBucket[]
  length: number
  sampleRate: number
}

/** Compact storage row: [peak, rms, low, mid, high] or +flux. */
export type CompactEnvelopeRow = number[]

/** One-pole lowpass coefficient for cutoffHz at sampleRate. */
export function onePoleCoeff(cutoffHz: number, sampleRate: number): number {
  const x = Math.exp((-2 * Math.PI * cutoffHz) / Math.max(1, sampleRate))
  return 1 - x
}

/**
 * Extract Peak + RMS + Low/Mid/High + flux envelopes from PCM (DAW/DJ overview DSP).
 * Uses cascaded 1-pole filters (cheap, stable, MiniMeters-like band split).
 */
export function extractDspEnvelopesFromPcm(params: {
  left: Float32Array | ArrayLike<number>
  right?: Float32Array | ArrayLike<number> | null
  sampleRate: number
  buckets?: number
}): DspEnvelopeBucket[] {
  const buckets = Math.max(
    64,
    Math.min(MAX_WAVEFORM_BUCKETS, params.buckets ?? DEFAULT_WAVEFORM_BUCKETS),
  )
  const left = params.left
  const right = params.right
  const n = left.length
  if (n < 32) return []

  const block = Math.max(1, Math.floor(n / buckets))
  const aLow = onePoleCoeff(250, params.sampleRate)
  const aMid = onePoleCoeff(2500, params.sampleRate)

  let lpLow = 0
  let lpMid = 0
  let prevHigh = 0
  const out: DspEnvelopeBucket[] = new Array(buckets)

  for (let b = 0; b < buckets; b++) {
    const start = b * block
    const end = b === buckets - 1 ? n : Math.min(n, start + block)
    let sumSq = 0
    let peak = 0
    let sumLow = 0
    let sumMid = 0
    let sumHigh = 0
    let sumFlux = 0
    let count = 0

    for (let i = start; i < end; i++) {
      const l = left[i] || 0
      const r = right ? right[i] || 0 : l
      // MiniMeters / DJ "Mid" monitoring: mono sum
      const x = (l + r) * 0.5
      const ax = Math.abs(x)

      lpLow += aLow * (x - lpLow)
      lpMid += aMid * (x - lpMid)
      const low = lpLow
      const mid = lpMid - lpLow
      const high = x - lpMid
      const aHigh = Math.abs(high)

      peak = Math.max(peak, ax)
      sumSq += x * x
      sumLow += Math.abs(low)
      sumMid += Math.abs(mid)
      sumHigh += aHigh
      sumFlux += Math.abs(aHigh - prevHigh)
      prevHigh = aHigh
      count++
    }

    const c = Math.max(1, count)
    out[b] = {
      peak,
      rms: Math.sqrt(sumSq / c),
      low: sumLow / c,
      mid: sumMid / c,
      high: sumHigh / c,
      flux: sumFlux / c,
    }
  }

  return normalizeEnvelopeTrack(out)
}

/** Per-track normalize: peak/rms vs peak max; bands share one scale so L/M/H balance stays real. */
export function normalizeEnvelopeTrack(envelopes: DspEnvelopeBucket[]): DspEnvelopeBucket[] {
  if (!envelopes.length) return envelopes
  let maxPeak = 1e-8
  let maxBand = 1e-8
  let maxFlux = 1e-8
  for (const e of envelopes) {
    if (e.peak > maxPeak) maxPeak = e.peak
    if (e.rms > maxPeak) maxPeak = e.rms
    if (e.low > maxBand) maxBand = e.low
    if (e.mid > maxBand) maxBand = e.mid
    if (e.high > maxBand) maxBand = e.high
    const flux = typeof e.flux === 'number' ? e.flux : 0
    if (flux > maxFlux) maxFlux = flux
  }
  return envelopes.map((e) => ({
    peak: e.peak / maxPeak,
    rms: e.rms / maxPeak,
    low: e.low / maxBand,
    mid: e.mid / maxBand,
    high: e.high / maxBand,
    flux: (typeof e.flux === 'number' ? e.flux : 0) / maxFlux,
  }))
}

/**
 * Lift legacy mono peak arrays into DSP envelopes.
 * Stored values are typically 0.7*rms+0.3*peak — recover peak/rms + crest/flux bands.
 */
export function legacyPeaksToEnvelopes(peaks: number[]): DspEnvelopeBucket[] {
  if (!peaks.length) return []
  const max = Math.max(...peaks, 1e-8)
  const norm = peaks.map((p) => Math.max(0, p / max))

  // Smooth envelope ≈ sustained / low-mid body
  const smooth = new Array(norm.length)
  let acc = norm[0]
  for (let i = 0; i < norm.length; i++) {
    acc = acc * 0.85 + norm[i] * 0.15
    smooth[i] = acc
  }

  const out: DspEnvelopeBucket[] = []
  for (let i = 0; i < norm.length; i++) {
    const v = norm[i]
    // Invert blend toward peak/rms (approximate)
    const peak = Math.min(1, v * 1.15)
    const rms = Math.min(peak, v * 0.92)
    const prev = i > 0 ? norm[i - 1] : v
    const flux = Math.abs(v - prev)
    const crest = peak / Math.max(1e-4, rms)
    const body = smooth[i]

    // Crest + flux → highs/transients; smooth body → lows; residual → mids
    const high = Math.min(1, flux * 2.8 + Math.max(0, crest - 1.15) * 0.85)
    const low = Math.min(1, body * 1.1 * (1 - high * 0.35))
    const mid = Math.min(1, Math.max(0, v * 0.9 - low * 0.35 + high * 0.15))

    out.push({ peak, rms, low, mid, high, flux: Math.min(1, flux * 3.2) })
  }
  return normalizeEnvelopeTrack(out)
}

/** Display height 0..1 from linear peak — single Scaled path (no double expand). */
export function dspDisplayAmplitude(linear: number): number {
  const shaped = expandPeakValley(Math.max(0, Math.min(1, linear)), {
    power: 1.45,
    gain: 1.25,
    floor: 0.006,
  })
  return scopeAmplitude(shaped, 'scaled', { floorDb: -52, ceilingDb: 0 })
}

/**
 * Convert DSP envelopes → WaveformSample[] for the tape engine.
 * Peak drives silhouette; RMS stored for DAW body paint; bands drive MiniMeters color.
 */
export function envelopesToWaveformSamples(envelopes: DspEnvelopeBucket[]): WaveformSample[] {
  if (!envelopes.length) return []

  const samples: WaveformSample[] = envelopes.map((e) => {
    const bands: WaveformBands = {
      low: e.low,
      mid: e.mid,
      high: e.high,
    }
    const peak = Math.max(0, Math.min(1, e.peak))
    const rms = Math.max(0, Math.min(1, e.rms))
    const flux = Math.max(0, Math.min(1, typeof e.flux === 'number' ? e.flux : 0))
    // Slight asymmetry like stereo Mid scope (not flat mirror)
    const positive = peak
    const negative = Math.min(1, peak * 0.92 + rms * 0.05)
    return {
      positive,
      negative,
      rms,
      flux,
      bands,
      color: multiBandRgbColor(bands),
    }
  })

  // Local contrast for valleys without destroying band ratios
  return applyLocalAmplitudeContrast(samples)
}

/** Prefer rich envelopes; fall back to legacy number[]. */
export function peaksOrEnvelopesToWaveformSamples(
  peaks: number[] | null | undefined,
  envelopes?: DspEnvelopeBucket[] | null
): WaveformSample[] {
  if (envelopes && envelopes.length > 0) {
    return envelopesToWaveformSamples(envelopes)
  }
  if (peaks && peaks.length > 0) {
    return envelopesToWaveformSamples(legacyPeaksToEnvelopes(peaks))
  }
  return []
}

/** Legacy blend for DB storage compatibility. */
export function envelopesToLegacyPeaks(envelopes: DspEnvelopeBucket[]): number[] {
  return envelopes.map((e) => e.rms * 0.7 + e.peak * 0.3)
}

/** Pack envelopes for Storage / static tapes: [peak, rms, low, mid, high, flux?]. */
export function compactEnvelopeRows(envelopes: DspEnvelopeBucket[]): CompactEnvelopeRow[] {
  return envelopes.map((e) => [
    +e.peak.toFixed(5),
    +e.rms.toFixed(5),
    +e.low.toFixed(5),
    +e.mid.toFixed(5),
    +e.high.toFixed(5),
    +(typeof e.flux === 'number' ? e.flux : 0).toFixed(5),
  ])
}

/** Unpack compact or object envelope rows. */
export function expandCompactEnvelopes(rows: unknown): DspEnvelopeBucket[] | null {
  if (!Array.isArray(rows) || rows.length < 64) return null
  const out: DspEnvelopeBucket[] = []
  for (const row of rows) {
    if (Array.isArray(row) && row.length >= 5) {
      out.push({
        peak: Number(row[0]) || 0,
        rms: Number(row[1]) || 0,
        low: Number(row[2]) || 0,
        mid: Number(row[3]) || 0,
        high: Number(row[4]) || 0,
        flux: Number(row[5]) || 0,
      })
      continue
    }
    if (row && typeof row === 'object' && !Array.isArray(row)) {
      const r = row as Record<string, unknown>
      out.push({
        peak: Number(r.peak) || 0,
        rms: Number(r.rms) || 0,
        low: Number(r.low) || 0,
        mid: Number(r.mid) || 0,
        high: Number(r.high) || 0,
        flux: Number(r.flux) || 0,
      })
      continue
    }
    return null
  }
  return out.length >= 64 ? out : null
}

/**
 * Build Storage JSON payload — compact CDJ tape with peaks + envelopes.
 * Backward compatible: parsers that only read arrays still get `d`.
 */
export function buildWaveformStoragePayload(params: {
  peaks: number[]
  envelopes?: DspEnvelopeBucket[] | null
  sampleRate?: number
  path?: string
}): Record<string, unknown> | number[] {
  const peaks = params.peaks
  const envelopes = params.envelopes
  if (!envelopes?.length) return peaks
  return {
    v: 2,
    ...(params.path ? { p: params.path } : {}),
    ...(typeof params.sampleRate === 'number' ? { sr: params.sampleRate } : {}),
    d: peaks.map((n) => +Number(n).toFixed(5)),
    e: compactEnvelopeRows(envelopes),
  }
}

/**
 * Peak-hold densify — DAW/CDJ overview upsample must not soft-lerp away transients.
 * Between source points: hold max peak/rms/bands (zero-order + peak pick).
 */
export function densifyEnvelopesPeakHold(
  envelopes: DspEnvelopeBucket[],
  targetCount: number
): DspEnvelopeBucket[] {
  if (!envelopes.length) return []
  if (targetCount <= envelopes.length) return envelopes

  const out: DspEnvelopeBucket[] = new Array(targetCount)
  const last = envelopes.length - 1
  for (let i = 0; i < targetCount; i++) {
    const pos = (i / Math.max(1, targetCount - 1)) * last
    const i0 = Math.floor(pos)
    const i1 = Math.min(last, i0 + 1)
    const a = envelopes[i0]
    const b = envelopes[i1]
    out[i] = {
      peak: Math.max(a.peak, b.peak),
      rms: Math.max(a.rms, b.rms) * 0.85 + Math.min(a.rms, b.rms) * 0.15,
      low: Math.max(a.low, b.low),
      mid: Math.max(a.mid, b.mid),
      high: Math.max(a.high, b.high),
      flux: Math.max(a.flux ?? 0, b.flux ?? 0),
    }
  }
  return out
}

/** CDJ dual envelope: RMS body + Peak crest (never bake into one blend). */
export type DualEnvelopeAmps = {
  body: number
  peak: number
  flux: number
}

export function dualEnvelopeAmps(sample: {
  positive?: number
  negative?: number
  rms?: number
  flux?: number
}): DualEnvelopeAmps {
  const peak = Math.max(0, sample.positive ?? 0, sample.negative ?? 0)
  const body = Math.max(0, Math.min(peak, sample.rms ?? peak * 0.7))
  const flux = Math.max(0, Math.min(1, sample.flux ?? 0))
  return { body, peak, flux }
}

/**
 * Interpolate dual envelopes for column paint:
 * - body (RMS) lerps smoothly
 * - peak / flux use max so kicks/hats never smear away
 */
export function interpolateDualEnvelope(
  a: DualEnvelopeAmps,
  b: DualEnvelopeAmps,
  t: number,
): DualEnvelopeAmps {
  const u = Math.max(0, Math.min(1, t))
  const s = u * u * (3 - 2 * u)
  return {
    body: a.body + (b.body - a.body) * s,
    peak: Math.max(a.peak, b.peak),
    flux: Math.max(a.flux, b.flux),
  }
}
