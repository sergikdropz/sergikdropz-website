/**
 * Technical instrument usage analysis — bass type, keys, percussion, synths.
 * Ground truth from Python measure; TS inference fills gaps on older DNA.
 */

import { extractMeasured, type SonicDnaMeasured } from '@/lib/audio/sonic-dna-quality'

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
  /** How the element functions in the arrangement. */
  usage?: string
}

export interface InstrumentUsage {
  bass?: InstrumentUsageEntry | null
  entries: InstrumentUsageEntry[]
  lines?: string[]
  summary?: string
  analyzedAt?: string
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {}
}

function clampConfidence(value: number): number {
  return Math.round(Math.min(0.95, Math.max(0.28, value)) * 1000) / 1000
}

function uniqueEntries(entries: InstrumentUsageEntry[]): InstrumentUsageEntry[] {
  const seen = new Set<string>()
  const out: InstrumentUsageEntry[] = []
  for (const entry of entries) {
    const key = `${entry.category}:${entry.type.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(entry)
  }
  return out.sort((a, b) => b.confidence - a.confidence)
}

function spectralRel(measured: SonicDnaMeasured | Record<string, any>): Record<string, number> {
  return asRecord(asRecord(measured.spectral).relative)
}

function instrumentIds(measured: SonicDnaMeasured | Record<string, any>): Set<string> {
  return new Set(
    ((measured.instruments as Array<{ id?: string }>) || [])
      .filter((item) => (item as { confidence?: number }).confidence == null || Number((item as { confidence?: number }).confidence) >= 0.28)
      .map((item) => String(item.id || '')),
  )
}

function bassUsageText(type: string, lock?: string | null): string {
  const map: Record<string, string> = {
    '808-sub': 'Low end is carried by tuned 808/sub hits — electronic bass as kick and melody.',
    'sub-synth': 'Sub is a designed synth voice — modulated low end without acoustic body.',
    'synth-bass': 'Bass is a synth patch locked to the groove pocket.',
    'reese-bass': 'Reese-style modulated bass — detuned saw/sub stack as the low-end lead.',
    'electric-bass': 'Electric bass guitar tone in the low-mid — fingered or picked pocket.',
    'upright-bass': 'Upright/acoustic bass warmth — bow or pluck in the low register.',
    'pedal-bass': 'Pedal/root bass drone — harmonic anchor more than melodic line.',
  }
  return map[type] || (lock ? `Bass reads as ${type} with a ${lock} pocket.` : `Bass reads as ${type}.`)
}

function inferBassEntry(
  measured: SonicDnaMeasured | Record<string, any>,
  rel: Record<string, number>,
  ids: Set<string>,
): InstrumentUsageEntry | null {
  const lock = String(asRecord(measured.bass).lock || '')
  const flux = Number(asRecord(measured.spectral).chromaFlux ?? asRecord(measured.spectral).flux ?? 0)
  const flatness = Number(asRecord(measured.spectral).flatness ?? 0)
  const subHeavy = rel.sub > 0.14 || rel.bass > 0.2
  const has808 = ids.has('bass') && /808|sub/i.test(
    String(((measured.instruments as Array<{ id?: string; label?: string }>) || []).find((i) => i.id === 'bass')?.label || ''),
  )

  if (lock === 'sparse-808' || has808) {
    return {
      type: '808-sub',
      category: 'bass',
      role: 'low-end',
      confidence: clampConfidence(0.72 + (lock === 'sparse-808' ? 0.12 : 0)),
      source: 'measured',
      evidence: `bass.lock=${lock || 'sparse-808'}; sub band`,
      usage: bassUsageText('808-sub', lock),
    }
  }
  if (flux > 0.16 && subHeavy) {
    return {
      type: 'reese-bass',
      category: 'bass',
      role: 'low-end',
      confidence: clampConfidence(0.55 + flux),
      source: 'inferred',
      evidence: 'high chroma flux + sub energy',
      usage: bassUsageText('reese-bass', lock),
    }
  }
  if (lock === 'pedal-root') {
    return {
      type: 'pedal-bass',
      category: 'bass',
      role: 'harmonic-anchor',
      confidence: 0.62,
      source: 'measured',
      evidence: 'bass.lock=pedal-root',
      usage: bassUsageText('pedal-bass', lock),
    }
  }
  if (flatness > 0.32 && rel.bass > 0.12) {
    return {
      type: 'sub-synth',
      category: 'bass',
      role: 'low-end',
      confidence: clampConfidence(0.48 + rel.bass),
      source: 'inferred',
      evidence: 'spectral flatness + bass band',
      usage: bassUsageText('sub-synth', lock),
    }
  }
  if (rel.lowMid > 0.14 && rel.bass > 0.1 && flux < 0.12) {
    const upright = rel.mid < 0.12 && flatness < 0.28
    return {
      type: upright ? 'upright-bass' : 'electric-bass',
      category: 'bass',
      role: 'pocket',
      confidence: clampConfidence(0.42 + rel.lowMid),
      source: 'inferred',
      evidence: upright ? 'warm low-mid, low flux' : 'low-mid body, moderate flux',
      usage: bassUsageText(upright ? 'upright-bass' : 'electric-bass', lock),
    }
  }
  if (ids.has('bass') || subHeavy) {
    return {
      type: 'synth-bass',
      category: 'bass',
      role: 'pocket',
      confidence: clampConfidence(0.45 + rel.bass),
      source: ids.has('bass') ? 'measured' : 'inferred',
      evidence: 'bass spectral role',
      usage: bassUsageText('synth-bass', lock),
    }
  }
  return null
}

function inferKeysEntries(
  measured: SonicDnaMeasured | Record<string, any>,
  rel: Record<string, number>,
  ids: Set<string>,
): InstrumentUsageEntry[] {
  if (!ids.has('harmonic-pad') && rel.mid + rel.lowMid < 0.22) return []
  const flatness = Number(asRecord(measured.spectral).flatness ?? 0)
  const flux = Number(asRecord(measured.spectral).chromaFlux ?? 0)
  const centroid = Number(asRecord(measured.spectral).centroidHz ?? 0)
  const entries: InstrumentUsageEntry[] = []

  if (centroid > 1800 && flux < 0.1) {
    entries.push({
      type: 'piano',
      category: 'keys',
      role: 'harmony',
      confidence: clampConfidence(0.44 + rel.mid),
      source: 'inferred',
      evidence: 'bright centroid, stable chroma',
      usage: 'Piano or bright keys carry harmonic weight in the mid register.',
    })
  } else if (rel.lowMid > 0.12 && flux < 0.11) {
    entries.push({
      type: 'rhodes',
      category: 'keys',
      role: 'harmony',
      confidence: clampConfidence(0.46 + rel.lowMid),
      source: 'inferred',
      evidence: 'warm low-mid harmonic bed',
      usage: 'Rhodes-like electric keys add warm harmonic padding.',
    })
  } else if (flatness < 0.25 && rel.mid > 0.1) {
    entries.push({
      type: 'organ',
      category: 'keys',
      role: 'harmony',
      confidence: clampConfidence(0.4 + rel.mid),
      source: 'inferred',
      evidence: 'sustained mid harmonic',
      usage: 'Organ or sustained keys hold harmonic color behind the groove.',
    })
  }

  if (ids.has('harmonic-pad')) {
    entries.push({
      type: entries.length ? entries[0].type : 'pad',
      category: 'keys',
      role: 'harmony',
      confidence: clampConfidence(0.52 + rel.mid),
      source: 'measured',
      evidence: 'sustained harmonic spectral role',
      usage: 'Sustained keys/pad bed supports the groove without dominating the kick.',
    })
  }
  return uniqueEntries(entries)
}

function inferPercussionEntries(
  measured: SonicDnaMeasured | Record<string, any>,
  rel: Record<string, number>,
  ids: Set<string>,
): InstrumentUsageEntry[] {
  const perc = asRecord(measured.percussion)
  const styles = Array.isArray(perc.styles) ? perc.styles.map(String) : []
  const hatGrid = String(perc.hatGrid || '')
  const zcr = Number(asRecord(measured.spectral).zeroCrossingRate ?? 0)
  const entries: InstrumentUsageEntry[] = []

  if (ids.has('hats-cymbals') || hatGrid !== 'open-or-minimal') {
    entries.push({
      type: hatGrid === 'offbeat-hats' ? 'offbeat-hats' : 'hi-hats',
      category: 'percussion',
      role: 'timekeeping',
      confidence: clampConfidence(0.55 + rel.air * 0.5),
      source: ids.has('hats-cymbals') ? 'measured' : 'inferred',
      evidence: `hatGrid=${hatGrid || 'present'}`,
      usage:
        hatGrid === 'offbeat-hats'
          ? 'Offbeat hi-hats ride the pocket — disco/house timekeeping.'
          : hatGrid === '16th-wash'
            ? '16th-note hats create continuous rhythmic pressure.'
            : 'Hi-hats/cymbals mark subdivisions above the kick.',
    })
  }
  if (ids.has('snare-clap')) {
    entries.push({
      type: /half-time/i.test(String(perc.snareRole || '')) ? 'half-time-snare' : 'snare-clap',
      category: 'percussion',
      role: 'backbeat',
      confidence: 0.62,
      source: 'measured',
      evidence: String(perc.snareRole || 'snare role'),
      usage: 'Snare/clap defines the backbeat cadence against the kick.',
    })
  }
  if (ids.has('kick-drum')) {
    entries.push({
      type: 'kick-drum',
      category: 'percussion',
      role: 'pulse',
      confidence: 0.65,
      source: 'measured',
      evidence: String(perc.kickRole || 'kick role'),
      usage: 'Kick drum anchors the pulse and body map of the track.',
    })
  }

  if (zcr > 0.08 && rel.air > 0.1 && rel.presence > 0.08) {
    entries.push({
      type: 'shaker',
      category: 'percussion',
      role: 'texture',
      confidence: clampConfidence(0.38 + zcr + rel.air),
      source: 'inferred',
      evidence: 'high ZCR + air band',
      usage: 'Shaker or granular percussion adds high-frequency shuffle and lift.',
    })
  }
  if (rel.lowMid > 0.13 && rel.presence > 0.09 && styles.some((s) => /swung|syncopated|disco/i.test(s))) {
    entries.push({
      type: 'conga',
      category: 'percussion',
      role: 'groove',
      confidence: clampConfidence(0.4 + rel.lowMid),
      source: 'inferred',
      evidence: 'low-mid hand-drum band + syncopated grid',
      usage: 'Conga or hand-drum hits add syncopated Latin/disco color.',
    })
  }
  if (rel.lowMid > 0.11 && rel.mid > 0.1 && perc.kickSyncopation != null && Number(perc.kickSyncopation) > 0.35) {
    entries.push({
      type: 'bongo',
      category: 'percussion',
      role: 'groove',
      confidence: clampConfidence(0.36 + rel.lowMid),
      source: 'inferred',
      evidence: 'syncopated kick + mid percussion',
      usage: 'Bongo or tight hand percussion fills off-beat pockets.',
    })
  }
  if (styles.includes('swung') || Number(measured.swingPercent) >= 22) {
    entries.push({
      type: 'percussion-layer',
      category: 'percussion',
      role: 'swing',
      confidence: 0.42,
      source: 'inferred',
      evidence: 'swing on grid',
      usage: 'Swung percussion layer loosens the grid for funk/house feel.',
    })
  }
  return uniqueEntries(entries)
}

function inferSynthEntries(
  measured: SonicDnaMeasured | Record<string, any>,
  rel: Record<string, number>,
  ids: Set<string>,
): InstrumentUsageEntry[] {
  const flatness = Number(asRecord(measured.spectral).flatness ?? 0)
  const flux = Number(asRecord(measured.spectral).chromaFlux ?? 0)
  const entries: InstrumentUsageEntry[] = []

  if (ids.has('mid-lead')) {
    entries.push({
      type: flux > 0.14 ? 'modulated-lead' : 'synth-lead',
      category: 'synth',
      role: 'lead',
      confidence: clampConfidence(0.5 + rel.mid),
      source: 'measured',
      evidence: 'mid-range pitched lead spectral role',
      usage: 'Synth lead carries melodic focus in the mid/presence range.',
    })
  }
  if (ids.has('plucked-mid')) {
    entries.push({
      type: 'pluck-synth',
      category: 'synth',
      role: 'rhythm-harmony',
      confidence: clampConfidence(0.48 + flux),
      source: 'measured',
      evidence: 'plucked harmonic + chroma motion',
      usage: 'Plucked synth or guitar-like stabs punctuate the groove.',
    })
  }
  if (flatness > 0.34 && rel.presence > 0.1) {
    entries.push({
      type: 'noise-fx',
      category: 'fx',
      role: 'texture',
      confidence: clampConfidence(0.42 + flatness * 0.3),
      source: 'inferred',
      evidence: 'high spectral flatness',
      usage: 'Noise/FX texture fills space and adds tension between drops.',
    })
  }
  if (ids.has('texture-fx')) {
    entries.push({
      type: 'atmospheric-fx',
      category: 'fx',
      role: 'texture',
      confidence: 0.55,
      source: 'measured',
      evidence: 'noise/FX spectral role',
      usage: 'Atmospheric FX and noise beds widen the stereo field.',
    })
  }
  if (rel.mid > 0.15 && rel.presence > 0.12 && !ids.has('harmonic-pad')) {
    entries.push({
      type: 'arp-synth',
      category: 'synth',
      role: 'motion',
      confidence: clampConfidence(0.38 + rel.presence),
      source: 'inferred',
      evidence: 'active mid/presence energy',
      usage: 'Arpeggiated or moving synth lines add harmonic motion.',
    })
  }
  return uniqueEntries(entries)
}

/** Infer structured instrument usage from measured groove + spectral roles. */
export function inferInstrumentUsageFromMeasured(measuredInput: SonicDnaMeasured | Record<string, any> | null): InstrumentUsage {
  if (!measuredInput || typeof measuredInput !== 'object') {
    return { entries: [] }
  }
  const measured = measuredInput
  const existing = asRecord(measured.instrumentUsage) as InstrumentUsage
  if (Array.isArray(existing.entries) && existing.entries.length >= 2 && existing.summary) {
    return {
      ...existing,
      entries: uniqueEntries(existing.entries),
      bass: existing.bass || existing.entries.find((e) => e.category === 'bass') || null,
    }
  }

  const rel = spectralRel(measured)
  const ids = instrumentIds(measured)
  const bass = inferBassEntry(measured, rel, ids)
  const entries = uniqueEntries([
    ...(bass ? [bass] : []),
    ...inferKeysEntries(measured, rel, ids),
    ...inferPercussionEntries(measured, rel, ids),
    ...inferSynthEntries(measured, rel, ids),
  ])

  const lines = composeInstrumentationLinesFromUsage({ bass, entries })
  const summary = lines.slice(0, 4).join(' ')

  return {
    bass: bass || entries.find((e) => e.category === 'bass') || null,
    entries,
    lines,
    summary,
    analyzedAt: new Date().toISOString(),
  }
}

export function composeInstrumentationLinesFromUsage(usage: InstrumentUsage): string[] {
  const lines: string[] = []
  if (usage.bass?.usage) lines.push(usage.bass.usage)
  for (const entry of usage.entries) {
    if (entry.category === 'bass' && entry.type === usage.bass?.type) continue
    if ((entry.confidence || 0) < 0.38) continue
    if (entry.usage) {
      lines.push(entry.usage)
      continue
    }
    lines.push(
      `${entry.type.replace(/-/g, ' ')} (${entry.category}) — ${entry.source} confidence ${Math.round(entry.confidence * 100)}%.`,
    )
  }
  return [...new Set(lines.map((l) => l.trim()).filter(Boolean))]
}

export function extractInstrumentTypes(usage: InstrumentUsage | null | undefined): string[] {
  if (!usage?.entries?.length) return []
  return uniqueEntries(usage.entries)
    .filter((e) => e.confidence >= 0.38)
    .map((e) => e.type.replace(/-/g, ' '))
}

export function instrumentUsageChips(dna: unknown): Array<{ label: string; category: InstrumentCategory; confidence: number }> {
  const measured = extractMeasured(dna)
  if (!measured) return []
  const usage =
    (asRecord(measured.instrumentUsage) as InstrumentUsage)?.entries?.length
      ? (asRecord(measured.instrumentUsage) as InstrumentUsage)
      : inferInstrumentUsageFromMeasured(measured)
  return usage.entries
    .filter((e) => e.confidence >= 0.4)
    .slice(0, 12)
    .map((e) => ({
      label: e.type.replace(/-/g, ' '),
      category: e.category,
      confidence: e.confidence,
    }))
}

/** Narrative instrumentation section for Sonic DNA report. */
export function composeInstrumentationSection(dna: unknown): string {
  const measured = extractMeasured(dna)
  if (!measured) return ''
  const stored = String(asRecord(measured.intelligence).instrumentationText || '').trim()
  if (stored && !/awaiting audio analysis/i.test(stored)) return stored

  const usage =
    (asRecord(measured.instrumentUsage) as InstrumentUsage)?.entries?.length
      ? (asRecord(measured.instrumentUsage) as InstrumentUsage)
      : inferInstrumentUsageFromMeasured(measured)

  const lines = usage.lines?.length ? usage.lines : composeInstrumentationLinesFromUsage(usage)
  if (!lines.length) {
    const scene = (measured.instruments || [])
      .filter((i) => (i.confidence || 0) >= 0.4)
      .map((i) => i.label)
    if (scene.length) {
      return `Spectral instrument scene (roles, not sample names): ${scene.join(', ')}. Re-run audio analysis for bass type, keys, and percussion detail.`
    }
    return ''
  }

  const header =
    'Technical instrument usage — what sources are in the mix and how they function (confidence tiers: measured > inferred > agent).'
  const grouped = {
    bass: usage.entries.filter((e) => e.category === 'bass'),
    keys: usage.entries.filter((e) => e.category === 'keys'),
    percussion: usage.entries.filter((e) => e.category === 'percussion'),
    synth: usage.entries.filter((e) => e.category === 'synth' || e.category === 'fx'),
  }

  const blocks: string[] = [header]
  if (grouped.bass.length) blocks.push(`Bass: ${grouped.bass.map((e) => e.type.replace(/-/g, ' ')).join(', ')}.`)
  if (grouped.keys.length) blocks.push(`Keys: ${grouped.keys.map((e) => e.type.replace(/-/g, ' ')).join(', ')}.`)
  if (grouped.percussion.length) {
    blocks.push(`Percussion: ${grouped.percussion.map((e) => e.type.replace(/-/g, ' ')).join(', ')}.`)
  }
  if (grouped.synth.length) blocks.push(`Synths & texture: ${grouped.synth.map((e) => e.type.replace(/-/g, ' ')).join(', ')}.`)

  blocks.push(lines.join(' '))
  return blocks.join('\n\n')
}

export function composeInstrumentationLines(dna: unknown): string[] {
  const text = composeInstrumentationSection(dna)
  if (!text) return []
  return text
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
}

export function mergeInstrumentUsage(base: InstrumentUsage | null, overlay: InstrumentUsage | null): InstrumentUsage {
  const merged = uniqueEntries([...(base?.entries || []), ...(overlay?.entries || [])])
  const bass =
    (overlay?.bass && overlay.bass.confidence >= (base?.bass?.confidence || 0) ? overlay.bass : null) ||
    base?.bass ||
    merged.find((e) => e.category === 'bass') ||
    null
  const lines = composeInstrumentationLinesFromUsage({ bass, entries: merged })
  return {
    bass,
    entries: merged,
    lines,
    summary: overlay?.summary || base?.summary || lines.slice(0, 3).join(' '),
    analyzedAt: overlay?.analyzedAt || base?.analyzedAt || new Date().toISOString(),
  }
}

/** Ensure measured.instrumentUsage is populated on DNA root. */
export function ensureInstrumentUsageOnDna(dna: unknown): Record<string, any> {
  const root = dna && typeof dna === 'object' ? ({ ...(dna as Record<string, any>) } as Record<string, any>) : {}
  if (!root.measured || typeof root.measured !== 'object') root.measured = {}
  const measured = root.measured as Record<string, any>
  const existing = asRecord(measured.instrumentUsage) as InstrumentUsage
  const inferred = inferInstrumentUsageFromMeasured(measured)
  measured.instrumentUsage = mergeInstrumentUsage(
    existing.entries?.length ? existing : null,
    inferred,
  )
  if (!asRecord(measured.intelligence).instrumentationText && measured.instrumentUsage.lines?.length) {
    measured.intelligence = {
      ...asRecord(measured.intelligence),
      instrumentationText: composeInstrumentationSection(root),
    }
  }
  root.measured = measured
  return root
}
