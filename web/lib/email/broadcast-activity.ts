import { createSupabaseServerClient } from '@/lib/supabase'
import { isMissingDepartmentMailTable } from '@/lib/email/department-mailbox-store'
import {
  extractEmailAddresses,
  matchDepartmentRecipient,
  type DepartmentMailMessage,
} from '@/lib/email/department-mailbox'
import { listResolvedMailAccounts } from '@/lib/email/mail-accounts'

export const BROADCAST_ACTIVITY_PREFIX = 'broadcast-activity:'

export const BROADCAST_INTERACTIONS = ['opened', 'clicked', 'bounced', 'complained', 'unsubscribed'] as const

export type BroadcastInteractionKind = (typeof BROADCAST_INTERACTIONS)[number]

const KIND_RANK: Record<BroadcastInteractionKind, number> = {
  opened: 1,
  clicked: 2,
  unsubscribed: 3,
  bounced: 4,
  complained: 5,
}

const KIND_VERB: Record<BroadcastInteractionKind, string> = {
  opened: 'opened',
  clicked: 'clicked',
  bounced: 'bounced',
  complained: 'reported',
  unsubscribed: 'unsubscribed from',
}

export type CampaignActivityRow = {
  id: string
  email: string
  name: string
  subject: string
  status: string
  openedAt: string | null
  clickedAt: string | null
  at: string
}

export type UnsubscribeActivityRow = {
  id: string
  email: string
  name: string
  at: string
}

export function isBroadcastActivityId(id: string): boolean {
  return id.startsWith(BROADCAST_ACTIVITY_PREFIX)
}

export function interactionKindFromResendEvent(eventType: string): BroadcastInteractionKind | null {
  const type = eventType.trim().toLowerCase()
  if (type === 'email.opened') return 'opened'
  if (type === 'email.clicked') return 'clicked'
  if (type === 'email.bounced') return 'bounced'
  if (type === 'email.complained') return 'complained'
  return null
}

export function hasBroadcastSourceTag(tags: unknown): boolean {
  if (Array.isArray(tags)) {
    return tags.some((tag) => {
      if (!tag || typeof tag !== 'object') return false
      const row = tag as { name?: unknown; value?: unknown }
      return String(row.name || '') === 'source' && String(row.value || '') === 'broadcast'
    })
  }
  if (tags && typeof tags === 'object') {
    return String((tags as { source?: unknown }).source || '') === 'broadcast'
  }
  return false
}

function kindForSend(row: CampaignActivityRow): BroadcastInteractionKind | null {
  const status = row.status.trim().toLowerCase()
  if (status === 'complained') return 'complained'
  if (status === 'bounced') return 'bounced'
  if (row.clickedAt || status === 'clicked') return 'clicked'
  if (row.openedAt || status === 'opened') return 'opened'
  return null
}

function activityMessage(input: {
  id: string
  accountId: string
  email: string
  name: string
  subject: string
  kind: BroadcastInteractionKind
  at: string
  detail?: string
}): DepartmentMailMessage {
  const who = input.name.trim() || input.email
  const title = input.subject.trim() || 'a broadcast'
  const verb = KIND_VERB[input.kind]
  const label = input.kind[0].toUpperCase() + input.kind.slice(1)
  return {
    id: `${BROADCAST_ACTIVITY_PREFIX}${input.id}`,
    accountId: input.accountId,
    folder: 'inbox',
    direction: 'in',
    fromAddress: input.email.trim().toLowerCase(),
    fromName: input.name.trim() || input.email.trim(),
    to: '',
    subject: `${label} · ${title}`.slice(0, 200),
    body: `${who} ${verb} “${title}”.${input.detail ? ` ${input.detail}` : ''}`,
    status: input.kind,
    unread: true,
    resendId: null,
    inboundId: null,
    scheduledAt: null,
    errorMessage: null,
    attachments: [],
    createdAt: input.at,
    updatedAt: input.at,
  }
}

export function broadcastActivityMessages(input: {
  sends: CampaignActivityRow[]
  unsubscribes: UnsubscribeActivityRow[]
}): DepartmentMailMessage[] {
  const messages: DepartmentMailMessage[] = []
  for (const row of input.sends) {
    const kind = kindForSend(row)
    const email = row.email.trim().toLowerCase()
    if (!kind || !email) continue
    const at = row.clickedAt || row.openedAt || row.at
    messages.push(
      activityMessage({
        id: `campaign:${row.id}:${kind}`,
        accountId: 'promo',
        email,
        name: row.name,
        subject: row.subject,
        kind,
        at: at || new Date(0).toISOString(),
      }),
    )
  }
  for (const row of input.unsubscribes) {
    const email = row.email.trim().toLowerCase()
    if (!email) continue
    messages.push(
      activityMessage({
        id: `unsubscribe:${row.id}`,
        accountId: 'fans',
        email,
        name: row.name,
        subject: 'list mail',
        kind: 'unsubscribed',
        at: row.at || new Date(0).toISOString(),
      }),
    )
  }
  messages.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || KIND_RANK[b.status as BroadcastInteractionKind] - KIND_RANK[a.status as BroadcastInteractionKind])
  return messages
}

