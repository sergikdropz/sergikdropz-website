import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { loadVideoCatalog, saveVideoCatalog } from '@/lib/videos/catalog'
import { normalizeVideo, reorderCatalogVideos, upsertCatalogVideo } from '@/lib/videos/catalog-model'
import { parseYouTubeInput, uniqueVideoSlug } from '@/lib/videos/youtube'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getServerSession()
    if (!session || !session.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { catalog, source } = await loadVideoCatalog()
    return NextResponse.json({
      videos: catalog.videos,
      youtube_channel: catalog.youtube_channel,
      source,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Error fetching videos:', error)
    return NextResponse.json({ error: 'Internal server error', details: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session || !session.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = parseYouTubeInput(String(body.youtube_id || body.youtube_url || ''))
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const { catalog } = await loadVideoCatalog()
    const existing = catalog.videos.find(
      (video) => video.id === body.id || video.youtube_id === parsed.youtubeId,
    )
    const id =
      typeof body.id === 'string' && body.id.trim()
        ? body.id.trim()
        : existing?.id || uniqueVideoSlug(String(body.title || 'video'), catalog.videos.map((video) => video.id))

    const video = normalizeVideo(
      {
        ...existing,
        ...body,
        id,
        youtube_id: parsed.youtubeId,
        title: body.title || existing?.title,
      },
      0,
    )

    if (!video) {
      return NextResponse.json({ error: 'Title and a valid YouTube video are required' }, { status: 400 })
    }

    const next = upsertCatalogVideo(catalog, video)
    const persist = await saveVideoCatalog(next, session.user.id)
    if (!persist.saved) {
      return NextResponse.json({ error: 'Could not save the video catalog' }, { status: 500 })
    }

    return NextResponse.json({ success: true, video, file: persist.file, settings: persist.settings })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Error saving video:', error)
    return NextResponse.json({ error: 'Internal server error', details: message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session || !session.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { catalog } = await loadVideoCatalog()

    if (typeof body.youtube_channel === 'string' && body.youtube_channel.trim()) {
      catalog.youtube_channel = body.youtube_channel.trim()
    }

    if (Array.isArray(body.order)) {
      catalog.videos = reorderCatalogVideos(catalog.videos, body.order.filter((id: unknown) => typeof id === 'string'))
    }

    const persist = await saveVideoCatalog(catalog, session.user.id)
    if (!persist.saved) {
      return NextResponse.json({ error: 'Could not save the video catalog' }, { status: 500 })
    }

    return NextResponse.json({ success: true, videos: catalog.videos, youtube_channel: catalog.youtube_channel })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Error updating video catalog:', error)
    return NextResponse.json({ error: 'Internal server error', details: message }, { status: 500 })
  }
}
