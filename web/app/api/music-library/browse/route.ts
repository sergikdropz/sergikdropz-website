import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { getMusicVaultApiAccess } from '@/lib/music-vault-access'
import { resolveImageUrl } from '@/utils/resolveImageUrl'
import { mapLibraryTrackToListItem } from '@/lib/music-library/track-list-fields'
import { backfillFolderArtworkFromTracks } from '@/lib/catalog-sync/backfill-folder-artwork-from-tracks'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0, must-revalidate' }

const TRACK_SELECT =
  'id, title, artist, duration, file_url, artwork_url, bpm, key_signature, energy_level, danceability, genre, subgenre, rating, play_count, last_played_at, folder_id, audio_file_id, year, date, date_created, disc_number, track_number, created_at_timestamp, created_at, sort_artist, tags, music_library_folders(name, type, artwork_url)'

/**
 * GET /api/music-library/browse
 * iTunes-style browse endpoints
 * Query params:
 *   view=songs|albums|artists|genres (default: albums)
 *   sort=title|artist|album|genre|subgenre|bpm|year|rating|play_count|date_added|last_played
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
    const view = searchParams.get('view') || 'albums'
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
    subgenre: 'subgenre',
    bpm: 'bpm',
    year: 'year',
    rating: 'rating',
    play_count: 'play_count',
    date_added: 'created_at_timestamp',
    date_created: 'date_created',
    last_played: 'last_played_at',
    duration: 'duration',
    key: 'key_signature',
    energy: 'energy_level',
    date: 'date',
    sonic_dna: 'created_at_timestamp',
    album: 'title',
    track_number: 'track_number',
  }

  const sortField = sortMap[opts.sort] || 'title'
  query = query.order(sortField, { ascending: opts.dir === 'asc', nullsFirst: false })

  if (opts.sort !== 'title') {
    query = query.order('title', { ascending: true })
  }

  query = query.range(opts.offset, opts.offset + opts.limit - 1)

  const { data, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = data || []
  const audioFileIds = [
    ...new Set(rows.map((t: any) => t.audio_file_id).filter(Boolean)),
  ] as string[]
  const audioMap = new Map<string, any>()
  if (audioFileIds.length > 0) {
    const { data: audioMeta } = await supabase
      .from('audio_files')
      .select('id, duration_seconds, artwork_url, created_at, sonic_dna_status, bpm, key_signature')
      .in('id', audioFileIds)
    audioMeta?.forEach((file: any) => audioMap.set(file.id, file))
  }

  return NextResponse.json({
    tracks: rows.map((t: any) =>
      mapLibraryTrackToListItem(t, {
        audio: t.audio_file_id ? audioMap.get(t.audio_file_id) : null,
        folder: t.music_library_folders || null,
      }),
    ),
    total: count || 0,
    offset: opts.offset,
    limit: opts.limit,
  }, { headers: NO_STORE })
}

function mapAlbumRows(data: any[]) {
  return (data || []).map((a: any) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    // Only real DB covers here — catalog/track fallbacks are resolved client-side.
    artwork: a.artwork_url ? resolveImageUrl(a.artwork_url) : undefined,
    year: a.year,
    albumArtist: a.album_artist || a.metadata?.album_artist || a.metadata?.albumArtist || 'SERGIK',
    genre: a.genre,
    isCompilation: a.is_compilation,
  }))
}

async function browseAlbums(supabase: any, opts: BrowseOpts) {
  const applyAlbumFilters = (query: any, mode: 'full' | 'basic') => {
    // IS NOT TRUE keeps false and null (legacy rows never got is_archived/hidden defaults)
    query = query
      .in('type', ['album', 'ep', 'single', 'remix'])
      .not('is_archived', 'is', true)
      .not('hidden', 'is', true)

    if (mode === 'full') {
      if (opts.genre) query = query.eq('genre', opts.genre)
      if (opts.artist) query = query.ilike('album_artist', `%${opts.artist}%`)
      if (opts.search) query = query.or(`name.ilike.%${opts.search}%,album_artist.ilike.%${opts.search}%`)
    } else if (opts.search) {
      query = query.ilike('name', `%${opts.search}%`)
    }

    const albumSortMap: Record<string, string> = {
      title: 'name',
      artist: mode === 'full' ? 'album_artist' : 'name',
      year: 'year',
      date_added: 'created_at',
    }
    const sortField = albumSortMap[opts.sort] || 'name'
    return query
      .order(sortField, { ascending: opts.dir === 'asc', nullsFirst: false })
      .range(opts.offset, opts.offset + Math.max(opts.limit, 1) - 1)
  }

  const basicSelect = 'id, name, type, artwork_url, year, created_at, metadata'

  const { data, error } = await applyAlbumFilters(
    supabase.from('music_library_folders').select(basicSelect),
    'basic'
  )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const albums = mapAlbumRows(data || [])

  const missingArt = albums.filter((a) => !a.artwork).map((a) => a.id)
  if (missingArt.length > 0) {
    const { data: tracks } = await supabase
      .from('music_library_tracks')
      .select('folder_id, artwork_url')
      .in('folder_id', missingArt)
      .not('artwork_url', 'is', null)

    const artByFolder = new Map<string, string>()
    for (const t of tracks || []) {
      if (t.artwork_url && t.folder_id && !artByFolder.has(t.folder_id)) {
        artByFolder.set(t.folder_id, t.artwork_url)
      }
    }
    for (const album of albums) {
      if (!album.artwork) {
        const fallback = artByFolder.get(album.id)
        if (fallback) album.artwork = resolveImageUrl(fallback)
      }
    }
    // Durable write-through so future browse skips the track-art scan
    if (artByFolder.size > 0) {
      void backfillFolderArtworkFromTracks(supabase, [...artByFolder.keys()]).catch(() => {})
    }
  }

  return NextResponse.json({ albums }, { headers: NO_STORE })
}

async function browseArtists(supabase: any, opts: { search?: string; limit: number; offset: number }) {
  const { data: rpcRows, error: rpcError } = await supabase.rpc('browse_music_artists', {
    search: opts.search || null,
    lim: opts.limit,
    off: opts.offset,
  })

  if (!rpcError && Array.isArray(rpcRows)) {
    const artists = rpcRows.map((r: any) => ({
      name: r.name,
      trackCount: Number(r.track_count) || 0,
    }))
    return NextResponse.json(
      { artists, total: artists.length + opts.offset },
      { headers: NO_STORE },
    )
  }

  // Fallback when RPC not applied yet
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

  return NextResponse.json({ artists, total: artistCounts.size }, { headers: NO_STORE })
}

async function browseGenres(supabase: any) {
  const { data: rpcRows, error: rpcError } = await supabase.rpc('browse_music_genres')

  if (!rpcError && Array.isArray(rpcRows)) {
    const genres = rpcRows.map((r: any) => ({
      name: r.name,
      trackCount: Number(r.track_count) || 0,
    }))
    return NextResponse.json({ genres }, { headers: NO_STORE })
  }

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

  return NextResponse.json({ genres }, { headers: NO_STORE })
}

