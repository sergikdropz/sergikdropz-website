import type { RightsPacketKind } from '@/lib/studio/rights-packets'
import {
  isValidPartyEmail,
  stageFromPartyLabel,
  type ContractSignatory,
} from '@/lib/studio/rights-contract-send'

export type DocuSignEnvelopeStatus =
  | 'created'
  | 'sent'
  | 'delivered'
  | 'completed'
  | 'declined'
  | 'voided'
  | 'signed'

export type DocuSignRecipient = {
  stage: string
  email: string
  name: string
  anchor: string | null
}

export type DocuSignEnvelopeRecord = {
  envelopeId: string
  kind: RightsPacketKind
  status: string
  recipients: Array<{ stage: string; email: string }>
  sentAt: string
  updatedAt: string
}

const KINDS = new Set<RightsPacketKind>(['split_sheet', 'producer_agreement', 'collab_agreement'])

function clean(value: unknown): string {
  return value == null ? '' : String(value).trim()
}

function stageKey(value: string): string {
  return clean(value).toLowerCase()
}

export function isRightsPacketKind(value: string): value is RightsPacketKind {
  return KINDS.has(value as RightsPacketKind)
}

/** Party label that starts a signature line in the contract text. */
export function signatureAnchor(packetText: string, stage: string): string | null {
  const key = stageKey(stage)
  if (!key) return null
  for (const line of packetText.split('\n')) {
    const match = line.match(/^(.+?):\s+_{3,}/)
    if (!match) continue
    const label = clean(match[1])
    if (stageKey(stageFromPartyLabel(label)) === key) return label.slice(0, 80)
  }
  return null
}

/**
 * Remote signers for one envelope. Collaborators come from the contract card.
 * SERGIK is included only when DOCUSIGN_SERGIK_EMAIL is set, so the label can
 * sign in the same envelope instead of only clicking Mark approved.
 */
export function docuSignRecipients(input: {
  signatories: ContractSignatory[]
  packetText: string
  sergikEmail?: string | null
  sergikName?: string | null
}): DocuSignRecipient[] {
  const out: DocuSignRecipient[] = []
  const seen = new Set<string>()
  const push = (stage: string, email: string, name: string) => {
    const normalized = email.trim().toLowerCase()
    if (!isValidPartyEmail(normalized) || seen.has(normalized)) return
    seen.add(normalized)
    out.push({
      stage: stage.slice(0, 80),
      email: normalized,
      name: (name || stage).slice(0, 100),
      anchor: signatureAnchor(input.packetText, stage),
    })
  }

  for (const row of input.signatories) {
    if (row.skip || !row.email) continue
    push(row.stage, row.email, row.stage)
  }

  const sergikEmail = clean(input.sergikEmail).toLowerCase()
  if (sergikEmail) {
    const self = input.signatories.find((row) => row.skip)
    push(self?.stage || 'SERGIK', sergikEmail, clean(input.sergikName) || self?.stage || 'SERGIK')
  }
  return out
}

export function buildEnvelopeDefinition(input: {
  pdfBase64: string
  filename: string
  subject: string
  blurb: string
  releaseId: string
  kind: RightsPacketKind
  recipients: DocuSignRecipient[]
  webhookUrl?: string | null
}): Record<string, unknown> {
  const signers = input.recipients.map((row, index) => {
    const tabs = row.anchor
      ? {
          signHereTabs: [
            {
              anchorString: `${row.anchor}:`,
              anchorUnits: 'pixels',
              anchorXOffset: '12',
              anchorYOffset: '-2',
              documentId: '1',
            },
          ],
        }
      : {
          signHereTabs: [
            {
              documentId: '1',
              pageNumber: '1',
              xPosition: '72',
              yPosition: String(680 - index * 48),
            },
          ],
        }
    return {
      email: row.email,
      name: row.name,
      recipientId: String(index + 1),
      routingOrder: '1',
      tabs,
    }
  })

  const definition: Record<string, unknown> = {
    emailSubject: input.subject.slice(0, 100),
    emailBlurb: input.blurb.slice(0, 500),
    status: 'sent',
    documents: [
      {
        documentBase64: input.pdfBase64,
        name: input.filename.slice(0, 100),
        fileExtension: 'pdf',
        documentId: '1',
      },
    ],
    recipients: { signers },
    customFields: {
      textCustomFields: [
        { name: 'releaseId', required: 'false', show: 'false', value: input.releaseId },
        { name: 'kind', required: 'false', show: 'false', value: input.kind },
      ],
    },
  }

  if (input.webhookUrl && input.webhookUrl.startsWith('https://')) {
    definition.eventNotification = {
      url: input.webhookUrl,
      loggingEnabled: 'true',
      requireAcknowledgment: 'true',
      deliveryMode: 'SIM',
      includeDocuments: 'false',
      eventData: {
        version: 'restv2.1',
        format: 'json',
        includeData: ['custom_fields'],
      },
      envelopeEvents: [
        { envelopeEventStatusCode: 'sent' },
        { envelopeEventStatusCode: 'delivered' },
        { envelopeEventStatusCode: 'completed' },
        { envelopeEventStatusCode: 'declined' },
        { envelopeEventStatusCode: 'voided' },
      ],
    }
  }

  return definition
}

