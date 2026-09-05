/**
 * Beat grid math shared by WaveformStage paint and MusicPlayer / DJ mixer.
 *
 * Dual-clock model:
 * - `offsetSec` is **within-beat phase** in [0, beatSec) (legacy absolute times
 *   should be folded via phase normalization).
 * - Phrase / section lines count from **file t=0**: n × 8 × barSec.
 * - Beats fall at `offsetSec + k * beatSec`.
 */

import { extractMeasured, type SonicDnaMeasured } from '@/lib/audio/sonic-dna-quality'

export type BeatPhraseClass = 'half' | 'beat' | 'bar' | 'phrase' | 'section'

export function beatPeriodSec(bpm: number): number | null {
  if (!Number.isFinite(bpm) || bpm <= 0) return null
  return 60 / bpm
}

/** Phase of `timeSec` within one beat, in [0, beatSec). */
export function beatPhaseSec(timeSec: number, beatSec: number): number {
  if (!(beatSec > 0) || !Number.isFinite(timeSec)) return 0
  return ((timeSec % beatSec) + beatSec) % beatSec
}

/**
 * Normalize a stored offset into phase-only downbeat near file start.
 * Legacy absolute kick times (≥ 1 beat) are folded into [0, beatSec).
 */
export function absoluteDownbeatSec(offsetSec: number, beatSec: number): number {
  if (!Number.isFinite(offsetSec) || offsetSec < 0) return 0
  if (!(beatSec > 0)) return offsetSec
  const p = ((offsetSec % beatSec) + beatSec) % beatSec
  return p < 1e-9 || beatSec - p < 1e-9 ? 0 : p
}

/** Integer beat index at time t relative to downbeat offset. */
export function beatIndexAt(timeSec: number, offsetSec: number, beatSec: number): number {
  if (!(beatSec > 0)) return 0
  return Math.round((timeSec - offsetSec) / beatSec)
}

export function classifyBeatIndex(
  beatIndex: number,
  beatsPerBar = 4
): Exclude<BeatPhraseClass, 'half'> {
  const bar = Math.max(1, Math.floor(beatsPerBar) || 4)
  const phraseBeats = bar * 8
  const sectionBeats = bar * 16
  const i = ((beatIndex % sectionBeats) + sectionBeats) % sectionBeats
  if (i % sectionBeats === 0) return 'section'
  if (i % phraseBeats === 0) return 'phrase'
  if (i % bar === 0) return 'bar'
  return 'beat'
}

/** Place a downbeat phase from a clicked time (Set Downbeat / Set Beat Here). */
export function setDownbeatAt(timeSec: number, beatSec?: number): number {
  if (!Number.isFinite(timeSec) || timeSec < 0) return 0
  if (beatSec && beatSec > 0) {
    const p = ((timeSec % beatSec) + beatSec) % beatSec
    return p < 1e-9 || beatSec - p < 1e-9 ? 0 : p
  }
  return Math.max(0, timeSec)
}

export type AlignBeatGridResult = {
  offsetSec: number
  bpm: number
  lock: number
}

/** Compact Sonic DNA priors used by beat-grid align (16-step/bar × 8-bar phrase). */
export type AlignBeatGridSonicHints = {
  bpm: number | null
  bpmConfidence: number | null
  effectiveBpm: number | null
  drumFamily: string | null
  kickSteps: number[]
  snareSteps: number[]
  /** Phrase-grid kicks (0..127) when DSP measured an 8-bar fold. */
  kickPhraseSteps: number[]
  snarePhraseSteps: number[]
  stepsPerBar: number
  phraseBars: number
  fourRatio: number | null
  swingPercent: number | null
  timingFeel: string | null
  kickSpectral: number | null
}

export const STEPS_PER_BAR = 16
export const BARS_PER_PHRASE = 8
export const STEPS_PER_PHRASE = STEPS_PER_BAR * BARS_PER_PHRASE

function peakAmplitude(
  peak: number | { positive?: number; negative?: number; rms?: number }
): number {
  if (typeof peak === 'number') return peak > 0 ? peak : 0
  return Math.max(peak.positive ?? 0, peak.negative ?? 0, peak.rms ?? 0)
}

function uniqSteps(steps: unknown, modulus = STEPS_PER_BAR): number[] {
  if (!Array.isArray(steps)) return []
  const out: number[] = []
  const seen = new Set<number>()
  for (const raw of steps) {
    const n = Math.round(Number(raw))
    if (!Number.isFinite(n)) continue
    const s = ((n % modulus) + modulus) % modulus
    if (seen.has(s)) continue
    seen.add(s)
    out.push(s)
  }
  return out.sort((a, b) => a - b)
}

