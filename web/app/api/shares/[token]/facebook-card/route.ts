import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { readFacebookCardMp4 } from '@/lib/shares/facebook-card'
import { buildFacebookCardVideo } from '@/lib/shares/facebook-card-video'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

type Params = { params: Promise<{ token: string }> }

function videoResponse(bytes: Buffer, request: NextRequest): NextResponse {
  const range = request.headers.get('range')
  const total = bytes.length
  const common = {
    'Content-Type': 'video/mp4',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=86400',
  }
  const match = range ? /bytes=(\d+)-(\d*)/.exec(range) : null
  if (!match) {
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: { ...common, 'Content-Length': String(total) },
    })
  }
  const start = Number(match[1])
  const end = match[2] ? Math.min(Number(match[2]), total - 1) : total - 1
  if (!Number.isFinite(start) || start >= total || end < start) {
    return new NextResponse(null, {
      status: 416,
      headers: { ...common, 'Content-Range': `bytes */${total}` },
    })
  }
  const slice = bytes.subarray(start, end + 1)
  return new NextResponse(new Uint8Array(slice), {
    status: 206,
    headers: {
      ...common,
      'Content-Length': String(slice.length),
      'Content-Range': `bytes ${start}-${end}/${total}`,
    },
  })
}

/** GET /api/shares/[token]/facebook-card — mp4 Facebook's crawler plays in the timeline. */
export async function GET(request: NextRequest, { params }: Params) {
  const { token: raw } = await params
  const token = decodeURIComponent(raw || '').trim()
  const bytes = token ? await readFacebookCardMp4(token) : null
  if (!bytes) return new NextResponse('Not found', { status: 404 })
  return videoResponse(bytes, request)
}

/**
 * POST /api/shares/[token]/facebook-card
 * Admin: mux the listen-page card with the first track and publish an mp4 Facebook can play.
 */
export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { token: raw } = await params
    const token = decodeURIComponent(raw || '').trim()
    if (!token) {
      return NextResponse.json({ error: 'Missing share token' }, { status: 400 })
    }
    const built = await buildFacebookCardVideo(token)
    return NextResponse.json(built)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not build the Facebook player'
    console.error('POST facebook-card:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
