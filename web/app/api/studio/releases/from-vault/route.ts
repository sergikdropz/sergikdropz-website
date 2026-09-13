import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'
import { importVaultFolderToStudio } from '@/lib/studio/vault-import-server'

/**
 * POST /api/studio/releases/from-vault
 * Body: { folderId: string, releaseId?: string, fillEmptyOnly?: boolean }
 * Creates a draft release (or fills an existing one) from a Music Vault folder + Sonic DNA.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const folderId = typeof body.folderId === 'string' ? body.folderId.trim() : ''
    if (!folderId) {
      return NextResponse.json({ error: 'folderId is required' }, { status: 400 })
    }

    const supabase = createSupabaseServerClient()
    const result = await importVaultFolderToStudio(supabase, {
      folderId,
      releaseId: typeof body.releaseId === 'string' ? body.releaseId : null,
      fillEmptyOnly: body.fillEmptyOnly !== false,
    })

    await logActivity({
      actionType: result.created ? 'import_vault_folder_to_release' : 'fill_release_from_vault',
      resourceType: 'release',
      resourceId: String(result.release.id),
      details: {
        folderId,
        tracks: result.tracks.length,
        dnaHints: result.dnaHints,
      },
    })

    return NextResponse.json(result, { status: result.created ? 201 : 200 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Vault import failed'
    console.error('POST /api/studio/releases/from-vault:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
