/**
 * Shared Sonic DNA → mix / grid / AutoDJ helpers.
 * Pocket model: 16 steps/bar × 8-bar phrase (same as beat-grid + measure_sonic_dna).
 */

import {
  BARS_PER_PHRASE,
  STEPS_PER_BAR,
  STEPS_PER_PHRASE,
  beatPeriodSec,
} from '@/lib/audio/beat-grid'

/** 16-bar section markers on the painted waveform grid. */
const BARS_PER_SECTION = BARS_PER_PHRASE * 2
import { extractMeasured, type SonicDnaMeasured } from '@/lib/audio/sonic-dna-quality'
import { displayTrackBpm } from '@/lib/audio/track-display'
import { readCatalogOverrides } from '@/lib/catalog-lock'
import { KEY_TRANSITIONS, getCompatibleKeys } from '@/types/sergik-data'

export type DnaMixTrack = {
  id?: string
  bpm?: number | null
  key_signature?: string | null
  energy_level?: number | null
  danceability?: number | null
  genre?: string | null
  sonic_dna?: unknown
  beat_grid_offset?: number | null
  metadata?: Record<string, unknown> | null
}

export type MixingRecommendations = {
  bpmRange?: { min: number; max: number }
  compatibleKeys?: string[]
  mixableGenres?: string[]
  pocketFamilies?: string[]
  source: 'stored' | 'derived'
}

export type DnaCompatibilityBreakdown = {
  total: number
  bpm: number
  key: number
  pocket: number
  energy: number
}

