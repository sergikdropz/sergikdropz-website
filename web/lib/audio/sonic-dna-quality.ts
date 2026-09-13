export type SonicDnaStatus = 'pending' | 'processing' | 'partial' | 'completed' | 'failed'

export type DrumFamily =
  | 'four-on-the-floor'
  | 'half-time'
  | 'breakbeat'
  | 'boom-bap'
  | 'dembow'
  | 'one-drop'
  | 'sparse'
  | 'unknown'

export interface MeasuredBass {
  lock?: string | null
  rootNote?: string | null
  slidesLikely?: boolean
}

export interface MeasuredInstrument {
  id: string
  label: string
  role?: string
  confidence?: number
  evidence?: string
}

export type InstrumentSource = 'measured' | 'inferred' | 'agent'

export type InstrumentCategory =
  | 'bass'
  | 'keys'
  | 'percussion'
  | 'synth'
  | 'strings'
  | 'brass'
  | 'guitar'
  | 'vocals'
  | 'fx'
  | 'other'

export interface InstrumentUsageEntry {
  type: string
  category: InstrumentCategory
  role?: string
  confidence: number
  source: InstrumentSource
  evidence?: string
  usage?: string
}

export interface InstrumentUsage {
  bass?: InstrumentUsageEntry | null
  entries?: InstrumentUsageEntry[]
  lines?: string[]
  summary?: string
  analyzedAt?: string
}

export interface MeasuredPercussion {
  kickRole?: string
  snareRole?: string
  hatGrid?: string
  kickSyncopation?: number
  hatDensity?: number
  styles?: string[]
  swingPercent?: number
}

export interface MeasuredReport {
  description?: string
  facts?: string[]
  connections?: Array<{ from?: string; to?: string; rule?: string; text?: string }>
  caveats?: string[]
  method?: string
  layers?: {
    psychoacoustics?: string
    dsp?: string
    historical?: string
    cultural?: string
    psychological?: string
    musicological?: string
  }
}

export type MeasuredGenreSource = 'audio-measured' | 'user-preferred' | 'hybrid' | 'catalog'

export interface MeasuredGenre {
  family?: string | null
  primary?: string | null
  subgenre?: string | null
  confidence?: number
  reason?: string[]
  /** How primary/subgenre were decided. */
  source?: MeasuredGenreSource
  /** DSP classifier label before catalog/user preference. */
  audioPrimary?: string | null
  audioSubgenre?: string | null
  preferredPrimary?: string | null
  preferredSubgenre?: string | null
  /** Short prose mixing audio + user preference into one judgment. */
  judgment?: string | null
}

export interface SonicDnaMeasured {
  schemaVersion?: string
  source?: string
  analyzedAt?: string
  bpm?: number | null
  bpmConfidence?: number
  timingFeel?: string
  effectiveBpm?: number | null
  drumFamily?: DrumFamily | string | null
  kickSteps?: number[]
  snareSteps?: number[]
  clapSteps?: number[]
  hatSteps?: number[]
  /**
   * Absolute kick onset times (seconds) for BeatSync residual align.
   * Prefer this over kickSteps when present.
   */
  kickOnsetSec?: number[]
  /** Absolute snare/clap onset times (seconds) for backbeat pocket align. */
  snareClapOnsetSec?: number[]
  /** DSP grid phase in sixteenth-note steps (analysis window). */
  gridPhaseSteps?: number
  /** Absolute downbeat/grid origin (seconds) from DSP measure window + phase. */
  gridOffsetSec?: number
  /** Analysis window used for DSP measure. */
  window?: { startSec?: number; endSec?: number; reason?: string }
  /** Admin/user locked beatgrid — Auto DJ / re-align must not overwrite. */
  gridLocked?: boolean
  /** 0–1 lock quality from peak align */
  gridLockScore?: number
  /** Sixteenth-note steps per bar (DSP default 16). */
  stepsPerBar?: number
  /** Bars per phrase for phrase-grid folds (DSP default 8). */
  phraseBars?: number
  /** Kick hits on the phrase grid: 0..((stepsPerBar*phraseBars)-1), typically 0..127. */
  kickPhraseSteps?: number[]
  snarePhraseSteps?: number[]
  clapPhraseSteps?: number[]
  hatPhraseSteps?: number[]
  swingPercent?: number
  bass?: MeasuredBass | null
  rootNote?: string | null
  scale?: string | null
  key?: string | null
  camelot?: string | null
  unpitched?: boolean
  keyConfidence?: number
  genre?: MeasuredGenre | null
  instruments?: MeasuredInstrument[]
  instrumentUsage?: InstrumentUsage | null
  percussion?: MeasuredPercussion | null
  report?: MeasuredReport | null
  fourRatio?: number
  spectral?: { relative?: Record<string, number> }
  arrangement?: { lines?: string[] }
  intelligence?: {
    description?: string
    usageText?: string
    instrumentationText?: string
    intention?: string
    method?: string
    musical?: Record<string, unknown>
    psychoacoustics?: {
      socialUsage?: string
      sonicIntent?: string
      activationFormula?: string
      listenerEffects?: string
      report?: string
    }
    relatedGenres?: string[]
    emotional?: { primaryEmotions?: string[]; emotionalJourney?: string; psychologicalProfile?: string }
    historical?: { historicalContext?: string; eraInfluences?: string[] }
    cultural?: { description?: string; regions?: string[] }
  }
}

