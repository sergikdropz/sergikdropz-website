import { NextRequest, NextResponse } from 'next/server'
import { loadVideoCatalog } from '@/lib/videos/catalog'
import { isYouTubeId } from '@/lib/videos/youtube'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const id = (request.nextUrl.searchParams.get('id') || '').trim()
  if (!isYouTubeId(id)) {
    return NextResponse.json({ error: 'Invalid video id' }, { status: 400 })
  }

  const fromYouTube = (await fetchInnertubeSnippet(id)) || (await fetchYouTubeDataSnippet(id))
  if (fromYouTube) {
    return NextResponse.json(fromYouTube, {
      headers: { 'Cache-Control': 'public, max-age=3600' },
    })
  }

  try {
    const { catalog } = await loadVideoCatalog()
    const match = catalog.videos.find((video) => video.youtube_id === id)
    if (match) {
      return NextResponse.json(
        { title: match.title, description: match.description || '' },
        { headers: { 'Cache-Control': 'public, max-age=300' } },
      )
    }
  } catch {
    /* catalog is optional */
  }

  return NextResponse.json({ title: '', description: '' })
}

async function fetchInnertubeSnippet(id: string): Promise<{ title: string; description: string } | null> {
  try {
    const response = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
      body: JSON.stringify({
        context: { client: { clientName: 'WEB', clientVersion: '2.20240901.00.00' } },
        videoId: id,
      }),
    })
    if (!response.ok) return null
    const data = await response.json()
    const details = data?.videoDetails
    if (!details || typeof details !== 'object') return null
    const description = typeof details.shortDescription === 'string' ? details.shortDescription : ''
    const title = typeof details.title === 'string' ? details.title : ''
    if (!title && !description) return null
    return { title, description }
  } catch {
    return null
  }
}

async function fetchYouTubeDataSnippet(id: string): Promise<{ title: string; description: string } | null> {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) return null
  try {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(id)}&key=${encodeURIComponent(apiKey)}`
    const response = await fetch(url)
    if (!response.ok) return null
    const data = await response.json()
    const snippet = data?.items?.[0]?.snippet
    if (!snippet || typeof snippet !== 'object') return null
    return {
      title: typeof snippet.title === 'string' ? snippet.title : '',
      description: typeof snippet.description === 'string' ? snippet.description : '',
    }
  } catch {
    return null
  }
}
