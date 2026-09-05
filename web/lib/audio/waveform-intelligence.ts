/**
 * Sonic DNA + unified intelligence → waveform tape remesure.
 *
 * DSP envelopes give local Low/Mid/High. Color modes were reading those
 * (plus a weak track-level bias) and mis-painting kicks/hats/vocals.
 * This module remesures each timed sample from phrase grids, onsets,
 * spectral mix, instrument usage, drum family, and listener heuristics.
 */

import { BARS_PER_PHRASE, STEPS_PER_BAR } from '@/lib/audio/beat-grid'
import { ensurePhraseSteps, expandBarStepsToPhrase } from '@/lib/audio/sonic-dna-mix'
import { extractMeasured, parseSonicDna } from '@/lib/audio/sonic-dna-quality'

type WaveformBands = { low: number; mid: number; high: number }
type WaveformElementType = 'kick' | 'snare' | 'clap' | 'hihat' | 'other'

export type WaveformSpectralRelative = {
  sub: number
  kick: number
  bass: number
  lowMid: number
  mid: number
  presence: number
  air: number
}

export type WaveformIntelligenceProfile = {
  spectralBias: {
    bass: number
    synths: number
    vocals: number
    kicks: number
    hats: number
    percussion: number
  }
  spectralRelative: WaveformSpectralRelative
  bpm: number | null
  effectiveBpm: number | null
  timingFeel: string | null
  drumFamily: string | null
  genreFamily: string | null
  genrePrimary: string | null
  kickSteps: number[]
  snareSteps: number[]
  clapSteps: number[]
  hatSteps: number[]
  kickPhraseSteps: number[]
  snarePhraseSteps: number[]
  clapPhraseSteps: number[]
  hatPhraseSteps: number[]
  kickOnsetSec: number[]
  snareClapOnsetSec: number[]
  stepsPerBar: number
  phraseBars: number
  swingPercent: number | null
  gridOffsetSec: number
  fourRatio: number | null
  centroidHz: number | null
  crest: number | null
  energy01: number
  danceability01: number
  hasVocals: boolean
  hasSynths: boolean
  hasBass: boolean
  hasHats: boolean
  bassLock: string | null
  kickRole: string | null
  snareRole: string | null
  hatGrid: string | null
}