function defaultStepsForFamily(family: string | null): { kick: number[]; snare: number[] } {
  const f = String(family || '').toLowerCase()
  if (f.includes('four')) return { kick: [0, 4, 8, 12], snare: [4, 12] }
  if (f.includes('half')) return { kick: [0], snare: [8] }
  if (f.includes('break')) return { kick: [0, 10], snare: [4, 12] }
  if (f.includes('one-drop') || f.includes('one drop')) return { kick: [0], snare: [8] }
  if (f.includes('dembow')) return { kick: [0, 6], snare: [4, 12] }
  if (f.includes('boom')) return { kick: [0], snare: [8] }
  if (f.includes('sparse')) return { kick: [0], snare: [8] }
  return { kick: [0, 4, 8, 12], snare: [4, 12] }
}

/** Pull align priors from a track's sonic_dna blob (measured layer). */
export function alignHintsFromSonicDna(sonicDna: unknown): AlignBeatGridSonicHints | null {
  const measured = extractMeasured(sonicDna)
  if (!measured) return null
  return alignHintsFromMeasured(measured)
}

export function alignHintsFromMeasured(measured: SonicDnaMeasured): AlignBeatGridSonicHints {
  const family = measured.drumFamily ? String(measured.drumFamily) : null
  const defaults = defaultStepsForFamily(family)
  let kickSteps = uniqSteps(measured.kickSteps, STEPS_PER_BAR)
  let snareSteps = uniqSteps(
    [
      ...(Array.isArray(measured.snareSteps) ? measured.snareSteps : []),
      ...(Array.isArray(measured.clapSteps) ? measured.clapSteps : []),
    ],
    STEPS_PER_BAR
  )
  if (!kickSteps.length && !snareSteps.length) {
    kickSteps = defaults.kick
    snareSteps = defaults.snare
  } else if (!kickSteps.length) {
    kickSteps = defaults.kick
  } else if (!snareSteps.length) {
    snareSteps = defaults.snare
  }

  const stepsPerBar =
    typeof measured.stepsPerBar === 'number' && measured.stepsPerBar > 0
      ? Math.round(measured.stepsPerBar)
      : STEPS_PER_BAR
  const phraseBars =
    typeof measured.phraseBars === 'number' && measured.phraseBars > 0
      ? Math.round(measured.phraseBars)
      : BARS_PER_PHRASE
  const phraseMod = stepsPerBar * phraseBars

  const rel = measured.spectral?.relative
  const kickSpectral =
    rel && typeof rel.kick === 'number' && Number.isFinite(rel.kick) ? rel.kick : null

  return {
    bpm: typeof measured.bpm === 'number' && measured.bpm > 0 ? measured.bpm : null,
    bpmConfidence:
      typeof measured.bpmConfidence === 'number' && Number.isFinite(measured.bpmConfidence)
        ? measured.bpmConfidence
        : null,
    effectiveBpm:
      typeof measured.effectiveBpm === 'number' && measured.effectiveBpm > 0
        ? measured.effectiveBpm
        : null,
    drumFamily: family && family !== 'unknown' ? family : null,
    kickSteps,
    snareSteps,
    kickPhraseSteps: uniqSteps(measured.kickPhraseSteps, phraseMod),
    snarePhraseSteps: uniqSteps(
      [
        ...(Array.isArray(measured.snarePhraseSteps) ? measured.snarePhraseSteps : []),
        ...(Array.isArray(measured.clapPhraseSteps) ? measured.clapPhraseSteps : []),
      ],
      phraseMod
    ),
    stepsPerBar,
    phraseBars,
    fourRatio:
      typeof measured.fourRatio === 'number' && Number.isFinite(measured.fourRatio)
        ? measured.fourRatio
        : null,
    swingPercent:
      typeof measured.swingPercent === 'number' && Number.isFinite(measured.swingPercent)
        ? measured.swingPercent
        : typeof measured.percussion?.swingPercent === 'number'
          ? measured.percussion.swingPercent
          : null,
    timingFeel: measured.timingFeel ? String(measured.timingFeel) : null,
    kickSpectral,
  }
}

/**
 * Choose grid BPM: prefer Sonic DNA when confidence is solid and close to the UI tempo,
 * and honor half-time effective pulse when DNA marks it.
 */
