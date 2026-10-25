import type { MailAttachment } from '@/lib/email/department-mailbox'
import {
  loadInboundPlain,
  recordInboundOnAccount,
  type InboundMailPayload,
} from '@/lib/email/department-mailbox-store'
import { stripInboundReplyBody } from '@/lib/studio/collab-inbound'
import {
  contractInboundDeskBody,
  contractKindFromSubject,
  contractKindLabel,
  contractPdfFilename,
  contractPdfHref,
  contractStudioUrl,
  releaseTitleFromContractSubject,
} from '@/lib/studio/contract-pdf'

function addressFrom(raw: string): { name: string; email: string } {
  const email = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase() || ''
  const name = raw.replace(/<[^>]+>/g, '').replace(/"/g, '').trim()
  return { name, email }
}

/** Copy a release reply into the Release Studio inbox, with a link back to the contract. */
export async function fileReleaseReplyInStudioMailbox(
  data: InboundMailPayload,
  releaseId: string,
): Promise<boolean> {
  const loaded = await loadInboundPlain(data)
  const subject = loaded.subject || String(data.subject || '').trim()
  const reply = stripInboundReplyBody(loaded.text) || loaded.text
  const from = addressFrom(String(data.from || ''))
  const kind = contractKindFromSubject(subject)
  const extra: MailAttachment[] = []
  if (kind) {
    const href = contractPdfHref(releaseId, kind)
    if (href) {
      extra.push({
        filename: contractPdfFilename(
          contractKindLabel(kind),
          releaseTitleFromContractSubject(subject) || 'contract',
        ),
        contentType: 'application/pdf',
        size: 0,
        href,
      })
    }
  }
  return recordInboundOnAccount({
    accountId: 'studio',
    data,
    subject: subject || '(no subject)',
    body: contractInboundDeskBody({
      fromName: from.name,
      fromEmail: from.email,
      replyText: reply,
      studioUrl: contractStudioUrl(releaseId),
    }),
    extraAttachments: extra,
  })
}
