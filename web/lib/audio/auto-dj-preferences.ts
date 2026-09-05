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
export type CuePriority = 'dna-intro' | 'first-downbeat' | 'hot-cue-1'
export type MixLengthBias = 'short' | 'normal' | 'long'
export type AutoDJLookahead = 1 | 2 | 3 | 4

export type AutoDJConfig = {
  enabled: boolean
  mode: 'queue'
  mixStyle: MixStylePreset
  /** Multi-select techniques; `auto` is exclusive. */
  mixTechniques: MixTechnique[]
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
    hint: 'Phase-lock kick/grid through most of the overlap (Serato/Traktor-style)',
  },
  {
    id: 'tempo-sync',
    label: 'TempoSync',
    hint: 'Match BPM only; unlock phase earlier for freer blends',
  },
]

export const CUE_PRIORITY_OPTIONS: Array<{ id: CuePriority; label: string; hint: string }> = [
  { id: 'dna-intro', label: 'DNA intro', hint: 'Labeled mix-in cue, else Sonic DNA intro' },
  { id: 'first-downbeat', label: 'First downbeat', hint: 'Grid origin / bar 1' },
  { id: 'hot-cue-1', label: 'Hot cue 1', hint: 'Player / DNA hot cue; mix-in label wins when set' },
]

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
    cuePriority:
      o.cuePriority === 'dna-intro' ||
      o.cuePriority === 'first-downbeat' ||
      o.cuePriority === 'hot-cue-1'
        ? o.cuePriority
        : base.cuePriority,
    mixLengthBias:
      o.mixLengthBias === 'short' || o.mixLengthBias === 'normal' || o.mixLengthBias === 'long'
        ? o.mixLengthBias
        : base.mixLengthBias,
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
