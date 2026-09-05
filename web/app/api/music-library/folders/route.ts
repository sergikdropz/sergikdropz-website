import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { appendFile } from 'fs/promises'
import { join } from 'path'
import { getServerSession } from '@/lib/auth'
import { getMusicVaultApiAccess } from '@/lib/music-vault-access'
import { supabaseIsReachable, supabaseUnavailableResponse } from '@/lib/supabaseReachability'
import { bumpMusicLibraryPublishVersion } from '@/lib/music-library-publish'
import { persistSystemicCover } from '@/lib/catalog-sync/persist-systemic-cover'

const logPath = join(process.cwd(), '.cursor', 'debug.log')
const log = async (obj: any) => { try { await appendFile(logPath, JSON.stringify({...obj,timestamp:Date.now(),sessionId:'debug-session',runId:'run1'})+'\n'); } catch {} }

function asJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function folderAlbumArtist(row: any): string | null {
  const fromColumn = typeof row?.album_artist === 'string' ? row.album_artist : null
  const meta = asJsonObject(row?.metadata)
  const fromMeta =
    typeof meta.album_artist === 'string'
      ? meta.album_artist
      : typeof meta.albumArtist === 'string'
        ? meta.albumArtist
        : null
  return fromColumn || fromMeta || null
}

function mapFolderRow(row: any) {
  if (!row) return row
  const albumArtist = folderAlbumArtist(row)
  return {
    ...row,
    album_artist: albumArtist,
    albumArtist,
    artwork: row.artwork || row.artwork_url || undefined,
  }
}

function isMissingFolderColumn(error: { message?: string; code?: string; details?: string }, column: string) {
  const blob = `${error.message || ''} ${error.details || ''} ${error.code || ''}`
  return (
    (error.code === 'PGRST204' && blob.includes(column)) ||
    (blob.includes('schema cache') && blob.includes(column)) ||
    blob.includes(`'${column}' column`)
  )
}

export const dynamic = 'force-dynamic'

/**
 * GET /api/music-library/folders
 * Get all folders (filtered by hidden/archived status)
 * Query params: ?includeHidden=true&includeArchived=true (admin only)
 */
