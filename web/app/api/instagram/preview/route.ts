import { NextResponse } from 'next/server'
import {
  getInstagramMediaPayload,
  normalizeInstagramPermalink,
  resolvePostMediaForUrl,
  isPlaceholderMediaUrl,
} from '@/lib/instagram/media-service'

export const dynamic = 'force-dynamic'

/**
 * Resolve a single post URL to a thumbnail safe for img/video tags (proxy when needed).
 * Uses the same resolver as `/api/instagram/media` — no HTTP loopback to origin.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const postUrl = searchParams.get('url')
  if (!postUrl?.trim()) {
    return NextResponse.json({ error: 'Missing url' }, { status: 400 })
  }

  const target = normalizeInstagramPermalink(postUrl)

  try {
    const data = await getInstagramMediaPayload(200)
    const match = data.media?.find((m) => {
      const p = m.permalink || m.url
      return p && normalizeInstagramPermalink(p) === target
    })
    if (match?.mediaUrl && !isPlaceholderMediaUrl(match.mediaUrl)) {
      return NextResponse.json({
        mediaUrl: match.mediaUrl,
        type: match.type,
        source: data.source || 'media-api',
      })
    }

    const resolved = await resolvePostMediaForUrl(postUrl)
    if (resolved.mediaUrl && !isPlaceholderMediaUrl(resolved.mediaUrl)) {
      return NextResponse.json({
        mediaUrl: resolved.mediaUrl,
        type: resolved.type,
        source: 'resolved',
      })
    }

    const cleanUrl = postUrl.split('?')[0].trim()
    return NextResponse.json({
      mediaUrl: null,
      type: cleanUrl.includes('/reel/') ? 'video' : 'image',
      source: 'none',
      hint:
        'No thumbnail from Graph API list or oEmbed. Check INSTAGRAM_ACCESS_TOKEN / INSTAGRAM_USER_ID and app permissions.',
    })
  } catch (e) {
    console.error('instagram preview:', e)
    return NextResponse.json(
      { mediaUrl: null, type: null, source: 'error', message: 'Preview failed' },
      { status: 500 }
    )
  }
}
