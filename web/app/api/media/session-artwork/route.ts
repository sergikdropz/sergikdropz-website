import { readFile } from 'fs/promises'
import { join } from 'path'
import { NextResponse } from 'next/server'
import { artworkMimeType } from '@/lib/audio/lock-screen-media'

export const dynamic = 'force-dynamic'

/** OS lock-screen / Media Session fetches artwork out-of-band — serve bytes with explicit MIME. */
function safePublicImagePath(raw: string | null): string | null {
  if (!raw?.trim()) return null
  let decoded = raw.trim()
  try {
    decoded = decodeURIComponent(decoded)
  } catch {
    return null
  }
  if (!decoded.startsWith('/images/') && !decoded.startsWith('/audio/')) return null
  if (decoded.includes('..') || decoded.includes('\\')) return null
  const pathOnly = decoded.split('?')[0]?.split('#')[0] ?? ''
  if (!pathOnly.startsWith('/images/') && !pathOnly.startsWith('/audio/')) return null
  return pathOnly
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const pathParam = safePublicImagePath(searchParams.get('path'))
  if (!pathParam) {
    return NextResponse.json({ error: 'Invalid artwork path' }, { status: 400 })
  }

  const rel = pathParam.replace(/^\/+/, '')
  const filePath = join(process.cwd(), 'public', rel)

  try {
    const body = await readFile(filePath)
    const type = artworkMimeType(pathParam)
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': type,
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Artwork not found' }, { status: 404 })
  }
}
