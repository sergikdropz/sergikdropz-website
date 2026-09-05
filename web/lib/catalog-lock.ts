import { applyPreferredGenreToSonicDna } from '@/lib/audio/groove-class-options'
import { ensureSonicDnaReportSectionsFilled } from '@/lib/audio/sonic-dna-report-sections'
import { isUsableCatalogValue } from '@/lib/music-library-publish'

export const CATALOG_LOCK_SELECT =
  'id, bpm, key_signature, genre, subgenre, title, artist, year, metadata'

export const CATALOG_OVERRIDE_FIELDS = [
  'bpm',
  'key_signature',
  'genre',
  'subgenre',
  'title',
  'artist',
  'year',
] as const

export type CatalogOverrideField = (typeof CATALOG_OVERRIDE_FIELDS)[number]

export type CatalogLock = {
  bpm?: number | null
  key_signature?: string | null
  genre?: string | null
  subgenre?: string | null
  title?: string | null
  artist?: string | null
  year?: number | null
  savedAt?: string
}

type CatalogTrackLike = {
  bpm?: unknown
  key_signature?: unknown
  genre?: unknown
  subgenre?: unknown
  title?: unknown
  artist?: unknown
  year?: unknown
  metadata?: unknown
}

function pickUsable<T>(...values: T[]): T | undefined {
  for (const value of values) {
    if (isUsableCatalogValue(value)) return value
  }
  return undefined
}

export function readCatalogOverrides(metadata: unknown): CatalogLock | null {
  if (!metadata || typeof metadata !== 'object') return null
  const raw = (metadata as { catalog_overrides?: unknown }).catalog_overrides
  if (!raw || typeof raw !== 'object') return null
  return raw as CatalogLock
}

export function nextCatalogOverrides(
  existingMetadata: unknown,
  explicitUpdates: Record<string, unknown>,
): CatalogLock {
  const prev = readCatalogOverrides(existingMetadata) || {}
  const next: CatalogLock = { ...prev, savedAt: new Date().toISOString() }
  for (const field of CATALOG_OVERRIDE_FIELDS) {
    if (explicitUpdates[field] === undefined) continue
    if (!isUsableCatalogValue(explicitUpdates[field])) continue
    ;(next as Record<string, unknown>)[field] = explicitUpdates[field]
  }
  return next
}

export function stampCatalogOverrides(
  metadata: unknown,
  explicitUpdates: Record<string, unknown>,
): Record<string, unknown> {
  const base =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? { ...(metadata as Record<string, unknown>) }
      : {}
  return {
    ...base,
    catalog_overrides: nextCatalogOverrides(metadata, explicitUpdates),
  }
}

export function catalogLockFromTrack(track: CatalogTrackLike | null | undefined): CatalogLock {
  const overrides = readCatalogOverrides(track?.metadata)
  return {
    bpm: pickUsable(overrides?.bpm, track?.bpm as number | null),
    key_signature: pickUsable(overrides?.key_signature, track?.key_signature as string | null),
    genre: pickUsable(overrides?.genre, track?.genre as string | null),
    subgenre: pickUsable(overrides?.subgenre, track?.subgenre as string | null),
    title: pickUsable(overrides?.title, track?.title as string | null),
    artist: pickUsable(overrides?.artist, track?.artist as string | null),
    year: pickUsable(overrides?.year, track?.year as number | null),
    savedAt: overrides?.savedAt,
  }
}

export function mergeCatalogLocks(locks: CatalogLock[]): CatalogLock {
  const merged: CatalogLock = {}
  for (const lock of locks) {
    merged.bpm = pickUsable(merged.bpm, lock.bpm)
    merged.key_signature = pickUsable(merged.key_signature, lock.key_signature)
    merged.genre = pickUsable(merged.genre, lock.genre)
    merged.subgenre = pickUsable(merged.subgenre, lock.subgenre)
    merged.title = pickUsable(merged.title, lock.title)
    merged.artist = pickUsable(merged.artist, lock.artist)
    merged.year = pickUsable(merged.year, lock.year)
    merged.savedAt = merged.savedAt || lock.savedAt
  }
  return merged
}

export type AnalysisWrite = {
  bpm?: number | null
  key_signature?: string | null
  energy_level?: number | null
  danceability?: number | null
  [key: string]: unknown
}

export function applyCatalogLock<TDna, TAnalysis extends AnalysisWrite>(
  lock: CatalogLock | null | undefined,
  sonicDNA: TDna,
  analysisData: TAnalysis,
): { sonicDNA: TDna; analysisData: TAnalysis } {
  let dna: any = sonicDNA
  const next = { ...analysisData }

  if (isUsableCatalogValue(lock?.bpm)) {
    next.bpm = lock!.bpm
    dna = {
      ...dna,
      technical: { ...(dna?.technical || {}), bpm: lock!.bpm },
      measured: {
        ...(dna?.measured || {}),
        bpm: lock!.bpm,
        // Catalog lock is an admin truth — keep BPM gate green when locked.
        bpmConfidence: Math.max(Number(dna?.measured?.bpmConfidence) || 0, 0.95),
        bpmSource: dna?.measured?.bpmSource || 'catalog-lock',
      },
    }
  }

  if (isUsableCatalogValue(lock?.key_signature)) {
    next.key_signature = lock!.key_signature
    dna = {
      ...dna,
      technical: {
        ...(dna?.technical || {}),
        key: { ...(dna?.technical?.key || {}), key: lock!.key_signature },
      },
      harmony: { ...(dna?.harmony || {}), keySignature: lock!.key_signature },
      measured: { ...(dna?.measured || {}), key: lock!.key_signature },
    }
  }

  if (isUsableCatalogValue(lock?.genre)) {
    dna = applyPreferredGenreToSonicDna(dna, String(lock!.genre), String(lock!.subgenre || ''))
  } else {
    dna = ensureSonicDnaReportSectionsFilled(dna)
  }

  return { sonicDNA: dna as TDna, analysisData: next }
}

export async function loadCatalogLockForAudioFile(
  supabase: { from: (table: string) => any },
  audioFileId: string | null | undefined,
): Promise<CatalogLock> {
  if (!audioFileId) return {}
  const { data } = await supabase
    .from('music_library_tracks')
    .select(CATALOG_LOCK_SELECT)
    .eq('audio_file_id', audioFileId)
  return mergeCatalogLocks((data || []).map((row: CatalogTrackLike) => catalogLockFromTrack(row)))
}

export async function lockAnalysisForAudioFile<TDna, TAnalysis extends AnalysisWrite>(
  supabase: { from: (table: string) => any },
  audioFileId: string | null | undefined,
  sonicDNA: TDna,
  analysisData: TAnalysis,
): Promise<{ sonicDNA: TDna; analysisData: TAnalysis; lock: CatalogLock }> {
  const lock = await loadCatalogLockForAudioFile(supabase, audioFileId)
  const locked = applyCatalogLock(lock, sonicDNA, analysisData)
  return { ...locked, lock }
}

/** Drop bpm/key/genre writes that would overwrite a filled catalog column. */
export function omitLockedCatalogColumns<T extends Record<string, unknown>>(
  lock: CatalogLock | null | undefined,
  updates: T,
): T {
  const next = { ...updates }
  if (isUsableCatalogValue(lock?.bpm)) delete next.bpm
  if (isUsableCatalogValue(lock?.key_signature)) delete next.key_signature
  if (isUsableCatalogValue(lock?.genre)) delete next.genre
  if (isUsableCatalogValue(lock?.subgenre) || isUsableCatalogValue(lock?.genre)) delete next.subgenre
  return next
}
