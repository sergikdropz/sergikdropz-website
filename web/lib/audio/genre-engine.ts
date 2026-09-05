/**
 * Unified Sonic DNA genre engine — DSP base classifier + trained overlay rules
 * scored against the gold set / admin Accuracy Challenge harness.
 */
import type { GrooveClassification } from '@/lib/audio/groove-genre'
import { classifyGroove } from '@/lib/audio/groove-genre'
import type { DrumFamily, SonicDnaMeasured } from '@/lib/audio/sonic-dna-quality'
import engineRulesJson from '@/lib/audio/data/genre-engine-rules.json'

export type GenreEngineWhen = {
  drumFamily?: string[]
  bpmMin?: number
  bpmMax?: number
  bassLock?: string[]
  notBassLock?: string[]
  hatGrid?: string[]
  timingFeel?: string[]
}

export type GenreEngineThen = {
  family: string
  primary: string
  subgenre: string | null
  confidence: number
  reason: string[]
}

export type GenreEngineRule = {
  id: string
  priority?: number
  notes?: string
  when: GenreEngineWhen
  then: GenreEngineThen
}

export type GenreEngineRuleset = {
  schemaVersion?: string
  description?: string
  updatedAt?: string
  rules: GenreEngineRule[]
}

export type GenreEngineResult = GrooveClassification & {
  source: 'base' | 'overlay'
  ruleId?: string
}

export type GoldTrackLabel = {
  id: string
  title?: string
  bpm?: number | null
  drumFamily?: string | null
  bassLock?: string | null
  timingFeel?: string | null
  family?: string | null
  primaryGenre?: string | null
  subgenre?: string | null
  notes?: string | null
}

export type GenreScorecardRow = {
  id: string
  title?: string
  expectedPrimary: string
  predictedPrimary: string
  expectedFamily?: string | null
  predictedFamily: string
  expectedDrumFamily?: string | null
  okPrimary: boolean
  okFamily: boolean
  source: GenreEngineResult['source']
  ruleId?: string
  confidence: number
}

export type GenreScorecard = {
  total: number
  primaryHits: number
  familyHits: number
  primaryAccuracy: number
  familyAccuracy: number
  mismatches: GenreScorecardRow[]
  rows: GenreScorecardRow[]
}

const RULESET = engineRulesJson as GenreEngineRuleset

