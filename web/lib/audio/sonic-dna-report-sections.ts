import { extractMeasured, type SonicDnaMeasured } from '@/lib/audio/sonic-dna-quality'
import { ensureMeasuredOnDna, normalizeAgentDnaToMeasured } from '@/lib/audio/normalize-agent-to-measured'
import { applyGenreEncyclopedia } from '@/lib/audio/compose-genre-intelligence'
import {
  composeDetailedTrackDescription,
  composeListeningBenefits,
  composeRelatedTraditionsSection,
  composeUsageSection,
  collectRelatedTraditions,
  composeUsageLines,
  hasUnifiedSonicDnaIntelligence,
} from '@/lib/audio/compose-unified-sonic-dna'
import {
  assessSonicDnaPipeline,
  hasGrooveCore,
  stripUnsupportedEncyclopedia,
} from '@/lib/audio/sonic-dna-pipeline'
import {
  composeInstrumentationSection,
  composeInstrumentationLines,
  ensureInstrumentUsageOnDna,
} from '@/lib/audio/instrument-usage'

export const SONIC_DNA_REPORT_SECTION_IDS = [
  'groove',
  'usage',
  'instrumentation',
  'description',
  'benefits',
  'intention',
  'dsp',
  'related',
  'history',
  'culture',
  'psychology',
  'psychoacoustics',
  'musicology',
] as const

export type SonicDnaReportSectionId = (typeof SONIC_DNA_REPORT_SECTION_IDS)[number]

export type SonicDnaReportSection = {
  id: SonicDnaReportSectionId
  title: string
  hint: string
  measuredLocked: boolean
  text: string
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {}
}

/** Pipeline gate stub — treat as empty so unlock can recompose. */
export function isAwaitingAudioStub(text: unknown): boolean {
  return /awaiting audio analysis/i.test(String(text || ''))
}

function usableSectionText(text: unknown): string {
  const value = String(text || '').trim()
  if (!value || isAwaitingAudioStub(value)) return ''
  return value
}

function cloneDna(dna: unknown): Record<string, any> {
  try {
    return JSON.parse(JSON.stringify(dna && typeof dna === 'object' ? dna : {}))
  } catch {
    return {}
  }
}

function grooveText(measured: SonicDnaMeasured | null, dna: Record<string, any>): string {
  const lines: string[] = []
  const perc = measured?.percussion
  const bpm = measured?.bpm || dna.technical?.bpm
  const key = measured?.key || dna.harmony?.keySignature || dna.musical?.keySignature
  const genre = measured?.genre?.primary || dna.genres?.primaryGenres?.[0]
  const sub = measured?.genre?.subgenre || dna.genres?.subgenres?.[0]
  if (bpm) {
    lines.push(
      `BPM: ${Math.round(Number(bpm))}${measured?.timingFeel ? ` (${measured.timingFeel})` : ''}${
        measured?.bpmConfidence != null ? ` · conf ${Number(measured.bpmConfidence).toFixed(2)}` : ''
      }`,
    )
  }
  if (measured?.drumFamily) lines.push(`Drums: ${measured.drumFamily}`)
  if (perc?.kickRole) lines.push(`Kick: ${perc.kickRole}`)
  if (perc?.snareRole) lines.push(`Snare: ${perc.snareRole}`)
  if (perc?.hatGrid) lines.push(`Hats: ${perc.hatGrid}`)
  if (measured?.bass?.lock) lines.push(`Bass lock: ${measured.bass.lock}`)
  if (key) lines.push(`Key: ${key}${measured?.camelot ? ` / Camelot ${measured.camelot}` : ''}`)
  if (genre) lines.push(`Groove class: ${genre}${sub ? ` / ${sub}` : ''}`)
  const source = measured?.genre?.source
  if (source) lines.push(`Genre source: ${source}`)
  if (measured?.genre?.judgment) lines.push(`Judgment: ${measured.genre.judgment}`)
  if (measured?.genre?.audioPrimary && measured.genre.audioPrimary !== genre) {
    lines.push(
      `Audio class: ${measured.genre.audioPrimary}${
        measured.genre.audioSubgenre ? ` / ${measured.genre.audioSubgenre}` : ''
      }`,
    )
  }
  const instruments = (measured?.instruments || [])
    .filter((item) => (item.confidence || 0) >= 0.4)
    .map((item) => item.label)
  if (instruments.length) lines.push(`Scene: ${instruments.join(', ')}`)
  const reasons = measured?.genre?.reason
  if (Array.isArray(reasons) && reasons.length) lines.push(`Why: ${reasons.join(' ')}`)
  return lines.join('\n')
}

