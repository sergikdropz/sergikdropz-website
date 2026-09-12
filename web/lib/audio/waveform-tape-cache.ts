import {
  buildTimedSamplesInWindow,
  resolveWaveformColor,
  type TimedWaveformSample,
  type WaveformColorMode,
  type WaveformSample,
  type WaveformIntelligenceProfile,
} from '@/lib/audio/waveform-view'
import { profileCacheKey, remesureTimedSamples } from '@/lib/audio/waveform-intelligence'

export type WaveformTapeCache = {
  key: string
  durationSec: number
  timed: TimedWaveformSample[]
}

/** Build a once-per-track densified, DNA-remesured, color-resolved tape. */
export function buildWaveformTapeCache(params: {
  samples: WaveformSample[]
  durationSec: number
  colorMode: WaveformColorMode
  intelligenceProfile?: WaveformIntelligenceProfile | null
  /** Full-track densify target — enough for close zooms without per-frame upsample. */
  targetCount?: number
}): WaveformTapeCache | null {
  const { samples, durationSec, colorMode, intelligenceProfile } = params
  if (!samples.length || durationSec <= 0) return null

  const targetCount = Math.max(
    samples.length,
    params.targetCount ?? Math.min(8192, Math.max(4096, samples.length * 2))
  )

  const remesured = remesureTimedSamples(
    buildTimedSamplesInWindow({
      samples,
      durationSec,
      startIndex: 0,
      endIndex: samples.length,
      targetCount,
    }),
    intelligenceProfile
  )

  const timed = remesured.map((s) => ({
    ...s,
    color: resolveWaveformColor(s, colorMode, intelligenceProfile),
  }))

  return {
    key: `${samples.length}:${durationSec.toFixed(3)}:${colorMode}:${profileCacheKey(intelligenceProfile)}:${targetCount}`,
    durationSec,
    timed,
  }
}

/** Binary-search first index with timeSec >= t. */
export function tapeIndexAtOrAfter(timed: TimedWaveformSample[], t: number): number {
  let lo = 0
  let hi = timed.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (timed[mid].timeSec < t) lo = mid + 1
    else hi = mid
  }
  return lo
}

/**
 * Slice cached tape to [startSec, endSec].
 * When decimating, keep per-column peak max (MiniMeters-style accurate readings)
 * instead of picking a single midpoint sample (which drops transients).
 */
export function sliceTapeWindow(
  timed: TimedWaveformSample[],
  startSec: number,
  endSec: number,
  maxColumns: number
): TimedWaveformSample[] {
  if (!timed.length || endSec <= startSec) return []
  const i0 = Math.max(0, tapeIndexAtOrAfter(timed, startSec) - 1)
  let i1 = tapeIndexAtOrAfter(timed, endSec)
  if (i1 <= i0) i1 = Math.min(timed.length, i0 + 1)
  const slice = timed.slice(i0, i1)
  if (slice.length <= maxColumns) return slice

  const out: TimedWaveformSample[] = []
  for (let col = 0; col < maxColumns; col++) {
    const a = Math.floor((col / maxColumns) * slice.length)
    const b = Math.max(a + 1, Math.floor(((col + 1) / maxColumns) * slice.length))
    let maxPos = 0
    let maxNeg = 0
    let maxRms = 0
    let maxLow = 0
    let maxMid = 0
    let maxHigh = 0
    let maxFlux = 0
    let peak = slice[a]
    let tSum = 0
    for (let j = a; j < b; j++) {
      const s = slice[j]
      if (s.positive >= maxPos) {
        maxPos = s.positive
        peak = s
      }
      if (s.negative > maxNeg) maxNeg = s.negative
      if ((s.rms ?? 0) > maxRms) maxRms = s.rms ?? 0
      if ((s.flux ?? 0) > maxFlux) maxFlux = s.flux ?? 0
      if (s.bands) {
        if (s.bands.low > maxLow) maxLow = s.bands.low
        if (s.bands.mid > maxMid) maxMid = s.bands.mid
        if (s.bands.high > maxHigh) maxHigh = s.bands.high
      }
      tSum += s.timeSec
    }
    const mid = slice[Math.min(slice.length - 1, Math.floor((a + b - 1) / 2))]
    const bands =
      maxLow + maxMid + maxHigh > 0
        ? { low: maxLow, mid: maxMid, high: maxHigh }
        : peak.bands
    out.push({
      ...peak,
      positive: maxPos,
      negative: maxNeg,
      rms: maxRms > 0 ? maxRms : peak.rms,
      flux: maxFlux > 0 ? maxFlux : peak.flux,
      bands,
      timeSec: mid?.timeSec ?? tSum / Math.max(1, b - a),
    })
  }
  return out
}
