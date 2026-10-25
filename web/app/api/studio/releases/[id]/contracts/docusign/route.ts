import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { recordSentDepartmentMail } from '@/lib/email/department-mailbox-store'
import { logActivity } from '@/lib/activity-log'
import { checkRateLimitAsync } from '@/lib/rate-limit'
import {
  buildContractPdf,
  contractPdfFilename,
  contractPdfHref,
  contractStudioUrl,
} from '@/lib/studio/contract-pdf'
import { getSingleReleaseCopyrightReadiness } from '@/lib/studio/copyright-pipeline'
import {
  createContractEnvelope,
  DocuSignError,
  fetchContractEnvelope,
  persistEnvelopeUpdate,
  readDocuSignConfig,
} from '@/lib/studio/docusign'
import {
  docuSignRecipients,
  envelopeIsOpen,
  isRightsPacketKind,
  latestEnvelope,
  parseDocuSignEnvelopes,
  statusPatchForEnvelope,
  type DocuSignEnvelopeRecord,
} from '@/lib/studio/docusign-records'
import { postCollabSystemMessage } from '@/lib/studio/collab-email-log'
import { counselAuditRecord, counselGateForPacket } from '@/lib/studio/music-law/release-gate'
import { parseTrackClearance } from '@/lib/studio/rights-ops'
import { setRightsPacketDraft } from '@/lib/studio/rights-packet-drafts'
import {
  applyRightsPacketDrafts,
  buildRightsPackets,
  type RightsPacketKind,
} from '@/lib/studio/rights-packets'
import {
  contractEmailSubject,
  contractSignatories,
  mergePartyContacts,
  parsePartyContacts,
  signatoriesReadyToSend,
} from '@/lib/studio/rights-contract-send'

export const dynamic = 'force-dynamic'

const SETUP_ERROR =
  'DocuSign is not configured. Add DOCUSIGN_INTEGRATION_KEY, DOCUSIGN_USER_ID, DOCUSIGN_ACCOUNT_ID, and DOCUSIGN_RSA_PRIVATE_KEY.'

const RELEASE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,120}$/

function jsonError(error: unknown) {
  if (error instanceof DocuSignError) {
    return NextResponse.json(
      { error: error.message, consentUrl: error.consentUrl || null },
      { status: error.status },
    )
  }
  return NextResponse.json(
    { error: error instanceof Error ? error.message : 'DocuSign request failed' },
    { status: 500 },
  )
}