export function parseDocuSignEnvelopes(raw: unknown): DocuSignEnvelopeRecord[] {
  if (!Array.isArray(raw)) return []
  const out: DocuSignEnvelopeRecord[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Partial<DocuSignEnvelopeRecord>
    const envelopeId = clean(row.envelopeId)
    const kind = clean(row.kind)
    if (!envelopeId || !isRightsPacketKind(kind)) continue
    const recipients = Array.isArray(row.recipients)
      ? row.recipients
          .map((recipient) => {
            if (!recipient || typeof recipient !== 'object') return null
            const stage = clean((recipient as { stage?: unknown }).stage)
            const email = clean((recipient as { email?: unknown }).email).toLowerCase()
            if (!stage || !isValidPartyEmail(email)) return null
            return { stage, email }
          })
          .filter((recipient): recipient is { stage: string; email: string } => Boolean(recipient))
      : []
    out.push({
      envelopeId: envelopeId.slice(0, 80),
      kind,
      status: clean(row.status).toLowerCase() || 'sent',
      recipients,
      sentAt: clean(row.sentAt) || new Date(0).toISOString(),
      updatedAt: clean(row.updatedAt) || clean(row.sentAt) || new Date(0).toISOString(),
    })
  }
  return out
}

export function upsertEnvelopeRecord(
  existing: unknown,
  next: DocuSignEnvelopeRecord,
): DocuSignEnvelopeRecord[] {
  const rows = parseDocuSignEnvelopes(existing).filter((row) => row.envelopeId !== next.envelopeId)
  return [next, ...rows].slice(0, 12)
}

export function latestEnvelope(
  rows: DocuSignEnvelopeRecord[] | unknown,
  kind: RightsPacketKind,
): DocuSignEnvelopeRecord | null {
  const list = (Array.isArray(rows) ? rows : parseDocuSignEnvelopes(rows)).filter((row) => row.kind === kind)
  return list.slice().sort((a, b) => b.sentAt.localeCompare(a.sentAt))[0] || null
}

export function envelopeIsOpen(status: string | null | undefined): boolean {
  const value = clean(status).toLowerCase()
  return value === 'sent' || value === 'delivered' || value === 'signed' || value === 'created'
}

/** Checklist column to flip when DocuSign reports a terminal success. */
export function statusPatchForEnvelope(
  kind: RightsPacketKind,
  status: string,
): Record<string, 'pending' | 'approved'> | null {
  const field =
    kind === 'split_sheet'
      ? 'split_sheet_status'
      : kind === 'producer_agreement' || kind === 'collab_agreement'
        ? 'producer_agreement_status'
        : null
  if (!field) return null
  const value = clean(status).toLowerCase()
  if (value === 'completed') return { [field]: 'approved' }
  if (value === 'sent' || value === 'delivered' || value === 'created') return { [field]: 'pending' }
  return null
}

function customField(fields: unknown, name: string): string | null {
  if (!fields || typeof fields !== 'object') return null
  const list = (fields as { textCustomFields?: unknown }).textCustomFields
  if (!Array.isArray(list)) return null
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    if (clean((item as { name?: unknown }).name).toLowerCase() !== name.toLowerCase()) continue
    const value = clean((item as { value?: unknown }).value)
    if (value) return value
  }
  return null
}

export function parseConnectPayload(body: unknown): {
  envelopeId: string | null
  event: string | null
  releaseId: string | null
  kind: string | null
  status: string | null
} {
  const root = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const data = root.data && typeof root.data === 'object' ? (root.data as Record<string, unknown>) : {}
  const summary =
    data.envelopeSummary && typeof data.envelopeSummary === 'object'
      ? (data.envelopeSummary as Record<string, unknown>)
      : root
  const envelopeId = clean(data.envelopeId || summary.envelopeId || root.envelopeId) || null
  const event = clean(root.event || root.eventType) || null
  const status = clean(summary.status || data.status || root.status).toLowerCase() || null
  return {
    envelopeId,
    event,
    releaseId: customField(summary.customFields || data.customFields, 'releaseId'),
    kind: customField(summary.customFields || data.customFields, 'kind'),
    status,
  }
}

export function readEnvelopeFacts(body: unknown): {
  envelopeId: string | null
  status: string | null
  releaseId: string | null
  kind: string | null
} {
  const root = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  return {
    envelopeId: clean(root.envelopeId) || null,
    status: clean(root.status).toLowerCase() || null,
    releaseId: customField(root.customFields, 'releaseId'),
    kind: customField(root.customFields, 'kind'),
  }
}
