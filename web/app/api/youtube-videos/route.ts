import { NextResponse } from 'next/server'

/**
 * API route to fetch videos from YouTube channel
 * Note: Requires YouTube Data API v3 credentials
 * 
 * To use:
 * 1. Get API key from https://console.cloud.google.com
 * 2. Enable YouTube Data API v3
 * 3. Add YOUTUBE_API_KEY to .env.local
 */

export async function GET() {
  const apiKey = process.env.YOUTUBE_API_KEY
  const channelId = process.env.YOUTUBE_CHANNEL_ID || '@sergikdropz'

  if (!apiKey) {
    return NextResponse.json(
      {
        error: 'YouTube API key not configured',
        message: 'Add YOUTUBE_API_KEY to .env.local',
        instructions: [
          '1. Visit https://console.cloud.google.com',
          '2. Create a project and enable YouTube Data API v3',
          '3. Create credentials (API Key)',
          '4. Add YOUTUBE_API_KEY=your_key to .env.local',
        ],
        manualMethod: 'Visit https://youtube.com/@sergikdropz and manually add video IDs to videos.json',
      },
      { status: 400 }
    )
  }

  try {
    // First, get channel ID from handle
    let channelIdToUse = channelId
    if (channelId.startsWith('@')) {
      const channelResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(channelId)}&key=${apiKey}`
      )
      const channelData = await channelResponse.json()
      if (channelData.items && channelData.items.length > 0) {
        channelIdToUse = channelData.items[0].id.channelId
      }
    }

    // Get uploads playlist ID
    const channelInfoResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelIdToUse}&key=${apiKey}`
    )
    const channelInfo = await channelInfoResponse.json()
    const uploadsPlaylistId = channelInfo.items?.[0]?.contentDetails?.relatedPlaylists?.uploads

    if (!uploadsPlaylistId) {
      return NextResponse.json(
        { error: 'Could not find uploads playlist' },
        { status: 404 }
      )
    }

    // Get videos from uploads playlist
    const videosResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=50&key=${apiKey}`
    )
    const videosData = await videosResponse.json()

    const videos = videosData.items?.map((item: any) => ({
      id: item.snippet.resourceId.videoId,
      title: item.snippet.title,
      description: item.snippet.description,
      youtube_id: item.snippet.resourceId.videoId,
      thumbnail: item.snippet.thumbnails.maxres?.url || item.snippet.thumbnails.high?.url,
      date: item.snippet.publishedAt.split('T')[0],
    })) || []

    return NextResponse.json({
      videos,
      total: videos.length,
    })
  } catch (error) {
    console.error('Error fetching YouTube videos:', error)
    return NextResponse.json(
      { error: 'Failed to fetch videos', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

