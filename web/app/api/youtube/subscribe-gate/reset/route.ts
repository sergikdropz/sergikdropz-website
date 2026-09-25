import { NextRequest, NextResponse } from 'next/server'
import { clearYtWatchUnlock } from '@/lib/youtube/subscribe-gate'

export const dynamic = 'force-dynamic'

/** Drops the in-page unlock so the subscribe step can be tested again. */
export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/music-library', request.url))
  clearYtWatchUnlock(response, request)
  response.headers.set('Cache-Control', 'no-store')
  return response
}