function uniqSortedSteps(steps: number[], modulus: number): number[] {
  const seen = new Set<number>()
  const out: number[] = []
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

/** Merge snare + clap percussion steps (clap often carries the backbeat pocket). */
export function mergeSnareClapSteps(
  snare: number[] | undefined | null,
  clap: number[] | undefined | null,
  modulus: number
): number[] {
  const merged = [...(Array.isArray(snare) ? snare : []), ...(Array.isArray(clap) ? clap : [])]
  return merged.length ? uniqSortedSteps(merged, modulus) : []
}

/** Expand bar-local steps (0–15) across an 8-bar phrase when DSP phrase steps are missing. */
export function expandBarStepsToPhrase(
  steps: number[] | undefined | null,
  phraseBars = BARS_PER_PHRASE,
  stepsPerBar = STEPS_PER_BAR
): number[] {
  const bar = Array.isArray(steps)
    ? steps
        .map((s) => Math.round(Number(s)))
        .filter((s) => Number.isFinite(s))
        .map((s) => ((s % stepsPerBar) + stepsPerBar) % stepsPerBar)
    : []
  if (!bar.length) return []
  const out: number[] = []
  const seen = new Set<number>()
  for (let b = 0; b < phraseBars; b++) {
    for (const s of bar) {
      const i = b * stepsPerBar + s
      if (seen.has(i)) continue
      seen.add(i)
      out.push(i)
    }
  }
  return out
}

/** Ensure measured DNA has phrase-grid steps (synthetic tile if DSP hasn't written them yet). */
export function ensurePhraseSteps(measured: SonicDnaMeasured): SonicDnaMeasured {
  const stepsPerBar = measured.stepsPerBar && measured.stepsPerBar > 0 ? measured.stepsPerBar : STEPS_PER_BAR
  const phraseBars = measured.phraseBars && measured.phraseBars > 0 ? measured.phraseBars : BARS_PER_PHRASE
  const next: SonicDnaMeasured = {
    ...measured,
    stepsPerBar,
    phraseBars,
  }
  if (!next.kickPhraseSteps?.length && next.kickSteps?.length) {
    next.kickPhraseSteps = expandBarStepsToPhrase(next.kickSteps, phraseBars, stepsPerBar)
  }
  const mergedSnareBar = mergeSnareClapSteps(next.snareSteps, next.clapSteps, stepsPerBar)
  if (mergedSnareBar.length) {
    next.snareSteps = mergedSnareBar
  }
  if (!next.snarePhraseSteps?.length && next.snareSteps?.length) {
    next.snarePhraseSteps = expandBarStepsToPhrase(next.snareSteps, phraseBars, stepsPerBar)
  } else if (next.snarePhraseSteps?.length && next.clapPhraseSteps?.length) {
    next.snarePhraseSteps = mergeSnareClapSteps(
      next.snarePhraseSteps,
      next.clapPhraseSteps,
      stepsPerBar * phraseBars
    )
  } else if (!next.snarePhraseSteps?.length && next.clapPhraseSteps?.length) {
    next.snarePhraseSteps = mergeSnareClapSteps([], next.clapPhraseSteps, stepsPerBar * phraseBars)
  } else if (!next.snarePhraseSteps?.length && next.clapSteps?.length) {
    next.snarePhraseSteps = expandBarStepsToPhrase(next.clapSteps, phraseBars, stepsPerBar)
  }
  if (!next.hatPhraseSteps?.length && next.hatSteps?.length) {
    next.hatPhraseSteps = expandBarStepsToPhrase(next.hatSteps, phraseBars, stepsPerBar)
  }
  return ensureKickOnsetSec(next)
}

/**
 * Backfill kickOnsetSec from phrase/bar steps when DSP hasn't written absolute times yet.
 * Uses measured.gridOffsetSec / window.startSec as the timeline origin.
 */
export function ensureKickOnsetSec(measured: SonicDnaMeasured): SonicDnaMeasured {
  if (Array.isArray(measured.kickOnsetSec) && measured.kickOnsetSec.length >= 4) {
    return measured
  }
  const bpm = Number(measured.bpm)
  if (!(bpm > 0)) return measured
  const stepsPerBar =
    measured.stepsPerBar && measured.stepsPerBar > 0 ? measured.stepsPerBar : STEPS_PER_BAR
  const phraseBars =
    measured.phraseBars && measured.phraseBars > 0 ? measured.phraseBars : BARS_PER_PHRASE
  const offset =
    typeof measured.gridOffsetSec === 'number' && Number.isFinite(measured.gridOffsetSec)
      ? measured.gridOffsetSec
      : typeof measured.window?.startSec === 'number'
        ? measured.window.startSec
        : 0
  const end =
    typeof measured.window?.endSec === 'number' && measured.window.endSec > offset
      ? measured.window.endSec
      : offset + (60 / bpm) * 4 * phraseBars * 2
  const phraseSteps =
    measured.kickPhraseSteps?.length
      ? measured.kickPhraseSteps
      : measured.kickSteps?.length
        ? expandBarStepsToPhrase(measured.kickSteps, phraseBars, stepsPerBar)
        : []
  if (!phraseSteps.length) return measured
  const beat = 60 / bpm
  const stepSec = (beat * 4) / stepsPerBar
  const phraseSec = beat * 4 * phraseBars
  const out: number[] = []
  const nPhrases = Math.max(1, Math.ceil((Math.max(end, offset + 1) - offset) / phraseSec) + 1)
  for (let p = 0; p < nPhrases; p++) {
    for (const s of phraseSteps) {
      if (!Number.isFinite(s) || s < 0) continue
      const t = offset + p * phraseSec + s * stepSec
      if (t >= 0 && t <= end + 0.25) out.push(Number(t.toFixed(4)))
    }
  }
  const unique = [...new Set(out)].sort((a, b) => a - b)
  if (unique.length < 4) return measured
  return {
    ...measured,
    kickOnsetSec: unique,
    gridOffsetSec: measured.gridOffsetSec ?? offset,
  }
}

/** Admin-locked BPM from Settings overrides — not a stale catalog integer. */
function readLockedCatalogBpm(track: DnaMixTrack | unknown): number | null {
  if (!track || typeof track !== 'object' || Array.isArray(track)) return null
  const raw = readCatalogOverrides((track as DnaMixTrack).metadata)?.bpm
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Felt pulse for grids / AutoDJ.
 * Admin catalog_overrides.bpm wins. Otherwise measured BPM wins when catalog
 * is more than ~1% off (e.g. Para Papa 125 vs 123.05). Nearby rounding stays catalog.
 */
export function resolvePlaybackBpm(
  trackOrDna: DnaMixTrack | unknown,
  uiBpm?: number | null
): number | null {
  const isTrack =
    trackOrDna && typeof trackOrDna === 'object' && !Array.isArray(trackOrDna)
  const sonic =
    isTrack && 'sonic_dna' in (trackOrDna as object)
      ? (trackOrDna as DnaMixTrack).sonic_dna
      : trackOrDna
  const catalogBpm =
    isTrack && 'bpm' in (trackOrDna as object)
      ? Number((trackOrDna as DnaMixTrack).bpm)
      : NaN
  const measured = extractMeasured(sonic)
  const ui = typeof uiBpm === 'number' && uiBpm > 0 ? uiBpm : null
  const locked = isTrack ? readLockedCatalogBpm(trackOrDna) : null
  const cat =
    locked ||
    (Number.isFinite(catalogBpm) && catalogBpm > 0 ? catalogBpm : null) ||
    (isTrack ? displayTrackBpm(trackOrDna as DnaMixTrack) : null)

  if (measured) {
    const feel = String(measured.timingFeel || '').toLowerCase()
    const dnaBpm = typeof measured.bpm === 'number' && measured.bpm > 0 ? measured.bpm : null
    const effective =
      typeof measured.effectiveBpm === 'number' && measured.effectiveBpm > 0
        ? measured.effectiveBpm
        : null

    if (feel.includes('half') && effective && dnaBpm && Math.abs(effective - dnaBpm) / dnaBpm >= 0.35) {
      return effective
    }
    if (locked) return locked
    const conf = typeof measured.bpmConfidence === 'number' ? measured.bpmConfidence : 0.55
    if (dnaBpm && conf >= 0.45) {
      if (cat && Math.abs(cat - dnaBpm) / dnaBpm <= 0.01) return cat
      return dnaBpm
    }
    if (cat) return cat
    if (ui) return ui
    if (effective) return effective
  }

  return cat || ui || null
}

function jaccard(a: number[], b: number[]): number {
  if (!a.length && !b.length) return 0.5
  if (!a.length || !b.length) return 0
  const A = new Set(a)
  const B = new Set(b)
  let inter = 0
  for (const x of A) if (B.has(x)) inter++
  const uni = A.size + B.size - inter
  return uni > 0 ? inter / uni : 0
}

function normalizeCamelot(raw: string | null | undefined): string | null {
  if (!raw) return null
  const s = String(raw).trim().toUpperCase()
  if (/^\d{1,2}[AB]$/.test(s)) return s
  // "6A" sometimes stored with spaces
  const m = s.match(/(\d{1,2})\s*([AB])/)
  return m ? `${Number(m[1])}${m[2]}` : null
}

function camelotOf(track: DnaMixTrack): string | null {
  const measured = extractMeasured(track.sonic_dna)
  return (
    normalizeCamelot(measured?.camelot) ||
    normalizeCamelot(track.key_signature) ||
    null
  )
}

function pocketOf(track: DnaMixTrack): {
  family: string | null
  kick: number[]
  snare: number[]
  fourRatio: number | null
  swing: number | null
} {
  const measured = extractMeasured(track.sonic_dna)
  if (!measured) {
    return { family: null, kick: [], snare: [], fourRatio: null, swing: null }
  }
  const ensured = ensurePhraseSteps(measured)
  return {
    family: measured.drumFamily ? String(measured.drumFamily) : null,
    kick: ensured.kickPhraseSteps?.length
      ? ensured.kickPhraseSteps
      : expandBarStepsToPhrase(measured.kickSteps),
    snare: ensured.snarePhraseSteps?.length
      ? ensured.snarePhraseSteps
      : expandBarStepsToPhrase(measured.snareSteps),
    fourRatio: typeof measured.fourRatio === 'number' ? measured.fourRatio : null,
    swing: typeof measured.swingPercent === 'number' ? measured.swingPercent : null,
  }
}

/** Score how well `candidate` mixes after `current` (0–1). */
export function scoreDnaCompatibility(
  current: DnaMixTrack,
  candidate: DnaMixTrack
): DnaCompatibilityBreakdown {
  const curBpm = resolvePlaybackBpm(current)
  const candBpm = resolvePlaybackBpm(candidate)
  let bpm = 0
  if (curBpm && candBpm) {
    const diff = Math.abs(curBpm - candBpm)
    bpm = Math.max(0, 1 - diff / 15) * 0.35
  }

  const curKey = camelotOf(current)
  const candKey = camelotOf(candidate)
  let key = 0
  if (curKey && candKey) {
    if (curKey === candKey) key = 0.25
    else if (KEY_TRANSITIONS[curKey]?.includes(candKey)) key = 0.2
    else if (curKey.slice(0, -1) === candKey.slice(0, -1)) key = 0.08
  } else if (current.key_signature && candidate.key_signature) {
    if (current.key_signature === candidate.key_signature) key = 0.15
  }

  const a = pocketOf(current)
  const b = pocketOf(candidate)
  let pocket = 0
  if (a.family && b.family) {
    pocket += a.family === b.family ? 0.12 : 0.02
  }
  pocket += jaccard(a.kick, b.kick) * 0.12
  pocket += jaccard(a.snare, b.snare) * 0.06
  if (a.fourRatio != null && b.fourRatio != null) {
    pocket += Math.max(0, 1 - Math.abs(a.fourRatio - b.fourRatio) / 0.5) * 0.04
  }
  if (a.swing != null && b.swing != null) {
    pocket += Math.max(0, 1 - Math.abs(a.swing - b.swing) / 40) * 0.03
  }
  pocket = Math.min(0.35, pocket)

  let energy = 0
  if (typeof current.energy_level === 'number' && typeof candidate.energy_level === 'number') {
    energy += Math.max(0, 1 - Math.abs(current.energy_level - candidate.energy_level) / 0.4) * 0.05
  }
  if (typeof current.danceability === 'number' && typeof candidate.danceability === 'number') {
    energy += Math.max(0, 1 - Math.abs(current.danceability - candidate.danceability) / 0.35) * 0.03
  }

  const total = Math.min(1, bpm + key + pocket + energy)
  return { total, bpm, key, pocket, energy }
}

export function pickBestDnaTrack(
  current: DnaMixTrack,
  candidates: DnaMixTrack[],
  opts?: { excludeIds?: Set<string>; randomizeTop?: number; minScore?: number }
): DnaMixTrack | null {
  const ranked = rankDnaTracks(current, candidates, {
    excludeIds: opts?.excludeIds,
    limit: Math.max(1, opts?.randomizeTop ?? 3),
    minScore: opts?.minScore,
  })
  if (!ranked.length) return null
  return ranked[Math.floor(Math.random() * ranked.length)]!.track
}

/** Rank candidates by Sonic DNA mix score (best first). */
export function rankDnaTracks(
  current: DnaMixTrack,
  candidates: DnaMixTrack[],
  opts?: { excludeIds?: Set<string>; limit?: number; minScore?: number }
): Array<{ track: DnaMixTrack; score: DnaCompatibilityBreakdown }> {
  const exclude = opts?.excludeIds || new Set<string>()
  const minScore = typeof opts?.minScore === 'number' ? opts.minScore : 0
  const mixing = deriveMixingRecommendations(current)
  const pool = candidates.filter((t) => t.id && !exclude.has(t.id) && t.id !== current.id)
  if (!pool.length) return []

  const scored = pool
    .map((t) => {
      const base = scoreDnaCompatibility(current, t)
      let bonus = 0
      if (mixing?.bpmRange) {
        const bpm = resolvePlaybackBpm(t)
        if (bpm && bpm >= mixing.bpmRange.min && bpm <= mixing.bpmRange.max) bonus += 0.06
      }
      if (mixing?.compatibleKeys?.length) {
        const key = camelotOf(t)
        if (key && mixing.compatibleKeys.includes(key)) bonus += 0.05
      }
      if (mixing?.pocketFamilies?.length) {
        const fam = pocketOf(t).family
        if (fam && mixing.pocketFamilies.includes(fam)) bonus += 0.04
      }
      const total = Math.min(1, base.total + bonus)
      return { track: t, score: { ...base, total } }
    })
    .filter((x) => x.score.total >= minScore)
    .sort((a, b) => b.score.total - a.score.total)

  const limit = opts?.limit && opts.limit > 0 ? opts.limit : scored.length
  return scored.slice(0, Math.min(limit, scored.length))
}

const FAMILY_GENRE_HINTS: Record<string, string[]> = {
  'four-on-the-floor': ['house', 'tech house', 'disco', 'techno'],
  'half-time': ['trap', 'hip-hop', 'drill'],
  breakbeat: ['breakbeat', 'jungle', 'dnb', 'drum and bass'],
  'boom-bap': ['hip-hop', 'boom bap', 'lo-fi'],
  dembow: ['reggaeton', 'dembow', 'latin'],
  'one-drop': ['reggae', 'dub'],
  sparse: ['ambient', 'downtempo', 'minimal'],
}

/** Prefer stored sonic_dna.mixing; otherwise derive from measured Camelot / BPM / pocket. */
export function deriveMixingRecommendations(track: DnaMixTrack): MixingRecommendations | null {
  const root =
    track.sonic_dna && typeof track.sonic_dna === 'object'
      ? (track.sonic_dna as Record<string, any>)
      : typeof track.sonic_dna === 'string'
        ? (() => {
            try {
              return JSON.parse(track.sonic_dna as string)
            } catch {
              return null
            }
          })()
        : null

  const stored = root?.mixing
  if (
    stored &&
    (stored.compatibleKeys?.length || stored.bpmRange || stored.mixableGenres?.length)
  ) {
    return {
      bpmRange: stored.bpmRange,
      compatibleKeys: stored.compatibleKeys,
      mixableGenres: stored.mixableGenres,
      pocketFamilies: stored.pocketFamilies,
      source: 'stored',
    }
  }

  const measured = extractMeasured(track.sonic_dna)
  const bpm = resolvePlaybackBpm(track)
  const camelot = camelotOf(track)
  if (!measured && !bpm && !camelot) return null

  const compatibleKeys = camelot ? [camelot, ...getCompatibleKeys(camelot)] : undefined
  const bpmRange =
    bpm && bpm > 0
      ? { min: Math.max(60, Math.round(bpm - 6)), max: Math.min(200, Math.round(bpm + 6)) }
      : undefined
  const family = measured?.drumFamily ? String(measured.drumFamily) : null
  const mixableGenres = family ? FAMILY_GENRE_HINTS[family] || undefined : undefined

  if (!compatibleKeys?.length && !bpmRange && !mixableGenres?.length) return null
  return {
    bpmRange,
    compatibleKeys,
    mixableGenres,
    pocketFamilies: family ? [family] : undefined,
    source: 'derived',
  }
}

export type DnaGridSnapMode =
  | 'sixteenth'
  | 'half-beat'
  | 'beat'
  | 'bar'
  | 'phrase'
  | 'section'
  | 'kick'
  | 'step'

export type VisibleGridSnapMode =
  | 'none'
  | 'sixteenth'
  | 'half-beat'
  | 'beat'
  | 'bar'
  | 'phrase'
  | 'section'

/**
 * Coarser snap as the tape zooms out — matches painted grid ticks.
 * Fully zoomed in (1 bar): free pointer (no snap).
 * ≤8 bars: 16ths; ≤32: half-beats; ≤64: bars; else phrases.
 */
export function quantizeModeForVisibleBars(visibleBars: number): VisibleGridSnapMode {
  if (!Number.isFinite(visibleBars) || visibleBars <= 0) return 'section'
  // Max zoom-in — exact click / scrub position, no lattice.
  if (visibleBars <= 1) return 'none'
  if (visibleBars <= 8) return 'sixteenth'
  if (visibleBars <= 32) return 'half-beat'
  if (visibleBars <= 64) return 'bar'
  return 'phrase'
}

/**
 * Pointer / cue snap for the current waveform window.
 * Full-track overview picks the closer of phrase vs 16-bar section.
 * Max zoom-in returns the raw time (free-form).
 */
export function quantizePointerToVisibleGrid(params: {
  timeSec: number
  bpm: number
  offsetSec?: number
  visibleBars: number
  beatsPerBar?: number
  durationSec?: number
  sonicDna?: unknown
}): number {
  const { timeSec, durationSec } = params
  const clamp = (t: number) => {
    if (durationSec != null && durationSec > 0 && Number.isFinite(durationSec)) {
      return Math.max(0, Math.min(durationSec, t))
    }
    return Math.max(0, t)
  }
  if (!Number.isFinite(timeSec)) return 0
  if (!Number.isFinite(params.bpm) || params.bpm <= 0) return clamp(timeSec)

  const bars = params.visibleBars
  if (!Number.isFinite(bars) || bars <= 0) {
    const phrase = quantizeToDnaGrid({ ...params, mode: 'phrase' })
    const section = quantizeToDnaGrid({ ...params, mode: 'section' })
    const pick =
      Math.abs(phrase - timeSec) <= Math.abs(section - timeSec) ? phrase : section
    return clamp(pick)
  }
  const mode = quantizeModeForVisibleBars(bars)
  if (mode === 'none') return clamp(timeSec)
  return clamp(quantizeToDnaGrid({ ...params, mode }))
}

/**
 * Snap time to nearest DNA grid point.
 * mode: beat | bar | phrase | section | kick (nearest kick step on phrase grid)
 */
export function quantizeToDnaGrid(params: {
  timeSec: number
  bpm: number
  offsetSec?: number
  sonicDna?: unknown
  mode?: DnaGridSnapMode
  beatsPerBar?: number
}): number {
  const { timeSec, bpm } = params
  const beat = beatPeriodSec(bpm)
  if (!beat || !Number.isFinite(timeSec)) return timeSec
  const offset = Number.isFinite(params.offsetSec) ? Math.max(0, params.offsetSec!) : 0
  const beatsPerBar = Math.max(1, params.beatsPerBar ?? 4)
  const barSec = beat * beatsPerBar
  const mode = params.mode || 'beat'

  if (mode === 'sixteenth') {
    const step = beat / 4
    const n = Math.round((timeSec - offset) / step)
    return Math.max(0, offset + n * step)
  }
  if (mode === 'half-beat') {
    const half = beat / 2
    const n = Math.round((timeSec - offset) / half)
    return Math.max(0, offset + n * half)
  }
  if (mode === 'beat') {
    const n = Math.round((timeSec - offset) / beat)
    return Math.max(0, offset + n * beat)
  }
  if (mode === 'bar') {
    const n = Math.round((timeSec - offset) / barSec)
    return Math.max(0, offset + n * barSec)
  }
  if (mode === 'phrase') {
    const phraseSec = barSec * BARS_PER_PHRASE
    const n = Math.round((timeSec - offset) / phraseSec)
    return Math.max(0, offset + n * phraseSec)
  }
  if (mode === 'section') {
    const sectionSec = barSec * BARS_PER_SECTION
    const n = Math.round((timeSec - offset) / sectionSec)
    return Math.max(0, offset + n * sectionSec)
  }

  // kick / step — nearest active kick on phrase grid (or every 16th if no DNA)
  const measured = extractMeasured(params.sonicDna)
  const ensured = measured ? ensurePhraseSteps(measured) : null
  const kicks =
    ensured?.kickPhraseSteps?.length
      ? ensured.kickPhraseSteps
      : expandBarStepsToPhrase(ensured?.kickSteps || [0, 4, 8, 12])
  const stepSec = barSec / STEPS_PER_BAR
  const phraseSec = stepSec * STEPS_PER_PHRASE
  let best = timeSec
  let bestDist = Infinity
  // Search ±1 phrase around time
  const basePhrase = Math.floor((timeSec - offset) / phraseSec)
  for (let p = basePhrase - 1; p <= basePhrase + 1; p++) {
    const phraseStart = offset + p * phraseSec
    for (const s of kicks) {
      const t = phraseStart + s * stepSec
      if (t < 0) continue
      const d = Math.abs(t - timeSec)
      if (d < bestDist) {
        bestDist = d
        best = t
      }
    }
  }
  return Math.max(0, best)
}

/** Nearest snare/clap hit on the DNA phrase grid. */
export function secondsToNearestSnareHit(params: {
  timeSec: number
  bpm: number
  offsetSec?: number
  sonicDna?: unknown
}): number | null {
  const measured = extractMeasured(params.sonicDna)
  if (!measured) return null
  const ensured = ensurePhraseSteps(measured)
  const snares = ensured.snarePhraseSteps?.length
    ? ensured.snarePhraseSteps
    : expandBarStepsToPhrase(ensured.snareSteps || [4, 12])
  if (!snares.length) return null

  const beat = beatPeriodSec(params.bpm)
  if (!beat) return null
  const offset = Number.isFinite(params.offsetSec) ? Math.max(0, params.offsetSec!) : 0
  const barSec = beat * 4
  const stepSec = barSec / STEPS_PER_BAR
  const phraseSec = stepSec * STEPS_PER_PHRASE

  let best: number | null = null
  let bestDist = Infinity
  const basePhrase = Math.floor((params.timeSec - offset) / phraseSec)
  for (let p = basePhrase - 1; p <= basePhrase + 2; p++) {
    const phraseStart = offset + p * phraseSec
    for (const s of snares) {
      const t = phraseStart + s * stepSec
      if (t < 0) continue
      const d = Math.abs(t - params.timeSec)
      if (d < bestDist) {
        bestDist = d
        best = t
      }
    }
  }
  return best
}

/** Signed seconds to the nearest snare/clap hit (negative = hit was earlier). */
export function signedSnareOffsetSec(params: {
  timeSec: number
  bpm: number
  offsetSec?: number
  sonicDna?: unknown
}): number | null {
  const hit = secondsToNearestSnareHit(params)
  if (hit == null) return null
  return hit - params.timeSec
}

/** Seconds until the next phrase boundary after `timeSec` (DNA offset-aware). */
export function secondsToNextPhraseBoundary(params: {
  timeSec: number
  bpm: number
  offsetSec?: number
  phraseBars?: number
  beatsPerBar?: number
}): number {
  const beat = beatPeriodSec(params.bpm)
  if (!beat) return 0
  const offset = Number.isFinite(params.offsetSec) ? Math.max(0, params.offsetSec!) : 0
  const bars = params.phraseBars && params.phraseBars > 0 ? params.phraseBars : BARS_PER_PHRASE
  const beatsPerBar = Math.max(1, params.beatsPerBar ?? 4)
  const phraseSec = beat * beatsPerBar * bars
  const phase = ((params.timeSec - offset) % phraseSec + phraseSec) % phraseSec
  const rem = phraseSec - phase
  return rem < 1e-6 ? phraseSec : rem
}

/** EQ target biases (dB) from DNA pocket — low↔kick, mid↔snare, high↔hats. */
export function eqBiasFromDna(sonicDna: unknown): { low: number; mid: number; high: number } {
  const measured = extractMeasured(sonicDna)
  if (!measured) return { low: 0, mid: 0, high: 0 }
  const rel = measured.spectral?.relative || {}
  const kick = Number(rel.kick) || 0
  const air = Number(rel.air) || 0
  const mid = Number(rel.mid) || Number(rel.lowMid) || 0
  const family = String(measured.drumFamily || '').toLowerCase()
  let low = Math.min(4, kick * 6) - (family.includes('sparse') ? 2 : 0)
  let midGain = Math.min(3, mid * 5)
  let high = Math.min(4, air * 6)
  const hats = String(measured.percussion?.hatGrid || '')
  if (hats.includes('16th') || hats.includes('eighth')) high += 1.5
  if (family.includes('boom') || family.includes('half')) {
    low += 1
    midGain += 1
  }
  return {
    low: Math.max(-6, Math.min(6, low)),
    mid: Math.max(-6, Math.min(6, midGain)),
    high: Math.max(-6, Math.min(6, high)),
  }
}

/** Build a mixing stub to merge into sonic_dna on apply. */
export function mixingBlockFromMeasured(measured: SonicDnaMeasured): Record<string, unknown> {
  const bpm =
    typeof measured.effectiveBpm === 'number' && measured.effectiveBpm > 0
      ? measured.effectiveBpm
      : typeof measured.bpm === 'number'
        ? measured.bpm
        : null
  const camelot = normalizeCamelot(measured.camelot)
  const family = measured.drumFamily ? String(measured.drumFamily) : null
  return {
    bpmRange:
      bpm && bpm > 0
        ? { min: Math.max(60, Math.round(bpm - 6)), max: Math.min(200, Math.round(bpm + 6)) }
        : undefined,
    compatibleKeys: camelot ? [camelot, ...getCompatibleKeys(camelot)] : [],
    mixableGenres: family ? FAMILY_GENRE_HINTS[family] || [] : [],
    pocketFamilies: family ? [family] : [],
    derivedFrom: 'measured',
  }
}
