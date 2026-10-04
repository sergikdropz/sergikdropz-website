import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { readShareDownloadCookie, SHARE_DOWNLOAD_COOKIE } from '@/lib/shares/share-download-cookie'
import { downloadFileName, parseDownloadSelection } from '@/lib/shares/share-download'
import { zipDownloadStream } from '@/lib/shares/share-download-bytes'
import {
  fetchArtworkJpeg,
  loadShareDownloadTags,
  taggedShareAudio,
} from '@/lib/shares/share-download-embed'
import {
  activeShareForDownload,
  findDownloadGrant,
  resolveDownloadAssets,
} from '@/lib/shares/share-download-server'
import { resolveShareByToken } from '@/lib/shares/share-service'
import { pickShareArtwork, resolvePublicOrigin, shareDisplayArtworkUrl } from '@/lib/shares/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

type Ctx = { params: Promise<{ token: string }> }

export async function GET(request: NextRequest, context: Ctx) {
  try {
    const { token: raw } = await context.params
    const token = decodeURIComponent(raw || '').trim()
    const share = await activeShareForDownload(token)
    const payload = share ? await resolveShareByToken(token, { includePlaybackUrls: false }) : null
    if (!share || !payload) return NextResponse.json({ error: 'Share not found' }, { status: 404 })

    const parsed = parseDownloadSelection(
      {
        format: request.nextUrl.searchParams.get('format'),
        scope: 'release',
        trackId: '',
      },
      payload.tracks.map((track) => track.id),
    )
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

    const session = await getServerSession()
    if (!session?.isAdmin) {
      const grant = await findDownloadGrant(share.id, parsed.selection)
      const cookie = readShareDownloadCookie(request.cookies.get(SHARE_DOWNLOAD_COOKIE)?.value)
      const allowed =
        !!grant && !!cookie && cookie.grantId === grant.id && grant.emails.includes(cookie.email)
      if (!allowed) return NextResponse.json({ error: 'This download is restricted' }, { status: 403 })
    }

    const assets = await resolveDownloadAssets(payload.tracks, parsed.selection.format)
    const ready = assets.filter((asset) => asset.relativePath)
    if (!ready.length) {
      return NextResponse.json({ error: 'No files are available in that format' }, { status: 404 })
    }
    const origin = resolvePublicOrigin(request.headers)
    const artRaw = shareDisplayArtworkUrl(pickShareArtwork(payload, 0))
    const artUrl = artRaw ? (artRaw.startsWith('/') ? `${origin}${artRaw}` : artRaw) : null
    const tags = await loadShareDownloadTags(payload.tracks, {
      title: payload.collection?.title || payload.share.title,
      artist: payload.collection?.artist || payload.tracks[0]?.artist,
      year: payload.collection?.year,
    })
    const artworkJpeg = await fetchArtworkJpeg(artUrl)
    const files = []
    for (const asset of ready) {
      const bytes = await taggedShareAudio({
        relativePath: asset.relativePath as string,
        format: parsed.selection.format,
        tags: tags.get(asset.trackId)!,
        artworkJpeg,
      })
      if (!bytes) continue
      files.push({ filename: asset.filename, relativePath: asset.relativePath as string, bytes })
    }
    if (!files.length) {
      return NextResponse.json({ error: 'No files are available in that format' }, { status: 404 })
    }
    const filename = downloadFileName(
      payload.collection?.artist || payload.tracks[0]?.artist || 'SERGIK',
      payload.share.title,
      'zip',
    ).replace(/"/g, '')
    return new NextResponse(zipDownloadStream(files), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    console.error('GET share pack:', error)
    return NextResponse.json({ error: 'Could not build the download' }, { status: 500 })
  }
}
