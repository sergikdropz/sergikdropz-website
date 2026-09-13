import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { getServerSession } from '@/lib/auth'
import { supabaseIsReachable, supabaseUnavailableResponse } from '@/lib/supabaseReachability'
import { join } from 'path'
import { readFile } from 'fs/promises'

/**
 * POST /api/music-library/restore-snapshot
 * Restores raw DB rows from a snapshot created by POST /api/music-library/sync.
 *
 * Body:
 *  - snapshotFile: string (filename inside data/backups/)
 *  - confirm: string must be "RESTORE"
 *
 * This is intentionally strict to prevent accidental destruction.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await supabaseIsReachable())) return supabaseUnavailableResponse()

    const body = await request.json().catch(() => ({}))
    const snapshotFile = String(body?.snapshotFile || '')
    const confirm = String(body?.confirm || '')

    if (!snapshotFile) {
      return NextResponse.json({ error: 'snapshotFile is required' }, { status: 400 })
    }
    if (confirm !== 'RESTORE') {
      return NextResponse.json({ error: 'Confirmation required (confirm="RESTORE")' }, { status: 400 })
    }

    // Only allow restoring from the backups directory (no path traversal)
    if (snapshotFile.includes('..') || snapshotFile.includes('/') || snapshotFile.includes('\\')) {
      return NextResponse.json({ error: 'Invalid snapshotFile' }, { status: 400 })
    }

    const snapshotPath = join(process.cwd(), 'data', 'backups', snapshotFile)
    const raw = await readFile(snapshotPath, 'utf8')
    const parsed = JSON.parse(raw)

    const folders = Array.isArray(parsed?.folders) ? parsed.folders : []
    const tracks = Array.isArray(parsed?.tracks) ? parsed.tracks : []
    const playlists = Array.isArray(parsed?.playlists) ? parsed.playlists : []

    const supabase = createSupabaseServerClient()

    // Hard overwrite: delete tables then reinsert from snapshot.
    // NOTE: This assumes these tables are admin-controlled only.
    const delTracks = await supabase.from('music_library_tracks').delete().neq('id', '__never__')
    if (delTracks.error) throw delTracks.error
    const delFolders = await supabase.from('music_library_folders').delete().neq('id', '__never__')
    if (delFolders.error) throw delFolders.error
    const delPlaylists = await supabase.from('music_library_playlists').delete().neq('id', '__never__')
    if (delPlaylists.error) throw delPlaylists.error

    const batchUpsert = async (table: string, rows: any[], batchSize = 500) => {
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize)
        if (batch.length === 0) continue
        const res = await supabase.from(table).upsert(batch, { onConflict: 'id' })
        if (res.error) throw res.error
      }
    }

    // Folders first (parent relationships), then tracks, then playlists
    await batchUpsert('music_library_folders', folders, 500)
    await batchUpsert('music_library_tracks', tracks, 500)
    await batchUpsert('music_library_playlists', playlists, 200)

    return NextResponse.json({
      success: true,
      restored: {
        folders: folders.length,
        tracks: tracks.length,
        playlists: playlists.length,
      },
      snapshotFile,
    })
  } catch (error: any) {
    console.error('Error restoring snapshot:', error)
    return NextResponse.json(
      { error: error?.message || 'Restore failed' },
      { status: 500 },
    )
  }
}

