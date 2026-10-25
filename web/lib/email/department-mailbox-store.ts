import { createSupabaseServerClient } from '@/lib/supabase'
import { departmentMailPlain, departmentPlainTextHtml, parseRecipientList } from '@/lib/email/departments'
import {
  extractEmailAddresses,
  isMailFolder,
  matchDepartmentRecipient,
  normalizeStoredAttachments,
  parseOutgoingAttachments,
  type DepartmentMailMessage,
  type MailAttachment,
  type MailFolder,
} from '@/lib/email/department-mailbox'
import { listResolvedMailAccounts, resolveMailAccount } from '@/lib/email/mail-accounts'
import { sendDepartmentEmailEach } from '@/lib/email/send-department'

const TABLE = 'department_mail_messages'
const LIST_LIMIT = 200

type Row = {
  id: string
  account_id: string
  folder: string
  direction: string
  from_address: string
  from_name: string
  to_addresses: string
  subject: string
  body: string
  status: string
  unread: boolean
  resend_id: string | null
  inbound_id: string | null
  scheduled_at: string | null
  error_message: string | null
  attachments?: unknown
  created_at: string
  updated_at: string
}

export function isMissingDepartmentMailTable(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false
  if (error.code === 'PGRST205' || error.code === '42P01') return true
  const msg = String(error.message || '')
  return /department_mail_messages/i.test(msg) && /does not exist|schema cache|could not find/i.test(msg)
}

function mapRow(row: Row): DepartmentMailMessage {
  const folder = isMailFolder(row.folder) ? row.folder : 'drafts'
  return {
    id: String(row.id),
    accountId: String(row.account_id),
    folder,
    direction: row.direction === 'in' ? 'in' : 'out',
    fromAddress: String(row.from_address || ''),
    fromName: String(row.from_name || ''),
    to: String(row.to_addresses || ''),
    subject: String(row.subject || ''),
    body: String(row.body || ''),
    status: String(row.status || ''),
    unread: Boolean(row.unread),
    resendId: row.resend_id ? String(row.resend_id) : null,
    inboundId: row.inbound_id ? String(row.inbound_id) : null,
    scheduledAt: row.scheduled_at ? String(row.scheduled_at) : null,
    errorMessage: row.error_message ? String(row.error_message) : null,
    attachments: normalizeStoredAttachments(row.attachments, String(row.id)),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function toRow(message: DepartmentMailMessage): Record<string, unknown> {
  return {
    id: message.id,
    account_id: message.accountId,
    folder: message.folder,
    direction: message.direction,
    from_address: message.fromAddress,
    from_name: message.fromName,
    to_addresses: message.to,
    subject: message.subject,
    body: message.body,
    status: message.status,
    unread: message.unread,
    resend_id: message.resendId,
    inbound_id: message.inboundId,
    scheduled_at: message.scheduledAt,
    error_message: message.errorMessage,
    attachments: message.attachments,
    created_at: message.createdAt,
    updated_at: message.updatedAt,
  }
}

export async function listDepartmentMail(): Promise<{ available: boolean; messages: DepartmentMailMessage[] }> {
  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(LIST_LIMIT)
    if (error) {
      if (isMissingDepartmentMailTable(error)) return { available: false, messages: [] }
      throw new Error(error.message)
    }
    return { available: true, messages: ((data || []) as Row[]).map(mapRow) }
  } catch (error) {
    if (isMissingDepartmentMailTable(error as { message?: string })) return { available: false, messages: [] }
    throw error
  }
}

async function preservedCreatedAt(id?: string): Promise<string | null> {
  if (!id) return null
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase.from(TABLE).select('created_at').eq('id', id).maybeSingle()
  if (error || !data?.created_at) return null
  return String(data.created_at)
}

async function preservedAttachments(id?: string): Promise<MailAttachment[]> {
  if (!id) return []
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase.from(TABLE).select('attachments').eq('id', id).maybeSingle()
  if (error || !Array.isArray(data?.attachments)) return []
  return data.attachments as MailAttachment[]
}

async function writeMessage(message: DepartmentMailMessage): Promise<DepartmentMailMessage> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase.from(TABLE).upsert(toRow(message)).select('*').maybeSingle()
  if (error) throw new Error(error.message)
  return mapRow((data || toRow(message)) as Row)
}

