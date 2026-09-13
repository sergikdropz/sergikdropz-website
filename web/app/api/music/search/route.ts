import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export type TrackSearchResult = {
  id: string
  title: string
  artist: string
  bpm: number | null
  key_signature: string | null
  energy_level: number | null
  artwork_url: string | null
  duration_seconds: number | null
  is_purchasable: boolean
  price_usd: number | null
  sonic_dna_status: string | null
  mood: string | null
  genre: string | null
}

function extractMood(sonicDna: unknown): string | null {
  if (!sonicDna || typeof sonicDna !== 'object') return null
  const dna = sonicDna as Record<string, unknown>
  const emotional = dna.emotional as Record<string, unknown> | undefined
  const mood = emotional?.primaryMood ?? emotional?.mood ?? dna.mood
  return typeof mood === 'string' ? mood : null
}

function extractGenre(sonicDna: unknown): string | null {
  if (!sonicDna || typeof sonicDna !== 'object') return null
  const dna = sonicDna as Record<string, unknown>
  const genres = dna.genres as Record<string, unknown[]> | undefined
  const comprehensive = dna.comprehensive as Record<string, unknown> | undefined
  const primaryGenres = genres?.primaryGenres
  const genre =
    (Array.isArray(primaryGenres) ? primaryGenres[0] : undefined) ??
    (genres as Record<string, unknown> | undefined)?.primary ??
    (comprehensive?.genres as Record<string, unknown> | undefined)?.primary ??
    dna.genre
  return typeof genre === 'string' ? genre : null
}

/**
 * GET /api/music/search
 * Public endpoint. Filters audio_files by Sonic DNA attributes.
 *
 * Query params:
 *   q         — text search on title/artist
 *   mood      — partial match (case-insensitive)
 *   genre     — partial match
 *   bpm_min   — integer minimum BPM
 *   bpm_max   — integer maximum BPM
 *   key       — exact key_signature match
 *   energy_min — float 0-1 minimum energy_level
 *   energy_max — float 0-1 maximum energy_level
 *   limit     — max results (default 24, max 50)
 *   offset    — for pagination
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  const q = searchParams.get('q')?.trim() || null
  const mood = searchParams.get('mood')?.trim().toLowerCase() || null
  const genre = searchParams.get('genre')?.trim().toLowerCase() || null
  const bpmMin = searchParams.get('bpm_min') ? Number(searchParams.get('bpm_min')) : null
  const bpmMax = searchParams.get('bpm_max') ? Number(searchParams.get('bpm_max')) : null
  const key = searchParams.get('key')?.trim() || null
  const energyMin = searchParams.get('energy_min') ? Number(searchParams.get('energy_min')) : null
  const energyMax = searchParams.get('energy_max') ? Number(searchParams.get('energy_max')) : null
  const limit = Math.min(Number(searchParams.get('limit') || 24), 50)
  const offset = Number(searchParams.get('offset') || 0)

  const supabase = createSupabaseServerClient()

  let query = supabase
    .from('audio_files')
    .select(
      'id,title,artist,bpm,key_signature,energy_level,artwork_url,duration_seconds,is_purchasable,price_usd,sonic_dna_status,sonic_dna'
    )
    .order('title')

  if (q) {
    query = query.or(`title.ilike.%${q}%,artist.ilike.%${q}%`)
  }
  if (bpmMin !== null) query = query.gte('bpm', bpmMin)
  if (bpmMax !== null) query = query.lte('bpm', bpmMax)
  if (key) query = query.ilike('key_signature', key)
  if (energyMin !== null) query = query.gte('energy_level', energyMin)
  if (energyMax !== null) query = query.lte('energy_level', energyMax)

  const { data, error, count } = await query.range(offset, offset + limit - 1)

  if (error) {
    return NextResponse.json({ error: (error as { message?: string }).message ?? 'DB error' }, { status: 500 })
  }

  type RawRow = {
    id: string
    title: string
    artist: string
    bpm: number | null
    key_signature: string | null
    energy_level: number | null
    artwork_url: string | null
    duration_seconds: number | null
    is_purchasable: boolean
    price_usd: number | null
    sonic_dna_status: string | null
    sonic_dna: unknown
  }

  let results: TrackSearchResult[] = (data as RawRow[]).map((row) => ({
    id: row.id,
    title: row.title,
    artist: row.artist,
    bpm: row.bpm,
    key_signature: row.key_signature,
    energy_level: row.energy_level,
    artwork_url: row.artwork_url,
    duration_seconds: row.duration_seconds,
    is_purchasable: row.is_purchasable,
    price_usd: row.price_usd,
    sonic_dna_status: row.sonic_dna_status,
    mood: extractMood(row.sonic_dna),
    genre: extractGenre(row.sonic_dna),
  }))

  // Client-side filter on mood/genre since they live inside the JSONB column.
  // For scale, add a generated column + index instead.
  if (mood) {
    results = results.filter((r) => r.mood?.toLowerCase().includes(mood))
  }
  if (genre) {
    results = results.filter((r) => r.genre?.toLowerCase().includes(genre))
  }

  return NextResponse.json({
    tracks: results,
    total: count ?? results.length,
    limit,
    offset,
  })
}
