import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/route-policy'
import { getMusicVaultApiAccess } from '@/lib/music-vault-access'
import { createSupabaseServerClient } from '@/lib/supabase'
import { mapLibraryTrackToListItem } from '@/lib/music-library/track-list-fields'

export const dynamic = 'force-dynamic'

/**
 * GET /api/music-library/smart-playlists
 * List smart playlists and optionally resolve their tracks
 */
export async function GET(request: NextRequest) {
  const gate = await getMusicVaultApiAccess(request)
  if (!gate.ok) return gate.response

  try {
    const supabase = createSupabaseServerClient()
    const { searchParams } = new URL(request.url)
    const resolve = searchParams.get('resolve') === 'true'
    const playlistId = searchParams.get('id')

    if (playlistId) {
      const { data: playlist, error } = await supabase
        .from('smart_playlists')
        .select('*')
        .eq('id', playlistId)
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 404 })

      if (resolve) {
        const tracks = await resolveSmartPlaylist(supabase, playlist)
        return NextResponse.json({ playlist, tracks })
      }

      return NextResponse.json({ playlist })
    }

    const { data: playlists, error } = await supabase
      .from('smart_playlists')
      .select('*')
      .order('is_system', { ascending: false })
      .order('name', { ascending: true })

    // Home-server restores may omit this table — don't break the library UI
    if (error) {
      const missing =
        error.code === '42P01' ||
        /does not exist|relation .*smart_playlists/i.test(error.message || '')
      if (missing) return NextResponse.json({ playlists: [] })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ playlists: playlists || [] })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/music-library/smart-playlists
 * Create a new smart playlist
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  try {
    const supabase = createSupabaseServerClient()
    const body = await request.json()

    const { name, description, rules, sort_by, sort_dir, max_tracks } = body

    if (!name || !rules) {
      return NextResponse.json({ error: 'name and rules are required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('smart_playlists')
      .insert({
        name,
        description: description || null,
        rules,
        sort_by: sort_by || 'created_at_timestamp',
        sort_dir: sort_dir || 'desc',
        max_tracks: max_tracks || null,
        is_system: false,
        owner_type: 'admin',
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ playlist: data }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE /api/music-library/smart-playlists?id=xxx
 */
export async function DELETE(request: NextRequest) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  try {
    const supabase = createSupabaseServerClient()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const { error } = await supabase
      .from('smart_playlists')
      .delete()
      .eq('id', id)
      .eq('is_system', false)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

const TRACK_SELECT =
  'id, title, artist, duration, file_url, artwork_url, bpm, key_signature, energy_level, danceability, genre, subgenre, rating, play_count, last_played_at, folder_id, audio_file_id, year, date, date_created, created_at_timestamp, created_at, tags, metadata, music_library_folders(name, type, artwork_url)'

async function resolveSmartPlaylist(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  playlist: any,
) {
  const rules = playlist.rules || {}
  const sortBy = playlist.sort_by || 'created_at_timestamp'
  const sortDir = playlist.sort_dir || 'desc'
  const maxTracks = playlist.max_tracks || 100

  // System playlist types
  if (rules.type === 'recently_played') {
    const { data } = await supabase
      .from('music_library_tracks')
      .select(TRACK_SELECT)
      .not('last_played_at', 'is', null)
      .or('is_archived.is.null,is_archived.eq.false')
      .order('last_played_at', { ascending: false })
      .limit(maxTracks)
    return (data || []).map(mapTrack)
  }

  if (rules.type === 'most_played') {
    const minPlays = rules.min_plays || 1
    const { data } = await supabase
      .from('music_library_tracks')
      .select(TRACK_SELECT)
      .gte('play_count', minPlays)
      .or('is_archived.is.null,is_archived.eq.false')
      .order('play_count', { ascending: false })
      .limit(maxTracks)
    return (data || []).map(mapTrack)
  }

  if (rules.type === 'recently_added') {
    const { data } = await supabase
      .from('music_library_tracks')
      .select(TRACK_SELECT)
      .or('is_archived.is.null,is_archived.eq.false')
      .order('created_at_timestamp', { ascending: false })
      .limit(maxTracks)
    return (data || []).map(mapTrack)
  }

  if (rules.type === 'top_rated') {
    const minRating = rules.min_rating || 4
    const { data } = await supabase
      .from('music_library_tracks')
      .select(TRACK_SELECT)
      .gte('rating', minRating)
      .or('is_archived.is.null,is_archived.eq.false')
      .order('rating', { ascending: false })
      .limit(maxTracks)
    return (data || []).map(mapTrack)
  }

  // Rule-based filtering
  let query = supabase
    .from('music_library_tracks')
    .select(TRACK_SELECT)
    .or('is_archived.is.null,is_archived.eq.false')

  if (rules.genre) query = query.eq('genre', rules.genre)
  if (rules.subgenre) query = query.eq('subgenre', rules.subgenre)
  if (rules.bpm_min) query = query.gte('bpm', rules.bpm_min)
  if (rules.bpm_max) query = query.lte('bpm', rules.bpm_max)
  if (rules.energy_min) query = query.gte('energy_level', rules.energy_min)
  if (rules.energy_max) query = query.lte('energy_level', rules.energy_max)
  if (rules.key) query = query.eq('key_signature', rules.key)
  if (rules.min_rating) query = query.gte('rating', rules.min_rating)
  if (rules.year_min) query = query.gte('year', rules.year_min)
  if (rules.year_max) query = query.lte('year', rules.year_max)
  if (rules.artist) query = query.ilike('artist', `%${rules.artist}%`)
  if (rules.tags && rules.tags.length > 0) query = query.overlaps('tags', rules.tags)

  const ascending = sortDir === 'asc'
  query = query.order(sortBy, { ascending }).limit(maxTracks)

  const { data } = await query
  return (data || []).map(mapTrack)
}

function mapTrack(t: any) {
  return mapLibraryTrackToListItem(t, {
    folder: t.music_library_folders || null,
  })
}
