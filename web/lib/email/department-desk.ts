import { MAIL_SNIPPETS } from './mail-snippets'

export const DESK_SECTIONS = ['broadcasts', 'automations', 'templates', 'audience', 'metrics', 'webhooks'] as const

export const MAIL_SETTINGS = [
  { id: 'usage', label: 'Usage' },
  { id: 'team', label: 'Team' },
  { id: 'sending', label: 'Sending' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'unsubscribe', label: 'Unsubscribe' },
] as const

export type MailSetting = (typeof MAIL_SETTINGS)[number]['id']

/** Current sending plan on the Resend account: transactional mail and marketing contacts. */
export const MAIL_ALLOWANCE = {
  transactional: 3000,
  contacts: 1000,
  price: '$0 / mo',
} as const

export function mailUsage(input: { sent: number; contacts: number }) {
  return {
    transactional: { used: Math.max(0, input.sent), limit: MAIL_ALLOWANCE.transactional },
    contacts: { used: Math.max(0, input.contacts), limit: MAIL_ALLOWANCE.contacts },
  }
}

export function isMailSetting(value: string): value is MailSetting {
  return MAIL_SETTINGS.some((item) => item.id === value)
}

export type DeskSection = (typeof DESK_SECTIONS)[number]

export const BROADCAST_LIMIT = 40

export type AdminMailRoute = {
  id: string
  accountId: string
  label: string
  href: string
  handles: string
}

/** Site admin areas that already send, or should send, through a department mailbox. */
export const ADMIN_MAIL_ROUTES: AdminMailRoute[] = [
  {
    id: 'studio',
    accountId: 'studio',
    label: 'Release Studio',
    href: '/studio',
    handles: 'Contract PDFs, collab replies, and release-day reminders',
  },
  {
    id: 'contracts',
    accountId: 'studio',
    label: 'Contracts',
    href: '/studio/releases',
    handles: 'Split sheets and signing PDFs. Send and replies use the Release Studio mailbox.',
  },
  {
    id: 'drops',
    accountId: 'drops',
    label: 'Music Vault',
    href: '/admin/music-vault',
    handles: 'Private download invites and catalog shares',
  },
  {
    id: 'shop',
    accountId: 'shop',
    label: 'Shop',
    href: '/admin/purchases',
    handles: 'Orders, licenses, memberships, and merch',
  },
  {
    id: 'fans',
    accountId: 'fans',
    label: 'Subscribers',
    href: '/admin/subscribers',
    handles: 'List welcome and site signups',
  },
  {
    id: 'promo',
    accountId: 'promo',
    label: 'Nurturing',
    href: '/admin/nurturing/campaigns',
    handles: 'Campaigns, fan sequences, and release blasts',
  },
  {
    id: 'bookings',
    accountId: 'bookings',
    label: 'Bookings',
    href: '/admin',
    handles: 'Show holds and date replies',
  },
  {
    id: 'press',
    accountId: 'press',
    label: 'Press',
    href: '/admin/nurturing/fans',
    handles: 'Press, playlists, and radio',
  },
  {
    id: 'support',
    accountId: 'support',
    label: 'Support',
    href: '/admin/settings',
    handles: 'Account and site help',
  },
]

export type MailAutomation = {
  id: string
  accountId: string
  name: string
  schedule: string
  detail: string
  href: string
}

export const MAIL_AUTOMATIONS: MailAutomation[] = [
  {
    id: 'release-reminders',
    accountId: 'studio',
    name: 'Release reminders',
    schedule: 'Daily at 9:00 AM Phoenix',
    detail: 'Staying A Vibe day-before note on Oct 7 and the ISRC pull on Oct 8, from Release Studio.',
    href: '/studio/releases',
  },
  {
    id: 'campaigns',
    accountId: 'promo',
    name: 'Nurturing campaigns',
    schedule: 'When a campaign step is due',
    detail: 'Scheduled fan sequences leave from the promo mailbox.',
    href: '/admin/nurturing/campaigns',
  },
  {
    id: 'scheduled-desk',
    accountId: '',
    name: 'Scheduled desk mail',
    schedule: 'Every 15 minutes',
    detail: 'Mail waiting in Scheduled sends from the mailbox it was written in.',
    href: '/admin/email',
  },
  {
    id: 'shop-sales',
    accountId: 'shop',
    name: 'Shop sales',
    schedule: 'When Stripe checkout completes',
    detail: 'Each paid order is emailed from the shop mailbox and filed unread in that inbox.',
    href: '/admin/email',
  },
  {
    id: 'contract-signing',
    accountId: 'studio',
    name: 'Contract signing',
    schedule: 'When a contract is emailed or sent to DocuSign',
    detail:
      'Rights packets leave Release Studio as a PDF or a DocuSign envelope. The sent copy and later replies stay in that inbox.',
    href: '/studio/releases',
  },
  {
    id: 'inbound',
    accountId: 'studio',
    name: 'Inbound replies',
    schedule: 'As mail arrives',
    detail: 'Contract and collab replies file into the Release Studio inbox and onto the release.',
    href: '/admin/email',
  },
]

