import type { SupabaseClient } from '@supabase/supabase-js'
import { audioFileNameLookupCandidates, audioFilePathLookupCandidates } from '@/lib/audioStoragePath'
import { resolveMeasuredLookupIds } from '@/lib/audio/load-local-measured'
import { hasStoredSonicDna } from '@/lib/audio/sonic-dna-quality'

export { hasStoredSonicDna }

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function firstRow<T>(data: T | T[] | null | undefined): T | null {
  if (!data) return null
  return Array.isArray(data) ? data[0] || null : data
}

function ilikeContains(value: string): string {
  return `%${value.replace(/[%_]/g, '\\$&')}%`
}

async function findAudioFileByPath(supabase: SupabaseClient, rawPath: string, select: string) {
  for (const candidate of audioFilePathLookupCandidates(rawPath)) {
    const { data, error } = await supabase
      .from('audio_files')
      .select(select)
      .eq('file_path', candidate)
      .limit(1)
    const row = firstRow(data)
    if (row) return row
    if (error && error.code !== 'PGRST116') {
      if (/column .* does not exist/i.test(error.message || '')) continue
      throw error
    }
  }

  for (const fileName of audioFileNameLookupCandidates(rawPath)) {
    const { data, error } = await supabase
      .from('audio_files')
      .select(select)
      .eq('file_name', fileName)
      .limit(1)
    const row = firstRow(data)
    if (row) return row
    if (error && error.code !== 'PGRST116' && !/column .* does not exist/i.test(error.message || '')) {
      throw error
    }
  }

  for (const fileName of audioFileNameLookupCandidates(rawPath)) {
    if (fileName.length < 6) continue
    const { data } = await supabase
      .from('audio_files')
      .select(select)
      .ilike('file_path', ilikeContains(fileName))
      .limit(1)
    const row = firstRow(data)
    if (row) return row
  }

  return null
}

async function findLibraryThenAudio(
  supabase: SupabaseClient,
  select: string,
  query: { column: string; value: string; exact?: boolean },
) {
  let request = supabase.from('music_library_tracks').select('id, audio_file_id, file_url, sonic_dna')
  request = query.exact === false
    ? request.ilike(query.column, query.value)
    : request.eq(query.column, query.value)
  const { data: libRows } = await request.limit(1)
  const lib = firstRow(libRows)
  if (!lib) return null
  if (lib.audio_file_id) {
    const { data } = await supabase.from('audio_files').select(select).eq('id', lib.audio_file_id).limit(1)
    const audio = firstRow(data)
    if (audio) return audio
  }
  if (lib.file_url) {
    const found = await findAudioFileByPath(supabase, lib.file_url, select)
    if (found) return found
  }
  return lib.audio_file_id || lib.sonic_dna ? { id: lib.audio_file_id || lib.id, sonic_dna: lib.sonic_dna } : null
}

/**
 * Resolve an audio_files row from a client path, audio UUID, or library track id.
 */
export async function findAudioFile(
  supabase: SupabaseClient,
  opts: {
    path?: string | null
    trackId?: string | null
    audioFileId?: string | null
    title?: string | null
    select: string
  },
): Promise<Record<string, any> | null> {
  const { path, title, select } = opts
  const seedIds = [opts.audioFileId, opts.trackId].filter((id): id is string => Boolean(id && String(id).trim()))
  const resolvedIds = [
    ...seedIds.flatMap((id) => resolveMeasuredLookupIds(id, path)),
    ...resolveMeasuredLookupIds(null, path),
  ]
  const trackId = opts.audioFileId || opts.trackId

  for (const id of resolvedIds) {
    if (!UUID_RE.test(id)) continue
    const { data } = await supabase.from('audio_files').select(select).eq('id', id).limit(1)
    const row = firstRow(data)
    if (row) return row
  }

  if (trackId && UUID_RE.test(trackId)) {
    const { data } = await supabase.from('audio_files').select(select).eq('id', trackId).limit(1)
    const byAudio = firstRow(data)
    if (byAudio) return byAudio
    const viaAudioFk = await findLibraryThenAudio(supabase, select, {
      column: 'audio_file_id',
      value: trackId,
    })
    if (viaAudioFk) return viaAudioFk
  }

  for (const id of seedIds) {
    const viaLibraryId = await findLibraryThenAudio(supabase, select, { column: 'id', value: id })
    if (viaLibraryId) return viaLibraryId
  }

  if (path) {
    for (const fileName of audioFileNameLookupCandidates(path)) {
      if (fileName.length < 6) continue
      const encoded = fileName.replace(/ /g, '%20')
      for (const value of [fileName, encoded]) {
        const viaUrl = await findLibraryThenAudio(supabase, select, {
          column: 'file_url',
          value: ilikeContains(value),
          exact: false,
        })
        if (viaUrl) return viaUrl
      }
    }
    const byPath = await findAudioFileByPath(supabase, path, select)
    if (byPath) return byPath
  }

  if (title && title.trim().length >= 3) {
    const viaTitle = await findLibraryThenAudio(supabase, select, { column: 'title', value: title.trim() })
    if (viaTitle) return viaTitle
    const { data } = await supabase.from('audio_files').select(select).ilike('title', title.trim()).limit(2)
    const rows = Array.isArray(data) ? data : data ? [data] : []
    if (rows.length === 1) return rows[0]
  }

  return null
}
