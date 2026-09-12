/**
 * Auto DJ settings — shared types, persistence, and technique compatibility.
 */

import type { MixStylePreset, MixTechnique } from '@/lib/audio/mix-engine/mix-techniques'
import type { InPhraseBars, OutPhraseBars, PhraseBars } from '@/lib/audio/mix-engine/types'

export type AutoDJTransitionMode = 'crossfade' | 'filter-eq' | 'cutout-filter'

export type HarmonicMatch = 'off' | 'camelot' | 'key-lock'
export type EnergyCurve = 'hold' | 'build' | 'drop'
export type BpmStrategy = 'match-outgoing' | 'native' | 'manual'
/** BeatSync = phase lock + hold; TempoSync = rate match only (earlier unlock). */
export type SyncMode = 'beat-sync' | 'tempo-sync'
export type CuePriority =
  | 'dna-intro'
  | 'first-downbeat'
  | 'mix-in'
  | 'hot-cue-1'
  | 'hot-cue-2'
  | 'hot-cue-3'
  | 'hot-cue-4'
  | 'memory-cue'
  | 'drop'
  | 'loop-in'
export type MixLengthBias = 'short' | 'normal' | 'long'
export type AutoDJLookahead = 1 | 2 | 3 | 4
/** How Auto DJ snaps blend OUT/IN cues on the grid. */
export type BlendQuantize = 'phrase' | 'bar' | 'beat'
/**
 * Live BeatSync corrections during the overlap.
 * - off: no vinyl bend / kick pocket / grid seek
 * - grid / grid-bar / grid-phrase: seek-snap incoming onto the outgoing lattice
 * - phase: grid phase vinyl bend only
 * - phase-kick: phase + kick/clap pocket residual
 * - grid-phase: beat-grid snap plus vinyl-bend residual
 * - grid-kick / grid-bar-kick / grid-phrase-kick: lattice snap + kick pocket
 * - grid-phase-kick: beat-grid snap + vinyl bend + kick
 */
export type BeatCorrect =
  | 'off'
  | 'grid'
  | 'grid-bar'
  | 'grid-phrase'
  | 'grid-kick'
  | 'grid-bar-kick'
  | 'grid-phrase-kick'
  | 'phase'
  | 'phase-kick'
  | 'grid-phase'
  | 'grid-phase-kick'

export type GridAlignMode = 'beat' | 'bar' | 'phrase'

export type AutoDJConfig = {
  enabled: boolean
  mode: 'queue'
  mixStyle: MixStylePreset
  /** Multi-select techniques; `auto` is exclusive. */
  mixTechniques: MixTechnique[]
  /**
   * @deprecated Kept for stored settings back-compat. Canonical drivers are
   * `mixStyle` + `mixTechniques` (see `resolveEffectiveMixStyle`).
   */
  transitionMode: AutoDJTransitionMode
  outPhraseBars: OutPhraseBars
  inPhraseBars: InPhraseBars
  overlapBars: PhraseBars
  addToQueue: boolean
  leadIn: number
  lookahead: AutoDJLookahead
  harmonicMatch: HarmonicMatch
  energyCurve: EnergyCurve
  bpmStrategy: BpmStrategy
  syncMode: SyncMode
  cuePriority: CuePriority
  mixLengthBias: MixLengthBias
  /** Suggest mix style from outgoing section; user Smooth is the auto cap. */
  sectionStyle: boolean
  /** Snap blend cues to phrase / bar / beat lattice. */
  blendQuantize: BlendQuantize
  /** Auto phase / kick corrections while BeatSync is held. */
  beatCorrect: BeatCorrect
  /** After fair/poor mixes, shorten blend and escalate to TempoSync. */
  autoCorrectWeakMixes: boolean
  /**
   * Creative mode exits Phrase Mix Doctrine — honors energy/length/bar-in/cue knobs.
   * Off (default) = canonical phrase-1 + exact 8/16 overlap.
   */
  creativeMode: boolean
}

export const AUTO_DJ_STORAGE_KEY = 'autoDJSettings'

/**
 * Enablement lives under its own key rather than inside the settings payload.
 * The player rewrites that payload on mount, which would otherwise overwrite a
 * restored `enabled` before the provider had a chance to read it back.
 */
