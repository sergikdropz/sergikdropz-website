import { extractMeasured, parseSonicDna } from '@/lib/audio/sonic-dna-quality'
import { durationToSeconds, formatYoutubeTimestamp } from '@/lib/studio/isrc-format'

export type DurationSourceKind =
  | 'catalog'
  | 'vault'
  | 'audio_file'
  | 'sonic_dna'
  | 'metadata'
  | 'audio_probe'
  | 'missing'

export type CatalogDurationResolution = {
  seconds: number | null
  source: DurationSourceKind
}

export type CatalogTimestampCue = {
  index: number
  title: string
  billed: string
  startSec: number | null
  endSec: number | null
  durationSec: number | null
  source: DurationSourceKind
}

export type CatalogTimestampTrack = {
  title?: string | null
  billed?: string | null
  duration?: unknown
  durationSec?: number | null
  source?: DurationSourceKind
}

const DURATION_KEYS = [
  'duration',
  'duration_seconds',
  'durationSeconds',
  'duration_sec',
  'durationSec',
  'duration_ms',
  'durationMs',
  'length_seconds',
  'lengthSeconds',
] as const

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function parseClockToSeconds(value: string): number | null {
  const trimmed = value.trim()
  const withHours = trimmed.match(/^(\d+):([0-5]?\d):([0-5]\d)$/)
  if (withHours) {
    return Number(withHours[1]) * 3600 + Number(withHours[2]) * 60 + Number(withHours[3])
  }
  const mmss = trimmed.match(/^(\d+):([0-5]\d)$/)
  if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2])
  return null
}

/** Treat 0 / empty / non-finite as missing. Milliseconds collapse to seconds. */
export function normalizeDurationSec(value: unknown): number | null {
  if (value == null || value === '') return null
  if (typeof value === 'string') {
    const clock = parseClockToSeconds(value)
    if (clock != null && clock > 0) return clock
    const numeric = Number(value.replace(/,/g, '').trim())
    if (!Number.isFinite(numeric)) return null
    return normalizeDurationSec(numeric)
  }
  const seconds = durationToSeconds(typeof value === 'number' ? value : Number(value))
  return seconds != null && seconds > 0 ? seconds : null
}

function durationFromRecord(record: Record<string, unknown>): number | null {
  for (const key of DURATION_KEYS) {
    if (!(key in record)) continue
    const raw = record[key]
    if (/ms$/i.test(key)) {
      const ms = Number(raw)
      if (Number.isFinite(ms) && ms > 0) return Math.round(ms / 1000)
      continue
    }
    const seconds = normalizeDurationSec(raw)
    if (seconds != null) return seconds
  }
  return null
}

export function extractDurationFromSonicDna(dna: unknown): number | null {
  const root = asRecord(parseSonicDna(dna) || dna)
  const measured = asRecord(extractMeasured(root))
  const bags = [
    root,
    measured,
    asRecord(root.technical),
    asRecord(root.metadata),
    asRecord(root.analysis),
    asRecord(asRecord(root.analysis).metadata),
    asRecord(root.bpm),
    asRecord(root.musical),
  ]
  for (const bag of bags) {
    const hit = durationFromRecord(bag)
    if (hit != null) return hit
  }
  return null
}

export function extractDurationFromMetadata(metadata: unknown): number | null {
  const root = asRecord(metadata)
  return (
    durationFromRecord(root) ||
    durationFromRecord(asRecord(root.format)) ||
    durationFromRecord(asRecord(root.audio)) ||
    extractDurationFromSonicDna(root.sonic_dna)
  )
}

/**
 * Catalog timestamp duration cascade.
 * Catalog wins only when it already has a real length. Zero is missing.
 */
export function resolveCatalogDuration(input: {
  catalog?: unknown
  vault?: unknown
  audio?: unknown
  sonicDna?: unknown
  metadata?: unknown
}): CatalogDurationResolution {
  const ranked: Array<[DurationSourceKind, number | null]> = [
    ['catalog', normalizeDurationSec(input.catalog)],
    ['vault', normalizeDurationSec(input.vault)],
    ['audio_file', normalizeDurationSec(input.audio)],
    ['sonic_dna', extractDurationFromSonicDna(input.sonicDna)],
    ['metadata', extractDurationFromMetadata(input.metadata)],
  ]
  for (const [source, seconds] of ranked) {
    if (seconds != null) return { seconds, source }
  }
  return { seconds: null, source: 'missing' }
}

/** Continuous visualizer cues: finish of N is start of N+1. A missing length unlocks later stamps. */
export function buildContinuousTimestampCues(tracks: CatalogTimestampTrack[]): CatalogTimestampCue[] {
  let cursor = 0
  let locked = true
  return tracks.map((track, index) => {
    const durationSec = normalizeDurationSec(track.durationSec ?? track.duration)
    const title = String(track.title || '').trim() || 'Untitled'
    const billed = String(track.billed || '').trim()
    const source = track.source || (durationSec != null ? 'catalog' : 'missing')
    if (!locked) {
      return {
        index: index + 1,
        title,
        billed,
        startSec: null,
        endSec: null,
        durationSec,
        source,
      }
    }
    const startSec = cursor
    if (durationSec == null) {
      locked = false
      return {
        index: index + 1,
        title,
        billed,
        startSec,
        endSec: null,
        durationSec: null,
        source: 'missing',
      }
    }
    const endSec = startSec + durationSec
    cursor = endSec
    return {
      index: index + 1,
      title,
      billed,
      startSec,
      endSec,
      durationSec,
      source,
    }
  })
}

export function catalogTimestampFacts(cues: CatalogTimestampCue[]): {
  complete: boolean
  runtimeSec: number | null
  missingTitles: string[]
} {
  const missingTitles = cues.filter((cue) => cue.durationSec == null).map((cue) => cue.title)
  const last = cues[cues.length - 1]
  const runtimeSec =
    cues.length > 0 && missingTitles.length === 0 && last?.endSec != null && last.endSec > 0
      ? last.endSec
      : null
  return {
    complete: cues.length > 0 && missingTitles.length === 0,
    runtimeSec,
    missingTitles,
  }
}

export function formatCatalogTimestampRange(cue: CatalogTimestampCue): string {
  const start = formatYoutubeTimestamp(cue.startSec)
  const end = formatYoutubeTimestamp(cue.endSec)
  if (start && end) return `${start}–${end}`
  if (start) return `${start}–pending`
  return 'time pending'
}