const UNKNOWN_KEYS = new Set(['', 'unknown', 'n/a', 'none', 'null'])

export function isUnknownKey(value: unknown): boolean {
  if (value == null) return true
  return UNKNOWN_KEYS.has(String(value).trim().toLowerCase())
}

export function hasMeasuredBpm(measured?: SonicDnaMeasured | null): boolean {
  const bpm = Number(measured?.bpm)
  if (!Number.isFinite(bpm) || bpm < 60 || bpm > 220) return false
  const confidence = Number(measured?.bpmConfidence)
  // Missing confidence is common on older/agent DNA — treat as ready when BPM is in range.
  if (!Number.isFinite(confidence)) return true
  return confidence >= 0.4
}

export function hasMeasuredDrums(measured?: SonicDnaMeasured | null): boolean {
  const family = String(measured?.drumFamily || '').toLowerCase()
  // Family alone unlocks encyclopedia fill. Kick/snare steps are synthesized when missing.
  if (family && family !== 'unknown') return true
  // Older / partial rows sometimes keep step grids without a drumFamily label.
  const kicks = Array.isArray(measured?.kickSteps) ? measured.kickSteps.length : 0
  const snares = Array.isArray(measured?.snareSteps) ? measured.snareSteps.length : 0
  return kicks + snares >= 2
}

export function hasMeasuredKey(measured?: SonicDnaMeasured | null): boolean {
  if (measured?.unpitched) return true
  if (isUnknownKey(measured?.key) && isUnknownKey(measured?.rootNote)) return false
  const confidence = Number(measured?.keyConfidence)
  if (measured?.rootNote || measured?.key) {
    if (!Number.isFinite(confidence)) return true
    return confidence >= 0.35
  }
  return false
}

/** Completed only when BPM, drum family, and key/root (or unpitched) were measured from audio. */
export function sonicDnaStatusFromMeasured(measured?: SonicDnaMeasured | null): SonicDnaStatus {
  if (!measured) return 'partial'
  if (hasMeasuredBpm(measured) && hasMeasuredDrums(measured) && hasMeasuredKey(measured)) {
    return 'completed'
  }
  return 'partial'
}

export function parseSonicDna(sonicDna: unknown): Record<string, any> | null {
  if (!sonicDna) return null
  if (typeof sonicDna === 'string') {
    try {
      const parsed = JSON.parse(sonicDna)
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, any>) : null
    } catch {
      return null
    }
  }
  if (typeof sonicDna === 'object') return sonicDna as Record<string, any>
  return null
}

/** True when DNA has displayable analysis fields (client-safe — no Node deps). */
export function hasStoredSonicDna(dna: unknown): boolean {
  const parsed = parseSonicDna(dna)
  if (!parsed) return false
  // Catalog / list payloads: `{ status, hasData, analyzedAt }` markers only.
  if (
    parsed.status &&
    parsed.hasData &&
    !parsed.genres &&
    !parsed.musical &&
    !parsed.technical &&
    !parsed.measured &&
    !parsed.comprehensive &&
    !parsed.emotional &&
    !parsed.cultural &&
    !parsed.pipelineV2
  ) {
    return false
  }
  return !!(
    parsed.genres ||
    parsed.musical ||
    parsed.technical ||
    parsed.summary ||
    parsed.emotional ||
    parsed.comprehensive ||
    parsed.measured ||
    parsed.cultural ||
    parsed.pipelineV2
  )
}

export function extractMeasured(sonicDna: unknown): SonicDnaMeasured | null {
  const root = parseSonicDna(sonicDna)
  if (!root) return null
  const candidates = [root.measured, root.comprehensive?.measured, parseSonicDna(root.sonic_dna)?.measured]
  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      return candidate as SonicDnaMeasured
    }
  }
  return null
}

export function hasDspMeasuredGroove(measured?: SonicDnaMeasured | null): boolean {
  return Boolean(hasMeasuredBpm(measured) || hasMeasuredDrums(measured) || hasMeasuredKey(measured))
}

