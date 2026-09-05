/**
 * Automated Accuracy Challenge — audit + deterministic patches before publish.
 * Prefer DSP lock over crate/title leakage; ground unquoted narrative sections.
 */

import {
  applySonicDnaSectionText,
  listSonicDnaReportSections,
  localSonicDnaAccuracyWarnings,
  type SonicDnaReportSectionId,
} from '@/lib/audio/sonic-dna-report-sections'
import { extractMeasured } from '@/lib/audio/sonic-dna-quality'
import { inferBassPocket } from '@/lib/audio/bass-pocket'
import { ensureSonicDnaReportSectionsFilled } from '@/lib/audio/sonic-dna-report-sections'

export type AccuracyChallengeResult = {
  dna: Record<string, any>
  warnings: string[]
  patches: Array<{ sectionId: string; reason: string }>
  conflictsResolved: number
  groundedSections: number
}

const NARRATIVE_SECTIONS: SonicDnaReportSectionId[] = [
  'description',
  'intention',
  'culture',
  'history',
  'psychology',
  'psychoacoustics',
  'musicology',
  'usage',
  'benefits',
  'related',
]

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {}
}

function measuredQuote(measured: Record<string, any>): string {
  const bits = [
    measured.bpm != null ? `${Math.round(Number(measured.bpm))} BPM` : null,
    measured.drumFamily ? `${measured.drumFamily} drums` : null,
    measured.timingFeel ? `${measured.timingFeel} feel` : null,
    measured.bass?.lock ? `bass ${measured.bass.lock}` : null,
    measured.genre?.audioPrimary || measured.genre?.primary
      ? `class ${measured.genre.audioPrimary || measured.genre.primary}`
      : null,
  ].filter(Boolean)
  return bits.length ? `Measured: ${bits.join(' · ')}.` : ''
}

function sectionGrounded(text: string, measured: Record<string, any>): boolean {
  const t = text.toLowerCase()
  const bpm = measured.bpm != null ? String(Math.round(Number(measured.bpm))) : ''
  const drums = String(measured.drumFamily || '').toLowerCase()
  if (bpm && t.includes(bpm)) return true
  if (drums && drums !== 'unknown' && t.includes(drums.split('-')[0])) return true
  if (/\bbpm\b/.test(t) && (drums ? t.includes(drums.split('-')[0]) : true)) return true
  return false
}

function stripCrateLeak(text: string): { text: string; changed: boolean } {
  let next = text
    .replace(/\b(from the|in the|via the)\s+(playlist|folder|crate|wav name)\b/gi, 'from the measured groove')
    .replace(/\b(playlist|folder|crate)\s+title\b/gi, 'release title')
    .replace(/\bbased on (playlist|folder|crate) names?\b/gi, 'based on the drum grid')
    // Catch remaining crate/folder/playlist nouns that survive the phrases above
    .replace(/\b(playlist|folder|crate|wav[\s-]?name)s?\b/gi, 'measured groove')
  // Collapse doubled "measured groove measured groove"
  next = next.replace(/(measured groove\s*){2,}/gi, 'measured groove ')
  return { text: next.trim().replace(/\s{2,}/g, ' '), changed: next !== text }
}

function isReggaeHouseConflict(bpm: number, primary: string, audioPrimary: string, drumFamily: string): boolean {
  const p = primary.toLowerCase()
  const a = audioPrimary.toLowerCase()
  const d = drumFamily.toLowerCase()
  if (!(bpm >= 118 && bpm <= 130)) return false
  if (!/reggae|dub|dancehall/.test(p)) return false
  if (/house|disco|techno|garage/.test(a)) return true
  if (d.includes('four')) return true
  return false
}

/**
 * Resolve primary vs audioPrimary conflicts in favor of DSP when mismatch heuristics fire.
 */
export function resolveMeasuredGenreConflicts(dna: Record<string, any>): {
  dna: Record<string, any>
  resolved: number
  notes: string[]
} {
  const next = { ...dna, measured: { ...(dna.measured || {}) } }
  const measured = asRecord(next.measured)
  const genre = asRecord(measured.genre)
  const notes: string[] = []
  let resolved = 0
  const bpm = Number(measured.bpm)
  const primary = String(genre.primary || '')
  const audioPrimary = String(genre.audioPrimary || '')
  const drumFamily = String(measured.drumFamily || '')

  if (
    audioPrimary &&
    primary &&
    audioPrimary !== primary &&
    isReggaeHouseConflict(bpm, primary, audioPrimary, drumFamily)
  ) {
    next.measured = {
      ...measured,
      genre: {
        ...genre,
        primary: audioPrimary,
        preferredPrimary: primary,
        source: genre.source === 'user-preferred' ? 'hybrid' : genre.source || 'audio-measured',
        judgment: `DSP lock kept ${audioPrimary} over ${primary} at ${Math.round(bpm)} BPM with ${drumFamily || 'measured'} drums (house-tempo reggae label is a common crate leak).`,
      },
    }
    notes.push(`Genre conflict: preferred DSP ${audioPrimary} over ${primary}`)
    resolved++
  } else if (audioPrimary && (!primary || primary.toLowerCase().includes('unclass'))) {
    next.measured = {
      ...measured,
      genre: { ...genre, primary: audioPrimary, source: genre.source || 'audio-measured' },
    }
    notes.push(`Filled primary from audioPrimary ${audioPrimary}`)
    resolved++
  }

  return { dna: next, resolved, notes }
}

