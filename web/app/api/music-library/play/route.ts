import { NextRequest, NextResponse } from 'next/server'
import { getMusicVaultApiAccess } from '@/lib/music-vault-access'
import { checkRateLimit, clientKeyFromRequest } from '@/lib/rate-limit'
import { createSupabaseServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * POST /api/music-library/play
 * Record a track play event and increment play_count
 */
export async function POST(request: NextRequest) {
  const rl = checkRateLimit(`music-play:${clientKeyFromRequest(request)}`, 120, 60_000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many play events' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
    )
  }

  try {
    const supabase = createSupabaseServerClient()
    const { trackId, duration, source = 'library' } = await request.json()

    if (!trackId || typeof trackId !== 'string') {
      return NextResponse.json({ error: 'trackId is required' }, { status: 400 })
    }

    // Never trust client-supplied fan identity for attribution.
    const safeFanId = null

    // Try RPC first, fall back to manual insert + update
    try {
      await supabase.rpc('record_track_play', {
        p_track_id: trackId,
        p_fan_id: safeFanId,
        p_duration: typeof duration === 'number' ? duration : null,
        p_source: typeof source === 'string' ? source.slice(0, 64) : 'library',
      })
    } catch {
      // RPC may not exist yet — do it manually
      await supabase
        .from('track_plays')
        .insert({
          track_id: trackId,
          fan_id: safeFanId,
          duration_listened: typeof duration === 'number' ? duration : null,
          source: typeof source === 'string' ? source.slice(0, 64) : 'library',
        })

      await supabase
        .from('music_library_tracks')
        .update({ last_played_at: new Date().toISOString() })
        .eq('id', trackId)
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Play tracking error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * GET /api/music-library/play
 * Get play history / stats
 * Query params: ?type=recent|top|history&limit=25&trackId=xxx
 */
export async function GET(request: NextRequest) {
  const gate = await getMusicVaultApiAccess(request)
  if (!gate.ok) return gate.response

  try {
    const supabase = createSupabaseServerClient()
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'recent'
    const limit = Math.min(parseInt(searchParams.get('limit') || '25'), 100)
    const trackId = searchParams.get('trackId')

    if (type === 'recent') {
      const { data, error } = await supabase
        .from('music_library_tracks')
        .select('id, title, artist, duration, file_url, artwork_url, bpm, key_signature, energy_level, danceability, genre, rating, play_count, last_played_at, folder_id, year')
        .not('last_played_at', 'is', null)
        .order('last_played_at', { ascending: false })
        .limit(limit)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      const tracks = (data || []).map(mapTrack)
      return NextResponse.json({ tracks })
    }

    if (type === 'top') {
      const { data, error } = await supabase
        .from('music_library_tracks')
        .select('id, title, artist, duration, file_url, artwork_url, bpm, key_signature, energy_level, danceability, genre, rating, play_count, last_played_at, folder_id, year')
        .gt('play_count', 0)
        .order('play_count', { ascending: false })
        .limit(limit)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      const tracks = (data || []).map(mapTrack)
      return NextResponse.json({ tracks })
    }

    if (type === 'history' && trackId) {
      const { data, error } = await supabase
        .from('track_plays')
        .select('*')
        .eq('track_id', trackId)
        .order('played_at', { ascending: false })
        .limit(limit)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ plays: data || [] })
    }

    return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

function mapTrack(t: any) {
  return {
    id: t.id,
    title: t.title,
    artist: t.artist,
    duration: t.duration,
    file: t.file_url,
    artwork: t.artwork_url,
    bpm: t.bpm,
    key_signature: t.key_signature,
    energy_level: t.energy_level,
    danceability: t.danceability,
    genre: t.genre,
    rating: t.rating,
    play_count: t.play_count,
    last_played_at: t.last_played_at,
    folderId: t.folder_id,
    year: t.year,
  }
}
