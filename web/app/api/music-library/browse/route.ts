import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { getMusicVaultApiAccess } from '@/lib/music-vault-access'

export const dynamic = 'force-dynamic'

const TRACK_SELECT = 'id, title, artist, duration, file_url, artwork_url, bpm, key_signature, energy_level, danceability, genre, subgenre, rating, play_count, last_played_at, folder_id, year, disc_number, track_number, created_at_timestamp, sort_artist, tags, music_library_folders(name, type, artwork_url)'

/**
 * GET /api/music-library/browse
 * iTunes-style browse endpoints
 * Query params:
 *   view=songs|albums|artists|genres
 *   sort=title|artist|album|genre|bpm|year|rating|play_count|date_added|last_played
 *   dir=asc|desc
 *   genre=xxx
 *   artist=xxx
 *   search=xxx
 *   limit=50&offset=0
 */
export async function GET(request: NextRequest) {
  try {
    const gate = await getMusicVaultApiAccess(request)
    if (!gate.ok) return gate.response

    const supabase = createSupabaseServerClient()
    const { searchParams } = new URL(request.url)
    const view = searchParams.get('view') || 'songs'
    const sort = searchParams.get('sort') || 'title'
    const dir = searchParams.get('dir') || 'asc'
    const genre = searchParams.get('genre')
    const artist = searchParams.get('artist')
    const search = searchParams.get('search')?.trim()
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 200)
    const offset = parseInt(searchParams.get('offset') || '0')

    if (view === 'songs') {
      return await browseSongs(supabase, { sort, dir, genre, artist, search, limit, offset })
    }

    if (view === 'albums') {
      return await browseAlbums(supabase, { sort, dir, genre, artist, search, limit, offset })
    }

    if (view === 'artists') {
      return await browseArtists(supabase, { search, limit, offset })
    }

    if (view === 'genres') {
      return await browseGenres(supabase)
    }

    return NextResponse.json({ error: 'Invalid view' }, { status: 400 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

interface BrowseOpts {
  sort: string
  dir: string
  genre: string | null
  artist: string | null
  search: string | undefined
  limit: number
  offset: number
}

async function browseSongs(supabase: any, opts: BrowseOpts) {
  let query = supabase
    .from('music_library_tracks')
    .select(TRACK_SELECT, { count: 'exact' })
    .or('is_archived.is.null,is_archived.eq.false')

  if (opts.genre) query = query.eq('genre', opts.genre)
  if (opts.artist) query = query.ilike('artist', `%${opts.artist}%`)
  if (opts.search) query = query.or(`title.ilike.%${opts.search}%,artist.ilike.%${opts.search}%`)

  const sortMap: Record<string, string> = {
    title: 'title',
    artist: 'sort_artist',
    genre: 'genre',
    bpm: 'bpm',
    year: 'year',
    rating: 'rating',
    play_count: 'play_count',
    date_added: 'created_at_timestamp',
    last_played: 'last_played_at',
    duration: 'duration',
    key: 'key_signature',
    energy: 'energy_level',
  }

  const sortField = sortMap[opts.sort] || 'title'
  query = query.order(sortField, { ascending: opts.dir === 'asc', nullsFirst: false })

  if (opts.sort !== 'title') {
    query = query.order('title', { ascending: true })
  }

  query = query.range(opts.offset, opts.offset + opts.limit - 1)

  const { data, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    tracks: (data || []).map(mapTrack),
    total: count || 0,
    offset: opts.offset,
    limit: opts.limit,
  })
}

async function browseAlbums(supabase: any, opts: BrowseOpts) {
  let query = supabase
    .from('music_library_folders')
    .select('id, name, type, artwork_url, year, album_artist, genre, is_compilation, metadata, created_at')
    .in('type', ['album', 'ep', 'single'])
    .eq('is_archived', false)
    .eq('hidden', false)

  if (opts.genre) query = query.eq('genre', opts.genre)
  if (opts.artist) query = query.ilike('album_artist', `%${opts.artist}%`)
  if (opts.search) query = query.or(`name.ilike.%${opts.search}%,album_artist.ilike.%${opts.search}%`)

  const albumSortMap: Record<string, string> = {
    title: 'name',
    artist: 'album_artist',
    year: 'year',
    date_added: 'created_at',
  }

  const sortField = albumSortMap[opts.sort] || 'name'
  query = query.order(sortField, { ascending: opts.dir === 'asc', nullsFirst: false })
    .range(opts.offset, opts.offset + opts.limit - 1)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const albums = (data || []).map((a: any) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    artwork: a.artwork_url,
    year: a.year,
    albumArtist: a.album_artist || 'SERGIK',
    genre: a.genre,
    isCompilation: a.is_compilation,
  }))

  return NextResponse.json({ albums })
}

async function browseArtists(supabase: any, opts: { search?: string; limit: number; offset: number }) {
  let query = supabase
    .from('music_library_tracks')
    .select('artist')
    .or('is_archived.is.null,is_archived.eq.false')

  if (opts.search) query = query.ilike('artist', `%${opts.search}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const artistCounts = new Map<string, number>()
  ;(data || []).forEach((t: any) => {
    const a = t.artist || 'SERGIK'
    artistCounts.set(a, (artistCounts.get(a) || 0) + 1)
  })

  const artists = Array.from(artistCounts.entries())
    .map(([name, trackCount]) => ({ name, trackCount }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(opts.offset, opts.offset + opts.limit)

  return NextResponse.json({ artists, total: artistCounts.size })
}

async function browseGenres(supabase: any) {
  const { data, error } = await supabase
    .from('music_library_tracks')
    .select('genre')
    .or('is_archived.is.null,is_archived.eq.false')
    .not('genre', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const genreCounts = new Map<string, number>()
  ;(data || []).forEach((t: any) => {
    if (t.genre) genreCounts.set(t.genre, (genreCounts.get(t.genre) || 0) + 1)
  })

  const genres = Array.from(genreCounts.entries())
    .map(([name, trackCount]) => ({ name, trackCount }))
    .sort((a, b) => b.trackCount - a.trackCount)

  return NextResponse.json({ genres })
}

function mapTrack(t: any) {
  const folder = t.music_library_folders
  return {
    id: t.id,
    title: t.title,
    artist: t.artist,
    duration: t.duration,
    file: t.file_url,
    artwork: t.artwork_url || folder?.artwork_url || undefined,
    bpm: t.bpm,
    key_signature: t.key_signature,
    energy_level: t.energy_level,
    danceability: t.danceability,
    genre: t.genre,
    subgenre: t.subgenre,
    rating: t.rating,
    play_count: t.play_count,
    last_played_at: t.last_played_at,
    folderId: t.folder_id,
    album: folder?.name || undefined,
    albumType: folder?.type || undefined,
    year: t.year,
    disc_number: t.disc_number,
    track_number: t.track_number,
    tags: t.tags,
    created_at: t.created_at_timestamp,
  }
}
