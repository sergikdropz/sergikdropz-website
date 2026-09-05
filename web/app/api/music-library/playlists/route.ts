import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { getServerSession } from '@/lib/auth'
import { getMusicVaultApiAccess } from '@/lib/music-vault-access'
import { supabaseIsReachable, supabaseUnavailableResponse } from '@/lib/supabaseReachability'
import { bumpMusicLibraryPublishVersion } from '@/lib/music-library-publish'
import { propagateFolderArtworkToTracks } from '@/lib/catalog-sync/propagate-folder-artwork'

function folderIdFromPlaylistId(playlistId: string) {
  return playlistId.startsWith('playlist-') ? playlistId.slice('playlist-'.length) : playlistId
}

function mapPlaylist(row: any, hidden = false) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    artwork: row.artwork_url || undefined,
    trackIds: row.track_ids || [],
    createdAt: row.created_at,
    is_archived: row.is_archived,
    archived_at: row.archived_at,
    hidden,
  }
}

/**
 * GET /api/music-library/playlists
 * Query: ?includeArchived=true&includeHidden=true (admin)
 *
 * Visibility: playlist front-end visibility is stored on the linked
 * music_library_folders.hidden row (id = playlist id without playlist- prefix).
 * Non-admin requests never receive hidden playlists.
 */
export async function GET(request: NextRequest) {
  try {
    const gate = await getMusicVaultApiAccess(request)
    if (!gate.ok) return gate.response
    const { session } = gate

    let supabase
    try {
      supabase = createSupabaseServerClient()
    } catch {
      return NextResponse.json({ playlists: [] })
    }
    const { searchParams } = new URL(request.url)
    const includeArchived = searchParams.get('includeArchived') === 'true'
    const includeHidden = searchParams.get('includeHidden') === 'true'
    if ((includeArchived || includeHidden) && !session?.isAdmin) {
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
      return NextResponse.json({ playlists: [] })
    }

    const rows = data || []
    const folderIds = [
      ...new Set(
        rows
          .map((p: any) => folderIdFromPlaylistId(String(p.id || '')))
          .filter(Boolean),
      ),
    ]

    const hiddenByFolder = new Map<string, boolean>()
    if (folderIds.length) {
      const { data: folders } = await supabase
        .from('music_library_folders')
        .select('id, hidden')
        .in('id', folderIds)
      for (const f of folders || []) {
        hiddenByFolder.set(String(f.id), !!f.hidden)
      }
    }

    let playlists = rows.map((playlist: any) => {
      const folderId = folderIdFromPlaylistId(String(playlist.id))
      return mapPlaylist(playlist, hiddenByFolder.get(folderId) === true)
    })

    if (!includeHidden) {
      playlists = playlists.filter((p) => !p.hidden)
    }

    return NextResponse.json(
      { playlists },
      { headers: { 'Cache-Control': 'private, no-store, max-age=0, must-revalidate' } },
    )
  } catch (error: any) {
    console.error('Error in GET /api/music-library/playlists:', error)
    return NextResponse.json({ playlists: [] })
  }
}

