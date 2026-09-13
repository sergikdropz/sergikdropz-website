export type BeatCountCandidate = {
  bpm: number
  hits: number
  expected: number
  lock: number
}

export type BeatCountResult = {
  bpm: number | null
  onsetCount: number
  /** Analysis span in seconds (full track when scanning entire file). */
  windowSec: number
  dropSec: number
  /** Decoded / analyzed duration in seconds. */
  durationSec: number
  /** How the BPM was derived. */
  scanMode: 'full-track' | 'drop-window'
  candidates: BeatCountCandidate[]
  chosen: BeatCountCandidate | null
}

export type TapTempoState = {
  taps: number[]
  /** High-precision BPM for the active 16-beat section (0.1 resolution). */
  bpm: number | null
  /** Mean BPM across completed 16-beat sections (+ current when available). */
  averageBpm: number | null
  /** Beat index inside the current 16-beat section (1…16). */
  sectionBeat: number
  /** How many full 16-beat sections have been completed. */
  sectionsCompleted: number
  /** Locked BPM from each finished 16-beat section. */
  sectionBpms: number[]
  /** Interval jitter (sample stdev) in milliseconds — lower is more precise. */
  jitterMs: number | null
  /** 0–1 stability score from interval consistency + section depth. */
  confidence: number
}

export type BpmAccuracyScore = {
  bpm: number
  hits: number
  expected: number
  scanLock: number
  /** 0–1 agreement with admin tap tempo (null if no taps). */
  tapAgree: number | null
  /** 0–1 agreement with Sonic DNA measured BPM (null if missing). */
  measuredAgree: number | null
  /** Combined suggestion accuracy 0–1 (scan + tap + measured). */
  accuracy: number
  deltaTap: number | null
  deltaMeasured: number | null
}

/** Idle gap before the tap train resets (admin accuracy checks need a longer window). */
export const TAP_TEMPO_RESET_MS = 4500
/** Beats per tap-tempo accuracy section. */
export const TAP_TEMPO_SECTION_BEATS = 16
/** Need this many valid intervals inside a section before reporting BPM. */
export const TAP_TEMPO_MIN_INTERVALS = 2
/** @deprecated Prefer TAP_TEMPO_SECTION_BEATS; kept for older callers. */
export const TAP_TEMPO_MAX_TAPS = TAP_TEMPO_SECTION_BEATS
/** Sliding segment length when voting BPM across a full track. */
export const BEAT_COUNT_SEGMENT_SEC = 48
/** Hop between full-track segments. */
export const BEAT_COUNT_SEGMENT_HOP_SEC = 24
/** Legacy single-window length (kept for tests / drop-window mode). */
export const BEAT_COUNT_WINDOW_SEC = 60
/** @deprecated Full-track scan no longer caps decode; kept for callers. */
export const BEAT_COUNT_DECODE_SEC = Number.POSITIVE_INFINITY

/** Detectors often land an octave off (half/double). Keep dance-range picks. */
export function bpmOctaveOptions(...values: Array<number | null | undefined>): number[] {
  const out = new Set<number>()
  for (const raw of values) {
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) continue
    for (const n of [raw, raw * 2, raw / 2]) {
      const rounded = Math.round(n)
      if (rounded >= 50 && rounded <= 220) out.add(rounded)
    }
  }
  return Array.from(out).sort((a, b) => a - b)
}

export function countBeatHits(
  onsets: number[],
  bpm: number,
  start: number,
  end: number,
  phaseSec = 0,
): { hits: number; expected: number } {
  if (bpm <= 0 || end <= start) return { hits: 0, expected: 0 }
  const period = 60 / bpm
  const tol = Math.min(0.08, period * 0.18)
  let expected = 0
  let hits = 0
  let t = start + phaseSec
  while (t > start + 1e-9) t -= period
  while (t < start - 1e-9) t += period
  for (; t <= end + 1e-6; t += period) {
    expected++
    if (onsets.some((onset) => Math.abs(onset - t) <= tol)) hits++
  }
  return { hits, expected }
}