function activityIdentity(message: DepartmentMailMessage): string {
  return `${message.fromAddress.trim().toLowerCase()}|${message.status}|${message.subject.trim().toLowerCase()}`
}

export function mergeBroadcastActivity(
  messages: DepartmentMailMessage[],
  activity: DepartmentMailMessage[],
): DepartmentMailMessage[] {
  const seen = new Set(messages.map(activityIdentity))
  const extra = activity.filter((item) => {
    const key = activityIdentity(item)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return [...messages, ...extra]
}

export async function loadBroadcastActivity(): Promise<DepartmentMailMessage[]> {
  const supabase = createSupabaseServerClient()
  const sendsQuery = await supabase
    .from('campaign_sends')
    .select('id, to_email, to_name, rendered_subject, status, opened_at, clicked_at, updated_at, sent_at')
    .order('updated_at', { ascending: false })
    .limit(200)
  const sends: CampaignActivityRow[] = []
  if (!sendsQuery.error && Array.isArray(sendsQuery.data)) {
    for (const row of sendsQuery.data) {
      const record = row as Record<string, unknown>
      sends.push({
        id: String(record.id || ''),
        email: String(record.to_email || ''),
        name: String(record.to_name || ''),
        subject: String(record.rendered_subject || ''),
        status: String(record.status || ''),
        openedAt: record.opened_at ? String(record.opened_at) : null,
        clickedAt: record.clicked_at ? String(record.clicked_at) : null,
        at: String(record.updated_at || record.sent_at || ''),
      })
    }
  }

  const unsubQuery = await supabase
    .from('email_subscribers')
    .select('id, email, name, updated_at')
    .eq('is_active', false)
    .order('updated_at', { ascending: false })
    .limit(100)
  const unsubscribes: UnsubscribeActivityRow[] = []
  if (!unsubQuery.error && Array.isArray(unsubQuery.data)) {
    for (const row of unsubQuery.data) {
      const record = row as Record<string, unknown>
      unsubscribes.push({
        id: String(record.id || ''),
        email: String(record.email || ''),
        name: String(record.name || ''),
        at: String(record.updated_at || ''),
      })
    }
  }

  return broadcastActivityMessages({ sends, unsubscribes })
}

export async function recordBroadcastInteraction(
  eventType: string,
  data: {
    email_id?: unknown
    from?: unknown
    to?: unknown
    subject?: unknown
    tags?: unknown
    click?: unknown
  },
): Promise<boolean> {
  const kind = interactionKindFromResendEvent(eventType)
  const emailId = data.email_id ? String(data.email_id) : ''
  if (!kind || !emailId) return false

  const supabase = createSupabaseServerClient()
  let broadcast = hasBroadcastSourceTag(data.tags)
  if (!broadcast) {
    const match = await supabase.from('campaign_sends').select('id').eq('message_id', emailId).maybeSingle()
    broadcast = !match.error && Boolean(match.data?.id)
  }
  if (!broadcast) return false

  const people = extractEmailAddresses(data.to)
  const email = people[0] || ''
  if (!email) return false
  const accounts = await listResolvedMailAccounts()
  const account = matchDepartmentRecipient(data.from, accounts)
  const subject = String(data.subject || '').trim()
  const clickLink =
    data.click && typeof data.click === 'object' && 'link' in data.click ? String((data.click as { link?: unknown }).link || '') : ''
  const now = new Date().toISOString()
  const notice = activityMessage({
    id: `${emailId}:${kind}`,
    accountId: account?.id || 'promo',
    email,
    name: '',
    subject,
    kind,
    at: now,
    detail: clickLink ? `Link: ${clickLink}` : undefined,
  })
  const inboundId = `broadcast:${emailId}:${kind}`
  const { error } = await supabase.from('department_mail_messages').insert({
    account_id: notice.accountId,
    folder: 'inbox',
    direction: 'in',
    from_address: notice.fromAddress,
    from_name: notice.fromName,
    to_addresses: account?.address || '',
    subject: notice.subject,
    body: notice.body,
    status: kind,
    unread: true,
    inbound_id: inboundId,
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
