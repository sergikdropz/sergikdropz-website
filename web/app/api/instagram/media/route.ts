import { NextResponse } from 'next/server'
import { getInstagramMediaPayload } from '@/lib/instagram/media-service'

export const dynamic = 'force-dynamic'

const cacheHeaders = {
  'Cache-Control': 'public, s-maxage=180, stale-while-revalidate=600',
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const limit = parseInt(searchParams.get('limit') || '100', 10)

  const payload = await getInstagramMediaPayload(limit)

  if (payload.source === 'error' && payload.error) {
    return NextResponse.json(payload, { status: 500, headers: cacheHeaders })
  }

  return NextResponse.json(payload, { headers: cacheHeaders })
}
