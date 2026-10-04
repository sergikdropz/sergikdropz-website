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
  collabOutboundReplyTo,
} from '@/lib/studio/release-collab'
import { recordCollabEmailSend, postCollabSystemMessage } from '@/lib/studio/collab-email-log'
import { contractKindToEmailKind } from '@/lib/studio/collab-review-writeback'
import { logActivity } from '@/lib/activity-log'
import { counselAuditRecord, counselGateForPacket } from '@/lib/studio/music-law/release-gate'
import { parseTrackClearance } from '@/lib/studio/rights-ops'
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
        'id, title, contributors, splits, isrc_full, iswc, writer_legal_names, origin, publisher_name, mechanical_licensed, contains_samples, sonic_snapshot',
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
      mechanical_licensed?: boolean | null
      contains_samples?: boolean | null
      sonic_snapshot?: { clearance?: unknown } | null
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

    const counselTracks = tracks.map((track) => ({
      ...track,
      clearance: parseTrackClearance(track.sonic_snapshot?.clearance),
    }))
    const gate = counselGateForPacket({ text: packet.text, kind, tracks: counselTracks })
    const audit = counselAuditRecord(gate.report)
    await supabase
      .from('release_copyright_checklists')
      .upsert({ release_id: params.id, counsel_audit: audit }, { onConflict: 'release_id' })
      .then(({ error }) => {
        if (error && !/counsel_audit/i.test(error.message || '')) {
          console.error('counsel audit save failed', error.message)
        }
      })
    if (gate.blockers.length) {
      return NextResponse.json(
        {
          error: `Music Business Counsel blocked send: ${gate.blockers[0]?.title || 'open blockers'}.`,
          blockers: gate.blockers.map((finding) => ({
            id: finding.id,
            title: finding.title,
            address: finding.address,
          })),
          memo: gate.report.memo,
        },
        { status: 409 },
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

    const emailKind = contractKindToEmailKind(kind)
    const contractSubject = contractEmailSubject(kind, release.title || 'SERGIK release')
    const sent: Array<{ stage: string; email: string; messageId?: string }> = []
    for (const recipient of recipients) {
      const result = await sendEmail({
        to: recipient.email,
        subject: contractSubject,
        html: contractEmailHtml({
          kind,
          releaseTitle: release.title || 'Untitled',
          albumArtist,
          partyName: recipient.stage,
          packetText: packet.text,
          packetLabel: packet.label,
        }),
        from: `${RELEASE_COLLAB_FROM_NAME} <${RELEASE_COLLAB_FROM_EMAIL}>`,
        replyTo: collabOutboundReplyTo(params.id),
        tags: [
          { name: 'type', value: 'rights_contract' },
          { name: 'kind', value: kind },
          { name: 'release_id', value: params.id.slice(0, 200) },
        ],
      })
      sent.push({ stage: recipient.stage, email: recipient.email, messageId: result.messageId })
      await recordCollabEmailSend({
        releaseId: params.id,
        resendId: result.messageId || null,
        toEmail: recipient.email,
        subject: contractSubject,
        kind: emailKind,
        status: 'sent',
      })
    }

    await postCollabSystemMessage({
      releaseId: params.id,
      body: `${packet.label} emailed to ${sent.map((row) => `${row.stage} <${row.email}>`).join(', ')}.`,
      emailSubject: contractSubject,
    })

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
