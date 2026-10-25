import { NextResponse } from 'next/server'
import { contentTypeForDownload } from '@/lib/shares/share-download-bytes'
import { fetchArtworkJpeg, loadShareDownloadTags, taggedShareAudio } from '@/lib/shares/share-download-embed'
import { resolveShopOrderDownload, shopOrderTags, vaultDownloadFileName } from '@/lib/shop/order-download'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 180

function attachmentName(filename: string): string {
  const ascii = filename.replace(/["\\]/g, '').replace(/[^\x20-\x7e]/g, '')
  return `attachment; filename="${ascii || 'download.mp3'}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const sessionId = url.searchParams.get('session_id')?.trim() || ''
  const trackId = url.searchParams.get('track')?.trim() || ''
  const result = await resolveShopOrderDownload(sessionId)
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.status })
  }

  const track = result.order.tracks.find((row) => row.id === trackId)
  if (!track) return NextResponse.json({ error: 'Track not found' }, { status: 404 })

  const libraryTags = await loadShareDownloadTags([{ id: track.id, title: track.title, artist: track.artist }], {
    title: track.album,
    artist: result.order.artist,
    year: track.year,
    artworkUrl: result.order.artwork,
  }).catch(() => null)

  const tags = shopOrderTags(track, result.order.tracks.length, libraryTags?.get(track.id))
  const artworkJpeg = await fetchArtworkJpeg(result.order.artwork)
  const bytes = await taggedShareAudio({
    relativePath: track.relativePath,
    format: track.ext,
    tags,
    artworkJpeg,
  })
  if (!bytes) return NextResponse.json({ error: 'File unavailable' }, { status: 404 })

  const filename = vaultDownloadFileName(track.title, track.ext)
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': contentTypeForDownload(track.relativePath),
      'Content-Length': String(bytes.length),
      'Content-Disposition': attachmentName(filename),
      'Cache-Control': 'private, no-store',
    },
  })
}
