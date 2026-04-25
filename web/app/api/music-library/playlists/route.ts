import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { getServerSession } from '@/lib/auth'
import { getMusicVaultApiAccess } from '@/lib/music-vault-access'
import { supabaseIsReachable, supabaseUnavailableResponse } from '@/lib/supabaseReachability'

/**
 * GET /api/music-library/playlists
 * Fetch all playlists
 * Query params: ?includeArchived=true
 */
export async function GET(request: NextRequest) {
  try {
    const gate = await getMusicVaultApiAccess(request)
    if (!gate.ok) return gate.response
    const { session } = gate

    let supabase
    try {
      supabase = createSupabaseServerClient()
    } catch (e: any) {
      // Graceful degradation when Supabase is unavailable
      return NextResponse.json({ playlists: [] })
    }
    const { searchParams } = new URL(request.url)
    const includeArchived = searchParams.get('includeArchived') === 'true'
    if (includeArchived && !session?.isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let query = supabase
      .from('music_library_playlists')
      .select('id,name,description,artwork_url,track_ids,is_archived,archived_at,created_at,updated_at')
      .order('created_at', { ascending: false })

    if (!includeArchived) {
      query = query.or('is_archived.is.null,is_archived.eq.false')
    }

    const { data, error } = await query

    const isHtml = (v: any) => typeof v === 'string' && v.includes('<!DOCTYPE html>')
    if (error || (error && isHtml((error as any)?.message)) || isHtml(data)) {
      console.error('Error fetching playlists:', error)
      // Degrade gracefully so the UI can still load
      return NextResponse.json({ playlists: [] })
    }

    // Map database fields to frontend format
    const playlists = (data || []).map((playlist: any) => ({
      id: playlist.id,
      name: playlist.name,
      description: playlist.description || undefined,
      artwork: playlist.artwork_url || undefined,
      trackIds: playlist.track_ids || [],
      createdAt: playlist.created_at,
      is_archived: playlist.is_archived,
      archived_at: playlist.archived_at,
    }))

    return NextResponse.json(
      { playlists },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } },
    )
  } catch (error: any) {
    console.error('Error in GET /api/music-library/playlists:', error)
    // Degrade gracefully so the UI can still load
    return NextResponse.json({ playlists: [] })
  }
}

/**
 * POST /api/music-library/playlists
 * Create a new playlist
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await supabaseIsReachable())) return supabaseUnavailableResponse()

    const supabase = createSupabaseServerClient()
    const body = await request.json()
    const {
      id,
      name,
      description,
      artwork,
      trackIds,
      is_archived,
      archived_at,
    } = body

    if (!id || !name) {
      return NextResponse.json(
        { error: 'id and name are required' },
        { status: 400 }
      )
    }

    const playlistData: any = {
      id,
      name,
      description: description || null,
      artwork_url: artwork || null,
      track_ids: trackIds || [],
      is_archived: is_archived || false,
      archived_at: archived_at || null,
    }

    const { data, error } = await supabase
      .from('music_library_playlists')
      .insert(playlistData)
      .select()
      .single()

    if (error) {
      console.error('Error creating playlist:', error)
      return NextResponse.json(
        { error: 'Failed to create playlist', details: error.message },
        { status: 500 }
      )
    }

    // Map to frontend format
    const playlist = {
      id: data.id,
      name: data.name,
      description: data.description || undefined,
      artwork: data.artwork_url || undefined,
      trackIds: data.track_ids || [],
      createdAt: data.created_at,
      is_archived: data.is_archived,
      archived_at: data.archived_at,
    }

    return NextResponse.json({ playlist })
  } catch (error: any) {
    console.error('Error in POST /api/music-library/playlists:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/music-library/playlists
 * Update an existing playlist
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await supabaseIsReachable())) return supabaseUnavailableResponse()

    const supabase = createSupabaseServerClient()
    const body = await request.json()
    const {
      id,
      name,
      description,
      artwork,
      trackIds,
      is_archived,
      archived_at,
    } = body

    if (!id) {
      return NextResponse.json(
        { error: 'id is required' },
        { status: 400 }
      )
    }

    // Map frontend field names to database field names
    const dbUpdates: any = {}
    if (name !== undefined) dbUpdates.name = name
    if (description !== undefined) dbUpdates.description = description || null
    if (artwork !== undefined) dbUpdates.artwork_url = artwork || null
    if (trackIds !== undefined) dbUpdates.track_ids = trackIds || []
    if (is_archived !== undefined) dbUpdates.is_archived = is_archived
    if (archived_at !== undefined) dbUpdates.archived_at = archived_at

    const { data, error } = await supabase
      .from('music_library_playlists')
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating playlist:', error)
      return NextResponse.json(
        { error: 'Failed to update playlist', details: error.message },
        { status: 500 }
      )
    }

    // Map to frontend format
    const playlist = {
      id: data.id,
      name: data.name,
      description: data.description || undefined,
      artwork: data.artwork_url || undefined,
      trackIds: data.track_ids || [],
      createdAt: data.created_at,
      is_archived: data.is_archived,
      archived_at: data.archived_at,
    }

    return NextResponse.json({ playlist })
  } catch (error: any) {
    console.error('Error in PUT /api/music-library/playlists:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/music-library/playlists
 * Archive a playlist (no hard deletes)
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await supabaseIsReachable())) return supabaseUnavailableResponse()

    const supabase = createSupabaseServerClient()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'id is required' },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('music_library_playlists')
      .update({ is_archived: true, archived_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      console.error('Error deleting playlist:', error)
      return NextResponse.json(
        { error: 'Failed to delete playlist', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error in DELETE /api/music-library/playlists:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