export function bestBeatPhase(onsets: number[], bpm: number, start: number, end: number): number {
  const period = 60 / bpm
  const steps = 16
  let bestPhase = 0
  let bestHits = -1
  for (let i = 0; i < steps; i++) {
    const phase = (period * i) / steps
    const { hits } = countBeatHits(onsets, bpm, start, end, phase)
    if (hits > bestHits) {
      bestHits = hits
      bestPhase = phase
    }
  }
  return bestPhase
}

export function pickBpmByBeatCount(
  onsets: number[],
  seedBpms: Array<number | null | undefined>,
  start: number,
  end: number,
): BeatCountCandidate[] {
  const unique = bpmOctaveOptions(...seedBpms)
  return unique
    .map((bpm) => {
      const phase = bestBeatPhase(onsets, bpm, start, end)
      const { hits, expected } = countBeatHits(onsets, bpm, start, end, phase)
      return {
        bpm,
        hits,
        expected,
        lock: expected > 0 ? hits / expected : 0,
      }
    })
    .sort((a, b) => b.lock - a.lock || b.hits - a.hits || a.bpm - b.bpm)
}

/**
 * Merge segment BPM votes into a ranked candidate list (full-track consensus).
 * Weight = lock × hits so strong segments beat sparse intros/outros.
 */
export function consolidateSegmentBpmVotes(
  segmentWinners: BeatCountCandidate[],
  fullTrackRanked: BeatCountCandidate[],
): BeatCountCandidate[] {
  const scores = new Map<number, { hits: number; expected: number; weight: number; votes: number }>()
  const bump = (candidate: BeatCountCandidate, voteWeight = 1) => {
    const prev = scores.get(candidate.bpm) || { hits: 0, expected: 0, weight: 0, votes: 0 }
    const weight = Math.max(0.05, candidate.lock) * Math.max(1, candidate.hits) * voteWeight
    scores.set(candidate.bpm, {
      hits: prev.hits + candidate.hits,
      expected: prev.expected + candidate.expected,
      weight: prev.weight + weight,
      votes: prev.votes + 1,
    })
  }
  for (const winner of segmentWinners) bump(winner, 1)
  // Full-track ranking gets a stronger vote so global grid fit wins ties
  for (const [index, candidate] of fullTrackRanked.slice(0, 6).entries()) {
    bump(candidate, index === 0 ? 2.5 : 1.2)
  }
  return Array.from(scores.entries())
    .map(([bpm, stats]) => ({
      bpm,
      hits: stats.hits,
      expected: stats.expected,
      lock: stats.expected > 0 ? stats.hits / stats.expected : Math.min(1, stats.weight / (stats.votes * 20)),
    }))
    .sort((a, b) => {
      const aw = scores.get(a.bpm)?.weight || 0
      const bw = scores.get(b.bpm)?.weight || 0
      return bw - aw || b.lock - a.lock || b.hits - a.hits || a.bpm - b.bpm
    })
}

function emptyTapTempo(taps: number[] = [], sectionBpms: number[] = []): TapTempoState {
  return {
    taps,
    bpm: null,
    averageBpm: sectionBpms.length ? roundBpm(mean(sectionBpms)) : null,
    sectionBeat: taps.length,
    sectionsCompleted: sectionBpms.length,
    sectionBpms,
    jitterMs: null,
    confidence: sectionBpms.length ? Math.min(0.95, 0.45 + sectionBpms.length * 0.12) : 0,
  }
}

function roundBpm(value: number): number {
  return Math.round(value * 10) / 10
}

function mean(values: number[]): number {
  if (!values.length) return 0
  return values.reduce((sum, n) => sum + n, 0) / values.length
}

