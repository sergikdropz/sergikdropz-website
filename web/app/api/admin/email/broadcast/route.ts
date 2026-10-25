import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { loadAudienceRecipients, type AudienceClient } from '@/lib/email/department-audience'
import {
  ADMIN_MAIL_ROUTES,
  personalizeBroadcast,
  sliceBroadcast,
} from '@/lib/email/department-desk'
import { departmentMailPlain, departmentPlainTextHtml } from '@/lib/email/departments'
import { recordSentDepartmentMail } from '@/lib/email/department-mailbox-store'
import { resolveMailAccount } from '@/lib/email/mail-accounts'
import { sendDepartmentEmail } from '@/lib/email/send-department'
import { checkRateLimitAsync } from '@/lib/rate-limit'
import { createSupabaseServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const session = await getServerSession()
  if (!session?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const limit = await checkRateLimitAsync(`admin-broadcast:${session.user.id}`, 3, 60 * 60 * 1000)
  if (!limit.ok) {
    return NextResponse.json({ error: `Too many broadcasts. Try again in ${limit.retryAfterSec}s.` }, { status: 429 })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const department = typeof body.department === 'string' ? body.department.trim() : ''
  const audienceId = typeof body.audienceId === 'string' ? body.audienceId.trim() : ''
  const subject = typeof body.subject === 'string' ? body.subject.trim() : ''
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  const skip = typeof body.skip === 'number' && body.skip > 0 ? Math.floor(body.skip) : 0

  if (!ADMIN_MAIL_ROUTES.some((route) => route.accountId === audienceId)) {
    return NextResponse.json({ error: 'Pick an audience from a site department.' }, { status: 400 })
  }
  const account = await resolveMailAccount(department)
  if (!account) return NextResponse.json({ error: 'Unknown account' }, { status: 400 })
  if (!subject || subject.length > 200) {
    return NextResponse.json({ error: 'Subject must be 1–200 characters.' }, { status: 400 })
  }
  if (!text || text.length > 20000) {
    return NextResponse.json({ error: 'Message must be 1–20,000 characters.' }, { status: 400 })
  }

  const people = await loadAudienceRecipients(createSupabaseServerClient() as unknown as AudienceClient, audienceId)
  const { batch, remaining } = sliceBroadcast(people, skip)
  if (!batch.length) {
    return NextResponse.json({ error: 'That department has no contacts to mail.' }, { status: 400 })
  }

  let sent = 0
  let failed = 0
  let firstId: string | null = null
  for (const person of batch) {
    try {
      const result = await sendDepartmentEmail({
        department: account.id,
        to: person.email,
        subject,
        html: departmentPlainTextHtml(account, personalizeBroadcast(text, person.name)),
        text: departmentMailPlain(personalizeBroadcast(text, person.name)),
        tags: [{ name: 'source', value: 'broadcast' }],
      })
      sent += 1
      if (!firstId && result.messageId) firstId = result.messageId
    } catch {
      failed += 1
    }
  }

  const audience = ADMIN_MAIL_ROUTES.find((route) => route.accountId === audienceId)
  await recordSentDepartmentMail({
    accountId: account.id,
    to: `${sent} ${audience?.label || audienceId} contacts`,
    subject,
    body: text,
    resendId: firstId,
    status: failed ? 'partial' : 'sent',
    errorMessage: failed ? `${failed} of ${batch.length} did not send.` : null,
  }).catch(() => undefined)

  return NextResponse.json({
    ok: sent > 0,
    sent,
    failed,
    remaining,
    nextSkip: skip + batch.length,
  })
}
