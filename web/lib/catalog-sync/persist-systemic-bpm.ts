import type { SupabaseClient } from '@supabase/supabase-js'
import { stampCatalogOverrides } from '@/lib/catalog-lock'
import { applyAdminBpmToSonicDna } from '@/lib/audio/track-display'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type SystemicBpmResult = {
  audioFileId: string | null
  libraryTrackIds: string[]
  bpm: number
}

type CatalogBpmRow = {
  id: string
  bpm?: number | null
  original_bpm?: number | null
  metadata?: unknown
  sonic_dna?: unknown
  audio_file_id?: string | null
}

function firstRow<T>(data: T | T[] | null | undefined): T | null {
  if (!data) return null
  return Array.isArray(data) ? data[0] || null : data
}

async function selectById<T extends CatalogBpmRow>(
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

/**
 * Persist an admin ORIG BPM to audio_files, every linked library row,
 * catalog lock, sonic DNA, and cache — not just the current player session.
 */
export async function persistSystemicBpm(
  supabase: SupabaseClient,
  opts: { trackId: string; bpm: number },
): Promise<SystemicBpmResult> {
  const { trackId, bpm } = opts
  if (!UUID_RE.test(trackId)) {
    throw new Error('Track is not in the catalog')
  }

  const audioSelect = 'id, bpm, original_bpm, metadata, sonic_dna'
  const librarySelect = 'id, audio_file_id, bpm, metadata, sonic_dna'

  let audio = await selectById<CatalogBpmRow>(supabase, 'audio_files', audioSelect, trackId)
  const libraryById = await selectById<CatalogBpmRow>(
    supabase,
    'music_library_tracks',
    librarySelect,
    trackId,
  )

  const audioFileId = audio?.id || libraryById?.audio_file_id || null
  if (!audio && audioFileId && audioFileId !== trackId) {
    audio = await selectById<CatalogBpmRow>(supabase, 'audio_files', audioSelect, audioFileId)
  }

  const libraryRows: CatalogBpmRow[] = []
  if (libraryById) libraryRows.push(libraryById)

  const lookupAudioId = audioFileId || audio?.id
  if (lookupAudioId) {
    const { data } = await supabase
      .from('music_library_tracks')
      .select(librarySelect)
      .eq('audio_file_id', lookupAudioId)
    for (const row of (data || []) as CatalogBpmRow[]) {
      if (!libraryRows.some((existing) => existing.id === row.id)) libraryRows.push(row)
    }
  }

  if (!audio && libraryRows.length === 0) {
    throw new Error('Track not found')
  }

  const now = new Date().toISOString()
  const resolvedAudioId = audio?.id || audioFileId

  if (resolvedAudioId) {
    const sonic = applyAdminBpmToSonicDna(audio?.sonic_dna, bpm)
    const payload: Record<string, unknown> = {
      bpm,
      updated_at: now,
      metadata: stampCatalogOverrides(audio?.metadata, { bpm }),
    }
    if (audio?.original_bpm == null) payload.original_bpm = bpm
    if (sonic) payload.sonic_dna = sonic

    let { error } = await updateById(supabase, 'audio_files', 'id', resolvedAudioId, payload)
    if (error && /original_bpm/i.test(error.message || '')) {
      delete payload.original_bpm
      ;({ error } = await updateById(supabase, 'audio_files', 'id', resolvedAudioId, payload))
    }
    if (error && /metadata/i.test(error.message || '')) {
      delete payload.metadata
      ;({ error } = await updateById(supabase, 'audio_files', 'id', resolvedAudioId, payload))
    }
    if (error) {
      throw new Error(error.message || 'Failed to update audio BPM')
    }
  }

  for (const row of libraryRows) {
    const sonic = applyAdminBpmToSonicDna(row.sonic_dna, bpm)
    const payload: Record<string, unknown> = {
      bpm,
      updated_at: now,
      metadata: stampCatalogOverrides(row.metadata, { bpm }),
    }
    if (sonic) payload.sonic_dna = sonic
    const { error } = await updateById(supabase, 'music_library_tracks', 'id', row.id, payload)
    if (error) {
      throw new Error(error.message || 'Failed to update library BPM')
    }
    await updateById(supabase, 'sonic_dna_cache', 'track_id', row.id, {
      bpm,
      updated_at: now,
      ...(sonic ? { sonic_dna: sonic } : {}),
    })
  }

  return {
    audioFileId: resolvedAudioId,
    libraryTrackIds: libraryRows.map((row) => row.id),
    bpm,
  }
}
