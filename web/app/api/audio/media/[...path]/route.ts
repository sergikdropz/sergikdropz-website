import { createReadStream, existsSync, statSync } from 'fs'
import path from 'path'
import { Readable } from 'stream'
import { NextResponse } from 'next/server'
import { fetchR2Object, getR2MediaConfig } from '@/lib/audio/r2Media'

/**
 * Same-origin streaming proxy for vault media.
 *
 * GET /api/audio/media/unreleased/eps/SERGIK - FTP/SERGIK - FTP.mp3
 *
 * Upstream preference:
 * 1) Private Cloudflare R2 (R2_ACCOUNT_ID + keys + R2_BUCKET) — preferred for production
 * 2) Alternate audio extension (.mp3 ↔ .wav) on R2
 * 3) Local `public/audio` (dev / missing R2 object)
 * 4) HTTP origin (AUDIO_ORIGIN / NEXT_PUBLIC_AUDIO_BASE_URL) — tunnel or public r2.dev
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function upstreamOrigin(): string | null {
  const base = process.env.AUDIO_ORIGIN || process.env.NEXT_PUBLIC_AUDIO_BASE_URL || ''
  return base ? base.replace(/\/+$/, '') : null
}

function alternateRelativePath(relative: string): string | null {
  if (/\.mp3$/i.test(relative)) return relative.replace(/\.mp3$/i, '.wav')
  if (/\.wav$/i.test(relative)) return relative.replace(/\.wav$/i, '.mp3')
  return null
}

function contentTypeFor(relative: string): string {
  if (/\.wav$/i.test(relative)) return 'audio/wav'
  if (/\.mp3$/i.test(relative)) return 'audio/mpeg'
  if (/\.flac$/i.test(relative)) return 'audio/flac'
  if (/\.aiff?$/i.test(relative)) return 'audio/aiff'
  return 'application/octet-stream'
}

const PASSTHROUGH = [
  'content-type',
  'content-length',
  'content-range',
  'accept-ranges',
  'etag',
  'last-modified',
]

/** null = miss / not configured; Response = success or hard upstream error (non-404). */
async function proxyFromR2(
  request: Request,
  relative: string,
  method: 'GET' | 'HEAD',
): Promise<NextResponse | null> {
  try {
    const range = request.headers.get('range')
    const result = await fetchR2Object(relative, { method, range })
    if (!result) return null

    const out = new Headers()
    for (const [name, value] of Object.entries(result.headers)) {
      if (value) out.set(name, value)
    }
    if (!out.has('accept-ranges')) out.set('accept-ranges', 'bytes')
    out.set('cache-control', 'public, max-age=3600, stale-while-revalidate=86400')

    return new NextResponse(method === 'HEAD' ? null : result.body, {
      status: result.status,
      headers: out,
    })
  } catch (error: any) {
    const status = error?.$metadata?.httpStatusCode
    // Miss — let caller try alternate extension / local / HTTP.
    if (status === 404) return null
    return NextResponse.json(
      { error: `R2 media error: ${error?.message || 'fetch failed'}` },
      { status: 502 },
    )
  }
}

async function proxyFromLocal(
  request: Request,
  relative: string,
  method: 'GET' | 'HEAD',
): Promise<NextResponse | null> {
  const root = path.join(process.cwd(), 'public', 'audio')
  const filePath = path.resolve(root, relative)
  if (!filePath.startsWith(root + path.sep) && filePath !== root) return null
  if (!existsSync(filePath)) return null

  const stat = statSync(filePath)
  if (!stat.isFile()) return null

  const out = new Headers()
  out.set('content-type', contentTypeFor(relative))
  out.set('accept-ranges', 'bytes')
  out.set('cache-control', 'public, max-age=3600, stale-while-revalidate=86400')
  out.set('last-modified', stat.mtime.toUTCString())

  const range = request.headers.get('range')
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/i.exec(range.trim())
    if (match) {
      const start = match[1] ? Number(match[1]) : 0
      const end = match[2] ? Number(match[2]) : stat.size - 1
      if (
        Number.isFinite(start) &&
        Number.isFinite(end) &&
        start >= 0 &&
        end >= start &&
        end < stat.size
      ) {
        out.set('content-range', `bytes ${start}-${end}/${stat.size}`)
        out.set('content-length', String(end - start + 1))
        if (method === 'HEAD') {
          return new NextResponse(null, { status: 206, headers: out })
        }
        const nodeStream = createReadStream(filePath, { start, end })
        return new NextResponse(Readable.toWeb(nodeStream) as ReadableStream, {
          status: 206,
          headers: out,
        })
      }
    }
  }

  out.set('content-length', String(stat.size))
  if (method === 'HEAD') {
    return new NextResponse(null, { status: 200, headers: out })
  }
  const nodeStream = createReadStream(filePath)
  return new NextResponse(Readable.toWeb(nodeStream) as ReadableStream, {
    status: 200,
    headers: out,
  })
}