export function listSonicDnaReportSections(dna: unknown): SonicDnaReportSection[] {
  const root = asRecord(dna)
  let measured = extractMeasured(root)
  if (!hasGrooveCore(measured) && root) {
    measured = normalizeAgentDnaToMeasured(root) || measured
  }
  const layers = asRecord(measured?.report?.layers)
  const intelligence = asRecord(measured?.intelligence)
  const cultural = asRecord(root.cultural)
  const historical = asRecord(root.historical)
  const emotional = asRecord(root.emotional)
  const musicology = asRecord(root.musicology)
  const canFill = hasGrooveCore(measured)
  const awaiting =
    'Awaiting audio analysis. Encyclopedia sections stay empty until BPM and drum grid are measured from the file.'

  const storedOrCompose = (stored: string, composer: () => string) => {
    const text = usableSectionText(stored)
    if (text) return text
    if (!canFill) return awaiting
    return composer()
  }

  return [
    {
      id: 'groove',
      title: 'Measured groove',
      hint: 'From audio (BPM, drums, key, groove class). Edit only if a measurement is wrong.',
      measuredLocked: true,
      text: grooveText(measured, root) || (canFill ? '' : 'No DSP groove yet — re-run audio analysis.'),
    },
    {
      id: 'usage',
      title: 'How percussion and instruments are used',
      hint: 'Kick / snare / hats / bass roles — the usage story of this file.',
      measuredLocked: false,
      text: storedOrCompose(
        Array.isArray(measured?.arrangement?.lines) && measured!.arrangement!.lines!.length
          ? measured!.arrangement!.lines!.join('\n')
          : String(intelligence.usageText || ''),
        () => composeUsageSection(root),
      ),
    },
    {
      id: 'instrumentation',
      title: 'Technical instrumentation',
      hint: 'Bass type, keys, percussion (congas, shakers…), synths — detected usage with confidence.',
      measuredLocked: false,
      text: storedOrCompose(String(intelligence.instrumentationText || ''), () =>
        composeInstrumentationSection(root),
      ),
    },
    {
      id: 'description',
      title: 'Description',
      hint: 'Unified knowledge overview of everything Sonic DNA gathered for this track.',
      measuredLocked: false,
      text: storedOrCompose(
        String(intelligence.description || root.description || measured?.report?.description || ''),
        () => composeDetailedTrackDescription(root),
      ),
    },
    {
      id: 'benefits',
      title: 'Benefits of listening',
      hint: 'What a listener or DJ gains from this groove — derived from the full report.',
      measuredLocked: false,
      text: storedOrCompose(
        String(intelligence.listeningBenefits || root.listeningBenefits || layers.benefits || ''),
        () => composeListeningBenefits(root),
      ),
    },
    {
      id: 'intention',
      title: 'Intention',
      hint: 'What this cut is for on a floor or in a set.',
      measuredLocked: false,
      text: storedOrCompose(String(intelligence.intention || root.intention || ''), () => ''),
    },
    {
      id: 'dsp',
      title: 'DSP / arrangement',
      hint: 'What the file is doing: grid, bass lock, arrangement lines.',
      measuredLocked: false,
      text: storedOrCompose(
        String(
          layers.dsp ||
            (Array.isArray(measured?.report?.facts) ? measured?.report?.facts.join('\n') : '') ||
            '',
        ),
        () => grooveText(measured, root),
      ),
    },
    {
      id: 'related',
      title: 'Related traditions',
      hint: 'World-genre map for this class — not extra crate labels.',
      measuredLocked: false,
      text: storedOrCompose(String(intelligence.relatedTraditionsText || ''), () =>
        composeRelatedTraditionsSection(root),
      ),
    },
    {
      id: 'history',
      title: 'History and science',
      hint: 'Lineage of the measured groove — not crate or folder names.',
      measuredLocked: false,
      text: storedOrCompose(
        String(layers.historical || intelligence.historical?.historicalContext || historical.historicalContext || ''),
        () => '',
      ),
    },
    {
      id: 'culture',
      title: 'Culture',
      hint: 'Where this groove lives socially. Challenge title/folder leakage here.',
      measuredLocked: false,
      text: storedOrCompose(
        String(
          layers.cultural ||
            intelligence.cultural?.description ||
            intelligence.regional?.regionalCharacteristics ||
            cultural.description ||
            '',
        ),
        () => '',
      ),
    },
    {
      id: 'psychology',
      title: 'Psychology',
      hint: 'How the groove is felt in the body and mood arc.',
      measuredLocked: false,
      text: storedOrCompose(
        String(
          layers.psychological ||
            intelligence.emotional?.psychologicalProfile ||
            emotional.psychologicalProfile ||
            '',
        ),
        () => '',
      ),
    },
    {
      id: 'psychoacoustics',
      title: 'Psychoacoustics study',
      hint: 'Social usage, sonic intent, and the DNA formula that activates listener movement and mood.',
      measuredLocked: false,
      text: storedOrCompose(
        String(
          layers.psychoacoustics ||
            intelligence.psychoacoustics?.report ||
            [
              intelligence.psychoacoustics?.socialUsage,
              intelligence.psychoacoustics?.sonicIntent,
              intelligence.psychoacoustics?.activationFormula,
              intelligence.psychoacoustics?.listenerEffects,
            ]
              .filter(Boolean)
              .join(' '),
        ),
        () => '',
      ),
    },
    {
      id: 'musicology',
      title: 'Musicology',
      hint: 'Harmony, rhythm language, and related traditions.',
      measuredLocked: false,
      text: storedOrCompose(
        String(
          layers.musicological ||
            musicology.description ||
            intelligence.musicology?.description ||
            intelligence.musical?.harmonicComplexity ||
            '',
        ),
        () => '',
      ),
    },
  ]
}

