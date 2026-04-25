import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { appendFile } from 'fs/promises'
import { join } from 'path'
import { getServerSession } from '@/lib/auth'
import { getMusicVaultApiAccess } from '@/lib/music-vault-access'
import { supabaseIsReachable, supabaseUnavailableResponse } from '@/lib/supabaseReachability'

const logPath = join(process.cwd(), '.cursor', 'debug.log')
const log = async (obj: any) => { try { await appendFile(logPath, JSON.stringify({...obj,timestamp:Date.now(),sessionId:'debug-session',runId:'run1'})+'\n'); } catch {} }

// Cache folders for 5 minutes
export const revalidate = 300

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
      // Graceful degradation when Supabase is unavailable
      return NextResponse.json({ folders: [] })
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
      .select('id,name,type,parent_id,hidden,is_archived,archived_at,artwork_url,year,display_order,created_at,updated_at')
      .order('display_order', { ascending: true })
      .order('name', { ascending: true })

    if (!includeHidden) {
      query = query.eq('hidden', false)
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
      // Degrade gracefully so the UI can still load
      return NextResponse.json({ folders: [] })
    }

    // #region agent log
    await log({location:'folders/route.ts:38',message:'GET /api/music-library/folders success',data:{foldersCount:data?.length||0},hypothesisId:'A'})
    // #endregion
    const headers: Record<string, string> = includeHidden || includeArchived
      ? { 'Cache-Control': 'no-store' }
      : { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' }

    return NextResponse.json({ folders: data || [] }, { headers })
  } catch (error: any) {
    // #region agent log
    await log({location:'folders/route.ts:42',message:'GET /api/music-library/folders error',data:{errorMessage:error?.message,errorStack:error?.stack},hypothesisId:'C'})
    // #endregion
    console.error('Error in GET /api/music-library/folders:', error)
    // Degrade gracefully so the UI can still load
    return NextResponse.json({ folders: [] })
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

    return NextResponse.json({ folder: data }, { status: 201 })
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
    const dbUpdates: any = {}
    if (updates.name !== undefined) dbUpdates.name = updates.name
    if (updates.type !== undefined) dbUpdates.type = updates.type
    if (updates.parentId !== undefined) dbUpdates.parent_id = updates.parentId
    if (updates.hidden !== undefined) dbUpdates.hidden = updates.hidden
    if (updates.artwork !== undefined) dbUpdates.artwork_url = updates.artwork
    if (updates.year !== undefined) dbUpdates.year = updates.year
    if (updates.displayOrder !== undefined) dbUpdates.display_order = updates.displayOrder
    if (updates.metadata !== undefined) dbUpdates.metadata = updates.metadata
    if (updates.is_archived !== undefined) dbUpdates.is_archived = updates.is_archived
    if (updates.archived_at !== undefined) dbUpdates.archived_at = updates.archived_at

    const { data, error } = await supabase
      .from('music_library_folders')
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating folder:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ folder: data })
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

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error in DELETE /api/music-library/folders:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete folder' },
      { status: 500 }
    )
  }
}
