import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { toSameOriginMediaUrl } from '@/utils/normalizeVaultAudioUrl'
import { pickShareArtwork, resolvePublicOrigin, shareDisplayArtworkUrl } from '@/lib/shares/types'
import {
  applyShareDownloadCookie,
  readShareDownloadCookie,
  SHARE_DOWNLOAD_COOKIE,
} from '@/lib/shares/share-download-cookie'
import {
  normalizeDownloadEmails,
  parseDownloadSelection,
  type ShareDownloadSelection,
} from '@/lib/shares/share-download'
import {
  activeShareForDownload,
  findDownloadGrant,
  isMissingDownloadGrantTable,
  missingDownloadGrantError,
  resolveDownloadAssets,
} from '@/lib/shares/share-download-server'
import { resolveShareByToken } from '@/lib/shares/share-service'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ token: string }> }

function grantError(error: unknown) {
  const err = error as { code?: string; message?: string }
  if (err?.code === 'DOWNLOAD_GRANT_TABLE_MISSING' || isMissingDownloadGrantTable(err)) {
    return NextResponse.json(
      { error: missingDownloadGrantError().message, code: 'DOWNLOAD_GRANT_TABLE_MISSING' },
      { status: 503 },
    )
  }
  return null
}

function field(source: URLSearchParams | Record<string, unknown>, key: string, alt?: string) {
  if (source instanceof URLSearchParams) return source.get(key) || (alt ? source.get(alt) : null)
  const value = source[key]
  if (value != null && value !== '') return value
  return alt ? source[alt] : undefined
}

async function loadContext(request: NextRequest, context: Ctx, source: URLSearchParams | Record<string, unknown>) {
  const { token: raw } = await context.params
  const token = decodeURIComponent(raw || '').trim()
  const share = token ? await activeShareForDownload(token) : null
  const payload = share
    ? await resolveShareByToken(token, {
        includePlaybackUrls: false,
        origin: resolvePublicOrigin(request.headers),
      })
    : null
  const parsed = parseDownloadSelection(
    {
      format: field(source, 'format'),
      scope: field(source, 'scope'),
      trackId: field(source, 'track', 'trackId'),
    },
    payload?.tracks.map((track) => track.id),
  )
  return { token, share, payload, parsed }
}

type SharePayload = NonNullable<Awaited<ReturnType<typeof resolveShareByToken>>>

function downloadCard(
  token: string,
  payload: SharePayload,
  selection: ShareDownloadSelection,
  tracks: SharePayload['tracks'],
  email: string | null,
  assets?: Awaited<ReturnType<typeof resolveDownloadAssets>>,
) {
  const artworkRaw = pickShareArtwork(
    payload,
    Math.max(0, payload.tracks.findIndex((track) => track.id === tracks[0]?.id)),
  )
  const fileQuery = (trackId: string) => {
    const params = new URLSearchParams({
      format: selection.format,
      scope: selection.scope,
      track: trackId,
    })
    return `/api/shares/${encodeURIComponent(token)}/file?${params}`
  }
  const available = (assets || []).filter((asset) => asset.relativePath)
  return {
    access: assets ? 'granted' : 'restricted',
    title: selection.scope === 'track' ? tracks[0]?.title || payload.share.title : payload.share.title,
    artist: tracks[0]?.artist || payload.collection?.artist || 'SERGIK',
    artwork: shareDisplayArtworkUrl(artworkRaw) || artworkRaw || null,
    format: selection.format,
    scope: selection.scope,
    email,
    ...(assets
      ? {
          files: assets.map((asset) => {
            const stream = tracks.find((track) => track.id === asset.trackId)
            const playback =
              (stream?.file ? toSameOriginMediaUrl(stream.file) : null) ||
              (asset.relativePath ? toSameOriginMediaUrl(asset.relativePath) : null) ||
              ''
            return {
              id: asset.trackId,
              title: asset.title,
              artist: asset.artist,
              filename: asset.filename,
              available: Boolean(asset.relativePath),
              href: asset.relativePath ? fileQuery(asset.trackId) : null,
              playback,
            }
          }),
          packHref:
            selection.scope === 'release' && available.length > 1
              ? `/api/shares/${encodeURIComponent(token)}/pack?format=${selection.format}&scope=release`
              : null,
        }
      : {}),
  }
}

export async function GET(request: NextRequest, context: Ctx) {
  try {
    const loaded = await loadContext(request, context, request.nextUrl.searchParams)
    if (!loaded.share || !loaded.payload) {
      return NextResponse.json({ error: 'Share not found' }, { status: 404 })
    }
    if (!loaded.parsed.ok) return NextResponse.json({ error: loaded.parsed.error }, { status: 400 })

    const selection = loaded.parsed.selection
    const tracks =
      selection.scope === 'track'
        ? loaded.payload.tracks.filter((track) => track.id === selection.trackId)
        : loaded.payload.tracks
    const grant = await findDownloadGrant(loaded.share.id, selection)
    const session = await getServerSession()
    const cookie = readShareDownloadCookie(request.cookies.get(SHARE_DOWNLOAD_COOKIE)?.value)
    const invited =
      !!grant &&
      !!cookie &&
      cookie.grantId === grant.id &&
      grant.emails.includes(cookie.email)
    const allowed = !!session?.isAdmin || invited

    if (!allowed) {
      return NextResponse.json(
        downloadCard(loaded.token, loaded.payload, selection, tracks, null),
        { headers: { 'Cache-Control': 'private, no-store' } },
      )
    }

    const assets = await resolveDownloadAssets(tracks, selection.format)
    return NextResponse.json(
      downloadCard(loaded.token, loaded.payload, selection, tracks, invited ? cookie?.email || null : null, assets),
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch (error) {
    console.error('GET share download:', error)
    return grantError(error) || NextResponse.json({ error: 'Failed to load download' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, context: Ctx) {
  try {
    const body = await request.json().catch(() => ({}))
    const loaded = await loadContext(request, context, body)
    if (!loaded.parsed.ok) {
      return NextResponse.json({ error: loaded.parsed.error }, { status: 400 })
    }
    if (!loaded.share || !loaded.payload) {
      return NextResponse.json({ error: 'Share not found' }, { status: 404 })
    }
    const selection = loaded.parsed.selection
    const { emails, rejected } = normalizeDownloadEmails(body.email)
    if (rejected.length || emails.length !== 1) {
      return NextResponse.json({ error: 'Enter the email this was shared with' }, { status: 400 })
    }
    const email = emails[0]!
    const grant = await findDownloadGrant(loaded.share.id, selection)
    if (!grant || !grant.emails.includes(email)) {
      return NextResponse.json(
        { error: "This email doesn't have access. Ask SERGIK to add it." },
        { status: 403 },
      )
    }
    const tracks =
      selection.scope === 'track'
        ? loaded.payload.tracks.filter((track) => track.id === selection.trackId)
        : loaded.payload.tracks
    const assets = await resolveDownloadAssets(tracks, selection.format)
    const response = NextResponse.json(
      downloadCard(loaded.token, loaded.payload, selection, tracks, email, assets),
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
    applyShareDownloadCookie(response, request, email, grant.id)
    return response
  } catch (error) {
    console.error('POST share download:', error)
    return grantError(error) || NextResponse.json({ error: 'Could not open the download' }, { status: 500 })
  }
}
