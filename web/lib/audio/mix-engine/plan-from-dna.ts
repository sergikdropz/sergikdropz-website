/**
 * Build a MixPlan from beat grid + Sonic DNA segment hints.
 * Pure functions — no DOM / AudioContext.
 *
 * Mix-out / mix-in cue alignment always snaps on 8-bar DNA phrase increments
 * (kick + clap/snare pocket). Bar-out section depth is 8 / 16 / 24 / 32 bars.
 * Bar-in can be set to 0 to skip incoming snap. Overlap length is configurable.
 */

import { BARS_PER_PHRASE } from '@/lib/audio/beat-grid'
import type {
  BeatCorrect,
  BlendQuantize,
  CuePriority,
  EnergyCurve,
  MixLengthBias,
} from '@/lib/audio/auto-dj-preferences'
import { beatCorrectFlags, mixLengthBiasFactor } from '@/lib/audio/auto-dj-preferences'
import {
  quantizeToDnaGrid,
  resolvePlaybackBpm,
  secondsToNextPhraseBoundary,
} from '@/lib/audio/sonic-dna-mix'
import { mixIncomingRateRatio } from './sync'
import { cueByRole, parseMixCues, resolveHotCueTime } from './cues'
import { harmonicPitchSemitones } from './harmonic-pitch'
import { readPairBpmConfidence } from './alignment'
import { normalizeDjOverlapBars, PHRASE_CELL_BARS } from './phrase-mix-doctrine'
import { resolveMixGridOffset } from './grid-offset'
import { toPhaseOnlyOffsetSec } from './phrase-lattice'
import type { DeckCues, InPhraseBars, MixPlan, MixStyle, MixTrackRef, OutPhraseBars, PhraseBars } from './types'

const DEFAULT_PHRASE_BARS: PhraseBars = 8
/** Fixed align grid for mix-in / mix-out / start (kick + snare phrase). */
export const ALIGN_PHRASE_BARS = BARS_PER_PHRASE as PhraseBars // 8

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

function clampTimeSec(timeSec: number, minSec?: number, maxSec?: number): number {
  let t = timeSec
  if (typeof minSec === 'number') t = Math.max(minSec, t)
  if (typeof maxSec === 'number') t = Math.min(maxSec, t)
  return t
}

function readSegmentMap(sonicDna: unknown): {
  introEndRatio?: number
  outroStartRatio?: number
  mixInBars?: number
  mixOutBars?: number
  dropRatio?: number
  breakRatio?: number
  introEndSec?: number
  dropStartSec?: number
  breakStartSec?: number
  outroStartSec?: number
} | null {
  if (!sonicDna || typeof sonicDna !== 'object') return null
  const root = sonicDna as Record<string, unknown>
  const creative =
    (root.creative as Record<string, unknown> | undefined) ||
    (root.v2 as Record<string, unknown> | undefined) ||
    root
  const segments =
    (creative.segments as Record<string, unknown> | undefined) ||
    (root.segments as Record<string, unknown> | undefined)
  if (!segments || typeof segments !== 'object') return null
  const insights =
    (creative.insights as Record<string, unknown> | undefined) ||
    (root.insights as Record<string, unknown> | undefined)
  const insightSeg =
    insights && typeof insights === 'object'
      ? (insights.segments as Record<string, unknown> | undefined)
      : undefined
  const intention =
    root.intention && typeof root.intention === 'object'
      ? (root.intention as Record<string, unknown>)
      : null
  const intentionSeg =
    intention?.segments && typeof intention.segments === 'object'
      ? (intention.segments as Record<string, unknown>)
      : undefined
  const src = { ...insightSeg, ...intentionSeg, ...segments }
  return {
    introEndRatio: Number(src.introEndRatio),
    outroStartRatio: Number(src.outroStartRatio),
    mixInBars: Number(src.mixInBars),
    mixOutBars: Number(src.mixOutBars),
    dropRatio: Number(src.dropRatio),
    breakRatio: Number(src.breakRatio),
    introEndSec: Number(src.introEndSec),
    dropStartSec: Number(src.dropStartSec),
    breakStartSec: Number(src.breakStartSec),
    outroStartSec: Number(src.outroStartSec),
  }
}

/** Resolve mix-out section depth (always a multiple of the 8-bar DNA phrase). */
export function resolveOutPhraseBars(outPhraseBars?: OutPhraseBars | number): OutPhraseBars {
  if (outPhraseBars === 16 || outPhraseBars === 24 || outPhraseBars === 32) return outPhraseBars
  return ALIGN_PHRASE_BARS
}

