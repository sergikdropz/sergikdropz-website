import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { loadVideoCatalog, saveVideoCatalog } from '@/lib/videos/catalog'
import { uniqueVideoSlug } from '@/lib/videos/youtube'
import { fetchChannelUploads } from '@/lib/videos/youtube-channel'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session || !session.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const dryRun = body?.dryRun === true
    const fetched = await fetchChannelUploads()

    if (fetched.error) {
      return NextResponse.json(
        { error: fetched.error, instructions: fetched.instructions, videos: [] },
        { status: 400 },
      )
    }

    const { catalog } = await loadVideoCatalog()
    const existingIds = new Set(catalog.videos.map((video) => video.youtube_id))
    const incoming = fetched.videos.filter((video) => !existingIds.has(video.youtube_id))
    const usedSlugs = catalog.videos.map((video) => video.id)
    const videos = incoming.map((video) => {
      const id = uniqueVideoSlug(video.title, usedSlugs)
      usedSlugs.push(id)
      return { ...video, id }
    })

    if (!dryRun && videos.length > 0) {
      catalog.videos = [...videos, ...catalog.videos]
      const persist = await saveVideoCatalog(catalog, session.user.id)
      if (!persist.saved) {
        return NextResponse.json({ error: 'Could not save imported videos' }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      imported: dryRun ? 0 : videos.length,
      preview: dryRun,
      videos,
      skipped: fetched.videos.length - incoming.length,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Error importing YouTube videos:', error)
    return NextResponse.json({ error: 'Internal server error', details: message }, { status: 500 })
  }
}
