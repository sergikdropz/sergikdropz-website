import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getServerSession } from '@/lib/auth'
import { logActivity } from '@/lib/activity-log'
import { createSupabaseServerClient } from '@/lib/supabase'
import { bumpMusicLibraryPublishVersion, publishCatalogDisplayFields } from '@/lib/music-library-publish'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const PUBLIC_PATHS = [
  '/music-library',
  '/',
  '/shop',
  '/music',
  '/api/music-library/sync',
  '/api/music-library/folders',
  '/api/music-library/playlists',
  '/api/music-library/tracks',
  '/api/music-library/tracks-optimized',
  '/api/music-library/browse',
  '/api/music-library/catalog-version',
]

/**
 * POST /api/admin/sync-production
 * Publish the admin music catalog to the live frontend (cache bust + revalidate).
 */
export async function POST() {
  try {
    const session = await getServerSession()
    if (!session || !session.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const published = await publishCatalogDisplayFields()
    const version = await bumpMusicLibraryPublishVersion(session.user?.id)

    for (const path of PUBLIC_PATHS) {
      try {
        revalidatePath(path)
      } catch (err) {
        console.warn(`[sync-production] revalidatePath(${path}) failed`, err)
      }
    }
    try {
      revalidatePath('/music-library', 'layout')
    } catch {
      /* ignore */
    }

    let visibleFolders = 0
    let visibleTracks = 0
    try {
      const supabase = createSupabaseServerClient()
      const [{ count: folderCount }, { count: trackCount }] = await Promise.all([
        supabase
          .from('music_library_folders')
          .select('id', { count: 'exact', head: true })
          .eq('hidden', false)
          .or('is_archived.is.null,is_archived.eq.false'),
        supabase
          .from('music_library_tracks')
          .select('id', { count: 'exact', head: true })
          .or('is_archived.is.null,is_archived.eq.false'),
      ])
      visibleFolders = folderCount || 0
      visibleTracks = trackCount || 0
    } catch (err) {
      console.warn('[sync-production] Could not count catalog rows', err)
    }

    let deployHookFired = false
    const hook = process.env.VERCEL_DEPLOY_HOOK_URL || process.env.PRODUCTION_SYNC_HOOK_URL
    if (hook) {
      try {
        const hookRes = await fetch(hook, { method: 'POST' })
        deployHookFired = hookRes.ok
      } catch (err) {
        console.warn('[sync-production] Deploy hook failed', err)
      }
    }

    await logActivity({
      actionType: 'sync_production',
      resourceType: 'system',
      details: {
        triggeredBy: session.user?.email,
        version,
        published,
        visibleFolders,
        visibleTracks,
        deployHookFired,
      },
    })

    return NextResponse.json({
      success: true,
      message: 'Admin catalog published to the live site',
      version,
      published,
      visibleFolders,
      visibleTracks,
      deployHookFired,
    })
  } catch (error: any) {
    console.error('Error triggering production sync:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to publish catalog to production' },
      { status: 500 }
    )
  }
}
