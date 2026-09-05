import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/route-policy'
import { createSupabaseServerClient } from '@/lib/supabase'
import { bumpMusicLibraryPublishVersion } from '@/lib/music-library-publish'
import { invalidateCatalogSnapshots } from '@/lib/music-library/catalog-snapshot-cache'
import { syncAllArtworkToDatabase } from '@/lib/catalog-sync/sync-all-artwork-to-db'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * POST /api/music-library/sync-artwork
 * Admin: persist every known folder/EP cover to folders, playlists, tracks, and audio_files.
 */
export async function POST() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  try {
    const supabase = createSupabaseServerClient()
    const result = await syncAllArtworkToDatabase(supabase)
    let publishVersion: number | null = null
    try {
      publishVersion = await bumpMusicLibraryPublishVersion()
    } catch {
      /* non-fatal */
    }
    try {
      invalidateCatalogSnapshots()
    } catch {
      /* non-fatal */
    }

    return NextResponse.json({
      ok: true,
      ...result,
      publishVersion,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Artwork sync failed' },
      { status: 500 },
    )
  }
}