export async function saveDepartmentDraft(input: {
  id?: string
  accountId: string
  to: string
  subject: string
  body: string
  scheduledAt?: string | null
  attachments?: unknown
}): Promise<DepartmentMailMessage> {
  const account = await resolveMailAccount(input.accountId)
  if (!account) throw new Error('Unknown account')
  const to = input.to.trim()
  const subject = input.subject.trim().slice(0, 200)
  const body = input.body.slice(0, 20000)
  if (to.length > 2000) throw new Error('Recipient list is too long.')
  const scheduledAt = input.scheduledAt?.trim() || null
  if (scheduledAt) {
    const at = Date.parse(scheduledAt)
    if (!Number.isFinite(at) || at < Date.now() + 30_000) {
      throw new Error('Pick a send time at least a minute from now.')
    }
    if (!parseRecipientList(to) || !subject || !body.trim()) {
      throw new Error('Scheduled mail needs a recipient, subject, and message.')
    }
  }
  const now = new Date().toISOString()
  const folder: MailFolder = scheduledAt ? 'scheduled' : 'drafts'
  const id = input.id || crypto.randomUUID()
  const attachments =
    input.attachments === undefined
      ? await preservedAttachments(input.id)
      : parseOutgoingAttachments(input.attachments).map((file) => ({
          filename: file.filename,
          contentType: file.contentType,
          size: file.size,
          contentBase64: file.contentBase64,
        }))
  return writeMessage({
    id,
    accountId: account.id,
    folder,
    direction: 'out',
    fromAddress: account.address,
    fromName: account.name,
    to,
    subject,
    body,
    status: scheduledAt ? 'scheduled' : 'draft',
    unread: false,
    resendId: null,
    inboundId: null,
    scheduledAt,
    errorMessage: null,
    attachments: attachments as DepartmentMailMessage['attachments'],
    createdAt: (await preservedCreatedAt(input.id)) || now,
    updatedAt: now,
  })
}

export async function sendDepartmentDeskMail(input: {
  id?: string
  accountId: string
  to: string
  subject: string
  body: string
  attachments?: unknown
}): Promise<DepartmentMailMessage> {
  const account = await resolveMailAccount(input.accountId)
  if (!account) throw new Error('Unknown account')
  const to = parseRecipientList(input.to)
  if (!to) throw new Error('Add at least one valid recipient (20 max).')
  const subject = input.subject.trim()
  const body = input.body.trim()
  if (!subject || subject.length > 200) throw new Error('Subject must be 1–200 characters.')
  if (!body || body.length > 20000) throw new Error('Message must be 1–20,000 characters.')
  const uploads = parseOutgoingAttachments(input.attachments)

  const sent = await sendDepartmentEmailEach({
    department: account.id,
    to,
    subject,
    html: departmentPlainTextHtml(account, body),
    text: departmentMailPlain(body),
    tags: [{ name: 'source', value: 'admin_desk' }],
    attachments: uploads.map((file) => ({
      filename: file.filename,
      content: Buffer.from(file.contentBase64, 'base64'),
      contentType: file.contentType,
    })),
  })
  if (!sent.sent) throw new Error(sent.error || 'Send failed')
  const now = new Date().toISOString()
  const id = input.id || crypto.randomUUID()
  return writeMessage({
    id,
    accountId: account.id,
    folder: 'sent',
    direction: 'out',
    fromAddress: account.address,
    fromName: account.name,
    to: to.join(', '),
    subject,
    body,
    status: sent.failed ? 'partial' : 'sent',
    unread: false,
    resendId: sent.messageId ?? null,
    inboundId: null,
    scheduledAt: null,
    errorMessage: sent.failed ? `${sent.failed} of ${to.length} did not send. ${sent.error || ''}`.trim() : null,
    attachments: uploads.map(({ filename, contentType, size }) => ({ filename, contentType, size })),
    createdAt: (await preservedCreatedAt(input.id)) || now,
    updatedAt: now,
  })
}