export const AUTO_DJ_ENABLED_STORAGE_KEY = 'autoDJEnabled'

export function readAutoDJEnabledFromStorage(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(AUTO_DJ_ENABLED_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function writeAutoDJEnabledToStorage(enabled: boolean): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(AUTO_DJ_ENABLED_STORAGE_KEY, enabled ? '1' : '0')
  } catch {
    // ignore quota errors
  }
}

export const HARMONIC_MATCH_OPTIONS: Array<{ id: HarmonicMatch; label: string; hint: string }> = [
  { id: 'off', label: 'Off', hint: 'DNA score only' },
  { id: 'camelot', label: 'Camelot', hint: 'Prefer harmonically compatible keys' },
  { id: 'key-lock', label: 'Key lock', hint: 'Camelot match + pitch lock on incoming' },
]

export const ENERGY_CURVE_OPTIONS: Array<{ id: EnergyCurve; label: string; hint: string }> = [
  { id: 'hold', label: 'Hold', hint: 'Keep energy flat through overlap' },
  { id: 'build', label: 'Build', hint: 'Longer rise into incoming' },
  { id: 'drop', label: 'Drop', hint: 'Late punch / shorter tail' },
]

export const BPM_STRATEGY_OPTIONS: Array<{ id: BpmStrategy; label: string; hint: string }> = [
  {
    id: 'match-outgoing',
    label: 'Handoff',
    hint: 'Beatmatch at OUT, then both decks glide master clock → incoming native BPM',
  },
  { id: 'native', label: 'Native', hint: 'Settle on incoming original BPM (same handoff path)' },
  { id: 'manual', label: 'Manual', hint: 'Glide master clock toward the tempo slider' },
]

export const SYNC_MODE_OPTIONS: Array<{ id: SyncMode; label: string; hint: string }> = [
  {
    id: 'beat-sync',
    label: 'BeatSync',
    hint: 'Incoming-only vinyl bend + shared master BPM for the whole overlap',
  },
  {
    id: 'tempo-sync',
    label: 'TempoSync',
    hint: 'Match BPM only; unlock phase at the tempo glide',
  },
]

export const BLEND_QUANTIZE_OPTIONS: Array<{ id: BlendQuantize; label: string; hint: string }> = [
  {
    id: 'phrase',
    label: 'Phrase',
    hint: 'Snap OUT/IN to 8-bar phrase lines (DJ doctrine)',
  },
  {
    id: 'bar',
    label: 'Bar',
    hint: 'Snap blend cues to 1-bar lines',
  },
  {
    id: 'beat',
    label: 'Beat',
    hint: 'Snap blend cues to the beat grid',
  },
]

export const BEAT_CORRECT_OPTIONS: Array<{ id: BeatCorrect; label: string; hint: string }> = [
  {
    id: 'off',
    label: 'Off',
    hint: 'No mid-blend vinyl bend, kick pocket, or grid seek',
  },
  {
    id: 'grid',
    label: 'Grid',
    hint: 'Seek-snap incoming onto the outgoing beat grid',
  },
  {
    id: 'grid-bar',
    label: 'Bar grid',
    hint: 'Seek-snap incoming onto outgoing 1-bar lines',
  },
  {
    id: 'grid-phrase',
    label: 'Phrase grid',
    hint: 'Seek-snap incoming onto outgoing 8-bar phrase lines',
  },
  {
    id: 'grid-kick',
    label: 'Grid + kick',
    hint: 'Beat-grid snap plus kick/clap pocket residual',
  },
  {
    id: 'grid-bar-kick',
    label: 'Bar grid + kick',
    hint: 'Bar-line snap plus kick/clap pocket residual',
  },
  {
    id: 'grid-phrase-kick',
    label: 'Phrase grid + kick',
    hint: 'Phrase-line snap plus kick/clap pocket residual',
  },
  {
    id: 'phase',
    label: 'Phase',
    hint: 'Vinyl-bend chase on grid phase only',
  },
  {
    id: 'phase-kick',
    label: 'Phase + kick',
    hint: 'Phase chase plus kick/clap pocket residual',
  },
  {
    id: 'grid-phase',
    label: 'Grid + phase',
    hint: 'Beat-grid snap, then vinyl-bend residual',
  },
  {
    id: 'grid-phase-kick',
    label: 'Grid + phase + kick',
    hint: 'Beat-grid snap, vinyl-bend residual, and kick/clap pocket',
  },
]

