import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { getMusicVaultApiAccess } from '@/lib/music-vault-access'
import { bumpMusicLibraryPublishVersion } from '@/lib/music-library-publish'
import { backfillFolderArtworkFromTracks } from '@/lib/catalog-sync/backfill-folder-artwork-from-tracks'
import { invalidateCatalogSnapshots } from '@/lib/music-library/catalog-snapshot-cache'

export const dynamic = 'force-dynamic'

/**
 * POST /api/music-library/backfill-folder-artwork
 * Admin: copy track covers onto folders missing artwork_url, then bump publish version.
 */
export async function POST(request: NextRequest) {
  const gate = await getMusicVaultApiAccess(request)
  if (!gate.ok) return gate.response
  if (!gate.session?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const folderIds = Array.isArray(body?.folderIds)
      ? body.folderIds.map(String).filter(Boolean)
      : undefined

    const supabase = createSupabaseServerClient()
    const result = await backfillFolderArtworkFromTracks(supabase, folderIds)
    const version = await bumpMusicLibraryPublishVersion('admin')
    invalidateCatalogSnapshots()

    return NextResponse.json({
      ok: true,
      ...result,
      version,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Backfill failed' },
      { status: 500 },
    )
  }
}