export type DeskTemplate = {
  id: string
  accountId: string
  label: string
  subject: string
  body: string
}

const EXTRA_TEMPLATES: DeskTemplate[] = [
  {
    id: 'fans-welcome',
    accountId: 'fans',
    label: 'List welcome',
    subject: 'You are on the SERGIK list',
    body: 'Thanks for signing up. New music and download links will come from this address. Reply if you want off the list.',
  },
  {
    id: 'drops-invite',
    accountId: 'drops',
    label: 'Download invite',
    subject: 'Your SERGIK download',
    body: 'Here is the private link for this drop. It is tied to your email, so keep it to yourself.',
  },
  {
    id: 'shop-note',
    accountId: 'shop',
    label: 'Order note',
    subject: 'Your SERGIK order',
    body: 'Your order is in. Reply to this address if a license, download, or merch item needs a second look.',
  },
  {
    id: 'promo-blast',
    accountId: 'promo',
    label: 'Release blast',
    subject: 'New SERGIK music',
    body: 'Hi {{name}},\n\nA new release is up. The listen link is below.\n\n— SERGIK',
  },
  {
    id: 'support-reply',
    accountId: 'support',
    label: 'Support reply',
    subject: 'Re: your SERGIK account',
    body: 'Thanks for writing in. I am looking at this and will reply from this address once it is sorted.',
  },
]

export type AudienceContact = {
  email: string
  name: string
  source: string
  tags: string[]
}

export function isDeskSection(value: string): value is DeskSection {
  return (DESK_SECTIONS as readonly string[]).includes(value)
}

export function audienceAccountForContact(input: { source?: string | null; tags?: string[] | null }): string {
  const source = String(input.source || '').toLowerCase()
  const tags = (input.tags || []).map((tag) => tag.toLowerCase())
  const haystack = `${source} ${tags.join(' ')}`
  if (/press|radio|playlist/.test(haystack)) return 'press'
  if (/book/.test(haystack)) return 'bookings'
  if (/shop|merch|order|purchase|license|stripe/.test(haystack)) return 'shop'
  if (/download|drop|share|vault|track/.test(haystack)) return 'drops'
  if (/campaign|promo|nurtur/.test(haystack)) return 'promo'
  return 'fans'
}

export function bucketAudience(contacts: AudienceContact[]): Map<string, AudienceContact[]> {
  const buckets = new Map<string, AudienceContact[]>()
  const seen = new Set<string>()
  for (const contact of contacts) {
    const email = contact.email.trim().toLowerCase()
    if (!email || seen.has(email)) continue
    seen.add(email)
    const accountId = audienceAccountForContact(contact)
    const list = buckets.get(accountId) || []
    list.push({ ...contact, email })
    buckets.set(accountId, list)
  }
  return buckets
}

export function mergeAudienceContact(current: AudienceContact | undefined, next: AudienceContact): AudienceContact {
  if (!current) return next
  const tags = [...new Set([...current.tags, ...next.tags].map((tag) => tag.trim()).filter(Boolean))]
  return {
    email: current.email || next.email,
    name: current.name.trim() || next.name.trim(),
    source: [current.source, next.source].map((part) => part.trim()).filter(Boolean).join(' '),
    tags,
  }
}

export function campaignMailbox(name: string): string {
  const label = name.toLowerCase()
  if (/shop|merch|order/.test(label)) return 'shop'
  if (/press|radio|playlist/.test(label)) return 'press'
  if (/book/.test(label)) return 'bookings'
  if (/download|drop|vault/.test(label)) return 'drops'
  if (/support|help/.test(label)) return 'support'
  if (/studio|contract|collab|isrc/.test(label)) return 'studio'
  return 'promo'
}

export function campaignReleaseTitle(name: string): string {
  const title = name.replace(/\s*[-–—:]\s*release campaign\s*$/i, '').trim()
  return title || name.trim() || 'New music'
}

function phoenixDay(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Phoenix',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

function campaignDayLabel(day: string): string {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, date, 12)).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