/** Resolve mix-in phrase bars: 0 = off, otherwise DNA 8-bar phrase grid. */
export function resolveInPhraseBars(inPhraseBars?: InPhraseBars): InPhraseBars {
  return inPhraseBars === 0 ? 0 : ALIGN_PHRASE_BARS
}

/** Snap to nearest 8-bar mathematical grid, then micro-nudge onto a kick (±½ beat). */
function snapToKickPocket(params: {
  timeSec: number
  bpm: number
  offsetSec?: number
  sonicDna?: unknown
  preferEarlier?: boolean
}): number {
  const phrase = snapToNearestPhraseBoundary({
    timeSec: params.timeSec,
    bpm: params.bpm,
    offsetSec: params.offsetSec,
    phraseBars: ALIGN_PHRASE_BARS,
    preferEarlier: params.preferEarlier,
  })
  if (params.sonicDna == null) return phrase

  const kicked = quantizeToDnaGrid({
    timeSec: phrase,
    bpm: params.bpm,
    offsetSec: params.offsetSec,
    sonicDna: params.sonicDna,
    mode: 'kick',
  })
  const beat = params.bpm > 0 ? 60 / params.bpm : 0.5
  // Math 8-bar wins; kick may only micro-nudge (½ beat), never redefine the phrase.
  if (Math.abs(kicked - phrase) <= beat * 0.5) return kicked
  return phrase
}

/**
 * Snap mix cues to mathematical phrase / bar / beat lattice, optionally with
 * a ±½-beat kick nudge. Skips snap when phraseBars is 0.
 */
export function snapToMixPhraseBoundary(params: {
  timeSec: number
  bpm: number
  offsetSec?: number
  phraseBars: PhraseBars | InPhraseBars | OutPhraseBars
  sectionBars?: OutPhraseBars
  sonicDna?: unknown
  preferEarlier?: boolean
  minSec?: number
  maxSec?: number
  /** When true, skip DNA kick nudge (pure bar math). */
  mathOnly?: boolean
  /** Lattice size for the snap (default phrase = 8 bars). */
  quantize?: BlendQuantize
}): number {
  if (params.phraseBars === 0) {
    return clampTimeSec(params.timeSec, params.minSec, params.maxSec)
  }

  const bpm = params.bpm > 0 ? params.bpm : 120
  const beat = 60 / bpm
  const barSec = beat * 4
  const offset = toPhaseOnlyOffsetSec(
    Number.isFinite(params.offsetSec) ? Math.max(0, params.offsetSec!) : 0,
    beat,
  )
  const quantize: BlendQuantize =
    params.quantize === 'bar' || params.quantize === 'beat' ? params.quantize : 'phrase'
  const dna = params.mathOnly || quantize === 'beat' ? undefined : params.sonicDna

  if (quantize === 'bar' || quantize === 'beat') {
    const cell = quantize === 'bar' ? barSec : beat
    const t = Math.max(0, params.timeSec)
    const rel = Math.max(0, t - offset)
    const idx = params.preferEarlier ? Math.floor(rel / cell + 1e-9) : Math.round(rel / cell)
    let snapped = offset + Math.max(0, idx) * cell
    if (params.preferEarlier && snapped > t + beat * 0.25 && idx > 0) {
      snapped = offset + (idx - 1) * cell
    }
    if (dna && quantize === 'bar') {
      snapped = snapToKickPocket({
        timeSec: snapped,
        bpm,
        offsetSec: offset,
        sonicDna: dna,
        preferEarlier: true,
      })
    }
    return clampTimeSec(snapped, params.minSec, params.maxSec)
  }

  const sectionBars = resolveOutPhraseBars(params.sectionBars ?? (params.phraseBars as OutPhraseBars))

  // Prefer section math when section > 8, else 8-bar — then optional kick nudge.
  if (sectionBars > ALIGN_PHRASE_BARS) {
    const sectionSec = barSec * sectionBars
    const rel = Math.max(0, params.timeSec - offset)
    const idx = params.preferEarlier ? Math.floor(rel / sectionSec + 1e-9) : Math.round(rel / sectionSec)
    let sectionStart = offset + Math.max(0, idx) * sectionSec
    if (params.preferEarlier && sectionStart > params.timeSec + beat * 0.25 && idx > 0) {
      sectionStart = offset + (idx - 1) * sectionSec
    }
    const snapped = snapToKickPocket({
      timeSec: sectionStart,
      bpm,
      offsetSec: offset,
      sonicDna: dna,
      preferEarlier: true,
    })
    return clampTimeSec(snapped, params.minSec, params.maxSec)
  }

  const snapped = snapToKickPocket({
    timeSec: params.timeSec,
    bpm,
    offsetSec: offset,
    sonicDna: dna,
    preferEarlier: params.preferEarlier,
  })
  return clampTimeSec(snapped, params.minSec, params.maxSec)
}

