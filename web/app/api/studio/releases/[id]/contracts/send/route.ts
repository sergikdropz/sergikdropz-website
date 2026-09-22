import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { sendEmail } from '@/lib/email'
import { getSingleReleaseCopyrightReadiness } from '@/lib/studio/copyright-pipeline'
import { buildRightsPackets, rightsPacketPendingPatch, applyRightsPacketDrafts, type RightsPacketKind } from '@/lib/studio/rights-packets'
import {
  contractEmailHtml,
  contractEmailSubject,
  contractSignatories,
  mergePartyContacts,
  parsePartyContacts,
  signatoriesReadyToSend,
} from '@/lib/studio/rights-contract-send'
import {
  RELEASE_COLLAB_FROM_EMAIL,
  RELEASE_COLLAB_FROM_NAME,
  RELEASE_COLLAB_REPLY_TO,
} from '@/lib/studio/release-collab'
import { logActivity } from '@/lib/activity-log'
import { checkRateLimitAsync } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const KINDS = new Set<RightsPacketKind>([
  'split_sheet',
  'producer_agreement',
  'collab_agreement',
])

/**
 * POST /api/studio/releases/[id]/contracts/send
 * Email a Rights contract packet to collaborator signatories (admin-only).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rl = await checkRateLimitAsync(`contract-send:${session.user.id}`, 20, 60_000)
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Contract send rate limit exceeded. Try again shortly.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
      )
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { error: 'RESEND_API_KEY is not configured — cannot send contract emails.' },
        { status: 503 },
      )
    }

    const body = await request.json().catch(() => ({}))
    const kind = String(body.kind || '') as RightsPacketKind
    if (!KINDS.has(kind)) {
      return NextResponse.json(
        { error: 'kind must be split_sheet, producer_agreement, or collab_agreement' },
        { status: 400 },
      )
    }

    const partyContactsPatch = parsePartyContacts(body.party_contacts)
    const supabase = createSupabaseServerClient()

    const { data: release, error: releaseError } = await supabase
      .from('distribution_releases')
      .select('id, title, album_artist, label_name')
      .eq('id', params.id)
      .maybeSingle()
    if (releaseError || !release) {
      return NextResponse.json({ error: 'Release not found' }, { status: 404 })
    }

    const { data: trackRows } = await supabase
      .from('distribution_tracks')
      .select(
        'id, title, contributors, splits, isrc_full, iswc, writer_legal_names, origin, publisher_name',
      )
      .eq('release_id', params.id)
      .order('track_number', { ascending: true })

    const tracks = (trackRows || []) as Array<{
      id?: string
      title?: string
      contributors?: unknown
      splits?: unknown
      isrc_full?: string | null
      iswc?: string | null
      writer_legal_names?: string | null
      origin?: string | null
      publisher_name?: string | null
    }>

    const readiness = await getSingleReleaseCopyrightReadiness(supabase, params.id)
    const partyContacts = mergePartyContacts(readiness?.party_contacts, partyContactsPatch)
    const publisherName =
      readiness?.rights?.publisher_name || release.label_name || 'SERGIK Music'
    const albumArtist = release.album_artist || release.label_name || 'SERGIK'

    const packets = applyRightsPacketDrafts(
      buildRightsPackets({
        releaseTitle: release.title || 'Untitled',
        albumArtist,
        publisherName,
        tracks,
      }),
      readiness?.rights_packets,
    )
    const packet = packets.find((row) => row.kind === kind)
    if (!packet || !packet.needed || !packet.text) {
      return NextResponse.json(
        { error: 'This contract is not required for the current Catalog credits.' },
        { status: 400 },
      )
    }
    if (!packet.ready) {
      return NextResponse.json(
        { error: packet.missing[0] || 'Contract is not ready to send' },
        { status: 400 },
      )
    }

    const signatories = contractSignatories(packet, tracks, partyContacts)
    const { ok, recipients, missing } = signatoriesReadyToSend(signatories)
    if (!ok) {
      return NextResponse.json(
        {
          error: missing.length
            ? `Add collaborator email for: ${missing.join(', ')}`
            : 'No collaborator recipients — SERGIK-only paperwork can be approved in Studio.',
          missing,
        },
        { status: 400 },
      )
    }

    if (partyContactsPatch.length) {
      await supabase.from('release_copyright_checklists').upsert(
        {
          release_id: params.id,
          party_contacts: partyContacts,
        },
        { onConflict: 'release_id' },
      )
    }

    const sent: Array<{ stage: string; email: string; messageId?: string }> = []
    for (const recipient of recipients) {
      const result = await sendEmail({
        to: recipient.email,
        subject: contractEmailSubject(kind, release.title || 'SERGIK release'),
        html: contractEmailHtml({
          kind,
          releaseTitle: release.title || 'Untitled',
          albumArtist,
          partyName: recipient.stage,
          packetText: packet.text,
          packetLabel: packet.label,
        }),
        from: `${RELEASE_COLLAB_FROM_NAME} <${RELEASE_COLLAB_FROM_EMAIL}>`,
        replyTo: RELEASE_COLLAB_REPLY_TO,
        tags: [
          { name: 'type', value: 'rights_contract' },
          { name: 'kind', value: kind },
        ],
      })
      sent.push({ stage: recipient.stage, email: recipient.email, messageId: result.messageId })
    }

    const pending = rightsPacketPendingPatch(packet)
    if (pending) {
      await supabase.from('release_copyright_checklists').upsert(
        {
          release_id: params.id,
          ...pending,
          party_contacts: partyContacts,
        },
        { onConflict: 'release_id' },
      )
    }

    await logActivity({
      actionType: 'rights_contract_sent',
      resourceType: 'distribution_release',
      resourceId: params.id,
      details: { kind, recipients: sent.map((row) => row.email), count: sent.length },
    }).catch(() => null)

    const next = await getSingleReleaseCopyrightReadiness(supabase, params.id)
    return NextResponse.json({
      ok: true,
      kind,
      sent,
      count: sent.length,
      readiness: next,
    })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send contract emails' },
      { status: 500 },
    )
  }
}
