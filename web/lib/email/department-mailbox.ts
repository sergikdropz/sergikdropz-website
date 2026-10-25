export const MAIL_FOLDERS = ['inbox', 'sent', 'drafts', 'scheduled', 'trash'] as const

export type MailFolder = (typeof MAIL_FOLDERS)[number]

export type MailAttachment = {
  filename: string
  contentType: string
  size: number
  /** Same-origin download. Contract PDFs and stored sent files only. */
  href?: string
}

export type MailAttachmentUpload = MailAttachment & { contentBase64: string }

export const MAIL_ATTACHMENT_MAX_FILES = 3
export const MAIL_ATTACHMENT_MAX_BYTES = 2 * 1024 * 1024

export type DepartmentMailMessage = {
  id: string
  accountId: string
  folder: MailFolder
  direction: 'in' | 'out'
  fromAddress: string
  fromName: string
  to: string
  subject: string
  body: string
  status: string
  unread: boolean
  resendId: string | null
  inboundId: string | null
  scheduledAt: string | null
  errorMessage: string | null
  attachments: MailAttachment[]
  createdAt: string
  updatedAt: string
}

export type MailThread = {
  key: string
  messages: DepartmentMailMessage[]
  latest: DepartmentMailMessage
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi

export function isMailFolder(value: string): value is MailFolder {
  return (MAIL_FOLDERS as readonly string[]).includes(value)
}

export function extractEmailAddresses(raw: unknown): string[] {
  const chunks = Array.isArray(raw) ? raw : raw == null ? [] : [raw]
  const seen = new Set<string>()
  const out: string[] = []
  for (const chunk of chunks) {
    const text = String(chunk || '')
    const matches = text.match(EMAIL_RE) || []
    for (const match of matches) {
      const email = match.toLowerCase()
      if (seen.has(email)) continue
      seen.add(email)
      out.push(email)
    }
  }
  return out
}

export function matchDepartmentRecipient(
  rawTo: unknown,
  accounts: { id: string; address: string; name: string }[],
): { id: string; address: string; name: string } | null {
  const addresses = new Set(extractEmailAddresses(rawTo))
  if (!addresses.size) return null
  return accounts.find((account) => addresses.has(account.address.toLowerCase())) ?? null
}

export function replySubject(subject: string): string {
  const clean = subject.trim()
  if (!clean) return 'Re:'
  if (/^re:/i.test(clean)) return clean
  return `Re: ${clean}`
}

export function departmentMailCounts(
  messages: DepartmentMailMessage[],
  accountId?: string | null,
): Record<MailFolder, number> {
  const counts: Record<MailFolder, number> = {
    inbox: 0,
    sent: 0,
    drafts: 0,
    scheduled: 0,
    trash: 0,
  }
  for (const message of messages) {
    if (accountId && accountId !== 'all' && message.accountId !== accountId) continue
    counts[message.folder] += 1
  }
  return counts
}

export function filterDepartmentMail(
  messages: DepartmentMailMessage[],
  input: { folder: MailFolder; accountId?: string | null; query?: string },
): DepartmentMailMessage[] {
  const query = (input.query || '').trim().toLowerCase()
  const rows = messages.filter((message) => {
    if (message.folder !== input.folder) return false
    if (input.accountId && input.accountId !== 'all' && message.accountId !== input.accountId) return false
    if (!query) return true
    const haystack = [message.subject, message.to, message.fromAddress, message.fromName, message.body]
      .join('\n')
      .toLowerCase()
    return haystack.includes(query)
  })
  rows.sort((a, b) => {
    if (input.folder === 'scheduled') {
      return (a.scheduledAt || a.updatedAt).localeCompare(b.scheduledAt || b.updatedAt)
    }
    return b.updatedAt.localeCompare(a.updatedAt)
  })
  return rows
}

export function normalizeMailSubject(subject: string): string {
  return subject
    .replace(/^(?:(?:re|fw|fwd)\s*:\s*)+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function mailThreadKey(message: Pick<DepartmentMailMessage, 'accountId' | 'subject' | 'fromAddress' | 'to'>): string {
  const people = extractEmailAddresses([message.fromAddress, message.to]).sort()
  return `${message.accountId}\n${normalizeMailSubject(message.subject)}\n${people.join(',')}`
}

export function groupMailThreads(messages: DepartmentMailMessage[]): MailThread[] {
  const groups = new Map<string, DepartmentMailMessage[]>()
  for (const message of messages) {
    const key = mailThreadKey(message)
    const rows = groups.get(key)
    if (rows) rows.push(message)
    else groups.set(key, [message])
  }
  const threads: MailThread[] = []
  for (const [key, rows] of groups) {
    rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    threads.push({ key, messages: rows, latest: rows[rows.length - 1] })
  }
  threads.sort((a, b) => b.latest.updatedAt.localeCompare(a.latest.updatedAt))
  return threads
}

function sanitizeAttachmentName(raw: string): string {
  const name = raw.replace(/[/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
  return name || 'file'
}

const CONTRACT_PDF_HREF =
  /^\/api\/studio\/releases\/[A-Za-z0-9][A-Za-z0-9_-]{0,120}\/contracts\/pdf\?kind=(split_sheet|producer_agreement|collab_agreement)$/

export function attachmentDownloadHref(messageId: string, filename: string): string {
  return `/api/admin/email/attachment?message=${encodeURIComponent(messageId)}&file=${encodeURIComponent(filename)}`
}

export function normalizeStoredAttachments(raw: unknown, messageId?: string): MailAttachment[] {
  if (!Array.isArray(raw)) return []
  const out: MailAttachment[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const filename = sanitizeAttachmentName(String(record.filename || 'file'))
    const contentType = String(record.contentType || record.content_type || 'application/octet-stream').slice(0, 120)
    const size = Number(record.size)
    const explicit = typeof record.href === 'string' && CONTRACT_PDF_HREF.test(record.href) ? record.href : ''
    const hasBytes = typeof record.contentBase64 === 'string' && record.contentBase64.length > 20
    const href = explicit || (hasBytes && messageId ? attachmentDownloadHref(messageId, filename) : '')
    out.push({
      filename,
      contentType,
      size: Number.isFinite(size) && size > 0 ? Math.round(size) : 0,
      ...(href ? { href } : {}),
    })
  }
  return out.slice(0, 10)
}

export function parseOutgoingAttachments(raw: unknown): MailAttachmentUpload[] {
  if (raw == null) return []
  if (!Array.isArray(raw)) throw new Error('Attachments must be a list.')
  if (raw.length > MAIL_ATTACHMENT_MAX_FILES) throw new Error('Attach up to 3 files.')
  const out: MailAttachmentUpload[] = []
  let total = 0
  for (const item of raw) {
    if (!item || typeof item !== 'object') throw new Error('Attachment is invalid.')
    const record = item as Record<string, unknown>
    const filename = sanitizeAttachmentName(String(record.filename || 'file'))
    const contentType = String(record.contentType || 'application/octet-stream').slice(0, 120)
    const contentBase64 = typeof record.contentBase64 === 'string' ? record.contentBase64.replace(/\s/g, '') : ''
    if (!contentBase64 || !/^[A-Za-z0-9+/=]+$/.test(contentBase64)) {
      throw new Error(`${filename} could not be read.`)
    }
    const size = Math.floor((contentBase64.length * 3) / 4)
    if (size > MAIL_ATTACHMENT_MAX_BYTES) throw new Error(`${filename} is over 2 MB.`)
    total += size
    if (total > MAIL_ATTACHMENT_MAX_BYTES * MAIL_ATTACHMENT_MAX_FILES) {
      throw new Error('Attachments are over 6 MB combined.')
    }
    out.push({ filename, contentType, size, contentBase64 })
  }
  return out
}

export function dueScheduledMail(messages: DepartmentMailMessage[], now = Date.now()): DepartmentMailMessage[] {
  return messages.filter((message) => {
    if (message.folder !== 'scheduled' || message.status === 'failed' || message.status === 'sending') return false
    if (!message.scheduledAt) return false
    const at = Date.parse(message.scheduledAt)
    return Number.isFinite(at) && at <= now
  })
}