/**
 * Snap a time to the nearest phrase boundary on the **file-start** lattice.
 * Boundaries are at: phase + n * (barSec * phraseBars), where phase is folded
 * into [0, beatSec). Legacy absolute kick offsets are folded so phrase 1 stays
 * near track start.
 */
export function snapToNearestPhraseBoundary(params: {
  timeSec: number
  bpm: number
  offsetSec?: number
  phraseBars?: PhraseBars | number
  /** Prefer earlier boundary when almost equidistant (cleaner mix-out) */
  preferEarlier?: boolean
  /** Keep result within [minSec, maxSec] if provided */
  minSec?: number
  maxSec?: number
}): number {
  const bpm = params.bpm > 0 ? params.bpm : 120
  const beat = 60 / bpm
  const barSec = beat * 4
  const bars =
    typeof params.phraseBars === 'number' && params.phraseBars > 0
      ? params.phraseBars
      : ALIGN_PHRASE_BARS
  const phraseSec = barSec * bars
  const offset = toPhaseOnlyOffsetSec(
    Number.isFinite(params.offsetSec) ? Math.max(0, params.offsetSec!) : 0,
    beat,
  )
  const t = Math.max(0, params.timeSec)
  const rel = Math.max(0, t - offset)
  const idx = rel / phraseSec
  const floorIdx = Math.floor(idx)
  const ceilIdx = Math.ceil(idx)
  const earlier = offset + floorIdx * phraseSec
  const later = offset + ceilIdx * phraseSec
  const distEarlier = Math.abs(t - earlier)
  const distLater = Math.abs(t - later)
  let snapped =
    distEarlier < distLater - 1e-6
      ? earlier
      : distLater < distEarlier - 1e-6
        ? later
        : params.preferEarlier
          ? earlier
          : later
  if (typeof params.minSec === 'number') snapped = Math.max(params.minSec, snapped)
  if (typeof params.maxSec === 'number') snapped = Math.min(params.maxSec, snapped)
  return snapped
}

function readTrackEnergy(track: MixTrackRef): number | null {
  if (typeof track.energy_level === 'number' && Number.isFinite(track.energy_level)) {
    return Math.max(0, Math.min(1, track.energy_level))
  }
  if (!track.sonic_dna || typeof track.sonic_dna !== 'object') return null
  const root = track.sonic_dna as Record<string, unknown>
  const tech = root.technical as Record<string, unknown> | undefined
  const raw = tech?.energyLevel ?? root.energyLevel
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  // DNA energyLevel is often 1–10
  return n > 1.5 ? Math.max(0, Math.min(1, n / 10)) : Math.max(0, Math.min(1, n))
}

/** Scale overlap from energy delta + user energy curve preference. */
export function energyCurveOverlapFactor(
  curve: EnergyCurve | undefined,
  outgoing: MixTrackRef,
  incoming: MixTrackRef,
): number {
  const outE = readTrackEnergy(outgoing)
  const inE = readTrackEnergy(incoming)
  const delta = outE != null && inE != null ? inE - outE : 0
  if (curve === 'build') return delta >= 0 ? 1.1 : 1.04
  if (curve === 'drop') return delta <= 0 ? 0.9 : 0.96
  return 1
}

/** Scale overlap duration from energy delta between tracks. */
export function energyOverlapFactor(
  outgoing: MixTrackRef,
  incoming: MixTrackRef
): number {
  const outE = readTrackEnergy(outgoing)
  const inE = readTrackEnergy(incoming)
  if (outE == null || inE == null) return 1
  const delta = inE - outE
  if (delta > 0.18) return 1.18
  if (delta > 0.12) return 1.14
  if (delta > 0.05) return 1.06
  if (delta < -0.18) return 0.82
  if (delta < -0.12) return 0.88
  if (delta < -0.05) return 0.94
  return 1
}