export async function recordSentDepartmentMail(input: {
  accountId: string
  to: string
  subject: string
  body: string
  resendId?: string | null
  status?: string
  errorMessage?: string | null
  attachments?: Array<MailAttachment & { contentBase64?: string }>
}): Promise<void> {
  const account = await resolveMailAccount(input.accountId)
  if (!account) return
  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  const attachments = (input.attachments || []).slice(0, 3).map((file) => {
    const filename = file.filename.slice(0, 120) || 'file'
    const keepBytes = Boolean(file.contentBase64) && file.size > 0 && file.size <= 2 * 1024 * 1024
    return {
      filename,
      contentType: file.contentType || 'application/octet-stream',
      size: file.size,
      ...(keepBytes ? { contentBase64: file.contentBase64 } : {}),
      ...(!keepBytes && file.href ? { href: file.href } : {}),
    }
  })
  try {
    const supabase = createSupabaseServerClient()
    const { error } = await supabase.from(TABLE).insert({
      id,
      account_id: account.id,
      folder: 'sent',
      direction: 'out',
      from_address: account.address,
      from_name: account.name,
      to_addresses: input.to.slice(0, 2000),
      subject: input.subject.slice(0, 200),
      body: input.body.slice(0, 20000),
      status: input.status || 'sent',
      unread: false,
      resend_id: input.resendId ?? null,
      inbound_id: null,
      scheduled_at: null,
      error_message: input.errorMessage ?? null,
      attachments,
      created_at: now,
      updated_at: now,
    })
    if (error) throw new Error(error.message)
  } catch (error) {
    if (isMissingDepartmentMailTable(error as { message?: string })) return
    throw error
  }
}