export function resolveAlignBpm(uiBpm: number, hints: AlignBeatGridSonicHints | null): number {
  if (!Number.isFinite(uiBpm) || uiBpm <= 0) {
    return hints?.effectiveBpm || hints?.bpm || 0
  }
  if (!hints) return uiBpm

  const feel = String(hints.timingFeel || '').toLowerCase()
  const dnaBpm = hints.bpm
  const effective = hints.effectiveBpm
  const conf = hints.bpmConfidence ?? 0.55

  if (
    feel.includes('half') &&
    effective &&
    dnaBpm &&
    Math.abs(effective - dnaBpm) / dnaBpm >= 0.35 &&
    conf >= 0.4
  ) {
    if (Math.abs(effective - uiBpm) / uiBpm < 0.12 || conf >= 0.7) return effective
  }

  if (dnaBpm && conf >= 0.45) {
    const rel = Math.abs(dnaBpm - uiBpm) / uiBpm
    if (rel < 0.08 || (conf >= 0.7 && rel < 0.15)) return dnaBpm
  }

  return uiBpm
}

/**
 * Single-bar 16-step energy template (kicks + snares).
 * Used as the repeating cell inside the 8-bar phrase template.
 */
export function buildAlignStepTemplate(hints: AlignBeatGridSonicHints | null): Float32Array {
  const tmpl = new Float32Array(STEPS_PER_BAR)
  const family = String(hints?.drumFamily || '').toLowerCase()
  const fourRatio = hints?.fourRatio
  const defaults = defaultStepsForFamily(hints?.drumFamily ?? null)
  const kicks = hints?.kickSteps?.length ? hints.kickSteps : defaults.kick
  const snares = hints?.snareSteps?.length ? hints.snareSteps : defaults.snare

  let kickW = 1
  let snareW = 0.55
  if (typeof fourRatio === 'number') {
    kickW = 0.75 + Math.min(0.55, fourRatio)
    snareW = 0.35 + (1 - Math.min(1, fourRatio)) * 0.45
  }
  if (family.includes('break') || family.includes('boom') || family.includes('dembow')) {
    snareW *= 1.35
    kickW *= 0.95
  }
  if (family.includes('four')) {
    kickW *= 1.15
  }
  if (typeof hints?.kickSpectral === 'number' && hints.kickSpectral > 0.15) {
    kickW *= 1 + Math.min(0.35, hints.kickSpectral)
  }

  for (const s of kicks) tmpl[s]! += kickW
  for (const s of snares) tmpl[s]! += snareW
  tmpl[0]! += 0.2

  let sum = 0
  for (let i = 0; i < STEPS_PER_BAR; i++) sum += tmpl[i]!
  if (sum > 0) {
    for (let i = 0; i < STEPS_PER_BAR; i++) tmpl[i]! /= sum
  }
  return tmpl
}

/**
 * 8-bar phrase template (128 sixteenth-note bins): DNA phrase steps when present,
 * otherwise tile the bar pocket with phrase-downbeat emphasis on bar 1 (and mild bar 5).
 */
export function buildAlignPhraseTemplate(hints: AlignBeatGridSonicHints | null): Float32Array {
  const stepsPerBar = hints?.stepsPerBar && hints.stepsPerBar > 0 ? hints.stepsPerBar : STEPS_PER_BAR
  const phraseBars = hints?.phraseBars && hints.phraseBars > 0 ? hints.phraseBars : BARS_PER_PHRASE
  const n = stepsPerBar * phraseBars
  const tmpl = new Float32Array(n)

  const phraseKicks = hints?.kickPhraseSteps ?? []
  const phraseSnares = hints?.snarePhraseSteps ?? []

  if (phraseKicks.length || phraseSnares.length) {
    let kickW = 1
    let snareW = 0.55
    const fourRatio = hints?.fourRatio
    if (typeof fourRatio === 'number') {
      kickW = 0.75 + Math.min(0.55, fourRatio)
      snareW = 0.35 + (1 - Math.min(1, fourRatio)) * 0.45
    }
    for (const s of phraseKicks) {
      if (s >= 0 && s < n) tmpl[s]! += kickW
    }
    for (const s of phraseSnares) {
      if (s >= 0 && s < n) tmpl[s]! += snareW
    }
    tmpl[0]! += 0.35
  } else {
    const bar = buildAlignStepTemplate(hints)
    // Bar weights inside the phrase: lock phrase start harder than mid-phrase repeats.
    for (let b = 0; b < phraseBars; b++) {
      const barW = b === 0 ? 1.4 : b === Math.floor(phraseBars / 2) ? 1.12 : 1
      for (let s = 0; s < stepsPerBar && s < bar.length; s++) {
        tmpl[b * stepsPerBar + s]! += bar[s]! * barW
      }
    }
  }

  let sum = 0
  for (let i = 0; i < n; i++) sum += tmpl[i]!
  if (sum > 0) {
    for (let i = 0; i < n; i++) tmpl[i]! /= sum
  }
  return tmpl
}