export function getSonicDnaReportView(dna: unknown) {
  const root = asRecord(dna)
  const measured = extractMeasured(root)
  const sections = listSonicDnaReportSections(root)
  const byId = Object.fromEntries(sections.map((section) => [section.id, section])) as Record<
    SonicDnaReportSectionId,
    SonicDnaReportSection
  >
  const intel = asRecord(measured?.intelligence)
  const related = collectRelatedTraditions(root)
  const usageLines = composeUsageLines(root)
  const instrumentationLines = composeInstrumentationLines(root)
  const instrumentationChips = (measured?.instrumentUsage?.entries || [])
    .filter((e) => (e.confidence || 0) >= 0.4)
    .map((e) => ({ label: e.type.replace(/-/g, ' '), category: e.category, confidence: e.confidence || 0 }))
  const encyclopedia =
    Boolean(byId.description?.text) ||
    Boolean(byId.benefits?.text) ||
    Boolean(byId.history?.text) ||
    Boolean(byId.culture?.text) ||
    Boolean(byId.psychology?.text) ||
    Boolean(byId.psychoacoustics?.text) ||
    Boolean(byId.musicology?.text)
  return {
    sections,
    byId,
    measured,
    groovePrimary: measured?.genre?.primary || root.genres?.primaryGenres?.[0] || null,
    grooveSub: measured?.genre?.subgenre || root.genres?.subgenres?.[0] || null,
    bpm: measured?.bpm ?? root.technical?.bpm ?? null,
    key: measured?.key || root.harmony?.keySignature || root.musical?.keySignature || null,
    camelot: measured?.camelot || null,
    timingFeel: measured?.timingFeel || null,
    related,
    usageLines,
    instrumentationLines,
    instrumentationChips,
    encyclopedia,
  }
}

