import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { getMusicVaultApiAccess } from '@/lib/music-vault-access'
import { mapLibraryTrackToListItem } from '@/lib/music-library/track-list-fields'
import { buildTrackLibrarySearchOrFilter } from '@/lib/music-library/track-search'
import { applyStableTrackPaginationOrder } from '@/lib/music-library/stable-track-pagination'

// Cookie + vault gating: incompatible with static/ISR. HTTP caching via headers only if needed.
export const dynamic = 'force-dynamic'

/**
 * GET /api/music-library/tracks-optimized
 * Optimized tracks endpoint with pagination, filtering, and selective field loading
 * Query params:
 * - folderId: Filter by folder
 * - limit: Number of tracks to return (default: 50)
 * - offset: Pagination offset (default: 0)
 * - search: Search query
 * - sortBy: Sort field (default: display_order)
 * - sortOrder: Sort order (default: asc)
 * - fields: Comma-separated list of fields to include (default: basic metadata only)
 * - includeArchived: Include archived tracks (default: false)
 */
export async function GET(request: NextRequest) {
  try {
    const gate = await getMusicVaultApiAccess(request)
    if (!gate.ok) return gate.response

    let supabase
    try {
      supabase = createSupabaseServerClient()
    } catch (e: any) {
      return NextResponse.json(
        { tracks: [], total: 0, hasMore: false },
        { headers: { 'Cache-Control': 'no-cache', 'Content-Type': 'application/json' } },
      )
    }

    const { searchParams } = new URL(request.url)
    const folderId = searchParams.get('folderId')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200) // Max 200 per request
    const offset = parseInt(searchParams.get('offset') || '0')
    const search = searchParams.get('search')?.trim()
    const sortBy = searchParams.get('sortBy') || 'display_order'
    const sortOrder = searchParams.get('sortOrder') || 'asc'
    const fields = searchParams.get('fields')?.split(',') || ['basic']
    const includeArchivedRequested = searchParams.get('includeArchived') === 'true'
    const includeArchived = includeArchivedRequested && Boolean(gate.session?.isAdmin)

    // Build base query with selective fields
    // Select fields based on request
    const selectFields = []

    if (fields.includes('basic') || fields.includes('all')) {
      selectFields.push(
        'id',
        'folder_id',
        'audio_file_id',
        'title',
        'artist',
        'duration',
        'file_url',
        'created_at',
        'display_order',
        'is_archived',
        'archived_at'
      )
    }

    if (fields.includes('metadata') || fields.includes('all')) {
      selectFields.push(
        'bpm',
        'key_signature',
        'energy_level',
        'danceability',
        'genre',
        'subgenre',
        'rating',
        'play_count',
        'last_played_at',
        'track_number',
        'disc_number',
        'tags',
        'year',
        'date',
        'date_created',
        'metadata',
      )
    }

    if (fields.includes('artwork') || fields.includes('all')) {
      selectFields.push('artwork_url')
    }

    // Note: sonic_dna is intentionally excluded from initial load
    // It should be fetched lazily via separate endpoint

    let query = supabase
      .from('music_library_tracks')
      .select(`${selectFields.join(',')}, music_library_folders(id, name, type, artwork_url)`)

    // Apply filters
    if (folderId) {
      query = query.eq('folder_id', folderId)
    }
    if (!includeArchived) {
      query = query.or('is_archived.is.null,is_archived.eq.false')
    }

    if (search) {
      const searchOr = buildTrackLibrarySearchOrFilter(search)
      if (searchOr) query = query.or(searchOr)
    }

    // Apply sorting
    const validSortFields = ['display_order', 'title', 'artist', 'created_at', 'bpm', 'duration', 'genre', 'rating', 'play_count', 'last_played_at', 'year', 'track_number', 'key_signature', 'energy_level']
    const validSortOrders = ['asc', 'desc']

    if (validSortFields.includes(sortBy) && validSortOrders.includes(sortOrder)) {
      query = applyStableTrackPaginationOrder(query, {
        column: sortBy,
        ascending: sortOrder === 'asc',
      })
    } else {
      query = applyStableTrackPaginationOrder(query, {
        column: 'display_order',
        ascending: true,
      })
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1)

    // Get total count for pagination info
    const countQuery = supabase
      .from('music_library_tracks')
      .select('id', { count: 'exact', head: true })

    if (folderId) {
      countQuery.eq('folder_id', folderId)
    }
    if (!includeArchived) {
      countQuery.or('is_archived.is.null,is_archived.eq.false')
    }

    if (search) {
      const searchOr = buildTrackLibrarySearchOrFilter(search)
      if (searchOr) countQuery.or(searchOr)
    }

    const [dataResult, countResult] = await Promise.all([
      query,
      countQuery
    ])

    const { data, error } = dataResult
    const { count, error: countError } = countResult

    const isHtml = (v: any) => typeof v === 'string' && v.includes('<!DOCTYPE html>')
    if (error || (error && isHtml((error as any)?.message)) || isHtml(data)) {
      console.error('Error fetching tracks:', error)
      return NextResponse.json(
        {
          error: 'Music library tracks unavailable',
          code: 'TRACKS_UNAVAILABLE',
          details: { message: error?.message?.substring?.(0, 200) || null },
          tracks: [],
          total: 0,
          hasMore: false,
        },
        {
          status: 503,
          headers: { 'Cache-Control': 'private, no-store', 'Content-Type': 'application/json' },
        },
      )
    }

    const total = count || 0
    const hasMore = offset + limit < total

    // Many vault rows keep catalog fields on audio_files / sonic_dna_cache
    // while music_library_tracks columns are null. Fill those gaps from scalar
    // columns only — never TOAST-read sonic_dna blobs for a list page.
    const rows = data || []
    const catalogBlank = (track: any) => {
      const bpm = Number(track.bpm)
      const bpmMissing = !(Number.isFinite(bpm) && bpm >= 40 && bpm <= 240)
      const key = String(track.key_signature || '').trim().toLowerCase()
      const keyMissing = !key || key === 'unknown' || key === '[object object]'
      const genreMissing = !String(track.genre || '').trim()
      const subgenreMissing = !String(track.subgenre || '').trim()
      const durationMissing = !(Number(track.duration) > 0)
      return bpmMissing || keyMissing || genreMissing || subgenreMissing || durationMissing
    }
    const sparseRows = rows.filter((track: any) => catalogBlank(track))
    const audioMap = new Map<string, any>()
    const cacheMap = new Map<string, any>()
    const audioFileIds = [
      ...new Set(sparseRows.map((track: any) => track.audio_file_id).filter(Boolean)),
    ] as string[]
    const sparseIds = sparseRows.map((track: any) => track.id).filter(Boolean) as string[]
    if (audioFileIds.length > 0) {
      const { data: audioMeta } = await supabase
        .from('audio_files')
        .select('id, duration_seconds, artwork_url, sonic_dna_status, bpm, key_signature, energy_level, danceability')
        .in('id', audioFileIds)
      audioMeta?.forEach((file: any) => audioMap.set(file.id, file))
    }
    if (sparseIds.length > 0) {
      const { data: cacheRows } = await supabase
        .from('sonic_dna_cache')
        .select('track_id, bpm, key_signature, key, primary_genre, subgenre, energy_level, danceability')
        .in('track_id', sparseIds)
      cacheRows?.forEach((row: any) => cacheMap.set(row.track_id, row))
    }

    // List loads use scalar DNA cache columns — no sonic_dna blobs.
    let keyMissing = 0
    const tracks = rows.map((track: any) => {
      const folder = Array.isArray(track.music_library_folders)
        ? track.music_library_folders[0]
        : track.music_library_folders
      const audioFile = track.audio_file_id ? audioMap.get(track.audio_file_id) : null
      const cache = cacheMap.get(track.id)
      const audio = audioFile || cache
        ? {
            duration_seconds: audioFile?.duration_seconds,
            artwork_url: audioFile?.artwork_url,
            sonic_dna_status: audioFile?.sonic_dna_status,
            // Cache scalars are the measured catalog. audio_files.bpm is often a
            // placeholder 120 on rows that were never analyzed.
            bpm: cache?.bpm,
            key_signature: cache?.key_signature || cache?.key,
            genre: cache?.primary_genre,
            subgenre: cache?.subgenre,
            energy_level: cache?.energy_level,
            danceability: cache?.danceability,
          }
        : null
      const mapped = mapLibraryTrackToListItem(track, {
        folder: folder || null,
        audio,
      })
      if (!mapped.key_signature || mapped.key_signature === 'Unknown') {
        keyMissing += 1
      }
      return mapped
    })

    return NextResponse.json({
      tracks,
      total,
      hasMore,
      key_missing: keyMissing,
      offset,
      limit,
      search: search || null,
      folderId: folderId || null,
    }, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0, must-revalidate' },
    })

  } catch (error) {
    console.error('Unexpected error in tracks-optimized:', error)
    return NextResponse.json(
      { tracks: [], total: 0, hasMore: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
