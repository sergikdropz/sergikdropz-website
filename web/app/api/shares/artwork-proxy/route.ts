import { NextRequest, NextResponse } from 'next/server'

/** Edge + long cache — accents / CORS fallback only; display art uses CDN directly. */
export const runtime = 'edge'
export const revalidate = 86400

const ALLOWED_HOST_SUFFIXES = [
  'localhost',
  '127.0.0.1',
  'supabase.co',
  'supabase.in',
  'r2.cloudflarestorage.com',
  'r2.dev',
  'cloudflare.com',
  'sergik.com',
  'sergikdropz.com',
  'vercel.app',
]

function isAllowedArtworkUrl(raw: string): boolean {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    const host = url.hostname.toLowerCase()
    if (host === 'localhost' || host === '127.0.0.1') return true
    return ALLOWED_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))
  } catch {
    return false
  }
}

/**
 * Same-origin artwork proxy for canvas accent sampling (CORS).
 * Display `<img>` should prefer the direct CDN URL — this path is the fallback.
 * GET /api/shares/artwork-proxy?src=https://...
 */
export async function GET(request: NextRequest) {
  const src = request.nextUrl.searchParams.get('src') || ''
  if (!src) {
    return NextResponse.json({ error: 'Missing src' }, { status: 400 })
  }

  let absolute = src
  if (src.startsWith('/')) {
    absolute = `${request.nextUrl.origin}${src}`
  }

  if (!isAllowedArtworkUrl(absolute)) {
    return NextResponse.json({ error: 'Host not allowed' }, { status: 400 })
  }

  try {
    const upstream = await fetch(absolute, {
      headers: { Accept: 'image/*,*/*;q=0.8' },
      // Edge cache for a day — covers rarely change.
      next: { revalidate: 86400 },
    })
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: 'Upstream image failed' }, { status: 502 })
    }
    const contentType = upstream.headers.get('content-type') || 'image/jpeg'
    if (!contentType.startsWith('image/')) {
      return NextResponse.json({ error: 'Not an image' }, { status: 415 })
    }

    const headers = new Headers()
    headers.set('Content-Type', contentType)
    headers.set('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800')
    headers.set('Access-Control-Allow-Origin', '*')
    headers.set('CDN-Cache-Control', 'public, max-age=86400')
    const len = upstream.headers.get('content-length')
    if (len) headers.set('Content-Length', len)

    // Stream through — avoid buffering the whole image in the function.
    return new NextResponse(upstream.body, { status: 200, headers })
  } catch (error) {
    console.error('artwork-proxy:', error)
    return NextResponse.json({ error: 'Proxy failed' }, { status: 502 })
  }
}
