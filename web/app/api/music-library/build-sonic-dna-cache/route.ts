import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/route-policy'
import { createSupabaseServerClient } from '@/lib/supabase'
import { updateSonicDNACache } from '@/utils/sonicDNACache'

/**
 * POST /api/music-library/build-sonic-dna-cache
 * Backfill `sonic_dna_cache` for fast reads (safe: idempotent via upsert).
 * Body: { force?: boolean } (force currently treated as "re-upsert everything")
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  try {
    const supabase = createSupabaseServerClient()
    const body = await request.json().catch(() => ({}))
    const force = Boolean(body?.force)

    // Avoid N+1 cache existence checks: load existing cached track_ids once.
    let existingCache = new Set<string>()
    if (!force) {
      const { data: existingRows, error: existingErr } = await supabase
        .from('sonic_dna_cache')
        .select('track_id')
      if (existingErr) throw existingErr
      existingCache = new Set((existingRows || []).map((r: any) => r.track_id))
    }

    // Pull tracks + linked audio_file columns we care about.
    // We prefer `audio_files` as source of truth but fallback to track columns if needed.
    const { data: tracks, error } = await supabase
      .from('music_library_tracks')
      .select(
        `
        id,
        audio_file_id,
        bpm,
        key_signature,
        energy_level,
        danceability,
        sonic_dna,
        audio_files (
          id,
          sonic_dna,
          bpm,
          key_signature,
          energy_level,
          danceability
        )
      `,
      )

    if (error) throw error

    let processed = 0
    let cached = 0
    let skipped = 0

    for (const track of tracks || []) {
      processed++

      const audio = (track as any).audio_files || null
      const sonicDna = audio?.sonic_dna ?? (track as any).sonic_dna ?? null

      if (!sonicDna) {
        skipped++
        continue
      }

      if (!force) {
        if (existingCache.has((track as any).id)) {
          skipped++
          continue
        }
      }

      await updateSonicDNACache(
        (track as any).id,
        (track as any).audio_file_id ?? null,
        sonicDna,
        {
          bpm: audio?.bpm ?? (track as any).bpm ?? null,
          key_signature: audio?.key_signature ?? (track as any).key_signature ?? null,
          energy_level: audio?.energy_level ?? (track as any).energy_level ?? null,
          danceability: audio?.danceability ?? (track as any).danceability ?? null,
        },
      )

      cached++
    }

    return NextResponse.json({
      success: true,
      stats: { processed, cached, skipped, force },
    })
  } catch (err: any) {
    console.error('Error building sonic_dna_cache:', err)
    return NextResponse.json(
      { error: err?.message || 'Failed to build sonic DNA cache' },
      { status: 500 },
    )
  }
}

/**
 * GET /api/music-library/build-sonic-dna-cache
 * Return cache stats.
 */
export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  try {
    const supabase = createSupabaseServerClient()
    const { count, error } = await supabase
      .from('sonic_dna_cache')
      .select('*', { count: 'exact', head: true })

    if (error) throw error

    return NextResponse.json({ cached_tracks: count || 0 })
  } catch (err: any) {
    console.error('Error fetching sonic_dna_cache stats:', err)
    return NextResponse.json(
      { error: err?.message || 'Failed to fetch cache stats' },
      { status: 500 },
    )
  }
}

