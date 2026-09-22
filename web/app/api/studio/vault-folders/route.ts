import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { STUDIO_VAULT_IMPORT_FOLDER_TYPES } from '@/lib/studio/vault-picker'

/**
 * GET /api/studio/vault-folders
 * List Music Vault EPs and singles for Release Studio import pickers.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const q = (searchParams.get('q') || '').trim().toLowerCase()
    const supabase = createSupabaseServerClient()

    const query = supabase
      .from('music_library_folders')
      .select('id, name, type, artwork_url, year, album_artist, genre, hidden, is_archived')
      .in('type', [...STUDIO_VAULT_IMPORT_FOLDER_TYPES])
      .or('is_archived.is.null,is_archived.eq.false')
      .order('name', { ascending: true })
      .limit(200)

    const { data, error } = await query
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    let folders = (data || []).filter((f) => f.hidden !== true)
    if (q) {
      folders = folders.filter(
        (f) =>
          String(f.name || '')
            .toLowerCase()
            .includes(q) ||
          String(f.id || '')
            .toLowerCase()
            .includes(q),
      )
    }

    // Attach track counts (lightweight)
    const ids = folders.map((f) => f.id)
    const counts = new Map<string, number>()
    if (ids.length) {
      const { data: trackRows } = await supabase
        .from('music_library_tracks')
        .select('folder_id')
        .in('folder_id', ids)
        .or('is_archived.is.null,is_archived.eq.false')
      for (const row of trackRows || []) {
        const fid = row.folder_id as string
        counts.set(fid, (counts.get(fid) || 0) + 1)
      }
    }

    return NextResponse.json({
      folders: folders.map((f) => ({
        ...f,
        trackCount: counts.get(f.id) || 0,
      })),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to list vault folders'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
