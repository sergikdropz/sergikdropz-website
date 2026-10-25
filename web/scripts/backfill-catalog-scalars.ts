/**
 * Copy BPM, key, and genre out of existing Sonic DNA into the small columns
 * the track list reads. Does not re-analyze audio. One small batch at a time.
 *
 *   cd web && npm run catalog:backfill-scalars
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

function loadEnvFile(file: string) {
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] == null || process.env[key] === '') process.env[key] = value
  }
}

loadEnvFile(path.join(process.cwd(), '.env.local'))
loadEnvFile(path.join(process.cwd(), '..', 'web', '.env.local'))

function blankBpm(value: unknown): boolean {
  const n = Number(value)
  return !(Number.isFinite(n) && n >= 40 && n <= 240)
}

function blankText(value: unknown): boolean {
  const text = String(value || '').trim().toLowerCase()
  return !text || text === 'unknown' || text === 'n/a' || text === 'none' || text === 'null'
}

type TrackRow = {
  id: string
  audio_file_id: string | null
  bpm: number | null
  key_signature: string | null
  genre: string | null
  subgenre: string | null
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('[catalog-scalars] Missing Supabase URL or service role')
    process.exit(1)
  }

  const { createClient } = await import('@supabase/supabase-js')
  const { catalogHintsFromSonicDna } = await import('../lib/music-library/track-list-fields')
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  const pageSize = 400
  const batchSize = 8
  let offset = 0
  let scanned = 0
  let filled = 0

  for (;;) {
    const { data, error } = await supabase
      .from('music_library_tracks')
      .select('id, audio_file_id, bpm, key_signature, genre, subgenre')
      .or('is_archived.is.null,is_archived.eq.false')
      .range(offset, offset + pageSize - 1)
    if (error) throw new Error(error.message)
    const rows = (data || []) as TrackRow[]
    if (!rows.length) break
    scanned += rows.length

    const sparse = rows.filter(
      (row) => blankBpm(row.bpm) || blankText(row.key_signature) || blankText(row.genre),
    )
    for (let i = 0; i < sparse.length; i += batchSize) {
      filled += await fillBatch(supabase, catalogHintsFromSonicDna, sparse.slice(i, i + batchSize))
    }

    console.log(`[catalog-scalars] scanned ${scanned}, columns filled ${filled}`)
    if (rows.length < pageSize) break
    offset += pageSize
  }

  console.log(`[catalog-scalars] done. scanned ${scanned}, rows updated ${filled}`)
}

async function fillBatch(
  supabase: import('@supabase/supabase-js').SupabaseClient,
  catalogHintsFromSonicDna: (dna: unknown) => {
    bpm: number | null
    key: string
    genre: string
    subgenre: string
  },
  batch: TrackRow[],
): Promise<number> {
  const audioIds = [...new Set(batch.map((row) => row.audio_file_id).filter(Boolean))] as string[]
  const audioById = new Map<string, { bpm?: number | null; key_signature?: string | null; sonic_dna?: unknown }>()
  if (audioIds.length) {
    const { data, error } = await supabase
      .from('audio_files')
      .select('id, bpm, key_signature, sonic_dna')
      .in('id', audioIds)
    if (error) throw new Error(error.message)
    for (const row of data || []) audioById.set(row.id, row)
  }

  const trackIds = batch.map((row) => row.id)
  const { data: cacheRows, error: cacheError } = await supabase
    .from('sonic_dna_cache')
    .select('track_id')
    .in('track_id', trackIds)
  if (cacheError) throw new Error(cacheError.message)
  const cached = new Set((cacheRows || []).map((row) => row.track_id))

  let updated = 0
  for (const track of batch) {
    const audio = track.audio_file_id ? audioById.get(track.audio_file_id) : null
    const hints = catalogHintsFromSonicDna(audio?.sonic_dna)
    const bpm = !blankBpm(track.bpm)
      ? null
      : !blankBpm(audio?.bpm)
        ? Math.round(Number(audio?.bpm))
        : hints.bpm
    const key = !blankText(track.key_signature)
      ? ''
      : !blankText(audio?.key_signature)
        ? String(audio?.key_signature).trim()
        : hints.key
    const genre = blankText(track.genre) ? hints.genre : ''
    const subgenre = blankText(track.subgenre) ? hints.subgenre : ''
    if (bpm == null && !key && !genre && !subgenre) continue

    const trackPatch: Record<string, unknown> = {}
    if (bpm != null) trackPatch.bpm = bpm
    if (key) trackPatch.key_signature = key
    if (genre) trackPatch.genre = genre
    if (subgenre) trackPatch.subgenre = subgenre
    const { error: trackError } = await supabase
      .from('music_library_tracks')
      .update(trackPatch)
      .eq('id', track.id)
    if (trackError) throw new Error(trackError.message)

    const cachePatch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      audio_file_id: track.audio_file_id,
    }
    if (bpm != null) cachePatch.bpm = bpm
    if (key) {
      cachePatch.key_signature = key
      cachePatch.key = key
    }
    if (genre) cachePatch.primary_genre = genre
    if (subgenre) cachePatch.subgenre = subgenre

    if (cached.has(track.id)) {
      const { error } = await supabase.from('sonic_dna_cache').update(cachePatch).eq('track_id', track.id)
      if (error) throw new Error(error.message)
    } else {
      const { error } = await supabase.from('sonic_dna_cache').insert({
        track_id: track.id,
        sonic_dna: {},
        ...cachePatch,
      })
      if (error) throw new Error(error.message)
      cached.add(track.id)
    }

    if (audio && track.audio_file_id) {
      const audioPatch: Record<string, unknown> = {}
      if (blankBpm(audio.bpm) && bpm != null) audioPatch.bpm = bpm
      if (blankText(audio.key_signature) && key) audioPatch.key_signature = key
      if (Object.keys(audioPatch).length) {
        const { error } = await supabase.from('audio_files').update(audioPatch).eq('id', track.audio_file_id)
        if (error) throw new Error(error.message)
      }
    }
    updated += 1
  }
  return updated
}

main().catch((err) => {
  console.error('[catalog-scalars]', err instanceof Error ? err.message : err)
  process.exit(1)
})