async function proxyFromHttp(request: Request, relative: string, method: 'GET' | 'HEAD') {
  const origin = upstreamOrigin()
  if (!origin) {
    return NextResponse.json({ error: 'Media origin not configured' }, { status: 503 })
  }

  // Sentinel for private R2 mode — never fetch HTTP from the site itself.
  if (/^r2:\/\//i.test(origin) || origin.includes('sergikdropz.com')) {
    return NextResponse.json({ error: 'R2 credentials not configured' }, { status: 503 })
  }

  const target = `${origin}/audio/${relative.split('/').map(encodeURIComponent).join('/')}`

  const isTunnel =
    /ngrok|trycloudflare|cloudflare\.com\/cdn-cgi/i.test(origin) && !/\.r2\.dev$/i.test(origin)

  const headers: Record<string, string> = {
    'User-Agent': 'sergik-web-media-proxy',
  }
  if (isTunnel) headers['ngrok-skip-browser-warning'] = '1'
  const range = request.headers.get('range')
  if (range) headers.Range = range
  const ifRange = request.headers.get('if-range')
  if (ifRange) headers['If-Range'] = ifRange

  let upstream: Response
  try {
    upstream = await fetch(target, {
      method,
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: `Media origin unreachable: ${error?.message || 'fetch failed'}` },
      { status: 502 },
    )
  }

  const contentType = upstream.headers.get('content-type') || ''
  if (upstream.ok && contentType.startsWith('text/html')) {
    return NextResponse.json(
      { error: 'Media origin returned an interstitial page instead of audio' },
      { status: 502 },
    )
  }

  if (!upstream.ok && upstream.status !== 206) {
    return NextResponse.json(
      { error: `Media origin responded ${upstream.status}` },
      { status: upstream.status === 404 ? 404 : 502 },
    )
  }

  const out = new Headers()
  for (const name of PASSTHROUGH) {
    const value = upstream.headers.get(name)
    if (value) out.set(name, value)
  }
  if (!out.has('accept-ranges')) out.set('accept-ranges', 'bytes')
  out.set('cache-control', 'public, max-age=3600, stale-while-revalidate=86400')

  return new NextResponse(method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    headers: out,
  })
}

async function trySources(
  request: Request,
  relative: string,
  method: 'GET' | 'HEAD',
): Promise<NextResponse | null> {
  if (getR2MediaConfig()) {
    const r2 = await proxyFromR2(request, relative, method)
    // Hard R2 errors (502) are Responses; misses are null.
    if (r2) {
      if (r2.status === 502) return r2
      return r2
    }
  }

  const local = await proxyFromLocal(request, relative, method)
  if (local) return local

  const origin = upstreamOrigin()
  if (origin && !/^r2:\/\//i.test(origin) && !origin.includes('sergikdropz.com')) {
    const http = await proxyFromHttp(request, relative, method)
    if (http.status !== 404) return http
  }

  return null
}

async function proxy(request: Request, segments: string[], method: 'GET' | 'HEAD') {
  const relative = segments.map((s) => decodeURIComponent(s)).join('/')
  if (!relative || relative.includes('..')) {
    return NextResponse.json({ error: 'Invalid media path' }, { status: 400 })
  }

  const primary = await trySources(request, relative, method)
  if (primary) return primary

  const alt = alternateRelativePath(relative)
  if (alt) {
    const secondary = await trySources(request, alt, method)
    if (secondary) return secondary
  }

  return NextResponse.json({ error: 'Media not found' }, { status: 404 })
}

export async function GET(request: Request, { params }: { params: { path: string[] } }) {
  return proxy(request, params.path || [], 'GET')
}

export async function HEAD(request: Request, { params }: { params: { path: string[] } }) {
  return proxy(request, params.path || [], 'HEAD')
}