function estimateBpmFromIntervals(intervalsMs: number[]): {
  bpm: number | null
  jitterMs: number | null
  confidence: number
} {
  if (intervalsMs.length < TAP_TEMPO_MIN_INTERVALS) {
    return {
      bpm: null,
      jitterMs: null,
      confidence: Math.min(0.35, intervalsMs.length / (TAP_TEMPO_MIN_INTERVALS * 2)),
    }
  }

  const med = median(intervalsMs)
  // Drop taps more than ±10% from the median period (missed beats / doubles)
  const filtered = intervalsMs.filter((dt) => Math.abs(dt - med) / med <= 0.1)
  const use = filtered.length >= TAP_TEMPO_MIN_INTERVALS ? filtered : intervalsMs
  const periodMed = median(use)
  const periodMean = mean(use)
  // Heavy median weight keeps human jitter from skewing the estimate
  const periodMs = use.length >= 8 ? periodMed * 0.75 + periodMean * 0.25 : periodMed

  const variance = use.reduce((sum, dt) => sum + (dt - periodMs) ** 2, 0) / use.length
  const jitterMs = Math.sqrt(variance)
  const relJitter = periodMs > 0 ? jitterMs / periodMs : 1
  // Fill the 16-beat section + tight intervals → higher confidence
  const stability = Math.max(0, Math.min(1, 1 - relJitter / 0.06))
  const depth = Math.min(1, use.length / (TAP_TEMPO_SECTION_BEATS - 1))
  const confidence = Math.round(stability * depth * 100) / 100

  const bpmRaw = 60000 / periodMs
  const bpm = roundBpm(bpmRaw)
  if (bpm < 40 || bpm > 240) {
    return { bpm: null, jitterMs: Math.round(jitterMs * 10) / 10, confidence }
  }
  return { bpm, jitterMs: Math.round(jitterMs * 10) / 10, confidence }
}

/**
 * Admin tap tempo in fixed 16-beat sections.
 * Recalculates section BPM on every tap; completed sections feed the running average.
 * Pass `performance.now()` (not Date.now) for sub-ms interval timing.
 *
 * Optional `prev` carries completed section BPMs across section boundaries.
 */
export function recordTapTempo(
  prevTaps: number[],
  now = typeof performance !== 'undefined' ? performance.now() : Date.now(),
  prev?: Pick<TapTempoState, 'sectionBpms' | 'sectionsCompleted'> | null,
): TapTempoState {
  const sectionBpms = Array.isArray(prev?.sectionBpms) ? [...prev.sectionBpms] : []
  if (!Number.isFinite(now)) {
    return emptyTapTempo(prevTaps.slice(-TAP_TEMPO_SECTION_BEATS), sectionBpms)
  }

  // Start a fresh 16-beat section after the previous one filled
  const baseTaps =
    prevTaps.length >= TAP_TEMPO_SECTION_BEATS ? [] : prevTaps.slice(0, TAP_TEMPO_SECTION_BEATS - 1)
  const taps = [...baseTaps, now]
  const sectionBeat = taps.length

  // 40–240 BPM → 250–1500 ms; allow slight slack for human early/late
  const intervalsMs: number[] = []
  for (let i = 1; i < taps.length; i++) {
    const dt = taps[i] - taps[i - 1]
    if (dt >= 200 && dt <= 1600) intervalsMs.push(dt)
  }

  const estimated = estimateBpmFromIntervals(intervalsMs)
  let nextSectionBpms = sectionBpms
  let nextTaps = taps

  // Lock this section when the 16th beat lands, then ready the next section
  if (sectionBeat >= TAP_TEMPO_SECTION_BEATS && estimated.bpm != null) {
    nextSectionBpms = [...sectionBpms, estimated.bpm]
    nextTaps = [now]
  }

  const bpmPool = [
    ...nextSectionBpms,
    ...(estimated.bpm != null && nextTaps.length > 1 ? [estimated.bpm] : []),
  ]
  const averageBpm = bpmPool.length ? roundBpm(mean(bpmPool)) : null
  const sectionBoost = Math.min(0.35, nextSectionBpms.length * 0.12)
  const confidence = Math.min(0.99, Math.round((estimated.confidence + sectionBoost) * 100) / 100)

  return {
    taps: nextTaps,
    bpm: estimated.bpm,
    averageBpm,
    sectionBeat: nextTaps.length === 1 && nextSectionBpms.length > sectionBpms.length ? 1 : sectionBeat > TAP_TEMPO_SECTION_BEATS ? 1 : sectionBeat,
    sectionsCompleted: nextSectionBpms.length,
    sectionBpms: nextSectionBpms,
    jitterMs: estimated.jitterMs,
    confidence,
  }
}