const BEAT_CORRECT_IDS = new Set(BEAT_CORRECT_OPTIONS.map((o) => o.id))

export function isBeatCorrect(value: unknown): value is BeatCorrect {
  return typeof value === 'string' && BEAT_CORRECT_IDS.has(value as BeatCorrect)
}

export function beatCorrectFlags(mode: BeatCorrect): {
  vinylBend: boolean
  kickCorrect: boolean
  gridAlign: GridAlignMode | null
} {
  switch (mode) {
    case 'off':
      return { vinylBend: false, kickCorrect: false, gridAlign: null }
    case 'grid':
      return { vinylBend: false, kickCorrect: false, gridAlign: 'beat' }
    case 'grid-bar':
      return { vinylBend: false, kickCorrect: false, gridAlign: 'bar' }
    case 'grid-phrase':
      return { vinylBend: false, kickCorrect: false, gridAlign: 'phrase' }
    case 'grid-kick':
      return { vinylBend: false, kickCorrect: true, gridAlign: 'beat' }
    case 'grid-bar-kick':
      return { vinylBend: false, kickCorrect: true, gridAlign: 'bar' }
    case 'grid-phrase-kick':
      return { vinylBend: false, kickCorrect: true, gridAlign: 'phrase' }
    case 'phase':
      return { vinylBend: true, kickCorrect: false, gridAlign: null }
    case 'grid-phase':
      return { vinylBend: true, kickCorrect: false, gridAlign: 'beat' }
    case 'grid-phase-kick':
      return { vinylBend: true, kickCorrect: true, gridAlign: 'beat' }
    case 'phase-kick':
    default:
      return { vinylBend: true, kickCorrect: true, gridAlign: null }
  }
}

/**
 * Rebuild a BeatCorrect id from vinyl/kick/grid flags (best-effort).
 * Used when the phase meter forces a lattice while keeping chase prefs.
 */
export function beatCorrectFromFlags(flags: {
  vinylBend: boolean
  kickCorrect: boolean
  gridAlign: GridAlignMode | null
}): BeatCorrect {
  const { vinylBend, kickCorrect, gridAlign } = flags
  if (!vinylBend && !kickCorrect && !gridAlign) return 'off'
  if (gridAlign === 'bar') {
    if (vinylBend && kickCorrect) return 'grid-bar-kick' // no bar+phase+kick id — bar+kick
    if (kickCorrect) return 'grid-bar-kick'
    if (vinylBend) return 'grid-bar' // bar snap; vinyl still applied via plan override if needed
    return 'grid-bar'
  }
  if (gridAlign === 'phrase') {
    if (kickCorrect) return 'grid-phrase-kick'
    return 'grid-phrase'
  }
  if (gridAlign === 'beat') {
    if (vinylBend && kickCorrect) return 'grid-phase-kick'
    if (vinylBend) return 'grid-phase'
    if (kickCorrect) return 'grid-kick'
    return 'grid'
  }
  if (vinylBend && kickCorrect) return 'phase-kick'
  if (vinylBend) return 'phase'
  return 'off'
}

/**
 * Auto DJ BeatSync should follow the phase-meter window (beat / bar / phrase).
 * Keeps vinyl-bend + kick prefs from the user's Beat correct setting.
 */
export function withPhaseMeterGridAlign(
  beatCorrect: BeatCorrect,
  gridAlign: GridAlignMode,
): BeatCorrect {
  if (beatCorrect === 'off') {
    // Meter on + BeatSync still needs lattice snap
    return gridAlign === 'bar' ? 'grid-bar' : gridAlign === 'phrase' ? 'grid-phrase' : 'grid'
  }
  const flags = beatCorrectFlags(beatCorrect)
  return beatCorrectFromFlags({ ...flags, gridAlign })
}

