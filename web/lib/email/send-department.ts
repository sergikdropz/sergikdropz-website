import { sendEmail } from '../email'
import { resolveMailAccount } from './mail-accounts'

export async function sendDepartmentEmail(input: {
  department: string
  to: string | string[]
  subject: string
  html: string
  text?: string
  replyTo?: string
  tags?: { name: string; value: string }[]
  attachments?: { filename: string; content: Buffer; contentType?: string }[]
}) {
  const account = await resolveMailAccount(input.department)
  if (!account) throw new Error(`Unknown mail account: ${input.department}`)
  const tag = account.id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'mail'
  return sendEmail({
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    from: account.from,
    replyTo: input.replyTo?.trim() || account.address,
    tags: [{ name: 'department', value: tag }, ...(input.tags ?? [])],
    attachments: input.attachments,
  })
}

/** One Resend message per person, so a list is not a single shared To line. */
export async function sendDepartmentEmailEach(input: {
  department: string
  to: string[]
  subject: string
  html: string
  text?: string
  replyTo?: string
  tags?: { name: string; value: string }[]
  attachments?: { filename: string; content: Buffer; contentType?: string }[]
}): Promise<{ sent: number; failed: number; messageId: string | null; error: string | null }> {
  let messageId: string | null = null
  let failed = 0
  let error: string | null = null
  for (const recipient of input.to) {
    try {
      const result = await sendDepartmentEmail({ ...input, to: recipient })
      if (!messageId && result.messageId) messageId = result.messageId
    } catch (sendError: unknown) {
      failed += 1
      if (!error) error = sendError instanceof Error ? sendError.message : 'Send failed'
    }
  }
  return { sent: input.to.length - failed, failed, messageId, error }
}