/**
 * Align grid to waveform peak energy, biased by Sonic DNA pocket
 * (16 steps/bar × 8-bar phrase). Single O(n) fold into a phrase histogram,
 * correlate against the DNA phrase template, then pick an early phrase downbeat.
 */
export function alignBeatGridFromPeaks(params: {
  peaks: Array<number | { positive?: number; negative?: number; rms?: number }>
  durationSec: number
  bpm: number
  beatsPerBar?: number
  /** Search window start (default: skip intro silence ~2%). */
  startSec?: number
  endSec?: number
  /** Track sonic_dna blob — preferred over raw `hints`. */
  sonicDna?: unknown
  /** Pre-extracted DNA priors (tests / callers that already parsed measured). */
  hints?: AlignBeatGridSonicHints | null
  /**
   * Prefer first kick/transient phrase downbeat over earliest energy near file start.
   * Use for Auto DJ / mix grid resolution.
   */
  preferTransientOrigin?: boolean
}): AlignBeatGridResult | null {
  const hints =
    params.hints !== undefined
      ? params.hints
      : params.sonicDna !== undefined
        ? alignHintsFromSonicDna(params.sonicDna)
        : null

  const bpm = resolveAlignBpm(params.bpm, hints)
  const beatSec = beatPeriodSec(bpm)
  if (!beatSec || params.durationSec <= 0 || !params.peaks.length) return null

  const beatsPerBar = Math.max(1, params.beatsPerBar ?? 4)
  const durationSec = params.durationSec
  const n = params.peaks.length
  const binsPerSec = n / durationSec
  const barSec = beatSec * beatsPerBar
  const phraseBars = hints?.phraseBars && hints.phraseBars > 0 ? hints.phraseBars : BARS_PER_PHRASE
  const stepsPerBar = hints?.stepsPerBar && hints.stepsPerBar > 0 ? hints.stepsPerBar : STEPS_PER_BAR
  const stepsPerPhrase = stepsPerBar * phraseBars
  const phraseSec = barSec * phraseBars
  const preferTransient = params.preferTransientOrigin !== false

  const amps = new Float32Array(n)
  let ampSum = 0
  for (let i = 0; i < n; i++) {
    amps[i] = peakAmplitude(params.peaks[i]!)
    ampSum += amps[i]!
  }
  const ampMean = ampSum / Math.max(1, n)

  // Skip leading silence — don't treat file start as phrase 1.
  let contentStartSec = params.startSec ?? Math.min(durationSec * 0.02, 4)
  if (preferTransient) {
    const silenceThresh = Math.max(0.04, ampMean * 0.55)
    for (let i = 0; i < n; i++) {
      if (amps[i]! >= silenceThresh) {
        contentStartSec = Math.max(contentStartSec, ((i + 0.5) / n) * durationSec)
        break
      }
    }
  }
  const start = contentStartSec
  // Prefer ≥2 phrases of material when the track is long enough.
  const end =
    params.endSec ??
    Math.max(start + phraseSec * 2, Math.min(durationSec * 0.7, durationSec))
  if (!(end > start)) return null

  const iStart = Math.max(0, Math.floor(start * binsPerSec - 0.5))
  const iEnd = Math.min(n - 1, Math.ceil(end * binsPerSec - 0.5))
  if (iEnd < iStart) return null

  // Fold peak energy into one 8-bar phrase (128 steps) — O(window).
  const hist = new Float32Array(stepsPerPhrase)
  const stepScale = stepsPerPhrase / phraseSec
  let energyCount = 0

  const swing = Math.max(0, Math.min(60, hints?.swingPercent ?? 0)) / 100
  const swingShiftSec = swing > 0.02 ? beatSec * 0.5 * swing * 0.5 : 0

  for (let i = iStart; i <= iEnd; i++) {
    const a = amps[i]!
    if (a <= 0) continue
    const energy = a * a
    let t = ((i + 0.5) / n) * durationSec
    if (swingShiftSec > 0) {
      let phaseInBeat = t % beatSec
      if (phaseInBeat < 0) phaseInBeat += beatSec
      if (phaseInBeat > beatSec * 0.35 && phaseInBeat < beatSec * 0.85) {
        t -= swingShiftSec
      }
    }
    let phase = t % phraseSec
    if (phase < 0) phase += phraseSec
    const step = Math.min(stepsPerPhrase - 1, (phase * stepScale) | 0)
    hist[step]! += energy
    energyCount++
  }

  if (energyCount === 0) return null

  const smooth = new Float32Array(stepsPerPhrase)
  for (let b = 0; b < stepsPerPhrase; b++) {
    const prev = hist[(b - 1 + stepsPerPhrase) % stepsPerPhrase]!
    const cur = hist[b]!
    const next = hist[(b + 1) % stepsPerPhrase]!
    smooth[b] = prev * 0.25 + cur + next * 0.25
  }

  const template = buildAlignPhraseTemplate(hints)

  let bestShift = 0
  let bestScore = -1
  let meanScore = 0
  for (let shift = 0; shift < stepsPerPhrase; shift++) {
    let score = 0
    for (let i = 0; i < stepsPerPhrase; i++) {
      const w = template[i]!
      if (w <= 0) continue
      score += smooth[(i + shift) % stepsPerPhrase]! * w
    }
    meanScore += score
    if (score > bestScore) {
      bestScore = score
      bestShift = shift
    }
  }
  meanScore /= stepsPerPhrase
  const lock = meanScore > 0 ? bestScore / (meanScore * 1.35) : 0

  // Phrase downbeat = template step 0 after the winning shift.
  const bestPhaseInPhrase = ((bestShift + 0.5) / stepsPerPhrase) * phraseSec

  const searchEnd = Math.min(end, start + phraseSec * 4)
  const span = Math.max(searchEnd - start, 1e-6)
  let bestDownbeat = bestPhaseInPhrase
  let bestHit = -1
  let t0 = bestPhaseInPhrase
  if (t0 < start) {
    t0 += phraseSec * Math.ceil((start - t0) / phraseSec)
  }

  // Collect phrase candidates; pick strongest pocket, with only mild preference
  // for the first transient-backed phrase (not file start).
  const candidates: { t: number; pocket: number }[] = []
  for (let t = t0; t <= searchEnd + 1e-9; t += phraseSec) {
    let pocket = 0
    for (let s = 0; s < stepsPerPhrase; s++) {
      const w = template[s]!
      if (w <= 0) continue
      const ts = t + (s / stepsPerPhrase) * phraseSec
      const idx = Math.round((ts / durationSec) * n - 0.5)
      if (idx < 0 || idx >= n) continue
      pocket += amps[idx]! * w
    }
    candidates.push({ t, pocket })
    const earlyBias = preferTransient
      ? 1 + Math.max(0, 1 - (t - start) / span) * 0.08
      : 1 + Math.max(0, 1 - (t - start) / span) * 0.28
    const weighted = pocket * earlyBias
    if (weighted > bestHit) {
      bestHit = weighted
      bestDownbeat = t
    }
  }

  // Prefer the first kick-backed phrase pocket, not the earliest weak energy.
  if (preferTransient && candidates.length > 1) {
    const maxPocket = Math.max(...candidates.map((c) => c.pocket))
    if (maxPocket > 0) {
      const firstStrong = candidates
        .filter((c) => c.pocket >= maxPocket * 0.72)
        .sort((a, b) => a.t - b.t)[0]
      if (firstStrong) bestDownbeat = firstStrong.t
    }
  }

  const centerIdx = Math.round((bestDownbeat / durationSec) * n - 0.5)
  const snapRadius = Math.max(1, Math.round(beatSec * 0.25 * binsPerSec))
  let snapIdx = Math.max(0, Math.min(n - 1, centerIdx))
  let snapAmp = amps[snapIdx]!
  const lo = Math.max(0, centerIdx - snapRadius)
  const hi = Math.min(n - 1, centerIdx + snapRadius)
  for (let i = lo; i <= hi; i++) {
    const a = amps[i]!
    if (a > snapAmp) {
      snapAmp = a
      snapIdx = i
    }
  }

  const snapped = ((snapIdx + 0.5) / n) * durationSec

  return {
    offsetSec: Math.max(0, snapped),
    bpm,
    lock: Math.max(0, lock),
  }
}

/** Iterate beat times visible in [startSec, endSec]. */
export function forEachBeatInWindow(
  startSec: number,
  endSec: number,
  offsetSec: number,
  beatSec: number,
  fn: (timeSec: number, beatIndex: number) => void
): void {
  if (!(beatSec > 0) || endSec <= startSec) return
  let n = Math.ceil((startSec - offsetSec) / beatSec - 1e-9)
  for (;; n++) {
    const t = offsetSec + n * beatSec
    if (t > endSec + 1e-9) break
    if (t >= startSec - 1e-9) fn(t, n)
  }
}
