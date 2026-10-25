/** Outbound addresses on the SERGIK mail domain. Resend must have this domain verified. */

import { parseMailMessage } from '@/lib/email/promo-assets'

export const SERGIK_MAIL_DOMAIN = 'sergikdropz.com'

export const MAIL_DEPARTMENTS = {
  studio: {
    name: 'SERGIK Release Studio',
    localPart: 'release.studio',
    purpose: 'Release collab, contracts, and release-day reminders',
  },
  drops: {
    name: 'SERGIK Drops',
    localPart: 'drops',
    purpose: 'Private download invites and catalog shares',
  },
  fans: {
    name: 'SERGIK',
    localPart: 'hello',
    purpose: 'Fan welcome mail and list confirmations',
  },
  promo: {
    name: 'SERGIK Promo',
    localPart: 'promo',
    purpose: 'Campaigns and scheduled fan sequences',
  },
  bookings: {
    name: 'SERGIK Bookings',
    localPart: 'bookings',
    purpose: 'Shows, holds, and booking replies',
  },
  press: {
    name: 'SERGIK Press',
    localPart: 'press',
    purpose: 'Press, playlists, and radio',
  },
  shop: {
    name: 'SERGIK Shop',
    localPart: 'shop',
    purpose: 'Orders, licenses, and merch',
  },
  licensing: {
    name: 'SERGIK Licensing',
    localPart: 'licensing',
    purpose: 'Sync licenses, custom production, and quote mail',
  },
  support: {
    name: 'SERGIK Support',
    localPart: 'support',
    purpose: 'Account and site help',
  },
} as const

export type MailDepartmentId = keyof typeof MAIL_DEPARTMENTS

export type MailDepartment = {
  id: string
  name: string
  localPart: string
  purpose: string
  address: string
  from: string
  builtin: boolean
}

export type MailAccountDraft = {
  id: string
  name: string
  localPart: string
  purpose: string
}

export function mailDomain(): string {
  const raw = process.env.SERGIK_MAIL_DOMAIN?.trim() || SERGIK_MAIL_DOMAIN
  return raw.replace(/^@/, '').toLowerCase()
}

export function isMailDepartmentId(value: string): value is MailDepartmentId {
  return Object.prototype.hasOwnProperty.call(MAIL_DEPARTMENTS, value)
}

export function departmentAddress(id: MailDepartmentId): string {
  return `${MAIL_DEPARTMENTS[id].localPart}@${mailDomain()}`
}

export function departmentFromHeader(id: MailDepartmentId): string {
  return `${MAIL_DEPARTMENTS[id].name} <${departmentAddress(id)}>`
}

export function formatMailAccount(input: MailAccountDraft & { builtin?: boolean }): MailDepartment {
  const address = `${input.localPart}@${mailDomain()}`
  return {
    id: input.id,
    name: input.name,
    localPart: input.localPart,
    purpose: input.purpose,
    address,
    from: `${input.name} <${address}>`,
    builtin: Boolean(input.builtin),
  }
}

export function listMailDepartments(): MailDepartment[] {
  return (Object.keys(MAIL_DEPARTMENTS) as MailDepartmentId[]).map((id) =>
    formatMailAccount({
      id,
      name: MAIL_DEPARTMENTS[id].name,
      localPart: MAIL_DEPARTMENTS[id].localPart,
      purpose: MAIL_DEPARTMENTS[id].purpose,
      builtin: true,
    }),
  )
}

export function mergeMailAccounts(overrides: MailAccountDraft[]): MailDepartment[] {
  const merged = new Map(listMailDepartments().map((account) => [account.id, account]))
  for (const row of overrides) {
    merged.set(row.id, formatMailAccount({ ...row, builtin: isMailDepartmentId(row.id) }))
  }
  return [...merged.values()]
}

const LOCAL_PART_RE = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/

export function normalizeLocalPart(raw: string): string | null {
  const local = raw.trim().toLowerCase()
  if (!LOCAL_PART_RE.test(local) || local.includes('..')) return null
  return local
}

export function mailAccountIdFromLocalPart(localPart: string): string | null {
  const local = normalizeLocalPart(localPart)
  if (!local) return null
  const id = local
    .replace(/\./g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  if (!id || id.length > 40) return null
  return id
}

export function normalizeMailAccountFields(input: {
  name: unknown
  localPart: unknown
  purpose: unknown
}): { name: string; localPart: string; purpose: string } | null {
  if (typeof input.name !== 'string' || typeof input.localPart !== 'string') return null
  const name = input.name.trim().replace(/\s+/g, ' ')
  const localPart = normalizeLocalPart(input.localPart)
  const purpose = typeof input.purpose === 'string' ? input.purpose.trim().replace(/\s+/g, ' ') : ''
  if (!name || name.length > 80 || !localPart || purpose.length > 240) return null
  return { name, localPart, purpose }
}

const RECIPIENT_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function parseRecipientList(raw: unknown, max = 20): string[] | null {
  const chunks = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[,;\n]/) : null
  if (!chunks) return null
  const seen = new Set<string>()
  const out: string[] = []
  for (const chunk of chunks) {
    if (typeof chunk !== 'string') return null
    const email = chunk.trim().toLowerCase()
    if (!email) continue
    if (!RECIPIENT_RE.test(email) || email.length > 320) return null
    if (seen.has(email)) continue
    seen.add(email)
    out.push(email)
  }
  if (!out.length || out.length > max) return null
  return out
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Words the person wrote, with cover art and buttons turned into plain lines. */
export function departmentMailPlain(text: string): string {
  const { prose, blocks } = parseMailMessage(text)
  const parts: string[] = []
  if (prose) parts.push(prose)
  for (const block of blocks) {
    if (block.kind === 'cover') continue
    if (block.kind === 'link') {
      const label = block.label.trim()
      parts.push(label && label !== block.url ? `${label}\n${block.url}` : block.url)
      continue
    }
    if (block.text.trim()) parts.push(block.text.trim())
  }
  return parts.join('\n\n').trim()
}

export function departmentPlainTextHtml(_account: { name: string; address: string }, text: string): string {
  const plain = departmentMailPlain(text)
  const paragraphs = plain
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map(
      (part) =>
        `<p style="margin:0 0 14px;font-size:16px;line-height:1.5;color:#222222">${escapeHtml(part).replace(/\n/g, '<br>')}</p>`,
    )
    .join('')
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">${paragraphs}</body></html>`
}
