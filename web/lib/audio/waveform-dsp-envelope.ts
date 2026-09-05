/**
 * Professional waveform DSP envelopes — how DAWs / CDJs / MiniMeters turn PCM
 * into a readable tape:
 *
 * 1. Per-bucket Peak (transients) + RMS (body) — never bake them into one number
 * 2. 1-pole filterbank Low (~<250 Hz) / Mid (~250–2500) / High (~>2500) energies
 *    (same crossover idea as MiniMeters Multi-Band / Pioneer overview color)
 * 3. Mid channel when stereo: (L+R)/2
 * 4. Single perceptual dB display scale (MiniMeters Scaled via fasterlog2)
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

export type DspEnvelopeBucket = {
  /** Max |sample| in bucket (linear 0..1-ish) */
  peak: number
  /** RMS in bucket */
  rms: number
  /** Filterbank band energies (linear, relative) */
  low: number
  mid: number
  high: number
}

export type RichPeakData = {
  /** Legacy mono blend for DB / older clients: 0.7*rms + 0.3*peak */
  data: number[]
  envelopes: DspEnvelopeBucket[]
  length: number
  sampleRate: number
}

/** One-pole lowpass coefficient for cutoffHz at sampleRate. */
export function onePoleCoeff(cutoffHz: number, sampleRate: number): number {
  const x = Math.exp((-2 * Math.PI * cutoffHz) / Math.max(1, sampleRate))
  return 1 - x
}

/**
 * Extract Peak + RMS + Low/Mid/High envelopes from PCM (DAW/DJ overview DSP).
 * Uses cascaded 1-pole filters (cheap, stable, MiniMeters-like band split).
 */
export function extractDspEnvelopesFromPcm(params: {
  left: Float32Array | ArrayLike<number>
  right?: Float32Array | ArrayLike<number> | null
  sampleRate: number
  buckets?: number
}): DspEnvelopeBucket[] {
  const buckets = Math.max(64, Math.min(8192, params.buckets ?? 2000))
  const left = params.left
  const right = params.right
  const n = left.length
  if (n < 32) return []

  const block = Math.max(1, Math.floor(n / buckets))
  const aLow = onePoleCoeff(250, params.sampleRate)
  const aMid = onePoleCoeff(2500, params.sampleRate)

  let lpLow = 0
  let lpMid = 0
  const out: DspEnvelopeBucket[] = new Array(buckets)

  for (let b = 0; b < buckets; b++) {
    const start = b * block
    const end = b === buckets - 1 ? n : Math.min(n, start + block)
    let sumSq = 0
    let peak = 0
    let sumLow = 0
    let sumMid = 0
    let sumHigh = 0
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

      peak = Math.max(peak, ax)
      sumSq += x * x
      sumLow += Math.abs(low)
      sumMid += Math.abs(mid)
      sumHigh += Math.abs(high)
      count++
    }

    const c = Math.max(1, count)
    out[b] = {
      peak,
      rms: Math.sqrt(sumSq / c),
      low: sumLow / c,
      mid: sumMid / c,
      high: sumHigh / c,
    }
  }

  return normalizeEnvelopeTrack(out)
}

/** Per-track normalize: peak/rms vs peak max; bands share one scale so L/M/H balance stays real. */
export function normalizeEnvelopeTrack(envelopes: DspEnvelopeBucket[]): DspEnvelopeBucket[] {
  if (!envelopes.length) return envelopes
  let maxPeak = 1e-8
  let maxBand = 1e-8
  for (const e of envelopes) {
    if (e.peak > maxPeak) maxPeak = e.peak
    if (e.rms > maxPeak) maxPeak = e.rms
    if (e.low > maxBand) maxBand = e.low
    if (e.mid > maxBand) maxBand = e.mid
    if (e.high > maxBand) maxBand = e.high
  }
  return envelopes.map((e) => ({
    peak: e.peak / maxPeak,
    rms: e.rms / maxPeak,
    low: e.low / maxBand,
    mid: e.mid / maxBand,
    high: e.high / maxBand,
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

    out.push({ peak, rms, low, mid, high })
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
    // Slight asymmetry like stereo Mid scope (not flat mirror)
    const positive = peak
    const negative = Math.min(1, peak * 0.92 + rms * 0.05)
    return {
      positive,
      negative,
      rms,
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
    }
  }
  return out
}