/** Parse Measured groove lines (BPM / Drums / Key / …) into measured fields. */
export function parseMeasuredGrooveText(text: string): Partial<SonicDnaMeasured> {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
  const out: Partial<SonicDnaMeasured> = {}
  const genre: NonNullable<SonicDnaMeasured['genre']> = {}
  const percussion: NonNullable<SonicDnaMeasured['percussion']> = {}
  const bass: NonNullable<SonicDnaMeasured['bass']> = {}

  for (const line of lines) {
    const bpmMatch = line.match(/^BPM:\s*([\d.]+)/i)
    if (bpmMatch) {
      const bpm = Number(bpmMatch[1])
      if (Number.isFinite(bpm) && bpm >= 40 && bpm <= 240) {
        out.bpm = Math.round(bpm * 100) / 100
        out.effectiveBpm = Math.round(bpm)
      }
      const feel = line.match(/\(([^)]+)\)/)
      if (feel?.[1] && !/conf/i.test(feel[1])) out.timingFeel = feel[1].trim()
      const conf = line.match(/conf\s*([\d.]+)/i)
      if (conf) {
        const n = Number(conf[1])
        if (Number.isFinite(n)) out.bpmConfidence = n
      }
      continue
    }

    const drums = line.match(/^Drums:\s*(.+)$/i)
    if (drums) {
      out.drumFamily = drums[1].trim()
      continue
    }

    const kick = line.match(/^Kick:\s*(.+)$/i)
    if (kick) {
      percussion.kickRole = kick[1].trim()
      continue
    }
    const snare = line.match(/^Snare:\s*(.+)$/i)
    if (snare) {
      percussion.snareRole = snare[1].trim()
      continue
    }
    const hats = line.match(/^Hats:\s*(.+)$/i)
    if (hats) {
      percussion.hatGrid = hats[1].trim()
      continue
    }

    const bassLock = line.match(/^Bass lock:\s*(.+)$/i)
    if (bassLock) {
      bass.lock = bassLock[1].trim()
      continue
    }

    const keyLine = line.match(/^Key:\s*(.+)$/i)
    if (keyLine) {
      const raw = keyLine[1].trim()
      const camelot = raw.match(/Camelot\s+([0-9]{1,2}[AB])/i)
      if (camelot) out.camelot = camelot[1].toUpperCase()
      const key = raw.split(/\s*\/\s*/)[0]?.trim()
      if (key) {
        out.key = key
        out.unpitched = false
        const parts = key.match(/^([A-G](?:#|b)?)\s+(major|minor)$/i)
        if (parts) {
          out.rootNote = parts[1]
          out.scale = parts[2].toLowerCase()
        }
      }
      continue
    }

    const groove = line.match(/^Groove class:\s*(.+)$/i)
    if (groove) {
      const [primary, subgenre] = groove[1].split(/\s*\/\s*/).map((part) => part.trim())
      if (primary) genre.primary = primary
      if (subgenre) genre.subgenre = subgenre
      continue
    }

    const why = line.match(/^Why:\s*(.+)$/i)
    if (why) {
      genre.reason = why[1]
        .split(/(?<=[.!?])\s+/)
        .map((part) => part.trim())
        .filter(Boolean)
      continue
    }
  }

  if (Object.keys(genre).length) out.genre = genre
  if (Object.keys(percussion).length) out.percussion = percussion
  if (Object.keys(bass).length) out.bass = { ...(out.bass || {}), ...bass }
  return out
}

export function applySonicDnaSectionText(
  dna: unknown,
  sectionId: SonicDnaReportSectionId,
  text: string,
): Record<string, any> {
  const next = cloneDna(dna)
  const value = text.trim()
  if (!next.measured || typeof next.measured !== 'object') next.measured = {}
  if (!next.measured.report || typeof next.measured.report !== 'object') next.measured.report = {}
  if (!next.measured.report.layers || typeof next.measured.report.layers !== 'object') {
    next.measured.report.layers = {}
  }
  if (!next.measured.intelligence || typeof next.measured.intelligence !== 'object') {
    next.measured.intelligence = {}
  }

  if (sectionId === 'groove') {
    const parsed = parseMeasuredGrooveText(value)
    next._adminGrooveNotes = value
    next.measured = {
      ...next.measured,
      ...parsed,
      bass: { ...(next.measured.bass || {}), ...(parsed.bass || {}) },
      percussion: { ...(next.measured.percussion || {}), ...(parsed.percussion || {}) },
      genre: { ...(next.measured.genre || {}), ...(parsed.genre || {}) },
    }
    if (parsed.bpm != null) {
      next.technical = { ...(next.technical || {}), bpm: parsed.bpm }
    }
    if (parsed.key) {
      next.harmony = { ...(next.harmony || {}), keySignature: parsed.key }
      next.musical = { ...(next.musical || {}), keySignature: parsed.key, scale: parsed.scale }
      next.technical = { ...(next.technical || {}), key: parsed.key, camelot: parsed.camelot }
    }
    if (parsed.genre?.primary) {
      next.genres = {
        ...(next.genres || {}),
        primaryGenres: [parsed.genre.primary],
        subgenres: parsed.genre.subgenre ? [parsed.genre.subgenre] : next.genres?.subgenres,
      }
    }
    return next
  }
  if (sectionId === 'description') {
    next.description = value
    next.measured.intelligence.description = value
    next.measured.report.description = value
    return next
  }
  if (sectionId === 'usage') {
    next.measured.arrangement = {
      ...(next.measured.arrangement || {}),
      lines: value
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    }
    next.measured.intelligence.usageText = value
    return next
  }
  if (sectionId === 'instrumentation') {
    next.measured.intelligence.instrumentationText = value
    next.measured.report.layers = {
      ...(next.measured.report.layers || {}),
      instrumentation: value,
    }
    return next
  }
  if (sectionId === 'benefits') {
    next.listeningBenefits = value
    next.measured.intelligence.listeningBenefits = value
    next.measured.report.layers.benefits = value
    return next
  }
  if (sectionId === 'related') {
    next.measured.intelligence.relatedTraditionsText = value
    const names = value
      .split('\n')
      .map((line) => line.replace(/^•\s*/, '').trim())
      .filter((line) => line && !/world-genre map/i.test(line) && !/not extra crate/i.test(line))
    if (names.length) next.measured.intelligence.relatedGenres = names
    return next
  }
  if (sectionId === 'intention') {
    next.intention = value
    next.measured.intelligence.intention = value
    return next
  }
  if (sectionId === 'dsp') {
    next.measured.report.layers.dsp = value
    next.measured.report.facts = value.split('\n').map((line) => line.trim()).filter(Boolean)
    return next
  }
  if (sectionId === 'history') {
    next.measured.report.layers.historical = value
    next.historical = { ...(next.historical || {}), historicalContext: value }
    next.measured.intelligence.historical = {
      ...(next.measured.intelligence.historical || {}),
      historicalContext: value,
    }
    return next
  }
  if (sectionId === 'culture') {
    next.measured.report.layers.cultural = value
    next.cultural = { ...(next.cultural || {}), description: value }
    next.measured.intelligence.cultural = {
      ...(next.measured.intelligence.cultural || {}),
      description: value,
    }
    return next
  }
  if (sectionId === 'psychology') {
    next.measured.report.layers.psychological = value
    next.emotional = { ...(next.emotional || {}), psychologicalProfile: value }
    next.measured.intelligence.emotional = {
      ...(next.measured.intelligence.emotional || {}),
      psychologicalProfile: value,
    }
    return next
  }
  if (sectionId === 'psychoacoustics') {
    next.measured.report.layers.psychoacoustics = value
    next.psychoacoustics = { ...(next.psychoacoustics || {}), report: value }
    next.measured.intelligence.psychoacoustics = {
      ...(next.measured.intelligence.psychoacoustics || {}),
      report: value,
    }
    return next
  }
  next.measured.report.layers.musicological = value
  next.musicology = { ...(next.musicology || {}), description: value }
  return next
}

export function compactSonicDnaForReview(dna: unknown, maxChars = 9000): Record<string, unknown> {
  const sections = listSonicDnaReportSections(dna)
  const measured = extractMeasured(dna)
  const payload = {
    groove: {
      bpm: measured?.bpm ?? null,
      timingFeel: measured?.timingFeel ?? null,
      drumFamily: measured?.drumFamily ?? null,
      key: measured?.key ?? null,
      genre: measured?.genre ?? null,
      bass: measured?.bass ?? null,
      percussion: measured?.percussion ?? null,
    },
    sections: Object.fromEntries(sections.map((section) => [section.id, section.text])),
  }
  const encoded = JSON.stringify(payload)
  if (encoded.length <= maxChars) return payload
  return {
    groove: payload.groove,
    truncated: true,
    sections: Object.fromEntries(
      Object.entries(payload.sections).map(([key, value]) => [key, String(value).slice(0, 700)]),
    ),
  }
}

export function localSonicDnaAccuracyWarnings(dna: unknown): string[] {
  const measured = extractMeasured(dna)
  const root = dna && typeof dna === 'object' ? (dna as Record<string, any>) : {}
  const bpm = Number(measured?.bpm ?? root.technical?.bpm)
  const genre = String(measured?.genre?.primary || root.genres?.primaryGenres?.[0] || '').toLowerCase()
  const source = String(measured?.genre?.source || '').toLowerCase()
  const audioPrimary = String(measured?.genre?.audioPrimary || '').toLowerCase()
  const warnings: string[] = []
  if (!measured) {
    const hasLegacyGroove = Boolean(root.technical?.bpm || root.drums?.patternType || root.harmony?.keySignature)
    if (hasLegacyGroove) {
      warnings.push('This report has agent metadata but no DSP-measured groove. Re-run Sonic DNA from audio to lock BPM, drums, and key.')
    } else {
      warnings.push('No measured groove is stored. Run Sonic DNA analysis from audio before trusting genre copy.')
    }
    return warnings
  }
  if (!genre || genre.includes('unclass')) {
    warnings.push('Groove class is missing or unclassified. Do not fill genre from titles or folders.')
  }
  if (source === 'user-preferred' && !audioPrimary) {
    warnings.push(
      'Genre is catalog preference only so far. Run or refresh audio analysis so the report can blend preference with the measured groove class.',
    )
  } else if (source === 'hybrid' || (source === 'user-preferred' && audioPrimary)) {
    // Hybrid is expected — no “override before publishing” scare. Judgment lives in Measured groove.
  } else if (source === 'user-preferred') {
    warnings.push(
      'Blend catalog preference with the audio-measured groove class in description and judgment — keep both inputs, do not discard DSP.',
    )
  }
  if (Number.isFinite(bpm) && bpm >= 118 && bpm <= 128 && genre.includes('reggae')) {
    warnings.push('118–128 BPM with a reggae label is often house/disco when hats are offbeat. Challenge the groove class against the hat grid.')
  }
  const bassLock = String(measured.bass?.lock || '').toLowerCase()
  if (!bassLock || bassLock === 'unknown') {
    warnings.push('Bass lock is missing. Infer from drum family / low-end before publishing pocket claims.')
  }
  if (Number.isFinite(bpm) && bpm < 110 && (genre.includes('drum') || genre.includes('jungle'))) {
    warnings.push('BPM is low for Drum & Bass / Jungle. Check half-time vs genre.')
  }
  const sections = listSonicDnaReportSections(dna)
  const emptyCopy = sections.filter((section) => section.id !== 'groove' && !String(section.text || '').trim())
  if (emptyCopy.length >= 3) {
    warnings.push(
      `Report sections still empty: ${emptyCopy.map((section) => section.title).join(', ')}. Regenerate or re-run analysis so every section is filled.`,
    )
  }
  const textBlob = sections
    .map((section) => section.text)
    .join(' ')
    .toLowerCase()
  // Flag real source-leak claims; ignore instructional “crate name / crate tag / crate labels” anti-leak copy.
  const leakPatterns = [
    /\b(from the|in the|via the|based on)\s+(playlist|folder|crate)s?\b/g,
    /\b(playlist|folder|crate)\s+titles?\b/g,
    /\bwav\s*name\b/g,
  ]
  const hasPositiveCrateLeak = leakPatterns.some((re) => {
    re.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = re.exec(textBlob))) {
      const window = textBlob.slice(Math.max(0, match.index - 48), match.index + match[0].length + 8)
      if (/\bnot\b/.test(window) || /\bnever\b/.test(window) || /confusing them/.test(window)) continue
      return true
    }
    return false
  })
  // Explicit “from … crate/playlist/folder name” without instructional negation
  if (
    !hasPositiveCrateLeak &&
    /\b(playlist|folder|crate)\s+names?\b/.test(textBlob) &&
    !/not from a crate name|not .{0,20}crate name|confusing them .{0,40}crate/.test(textBlob)
  ) {
    warnings.push('Copy mentions playlist/folder/crate language. Genre must come from the drum grid, not crate names.')
  } else if (hasPositiveCrateLeak) {
    warnings.push('Copy mentions playlist/folder/crate language. Genre must come from the drum grid, not crate names.')
  }
  return warnings
}

