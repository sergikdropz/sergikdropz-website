/**
 * Publish checklist — “good enough” gate for public Sonic DNA surfaces.
 */

import { assessSonicDnaPipeline } from '@/lib/audio/sonic-dna-pipeline'
import { listSonicDnaReportSections } from '@/lib/audio/sonic-dna-report-sections'
import { extractMeasured } from '@/lib/audio/sonic-dna-quality'

export type PublishChecklistItem = {
  id: string
  label: string
  ok: boolean
}

export type PublishChecklist = {
  ready: boolean
  items: PublishChecklistItem[]
}

/** True when description cites measured BPM and/or drum family (flexible wording). */
export function descriptionQuotesMeasuredGrid(
  description: string,
  measured: ReturnType<typeof extractMeasured>,
): boolean {
  const text = String(description || '').trim()
  if (text.length < 60) return false
  if (/BPM:|Drums:|Groove class:|Measured:/i.test(text)) return true
  const bpm = measured?.bpm != null ? String(Math.round(Number(measured.bpm))) : ''
  const drums = String(measured?.drumFamily || '').toLowerCase()
  const t = text.toLowerCase()
  const hasBpm = Boolean(bpm && (t.includes(`${bpm} bpm`) || t.includes(`bpm ${bpm}`) || t.includes(`${bpm}bpm`)))
  const drumToken = drums && drums !== 'unknown' ? drums.split(/[-_\s]/)[0] : ''
  const hasDrums = Boolean(drumToken && t.includes(drumToken))
  return hasBpm || (hasDrums && /\bbpm\b/i.test(text))
}

export function buildPublishChecklist(dna: unknown, opts?: { hasWaveform?: boolean }): PublishChecklist {
  const pipeline = assessSonicDnaPipeline(dna)
  const measured = extractMeasured(dna)
  const sections = listSonicDnaReportSections(dna)
  const description = sections.find((s) => s.id === 'description')?.text || ''
  const benefits = sections.find((s) => s.id === 'benefits')?.text || ''
  const items: PublishChecklistItem[] = [
    { id: 'groove', label: 'Groove core (BPM + drums)', ok: pipeline.hasGrooveCore },
    { id: 'key', label: 'Key or unpitched', ok: pipeline.hasFullDsp || Boolean(measured?.unpitched) },
    { id: 'waveform', label: 'Waveform envelope', ok: opts?.hasWaveform !== false },
    {
      id: 'description',
      label: 'Description quotes measured grid',
      ok: descriptionQuotesMeasuredGrid(description, measured),
    },
    { id: 'benefits', label: 'Listening benefits filled', ok: benefits.length > 40 },
    { id: 'not_preference_only', label: 'Genre not preference-only', ok: !pipeline.preferenceOnly },
  ]
  return { ready: items.every((i) => i.ok), items }
}
