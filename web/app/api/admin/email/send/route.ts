import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { parseOutgoingAttachments } from '@/lib/email/department-mailbox'
import { departmentMailPlain, departmentPlainTextHtml, parseRecipientList } from '@/lib/email/departments'
import { resolveMailAccount } from '@/lib/email/mail-accounts'
import { sendDepartmentEmailEach } from '@/lib/email/send-department'
import { checkRateLimitAsync } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const session = await getServerSession()
  if (!session?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const limit = await checkRateLimitAsync(`admin-email:${session.user.id}`, 30, 60 * 60 * 1000)
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Too many messages. Try again in ${limit.retryAfterSec}s.` },
      { status: 429 },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const record = body as Record<string, unknown>
  const department = typeof record.department === 'string' ? record.department.trim() : ''
  const account = await resolveMailAccount(department)
  if (!account) {
    return NextResponse.json({ error: 'Unknown account' }, { status: 400 })
  }

  const to = parseRecipientList(record.to)
  if (!to) {
    return NextResponse.json({ error: 'Add at least one valid recipient (20 max).' }, { status: 400 })
  }

  const subject = typeof record.subject === 'string' ? record.subject.trim() : ''
  if (!subject || subject.length > 200) {
    return NextResponse.json({ error: 'Subject must be 1–200 characters.' }, { status: 400 })
  }

  const text = typeof record.text === 'string' ? record.text.trim() : ''
  if (!text || text.length > 20000) {
    return NextResponse.json({ error: 'Message must be 1–20,000 characters.' }, { status: 400 })
  }

  let uploads: ReturnType<typeof parseOutgoingAttachments>
  try {
    uploads = parseOutgoingAttachments(record.attachments)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Attachment is invalid.'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  try {
    const sent = await sendDepartmentEmailEach({
      department,
      to,
      subject,
      html: departmentPlainTextHtml(account, text),
      text: departmentMailPlain(text),
      tags: [{ name: 'source', value: 'admin_desk' }],
      attachments: uploads.map((file) => ({
        filename: file.filename,
        content: Buffer.from(file.contentBase64, 'base64'),
        contentType: file.contentType,
      })),
    })
    if (!sent.sent) {
      return NextResponse.json({ error: sent.error || 'Send failed' }, { status: 500 })
    }
    return NextResponse.json({
      ok: true,
      messageId: sent.messageId ?? null,
      to,
      sent: sent.sent,
      failed: sent.failed,
      error: sent.failed ? sent.error : null,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Send failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