/** Prefer DSP-measured DNA over stale Storage JSON / agent-only blobs. */
export function mergePreferredSonicDna(primary: unknown, secondary: unknown): Record<string, any> | null {
  const a = parseSonicDna(primary)
  const b = parseSonicDna(secondary)
  if (!a && !b) return null
  const am = extractMeasured(a)
  const bm = extractMeasured(b)
  const measured = hasDspMeasuredGroove(am) ? am : hasDspMeasuredGroove(bm) ? bm : am || bm
  const unifiedPrimary = Boolean(
    am &&
      String(am.intelligence?.description || '').trim().length >= 400 &&
      String(am.intelligence?.method || '').includes('encyclopedia'),
  )
  if (unifiedPrimary && a) {
    return {
      ...(b || {}),
      ...(a || {}),
      ...(measured ? { measured } : {}),
    }
  }
  return {
    ...(b || {}),
    ...(a || {}),
    ...(measured ? { measured } : {}),
  }
}

export function normalizeSonicDnaStatus(status?: string | null): SonicDnaStatus | 'unknown' {
  const value = String(status || '').toLowerCase()
  if (value === 'pending' || value === 'processing' || value === 'partial' || value === 'completed' || value === 'failed') {
    return value
  }
  return 'unknown'
}

/** 0–100 completeness from DB status + measured gates (BPM, drums, key, intelligence). */
export function wrapMeasuredAsDna(measured: SonicDnaMeasured, existing?: unknown): Record<string, any> {
  const intel = (measured.intelligence || {}) as Record<string, any>
  const wrapped = {
    measured,
    description: intel.description || measured.report?.description || null,
    intention: intel.intention || null,
    summary: intel.summary || null,
    emotional: intel.emotional || null,
    historical: intel.historical || null,
    cultural: intel.cultural || intel.regional || null,
    musicology: intel.musicology || intel.musical || null,
    genres: intel.genres || {
      primaryGenres: [measured.genre?.primary, measured.genre?.family].filter(Boolean),
      subgenres: [measured.genre?.subgenre].filter(Boolean),
    },
    technical: {
      bpm: measured.bpm,
      key: measured.key,
      camelot: measured.camelot,
    },
    harmony: { keySignature: measured.key },
    musical: { keySignature: measured.key, scale: measured.scale },
  }
  return mergePreferredSonicDna(wrapped, existing) || wrapped
}

export type SonicDnaGate = { id: string; label: string; ok: boolean; weight: number }

export function sonicDnaCompletenessBreakdown(
  status?: string | null,
  sonicDna?: unknown,
): { percent: number; status: SonicDnaStatus | 'unknown'; gates: SonicDnaGate[] } {
  const normalized = normalizeSonicDnaStatus(status)
  const measured = extractMeasured(sonicDna)
  const gates: SonicDnaGate[] = [
    { id: 'bpm', label: 'BPM', ok: hasMeasuredBpm(measured), weight: 34 },
    { id: 'drums', label: 'Drums', ok: hasMeasuredDrums(measured), weight: 33 },
    { id: 'key', label: 'Key', ok: hasMeasuredKey(measured), weight: 33 },
    {
      id: 'intel',
      label: 'Encyclopedia',
      ok: (() => {
        const desc = String(measured?.intelligence?.description || measured?.report?.description || '').trim()
        if (desc.length >= 80) return true
        const layers = measured?.report?.layers
        if (!layers || typeof layers !== 'object') return false
        const filled = Object.values(layers as Record<string, unknown>).filter(
          (v) => typeof v === 'string' && String(v).trim().length >= 60 && !/awaiting audio analysis/i.test(String(v)),
        )
        return filled.length >= 2
      })(),
      weight: 0,
    },
  ]
  if (normalized === 'failed') return { percent: 0, status: 'failed', gates }
  if (normalized === 'processing') return { percent: 45, status: 'processing', gates }
  const percent = Math.min(
    100,
    gates.reduce((sum, gate) => sum + (gate.ok ? gate.weight : 0), 0),
  )
  const dspComplete = hasMeasuredBpm(measured) && hasMeasuredDrums(measured) && hasMeasuredKey(measured)
  const effective: SonicDnaStatus | 'unknown' = dspComplete
    ? 'completed'
    : percent > 0
      ? 'partial'
      : normalized === 'completed'
        ? 'partial'
        : normalized
  return { percent, status: effective, gates }
}

export function sonicDnaCompletenessPercent(status?: string | null, sonicDna?: unknown): number {
  return sonicDnaCompletenessBreakdown(status, sonicDna).percent
}

export function sonicDnaStatusLabel(status?: string | null): string {
  const normalized = normalizeSonicDnaStatus(status)
  if (normalized === 'unknown') return 'Not started'
  if (normalized === 'pending') return 'Pending'
  if (normalized === 'processing') return 'Processing'
  if (normalized === 'partial') return 'Partial'
  if (normalized === 'completed') return 'Completed'
  return 'Failed'
}
