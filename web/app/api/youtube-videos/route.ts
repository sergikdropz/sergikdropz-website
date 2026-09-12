import { NextResponse } from 'next/server'
import { fetchChannelUploads } from '@/lib/videos/youtube-channel'

export const dynamic = 'force-dynamic'

export async function GET() {
  const result = await fetchChannelUploads()
  if (result.error) {
    return NextResponse.json(
      {
        error: result.error,
        instructions: result.instructions,
        manualMethod: 'Paste video URLs in /admin/videos-manager',
      },
      { status: 400 },
    )
  }

  return NextResponse.json({
    videos: result.videos,
    total: result.videos.length,
  })
}
