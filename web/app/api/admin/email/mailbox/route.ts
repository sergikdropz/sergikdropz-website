import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { loadBroadcastActivity, mergeBroadcastActivity } from '@/lib/email/broadcast-activity'
import { isMailFolder, type DepartmentMailMessage } from '@/lib/email/department-mailbox'
import {
  discardDepartmentMail,
  flushDueDepartmentMail,
  isMissingDepartmentMailTable,
  listDepartmentMail,
  markDepartmentMailRead,
  moveDepartmentMail,
  saveDepartmentDraft,
  sendDepartmentDeskMail,
} from '@/lib/email/department-mailbox-store'
import { listResolvedMailAccounts } from '@/lib/email/mail-accounts'
import { departmentAddress, MAIL_DEPARTMENTS } from '@/lib/email/departments'
import { checkRateLimitAsync } from '@/lib/rate-limit'
import { CONTRACT_MAILBOX_ID, contractMailMatches, isContractMailKind } from '@/lib/studio/contract-mail-link'
import { contractBodyForSending, contractKindFromSubject, contractReleaseIdFromDraft } from '@/lib/studio/contract-pdf'
import { includeDocuSignForDeskDraft } from '@/lib/studio/contract-docusign-include'
import { parseOutgoingAttachments } from '@/lib/email/department-mailbox'

export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const session = await getServerSession()
  if (!session?.isAdmin) return null
  return session
}

function contractMailRow(message: DepartmentMailMessage) {
  return {
    id: message.id,
    folder: message.folder,
    direction: message.direction,
    subject: message.subject,
    to: message.to,
    fromName: message.fromName,
    fromAddress: message.fromAddress,
    status: message.status,
    createdAt: message.createdAt,
    unread: message.unread,
  }
}

export async function GET(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    await flushDueDepartmentMail()
    const mailbox = await listDepartmentMail()
    const releaseId = request.nextUrl.searchParams.get('releaseId')?.trim() || ''
    if (releaseId) {
      const kind = request.nextUrl.searchParams.get('kind')
      const releaseTitle = request.nextUrl.searchParams.get('releaseTitle')
      const accounts = await listResolvedMailAccounts().catch(() => [])
      const studio = accounts.find((account) => account.id === CONTRACT_MAILBOX_ID)
      const messages = mailbox.messages
        .filter((message) =>
          contractMailMatches(message, {
            releaseId,
            kind: isContractMailKind(kind) ? kind : null,
            releaseTitle,
          }),
        )
        .slice(0, 8)
        .map(contractMailRow)
      return NextResponse.json({
        available: mailbox.available,
        account: {
          id: CONTRACT_MAILBOX_ID,
          name: studio?.name || MAIL_DEPARTMENTS.studio.name,
          address: studio?.address || departmentAddress('studio'),
        },
        messages,
      })
    }
    const activity = await loadBroadcastActivity().catch(() => [])
    return NextResponse.json({
      ...mailbox,
      messages: mailbox.available ? mergeBroadcastActivity(mailbox.messages, activity) : mailbox.messages,
      activity,
    })
  } catch (error: unknown) {
    if (isMissingDepartmentMailTable(error as { message?: string })) {
      return NextResponse.json({ available: false, messages: [] })
    }
    const message = error instanceof Error ? error.message : 'Could not load mail'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const action = typeof body.action === 'string' ? body.action : ''
  const id = typeof body.id === 'string' ? body.id : undefined

  try {
    if (action === 'save') {
      const message = await saveDepartmentDraft({
        id,
        accountId: String(body.accountId || ''),
        to: String(body.to || ''),
        subject: String(body.subject || ''),
        body: String(body.body || ''),
        scheduledAt: typeof body.scheduledAt === 'string' ? body.scheduledAt : null,
      })
      return NextResponse.json({ ok: true, message })
    }

    if (action === 'send') {
      const limit = await checkRateLimitAsync(`admin-email:${session.user.id}`, 30, 60 * 60 * 1000)
      if (!limit.ok) {
        return NextResponse.json(
          { error: `Too many messages. Try again in ${limit.retryAfterSec}s.` },
          { status: 429 },
        )
      }
      let outboundBody = String(body.body || '')
      const subject = String(body.subject || '')
      const releaseId = contractReleaseIdFromDraft(outboundBody)
      const kind = contractKindFromSubject(subject)
      if (releaseId && kind) {
        const uploads = parseOutgoingAttachments(body.attachments)
        const pdf = uploads.find(
          (file) => file.contentType === 'application/pdf' || file.filename.toLowerCase().endsWith('.pdf'),
        )
        if (pdf) {
          const docusign = await includeDocuSignForDeskDraft({
            releaseId,
            kind,
            subject,
            to: String(body.to || ''),
            pdfBase64: pdf.contentBase64,
            pdfFilename: pdf.filename,
          })
          if (docusign.blocked) {
            return NextResponse.json(
              { error: docusign.error, consentUrl: docusign.consentUrl },
              { status: docusign.status },
            )
          }
          if (!docusign.included && docusign.reason) {
            outboundBody = outboundBody.replace(
              'DocuSign is included: use the DocuSign email sent to this address to sign that same PDF.',
              docusign.reason,
            )
          }
        }
        outboundBody = contractBodyForSending(outboundBody)
      }
      const message = await sendDepartmentDeskMail({
        id,
        accountId: String(body.accountId || ''),
        to: String(body.to || ''),
        subject,
        body: outboundBody,
        attachments: body.attachments,
      })
      return NextResponse.json({ ok: true, message })
    }

    if (action === 'move') {
      const folder = typeof body.folder === 'string' ? body.folder : ''
      if (!id || !isMailFolder(folder)) return NextResponse.json({ error: 'Missing message.' }, { status: 400 })
      await moveDepartmentMail(id, folder)
      return NextResponse.json({ ok: true })
    }

    if (action === 'read') {
      if (!id) return NextResponse.json({ error: 'Missing message.' }, { status: 400 })
      await markDepartmentMailRead(id)
      return NextResponse.json({ ok: true })
    }

    if (action === 'discard') {
      if (!id) return NextResponse.json({ error: 'Missing message.' }, { status: 400 })
      await discardDepartmentMail(id)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error: unknown) {
    if (isMissingDepartmentMailTable(error as { message?: string })) {
      return NextResponse.json({ error: 'Mail storage is not ready.', storage: 'local' }, { status: 503 })
    }
    const message = error instanceof Error ? error.message : 'Could not update mail'
    const status = /must be|valid recipient|Unknown account|at least a minute|too long|attach|over 2 MB|could not be read/i.test(message) ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
