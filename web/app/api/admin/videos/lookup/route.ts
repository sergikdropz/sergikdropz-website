import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { parseYouTubeInput, youtubeThumbnailUrls, youtubeWatchUrl } from '@/lib/videos/youtube'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session || !session.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const input = request.nextUrl.searchParams.get('url') || request.nextUrl.searchParams.get('id') || ''
    const parsed = parseYouTubeInput(input)
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const watchUrl = youtubeWatchUrl(parsed.youtubeId)
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`
    const response = await fetch(oembedUrl, { next: { revalidate: 3600 } })

    if (!response.ok) {
      return NextResponse.json({
        youtube_id: parsed.youtubeId,
        title: '',
        thumbnail: youtubeThumbnailUrls(parsed.youtubeId)[1],
      })
    }

    const data = await response.json()
    return NextResponse.json({
      youtube_id: parsed.youtubeId,
      title: typeof data.title === 'string' ? data.title : '',
      author: typeof data.author_name === 'string' ? data.author_name : '',
      thumbnail:
        typeof data.thumbnail_url === 'string' ? data.thumbnail_url : youtubeThumbnailUrls(parsed.youtubeId)[1],
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