/**
 * Ensure bass lock exists on measured (infer if missing).
 */
export function ensureMeasuredBassPocket(dna: Record<string, any>): Record<string, any> {
  const measured = asRecord(dna.measured)
  if (!measured.bpm && !measured.drumFamily) return dna
  const existing = String(measured.bass?.lock || '').trim()
  if (existing && existing !== 'unknown') {
    return dna
  }
  const pocket = inferBassPocket({
    bpm: measured.bpm,
    drumFamily: measured.drumFamily,
    timingFeel: measured.timingFeel,
    swingPercent: measured.swingPercent,
    key: measured.key,
    existingLock: existing || null,
    kickSteps: measured.kickSteps,
    snareSteps: measured.snareSteps,
  })
  return {
    ...dna,
    measured: {
      ...measured,
      bass: {
        ...(measured.bass || {}),
        lock: pocket.lock,
        rootNote: pocket.rootNote || measured.bass?.rootNote || null,
        slidesLikely: pocket.slidesLikely,
      },
      timingFeel: measured.timingFeel || pocket.timingFeel || undefined,
      swingPercent: measured.swingPercent ?? pocket.swingPercent ?? undefined,
    },
  }
}

/**
 * Run full accuracy challenge: conflicts → ground sections → warnings → optional recompose thin bits.
 */
export function runAccuracyChallenge(dna: unknown): AccuracyChallengeResult {
  let next =
    dna && typeof dna === 'object' && !Array.isArray(dna)
      ? ({ ...(dna as Record<string, any>) } as Record<string, any>)
      : {}

  next = ensureMeasuredBassPocket(next)
  const conflict = resolveMeasuredGenreConflicts(next)
  next = conflict.dna
  const patches: AccuracyChallengeResult['patches'] = []
  let groundedSections = 0

  const measured = asRecord(extractMeasured(next) || next.measured)
  const quote = measuredQuote(measured)

  for (const sectionId of NARRATIVE_SECTIONS) {
    const sections = listSonicDnaReportSections(next)
    const section = sections.find((s) => s.id === sectionId)
    let text = String(section?.text || '').trim()
    if (!text || /awaiting audio analysis/i.test(text)) continue

    const leak = stripCrateLeak(text)
    if (leak.changed) {
      text = leak.text
      next = applySonicDnaSectionText(next, sectionId, text)
      patches.push({ sectionId, reason: 'stripped playlist/folder/crate leakage' })
    }

    if (quote && !sectionGrounded(text, measured)) {
      const grounded = `${quote} ${text}`.trim()
      next = applySonicDnaSectionText(next, sectionId, grounded)
      patches.push({ sectionId, reason: 'prepended measured BPM/drums quote' })
      groundedSections++
    }
  }

  // DSP section must mention bass lock when present
  const dspSections = listSonicDnaReportSections(next)
  const dsp = dspSections.find((s) => s.id === 'dsp')
  const bassLock = String(measured.bass?.lock || next.measured?.bass?.lock || '').trim()
  if (bassLock && bassLock !== 'unknown' && dsp?.text && !String(dsp.text).toLowerCase().includes('bass')) {
    const patched = `${dsp.text.trim()}\nBass lock: ${bassLock}`
    next = applySonicDnaSectionText(next, 'dsp', patched)
    patches.push({ sectionId: 'dsp', reason: 'appended bass lock to DSP section' })
  }

  // If culture/history still contradict resolved audio class, soft-tag judgment into culture
  const genre = asRecord(next.measured?.genre)
  if (genre.judgment && conflict.resolved > 0) {
    const culture = listSonicDnaReportSections(next).find((s) => s.id === 'culture')
    if (culture?.text && !culture.text.includes(String(genre.audioPrimary || genre.primary || '').slice(0, 12))) {
      next = applySonicDnaSectionText(
        next,
        'culture',
        `${culture.text.trim()} ${genre.judgment}`.trim(),
      )
      patches.push({ sectionId: 'culture', reason: 'appended DSP genre judgment after conflict resolve' })
    }
  }

  // Refresh empty encyclopedia slots after patches
  try {
    next = ensureSonicDnaReportSectionsFilled(next)
  } catch {
    // keep patched DNA
  }

  const warnings = [
    ...localSonicDnaAccuracyWarnings(next),
    ...conflict.notes,
  ]

  if (!bassLock || bassLock === 'unknown') {
    warnings.push('Bass lock still unknown after challenge — re-measure low end if possible.')
  }

  return {
    dna: next,
    warnings: Array.from(new Set(warnings)),
    patches,
    conflictsResolved: conflict.resolved,
    groundedSections,
  }
}
