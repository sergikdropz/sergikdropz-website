import type { RightsPacketKind } from '@/lib/studio/rights-packets'

/** Contracts and their replies live in the Release Studio department mailbox. */
export const CONTRACT_MAILBOX_ID = 'studio'

const KINDS = new Set<RightsPacketKind>(['split_sheet', 'producer_agreement', 'collab_agreement'])

export function isContractMailKind(value: string | null | undefined): value is RightsPacketKind {
  return KINDS.has(value as RightsPacketKind)
}

function subjectKind(subject: string): RightsPacketKind | null {
  const text = subject.replace(/^(?:(?:re|fw|fwd)\s*:\s*)+/i, '').toLowerCase()
  if (/\bsplit sheet\b/.test(text)) return 'split_sheet'
  if (/\bproducer agreement\b/.test(text)) return 'producer_agreement'
  if (/\b(?:collaboration|collab) agreement\b/.test(text)) return 'collab_agreement'
  return null
}

function namesKind(subject: string, body: string): RightsPacketKind | null {
  const fromSubject = subjectKind(subject)
  if (fromSubject) return fromSubject
  const href = body.match(/kind=(split_sheet|producer_agreement|collab_agreement)/)
  if (href) return href[1] as RightsPacketKind
  const text = `${subject}\n${body}`.toLowerCase()
  if (text.includes('split sheet')) return 'split_sheet'
  if (text.includes('producer agreement')) return 'producer_agreement'
  if (text.includes('collaboration agreement') || text.includes('collab agreement')) return 'collab_agreement'
  return null
}

function mentionsRelease(
  subject: string,
  body: string,
  releaseId: string,
  releaseTitle: string | null | undefined,
): boolean {
  const haystack = `${subject}\n${body}`
  if (haystack.includes(releaseId)) return true
  const title = (releaseTitle || '').trim()
  if (title.length < 4) return false
  return haystack.toLowerCase().includes(title.toLowerCase())
}

/** Mail filed on the Release Studio mailbox for this release, and this packet when the kind is known. */
export function contractMailMatches(
  message: { accountId: string; subject: string; body: string },
  input: { releaseId: string; kind?: string | null; releaseTitle?: string | null },
): boolean {
  if (message.accountId !== CONTRACT_MAILBOX_ID) return false
  const releaseId = input.releaseId.trim()
  if (!releaseId) return false
  if (!mentionsRelease(message.subject, message.body, releaseId, input.releaseTitle)) return false
  if (!isContractMailKind(input.kind)) return true
  const named = namesKind(message.subject, message.body)
  if (!named) return true
  return named === input.kind
}

export function contractDraftHref(messageId: string): string {
  const params = new URLSearchParams({
    mailbox: CONTRACT_MAILBOX_ID,
    folder: 'drafts',
    compose: messageId,
  })
  return `/admin/email?${params.toString()}`
}

export function contractMailboxHref(input: { releaseTitle?: string | null; packetLabel?: string | null }): string {
  const query = (input.releaseTitle || input.packetLabel || '').trim()
  const params = new URLSearchParams({ mailbox: CONTRACT_MAILBOX_ID, folder: 'sent' })
  if (query) params.set('q', query)
  return `/admin/email?${params.toString()}`
}