export function campaignBroadcastDraft(input: {
  name: string
  description?: string | null
  scheduledAt?: string | null
  now?: Date
}): { accountId: string; audienceId: string; subject: string; body: string } {
  const title = campaignReleaseTitle(input.name)
  const accountId = campaignMailbox(input.name)
  const audienceId = accountId === 'promo' ? 'fans' : accountId
  const day = input.scheduledAt?.slice(0, 10) || ''
  const upcoming = /^\d{4}-\d{2}-\d{2}$/.test(day) && day > phoenixDay(input.now || new Date())
  const when = upcoming ? campaignDayLabel(day) : ''
  const subject = upcoming ? `${title} — out ${when}` : `${title} is out`
  const description = input.description?.trim() || ''
  const note = description && !/automated release week/i.test(description) ? `\n\n${description}` : ''
  const lead = upcoming ? `${title} is out on ${when}.` : `${title} is out now.`
  const body = `Hi {{name}},\n\n${lead}${note}\n\nListen: https://sergikdropz.com/music\n\n— SERGIK`
  return { accountId, audienceId, subject, body }
}

export type MailContact = { email: string; name: string }

export function mailRecipientQuery(value: string): string {
  const parts = value.split(',')
  return (parts[parts.length - 1] || '').trim()
}

export function applyMailRecipient(value: string, email: string): string {
  const parts = value.split(',')
  parts[parts.length - 1] = email
  return `${parts.map((part) => part.trim()).filter(Boolean).join(', ')}, `
}

export function predictMailRecipients(contacts: MailContact[], value: string, limit = 8): MailContact[] {
  const query = mailRecipientQuery(value).toLowerCase()
  if (!query) return []
  const taken = new Set(
    value
      .split(',')
      .slice(0, -1)
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean),
  )
  const score = (contact: MailContact) => {
    const email = contact.email.toLowerCase()
    const name = contact.name.toLowerCase()
    if (email.startsWith(query) || name.startsWith(query)) return 2
    if (email.includes(query) || name.includes(query)) return 1
    return 0
  }
  return contacts
    .filter((contact) => contact.email && !taken.has(contact.email.toLowerCase()) && score(contact) > 0)
    .sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name) || a.email.localeCompare(b.email))
    .slice(0, limit)
}

export function personalizeBroadcast(text: string, name: string): string {
  const safe = name.trim() || 'there'
  return text.replace(/\{\{\s*name\s*\}\}/gi, safe)
}

export function deskTemplates(): DeskTemplate[] {
  const fromSnippets: DeskTemplate[] = MAIL_SNIPPETS.flatMap((snippet) =>
    snippet.accounts.map((accountId) => ({
      id: snippet.id,
      accountId,
      label: snippet.label,
      subject: snippet.subject,
      body: snippet.body,
    })),
  )
  return [...fromSnippets, ...EXTRA_TEMPLATES]
}

export type DeskMetricInput = {
  accountId: string
  folder: string
  status: string
}

export function deskMetrics(messages: DeskMetricInput[], accountId?: string | null) {
  const rows = messages.filter((message) => !accountId || accountId === 'all' || message.accountId === accountId)
  const byAccount = new Map<string, { sent: number; inbox: number; failed: number; scheduled: number }>()
  let sent = 0
  let inbox = 0
  let failed = 0
  let scheduled = 0
  for (const message of rows) {
    const bucket = byAccount.get(message.accountId) || { sent: 0, inbox: 0, failed: 0, scheduled: 0 }
    if (message.folder === 'sent') {
      sent += 1
      bucket.sent += 1
    }
    if (message.folder === 'inbox') {
      inbox += 1
      bucket.inbox += 1
    }
    if (message.folder === 'scheduled' || message.status === 'scheduled') {
      scheduled += 1
      bucket.scheduled += 1
    }
    if (message.status === 'failed' || message.status === 'bounced') {
      failed += 1
      bucket.failed += 1
    }
    byAccount.set(message.accountId, bucket)
  }
  return {
    total: rows.length,
    sent,
    inbox,
    failed,
    scheduled,
    byAccount: [...byAccount.entries()].map(([id, counts]) => ({ id, ...counts })),
  }
}

export function sliceBroadcast<T>(contacts: T[], skip: number): { batch: T[]; remaining: number } {
  const start = Number.isFinite(skip) && skip > 0 ? Math.floor(skip) : 0
  const batch = contacts.slice(start, start + BROADCAST_LIMIT)
  return { batch, remaining: Math.max(0, contacts.length - start - batch.length) }
}
