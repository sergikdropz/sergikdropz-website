import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { mergeSonicDNAIntoMetadata } from '@/utils/mergeSonicDNAIntoMetadata'
import { getMusicVaultApiAccess } from '@/lib/music-vault-access'
import { supabaseIsReachable, supabaseUnavailableResponse } from '@/lib/supabaseReachability'
import { normalizeVaultAudioUrl } from '@/utils/normalizeVaultAudioUrl'
import { leanCatalogMetadata } from '@/lib/music-library/track-list-fields'

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
      .select(selectFields.join(','))

    // Apply filters
    if (folderId) {
      query = query.eq('folder_id', folderId)
    }
    if (!includeArchived) {
      query = query.or('is_archived.is.null,is_archived.eq.false')
    }

    if (search) {
      // Search in title and artist
      query = query.or(`title.ilike.%${search}%,artist.ilike.%${search}%`)
    }

    // Apply sorting
    const validSortFields = ['display_order', 'title', 'artist', 'created_at', 'bpm', 'duration', 'genre', 'rating', 'play_count', 'last_played_at', 'year', 'track_number', 'key_signature', 'energy_level']
    const validSortOrders = ['asc', 'desc']

    if (validSortFields.includes(sortBy) && validSortOrders.includes(sortOrder)) {
      query = query.order(sortBy, { ascending: sortOrder === 'asc' })
    } else {
      // Default sorting
      query = query.order('display_order', { ascending: true }).order('title', { ascending: true })
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
      countQuery.or(`title.ilike.%${search}%,artist.ilike.%${search}%`)
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
        { tracks: [], total: 0, hasMore: false },
        { headers: { 'Cache-Control': 'no-cache', 'Content-Type': 'application/json' } },
      )
    }

    const total = count || 0
    const hasMore = offset + limit < total

    // List loads use key_signature on the track row only — no sonic_dna_cache /
    // audio_files enrichment (that doubled latency per page for little browse value).
    let keyMissing = 0
    const tracks = (data || []).map((track: any) => {
      const keySignature = track.key_signature || undefined
      if (!keySignature || keySignature === 'Unknown') {
        keyMissing += 1
      }

      const metadata = leanCatalogMetadata(track.metadata)
      return {
        id: track.id,
        folderId: track.folder_id,
        audioFileId: track.audio_file_id,
        title: track.title,
        artist: track.artist,
        duration: track.duration,
        file: normalizeVaultAudioUrl(track.file_url || ''),
        artwork: track.artwork_url,
        bpm: track.bpm,
        key_signature: keySignature,
        energy_level: track.energy_level,
        danceability: track.danceability,
        created_at: track.created_at,
        date: track.date || undefined,
        date_created: track.date_created || undefined,
        year: track.year ?? undefined,
        display_order: track.display_order,
        is_archived: track.is_archived,
        archived_at: track.archived_at,
        genre: track.genre,
        subgenre: track.subgenre,
        rating: track.rating,
        play_count: track.play_count,
        last_played_at: track.last_played_at,
        track_number: track.track_number,
        disc_number: track.disc_number,
        tags: track.tags,
        ...(metadata ? { metadata } : {}),
      }
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
