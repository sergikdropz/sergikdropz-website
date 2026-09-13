import { catalogLockFromTrack, stampCatalogOverrides } from '@/lib/catalog-lock'
import { candidateFromKeyLabel, keyLockFromPearson, type RootKeyCandidate } from '@/lib/audio/root-key'
import { extractMeasured, parseSonicDna, type SonicDnaMeasured } from '@/lib/audio/sonic-dna-quality'

export type TrackDisplaySource = {
  genre?: string | null
  subgenre?: string | null
  bpm?: number | string | null
  key_signature?: string | null
  keySignature?: string | null
  sonic_dna?: unknown
  sonic_dna_status?: string | null
  metadata?: Record<string, unknown> | null
}

const UNKNOWN = new Set(['', 'unknown', 'n/a', 'none', 'null', 'unclassified'])

function clean(value: unknown): string {
  if (value == null) return ''
  const text = String(value).trim()
  if (!text || UNKNOWN.has(text.toLowerCase())) return ''
  return text
}

function parseDna(track: TrackDisplaySource) {
  return parseSonicDna(track.sonic_dna) || parseSonicDna(track.metadata?.sonic_dna) || null
}

function measuredOf(track: TrackDisplaySource): SonicDnaMeasured | null {
  return extractMeasured(parseDna(track))
}

function humanize(value: string): string {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('-')
}

/** Catalog columns / admin overrides are the published display values. DNA fills blanks only. */
export function displayTrackGenre(track: TrackDisplaySource): string {
  const lock = catalogLockFromTrack(track)
  const measured = measuredOf(track)
  const dna = parseDna(track)
  return (
    clean(lock.genre) ||
    clean(track.genre) ||
    clean(track.metadata?.primary_genre) ||
    clean(Array.isArray(track.metadata?.genres) ? (track.metadata?.genres as string[])[0] : '') ||
    clean(measured?.genre?.primary) ||
    clean(Array.isArray(dna?.genres?.primaryGenres) ? dna.genres.primaryGenres[0] : '') ||
    clean(typeof dna?.genre === 'string' ? dna.genre : dna?.genre?.primary)
  )
}

export function displayTrackSubgenre(track: TrackDisplaySource): string {
  const lock = catalogLockFromTrack(track)
  const measured = measuredOf(track)
  const dna = parseDna(track)
  return (
    clean(lock.subgenre) ||
    clean(track.subgenre) ||
    clean(measured?.genre?.subgenre) ||
    clean(Array.isArray(dna?.genres?.subgenres) ? dna.genres.subgenres[0] : '')
  )
}

export function displayTrackBpm(track: TrackDisplaySource): number | null {
  const lock = catalogLockFromTrack(track)
  const measured = measuredOf(track)
  const dna = parseDna(track)
  const candidates = [lock.bpm, track.bpm, measured?.bpm, dna?.technical?.bpm, dna?.bpm]
  for (const value of candidates) {
    const n = Number(value)
    if (Number.isFinite(n) && n >= 40 && n <= 240) return Math.round(n)
  }
  return null
}

export function displayTrackKey(track: TrackDisplaySource): string {
  const lock = catalogLockFromTrack(track)
  const measured = measuredOf(track)
  const dna = parseDna(track)
  return (
    clean(lock.key_signature) ||
    clean(track.key_signature) ||
    clean(track.keySignature) ||
    clean(measured?.key) ||
    clean(dna?.harmony?.keySignature) ||
    clean(dna?.musical?.keySignature) ||
    clean(typeof dna?.technical?.key === 'string' ? dna.technical.key : dna?.technical?.key?.key) ||
    clean(track.metadata?.key_signature)
  )
}

export type SonicDnaReportKey = {
  key: string
  root: string
  scale: 'major' | 'minor' | null
  camelot: string | null
  confidence: number
  unpitched: boolean
  candidates: RootKeyCandidate[]
}

