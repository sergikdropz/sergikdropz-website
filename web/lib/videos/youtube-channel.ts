import { guessVideoCategory } from '@/lib/videos/youtube'
import type { CatalogVideo } from '@/lib/videos/types'

export type ChannelFetchResult = {
  videos: CatalogVideo[]
  error?: string
  instructions?: string[]
}

async function resolveChannelId(apiKey: string, channelId: string): Promise<string | null> {
  if (!channelId.startsWith('@')) return channelId

  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent(channelId.replace(/^@/, ''))}&key=${apiKey}`,
  )
  const data = await response.json()
  const fromHandle = data.items?.[0]?.id
  if (fromHandle) return fromHandle

  const searchResponse = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(channelId)}&key=${apiKey}`,
  )
  const searchData = await searchResponse.json()
  return searchData.items?.[0]?.id?.channelId || null
}

export async function fetchChannelUploads(): Promise<ChannelFetchResult> {
  const apiKey = process.env.YOUTUBE_API_KEY
  const channelId = process.env.YOUTUBE_CHANNEL_ID || '@sergikdropz'

  if (!apiKey) {
    return {
      videos: [],
      error: 'YouTube API key not configured',
      instructions: [
        'Add YOUTUBE_API_KEY to .env.local',
        'Enable YouTube Data API v3 in Google Cloud',
        'Or paste video URLs one at a time in Videos Manager',
      ],
    }
  }

  try {
    const resolvedId = await resolveChannelId(apiKey, channelId)
    if (!resolvedId) {
      return { videos: [], error: 'Could not resolve the YouTube channel' }
    }

    const channelInfoResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${resolvedId}&key=${apiKey}`,
    )
    const channelInfo = await channelInfoResponse.json()
    const uploadsPlaylistId = channelInfo.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
    if (!uploadsPlaylistId) {
      return { videos: [], error: 'Could not find the channel uploads playlist' }
    }

    const videosResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=50&key=${apiKey}`,
    )
    const videosData = await videosResponse.json()

    const videos: CatalogVideo[] = (videosData.items || [])
      .map((item: { snippet?: Record<string, any> }) => {
        const snippet = item.snippet || {}
        const youtubeId = snippet.resourceId?.videoId
        if (!youtubeId) return null
        const title = snippet.title || 'Untitled'
        return {
          id: youtubeId,
          title,
          description: typeof snippet.description === 'string' ? snippet.description.slice(0, 280) : '',
          youtube_id: youtubeId,
          category: guessVideoCategory(title, snippet.description || ''),
          date: typeof snippet.publishedAt === 'string' ? snippet.publishedAt.slice(0, 10) : new Date().getFullYear().toString(),
          published: true,
          featured: false,
          thumbnail: snippet.thumbnails?.maxres?.url || snippet.thumbnails?.high?.url,
        } satisfies CatalogVideo
      })
      .filter((video: CatalogVideo | null): video is CatalogVideo => video !== null)

    return { videos }
  } catch (error) {
    return {
      videos: [],
      error: error instanceof Error ? error.message : 'Failed to fetch YouTube videos',
    }
  }
}
