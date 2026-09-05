/**
 * Stamp v2 enrichments onto a Sonic DNA object after measure/normalize.
 */

import { extractMeasured, sonicDnaStatusFromMeasured } from '@/lib/audio/sonic-dna-quality'
import { hasGrooveCore } from '@/lib/audio/sonic-dna-pipeline'
import { applyGenreEncyclopedia } from '@/lib/audio/compose-genre-intelligence'
import {
  ensureSonicDnaReportSectionsFilled,
  listSonicDnaReportSections,
} from '@/lib/audio/sonic-dna-report-sections'
import { SONIC_DNA_RECIPE_ID } from './recipe'
import { buildPocketFingerprint } from './pocket-fingerprint'
import { buildCreativeInsights, type CreativeInsights } from './creative-insights'
import { buildEvidenceLedger } from './evidence-ledger'
import { dynamicsProse, type WaveformStats } from './waveform-stage'
import { buildPublishChecklist } from './publish-checklist'
import { diffSonicDna } from './diff-narrative'

export type EnrichDnaOptions = {
  waveformStats?: WaveformStats | null
  hasWaveform?: boolean
  energy?: number | null
  previousDna?: unknown
  runCompose?: boolean
  durationSec?: number | null
  peaks?: Array<number | { positive?: number; negative?: number; rms?: number }> | null
}

export function enrichSonicDnaV2(dna: unknown, opts: EnrichDnaOptions = {}): Record<string, unknown> {
  const base =
    dna && typeof dna === 'object' && !Array.isArray(dna)
      ? ({ ...(dna as Record<string, unknown>) } as Record<string, unknown>)
      : {}

  // Encyclopedia first so section fill + creative insights see full history/psycho layers.
  const withEncyclopedia = applyGenreEncyclopedia(base) as Record<string, unknown>
  let next: Record<string, unknown> =
    opts.runCompose !== false ? ensureSonicDnaReportSectionsFilled(withEncyclopedia) : withEncyclopedia
  const measured = extractMeasured(next)
  const pocket = buildPocketFingerprint(measured)
  const insights: CreativeInsights = buildCreativeInsights({
    measured,
    waveformStats: opts.waveformStats,
    energy: opts.energy ?? (next.technical as { energyLevel?: number } | undefined)?.energyLevel,
    pocket,
    durationSec: opts.durationSec,
    peaks: opts.peaks,
  })

  const sections = listSonicDnaReportSections(next)
  const ledger = buildEvidenceLedger(sections, {
    hasGrooveCore: hasGrooveCore(measured),
    measuredFields: ['BPM', 'Drums', 'Key', 'Groove class', 'bass', 'swing', 'timing'],
  })
  const checklist = buildPublishChecklist(next, { hasWaveform: opts.hasWaveform })
  const diff = opts.previousDna ? diffSonicDna(opts.previousDna, next) : null

  const dyn = dynamicsProse(opts.waveformStats)
  if (dyn && measured) {
    const m = { ...(measured as Record<string, unknown>) }
    const report = {
      ...((m.report as Record<string, unknown>) || {}),
      dynamics: dyn,
    }
    m.report = report
    m.dynamics = opts.waveformStats
    next = { ...next, measured: m }
  }

  next.recipeId = SONIC_DNA_RECIPE_ID
  next.pipelineV2 = {
    recipeId: SONIC_DNA_RECIPE_ID,
    pocket,
    insights,
    evidence: ledger,
    publishChecklist: checklist,
    lastDiff: diff,
    enrichedAt: new Date().toISOString(),
  }
  next.sonicDnaStatusHint = sonicDnaStatusFromMeasured(extractMeasured(next))

  // Surface mix / floor for report consumers
  if (!next.intention || typeof next.intention !== 'object') {
    next.intention = {}
  }
  const intention = { ...(next.intention as Record<string, unknown>) }
  intention.floorHypothesis = insights.floor
  intention.mixNotes = insights.mixNotes
  intention.segments = insights.segments
  next.intention = intention

  return next
}