async function loadPacket(
  releaseId: string,
  kind: RightsPacketKind,
  partyContactsPatch: ReturnType<typeof parsePartyContacts>,
  textOverride: string,
) {
  const supabase = createSupabaseServerClient()
  const { data: release, error: releaseError } = await supabase
    .from('distribution_releases')
    .select('id, title, album_artist, label_name')
    .eq('id', releaseId)
    .maybeSingle()
  if (releaseError || !release) return { error: 'Release not found', status: 404 as const }

  const { data: trackRows } = await supabase
    .from('distribution_tracks')
    .select('*')
    .eq('release_id', releaseId)
    .order('created_at', { ascending: true })

  const tracks = (trackRows || []) as Array<{
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
  const readiness = await getSingleReleaseCopyrightReadiness(supabase, releaseId)
  const partyContacts = mergePartyContacts(readiness?.party_contacts, partyContactsPatch)
  const publisherName = readiness?.rights?.publisher_name || release.label_name || 'SERGIK Music'
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
  let packet = packets.find((row) => row.kind === kind) || null
  if (packet && textOverride) packet = { ...packet, text: textOverride }
  return { supabase, release, tracks, readiness, partyContacts, albumArtist, packet }
}

/**
 * GET /api/studio/releases/[id]/contracts/docusign?kind=
 * Refresh the latest envelope for this contract from DocuSign.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!RELEASE_ID_RE.test(params.id)) {
      return NextResponse.json({ error: 'Invalid release id' }, { status: 400 })
    }
    const kindParam = String(new URL(request.url).searchParams.get('kind') || 'split_sheet')
    if (!isRightsPacketKind(kindParam)) {
      return NextResponse.json({ error: 'Unknown contract kind' }, { status: 400 })
    }

    const supabase = createSupabaseServerClient()
    const readiness = await getSingleReleaseCopyrightReadiness(supabase, params.id)
    let envelopes = parseDocuSignEnvelopes(readiness?.docusign_envelopes)
    const current = latestEnvelope(envelopes, kindParam)
    const config = readDocuSignConfig()
    if (!config) {
      return NextResponse.json({ configured: false, envelopes, envelope: current, hint: SETUP_ERROR })
    }
    if (!current || !envelopeIsOpen(current.status)) {
      return NextResponse.json({ configured: true, envelopes, envelope: current })
    }

    const remote = await fetchContractEnvelope(config, current.envelopeId)
    const record: DocuSignEnvelopeRecord = {
      ...current,
      status: remote.status || current.status,
      updatedAt: new Date().toISOString(),
    }
    const statusPatch = remote.status === 'completed' ? statusPatchForEnvelope(kindParam, 'completed') : null
    envelopes = await persistEnvelopeUpdate(supabase, {
      releaseId: params.id,
      record,
      statusPatch,
    })
    return NextResponse.json({
      configured: true,
      envelopes,
      envelope: latestEnvelope(envelopes, kindParam),
      readiness: await getSingleReleaseCopyrightReadiness(supabase, params.id),
    })
  } catch (error) {
    return jsonError(error)
  }
}

/**
 * POST /api/studio/releases/[id]/contracts/docusign
 * Send the current contract PDF to DocuSign for remote signature.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const rl = await checkRateLimitAsync(`docusign-send:${session.user.id}`, 10, 60_000)
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'DocuSign send rate limit exceeded. Try again shortly.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
      )
    }

    const config = readDocuSignConfig()
    if (!config) return NextResponse.json({ error: SETUP_ERROR }, { status: 503 })
    if (!RELEASE_ID_RE.test(params.id)) {
      return NextResponse.json({ error: 'Invalid release id' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const kind = String(body.kind || '') as RightsPacketKind
    if (!isRightsPacketKind(kind)) {
      return NextResponse.json(
        { error: 'kind must be split_sheet, producer_agreement, or collab_agreement' },
        { status: 400 },
      )
    }
    const partyContactsPatch = parsePartyContacts(body.party_contacts)
    const textOverride = typeof body.text === 'string' ? body.text.trim().slice(0, 100000) : ''
    const loaded = await loadPacket(params.id, kind, partyContactsPatch, textOverride)
    if ('error' in loaded && loaded.error) {
      return NextResponse.json({ error: loaded.error }, { status: loaded.status })
    }
    const { supabase, release, tracks, readiness, partyContacts, albumArtist, packet } = loaded
    if (!packet || !packet.text) {
      return NextResponse.json({ error: 'This contract has no text to send.' }, { status: 400 })
    }
    if (!packet.needed) {
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
        },
        { status: 409 },
      )
    }

    const signatories = contractSignatories(packet, tracks, partyContacts)
    const ready = signatoriesReadyToSend(signatories)
    if (!ready.ok) {
      return NextResponse.json(
        {
          error: ready.missing.length
            ? `Add collaborator email for: ${ready.missing.join(', ')}`
            : 'No collaborator recipients — SERGIK-only paperwork can be approved in Studio.',
          missing: ready.missing,
        },
        { status: 400 },
      )
    }

    const recipients = docuSignRecipients({
      signatories,
      packetText: packet.text,
      sergikEmail: config.sergikEmail,
      sergikName: config.sergikName,
    })
    const releaseTitle = release.title || 'SERGIK release'
    const subject = contractEmailSubject(kind, releaseTitle)
    const pdf = buildContractPdf({
      title: packet.label,
      releaseTitle,
      albumArtist,
      body: packet.text,
    })
    const filename = contractPdfFilename(packet.label, releaseTitle)
    const created = await createContractEnvelope({
      config,
      pdf,
      filename,
      subject,
      blurb: `${packet.label} for ${releaseTitle}. Sign in DocuSign. This is the SERGIK Studio contract PDF.`,
      releaseId: params.id,
      kind,
      recipients,
    })

    const now = new Date().toISOString()
    const record: DocuSignEnvelopeRecord = {
      envelopeId: created.envelopeId,
      kind,
      status: created.status || 'sent',
      recipients: recipients.map((row) => ({ stage: row.stage, email: row.email })),
      sentAt: now,
      updatedAt: now,
    }
    const rightsPackets = textOverride
      ? setRightsPacketDraft(readiness?.rights_packets, kind, packet.text)
      : null
    const envelopes = await persistEnvelopeUpdate(supabase, {
      releaseId: params.id,
      record,
      statusPatch: {
        ...(statusPatchForEnvelope(kind, 'sent') || {}),
        ...(partyContactsPatch.length ? { party_contacts: partyContacts } : {}),
        ...(rightsPackets ? { rights_packets: rightsPackets } : {}),
      },
    })

    const studioUrl = contractStudioUrl(params.id)
    const who = recipients.map((row) => `${row.stage} <${row.email}>`).join(', ')
    await recordSentDepartmentMail({
      accountId: 'studio',
      to: recipients.map((row) => row.email).join(', '),
      subject: `DocuSign · ${subject}`,
      body: [
        `${packet.label} was sent through DocuSign for ${releaseTitle}.`,
        `Envelope ${created.envelopeId}.`,
        `Signers: ${who}.`,
        studioUrl ? `Open in Studio: ${studioUrl}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      status: 'sent',
      attachments: [
        {
          filename,
          contentType: 'application/pdf',
          size: pdf.length,
          href: contractPdfHref(params.id, kind) || undefined,
        },
      ],
    }).catch((error) => {
      console.error('docusign mailbox copy:', error)
    })
    await postCollabSystemMessage({
      releaseId: params.id,
      body: `${packet.label} sent through DocuSign to ${who}.`,
      emailSubject: subject,
    }).catch(() => null)
    await logActivity({
      actionType: 'rights_contract_docusign',
      resourceType: 'distribution_release',
      resourceId: params.id,
      details: { kind, envelopeId: created.envelopeId, recipients: recipients.map((row) => row.email) },
    }).catch(() => null)

    return NextResponse.json({
      ok: true,
      configured: true,
      envelopeId: created.envelopeId,
      status: record.status,
      recipients: record.recipients,
      envelopes,
      envelope: latestEnvelope(envelopes, kind),
    })
  } catch (error) {
    return jsonError(error)
  }
}