type TapeSampleLike = {
  timeSec: number
  positive: number
  negative: number
  rms?: number
  bands?: WaveformBands
  elementType?: WaveformElementType
  elementConfidence?: number
  color: string
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

function numArr(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  const out: number[] = []
  for (const raw of value) {
    const n = Number(raw)
    if (Number.isFinite(n)) out.push(n)
  }
  return out
}

function sortedUnique(values: number[]): number[] {
  return [...new Set(values.filter((n) => Number.isFinite(n)))].sort((a, b) => a - b)
}

/** Map 1–10 heuristics (or 0–1) into a unit interval. */
function unitHeuristic(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return 0
  if (n > 1.5) return clamp01(n / 10)
  return clamp01(n)
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {}
}

function fingerprintSteps(steps: number[], take = 10): string {
  if (!steps.length) return '-'
  return steps.slice(0, take).join('.')
}

export function profileFromSonicDna(sonicDna: unknown): WaveformIntelligenceProfile | null {
  const measured = extractMeasured(sonicDna)
  if (!measured) return null

  const root = asRecord(parseSonicDna(sonicDna) || sonicDna)
  const intel = asRecord(measured.intelligence)
  const technical = asRecord(intel.technical || root.technical)
  const spectral = asRecord(measured.spectral)
  const relRaw = asRecord(spectral.relative || spectral.bands)
  const loudness = asRecord((measured as { loudness?: unknown }).loudness)
  const percussion = asRecord(measured.percussion)
  const genre = asRecord(measured.genre || root.genres)

  const stepsPerBar =
    measured.stepsPerBar && measured.stepsPerBar > 0 ? measured.stepsPerBar : STEPS_PER_BAR
  const phraseBars = measured.phraseBars && measured.phraseBars > 0 ? measured.phraseBars : BARS_PER_PHRASE
  const ensured = ensurePhraseSteps(measured)

  const clapPhrase = numArr(measured.clapPhraseSteps)
  const clapFromBar = expandBarStepsToPhrase(measured.clapSteps, phraseBars, stepsPerBar)
  const snareBodyPhrase = expandBarStepsToPhrase(
    (measured as { snareBodySteps?: number[] }).snareBodySteps,
    phraseBars,
    stepsPerBar,
  )
  const hatPhrase = numArr(measured.hatPhraseSteps)
  const hatFromBar = expandBarStepsToPhrase(measured.hatSteps, phraseBars, stepsPerBar)

  const entries = measured.instrumentUsage?.entries ?? []
  const instruments = measured.instruments ?? []
  const usageText = `${entries.map((e) => `${e.category} ${e.type}`).join(' ')} ${instruments
    .map((i) => `${i.id} ${i.label} ${i.role || ''}`)
    .join(' ')}`.toLowerCase()

  const hasVocals =
    entries.some((e) => e.category === 'vocals') ||
    instruments.some((i) => /vocal|voice|choir/i.test(`${i.id} ${i.label} ${i.role || ''}`))
  const hasShaker = entries.some((e) => /shaker|hat|conga|perc/i.test(e.type))
  const hasSynths =
    entries.some((e) => e.category === 'synth' || e.category === 'keys') ||
    instruments.some((i) => /synth|pad|lead|keys|organ/i.test(`${i.id} ${i.label}`))
  const hasBass =
    Boolean(measured.instrumentUsage?.bass) ||
    entries.some((e) => e.category === 'bass') ||
    instruments.some((i) => /bass|808|sub/i.test(`${i.id} ${i.label}`))
  const hasHats =
    hasShaker ||
    entries.some((e) => /hat|cymbal/i.test(e.type)) ||
    instruments.some((i) => /hat|cymbal/i.test(`${i.id} ${i.label}`)) ||
    /hat/.test(usageText)

  const rel: WaveformSpectralRelative = {
    sub: clamp01(Number(relRaw.sub) || 0),
    kick: clamp01(Number(relRaw.kick) || 0),
    bass: clamp01(Number(relRaw.bass) || 0),
    lowMid: clamp01(Number(relRaw.lowMid) || 0),
    mid: clamp01(Number(relRaw.mid) || 0),
    presence: clamp01(Number(relRaw.presence) || 0),
    air: clamp01(Number(relRaw.air) || 0),
  }

  const energy01 = unitHeuristic(
    technical.energyLevel ?? root.energy_level ?? intel.emotional?.energy,
  )
  const danceability01 = unitHeuristic(
    technical.danceability ?? root.danceability ?? intel.technical?.danceability,
  )

  const centroidRaw = Number(spectral.centroidHz)
  const crestRaw = Number(loudness.crest)
  const fourRaw = Number(measured.fourRatio ?? percussion.fourRatio)
  const gridRaw = Number(measured.gridOffsetSec)
  const swingRaw =
    typeof measured.swingPercent === 'number'
      ? measured.swingPercent
      : typeof percussion.swingPercent === 'number'
        ? percussion.swingPercent
        : null

  const genreFamily = String(genre.family || genre.primaryFamily || '').trim() || null
  const genrePrimary = String(
    genre.primary || (Array.isArray(root.genres?.primaryGenres) ? root.genres.primaryGenres[0] : '') || '',
  ).trim() || null

  return {
    spectralBias: {
      bass: Math.min(0.5, (rel.sub + rel.bass) * 0.8),
      synths: Math.min(0.5, (rel.mid + rel.lowMid * 0.5) * 0.6 + (hasSynths ? 0.15 : 0)),
      vocals: hasVocals ? 0.35 : Math.min(0.2, rel.presence * 0.4),
      kicks: Math.min(0.4, rel.kick * 1.2),
      hats: Math.min(0.4, rel.air * 1.1 + (hasHats ? 0.15 : 0)),
      percussion: Math.min(0.35, rel.lowMid * 0.5 + (hasShaker ? 0.1 : 0)),
    },
    spectralRelative: rel,
    bpm: typeof measured.bpm === 'number' && measured.bpm > 0 ? measured.bpm : null,
    effectiveBpm:
      typeof measured.effectiveBpm === 'number' && measured.effectiveBpm > 0
        ? measured.effectiveBpm
        : null,
    timingFeel: measured.timingFeel ? String(measured.timingFeel) : null,
    drumFamily: measured.drumFamily ? String(measured.drumFamily) : null,
    genreFamily,
    genrePrimary,
    kickSteps: numArr(measured.kickSteps),
    snareSteps: numArr(measured.snareSteps),
    clapSteps: numArr(measured.clapSteps),
    hatSteps: numArr(measured.hatSteps),
    kickPhraseSteps: numArr(ensured.kickPhraseSteps),
    snarePhraseSteps: snareBodyPhrase.length
      ? snareBodyPhrase
      : numArr(measured.snarePhraseSteps).length
        ? numArr(measured.snarePhraseSteps)
        : numArr(ensured.snarePhraseSteps),
    clapPhraseSteps: clapPhrase.length ? clapPhrase : clapFromBar,
    hatPhraseSteps: hatPhrase.length ? hatPhrase : hatFromBar,
    kickOnsetSec: sortedUnique(numArr(measured.kickOnsetSec)),
    snareClapOnsetSec: sortedUnique(numArr(measured.snareClapOnsetSec)),
    stepsPerBar: ensured.stepsPerBar || stepsPerBar,
    phraseBars: ensured.phraseBars || phraseBars,
    swingPercent: typeof swingRaw === 'number' && Number.isFinite(swingRaw) ? swingRaw : null,
    gridOffsetSec: Number.isFinite(gridRaw) && gridRaw >= 0 ? gridRaw : 0,
    fourRatio: Number.isFinite(fourRaw) ? fourRaw : null,
    centroidHz: Number.isFinite(centroidRaw) && centroidRaw > 0 ? centroidRaw : null,
    crest: Number.isFinite(crestRaw) && crestRaw > 0 ? crestRaw : null,
    energy01,
    danceability01,
    hasVocals,
    hasSynths,
    hasBass,
    hasHats,
    bassLock: measured.bass?.lock ? String(measured.bass.lock) : null,
    kickRole: percussion.kickRole ? String(percussion.kickRole) : null,
    snareRole: percussion.snareRole ? String(percussion.snareRole) : null,
    hatGrid: percussion.hatGrid ? String(percussion.hatGrid) : null,
  }
}

/** Overlay the live beat-grid phase / BPM used by the tape stage. */
export function withLivePlaybackGrid(
  profile: WaveformIntelligenceProfile | null | undefined,
  gridOffsetSec?: number | null,
  bpm?: number | null,
): WaveformIntelligenceProfile | null {
  if (!profile) return null
  const next = { ...profile }
  if (typeof gridOffsetSec === 'number' && Number.isFinite(gridOffsetSec) && gridOffsetSec >= 0) {
    next.gridOffsetSec = gridOffsetSec
  }
  if (typeof bpm === 'number' && Number.isFinite(bpm) && bpm > 0) {
    next.bpm = bpm
  }
  return next
}

/** Stable cache key fragment for tape rebuild when DNA / grid changes. */
export function profileCacheKey(profile: WaveformIntelligenceProfile | null | undefined): string {
  if (!profile) return 'none'
  const b = profile.spectralBias
  const r = profile.spectralRelative
  return [
    b.bass.toFixed(2),
    b.synths.toFixed(2),
    b.vocals.toFixed(2),
    b.kicks.toFixed(2),
    b.hats.toFixed(2),
    b.percussion.toFixed(2),
    r.kick.toFixed(2),
    r.air.toFixed(2),
    fingerprintSteps(profile.kickPhraseSteps),
    fingerprintSteps(profile.snarePhraseSteps),
    fingerprintSteps(profile.clapPhraseSteps),
    fingerprintSteps(profile.hatPhraseSteps),
    String(profile.phraseBars),
    String(profile.drumFamily || ''),
    profile.gridOffsetSec.toFixed(3),
    String(profile.hasVocals ? 1 : 0),
    String(profile.hasSynths ? 1 : 0),
    profile.energy01.toFixed(2),
  ].join(':')
}

export function phraseStepAtTime(
  timeSec: number,
  profile: WaveformIntelligenceProfile,
): number | null {
  const bpm = profile.effectiveBpm || profile.bpm
  if (!bpm || bpm <= 0 || !Number.isFinite(timeSec)) return null
  const beatSec = 60 / bpm
  const stepsPerBar = profile.stepsPerBar || STEPS_PER_BAR
  const phraseBars = profile.phraseBars || BARS_PER_PHRASE
  const stepSec = (beatSec * 4) / Math.max(1, stepsPerBar)
  const phraseLen = stepsPerBar * phraseBars
  const t = timeSec - (profile.gridOffsetSec || 0)
  const swing = clamp01((profile.swingPercent ?? 0) / 100) * 0.45
  let step: number
  if (swing > 0.02) {
    const pair = stepSec * 2
    const cycle = Math.floor(t / pair)
    const into = t - cycle * pair
    const oddDelay = swing * stepSec
    step = into < stepSec + oddDelay * 0.5 ? cycle * 2 : cycle * 2 + 1
  } else {
    step = Math.round(t / stepSec)
  }
  return ((step % phraseLen) + phraseLen) % phraseLen
}

function stampOnsetProximity(
  timed: Array<{ timeSec: number }>,
  onsets: number[],
  windowSec = 0.048,
): Float32Array {
  const out = new Float32Array(timed.length)
  if (!timed.length || !onsets.length || windowSec <= 0) return out
  let j = 0
  for (let i = 0; i < timed.length; i++) {
    const t = timed[i]!.timeSec
    while (j < onsets.length && onsets[j]! < t - windowSec) j++
    let best = 0
    for (let k = j; k < onsets.length; k++) {
      const onset = onsets[k]!
      if (onset > t + windowSec) break
      const score = 1 - Math.abs(onset - t) / windowSec
      if (score > best) best = score
    }
    out[i] = best
  }
  return out
}

function familyKickMul(family: string | null): number {
  switch (String(family || '').toLowerCase()) {
    case 'four-on-the-floor':
      return 1.28
    case 'dembow':
      return 1.18
    case 'one-drop':
      return 0.9
    case 'breakbeat':
      return 0.96
    case 'boom-bap':
      return 0.9
    case 'half-time':
      return 0.86
    case 'sparse':
      return 0.72
    default:
      return 1
  }
}

function familySnareMul(family: string | null): number {
  switch (String(family || '').toLowerCase()) {
    case 'breakbeat':
      return 1.22
    case 'boom-bap':
      return 1.28
    case 'half-time':
      return 1.2
    case 'dembow':
      return 1.12
    case 'four-on-the-floor':
      return 0.88
    case 'sparse':
      return 0.8
    default:
      return 1
  }
}

function localBands(sample: TapeSampleLike): WaveformBands {
  const peak = Math.max(sample.positive ?? 0, sample.negative ?? 0)
  const bands = sample.bands
  if (bands) {
    return {
      low: clamp01(bands.low),
      mid: clamp01(bands.mid),
      high: clamp01(bands.high),
    }
  }
  return { low: peak * 0.55, mid: peak * 0.4, high: peak * 0.3 }
}

function shapeBandsForElement(
  bands: WaveformBands,
  type: WaveformElementType,
  confidence: number,
  profile: WaveformIntelligenceProfile,
): WaveformBands {
  const amp = Math.max(bands.low, bands.mid, bands.high, 1e-6)
  const c = clamp01(confidence)
  const blend = 0.48 + c * 0.52
  let next = { ...bands }
  if (type === 'kick') {
    next = {
      low: Math.max(bands.low, amp) * (0.85 + c * 0.25),
      mid: bands.mid * (0.28 + (1 - c) * 0.35),
      high: bands.high * (0.12 + (1 - c) * 0.2),
    }
  } else if (type === 'snare') {
    next = {
      low: bands.low * 0.32,
      mid: Math.max(bands.mid, amp * 0.9),
      high: Math.max(bands.high * 0.55, amp * 0.35),
    }
  } else if (type === 'clap') {
    next = {
      low: bands.low * 0.18,
      mid: Math.max(bands.mid * 0.75, amp * 0.55),
      high: Math.max(bands.high, amp * 0.8),
    }
  } else if (type === 'hihat') {
    next = {
      low: bands.low * 0.08,
      mid: bands.mid * 0.28,
      high: Math.max(bands.high, amp),
    }
  } else {
    const rel = profile.spectralRelative
    const priorLow = rel.sub + rel.kick + rel.bass
    const priorMid = rel.lowMid + rel.mid + (profile.hasSynths ? 0.08 : 0) + (profile.hasVocals ? 0.06 : 0)
    const priorHigh = rel.presence + rel.air
    const sum = priorLow + priorMid + priorHigh || 1
    next = {
      low: bands.low * 0.72 + (priorLow / sum) * amp * 0.28,
      mid: bands.mid * 0.72 + (priorMid / sum) * amp * 0.28,
      high: bands.high * 0.72 + (priorHigh / sum) * amp * 0.28,
    }
  }

  return {
    low: bands.low * (1 - blend) + next.low * blend,
    mid: bands.mid * (1 - blend) + next.mid * blend,
    high: bands.high * (1 - blend) + next.high * blend,
  }
}

/** Mild track-level DNA mix so energy mode keeps MiniMeters L/M/H but follows the cut. */
export function dnaTintBands(
  bands: WaveformBands,
  profile?: WaveformIntelligenceProfile | null,
): WaveformBands {
  if (!profile) return bands
  const rel = profile.spectralRelative
  const priorLow = rel.sub + rel.kick + rel.bass
  const priorMid = rel.lowMid + rel.mid
  const priorHigh = rel.presence + rel.air
  const priorSum = priorLow + priorMid + priorHigh
  const energy = bands.low + bands.mid + bands.high
  let low = bands.low
  let mid = bands.mid
  let high = bands.high
  if (priorSum > 0.05 && energy > 1e-6) {
    const w = 0.14
    low = bands.low * (1 - w) + (priorLow / priorSum) * energy * w
    mid = bands.mid * (1 - w) + (priorMid / priorSum) * energy * w
    high = bands.high * (1 - w) + (priorHigh / priorSum) * energy * w
  }
  const family = String(profile.drumFamily || '').toLowerCase()
  if (family === 'four-on-the-floor' || family === 'dembow') {
    low *= 1.08
  } else if (family === 'breakbeat' || family === 'boom-bap') {
    mid *= 1.08
  } else if (family === 'sparse') {
    mid *= 1.06
    high *= 1.04
  }
  if (profile.centroidHz && profile.centroidHz > 4500) high *= 1.06
  if (profile.centroidHz && profile.centroidHz < 1800) low *= 1.05
  return { low: clamp01(low), mid: clamp01(mid), high: clamp01(high) }
}

/**
 * Remesure a densified tape: stamp element labels + DNA-shaped bands per sample.
 * Color resolvers and layered paint then read the remesured fields.
 */
export function remesureTimedSamples<T extends TapeSampleLike>(
  timed: T[],
  profile?: WaveformIntelligenceProfile | null,
): Array<T & { elementType: WaveformElementType; elementConfidence: number; bands: WaveformBands }> {
  if (!timed.length || !profile) {
    return timed as Array<
      T & { elementType: WaveformElementType; elementConfidence: number; bands: WaveformBands }
    >
  }

  const kickSet = new Set(profile.kickPhraseSteps)
  const snareSet = new Set(profile.snarePhraseSteps)
  const clapSet = new Set(profile.clapPhraseSteps)
  const hatSet = new Set(profile.hatPhraseSteps)
  const kickOnsets = stampOnsetProximity(timed, profile.kickOnsetSec)
  const snareOnsets = stampOnsetProximity(timed, profile.snareClapOnsetSec)
  const kickMul = familyKickMul(profile.drumFamily)
  const snareMul = familySnareMul(profile.drumFamily)
  const rel = profile.spectralRelative
  const hatMul = profile.hasHats ? 1.12 : 0.85
  const fof = profile.fourRatio != null && profile.fourRatio >= 0.62

  return timed.map((sample, i) => {
    const bands = localBands(sample)
    const peak = Math.max(sample.positive ?? 0, sample.negative ?? 0, 1e-6)
    const rms = sample.rms ?? peak * 0.7
    const crest = peak / Math.max(1e-4, rms)
    const step = phraseStepAtTime(sample.timeSec, profile)
    const onKick = step != null && kickSet.has(step)
    const onSnare = step != null && snareSet.has(step)
    const onClap = step != null && clapSet.has(step)
    const onHat = step != null && hatSet.has(step)

    const kickScore =
      ((onKick ? 0.58 : 0) + kickOnsets[i]! * 0.62 + bands.low * (0.32 + rel.kick) + (crest > 1.55 ? 0.08 : 0)) *
      kickMul *
      (fof ? 1.08 : 1)
    const snareScore =
      ((onSnare ? 0.52 : 0) + snareOnsets[i]! * 0.42 + bands.mid * (0.28 + rel.mid + rel.lowMid)) * snareMul
    const clapScore =
      (onClap ? 0.56 : 0) + snareOnsets[i]! * 0.28 + bands.high * 0.22 + bands.mid * 0.18
    const hatScore =
      ((onHat ? 0.5 : 0) + bands.high * (0.38 + rel.air) + (crest > 1.7 ? 0.1 : 0)) * hatMul

    let type: WaveformElementType = 'other'
    let confidence = 0
    const ranked: Array<[WaveformElementType, number]> = [
      ['kick', kickScore],
      ['snare', snareScore],
      ['clap', clapScore],
      ['hihat', hatScore],
    ]
    ranked.sort((a, b) => b[1] - a[1])
    const [bestType, bestScore] = ranked[0]!
    const second = ranked[1]![1]
    if (bestScore >= 0.34 && bestScore >= second * 0.92) {
      type = bestType
      confidence = clamp01((bestScore - 0.22) / 0.9)
    }

    const shaped = shapeBandsForElement(bands, type, confidence, profile)
    return {
      ...sample,
      bands: shaped,
      elementType: type,
      elementConfidence: confidence,
    }
  })
}
