import { createSupabaseServerClient } from '@/lib/supabase'
import { MUSIC_LIBRARY_PUBLISH_VERSION_KEY } from '@/lib/site-settings-keys'
import { applyPreferredGenreToSonicDna } from '@/lib/audio/groove-class-options'

const UNKNOWN = new Set(['', 'unknown', 'n/a', 'none', 'null', 'unclassified'])

export function isUsableCatalogValue(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === 'number') return Number.isFinite(value) && value > 0
  const text = String(value).trim()
  return Boolean(text) && !UNKNOWN.has(text.toLowerCase())
}

export function preferCatalogValue<T>(catalog: T, fallback: T): T {
  return isUsableCatalogValue(catalog) ? catalog : fallback
}

function parsePublishVersion(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value)
  if (value && typeof value === 'object' && 'version' in value) {
    const n = Number((value as { version: unknown }).version)
    if (Number.isFinite(n)) return n
  }
  return 0
}

export async function getMusicLibraryPublishVersion(): Promise<number> {
  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', MUSIC_LIBRARY_PUBLISH_VERSION_KEY)
      .maybeSingle()
    if (error || data == null) return 0
    return parsePublishVersion(data.value)
  } catch {
    return 0
  }
}

export async function bumpMusicLibraryPublishVersion(_updatedBy?: string): Promise<number> {
  const version = Date.now()
  const supabase = createSupabaseServerClient()
  // Live `settings` is key + value (+ updated_at). Do not send description/updated_by.
  const { error } = await supabase.from('settings').upsert(
    {
      key: MUSIC_LIBRARY_PUBLISH_VERSION_KEY,
      value: { version },
    },
    { onConflict: 'key' },
  )
  if (error) {
    console.error('[music-library-publish] Failed to bump catalog version:', error)
    throw error
  }
  try {
    const { invalidateCatalogSnapshots } = await import('@/lib/music-library/catalog-snapshot-cache')
    invalidateCatalogSnapshots()
  } catch {
    /* non-fatal */
  }
  return version
}

export type CatalogPublishStats = {
  tracks: number
  audioFiles: number
  cacheRows: number
}

/** Copy SergBrowser catalog fields (genre, BPM, key) onto audio_files + cache for the public site. */
export async function publishCatalogDisplayFields(): Promise<CatalogPublishStats> {
  const supabase = createSupabaseServerClient()
  const { data: tracks, error } = await supabase
    .from('music_library_tracks')
    .select('id, audio_file_id, title, artist, bpm, key_signature, genre, subgenre, sonic_dna, artwork_url')
    .or('is_archived.is.null,is_archived.eq.false')
  if (error) throw error

  const rows = tracks || []
  const audioIds = Array.from(new Set(rows.map((row) => row.audio_file_id).filter(Boolean))) as string[]
  const audioMap = new Map<string, any>()
  const chunkSize = 80
  for (let i = 0; i < audioIds.length; i += chunkSize) {
    const slice = audioIds.slice(i, i + chunkSize)
    const { data: audioRows, error: audioError } = await supabase
      .from('audio_files')
      .select('id, title, artist, bpm, key_signature, sonic_dna, artwork_url')
      .in('id', slice)
    if (audioError) throw audioError
    for (const audio of audioRows || []) audioMap.set(audio.id, audio)
  }

  let audioFiles = 0
  let cacheRows = 0
  const writeChunk = 12
  for (let i = 0; i < rows.length; i += writeChunk) {
    const batch = rows.slice(i, i + writeChunk)
    await Promise.all(
      batch.map(async (track) => {
        const audioId = track.audio_file_id as string | null
        const audio = audioId ? audioMap.get(audioId) : null
        const audioUpdates: Record<string, unknown> = {}
        if (isUsableCatalogValue(track.bpm) && track.bpm !== audio?.bpm) audioUpdates.bpm = track.bpm
        if (isUsableCatalogValue(track.key_signature) && track.key_signature !== audio?.key_signature) {
          audioUpdates.key_signature = track.key_signature
        }
        if (isUsableCatalogValue(track.title) && track.title !== audio?.title) audioUpdates.title = track.title
        if (isUsableCatalogValue(track.artist) && track.artist !== audio?.artist) audioUpdates.artist = track.artist
        if (isUsableCatalogValue(track.artwork_url) && track.artwork_url !== audio?.artwork_url) {
          audioUpdates.artwork_url = track.artwork_url
        }

        let dna = audio?.sonic_dna || track.sonic_dna || null
        if (isUsableCatalogValue(track.genre)) {
          dna = applyPreferredGenreToSonicDna(dna, String(track.genre), String(track.subgenre || ''))
          audioUpdates.sonic_dna = dna
        }

        if (audioId && Object.keys(audioUpdates).length) {
          const { error: updateError } = await supabase.from('audio_files').update(audioUpdates).eq('id', audioId)
          if (!updateError) audioFiles++
        }

        const cacheUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() }
        if (isUsableCatalogValue(track.bpm)) cacheUpdates.bpm = track.bpm
        if (isUsableCatalogValue(track.key_signature)) {
          cacheUpdates.key_signature = track.key_signature
          cacheUpdates.key = track.key_signature
        }
        if (isUsableCatalogValue(track.genre)) {
          cacheUpdates.primary_genre = track.genre
          cacheUpdates.genres = [track.genre, track.subgenre].filter((value) => isUsableCatalogValue(value))
        }
        if (isUsableCatalogValue(track.subgenre)) cacheUpdates.subgenre = track.subgenre
        if (dna) cacheUpdates.sonic_dna = dna

        if (Object.keys(cacheUpdates).length > 1) {
          const { error: cacheError } = await supabase
            .from('sonic_dna_cache')
            .update(cacheUpdates)
            .eq('track_id', track.id)
          if (!cacheError) cacheRows++
        }
      }),
    )
  }

  return { tracks: rows.length, audioFiles, cacheRows }
}