export function deriveDeckCues(
  track: MixTrackRef,
  overlapBars: PhraseBars = DEFAULT_PHRASE_BARS,
  alignPhraseBars: PhraseBars | InPhraseBars | OutPhraseBars = ALIGN_PHRASE_BARS,
  gridOffsetOverride?: number,
  cuePriority: CuePriority = 'dna-intro',
  energyCurve: EnergyCurve = 'hold',
  /**
   * Auto DJ default: OUT = last section on 8-bar grid; IN = first downbeat.
   * Ignores creative outroStartRatio / intro mid-cues (labeled mix-in/out still win when present).
   */
  canonicalPhraseCues: boolean = true,
  opts?: {
    blendQuantize?: BlendQuantize
    /** When false, skip DNA kick nudge on cue snaps. */
    kickCueNudge?: boolean
  },
): DeckCues {
  const blendQuantize: BlendQuantize =
    opts?.blendQuantize === 'bar' || opts?.blendQuantize === 'beat'
      ? opts.blendQuantize
      : 'phrase'
  const mathOnly = canonicalPhraseCues || opts?.kickCueNudge === false
  const bpm = resolvePlaybackBpm(track) || (typeof track.bpm === 'number' ? track.bpm : null)
  const useBpmEarly = bpm && bpm > 0 ? bpm : 120
  const beatEarly = 60 / useBpmEarly
  const grid = (() => {
    if (typeof gridOffsetOverride === 'number' && Number.isFinite(gridOffsetOverride)) {
      return toPhaseOnlyOffsetSec(Math.max(0, gridOffsetOverride), beatEarly)
    }
    // Phase-only: phrase lattice stays at file start; never adopt absolute kick time.
    return resolveMixGridOffset(track)
  })()
  const duration =
    typeof track.duration === 'number' && track.duration > 0 ? track.duration : null
  const beat = bpm && bpm > 0 ? 60 / bpm : 0.5
  const barSec = beat * 4
  const resolvedInBars: InPhraseBars = alignPhraseBars === 0 ? 0 : ALIGN_PHRASE_BARS
  const sectionBars =
    alignPhraseBars === 0 ? undefined : resolveOutPhraseBars(alignPhraseBars as OutPhraseBars)
  const alignPhraseSec = barSec * (sectionBars ?? ALIGN_PHRASE_BARS)
  const overlapPhraseSec = barSec * overlapBars
  const useBpm = bpm && bpm > 0 ? bpm : 120

  const segments = readSegmentMap(track.sonic_dna)
  const labeled = parseMixCues(track.sonic_dna, track.hotCues)
  const labeledIn = cueByRole(labeled, 'mix-in')
  const labeledOut = cueByRole(labeled, 'mix-out')
  const labeledDrop = cueByRole(labeled, 'drop')

  // Canonical OUT: last outPhrase / overlap depth on the file-start grid.
  let mixOutSec =
    duration != null
      ? Math.max(grid, duration - Math.max(alignPhraseSec, overlapPhraseSec))
      : alignPhraseSec * 4
  // Canonical IN: phrase 1 ≈ track start (phase-only nudge).
  let mixInSec = grid

  if (!canonicalPhraseCues && duration != null && segments) {
    if (
      energyCurve === 'build' &&
      Number.isFinite(segments.dropStartSec) &&
      segments.dropStartSec! > 0
    ) {
      mixInSec = clamp(segments.dropStartSec!, grid, duration * 0.55)
    } else if (
      energyCurve === 'build' &&
      Number.isFinite(segments.dropRatio) &&
      segments.dropRatio! > 0.04
    ) {
      mixInSec = clamp(duration * segments.dropRatio!, grid, duration * 0.55)
    } else if (
      energyCurve === 'drop' &&
      Number.isFinite(segments.breakStartSec) &&
      segments.breakStartSec! > 0
    ) {
      mixInSec = clamp(segments.breakStartSec!, grid, duration * 0.45)
    } else if (
      energyCurve === 'drop' &&
      Number.isFinite(segments.breakRatio) &&
      segments.breakRatio! > 0.04
    ) {
      mixInSec = clamp(duration * segments.breakRatio!, grid, duration * 0.45)
    } else if (Number.isFinite(segments.introEndSec) && segments.introEndSec! >= 0) {
      mixInSec = clamp(grid, 0, Math.min(segments.introEndSec! * 0.35 + grid, duration * 0.15, alignPhraseSec))
    } else if (Number.isFinite(segments.introEndRatio) && segments.introEndRatio! > 0) {
      const introEnd = duration * segments.introEndRatio!
      mixInSec = clamp(grid, 0, Math.min(introEnd * 0.35, duration * 0.15, alignPhraseSec))
    }
    if (Number.isFinite(segments.outroStartSec) && segments.outroStartSec! > 0) {
      const ideal = segments.outroStartSec!
      const phraseIndex = Math.floor(ideal / alignPhraseSec)
      mixOutSec = phraseIndex * alignPhraseSec
      const minRemain = Math.max(alignPhraseSec, overlapPhraseSec * 0.5)
      if (duration - mixOutSec < minRemain) {
        mixOutSec = Math.max(0, duration - minRemain)
      }
    } else if (Number.isFinite(segments.outroStartRatio) && segments.outroStartRatio! > 0) {
      const ideal = duration * segments.outroStartRatio!
      const phraseIndex = Math.floor(ideal / alignPhraseSec)
      mixOutSec = phraseIndex * alignPhraseSec
      const minRemain = Math.max(alignPhraseSec, overlapPhraseSec * 0.5)
      if (duration - mixOutSec < minRemain) {
        mixOutSec = Math.max(0, duration - minRemain)
      }
    }
  }

  if (!canonicalPhraseCues && labeledDrop && energyCurve === 'build') {
    mixInSec = labeledDrop.timeSec
  }
  // Explicit labeled cues always win (DJ-marked).
  if (labeledIn) mixInSec = labeledIn.timeSec
  if (labeledOut) mixOutSec = labeledOut.timeSec

  const hotCueSlot =
    cuePriority === 'hot-cue-1'
      ? 1
      : cuePriority === 'hot-cue-2'
        ? 2
        : cuePriority === 'hot-cue-3'
          ? 3
          : cuePriority === 'hot-cue-4'
            ? 4
            : null
  if (cuePriority === 'first-downbeat') {
    if (!labeledIn) mixInSec = grid
  } else if (hotCueSlot != null) {
    const hot = resolveHotCueTime(track.sonic_dna, track.hotCues, hotCueSlot)
    if (hot != null) mixInSec = hot
  } else if (cuePriority === 'memory-cue') {
    const mem = Number(track.memoryCueSec)
    if (Number.isFinite(mem) && mem >= 0) mixInSec = mem
  } else if (cuePriority === 'mix-in') {
    if (labeledIn) mixInSec = labeledIn.timeSec
  } else if (cuePriority === 'drop') {
    if (labeledDrop) mixInSec = labeledDrop.timeSec
    else if (segments && Number.isFinite(segments.dropStartSec) && segments.dropStartSec! > 0) {
      mixInSec = segments.dropStartSec!
    }
  } else if (cuePriority === 'loop-in') {
    const loop = cueByRole(labeled, 'loop-in')
    if (loop) mixInSec = loop.timeSec
  } else if (canonicalPhraseCues && cuePriority === 'dna-intro') {
    if (!labeledIn) mixInSec = grid
  }

  const placedCue =
    hotCueSlot != null ||
    cuePriority === 'memory-cue' ||
    cuePriority === 'drop' ||
    cuePriority === 'loop-in' ||
    cuePriority === 'mix-in'
  mixInSec = snapToMixPhraseBoundary({
    timeSec: mixInSec,
    bpm: useBpm,
    offsetSec: grid,
    phraseBars: resolvedInBars,
    sonicDna: track.sonic_dna,
    preferEarlier: true,
    minSec: placedCue ? 0 : grid,
    maxSec:
      duration != null
        ? placedCue
          ? Math.max(grid, duration - beat)
          : Math.max(grid, duration * 0.25)
        : undefined,
    mathOnly,
    quantize: blendQuantize,
  })
  mixOutSec = snapToMixPhraseBoundary({
    timeSec: mixOutSec,
    bpm: useBpm,
    offsetSec: grid,
    phraseBars: ALIGN_PHRASE_BARS,
    // Depth uses sectionBars for idealOut; snap stays on 8-bar lines (not prior 16/24/32).
    sectionBars: ALIGN_PHRASE_BARS,
    sonicDna: track.sonic_dna,
    preferEarlier: true,
    minSec: grid,
    maxSec: duration != null ? Math.max(grid, duration - beat) : undefined,
    mathOnly,
    quantize: blendQuantize,
  })
  if (duration != null && duration - mixOutSec < alignPhraseSec * 0.45) {
    mixOutSec = snapToMixPhraseBoundary({
      timeSec: Math.max(grid, duration - Math.max(alignPhraseSec, overlapPhraseSec)),
      bpm: useBpm,
      offsetSec: grid,
      phraseBars: ALIGN_PHRASE_BARS,
      sectionBars: ALIGN_PHRASE_BARS,
      sonicDna: track.sonic_dna,
      preferEarlier: true,
      minSec: grid,
      maxSec: duration - beat,
      mathOnly,
      quantize: blendQuantize,
    })
  }

  return {
    gridOffsetSec: grid,
    mixInSec,
    mixOutSec,
    durationSec: duration,
    bpm,
    phraseBars: overlapBars,
  }
}