export const CUE_PRIORITY_OPTIONS: Array<{ id: CuePriority; label: string; hint: string }> = [
  { id: 'dna-intro', label: 'DNA intro', hint: 'Labeled mix-in cue, else Sonic DNA intro' },
  { id: 'mix-in', label: 'Mix-in cue', hint: 'Only the labeled mix-in marker' },
  { id: 'first-downbeat', label: 'First downbeat', hint: 'Grid origin / bar 1' },
  { id: 'hot-cue-1', label: 'Hot cue 1', hint: 'Player or DNA hot cue 1' },
  { id: 'hot-cue-2', label: 'Hot cue 2', hint: 'Player or DNA hot cue 2' },
  { id: 'hot-cue-3', label: 'Hot cue 3', hint: 'Player or DNA hot cue 3' },
  { id: 'hot-cue-4', label: 'Hot cue 4', hint: 'Player or DNA hot cue 4' },
  { id: 'memory-cue', label: 'Memory cue', hint: 'SET / CUE memory point on the incoming track' },
  { id: 'drop', label: 'Drop', hint: 'Labeled drop, else DNA drop section' },
  { id: 'loop-in', label: 'Loop in', hint: 'Labeled loop-in marker' },
]

const CUE_PRIORITY_IDS = new Set(CUE_PRIORITY_OPTIONS.map((o) => o.id))

export function isCuePriority(value: unknown): value is CuePriority {
  return typeof value === 'string' && CUE_PRIORITY_IDS.has(value as CuePriority)
}

export const MIX_LENGTH_BIAS_OPTIONS: Array<{ id: MixLengthBias; label: string; hint: string }> = [
  { id: 'short', label: 'Short', hint: 'Tighter overlaps' },
  { id: 'normal', label: 'Normal', hint: 'Default overlap length' },
  { id: 'long', label: 'Long', hint: 'Extended blends' },
]

export const LOOKAHEAD_OPTIONS: Array<{ id: AutoDJLookahead; label: string }> = [
  { id: 1, label: '1 track' },
  { id: 2, label: '2 tracks' },
  { id: 3, label: '3 tracks' },
  { id: 4, label: '4 tracks' },
]

/** Style-overriding techniques — only one at a time. */
const STYLE_OVERRIDE_TECHNIQUES: MixTechnique[] = ['bass-swap', 'drop-cut']

/** Timing techniques that stack well together. */
const TIMING_TECHNIQUES: MixTechnique[] = ['phrase-lock', 'energy-build', 'long-blend']

/** EQ / filter techniques that stack well together. */
const TEXTURE_TECHNIQUES: MixTechnique[] = [
  'vocal-blend',
  'filter-sweep',
  'strip-tease',
  'echo-tail',
]

const MAX_ACTIVE_TECHNIQUES = 3

export function legacyTransitionFromMixStyle(style: MixStylePreset): AutoDJTransitionMode {
  if (style === 'filter-eq' || style === 'strip-tease' || style === 'echo-out') return 'filter-eq'
  if (style === 'cutout-filter') return 'cutout-filter'
  return 'crossfade'
}

export const DEFAULT_AUTO_DJ_CONFIG: AutoDJConfig = {
  enabled: false,
  mode: 'queue',
  mixStyle: 'crossfade',
  mixTechniques: ['standard'],
  transitionMode: 'crossfade',
  outPhraseBars: 8,
  inPhraseBars: 8,
  overlapBars: 8,
  addToQueue: true,
  leadIn: 0,
  lookahead: 2,
  harmonicMatch: 'camelot',
  energyCurve: 'hold',
  bpmStrategy: 'match-outgoing',
  syncMode: 'beat-sync',
  cuePriority: 'first-downbeat',
  mixLengthBias: 'normal',
  sectionStyle: true,
  blendQuantize: 'phrase',
  beatCorrect: 'phase-kick',
  autoCorrectWeakMixes: true,
  creativeMode: false,
}

function isPhraseBars(n: unknown): n is PhraseBars {
  return n === 2 || n === 4 || n === 8 || n === 16 || n === 32
}

