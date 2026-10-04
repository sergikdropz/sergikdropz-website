import { NextRequest, NextResponse } from 'next/server'
import {
  YT_SUB_GATE_COOKIE,
  channelHandle,
  fetchSergikChannelPublicStats,
  readYtSubGate,
  youtubeOAuthClientId,
  youtubeOAuthConfigured,
} from '@/lib/youtube/subscribe-gate'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  let unlocked = false
  try {
    unlocked = readYtSubGate(request.cookies.get(YT_SUB_GATE_COOKIE)?.value)
  } catch {
    unlocked = false
  }
  const stats = await fetchSergikChannelPublicStats()
  return NextResponse.json({
    unlocked,
    configured: youtubeOAuthConfigured(),
    googleClientId: youtubeOAuthClientId(),
    channel: channelHandle(),
    channelId: stats.channelId,
    subscriberCount: stats.subscriberCount,
    hiddenSubscriberCount: stats.hiddenSubscriberCount,
  })
}
