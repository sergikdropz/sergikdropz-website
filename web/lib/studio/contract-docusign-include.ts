import { createSupabaseServerClient } from '@/lib/supabase'
import { parseRecipientList } from '@/lib/email/departments'
import { getSingleReleaseCopyrightReadiness } from '@/lib/studio/copyright-pipeline'
import {
  createContractEnvelope,
  DocuSignError,
  persistEnvelopeUpdate,
  readDocuSignConfig,
  type ChecklistWriter,
} from '@/lib/studio/docusign'
import {
  docuSignRecipients,
  envelopeIsOpen,
  latestEnvelope,
  parseDocuSignEnvelopes,
  statusPatchForEnvelope,
  type DocuSignEnvelopeRecord,
} from '@/lib/studio/docusign-records'
import { contractKindLabel } from '@/lib/studio/contract-pdf'
import { applyRightsPacketDrafts, buildRightsPackets, type RightsPacketKind } from '@/lib/studio/rights-packets'
import {
  contractSignatories,
  isValidPartyEmail,
  type ContractSignatory,
} from '@/lib/studio/rights-contract-send'

export type DocuSignInclude =
  | {
      blocked: true
      error: string
      status: number
      consentUrl: string | null
      included: false
      envelopeId: null
      reason: null
      envelopes: null
    }
  | {
      blocked: false
      included: boolean
      envelopeId: string | null
      reason: string | null
      envelopes: DocuSignEnvelopeRecord[] | null
    }

/** Attach DocuSign to a signing email when the account is connected. Does not send the studio email. */
export async function includeDocuSign(input: {
  supabase: ReturnType<typeof createSupabaseServerClient>
  releaseId: string
  kind: RightsPacketKind
  packetText: string
  packetLabel: string
  releaseTitle: string
  subject: string
  pdf: Buffer
  pdfFilename: string
  signatories: ContractSignatory[]
  existingEnvelopes: unknown
  statusPatch: Record<string, unknown>
}): Promise<DocuSignInclude> {
  const config = readDocuSignConfig()
  if (!config) {
    return {
      blocked: false,
      included: false,
      envelopeId: null,
      reason: 'DocuSign is not configured, so this email includes the PDF only.',
      envelopes: null,
    }
  }

  const open = latestEnvelope(parseDocuSignEnvelopes(input.existingEnvelopes), input.kind)
  if (open && envelopeIsOpen(open.status)) {
    return {
      blocked: false,
      included: true,
      envelopeId: open.envelopeId,
      reason: null,
      envelopes: null,
    }
  }

  try {
    const recipients = docuSignRecipients({
      signatories: input.signatories,
      packetText: input.packetText,
      sergikEmail: config.sergikEmail,
      sergikName: config.sergikName,
    })
    const created = await createContractEnvelope({
      config,
      pdf: input.pdf,
      filename: input.pdfFilename,
      subject: input.subject,
      blurb: `${input.packetLabel} for ${input.releaseTitle}. Download the PDF on the SERGIK email, and sign that same PDF in DocuSign.`,
      releaseId: input.releaseId,
      kind: input.kind,
      recipients,
    })
    const now = new Date().toISOString()
    const record: DocuSignEnvelopeRecord = {
      envelopeId: created.envelopeId,
      kind: input.kind,
      status: created.status || 'sent',
      recipients: recipients.map((row) => ({ stage: row.stage, email: row.email })),
      sentAt: now,
      updatedAt: now,
    }
    const envelopes = await persistEnvelopeUpdate(input.supabase as unknown as ChecklistWriter, {
      releaseId: input.releaseId,
      record,
      statusPatch: {
        ...(statusPatchForEnvelope(input.kind, record.status) || {}),
        ...input.statusPatch,
      },
    })
    return {
      blocked: false,
      included: true,
      envelopeId: created.envelopeId,
      reason: null,
      envelopes,
    }
  } catch (error) {
    if (error instanceof DocuSignError) {
      return {
        blocked: true,
        error: error.message,
        status: error.status,
        consentUrl: error.consentUrl || null,
        included: false,
        envelopeId: null,
        reason: null,
        envelopes: null,
      }
    }
    throw error
  }
}

/** Start DocuSign for a contract the operator reviewed in Department Mail. */
export async function includeDocuSignForDeskDraft(input: {
  releaseId: string
  kind: RightsPacketKind
  subject: string
  to: string
  pdfBase64: string
  pdfFilename: string
}): Promise<DocuSignInclude> {
  const supabase = createSupabaseServerClient()
  const { data: release, error } = await supabase
    .from('distribution_releases')
    .select('id, title, album_artist, label_name')
    .eq('id', input.releaseId)
    .maybeSingle()
  if (error || !release) {
    return {
      blocked: false,
      included: false,
      envelopeId: null,
      reason: 'DocuSign was not included. The release for this draft could not be loaded.',
      envelopes: null,
    }
  }

  const { data: trackRows } = await supabase
    .from('distribution_tracks')
    .select('*')
    .eq('release_id', input.releaseId)
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
  }>
  const readiness = await getSingleReleaseCopyrightReadiness(supabase, input.releaseId)
  const publisherName = readiness?.rights?.publisher_name || release.label_name || 'SERGIK Music'
  const packets = applyRightsPacketDrafts(
    buildRightsPackets({
      releaseTitle: release.title || 'Untitled',
      albumArtist: release.album_artist || release.label_name || 'SERGIK',
      publisherName,
      tracks,
    }),
    readiness?.rights_packets,
  )
  const packet = packets.find((row) => row.kind === input.kind)
  if (!packet?.text) {
    return {
      blocked: false,
      included: false,
      envelopeId: null,
      reason: 'DocuSign was not included. This contract is no longer on the release.',
      envelopes: null,
    }
  }

  const listed = new Set(parseRecipientList(input.to) || [])
  const known = contractSignatories(packet, tracks, readiness?.party_contacts)
  const signatories: ContractSignatory[] = []
  for (const email of listed) {
    const match = known.find((row) => row.email === email)
    if (match) {
      signatories.push({ ...match, skip: false })
      continue
    }
    if (isValidPartyEmail(email)) signatories.push({ stage: email, email, skip: false })
  }
  for (const row of known) {
    if (row.skip) signatories.push(row)
  }

  const pdf = Buffer.from(input.pdfBase64, 'base64')
  return includeDocuSign({
    supabase,
    releaseId: input.releaseId,
    kind: input.kind,
    packetText: packet.text,
    packetLabel: contractKindLabel(input.kind),
    releaseTitle: release.title || 'SERGIK release',
    subject: input.subject,
    pdf,
    pdfFilename: input.pdfFilename,
    signatories,
    existingEnvelopes: readiness?.docusign_envelopes,
    statusPatch: {},
  })
}