function technicalKeyLabel(dna: Record<string, any> | null): string {
  const technical = dna?.technical?.key
  if (typeof technical === 'string') return clean(technical)
  if (technical && typeof technical === 'object') {
    const root = clean(technical.key)
    const mode = clean(technical.mode)
    if (root && mode) return `${root} ${mode}`
    return root
  }
  return ''
}

/** Catalog is ignored — refresh should take the Sonic DNA report key. */
export function keySignatureFromSonicDnaReport(sonicDna: unknown): SonicDnaReportKey | null {
  const dna = parseSonicDna(sonicDna)
  const measured = extractMeasured(dna)
  const label =
    clean(measured?.key) ||
    clean(dna?.harmony?.keySignature) ||
    clean(dna?.musical?.keySignature) ||
    technicalKeyLabel(dna)
  if (!label && !measured?.unpitched && !clean(measured?.rootNote)) return null

  const parsed = label ? candidateFromKeyLabel(label, 1) : null
  const root = parsed?.root || clean(measured?.rootNote)
  const scale =
    parsed?.scale ||
    (clean(measured?.scale).toLowerCase() === 'major' || clean(measured?.scale).toLowerCase() === 'minor'
      ? (clean(measured?.scale).toLowerCase() as 'major' | 'minor')
      : null)
  const key = parsed?.key || (root && scale ? `${root} ${scale}` : label)
  if (!key && !measured?.unpitched) return null

  const pearson = Number(measured?.keyConfidence ?? 0)
  const chosen: RootKeyCandidate | null = key
    ? parsed || {
        key,
        root: root || key,
        scale: scale || 'minor',
        score: Number.isFinite(pearson) ? pearson : 1,
        camelot: clean(measured?.camelot) || null,
      }
    : null
  const bassRoot = clean(measured?.bass?.rootNote)
  const extras: RootKeyCandidate[] = []
  if (chosen && bassRoot && bassRoot !== chosen.root && scale) {
    const alt = candidateFromKeyLabel(`${bassRoot} ${scale}`, Math.max(0.2, (chosen.score || 1) * 0.7))
    if (alt && alt.key !== chosen.key) extras.push(alt)
  }

  return {
    key: chosen?.key || key,
    root: chosen?.root || root || '',
    scale: chosen?.scale || scale,
    camelot: chosen?.camelot || clean(measured?.camelot) || null,
    confidence: keyLockFromPearson(Number.isFinite(pearson) ? pearson : 0.55),
    unpitched: Boolean(measured?.unpitched),
    candidates: chosen ? [chosen, ...extras] : [],
  }
}

export function displayTrackScale(track: TrackDisplaySource): string {
  const measured = measuredOf(track)
  const dna = parseDna(track)
  const scale = clean(measured?.scale) || clean(dna?.musical?.scale) || clean(dna?.harmony?.scale)
  if (scale) return scale.charAt(0).toUpperCase() + scale.slice(1)
  const key = displayTrackKey(track).toLowerCase()
  if (key.includes('minor')) return 'Minor'
  if (key.includes('major')) return 'Major'
  return ''
}

export function displayTrackDrumStyle(track: TrackDisplaySource): string {
  const measured = measuredOf(track)
  const dna = parseDna(track)
  const family = clean(measured?.drumFamily)
  if (family) return humanize(family)
  const kick = clean(measured?.percussion?.kickRole)
  if (kick) return humanize(kick)
  return (
    clean(Array.isArray(dna?.drums?.genreStyles) ? dna.drums.genreStyles[0] : '') ||
    clean(dna?.drums?.patternType)
  )
}

export function displayTrackTimeSignature(track: TrackDisplaySource): string {
  const dna = parseDna(track)
  return clean(dna?.musical?.timeSignature) || clean(dna?.technical?.timeSignature) || '4/4'
}

export function displayTrackFields(track: TrackDisplaySource) {
  return {
    genre: displayTrackGenre(track),
    subgenre: displayTrackSubgenre(track),
    bpm: displayTrackBpm(track),
    key: displayTrackKey(track),
    scale: displayTrackScale(track),
    drumStyle: displayTrackDrumStyle(track),
    timeSignature: displayTrackTimeSignature(track),
  }
}

