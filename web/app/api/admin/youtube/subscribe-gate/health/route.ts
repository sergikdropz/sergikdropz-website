import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/route-policy'
import {
  channelHandle,
  fetchSergikChannelPublicStats,
  youtubeOAuthClientId,
  youtubeOAuthConfigured,
} from '@/lib/youtube/subscribe-gate'

export const dynamic = 'force-dynamic'

/** Admin probe: OAuth configured + @sergikdropz subscriber count from YouTube Data API. */
export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const stats = await fetchSergikChannelPublicStats()
  const configured = youtubeOAuthConfigured()
  const googleClientId = youtubeOAuthClientId()

  return NextResponse.json({
    ok: configured && Boolean(stats.channelId),
    channel: channelHandle(),
    configured,
    googleClientIdPresent: Boolean(googleClientId),
    channelId: stats.channelId,
    subscriberCount: stats.subscriberCount,
    hiddenSubscriberCount: stats.hiddenSubscriberCount,
    checklist: {
      youtubeDataApiKey: Boolean(process.env.YOUTUBE_API_KEY?.trim()),
      oauthClient: configured,
      channelResolved: Boolean(stats.channelId),
      subscriberCountVisible: stats.subscriberCount != null,
    },
  })
}