export async function GET(request: NextRequest) {
  // #region agent log
  await log({location:'folders/route.ts:9',message:'GET /api/music-library/folders entry',data:{},hypothesisId:'A'})
  // #endregion
  try {
    let supabase
    try {
      supabase = createSupabaseServerClient()
    } catch (e: any) {
      return NextResponse.json(
        {
          error: 'Music library catalog unavailable',
          code: 'CATALOG_UNAVAILABLE',
          details: { reason: 'supabase_client', message: e?.message || null },
        },
        { status: 503 },
      )
    }
    const { searchParams } = new URL(request.url)
    const includeHidden = searchParams.get('includeHidden') === 'true'
    const includeArchived = searchParams.get('includeArchived') === 'true'

    const gate = await getMusicVaultApiAccess(request)
    if (!gate.ok) return gate.response
    if ((includeHidden || includeArchived) && !gate.session?.isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // #region agent log
    await log({location:'folders/route.ts:16',message:'Querying folders',data:{includeHidden,includeArchived},hypothesisId:'B'})
    // #endregion
    let query = supabase
      .from('music_library_folders')
      .select('id,name,type,parent_id,hidden,is_archived,archived_at,artwork_url,year,display_order,metadata,created_at,updated_at')
      .order('display_order', { ascending: true })
      .order('name', { ascending: true })

    if (!includeHidden) {
      query = query.or('hidden.is.null,hidden.eq.false')
    }
    if (!includeArchived) {
      query = query.or('is_archived.is.null,is_archived.eq.false')
    }

    const { data, error } = await query

    // #region agent log
    await log({location:'folders/route.ts:28',message:'Folders query result',data:{hasData:!!data,dataCount:data?.length||0,hasError:!!error,errorMessage:error?.message||null,errorCode:error?.code||null},hypothesisId:'B'})
    // #endregion

    // Supabase/Cloudflare outages sometimes surface as HTML in error.message
    const isHtml = (v: any) => typeof v === 'string' && v.includes('<!DOCTYPE html>')

    if (error || (error && isHtml((error as any)?.message)) || isHtml(data)) {
      // #region agent log
      await log({location:'folders/route.ts:31',message:'Folders query error',data:{error:error?.message,code:error?.code,details:error?.details},hypothesisId:'B'})
      // #endregion
      console.error('Error fetching folders:', error)
      return NextResponse.json(
        {
          error: 'Music library catalog unavailable',
          code: 'CATALOG_UNAVAILABLE',
          details: { message: error?.message?.substring(0, 200) || null },
        },
        { status: 503 },
      )
    }

    // #region agent log
    await log({location:'folders/route.ts:38',message:'GET /api/music-library/folders success',data:{foldersCount:data?.length||0},hypothesisId:'A'})
    // #endregion
    const headers: Record<string, string> = { 'Cache-Control': 'private, no-store, max-age=0, must-revalidate' }

    return NextResponse.json({ folders: (data || []).map(mapFolderRow) }, { headers })
  } catch (error: any) {
    // #region agent log
    await log({location:'folders/route.ts:42',message:'GET /api/music-library/folders error',data:{errorMessage:error?.message,errorStack:error?.stack},hypothesisId:'C'})
    // #endregion
    console.error('Error in GET /api/music-library/folders:', error)
    return NextResponse.json(
      {
        error: 'Music library catalog unavailable',
        code: 'CATALOG_UNAVAILABLE',
        details: { message: error?.message || null },
      },
      { status: 503 },
    )
  }
}

/**
 * POST /api/music-library/folders
 * Create a new folder
 * Body: { id, name, type, parentId?, hidden?, artwork?, year?, displayOrder? }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await supabaseIsReachable())) return supabaseUnavailableResponse()

    const supabase = createSupabaseServerClient()
    const body = await request.json()

    const { id, name, type, parentId, hidden, artwork, year, displayOrder, metadata, is_archived, archived_at } = body

    if (!id || !name || !type) {
      return NextResponse.json(
        { error: 'id, name, and type are required' },
        { status: 400 }
      )
    }

    const folderData: any = {
      id,
      name,
      type,
      parent_id: parentId || null,
      hidden: hidden || false,
      is_archived: is_archived || false,
      archived_at: archived_at || null,
      artwork_url: artwork || null,
      year: year || null,
      display_order: displayOrder || 0,
      metadata: metadata || {}
    }

    const { data, error } = await supabase
      .from('music_library_folders')
      .insert(folderData)
      .select()
      .single()

    if (error) {
      console.error('Error creating folder:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    let publishVersion: number | null = null
    try {
      publishVersion = await bumpMusicLibraryPublishVersion(session.user?.id)
    } catch {
      /* non-fatal */
    }

    return NextResponse.json({ folder: mapFolderRow(data), publishVersion }, { status: 201 })
  } catch (error: any) {
    console.error('Error in POST /api/music-library/folders:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create folder' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/music-library/folders
 * Update a folder
 * Body: { id, ...updates }
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await supabaseIsReachable())) return supabaseUnavailableResponse()

    const supabase = createSupabaseServerClient()
    const body = await request.json()

    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json(
        { error: 'id is required' },
        { status: 400 }
      )
    }

    // Map frontend field names to database field names
    const dbUpdates: Record<string, unknown> = {}
    if (updates.name !== undefined) dbUpdates.name = updates.name
    if (updates.type !== undefined) dbUpdates.type = updates.type
    if (updates.parentId !== undefined) dbUpdates.parent_id = updates.parentId
    if (updates.hidden !== undefined) dbUpdates.hidden = updates.hidden
    if (updates.artwork !== undefined) dbUpdates.artwork_url = updates.artwork || null
    if (updates.year !== undefined) dbUpdates.year = updates.year
    const albumArtist =
      updates.albumArtist !== undefined ? updates.albumArtist : updates.album_artist
    if (updates.displayOrder !== undefined) dbUpdates.display_order = updates.displayOrder
    if (updates.metadata !== undefined) dbUpdates.metadata = updates.metadata
    if (updates.is_archived !== undefined) dbUpdates.is_archived = updates.is_archived
    if (updates.archived_at !== undefined) dbUpdates.archived_at = updates.archived_at

    if (albumArtist !== undefined) {
      dbUpdates.album_artist = albumArtist
      const { data: existing } = await supabase
        .from('music_library_folders')
        .select('metadata')
        .eq('id', id)
        .single()
      dbUpdates.metadata = {
        ...asJsonObject(existing?.metadata),
        ...asJsonObject(updates.metadata),
        album_artist: albumArtist,
      }
    }

    let { data, error } = await supabase
      .from('music_library_folders')
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single()

    // Production schema never received add_itunes_style_columns.sql, so album_artist
    // is missing from PostgREST. Retry without that column; metadata already holds it.
    if (error && albumArtist !== undefined && isMissingFolderColumn(error, 'album_artist')) {
      const withoutColumn = { ...dbUpdates }
      delete withoutColumn.album_artist
      const retry = await supabase
        .from('music_library_folders')
        .update(withoutColumn)
        .eq('id', id)
        .select()
        .single()
      data = retry.data
      error = retry.error
    }

    if (error) {
      console.error('Error updating folder:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    let tracksUpdated = 0
    let audioFilesUpdated = 0
    if (updates.artwork !== undefined) {
      try {
        const propagated = await persistSystemicCover(
          supabase,
          id,
          (updates.artwork as string) || null,
        )
        tracksUpdated = propagated.tracksUpdated
        audioFilesUpdated = propagated.audioFilesUpdated
      } catch (propagateError) {
        console.error('Error propagating folder artwork to tracks:', propagateError)
      }
    }

    let publishVersion: number | null = null
    try {
      publishVersion = await bumpMusicLibraryPublishVersion(session.user?.id)
    } catch {
      /* non-fatal */
    }

    return NextResponse.json({
      folder: mapFolderRow(data),
      publishVersion,
      tracksUpdated,
      audioFilesUpdated,
    })
  } catch (error: any) {
    console.error('Error in PUT /api/music-library/folders:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update folder' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/music-library/folders
 * Archive a folder (no hard deletes)
 * Query params: ?id=folder-id
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
        { error: 'id query parameter is required' },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('music_library_folders')
      .update({ is_archived: true, archived_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      console.error('Error deleting folder:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    let publishVersion: number | null = null
    try {
      publishVersion = await bumpMusicLibraryPublishVersion(session.user?.id)
    } catch {
      /* non-fatal */
    }

    return NextResponse.json({ success: true, publishVersion })
  } catch (error: any) {
    console.error('Error in DELETE /api/music-library/folders:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete folder' },
      { status: 500 }
    )
  }
}