export async function moveDepartmentMail(id: string, folder: MailFolder): Promise<void> {
  if (folder === 'sent' || folder === 'scheduled') throw new Error('That folder is filled by send and schedule.')
  const supabase = createSupabaseServerClient()
  const { error } = await supabase
    .from(TABLE)
    .update({ folder, unread: folder === 'inbox', updated_at: new Date().toISOString(), error_message: null })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function markDepartmentMailRead(id: string): Promise<void> {
  const supabase = createSupabaseServerClient()
  const { error } = await supabase.from(TABLE).update({ unread: false }).eq('id', id)
  if (error && !isMissingDepartmentMailTable(error)) throw new Error(error.message)
}

export async function discardDepartmentMail(id: string): Promise<void> {
  const supabase = createSupabaseServerClient()
  const { error } = await supabase.from(TABLE).delete().eq('id', id).eq('folder', 'trash')
  if (error) throw new Error(error.message)
}

export async function flushDueDepartmentMail(limit = 5): Promise<number> {
  const supabase = createSupabaseServerClient()
  const nowIso = new Date().toISOString()
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('folder', 'scheduled')
    .eq('status', 'scheduled')
    .lte('scheduled_at', nowIso)
    .order('scheduled_at', { ascending: true })
    .limit(limit)
  if (error) {
    if (isMissingDepartmentMailTable(error)) return 0
    throw new Error(error.message)
  }
  let sent = 0
  for (const row of (data || []) as Row[]) {
    const claimed = await supabase
      .from(TABLE)
      .update({ status: 'sending', updated_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('status', 'scheduled')
      .select('id')
    if (claimed.error || !claimed.data?.length) continue
    try {
      const message = await sendDepartmentDeskMail({
        id: row.id,
        accountId: row.account_id,
        to: row.to_addresses,
        subject: row.subject,
        body: row.body,
      })
      if (message.folder === 'sent') sent += 1
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : 'Send failed'
      await supabase
        .from(TABLE)
        .update({
          folder: 'scheduled',
          status: 'failed',
          error_message: message.slice(0, 400),
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
    }
  }
  return sent
}

export type InboundMailPayload = {
  email_id?: string
  from?: string
  to?: string | string[]
  subject?: string
  text?: string | null
  html?: string | null
  attachments?: unknown
}

function plainFromHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function loadInboundPlain(data: InboundMailPayload): Promise<{ text: string; subject: string }> {
  let text = String(data.text || '').trim() || plainFromHtml(String(data.html || ''))
  let subject = String(data.subject || '').trim()
  const inboundId = data.email_id ? String(data.email_id) : ''
  if (!text && inboundId) {
    const fetched = await fetchReceivingBody(inboundId)
    text = fetched.text
    if (!subject) subject = fetched.subject
  }
  return { text, subject }
}

async function fetchReceivingBody(emailId: string): Promise<{ text: string; subject: string }> {
  const key = process.env.RESEND_API_KEY?.trim()
  if (!key) return { text: '', subject: '' }
  const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: 'no-store',
  })
  if (!res.ok) return { text: '', subject: '' }
  const json = (await res.json().catch(() => ({}))) as { text?: string; html?: string; subject?: string }
  return {
    text: String(json.text || '').trim() || plainFromHtml(String(json.html || '')),
    subject: String(json.subject || '').trim(),
  }
}

async function insertInboundMessage(input: {
  accountId: string
  accountAddress: string
  inboundId: string
  fromRaw: string
  subject: string
  body: string
  attachments: unknown
}): Promise<boolean> {
  const supabase = createSupabaseServerClient()
  const existing = await supabase.from(TABLE).select('id').eq('inbound_id', input.inboundId).maybeSingle()
  if (existing.error) {
    if (isMissingDepartmentMailTable(existing.error)) return false
    throw new Error(existing.error.message)
  }
  if (existing.data?.id) return true

  const fromList = extractEmailAddresses(input.fromRaw)
  const fromAddress = fromList[0] || ''
  const fromName = String(input.fromRaw || '')
    .replace(/<[^>]+>/g, '')
    .replace(/"/g, '')
    .trim()
  const now = new Date().toISOString()
  const { error } = await supabase.from(TABLE).insert({
    account_id: input.accountId,
    folder: 'inbox',
    direction: 'in',
    from_address: fromAddress,
    from_name: fromName || fromAddress,
    to_addresses: input.accountAddress,
    subject: input.subject.slice(0, 200) || '(no subject)',
    body: input.body.slice(0, 20000),
    status: 'received',
    attachments: input.attachments,
    unread: true,
    inbound_id: input.inboundId,
    created_at: now,
    updated_at: now,
  })
  if (error) {
    if (isMissingDepartmentMailTable(error)) return false
    if (error.code === '23505') return true
    throw new Error(error.message)
  }
  return true
}

export async function recordDepartmentInbound(data: InboundMailPayload): Promise<boolean> {
  const inboundId = data.email_id ? String(data.email_id) : ''
  if (!inboundId) return false
  const accounts = await listResolvedMailAccounts()
  const account = matchDepartmentRecipient(data.to, accounts)
  if (!account) return false
  const loaded = await loadInboundPlain(data)
  return insertInboundMessage({
    accountId: account.id,
    accountAddress: account.address,
    inboundId,
    fromRaw: String(data.from || ''),
    subject: loaded.subject,
    body: loaded.text || 'This reply arrived without a text body.',
    attachments: normalizeStoredAttachments(data.attachments),
  })
}

/** File a release reply on a department mailbox even when Reply-To is a plus-address. */
export async function recordInboundOnAccount(input: {
  accountId: string
  data: InboundMailPayload
  subject: string
  body: string
  extraAttachments?: MailAttachment[]
}): Promise<boolean> {
  const inboundId = input.data.email_id ? String(input.data.email_id) : ''
  if (!inboundId) return false
  const account = await resolveMailAccount(input.accountId)
  if (!account) return false
  const attachments = [
    ...normalizeStoredAttachments(input.data.attachments),
    ...(input.extraAttachments || []),
  ].slice(0, 10)
  return insertInboundMessage({
    accountId: account.id,
    accountAddress: account.address,
    inboundId,
    fromRaw: String(input.data.from || ''),
    subject: input.subject,
    body: input.body || 'This reply arrived without a text body.',
    attachments,
  })
}

export async function stampDepartmentMailDelivery(resendId: string, status: string): Promise<void> {
  if (!resendId || !status) return
  const supabase = createSupabaseServerClient()
  const { error } = await supabase
    .from(TABLE)
    .update({ status, updated_at: new Date().toISOString() })
    .eq('resend_id', resendId)
    .eq('folder', 'sent')
  if (error && !isMissingDepartmentMailTable(error)) throw new Error(error.message)
}