/** Fill blank encyclopedia sections from measured intelligence / groove facts (no AI call). */
export function ensureSonicDnaReportSectionsFilled(dna: unknown): Record<string, any> {
  let root = ensureMeasuredOnDna(cloneDna(dna))
  root = ensureInstrumentUsageOnDna(root)
  // Compiled unified intelligence is authoritative — never overwrite with live compose/fill.
  if (hasUnifiedSonicDnaIntelligence(root)) {
    return root
  }
  let measured = extractMeasured(root) || ({} as SonicDnaMeasured)
  let pipeline = assessSonicDnaPipeline(root)

  // Stage gate: never invent encyclopedia from catalog preference alone.
  // BPM + drum family is enough to compose; audioPrimary is filled by normalize.
  if (!hasGrooveCore(measured) && !pipeline.hasGrooveCore) {
    return stripUnsupportedEncyclopedia(root)
  }

  // Same world-genre KB as Python measure path — brings thin agent DNA up to gold depth.
  root = applyGenreEncyclopedia(root)
  measured = extractMeasured(root) || measured
  pipeline = assessSonicDnaPipeline(root)

  const sections = listSonicDnaReportSections(root)
  let next: Record<string, any> = root
  const intel = asRecord(measured.intelligence)
  const layers = asRecord(measured.report?.layers)
  const groove = grooveText(measured, root)
  const judgment = String(measured.genre?.judgment || '').trim()
  const genreLabel = [measured.genre?.primary, measured.genre?.subgenre].filter(Boolean).join(' / ')
  const audioLabel = [measured.genre?.audioPrimary, measured.genre?.audioSubgenre].filter(Boolean).join(' / ')
  const bpm = measured.bpm ? `${Math.round(Number(measured.bpm))} BPM` : ''
  const drums = String(measured.drumFamily || '')
  const key = String(measured.key || '')

  const detailedDescription = composeDetailedTrackDescription(root)
  const listeningBenefits = composeListeningBenefits(root)
  const usageText = composeUsageSection(root)
  const instrumentationText = composeInstrumentationSection(root)
  const relatedText = composeRelatedTraditionsSection(root)

  const storedDescription = usableSectionText(
    intel.description || root.description || measured.report?.description || '',
  )
  const description =
    !storedDescription || storedDescription.length < Math.min(280, detailedDescription.length * 0.5)
      ? detailedDescription || storedDescription
      : storedDescription

  const fallbacks: Partial<Record<SonicDnaReportSectionId, string>> = {
    usage: usableSectionText(intel.usageText) || usageText,
    instrumentation: usableSectionText(intel.instrumentationText) || instrumentationText,
    description,
    benefits:
      usableSectionText(intel.listeningBenefits || root.listeningBenefits || layers.benefits) ||
      listeningBenefits,
    related: usableSectionText(intel.relatedTraditionsText) || relatedText,
    intention:
      usableSectionText(intel.intention || root.intention) ||
      [
        judgment || null,
        genreLabel
          ? `Set intention for ${genreLabel}${bpm ? ` at ${bpm}` : ''}${drums ? ` with ${drums} drums` : ''}.`
          : null,
        groove ? `Measured pocket: ${groove.split('\n').slice(0, 3).join(' · ')}.` : null,
      ]
        .filter(Boolean)
        .join(' '),
    dsp:
      usableSectionText(
        layers.dsp || (Array.isArray(measured.report?.facts) ? measured.report!.facts!.join('\n') : ''),
      ) || groove,
    history:
      usableSectionText(
        layers.historical || intel.historical?.historicalContext || root.historical?.historicalContext || '',
      ) ||
      [
        genreLabel ? `History should follow the ${genreLabel} lineage.` : null,
        judgment || null,
        audioLabel && audioLabel !== genreLabel
          ? `Audio evidence points toward ${audioLabel}; keep that grid context when narrating lineage.`
          : null,
      ]
        .filter(Boolean)
        .join(' '),
    culture:
      usableSectionText(
        layers.cultural ||
          intel.cultural?.description ||
          intel.regional?.regionalCharacteristics ||
          root.cultural?.description ||
          '',
      ) ||
      [
        genreLabel ? `Cultural frame for ${genreLabel}.` : null,
        judgment || null,
        'Bind culture to the measured drum/bass usage, not crate or folder names.',
      ]
        .filter(Boolean)
        .join(' '),
    psychology:
      usableSectionText(
        layers.psychological ||
          intel.emotional?.psychologicalProfile ||
          root.emotional?.psychologicalProfile ||
          '',
      ) ||
      [
        genreLabel ? `Psychology of a ${genreLabel} pocket` : 'Psychology of the measured pocket',
        bpm ? `at ${bpm}` : null,
        drums ? `with ${drums} drums` : null,
        judgment ? `— ${judgment}` : null,
      ]
        .filter(Boolean)
        .join(' ') + '.',
    psychoacoustics:
      usableSectionText(
        layers.psychoacoustics ||
          intel.psychoacoustics?.report ||
          [
            intel.psychoacoustics?.socialUsage,
            intel.psychoacoustics?.sonicIntent,
            intel.psychoacoustics?.activationFormula,
            intel.psychoacoustics?.listenerEffects,
          ]
            .filter(Boolean)
            .join(' '),
      ) ||
      [
        bpm ? `Pulse ${bpm}` : null,
        drums ? `drum family ${drums}` : null,
        key ? `key ${key}` : null,
        genreLabel ? `groove ${genreLabel}` : null,
        judgment || 'Activation follows the measured grid and blended genre judgment.',
      ]
        .filter(Boolean)
        .join(' · '),
    musicology:
      usableSectionText(layers.musicological || root.musicology?.description || intel.musicology?.description || '') ||
      [
        genreLabel ? `Musicology for ${genreLabel}.` : null,
        key ? `Key center ${key}.` : null,
        judgment || null,
        drums ? `Rhythm language: ${drums}.` : null,
      ]
        .filter(Boolean)
        .join(' '),
  }

  for (const section of sections) {
    if (section.id === 'groove') continue
    const current = String(section.text || '').trim()
    const fill = fallbacks[section.id]
    if (!fill?.trim() || isAwaitingAudioStub(fill)) continue
    const isAwaiting = isAwaitingAudioStub(current)
    const shouldRefreshUnified =
      (section.id === 'description' ||
        section.id === 'benefits' ||
        section.id === 'usage' ||
        section.id === 'related') &&
      (isAwaiting || !usableSectionText(current) || current.length < Math.min(180, fill.trim().length * 0.45))
    if (shouldRefreshUnified || !usableSectionText(current) || isAwaiting) {
      next = applySonicDnaSectionText(next, section.id, fill.trim())
    }
  }

  const grooveSection = sections.find((section) => section.id === 'groove')
  if (groove && (!grooveSection || !String(grooveSection.text || '').trim())) {
    next = applySonicDnaSectionText(next, 'groove', groove)
  }

  next._pipeline = {
    stage: pipeline.stage,
    nextAction: pipeline.nextAction,
    assessedAt: new Date().toISOString(),
  }

  return next
}
