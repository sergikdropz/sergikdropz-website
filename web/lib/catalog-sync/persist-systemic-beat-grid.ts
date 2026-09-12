import type { SupabaseClient } from '@supabase/supabase-js'
import {
  withGridAnalysisOnDna,
  type GridDnaExtras,
} from '@/lib/audio/mix-engine/kick-onsets'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type SystemicBeatGridResult = {
  audioFileId: string | null
  libraryTrackIds: string[]
  beatGridOffset: number
  sonicDna: Record<string, unknown> | null
}

type CatalogGridRow = {
  id: string
  sonic_dna?: unknown
  audio_file_id?: string | null
  beat_grid_offset?: number | null
}

async function selectById<T extends CatalogGridRow>(
  supabase: SupabaseClient,
  table: 'audio_files' | 'music_library_tracks',
  select: string,
  id: string,
): Promise<T | null> {
  const { data, error } = await supabase.from(table).select(select).eq('id', id).maybeSingle()
  if (error) return null
  return (data as T | null) || null
}

async function updateById(
  supabase: SupabaseClient,
  table: 'audio_files' | 'music_library_tracks' | 'sonic_dna_cache',
  idColumn: string,
  id: string,
  payload: Record<string, unknown>,
): Promise<{ error: { message?: string } | null }> {
  const { error } = await supabase.from(table).update(payload).eq(idColumn, id)
  return { error }
}

function readGridExtrasFromDna(sonicDna: unknown): GridDnaExtras {
  if (!sonicDna || typeof sonicDna !== 'object') return {}
  const root = sonicDna as Record<string, unknown>
  const measured =
    root.measured && typeof root.measured === 'object'
      ? (root.measured as Record<string, unknown>)
      : {}
  const extras: GridDnaExtras = {}
  if (typeof root.gridManual === 'boolean') extras.gridManual = root.gridManual
  else if (typeof measured.gridManual === 'boolean') extras.gridManual = measured.gridManual
  if (Array.isArray(measured.kickOnsetSec)) extras.kickOnsetSec = measured.kickOnsetSec as number[]
  if (Array.isArray(measured.snareClapOnsetSec)) {
    extras.snareClapOnsetSec = measured.snareClapOnsetSec as number[]
  }
  if (typeof measured.gridLockScore === 'number' && Number.isFinite(measured.gridLockScore)) {
    extras.gridLockScore = measured.gridLockScore
  }
  return extras
}

/**
 * Persist an admin beat-grid phase to every linked library row, audio DNA,
 * and sonic_dna_cache — not just the current player session.
 */
export async function persistSystemicBeatGrid(
  supabase: SupabaseClient,
  opts: {
    trackId: string
    offsetSec: number
    /** Preferred: full DNA blob from the editor (gridManual / onsets already stamped). */
    sonicDna?: unknown
    gridManual?: boolean
  },
): Promise<SystemicBeatGridResult> {
  const { trackId } = opts
  const offsetSec = Number(opts.offsetSec)
  if (!UUID_RE.test(trackId)) {
    throw new Error('Track is not in the catalog')
  }
  if (!Number.isFinite(offsetSec) || offsetSec < 0) {
    throw new Error('Beat grid offset must be a non-negative number')
  }

  const audioSelect = 'id, sonic_dna'
  const librarySelect = 'id, audio_file_id, sonic_dna, beat_grid_offset'

  let audio = await selectById<CatalogGridRow>(supabase, 'audio_files', audioSelect, trackId)
  const libraryById = await selectById<CatalogGridRow>(
    supabase,
    'music_library_tracks',
    librarySelect,
    trackId,
  )

  const audioFileId = audio?.id || libraryById?.audio_file_id || null
  if (!audio && audioFileId && audioFileId !== trackId) {
    audio = await selectById<CatalogGridRow>(supabase, 'audio_files', audioSelect, audioFileId)
  }

  const libraryRows: CatalogGridRow[] = []
  if (libraryById) libraryRows.push(libraryById)

  const lookupAudioId = audioFileId || audio?.id
  if (lookupAudioId) {
    const { data } = await supabase
      .from('music_library_tracks')
      .select(librarySelect)
      .eq('audio_file_id', lookupAudioId)
    for (const row of (data || []) as CatalogGridRow[]) {
      if (!libraryRows.some((existing) => existing.id === row.id)) libraryRows.push(row)
    }
  }

  if (!audio && libraryRows.length === 0) {
    throw new Error('Track not found')
  }

  const dnaExtras: GridDnaExtras = {
    ...readGridExtrasFromDna(opts.sonicDna),
    gridOffsetSec: offsetSec,
  }
  if (typeof opts.gridManual === 'boolean') {
    dnaExtras.gridManual = opts.gridManual
  } else if (typeof dnaExtras.gridManual !== 'boolean') {
    dnaExtras.gridManual = true
  }

  const now = new Date().toISOString()
  const resolvedAudioId = audio?.id || audioFileId
  let primaryDna: Record<string, unknown> | null = null

  if (resolvedAudioId) {
    const nextDna = withGridAnalysisOnDna(audio?.sonic_dna ?? opts.sonicDna, {
      ...dnaExtras,
      offsetSec,
    })
    primaryDna = nextDna
    const { error } = await updateById(supabase, 'audio_files', 'id', resolvedAudioId, {
      sonic_dna: nextDna,
      updated_at: now,
    })
    if (error) {
      throw new Error(error.message || 'Failed to update audio beat grid')
    }
  }

  for (const row of libraryRows) {
    const nextDna = withGridAnalysisOnDna(row.sonic_dna ?? opts.sonicDna ?? primaryDna, {
      ...dnaExtras,
      offsetSec,
    })
    if (!primaryDna) primaryDna = nextDna
    const payload: Record<string, unknown> = {
      beat_grid_offset: offsetSec,
      sonic_dna: nextDna,
      updated_at: now,
    }
    const { error } = await updateById(supabase, 'music_library_tracks', 'id', row.id, payload)
    if (error) {
      // Older schemas may lack beat_grid_offset — still stamp DNA.
      if (/beat_grid_offset/i.test(error.message || '')) {
        delete payload.beat_grid_offset
        const retry = await updateById(supabase, 'music_library_tracks', 'id', row.id, payload)
        if (retry.error) {
          throw new Error(retry.error.message || 'Failed to update library beat grid')
        }
      } else {
        throw new Error(error.message || 'Failed to update library beat grid')
      }
    }
    await updateById(supabase, 'sonic_dna_cache', 'track_id', row.id, {
      sonic_dna: nextDna,
      updated_at: now,
    })
  }

  return {
    audioFileId: resolvedAudioId,
    libraryTrackIds: libraryRows.map((row) => row.id),
    beatGridOffset: offsetSec,
    sonicDna: primaryDna,
  }
}