export function buildMixPlan(params: {
  outgoing: MixTrackRef
  incoming: MixTrackRef
  nowSec: number
  /** @deprecated use overlapBars */
  phraseBars?: PhraseBars
  overlapBars?: PhraseBars
  outPhraseBars?: OutPhraseBars
  inPhraseBars?: InPhraseBars
  cuePriority?: CuePriority
  mixLengthBias?: MixLengthBias
  energyCurve?: EnergyCurve
  harmonicMatch?: 'off' | 'camelot' | 'key-lock'
  /** Live outgoing deck tempo (ExpandedPlayerControls slider) */
  outgoingPlaybackRate?: number
  style?: MixStyle
  /**
   * Prepare-only pre-roll (cue idle / phase lock). Does NOT move startAtOutgoingSec
   * or waveform OUT markers — fire stays on the phrase boundary.
   */
  leadInSec?: number
  /** Resolved grid offsets when peaks alignment ran */
  outgoingGridOffset?: number
  incomingGridOffset?: number
  /**
   * Legacy flag. Ignored — Smooth stays Smooth. DNA may still *suggest*
   * a style via `suggestMixStyle` for UI, but it does not rewrite the plan.
   */
  autoStyle?: boolean
  /**
   * OUT = last outPhraseBars on 8-bar grid; IN = first downbeat.
   * Default true (Auto DJ). Set false to honor creative outro/intro ratios.
   */
  canonicalPhraseCues?: boolean
  /** Exact N×8 overlap (no energy/bias stretch). Default = canonical. */
  exactOverlap?: boolean
  /** Snap OUT/IN cues to phrase / bar / beat. Default phrase. */
  blendQuantize?: BlendQuantize
  /** Live BeatSync corrections. Default phase-kick. */
  beatCorrect?: BeatCorrect
}): MixPlan | null {
  const canonical = params.canonicalPhraseCues !== false
  const exactOverlap = params.exactOverlap ?? canonical
  const blendQuantize: BlendQuantize =
    params.blendQuantize === 'bar' || params.blendQuantize === 'beat'
      ? params.blendQuantize
      : 'phrase'
  const beatCorrect: BeatCorrect = params.beatCorrect ?? 'phase-kick'
  const correct = beatCorrectFlags(beatCorrect)
  const kickCueNudge = correct.kickCorrect
  const vinylBend = correct.vinylBend
  const kickCorrect = correct.kickCorrect
  const gridAlign = correct.gridAlign ?? undefined
  const overlapBars = exactOverlap
    ? normalizeDjOverlapBars(params.overlapBars ?? params.phraseBars ?? DEFAULT_PHRASE_BARS)
    : (params.overlapBars ?? params.phraseBars ?? DEFAULT_PHRASE_BARS)
  const outPhraseBars = resolveOutPhraseBars(params.outPhraseBars)
  // Doctrine: always phrase-lock incoming when canonical.
  let inPhraseBars: InPhraseBars = canonical
    ? PHRASE_CELL_BARS
    : resolveInPhraseBars(params.inPhraseBars)
  const cuePriority = params.cuePriority ?? (canonical ? 'first-downbeat' : 'dna-intro')
  const phrase1Lock = canonical && cuePriority === 'first-downbeat'
  const energyCurve = exactOverlap ? 'hold' : (params.energyCurve ?? 'hold')
  // Honest confidence: missing measured.bpmConfidence → low (not 0.7).
  const bpmConf = readPairBpmConfidence(params.outgoing.sonic_dna, params.incoming.sonic_dna)
  const phraseLock = bpmConf >= 0.45 && inPhraseBars !== 0
  if (!phraseLock && !canonical) inPhraseBars = 0
  const cueOpts = { blendQuantize, kickCueNudge }
  const outCues = deriveDeckCues(
    params.outgoing,
    overlapBars,
    outPhraseBars,
    params.outgoingGridOffset,
    'dna-intro',
    energyCurve,
    canonical,
    cueOpts,
  )
  const inCues = deriveDeckCues(
    params.incoming,
    overlapBars,
    inPhraseBars,
    params.incomingGridOffset,
    cuePriority,
    energyCurve,
    canonical,
    cueOpts,
  )
  const bpmOut = outCues.bpm || 120
  const bpmIn = inCues.bpm || bpmOut
  const beat = 60 / bpmOut
  const barSec = beat * 4
  const alignPhraseSec = barSec * outPhraseBars
  const overlapPhraseSec = barSec * overlapBars

  const duration = outCues.durationSec
  if (duration == null || duration <= 0) return null

  const mathOnly = canonical || !kickCueNudge

  // Prefer last-phrase OUT; fall back if cues invalid.
  let mixOut = outCues.mixOutSec
  if (!(mixOut >= 0 && mixOut < duration - 0.5) || canonical) {
    const idealOut = Math.max(
      outCues.gridOffsetSec,
      duration - Math.max(alignPhraseSec, overlapPhraseSec),
    )
    mixOut = snapToMixPhraseBoundary({
      timeSec: idealOut,
      bpm: bpmOut,
      offsetSec: outCues.gridOffsetSec,
      phraseBars: ALIGN_PHRASE_BARS,
      sectionBars: ALIGN_PHRASE_BARS,
      sonicDna: params.outgoing.sonic_dna,
      preferEarlier: true,
      minSec: outCues.gridOffsetSec,
      maxSec: duration - beat,
      mathOnly,
      quantize: blendQuantize,
    })
  }

  let startAt = mixOut
  if (params.nowSec > mixOut + 0.15) {
    const toBoundary = secondsToNextPhraseBoundary({
      timeSec: params.nowSec,
      bpm: bpmOut,
      offsetSec: outCues.gridOffsetSec,
      phraseBars: blendQuantize === 'beat' ? 1 / 4 : blendQuantize === 'bar' ? 1 : ALIGN_PHRASE_BARS,
      beatsPerBar: 4,
    })
    startAt = params.nowSec + toBoundary
    if (startAt > duration - 0.35) {
      startAt = Math.max(
        params.nowSec,
        duration - Math.min(alignPhraseSec, duration * 0.2),
      )
    }
  }

  startAt = snapToMixPhraseBoundary({
    timeSec: startAt,
    bpm: bpmOut,
    offsetSec: outCues.gridOffsetSec,
    phraseBars: ALIGN_PHRASE_BARS,
    sectionBars: ALIGN_PHRASE_BARS,
    sonicDna: params.outgoing.sonic_dna,
    preferEarlier: params.nowSec <= startAt,
    minSec: Math.max(outCues.gridOffsetSec, params.nowSec - 0.05),
    maxSec: duration - beat * 0.5,
    mathOnly,
    quantize: blendQuantize,
  })

  const remainingAfterStart = Math.max(0.5, duration - startAt)
  // Doctrine: exact N×8 master bars. Creative mode still allows mild energy stretch.
  let mixDurationSec: number
  if (exactOverlap) {
    mixDurationSec = Math.min(overlapPhraseSec, Math.max(beat * 2, remainingAfterStart - 0.05))
  } else {
    const energyScale = clamp(
      energyOverlapFactor(params.outgoing, params.incoming) *
        mixLengthBiasFactor(params.mixLengthBias ?? 'normal') *
        energyCurveOverlapFactor(params.energyCurve, params.outgoing, params.incoming),
      0.92,
      1.08,
    )
    mixDurationSec = clamp(
      Math.min(overlapPhraseSec * energyScale, remainingAfterStart - 0.05),
      Math.min(overlapPhraseSec * 0.85, remainingAfterStart),
      Math.min(overlapPhraseSec * 1.08, remainingAfterStart),
    )
  }

  // Lead-in is prepare-only — never shift the audible OUT / markers.
  const prepareLeadInSec = Math.max(0, params.leadInSec ?? 0)

  // Phrase-1 lock stays on the incoming grid; other cue priorities use mixInSec.
  const incomingStartSec =
    inPhraseBars === 0
      ? Math.max(0, inCues.gridOffsetSec)
      : snapToMixPhraseBoundary({
          timeSec: inCues.mixInSec,
          bpm: bpmIn,
          offsetSec: inCues.gridOffsetSec,
          phraseBars: PHRASE_CELL_BARS,
          sonicDna: params.incoming.sonic_dna,
          preferEarlier: true,
          minSec: phrase1Lock ? inCues.gridOffsetSec : 0,
          maxSec:
            inCues.durationSec != null
              ? phrase1Lock
                ? Math.max(inCues.gridOffsetSec, inCues.durationSec * 0.12)
                : Math.max(inCues.gridOffsetSec, inCues.durationSec - beat)
              : inCues.gridOffsetSec + overlapPhraseSec,
          mathOnly,
          quantize: blendQuantize,
        })

  const rateRatio = mixIncomingRateRatio({
    outgoingBpm: bpmOut,
    incomingBpm: bpmIn,
    outgoingPlaybackRate: params.outgoingPlaybackRate ?? 1,
  })

  const style = params.style ?? 'crossfade'
  const late = params.nowSec > mixOut + 0.15
  const needsOutroLoop = late && remainingAfterStart < mixDurationSec * 0.85
  const harmonicSemitones = harmonicPitchSemitones(
    params.outgoing.sonic_dna,
    params.incoming.sonic_dna,
    params.harmonicMatch,
  )

  return {
    outgoingTrackId: params.outgoing.id,
    incomingTrackId: params.incoming.id,
    startAtOutgoingSec: startAt,
    mixOutMarkerSec: startAt,
    incomingStartSec,
    resolvedIncomingSec: incomingStartSec,
    mixDurationSec,
    rateRatio,
    style,
    curve: style === 'cut' ? 'cut' : 'equal-power',
    outPhraseBars,
    inPhraseBars,
    overlapBars,
    phraseBars: overlapBars,
    dnaConfidence: bpmConf,
    phraseLock,
    needsOutroLoop,
    echoSend: false,
    harmonicSemitones,
    holdBeatmatch: true,
    vinylBend,
    kickCorrect,
    gridAlign,
    blendQuantize,
    prepareLeadInSec,
    masterTempoHandoff: canonical,
    phrase1Lock,
    blendFromOut: canonical,
    exactOverlap,
    reason:
      (params.nowSec <= mixOut
        ? `OUT @ ${startAt.toFixed(1)}s · ${outPhraseBars}-bar · ${overlapBars}-bar blend · IN phrase 1`
        : `Late entry · ${outPhraseBars}-bar snap · ${overlapBars}-bar blend · IN phrase 1`) +
      (needsOutroLoop ? ' · 8-bar loop' : '') +
      (phraseLock ? '' : ' · BPM?') +
      (bpmConf < 0.5 ? ' · DNA?' : '') +
      (blendQuantize !== 'phrase' ? ` · q=${blendQuantize}` : '') +
      (beatCorrect !== 'phase-kick' ? ` · correct=${beatCorrect}` : ''),
  }
}