/** DJ doctrine: prefer 8/16 blend; map legacy 2/4→8 and 32→16. */
function normalizeOverlapBars(n: unknown): PhraseBars {
  if (n === 16) return 16
  if (n === 32) return 16
  if (n === 8 || n === 2 || n === 4) return 8
  return 8
}

function normalizeOutPhraseBars(n: unknown): OutPhraseBars {
  if (n === 16 || n === 24 || n === 32) return n
  return 8
}

function normalizeInPhraseBars(n: unknown): InPhraseBars {
  return n === 0 ? 0 : 8
}

function normalizeTechniques(raw: unknown): MixTechnique[] {
  if (Array.isArray(raw)) {
    const ids = raw.filter((t): t is MixTechnique => typeof t === 'string')
    return sanitizeMixTechniques(ids.length ? ids : ['auto'])
  }
  if (typeof raw === 'string') {
    return sanitizeMixTechniques([raw as MixTechnique])
  }
  return ['auto']
}

export function sanitizeMixTechniques(selected: MixTechnique[]): MixTechnique[] {
  const uniq = [...new Set(selected.filter(Boolean))]
  if (uniq.includes('auto')) return ['auto']
  if (uniq.length === 0) return ['standard']

  let next = uniq.filter((t) => t !== 'standard' && t !== 'auto')
  if (next.length === 0) return ['standard']

  const styleOverride = next.find((t) => STYLE_OVERRIDE_TECHNIQUES.includes(t))
  if (styleOverride) {
    next = [
      styleOverride,
      ...next.filter((t) => !STYLE_OVERRIDE_TECHNIQUES.includes(t)),
    ]
  }

  const timing = next.filter((t) => TIMING_TECHNIQUES.includes(t))
  const texture = next.filter((t) => TEXTURE_TECHNIQUES.includes(t))
  const other = next.filter(
    (t) =>
      !TIMING_TECHNIQUES.includes(t) &&
      !TEXTURE_TECHNIQUES.includes(t) &&
      !STYLE_OVERRIDE_TECHNIQUES.includes(t),
  )

  const merged = [
    ...(styleOverride ? [styleOverride] : []),
    ...timing,
    ...texture,
    ...other,
  ]
  const capped = [...new Set(merged)].slice(0, MAX_ACTIVE_TECHNIQUES)
  return capped.length ? capped : ['standard']
}

/** Toggle a technique chip; returns sanitized selection. */
export function toggleMixTechnique(
  current: MixTechnique[],
  technique: MixTechnique,
): MixTechnique[] {
  if (technique === 'auto') return ['auto']
  if (technique === 'standard') return ['standard']

  const withoutAuto = current.filter((t) => t !== 'auto' && t !== 'standard')
  const has = withoutAuto.includes(technique)
  if (has) {
    const next = withoutAuto.filter((t) => t !== technique)
    return sanitizeMixTechniques(next.length ? next : ['standard'])
  }

  return sanitizeMixTechniques([...withoutAuto, technique])
}

export function isTechniqueCompatible(
  current: MixTechnique[],
  technique: MixTechnique,
): boolean {
  if (technique === 'auto' || technique === 'standard') return true
  if (current.includes('auto')) return true

  const trial = toggleMixTechnique(current, technique)
  if (current.includes(technique)) return true
  return trial.includes(technique)
}

export function mixLengthBiasFactor(bias: MixLengthBias): number {
  if (bias === 'short') return 0.85
  if (bias === 'long') return 1.15
  return 1
}

/**
 * End-of-mix playback rate for the incoming deck.
 *
 * Beatmatch at OUT is always handled by MixEngine (`mixStartRate`).
 * This returns the **master handoff target**:
 * - `match-outgoing` / `native` → 1.0 (incoming original BPM)
 * - `manual` → tempo slider
 */
export function resolveIncomingRateForStrategy(params: {
  strategy: BpmStrategy
  beatmatchRate: number
  sliderRate: number
}): number {
  const usable = (rate: number): number | null =>
    Number.isFinite(rate) && rate > 0 ? rate : null

  if (params.strategy === 'manual') return usable(params.sliderRate) ?? 1
  // Handoff / native: settle on incoming original BPM via dual master glide.
  return 1
}