function norm(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function genreKeyMatch(a: string, b: string): boolean {
  const left = norm(a)
  const right = norm(b)
  if (!left || !right) return false
  return left === right || left.includes(right) || right.includes(left)
}

function ruleMatches(
  rule: GenreEngineRule,
  measured: {
    bpm?: number | null
    drumFamily?: string | null
    bassLock?: string | null
    hatGrid?: string | null
    timingFeel?: string | null
  },
): boolean {
  const when = rule.when || {}
  const family = String(measured.drumFamily || 'unknown')
  if (when.drumFamily?.length && !when.drumFamily.includes(family)) return false

  const bpm = Number(measured.bpm)
  if (when.bpmMin != null && !(Number.isFinite(bpm) && bpm >= when.bpmMin)) return false
  if (when.bpmMax != null && !(Number.isFinite(bpm) && bpm <= when.bpmMax)) return false

  const bass = String(measured.bassLock || 'unknown')
  if (when.bassLock?.length && !when.bassLock.includes(bass)) return false
  if (when.notBassLock?.length && when.notBassLock.includes(bass)) return false

  const hats = String(measured.hatGrid || '')
  if (when.hatGrid?.length && !when.hatGrid.includes(hats)) return false

  const feel = String(measured.timingFeel || '')
  if (when.timingFeel?.length && !when.timingFeel.includes(feel)) return false

  return true
}

export function listGenreEngineRules(ruleset: GenreEngineRuleset = RULESET): GenreEngineRule[] {
  return [...(ruleset.rules || [])].sort((a, b) => (b.priority || 0) - (a.priority || 0))
}

export function applyGenreEngineOverlay(
  base: GrooveClassification,
  measured: {
    bpm?: number | null
    drumFamily?: DrumFamily | string | null
    bass?: { lock?: string | null } | null
    timingFeel?: string | null
    percussion?: { hatGrid?: string | null } | null
  },
  ruleset: GenreEngineRuleset = RULESET,
): GenreEngineResult {
  const ctx = {
    bpm: measured.bpm,
    drumFamily: measured.drumFamily,
    bassLock: measured.bass?.lock || null,
    hatGrid: measured.percussion?.hatGrid || null,
    timingFeel: measured.timingFeel || null,
  }
  for (const rule of listGenreEngineRules(ruleset)) {
    if (!ruleMatches(rule, ctx)) continue
    return {
      family: rule.then.family,
      primary: rule.then.primary,
      subgenre: rule.then.subgenre,
      confidence: Math.max(base.confidence, rule.then.confidence),
      reason: [...base.reason, `overlay:${rule.id}`, ...rule.then.reason],
      timingFeel: base.timingFeel,
      effectiveBpm: base.effectiveBpm,
      source: 'overlay',
      ruleId: rule.id,
    }
  }
  return { ...base, source: 'base' }
}

/** DSP classify + trained overlay (unified genre engine entry). */
export function classifyWithGenreEngine(
  measured: Parameters<typeof classifyGroove>[0],
  ruleset: GenreEngineRuleset = RULESET,
): GenreEngineResult {
  const base = classifyGroove(measured)
  return applyGenreEngineOverlay(base, measured, ruleset)
}

export function classifyMeasuredWithGenreEngine(
  measured: SonicDnaMeasured,
  ruleset: GenreEngineRuleset = RULESET,
): GenreEngineResult {
  return classifyWithGenreEngine(
    {
      bpm: measured.bpm,
      drumFamily: measured.drumFamily,
      bass: measured.bass,
      timingFeel: measured.timingFeel,
      swingPercent: measured.swingPercent,
      percussion: measured.percussion,
      instruments: measured.instruments,
      fourRatio: (measured as { fourRatio?: number }).fourRatio,
      snareSteps: measured.snareSteps,
      spectral: (measured as { spectral?: { relative?: Record<string, number> } }).spectral,
    },
    ruleset,
  )
}

export function scoreGenreEngineAgainstGold(
  goldTracks: GoldTrackLabel[],
  measuredById: Record<string, Parameters<typeof classifyGroove>[0] | null | undefined>,
  ruleset: GenreEngineRuleset = RULESET,
): GenreScorecard {
  const rows: GenreScorecardRow[] = []
  for (const gold of goldTracks) {
    const measured = measuredById[gold.id]
    if (!measured) continue
    const predicted = classifyWithGenreEngine(
      {
        bpm: measured.bpm ?? gold.bpm,
        drumFamily: measured.drumFamily ?? gold.drumFamily,
        bass: measured.bass || { lock: gold.bassLock || 'unknown' },
        timingFeel: measured.timingFeel ?? gold.timingFeel,
        percussion: measured.percussion,
        instruments: measured.instruments,
        fourRatio: measured.fourRatio,
        snareSteps: measured.snareSteps,
        spectral: measured.spectral,
      },
      ruleset,
    )
    const expectedPrimary = String(gold.primaryGenre || '')
    const expectedFamily = gold.family || null
    const row: GenreScorecardRow = {
      id: gold.id,
      title: gold.title,
      expectedPrimary,
      predictedPrimary: predicted.primary,
      expectedFamily,
      predictedFamily: predicted.family,
      expectedDrumFamily: gold.drumFamily || null,
      okPrimary: genreKeyMatch(expectedPrimary, predicted.primary),
      okFamily: expectedFamily ? genreKeyMatch(expectedFamily, predicted.family) : true,
      source: predicted.source,
      ruleId: predicted.ruleId,
      confidence: predicted.confidence,
    }
    rows.push(row)
  }
  const primaryHits = rows.filter((r) => r.okPrimary).length
  const familyHits = rows.filter((r) => r.okFamily).length
  return {
    total: rows.length,
    primaryHits,
    familyHits,
    primaryAccuracy: rows.length ? primaryHits / rows.length : 0,
    familyAccuracy: rows.length ? familyHits / rows.length : 0,
    mismatches: rows.filter((r) => !r.okPrimary || !r.okFamily),
    rows,
  }
}

/**
 * Propose overlay rules from gold mismatches + optional admin guidance.
 * Does not auto-write production rules — returns candidates for review/train script.
 */
export function proposeGenreEngineUpdates(opts: {
  scorecard: GenreScorecard
  adminGuidance?: string
}): GenreEngineRule[] {
  const proposals: GenreEngineRule[] = []
  const seen = new Set<string>()

  for (const row of opts.scorecard.mismatches) {
    const id = `gold-fix-${row.id.slice(0, 8)}`
    if (seen.has(id)) continue
    seen.add(id)
    proposals.push({
      id,
      priority: 70,
      notes: `Auto-proposed from gold mismatch: expected ${row.expectedPrimary}, got ${row.predictedPrimary}. ${row.title || ''}`.trim(),
      when: {
        drumFamily: row.expectedDrumFamily ? [String(row.expectedDrumFamily)] : undefined,
      },
      then: {
        family: String(row.expectedFamily || row.expectedPrimary),
        primary: row.expectedPrimary,
        subgenre: null,
        confidence: 0.88,
        reason: [`gold-set override candidate for ${row.title || row.id}`],
      },
    })
  }

  const guidance = opts.adminGuidance?.trim()
  if (guidance && /liquid|jungle|breaks|dnb|drum\s*&?\s*bass/i.test(guidance)) {
    proposals.push({
      id: 'admin-guidance-breaks-liquid',
      priority: 75,
      notes: `From Accuracy Challenge / admin guidance: ${guidance.slice(0, 160)}`,
      when: {
        drumFamily: ['breakbeat'],
        bpmMin: 148,
        bpmMax: 174,
      },
      then: {
        family: 'Drum & Bass',
        primary: 'Drum & Bass',
        subgenre: /jungle/i.test(guidance) && !/liquid/i.test(guidance) ? 'Jungle' : 'Liquid DnB',
        confidence: 0.83,
        reason: ['admin accuracy guidance for breaks / liquid DnB feel'],
      },
    })
  }

  return proposals
}
