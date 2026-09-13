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

/**
 * Shift grid phase and wrap into [0, wrapSec).
 * Default wrap is one beat (legacy micro-phase). Phase-meter jog passes the
 * CDJ window period (2 / 4 / 8 bars) so side-scroll can move downbeats
 * across the strip without resetting every beat.
 */
export function nudgeBeatPhaseSec(
  phaseSec: number,
  deltaSec: number,
  beatSec: number,
  wrapSec?: number,
): number {
  if (!(beatSec > 0) || !Number.isFinite(beatSec)) return 0
  const wrap =
    typeof wrapSec === 'number' && Number.isFinite(wrapSec) && wrapSec > 0 ? wrapSec : beatSec
  const phase = Number.isFinite(phaseSec) ? phaseSec : 0
  const delta = Number.isFinite(deltaSec) ? deltaSec : 0
  const p = (((phase + delta) % wrap) + wrap) % wrap
  return p < 1e-9 || wrap - p < 1e-9 ? 0 : p
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
 * Nudge a beat phase so early waveform peaks sit on beat lines.
 * Used so the grid matches the tape at file start (not a kick 2–8s in).
 */
export function snapPhaseToEarlyPeaks(params: {
  amps: ArrayLike<number>
  durationSec: number
  phaseSec: number
  beatSec: number
  searchEndSec?: number
  /** Fraction of a beat to search in each direction. 0.5 covers a full valley→peak flip. */
  snapRadiusBeats?: number
  /** Score the whole window evenly (no intro bias). */
  uniformWeight?: boolean
}): number {
  const { amps, durationSec, beatSec } = params
  const n = amps.length
  if (!n || !(durationSec > 0) || !(beatSec > 0)) {
    return absoluteDownbeatSec(params.phaseSec, beatSec)
  }
  const phase0 = absoluteDownbeatSec(params.phaseSec, beatSec)
  const searchEnd = Math.min(durationSec, params.searchEndSec ?? beatSec * 8)
  const snapRadius = beatSec * Math.max(0.05, Math.min(0.5, params.snapRadiusBeats ?? 0.5))
  const steps = 24
  const uniform = Boolean(params.uniformWeight) || searchEnd > beatSec * 24
  let bestPhase = phase0
  let bestScore = -1
  for (let s = -steps; s <= steps; s++) {
    const cand = absoluteDownbeatSec(phase0 + (s / steps) * snapRadius, beatSec)
    let score = 0
    for (let t = cand; t <= searchEnd + 1e-9; t += beatSec) {
      const idx = Math.round((t / durationSec) * n - 0.5)
      if (idx < 0 || idx >= n) continue
      const w = uniform ? 1 : t < beatSec * 2 ? 3.2 : t < beatSec * 4 ? 1.6 : 1
      score += amps[idx]! * w
    }
    if (score > bestScore) {
      bestScore = score
      bestPhase = cand
    }
  }
  return bestPhase
}

/**
 * Align grid to waveform peak energy, biased by Sonic DNA pocket
 * (16 steps/bar × 8-bar phrase). Single O(n) fold into a phrase histogram,
 * correlate against the DNA phrase template, then return within-beat phase
 * locked to the start of the tape.
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
  let phase = absoluteDownbeatSec(bestPhaseInPhrase, beatSec)

  const earlyEnd = Math.min(durationSec, beatSec * 8)
  const iEarlyEnd = Math.min(n - 1, Math.ceil(earlyEnd * binsPerSec))
  let earlySum = 0
  for (let i = 0; i <= iEarlyEnd; i++) earlySum += amps[i]!
  const earlyMean = iEarlyEnd >= 0 ? earlySum / (iEarlyEnd + 1) : 0
  const startHasContent = earlyMean >= Math.max(0.045, ampMean * 0.38)

  if (startHasContent) {
    phase = snapPhaseToEarlyPeaks({
      amps,
      durationSec,
      phaseSec: phase,
      beatSec,
      searchEndSec: earlyEnd,
    })
  } else {
    const kickPhase = absoluteDownbeatSec(snapped, beatSec)
    const delta = Math.abs(kickPhase - phase)
    const wrap = Math.min(delta, beatSec - delta)
    if (wrap < beatSec * 0.12) phase = kickPhase
  }

  return {
    offsetSec: phase,
    bpm,
    lock: Math.max(0, lock),
  }
}

function peakAmpsFromPeaks(
  peaks: Array<number | { positive?: number; negative?: number; rms?: number }>,
): Float32Array {
  const n = peaks.length
  const amps = new Float32Array(n)
  for (let i = 0; i < n; i++) amps[i] = peakAmplitude(peaks[i]!)
  return amps
}

/** Mean peak amplitude on beat lines (higher = grid sits on the tape). */
export function scoreBeatGridOnPeaks(params: {
  amps: ArrayLike<number>
  durationSec: number
  bpm: number
  phaseSec: number
}): number {
  const beatSec = beatPeriodSec(params.bpm)
  const n = params.amps.length
  if (!beatSec || !(params.durationSec > 0) || !n) return 0
  const phase = absoluteDownbeatSec(params.phaseSec, beatSec)
  let score = 0
  let hits = 0
  for (let t = phase; t <= params.durationSec + 1e-9; t += beatSec) {
    const idx = Math.round((t / params.durationSec) * n - 0.5)
    if (idx < 0 || idx >= n) continue
    score += params.amps[idx]!
    hits++
  }
  return hits > 0 ? score / hits : 0
}

export type MeasureBpmFromPeaksResult = {
  bpm: number
  confidence: number
  phaseSec: number
}

function extractTransientTimes(amps: ArrayLike<number>, durationSec: number): number[] {
  const n = amps.length
  if (n < 8 || !(durationSec > 0)) return []
  let sum = 0
  for (let i = 0; i < n; i++) sum += amps[i]!
  const mean = sum / n
  const thresh = Math.max(0.07, mean * 1.28)
  const times: number[] = []
  for (let i = 1; i < n - 1; i++) {
    const a = amps[i]!
    if (a < thresh) continue
    if (a >= amps[i - 1]! && a > amps[i + 1]!) {
      times.push(((i + 0.5) / n) * durationSec)
    }
  }
  return times
}

/**
 * Snap a measured pulse onto a catalog hint when it is only an octave or
 * 2/3–3/2 misfold (e.g. 86 vs 128). Leave true tempo differences alone
 * (e.g. 123 vs 125 stays 123).
 */
export function reconcileTapeBpm(tape: number, hint?: number | null): number {
  if (!(tape > 0) || !Number.isFinite(tape)) return hint && hint > 0 ? hint : tape
  if (!hint || !(hint > 0)) return tape
  const relTape = Math.abs(tape - hint) / hint
  if (relTape <= 0.04) return tape
  const folds = [tape / 2, (tape * 2) / 3, tape * 1.5, tape * 2]
  let best = tape
  let bestRel = relTape
  for (const f of folds) {
    if (f < 60 || f > 200) continue
    const r = Math.abs(f - hint) / hint
    if (r < bestRel) {
      best = f
      bestRel = r
    }
  }
  if (bestRel <= 0.03 && bestRel < relTape) return best
  return tape
}

function foldBpmToDanceRange(bpm: number, hintBpm?: number | null): number {
  let x = bpm
  if (!(x > 0) || !Number.isFinite(x)) return bpm
  while (x < 70) x *= 2
  while (x > 180) x /= 2
  if (hintBpm && hintBpm > 0) {
    return reconcileTapeBpm(x, hintBpm)
  }
  return x
}

function ioiBpmCandidates(times: number[], hintBpm?: number | null): number[] {
  if (times.length < 6) return []
  const iois: number[] = []
  for (let i = 1; i < times.length; i++) {
    const dt = times[i]! - times[i - 1]!
    if (dt >= 0.22 && dt <= 1.15) iois.push(dt)
  }
  if (iois.length < 4) return []
  const bins = new Map<number, number>()
  for (const dt of iois) {
    const key = Math.round(dt * 80) / 80
    bins.set(key, (bins.get(key) ?? 0) + 1)
  }
  const ranked = [...bins.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  const out: number[] = []
  for (const [period] of ranked) {
    if (!(period > 0)) continue
    out.push(foldBpmToDanceRange(60 / period, hintBpm))
  }
  return out
}

function bestPhaseScoreForBpm(params: {
  amps: ArrayLike<number>
  durationSec: number
  bpm: number
}): { phaseSec: number; score: number } {
  const beatSec = beatPeriodSec(params.bpm)
  if (!beatSec) return { phaseSec: 0, score: 0 }
  let bestPhase = 0
  let bestScore = -1
  const steps = 32
  for (let i = 0; i < steps; i++) {
    const phaseSec = (i / steps) * beatSec
    const score = scoreBeatGridOnPeaks({
      amps: params.amps,
      durationSec: params.durationSec,
      bpm: params.bpm,
      phaseSec,
    })
    if (score > bestScore) {
      bestScore = score
      bestPhase = phaseSec
    }
  }
  return { phaseSec: bestPhase, score: bestScore }
}

/**
 * Measure tempo from waveform peak energy (transients + beat-line fit).
 * `hintBpm` only chooses octave (half/double), not the tempo itself.
 */
export function measureBpmFromPeaks(params: {
  peaks: Array<number | { positive?: number; negative?: number; rms?: number }>
  durationSec: number
  hintBpm?: number | null
}): MeasureBpmFromPeaksResult | null {
  if (!(params.durationSec > 0) || params.peaks.length < 64) return null
  const amps = peakAmpsFromPeaks(params.peaks)
  const times = extractTransientTimes(amps, params.durationSec)
  const hint = params.hintBpm && params.hintBpm > 0 ? params.hintBpm : null
  const candidates: number[] = []
  const seen = new Set<number>()
  const push = (bpm: number | null | undefined) => {
    if (!(typeof bpm === 'number') || !(bpm > 0) || !Number.isFinite(bpm)) return
    const folded = foldBpmToDanceRange(bpm, hint)
    const key = Math.round(folded * 20) / 20
    if (seen.has(key)) return
    seen.add(key)
    candidates.push(folded)
  }
  for (const bpm of ioiBpmCandidates(times, hint)) push(bpm)
  if (hint) {
    push(hint)
    push(hint * 2)
    push(hint / 2)
  }
  if (candidates.length < 3) {
    for (let bpm = 80; bpm <= 160; bpm += 2) push(bpm)
  }

  let bestBpm = hint ?? candidates[0] ?? 0
  let bestScore = -1
  let bestPhase = 0
  for (const bpm of candidates) {
    const fit = bestPhaseScoreForBpm({
      amps,
      durationSec: params.durationSec,
      bpm,
    })
    if (fit.score > bestScore) {
      bestScore = fit.score
      bestBpm = bpm
      bestPhase = fit.phaseSec
    }
  }
  if (!(bestBpm > 0) || bestScore <= 0) return null

  const refined = refineGridBpmFromPeaks({
    amps,
    durationSec: params.durationSec,
    bpm: bestBpm,
    phaseSec: bestPhase,
    relSpan: 0.035,
  })
  const snapped = snapPhaseToEarlyPeaks({
    amps,
    durationSec: params.durationSec,
    phaseSec: bestPhase,
    beatSec: beatPeriodSec(refined) ?? 60 / refined,
    searchEndSec: Math.min(params.durationSec, (60 / refined) * 16),
  })
  const meanAmp = (() => {
    let s = 0
    for (let i = 0; i < amps.length; i++) s += amps[i]!
    return s / Math.max(1, amps.length)
  })()
  const confidence = Math.max(0.15, Math.min(0.98, bestScore / Math.max(0.08, meanAmp * 2.2)))
  return { bpm: reconcileTapeBpm(refined, hint), confidence, phaseSec: snapped }
}

/**
 * Nudge catalog/DNA BPM so beat lines stay on waveform transients.
 * Search is a tight window — this is a visual lock, not a new analysis.
 */
export function refineGridBpmFromPeaks(params: {
  amps: ArrayLike<number>
  durationSec: number
  bpm: number
  phaseSec: number
  relSpan?: number
}): number {
  const bpm0 = params.bpm
  if (!(bpm0 > 0) || !(params.durationSec > 0) || !params.amps.length) return bpm0
  const span = params.relSpan ?? 0.024
  const lo = bpm0 * (1 - span)
  const hi = bpm0 * (1 + span)
  const steps = 20
  let best = bpm0
  let bestScore = -1
  for (let i = 0; i <= steps; i++) {
    const bpm = lo + ((hi - lo) * i) / steps
    const score = scoreBeatGridOnPeaks({
      amps: params.amps,
      durationSec: params.durationSec,
      bpm,
      phaseSec: params.phaseSec,
    })
    if (score > bestScore) {
      bestScore = score
      best = bpm
    }
  }
  return best
}

function pickBestPhaseOnPeaks(params: {
  amps: ArrayLike<number>
  durationSec: number
  bpm: number
  candidates: Array<number | null | undefined>
}): number {
  const beatSec = beatPeriodSec(params.bpm)
  const fit = bestPhaseScoreForBpm({
    amps: params.amps,
    durationSec: params.durationSec,
    bpm: params.bpm,
  })
  if (!beatSec) return fit.phaseSec
  let bestPhase = fit.phaseSec
  let bestScore = fit.score
  for (const raw of params.candidates) {
    if (raw == null || !Number.isFinite(raw) || raw < 0) continue
    const phaseSec = absoluteDownbeatSec(raw, beatSec)
    const score = scoreBeatGridOnPeaks({
      amps: params.amps,
      durationSec: params.durationSec,
      bpm: params.bpm,
      phaseSec,
    })
    if (score > bestScore) {
      bestScore = score
      bestPhase = phaseSec
    }
  }
  return bestPhase
}

/**
 * Grid phase + BPM that sit on the painted waveform peaks.
 * Peak-measured tempo/phase win; stored/DNA phase is kept only when it
 * already scores on those peaks (≤8% of a beat and not in a valley).
 */
export function resolveTapeAlignedGrid(params: {
  peaks: Array<number | { positive?: number; negative?: number; rms?: number }>
  durationSec: number
  bpm?: number | null
  storedPhaseSec?: number | null
  sonicDna?: unknown
  beatsPerBar?: number
}): AlignBeatGridResult | null {
  if (!(params.durationSec > 0) || !params.peaks.length) return null
  const measured = measureBpmFromPeaks({
    peaks: params.peaks,
    durationSec: params.durationSec,
    hintBpm: params.bpm,
  })
  const seedBpm = measured?.bpm ?? (params.bpm && params.bpm > 0 ? params.bpm : 0)
  if (!(seedBpm > 0)) return null
  const aligned = alignBeatGridFromPeaks({
    peaks: params.peaks,
    durationSec: params.durationSec,
    bpm: seedBpm,
    beatsPerBar: params.beatsPerBar,
    sonicDna: params.sonicDna,
    preferTransientOrigin: false,
  })
  const amps = peakAmpsFromPeaks(params.peaks)
  const bpm0 = measured?.bpm ?? (aligned?.bpm && aligned.bpm > 0 ? aligned.bpm : seedBpm)
  const beat0 = beatPeriodSec(bpm0)
  if (!beat0) return aligned

  let phase = pickBestPhaseOnPeaks({
    amps,
    durationSec: params.durationSec,
    bpm: bpm0,
    candidates: [
      measured?.phaseSec,
      aligned ? absoluteDownbeatSec(aligned.offsetSec, beat0) : null,
      params.storedPhaseSec,
    ],
  })

  phase = snapPhaseToEarlyPeaks({
    amps,
    durationSec: params.durationSec,
    phaseSec: phase,
    beatSec: beat0,
    searchEndSec: params.durationSec,
    snapRadiusBeats: 0.5,
    uniformWeight: true,
  })

  const refinedBpm = refineGridBpmFromPeaks({
    amps,
    durationSec: params.durationSec,
    bpm: bpm0,
    phaseSec: phase,
    relSpan: 0.035,
  })
  const beatSec = beatPeriodSec(refinedBpm) ?? beat0
  phase = absoluteDownbeatSec(phase, beatSec)

  const stored =
    params.storedPhaseSec != null &&
    Number.isFinite(params.storedPhaseSec) &&
    params.storedPhaseSec >= 0
      ? absoluteDownbeatSec(params.storedPhaseSec, beatSec)
      : null
  if (stored != null) {
    const d = Math.abs(stored - phase)
    const wrap = Math.min(d, beatSec - d)
    const storedScore = scoreBeatGridOnPeaks({
      amps,
      durationSec: params.durationSec,
      bpm: refinedBpm,
      phaseSec: stored,
    })
    const peakScore = scoreBeatGridOnPeaks({
      amps,
      durationSec: params.durationSec,
      bpm: refinedBpm,
      phaseSec: phase,
    })
    if (wrap <= beatSec * 0.08 && storedScore >= peakScore * 0.97) phase = stored
  }

  return {
    offsetSec: phase,
    bpm: reconcileTapeBpm(refinedBpm, params.bpm),
    lock: Math.max(0, aligned?.lock ?? measured?.confidence ?? 0.4),
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
