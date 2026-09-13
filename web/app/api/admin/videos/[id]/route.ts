import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { loadVideoCatalog, saveVideoCatalog } from '@/lib/videos/catalog'
import { removeCatalogVideo } from '@/lib/videos/catalog-model'

export const dynamic = 'force-dynamic'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession()
    if (!session || !session.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { catalog } = await loadVideoCatalog()
    const next = removeCatalogVideo(catalog, params.id)
    const persist = await saveVideoCatalog(next, session.user.id)
    if (!persist.saved) {
      return NextResponse.json({ error: 'Could not save the video catalog' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Error deleting video:', error)
    return NextResponse.json({ error: 'Internal server error', details: message }, { status: 500 })
  }
}