/**
 * Snap Auto DJ OUT/IN markers onto the same beatgrid the waveform paints
 * (offset + n×8-bar for OUT; end on bar or phrase grid for IN).
 */
export function alignMixOverlayToBeatGrid(params: {
  mixOutSec: number
  mixDurationSec: number
  bpm: number
  offsetSec: number
  /** Prefer exact overlap bar count when snapping the IN (mix-end) marker */
  overlapBars?: number
}): {
  mixOutSec: number
  mixStartSec: number
  mixEndSec: number
  mixDurationSec: number
} {
  const bpm = params.bpm > 0 ? params.bpm : 120
  const offset = Number.isFinite(params.offsetSec) ? Math.max(0, params.offsetSec) : 0
  const beat = 60 / bpm
  const barSec = beat * 4

  const mixOutSec = snapToNearestPhraseBoundary({
    timeSec: params.mixOutSec,
    bpm,
    offsetSec: offset,
    phraseBars: ALIGN_PHRASE_BARS,
    preferEarlier: true,
    minSec: offset,
  })

  const overlapBars =
    typeof params.overlapBars === 'number' && params.overlapBars > 0
      ? params.overlapBars
      : Math.max(2, Math.round(params.mixDurationSec / barSec) || 8)

  const rawEnd = mixOutSec + overlapBars * barSec
  // 8/16/32 → land on phrase lines; 2/4 → land on bar lines (thin grid).
  const endSnapBars = overlapBars % ALIGN_PHRASE_BARS === 0 ? ALIGN_PHRASE_BARS : 1
  let mixEndSec = snapToNearestPhraseBoundary({
    timeSec: rawEnd,
    bpm,
    offsetSec: offset,
    phraseBars: endSnapBars,
    preferEarlier: false,
    minSec: mixOutSec + beat,
  })
  if (mixEndSec <= mixOutSec + beat * 0.5) {
    mixEndSec = mixOutSec + Math.max(barSec * 2, overlapBars * barSec)
  }

  return {
    mixOutSec,
    mixStartSec: mixOutSec,
    mixEndSec,
    mixDurationSec: Math.max(beat, mixEndSec - mixOutSec),
  }
}

// Re-export curve helpers for callers / tests that imported from plan-from-dna
export {
  equalPowerGains,
  smootherstep,
  styleMixGains,
  applySoftTail,
} from './curves'
