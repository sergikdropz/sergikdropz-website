import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { readShareDownloadCookie, SHARE_DOWNLOAD_COOKIE } from '@/lib/shares/share-download-cookie'
import { isShareDownloadFormat, parseDownloadSelection } from '@/lib/shares/share-download'
import {
  contentTypeForDownload,
} from '@/lib/shares/share-download-bytes'
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
export const maxDuration = 180

type Ctx = { params: Promise<{ token: string }> }

export async function GET(request: NextRequest, context: Ctx) {
  try {
    const { token: raw } = await context.params
    const token = decodeURIComponent(raw || '').trim()
    const share = await activeShareForDownload(token)
    const payload = share ? await resolveShareByToken(token, { includePlaybackUrls: false }) : null
    if (!share || !payload) return NextResponse.json({ error: 'Share not found' }, { status: 404 })

    const format = request.nextUrl.searchParams.get('format')
    const scope = request.nextUrl.searchParams.get('scope')
    const fileId = request.nextUrl.searchParams.get('track') || ''
    const known = payload.tracks.map((track) => track.id)
    const grantParsed = parseDownloadSelection(
      {
        format,
        scope,
        trackId: scope === 'track' ? fileId : '',
      },
      known,
    )
    if (!grantParsed.ok) return NextResponse.json({ error: grantParsed.error }, { status: 400 })
    if (!isShareDownloadFormat(format)) {
      return NextResponse.json({ error: 'format must be mp3 or wav' }, { status: 400 })
    }
    const track = payload.tracks.find((row) => row.id === fileId)
    if (!track) return NextResponse.json({ error: 'Track not found' }, { status: 404 })

    const session = await getServerSession()
    if (!session?.isAdmin) {
      const grant = await findDownloadGrant(share.id, grantParsed.selection)
      const cookie = readShareDownloadCookie(request.cookies.get(SHARE_DOWNLOAD_COOKIE)?.value)
      const allowed =
        !!grant && !!cookie && cookie.grantId === grant.id && grant.emails.includes(cookie.email)
      if (!allowed) return NextResponse.json({ error: 'This download is restricted' }, { status: 403 })
    }

    const [asset] = await resolveDownloadAssets([track], format)
    if (!asset?.relativePath) {
      return NextResponse.json(
        { error: `${format.toUpperCase()} file is not in the vault` },
        { status: 404 },
      )
    }

    const origin = resolvePublicOrigin(request.headers)
    const artRaw = shareDisplayArtworkUrl(pickShareArtwork(payload, payload.tracks.findIndex((row) => row.id === track.id)))
    const artUrl = artRaw
      ? artRaw.startsWith('/')
        ? `${origin}${artRaw}`
        : artRaw
      : payload.collection?.artwork || null
    const tags = await loadShareDownloadTags([track], {
      title: payload.collection?.title || payload.share.title,
      artist: payload.collection?.artist || track.artist,
      year: payload.collection?.year,
      artworkUrl: artUrl,
    })
    const tagged = await taggedShareAudio({
      relativePath: asset.relativePath,
      format,
      tags: tags.get(track.id) || {
        title: track.title,
        artist: track.artist,
        album: payload.share.title,
        albumArtist: track.artist,
        composer: track.artist,
        genre: '',
        grouping: '',
        year: '',
        track: '',
        disc: '1/1',
        bpm: '',
        key: '',
        comment: '',
        description: track.title,
      },
      artworkJpeg: await fetchArtworkJpeg(artUrl),
    })
    if (!tagged) return NextResponse.json({ error: 'File unavailable' }, { status: 404 })
    return new NextResponse(new Uint8Array(tagged), {
      headers: {
        'Content-Type': contentTypeForDownload(asset.relativePath),
        'Content-Length': String(tagged.length),
        'Content-Disposition': `attachment; filename="${asset.filename.replace(/"/g, '')}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    console.error('GET share file:', error)
    return NextResponse.json({ error: 'Download failed' }, { status: 500 })
  }
}