/**
 * Publish a finished audio re-run onto the catalog row so table columns,
 * track info, and metadata lock to the new measured DNA.
 */
export function applySonicDnaAnalysisToTrack<T extends TrackDisplaySource>(
  track: T,
  opts: {
    sonicDna?: unknown
    status?: string | null
    metadata?: Record<string, unknown> | null
  },
): T {
  const dna = parseSonicDna(opts.sonicDna) || parseDna(track)
  const measured = extractMeasured(dna)
  const bpmRaw = measured?.bpm
  const bpm =
    bpmRaw != null && Number.isFinite(Number(bpmRaw)) && Number(bpmRaw) >= 40 && Number(bpmRaw) <= 240
      ? Math.round(Number(bpmRaw))
      : undefined
  const key = clean(measured?.key) || undefined
  const genre = clean(measured?.genre?.primary) || undefined
  const subgenre = clean(measured?.genre?.subgenre) || undefined
  const catalogUpdates: Record<string, unknown> = {
    ...(bpm != null ? { bpm } : {}),
    ...(key ? { key_signature: key } : {}),
    ...(genre ? { genre } : {}),
    ...(subgenre ? { subgenre } : {}),
  }
  const prevMeta =
    (opts.metadata && typeof opts.metadata === 'object' ? opts.metadata : null) ||
    (track.metadata && typeof track.metadata === 'object' ? track.metadata : null) ||
    {}
  const metadata = stampCatalogOverrides(
    {
      ...prevMeta,
      ...(bpm != null ? { bpm } : {}),
      ...(key ? { key_signature: key } : {}),
      ...(genre ? { primary_genre: genre } : {}),
    },
    catalogUpdates,
  )

  return {
    ...track,
    sonic_dna: dna || track.sonic_dna,
    ...(opts.status ? { sonic_dna_status: opts.status } : {}),
    ...(bpm != null ? { bpm } : {}),
    ...(key ? { key_signature: key } : {}),
    ...(genre ? { genre } : {}),
    ...(subgenre ? { subgenre } : {}),
    metadata,
  }
}

/** Stamp an admin BPM onto sonic DNA so mix + display read the same pulse. */
export function applyAdminBpmToSonicDna(sonicDna: unknown, bpm: number): Record<string, unknown> | null {
  if (!sonicDna || typeof sonicDna !== 'object' || Array.isArray(sonicDna)) return null
  const root = { ...(sonicDna as Record<string, unknown>) }
  const technical =
    root.technical && typeof root.technical === 'object'
      ? { ...(root.technical as Record<string, unknown>) }
      : {}
  root.technical = { ...technical, bpm }
  if (root.measured && typeof root.measured === 'object') {
    const measured = { ...(root.measured as Record<string, unknown>) }
    measured.bpm = bpm
    measured.bpmConfidence = Math.max(Number(measured.bpmConfidence) || 0, 0.95)
    measured.bpmSource = 'admin'
    root.measured = measured
  }
  const comprehensive = root.comprehensive
  if (comprehensive && typeof comprehensive === 'object') {
    const comp = { ...(comprehensive as Record<string, unknown>) }
    if (comp.measured && typeof comp.measured === 'object') {
      comp.measured = { ...(comp.measured as Record<string, unknown>), bpm }
    }
    root.comprehensive = comp
  }
  return root
}

/**
 * Admin ORIG edit: lock catalog BPM so the badge, decks, and mix engine
 * all read the same value after save (not just the current session).
 */
export function applyAdminBpmToTrack<T extends TrackDisplaySource>(track: T, bpm: number): T {
  const metadata = stampCatalogOverrides(track.metadata, { bpm })
  const sonic = applyAdminBpmToSonicDna(track.sonic_dna, bpm)
  return {
    ...track,
    bpm,
    metadata,
    ...(sonic ? { sonic_dna: sonic } : {}),
  }
}
