import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function normalizeIg(u: string): string {
  try {
    const clean = u.split('?')[0].trim()
    const x = new URL(clean.startsWith('http') ? clean : `https://${clean}`)
    const host = x.hostname.replace(/^www\./, '').toLowerCase()
    const path = x.pathname.replace(/\/$/, '') || '/'
    return `${host}${path}`.toLowerCase()
  } catch {
    return u.toLowerCase().trim()
  }
}

function isPlaceholderPath(src: string | undefined): boolean {
  if (!src) return true
  return src.includes('/images/gallery/logo.png') || src.includes('/logo.svg')
}

/**
 * Resolve a single post URL to a thumbnail safe for <img> (proxy when needed).
 * Used by /instagram-helper previews — avoids brittle client-side oEmbed + permalink mismatches.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const postUrl = searchParams.get('url')
  if (!postUrl?.trim()) {
    return NextResponse.json({ error: 'Missing url' }, { status: 400 })
  }

  const target = normalizeIg(postUrl)

  try {
    const origin = new URL(request.url).origin
    const mediaRes = await fetch(`${origin}/api/instagram/media?limit=200`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
    const data = await mediaRes.json()

    if (mediaRes.ok && Array.isArray(data.media)) {
      const match = data.media.find((m: { permalink?: string; url?: string }) => {
        const p = m.permalink || m.url
        return p && normalizeIg(p) === target
      })
      if (match?.mediaUrl && !isPlaceholderPath(match.mediaUrl)) {
        return NextResponse.json({
          mediaUrl: match.mediaUrl as string,
          type: (match.type as string) || 'image',
          source: data.source || 'media-api',
        })
      }
    }

    const cleanUrl = postUrl.split('?')[0].trim()
    const oembedUrl = `https://api.instagram.com/oembed?url=${encodeURIComponent(cleanUrl)}`
    const oembedResponse = await fetch(oembedUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      cache: 'no-store',
    })

    if (oembedResponse.ok) {
      const oembedData = (await oembedResponse.json()) as { thumbnail_url?: string }
      if (oembedData.thumbnail_url) {
        const proxied = `/api/instagram/proxy-image?url=${encodeURIComponent(oembedData.thumbnail_url)}`
        return NextResponse.json({
          mediaUrl: proxied,
          type: cleanUrl.includes('/reel/') ? 'video' : 'image',
          source: 'oembed',
        })
      }
    }

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
