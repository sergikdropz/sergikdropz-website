import { NextResponse } from 'next/server'
import { loadVideoCatalog } from '@/lib/videos/catalog'
import { featuredVideo, publicVideos } from '@/lib/videos/catalog-model'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { catalog } = await loadVideoCatalog()
    const videos = publicVideos(catalog)
    return NextResponse.json({
      videos,
      featured: featuredVideo(videos),
      youtube_channel: catalog.youtube_channel,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Error loading public videos:', error)
    return NextResponse.json({ error: 'Failed to load videos', details: message }, { status: 500 })
  }
}