export function parseAutoDJConfig(raw: unknown): AutoDJConfig {
  const base = { ...DEFAULT_AUTO_DJ_CONFIG }
  if (!raw || typeof raw !== 'object') return base
  const o = raw as Record<string, unknown>

  const mixStyle =
    typeof o.mixStyle === 'string' ? (o.mixStyle as MixStylePreset) : base.mixStyle
  const mixTechniques = normalizeTechniques(o.mixTechniques ?? o.mixTechnique)

  return {
    ...base,
    enabled: typeof o.enabled === 'boolean' ? o.enabled : base.enabled,
    mode: o.mode === 'queue' ? 'queue' : base.mode,
    mixStyle,
    mixTechniques,
    transitionMode:
      typeof o.transitionMode === 'string'
        ? (o.transitionMode as AutoDJTransitionMode)
        : legacyTransitionFromMixStyle(mixStyle),
    outPhraseBars: normalizeOutPhraseBars(o.outPhraseBars),
    inPhraseBars: normalizeInPhraseBars(o.inPhraseBars),
    overlapBars: isPhraseBars(o.overlapBars)
      ? normalizeOverlapBars(o.overlapBars)
      : base.overlapBars,
    addToQueue: typeof o.addToQueue === 'boolean' ? o.addToQueue : base.addToQueue,
    leadIn: typeof o.leadIn === 'number' && Number.isFinite(o.leadIn) ? o.leadIn : base.leadIn,
    lookahead:
      o.lookahead === 1 || o.lookahead === 2 || o.lookahead === 3 || o.lookahead === 4
        ? o.lookahead
        : base.lookahead,
    harmonicMatch:
      o.harmonicMatch === 'off' || o.harmonicMatch === 'camelot' || o.harmonicMatch === 'key-lock'
        ? o.harmonicMatch
        : base.harmonicMatch,
    energyCurve:
      o.energyCurve === 'hold' || o.energyCurve === 'build' || o.energyCurve === 'drop'
        ? o.energyCurve
        : base.energyCurve,
    bpmStrategy:
      o.bpmStrategy === 'match-outgoing' ||
      o.bpmStrategy === 'native' ||
      o.bpmStrategy === 'manual'
        ? o.bpmStrategy
        : base.bpmStrategy,
    syncMode: o.syncMode === 'tempo-sync' || o.syncMode === 'beat-sync' ? o.syncMode : base.syncMode,
    cuePriority: isCuePriority(o.cuePriority) ? o.cuePriority : base.cuePriority,
    mixLengthBias:
      o.mixLengthBias === 'short' || o.mixLengthBias === 'normal' || o.mixLengthBias === 'long'
        ? o.mixLengthBias
        : base.mixLengthBias,
    sectionStyle: typeof o.sectionStyle === 'boolean' ? o.sectionStyle : base.sectionStyle,
    blendQuantize:
      o.blendQuantize === 'phrase' || o.blendQuantize === 'bar' || o.blendQuantize === 'beat'
        ? o.blendQuantize
        : base.blendQuantize,
    beatCorrect: isBeatCorrect(o.beatCorrect) ? o.beatCorrect : base.beatCorrect,
    autoCorrectWeakMixes:
      typeof o.autoCorrectWeakMixes === 'boolean'
        ? o.autoCorrectWeakMixes
        : base.autoCorrectWeakMixes,
    creativeMode: typeof o.creativeMode === 'boolean' ? o.creativeMode : base.creativeMode,
  }
}

export function readAutoDJConfigFromStorage(): AutoDJConfig {
  if (typeof window === 'undefined') return { ...DEFAULT_AUTO_DJ_CONFIG }
  try {
    const raw = localStorage.getItem(AUTO_DJ_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_AUTO_DJ_CONFIG }
    return parseAutoDJConfig(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_AUTO_DJ_CONFIG }
  }
}

export function writeAutoDJConfigToStorage(config: AutoDJConfig): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(AUTO_DJ_STORAGE_KEY, JSON.stringify(config))
  } catch {
    // ignore quota errors
  }
}

export function serializeAutoDJPayload(config: AutoDJConfig, leadIn: number): AutoDJConfig {
  return parseAutoDJConfig({ ...config, leadIn })
}