/** Compact button copy: beat progress until a 16-beat section locks, then the measured BPM. */
export function formatTapTempoButtonLabel(state: {
  taps: number[]
  bpm: number | null
  sectionsCompleted?: number
}): string {
  const taps = state.taps.length
  const locked = (state.sectionsCompleted ?? 0) > 0
  if (locked && taps <= 1 && state.bpm != null) {
    return Number.isInteger(state.bpm) ? String(state.bpm) : state.bpm.toFixed(1)
  }
  if (taps === 0) return 'Tap'
  if (taps === 1 && !locked) return 'Again'
  return `${taps}/${TAP_TEMPO_SECTION_BEATS}`
}

/** Signed delta between tap BPM and a stored/catalog BPM (null if either missing). */
export function tapTempoDelta(tapBpm: number | null, catalogBpm: number | null | undefined): number | null {
  if (tapBpm == null || catalogBpm == null || !Number.isFinite(catalogBpm) || catalogBpm <= 0) return null
  return Math.round((tapBpm - catalogBpm) * 10) / 10
}

/** 0–1 closeness of two BPMs. Optionally treat half/double as agreement. */
export function bpmAgreement(
  a: number | null | undefined,
  b: number | null | undefined,
  tolBpm = 4,
  options: { allowOctaves?: boolean } = {},
): number | null {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) {
    return null
  }
  const allowOctaves = options.allowOctaves !== false
  let best = Math.abs(a - b)
  if (allowOctaves) {
    for (const opt of bpmOctaveOptions(a)) {
      best = Math.min(best, Math.abs(opt - b))
    }
  }
  // tol+1 so a delta equal to tol still scores slightly above zero
  return Math.round(Math.max(0, Math.min(1, 1 - best / (tolBpm + 1))) * 100) / 100
}

/**
 * Rank full-track BPM suggestions by scan lock + agreement with tap / measured DNA.
 * Tap agreement is strict (no octave) so half-time suggestions don't fake a tap match.
 */
export function scoreBpmSuggestionAccuracy(
  candidates: BeatCountCandidate[],
  refs: { tapBpm?: number | null; measuredBpm?: number | null } = {},
): BpmAccuracyScore[] {
  const tap = refs.tapBpm
  const measured = refs.measuredBpm
  return candidates
    .map((candidate) => {
      const tapAgree = bpmAgreement(candidate.bpm, tap, 3, { allowOctaves: false })
      const measuredAgree = bpmAgreement(candidate.bpm, measured, 4, { allowOctaves: true })
      const weights: Array<{ value: number; weight: number }> = [
        { value: Math.max(0, Math.min(1, candidate.lock)), weight: 0.45 },
      ]
      if (tapAgree != null) weights.push({ value: tapAgree, weight: 0.35 })
      if (measuredAgree != null) weights.push({ value: measuredAgree, weight: 0.2 })
      const weightSum = weights.reduce((sum, row) => sum + row.weight, 0)
      const accuracy =
        Math.round(
          (weights.reduce((sum, row) => sum + row.value * row.weight, 0) / Math.max(0.01, weightSum)) * 100,
        ) / 100
      return {
        bpm: candidate.bpm,
        hits: candidate.hits,
        expected: candidate.expected,
        scanLock: Math.round(candidate.lock * 100) / 100,
        tapAgree,
        measuredAgree,
        accuracy,
        deltaTap: tapTempoDelta(typeof tap === 'number' ? tap : null, candidate.bpm),
        deltaMeasured: tapTempoDelta(typeof measured === 'number' ? measured : null, candidate.bpm),
      }
    })
    .sort((a, b) => b.accuracy - a.accuracy || b.scanLock - a.scanLock || a.bpm - b.bpm)
}

export function formatBpmAccuracyNote(score: BpmAccuracyScore | null | undefined): string {
  if (!score) return ''
  const parts = [`${Math.round(score.accuracy * 100)}% accuracy`]
  if (score.tapAgree != null) {
    const delta =
      score.deltaTap == null ? '' : ` Δ${score.deltaTap > 0 ? '+' : ''}${score.deltaTap.toFixed(1)}`
    parts.push(`tap ${Math.round(score.tapAgree * 100)}%${delta}`)
  } else {
    parts.push('no tap yet')
  }
  if (score.measuredAgree != null) {
    const delta =
      score.deltaMeasured == null
        ? ''
        : ` Δ${score.deltaMeasured > 0 ? '+' : ''}${score.deltaMeasured.toFixed(1)}`
    parts.push(`measured ${Math.round(score.measuredAgree * 100)}%${delta}`)
  } else {
    parts.push('no measured BPM')
  }
  parts.push(`scan ${score.hits}/${score.expected}`)
  return parts.join(' · ')
}

