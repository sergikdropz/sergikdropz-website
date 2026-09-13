import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { getMusicVaultApiAccess } from '@/lib/music-vault-access'
import { getMusicLibraryPublishVersion } from '@/lib/music-library-publish'
import {
  getCatalogSnapshot,
  matchCatalogEtag,
  setCatalogSnapshot,
} from '@/lib/music-library/catalog-snapshot-cache'

export const dynamic = 'force-dynamic'

/**
 * GET /api/music-library/bootstrap
 * Lean cold-path catalog: version + folder tree (no tracks) + playlists.
 * Tracks load via /tracks?folderId= or tracks-optimized hydration.
 */
export async function GET(request: NextRequest) {
  try {
    const gate = await getMusicVaultApiAccess(request)
    if (!gate.ok) return gate.response

    const { searchParams } = new URL(request.url)
    const includeHidden = searchParams.get('include_hidden') === 'true'
    if (includeHidden && !gate.session?.isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const publishVersion = await getMusicLibraryPublishVersion().catch(() => 0)
    const variant = includeHidden ? 'admin' : 'public'
    const ifNoneMatch = request.headers.get('if-none-match')
    const cached = getCatalogSnapshot('bootstrap', publishVersion, variant)
    if (cached && matchCatalogEtag(ifNoneMatch, cached.etag)) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: cached.etag,
          'Cache-Control': 'private, max-age=0, s-maxage=60, stale-while-revalidate=300',
          Vary: 'Cookie',
        },
      })
    }
    if (cached && cached.version === publishVersion) {
      return new NextResponse(cached.body, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ETag: cached.etag,
          'Cache-Control': 'private, max-age=0, s-maxage=60, stale-while-revalidate=300',
          Vary: 'Cookie',
        },
      })
    }

    const supabase = createSupabaseServerClient()

    let folderQuery = supabase
      .from('music_library_folders')
      .select(
        'id,name,type,parent_id,hidden,is_archived,archived_at,artwork_url,year,display_order,created_at,updated_at',
      )
      .or('is_archived.is.null,is_archived.eq.false')
      .order('display_order', { ascending: true })
      .order('name', { ascending: true })

    if (!includeHidden) {
      folderQuery = folderQuery.or('hidden.is.null,hidden.eq.false')
    }

    const [foldersRes, playlistsRes] = await Promise.all([
      folderQuery,
      supabase
        .from('music_library_playlists')
        .select('id,name,description,artwork_url,track_ids,is_archived,archived_at,created_at,updated_at')
        .or('is_archived.is.null,is_archived.eq.false')
        .order('created_at', { ascending: false }),
    ])

    if (foldersRes.error || playlistsRes.error) {
      console.error('[bootstrap] catalog query failed', {
        folders: foldersRes.error?.message,
        playlists: playlistsRes.error?.message,
      })
      // Do not return HTTP 200 with empty folders — clients cache that as a valid catalog.
      return NextResponse.json(
        {
          error: 'Music library catalog unavailable',
          code: 'CATALOG_UNAVAILABLE',
          details: {
            folders: foldersRes.error?.message || null,
            playlists: playlistsRes.error?.message || null,
          },
        },
        {
          status: 503,
          headers: {
            'Cache-Control': 'private, no-store',
            'Content-Type': 'application/json',
          },
        },
      )
    }

    const folders = foldersRes.data || []
    const folderMap = new Map<string, any>()
    const rootFolders: any[] = []

    for (const folder of folders) {
      const folderObj = {
        id: folder.id,
        name: folder.name,
        type: folder.type,
        parentId: folder.parent_id,
        hidden: folder.hidden,
        artwork: folder.artwork_url,
        year: folder.year,
        children: [] as any[],
        tracks: [] as any[],
      }
      folderMap.set(folder.id, folderObj)
      if (!folder.parent_id) rootFolders.push(folderObj)
    }

    for (const folder of folders) {
      if (!folder.parent_id) continue
      const parent = folderMap.get(folder.parent_id)
      const child = folderMap.get(folder.id)
      if (parent && child) parent.children.push(child)
    }

    const playlistsFormatted = (playlistsRes.data || []).map((playlist: any) => ({
      id: playlist.id,
      name: playlist.name,
      description: playlist.description || undefined,
      artwork: playlist.artwork_url || undefined,
      trackIds: playlist.track_ids || [],
      createdAt: playlist.created_at,
      is_archived: playlist.is_archived,
      archived_at: playlist.archived_at,
    }))

    const payload = {
      description: 'Music library bootstrap (folders + playlists)',
      version: publishVersion || 0,
      folders: rootFolders,
      playlists: playlistsFormatted,
      bootstrap: true,
    }

    const entry = setCatalogSnapshot('bootstrap', publishVersion || Date.now(), variant, payload)

    return new NextResponse(entry.body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ETag: entry.etag,
        'Cache-Control': 'private, max-age=0, s-maxage=60, stale-while-revalidate=300',
        Vary: 'Cookie',
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Bootstrap failed' },
      { status: 500 },
    )
  }
}
