import { NextRequest, NextResponse } from 'next/server'
import { resolveShareByToken } from '@/lib/shares/share-service'
import { SHARE_EMBED_HEIGHT, resolvePublicOrigin } from '@/lib/shares/types'

export const dynamic = 'force-dynamic'

/**
 * GET /api/oembed?url=https://site/s/TOKEN
 * Minimal oEmbed for paste-into Notion / blogs.
 */
export async function GET(request: NextRequest) {
  try {
    const urlParam = request.nextUrl.searchParams.get('url') || ''
    const maxwidth = Number(request.nextUrl.searchParams.get('maxwidth') || 480)
    const maxheight = Number(request.nextUrl.searchParams.get('maxheight') || SHARE_EMBED_HEIGHT)

    let token = ''
    try {
      const parsed = new URL(urlParam)
      const parts = parsed.pathname.split('/').filter(Boolean)
      const idx = parts.findIndex((p) => p === 's' || p === 'embed')
      if (idx >= 0 && parts[idx + 1]) token = decodeURIComponent(parts[idx + 1])
    } catch {
      return NextResponse.json({ error: 'Invalid url' }, { status: 400 })
    }

    if (!token) {
      return NextResponse.json({ error: 'url must be a /s/ or /embed/ share link' }, { status: 400 })
    }

    const origin = resolvePublicOrigin(request.headers)
    const payload = await resolveShareByToken(token, {
      includePlaybackUrls: false,
      origin,
    })
    if (!payload) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const width = Number.isFinite(maxwidth) ? Math.min(Math.max(maxwidth, 200), 900) : 480
    const height = Number.isFinite(maxheight)
      ? Math.min(Math.max(maxheight, 320), 720)
      : SHARE_EMBED_HEIGHT
    const embedSrc = `${origin}/embed/${encodeURIComponent(token)}`

    return NextResponse.json({
      version: '1.0',
      type: 'rich',
      provider_name: 'SERGIK',
      provider_url: origin,
      title: payload.share.title,
      author_name: payload.tracks[0]?.artist || payload.collection?.artist || 'SERGIK',
      html: `<iframe width="${width}" height="${height}" scrolling="no" frameborder="no" allow="autoplay; encrypted-media" src="${embedSrc}"></iframe>`,
      width,
      height,
      thumbnail_url: payload.collection?.artwork || payload.tracks[0]?.artwork || undefined,
    })
  } catch (error: any) {
    if (error?.code === 'SHARE_TABLE_MISSING') {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 503 })
    }
    console.error('GET /api/oembed:', error)
    return NextResponse.json({ error: 'oEmbed failed' }, { status: 500 })
  }
}