/**
 * POST /api/music-library/playlists
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
      hidden,
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

    const folderId = folderIdFromPlaylistId(String(id))
    const wantHidden = hidden === true
    // Always create visibility folder so hide/show works e2e
    const { data: existingFolder } = await supabase
      .from('music_library_folders')
      .select('id')
      .eq('id', folderId)
      .maybeSingle()
    if (!existingFolder) {
      await supabase.from('music_library_folders').insert({
        id: folderId,
        name,
        type: 'folder',
        parent_id: null,
        hidden: wantHidden,
        artwork_url: artwork || null,
      })
    } else if (hidden !== undefined) {
      await supabase.from('music_library_folders').update({ hidden: wantHidden }).eq('id', folderId)
    }

    try {
      await bumpMusicLibraryPublishVersion(session.user?.id)
    } catch {
      /* non-fatal */
    }

    return NextResponse.json({
      playlist: mapPlaylist(data, wantHidden),
    })
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
      hidden,
    } = body

    if (!id) {
      return NextResponse.json(
        { error: 'id is required' },
        { status: 400 }
      )
    }

    const dbUpdates: any = {}
    if (name !== undefined) dbUpdates.name = name
    if (description !== undefined) dbUpdates.description = description || null
    if (artwork !== undefined) dbUpdates.artwork_url = artwork || null
    if (trackIds !== undefined) dbUpdates.track_ids = trackIds || []
    if (is_archived !== undefined) dbUpdates.is_archived = is_archived
    if (archived_at !== undefined) dbUpdates.archived_at = archived_at

    let data: any = null
    if (Object.keys(dbUpdates).length) {
      const result = await supabase
        .from('music_library_playlists')
        .update(dbUpdates)
        .eq('id', id)
        .select()
        .single()
      if (result.error) {
        console.error('Error updating playlist:', result.error)
        return NextResponse.json(
          { error: 'Failed to update playlist', details: result.error.message },
          { status: 500 }
        )
      }
      data = result.data
    } else {
      const result = await supabase
        .from('music_library_playlists')
        .select()
        .eq('id', id)
        .single()
      if (result.error) {
        return NextResponse.json(
          { error: 'Failed to update playlist', details: result.error.message },
          { status: 500 }
        )
      }
      data = result.data
    }

    let isHidden = false
    const folderId = folderIdFromPlaylistId(String(id))
    if (hidden !== undefined || name !== undefined || artwork !== undefined) {
      const { data: existingFolder } = await supabase
        .from('music_library_folders')
        .select('id, hidden, type, artwork_url')
        .eq('id', folderId)
        .maybeSingle()

      const folderUpdates: Record<string, unknown> = {}
      if (name !== undefined) folderUpdates.name = name
      if (artwork !== undefined) folderUpdates.artwork_url = artwork || null
      if (hidden !== undefined) folderUpdates.hidden = !!hidden

      if (existingFolder) {
        if (Object.keys(folderUpdates).length) {
          await supabase.from('music_library_folders').update(folderUpdates).eq('id', folderId)
        }
        isHidden = hidden !== undefined ? !!hidden : !!existingFolder.hidden
      } else {
        await supabase.from('music_library_folders').insert({
          id: folderId,
          name: name || data.name,
          type: 'folder',
          parent_id: null,
          hidden: hidden === true,
          artwork_url: artwork !== undefined ? artwork || null : data.artwork_url || null,
        })
        isHidden = hidden === true
      }

      if (artwork !== undefined) {
        try {
          await propagateFolderArtworkToTracks(supabase, folderId, artwork || null)
        } catch (propagateError) {
          console.error('Error propagating playlist artwork to folder tracks:', propagateError)
        }
      }
    } else {
      const { data: existingFolder } = await supabase
        .from('music_library_folders')
        .select('hidden')
        .eq('id', folderId)
        .maybeSingle()
      isHidden = !!existingFolder?.hidden
    }

    let publishVersion: number | null = null
    if (hidden !== undefined || name !== undefined || artwork !== undefined || trackIds !== undefined) {
      try {
        publishVersion = await bumpMusicLibraryPublishVersion(session.user?.id)
      } catch {
        /* non-fatal */
      }
    }

    return NextResponse.json({
      playlist: mapPlaylist(data, isHidden),
      publishVersion,
    })
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
 * Soft-archive by default; ?hard=1 permanently deletes.
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await supabaseIsReachable())) return supabaseUnavailableResponse()

    const supabase = createSupabaseServerClient()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const hard = searchParams.get('hard') === '1' || searchParams.get('hard') === 'true'

    if (!id) {
      return NextResponse.json(
        { error: 'id is required' },
        { status: 400 }
      )
    }

    const { error } = hard
      ? await supabase.from('music_library_playlists').delete().eq('id', id)
      : await supabase
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

    if (hard) {
      const folderId = folderIdFromPlaylistId(id)
      await supabase.from('music_library_folders').delete().eq('id', folderId)
    } else {
      const folderId = folderIdFromPlaylistId(id)
      await supabase.from('music_library_folders').update({ hidden: true }).eq('id', folderId)
    }

    try {
      await bumpMusicLibraryPublishVersion(session.user?.id)
    } catch {
      /* non-fatal */
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