function median(values: number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function rmsEnvelope(data: number[], sampleRate: number, hopSec = 0.05): number[] {
  const hop = Math.max(1, Math.floor(sampleRate * hopSec))
  const windowSize = Math.max(hop, Math.floor(sampleRate * 0.2))
  const rms: number[] = []
  for (let i = 0; i + windowSize < data.length; i += hop) {
    let sumSquares = 0
    for (let j = i; j < i + windowSize; j++) sumSquares += data[j] * data[j]
    rms.push(Math.sqrt(sumSquares / windowSize))
  }
  return rms
}

/** First sustained energy jump after a quieter intro (kick/drop), or 0 if the groove starts immediately. */
export function detectFirstDropSec(data: number[], sampleRate: number, hopSec = 0.05): number {
  const rms = rmsEnvelope(data, sampleRate, hopSec)
  if (rms.length < 8) return 0
  const introCount = Math.max(4, Math.floor(8 / hopSec))
  const baseline = median(rms.slice(0, Math.min(introCount, rms.length)))
  const peak = rms.reduce((max, value) => (value > max ? value : max), 0)
  const threshold = Math.max(baseline * 2.2, peak * 0.45, 0.06)
  const sustain = Math.max(2, Math.round(1.6 / hopSec))
  const minIndex = Math.floor(3 / hopSec)
  for (let i = minIndex; i < rms.length - sustain; i++) {
    if (rms[i] < threshold) continue
    let held = true
    for (let j = 0; j < sustain; j++) {
      if (rms[i + j] < threshold * 0.72) {
        held = false
        break
      }
    }
    if (held) return Math.round(i * hopSec * 10) / 10
  }
  return 0
}

export function formatClock(sec: number): string {
  const safe = Math.max(0, sec)
  const minutes = Math.floor(safe / 60)
  const seconds = Math.floor(safe % 60)
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function downsample(channel: Float32Array, sampleRate: number, targetRate = 11025): { data: number[]; rate: number } {
  const factor = Math.max(1, Math.floor(sampleRate / targetRate))
  const data: number[] = []
  for (let i = 0; i < channel.length; i += factor) data.push(channel[i])
  return { data, rate: sampleRate / factor }
}

function detectOnsets(data: number[], sampleRate: number): number[] {
  const onsets: number[] = []
  const windowSize = Math.floor(sampleRate * 0.08)
  const hopSize = Math.max(1, Math.floor(windowSize / 4))
  const history: number[] = []
  let previousEnergy = 0

  for (let i = windowSize; i < data.length - windowSize; i += hopSize) {
    let sumSquares = 0
    for (let j = i; j < i + windowSize && j < data.length; j++) {
      const sample = data[j]
      sumSquares += sample * sample
    }
    const rms = Math.sqrt(sumSquares / windowSize)
    history.push(rms)
    if (history.length > 5) history.shift()
    const avg = history.reduce((a, b) => a + b, 0) / history.length
    const energyIncrease = previousEnergy > 0 ? (rms - previousEnergy) / previousEnergy : 0
    if (rms > 0.08 && energyIncrease > 0.12 && rms > avg * 1.12) {
      onsets.push(i / sampleRate)
    }
    previousEnergy = rms
  }
  return onsets
}

function seedBpmFromOnsets(onsets: number[]): number | null {
  const intervals: number[] = []
  for (let i = 1; i < onsets.length; i++) {
    const interval = onsets[i] - onsets[i - 1]
    if (interval >= 0.15 && interval <= 2.0) intervals.push(interval)
  }
  if (intervals.length < 4) return null
  let bestPeriod = 0.5
  let bestScore = 0
  for (let period = 60 / 180; period <= 60 / 60; period += 0.01) {
    let score = 0
    for (const interval of intervals) {
      const nearest = Math.round(interval / period) * period
      if (nearest <= 0) continue
      const diff = Math.abs(interval - nearest) / period
      if (diff < 0.18) score += 1 - diff
    }
    if (score > bestScore) {
      bestScore = score
      bestPeriod = period
    }
  }
  const bpm = Math.round(60 / bestPeriod)
  return bpm >= 50 && bpm <= 200 ? bpm : null
}

/** Build sliding analysis windows across the full duration. */
export function buildFullTrackSegments(
  durationSec: number,
  segmentSec = BEAT_COUNT_SEGMENT_SEC,
  hopSec = BEAT_COUNT_SEGMENT_HOP_SEC,
): Array<{ start: number; end: number }> {
  if (durationSec <= 0) return []
  if (durationSec <= segmentSec + 4) {
    return [{ start: 0, end: durationSec }]
  }
  const segments: Array<{ start: number; end: number }> = []
  for (let start = 0; start < durationSec - 12; start += hopSec) {
    const end = Math.min(durationSec, start + segmentSec)
    if (end - start >= 12) segments.push({ start, end })
    if (end >= durationSec - 0.5) break
  }
  const last = segments[segments.length - 1]
  if (!last || last.end < durationSec - 1) {
    segments.push({ start: Math.max(0, durationSec - segmentSec), end: durationSec })
  }
  return segments
}

export async function analyzeBeatCountFromUrl(
  audioUrl: string,
  extraSeeds: Array<number | null | undefined> = [],
  options?: { fullTrack?: boolean },
): Promise<BeatCountResult> {
  const fullTrack = options?.fullTrack !== false
  const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
  try {
    const response = await fetch(audioUrl)
    if (!response.ok) throw new Error(`Failed to fetch audio: ${response.status}`)
    const arrayBuffer = await response.arrayBuffer()
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
    const sampleRate = audioBuffer.sampleRate
    // Full-track scan uses the entire decoded buffer (downsampled) for a proper BPM reading.
    const channel = audioBuffer.getChannelData(0)
    const { data, rate } = downsample(channel, sampleRate)
    const durationSec = data.length / rate
    const dropSec = detectFirstDropSec(data, rate)
    const allOnsets = detectOnsets(data, rate)

    if (!fullTrack) {
      const start = Math.min(dropSec, Math.max(0, durationSec - 8))
      const end = Math.min(durationSec, start + BEAT_COUNT_WINDOW_SEC)
      const onsets = allOnsets.filter((onset) => onset >= start && onset <= end)
      const seed = seedBpmFromOnsets(onsets)
      const ranked = pickBpmByBeatCount(onsets, [seed, ...extraSeeds], start, end)
      const chosen = ranked[0] || null
      return {
        bpm: chosen?.bpm ?? seed,
        onsetCount: onsets.length,
        windowSec: Math.round((end - start) * 10) / 10,
        dropSec,
        durationSec: Math.round(durationSec * 10) / 10,
        scanMode: 'drop-window',
        candidates: ranked,
        chosen,
      }
    }

    const segments = buildFullTrackSegments(durationSec)
    const segmentWinners: BeatCountCandidate[] = []
    const segmentSeeds: number[] = []
    for (const segment of segments) {
      const onsets = allOnsets.filter((onset) => onset >= segment.start && onset <= segment.end)
      if (onsets.length < 6) continue
      const seed = seedBpmFromOnsets(onsets)
      if (seed) segmentSeeds.push(seed)
      const ranked = pickBpmByBeatCount(onsets, [seed, ...extraSeeds], segment.start, segment.end)
      if (ranked[0] && ranked[0].expected >= 4) segmentWinners.push(ranked[0])
    }

    const globalSeed = seedBpmFromOnsets(allOnsets)
    const fullRanked = pickBpmByBeatCount(
      allOnsets,
      [globalSeed, ...segmentSeeds, ...extraSeeds],
      0,
      durationSec,
    )
    const ranked = consolidateSegmentBpmVotes(segmentWinners, fullRanked)
    const chosen = ranked[0] || fullRanked[0] || null

    return {
      bpm: chosen?.bpm ?? globalSeed,
      onsetCount: allOnsets.length,
      windowSec: Math.round(durationSec * 10) / 10,
      dropSec,
      durationSec: Math.round(durationSec * 10) / 10,
      scanMode: 'full-track',
      candidates: ranked.length ? ranked : fullRanked,
      chosen,
    }
  } finally {
    await audioContext.close().catch(() => {})
  }
}
