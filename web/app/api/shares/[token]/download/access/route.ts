import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/route-policy'
import { resolveShareByToken } from '@/lib/shares/share-service'
import {
  normalizeDownloadEmails,
  parseDownloadSelection,
  shareDownloadUrl,
} from '@/lib/shares/share-download'
import {
  activeShareForDownload,
  findDownloadGrant,
  isMissingDownloadGrantTable,
  issueDownloadCode,
  listDownloadGrants,
  missingDownloadGrantError,
  saveDownloadGrant,
  sendDownloadInvite,
} from '@/lib/shares/share-download-server'
import { resolvePublicOrigin } from '@/lib/shares/types'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ token: string }> }

async function readToken(context: Ctx): Promise<string> {
  const { token: raw } = await context.params
  return decodeURIComponent(raw || '').trim()
}

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

export async function GET(_request: NextRequest, context: Ctx) {
  try {
    const admin = await requireAdminApi()
    if (!admin.ok) return admin.response
    const token = await readToken(context)
    const share = await activeShareForDownload(token)
    if (!share) return NextResponse.json({ error: 'Share not found' }, { status: 404 })
    const grants = await listDownloadGrants(share.id)
    return NextResponse.json({
      grants: grants.map((grant) => ({
        format: grant.format,
        scope: grant.scope,
        trackId: grant.trackId,
        emails: grant.emails,
      })),
    })
  } catch (error) {
    return grantError(error) || NextResponse.json({ error: 'Failed to load download access' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, context: Ctx) {
  try {
    const admin = await requireAdminApi()
    if (!admin.ok) return admin.response
    const token = await readToken(context)
    const share = await activeShareForDownload(token)
    if (!share) return NextResponse.json({ error: 'Share not found' }, { status: 404 })

    const body = await request.json().catch(() => ({}))
    const payload = await resolveShareByToken(token, { includePlaybackUrls: false })
    if (!payload) return NextResponse.json({ error: 'Share not found' }, { status: 404 })
    const parsed = parseDownloadSelection(body, payload.tracks.map((track) => track.id))
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

    const { emails, rejected } = normalizeDownloadEmails(body.emails)
    if (rejected.length) {
      return NextResponse.json({ error: `Not an email: ${rejected[0]}` }, { status: 400 })
    }

    const grant = await saveDownloadGrant({
      shareId: share.id,
      selection: parsed.selection,
      emails,
    })

    const notify = normalizeDownloadEmails(body.notifyEmails).emails.filter((email) => emails.includes(email))
    const origin = resolvePublicOrigin(request.headers)
    if (notify.length && !process.env.RESEND_API_KEY?.trim()) {
      return NextResponse.json({
        grant: {
          format: grant.format,
          scope: grant.scope,
          trackId: grant.trackId,
          emails: grant.emails,
        },
        link: shareDownloadUrl(origin, token, parsed.selection),
        notified: [],
        notifyErrors: [
          'Email is not configured. Access is saved. Add RESEND_API_KEY to web/.env.local, restart the dev server, then press Send again.',
        ],
      })
    }
    const track = payload.tracks.find((row) => row.id === parsed.selection.trackId)
    const title =
      parsed.selection.scope === 'track'
        ? track?.title || payload.share.title
        : payload.share.title
    const detail =
      parsed.selection.scope === 'track'
        ? `${track?.title || 'Track'} · ${parsed.selection.format.toUpperCase()}`
        : `Whole release · ${parsed.selection.format.toUpperCase()}`

    const notified: string[] = []
    const notifyErrors: string[] = []
    for (const email of notify) {
      try {
        const code = await issueDownloadCode(grant.id, email)
        const openUrl = `${origin}/api/shares/${encodeURIComponent(token)}/download/open?code=${encodeURIComponent(code)}`
        await sendDownloadInvite({ to: email, openUrl, title, detail })
        notified.push(email)
      } catch (error) {
        notifyErrors.push(error instanceof Error ? error.message : `Could not email ${email}`)
      }
    }

    return NextResponse.json({
      grant: {
        format: grant.format,
        scope: grant.scope,
        trackId: grant.trackId,
        emails: grant.emails,
      },
      link: shareDownloadUrl(origin, token, parsed.selection),
      notified,
      notifyErrors,
    })
  } catch (error) {
    console.error('PUT download access:', error)
    return grantError(error) || NextResponse.json({ error: 'Failed to save download access' }, { status: 500 })
  }
}
