import { createShareToken } from '@/lib/shares/types'
import { isValidPartyEmail, parsePartyContacts, type PartyContact } from '@/lib/studio/rights-contract-send'

/** Verified Resend from-address for Release Collab outbound mail. */
export const RELEASE_COLLAB_FROM_EMAIL = 'release.studio@sergikdropz.com'
export const RELEASE_COLLAB_FROM_NAME = 'SERGIK Release Studio'
export const RELEASE_COLLAB_REPLY_TO = RELEASE_COLLAB_FROM_EMAIL

export const COLLAB_ROLES = [
  'writer',
  'producer',
  'featured',
  'label',
  'manager',
  'collaborator',
  'other',
] as const

export type CollabRole = (typeof COLLAB_ROLES)[number]

export type ReleaseCollaborator = {
  id: string
  release_id: string
  name: string
  email: string
  role: CollabRole
  notes: string | null
  created_at?: string
  updated_at?: string
}

export type CollabAuthorType = 'studio' | 'collaborator'

export type ReleaseCollabMessage = {
  id: string
  release_id: string
  collaborator_id: string | null
  author_type: CollabAuthorType
  author_name: string
  author_email: string | null
  body: string
  notify_email: boolean
  created_at: string
}

export type CollabReviewStatus = 'pending' | 'approved' | 'changes_requested'

export type ReleaseCollabReview = {
  id: string
  release_id: string
  collaborator_id: string
  invite_id: string | null
  status: CollabReviewStatus
  note: string | null
  reviewed_at: string | null
  updated_at?: string
}

export type CollabEmailKind = 'thread_notify' | 'review_invite' | 'other'
export type CollabEmailStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'bounced'
  | 'complained'
  | 'failed'

export type ReleaseCollabEmailSend = {
  id: string
  release_id: string
  collaborator_id: string | null
  message_id: string | null
  invite_id: string | null
  resend_id: string | null
  to_email: string
  subject: string
  kind: CollabEmailKind
  status: CollabEmailStatus
  delivered_at: string | null
  opened_at: string | null
  bounced_at: string | null
  error_message: string | null
  created_at: string
}

export type ReleaseCollabInvite = {
  id: string
  release_id: string
  collaborator_id: string
  token: string
  expires_at: string
  revoked_at: string | null
  last_accessed_at: string | null
  created_at: string
}

function clean(value: unknown): string {
  return value == null ? '' : String(value).trim()
}

export function isCollabRole(value: string): value is CollabRole {
  return (COLLAB_ROLES as readonly string[]).includes(value)
}

export function parseCollabRole(value: unknown): CollabRole {
  const raw = clean(value).toLowerCase()
  return isCollabRole(raw) ? raw : 'collaborator'
}

export function normalizeCollabEmail(value: unknown): string | null {
  const email = clean(value).toLowerCase()
  if (!email || !isValidPartyEmail(email)) return null
  return email
}

export function createCollabInviteToken(): string {
  return createShareToken(24)
}

export function collabInviteExpiresAt(days = 14, now = Date.now()): string {
  return new Date(now + days * 24 * 60 * 60 * 1000).toISOString()
}

export function isCollabInviteActive(
  row: Pick<ReleaseCollabInvite, 'revoked_at' | 'expires_at'>,
  now = Date.now(),
): boolean {
  if (row.revoked_at) return false
  const exp = Date.parse(row.expires_at)
  if (Number.isFinite(exp) && exp <= now) return false
  return true
}

export function collabPortalPath(token: string): string {
  return `/collab/${encodeURIComponent(token)}`
}

export function collabPortalUrl(token: string, siteOrigin?: string): string {
  const path = collabPortalPath(token)
  const base = (siteOrigin || process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')
  return base ? `${base}${path}` : path
}

/** Seed collaborator drafts from Rights party_contacts (name + email only). */
export function collaboratorsFromPartyContacts(
  partyContacts: PartyContact[] | unknown,
): Array<{ name: string; email: string; role: CollabRole }> {
  return parsePartyContacts(partyContacts).map((row) => ({
    name: row.stage,
    email: row.email,
    role: 'collaborator' as CollabRole,
  }))
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function collabEmailShell(opts: {
  heading: string
  bodyHtml: string
  ctaUrl?: string
  ctaLabel?: string
}): string {
  const cta =
    opts.ctaUrl && opts.ctaLabel
      ? `<p style="margin:24px 0"><a href="${escapeHtml(opts.ctaUrl)}" style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:600">${escapeHtml(opts.ctaLabel)}</a></p>`
      : ''
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e4e4e7">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#a78bfa">SERGIK Release Studio</p>
    <h1 style="margin:0 0 16px;font-size:22px;color:#fff">${escapeHtml(opts.heading)}</h1>
    <div style="font-size:15px;line-height:1.6;color:#d4d4d8">${opts.bodyHtml}</div>
    ${cta}
    <p style="margin-top:32px;font-size:12px;color:#71717a">Reply to this email or use the review link. Sent via ${escapeHtml(RELEASE_COLLAB_FROM_EMAIL)}</p>
  </div>
</body></html>`
}

export function collabThreadNotifySubject(releaseTitle: string): string {
  return `New message — ${clean(releaseTitle) || 'SERGIK release'}`
}

export function collabThreadNotifyHtml(opts: {
  recipientName: string
  releaseTitle: string
  authorName: string
  body: string
  portalUrl?: string
}): string {
  const preview = escapeHtml(opts.body).replace(/\n/g, '<br/>')
  return collabEmailShell({
    heading: opts.releaseTitle || 'Release update',
    bodyHtml: `<p>Hi ${escapeHtml(opts.recipientName || 'there')},</p>
<p><strong>${escapeHtml(opts.authorName)}</strong> posted on <strong>${escapeHtml(opts.releaseTitle)}</strong>:</p>
<blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid #7c3aed;background:#18181b;color:#e4e4e7">${preview}</blockquote>`,
    ctaUrl: opts.portalUrl,
    ctaLabel: opts.portalUrl ? 'Open review portal' : undefined,
  })
}

export function collabReviewInviteSubject(releaseTitle: string): string {
  return `Please review — ${clean(releaseTitle) || 'SERGIK release'}`
}

export function collabReviewInviteHtml(opts: {
  recipientName: string
  releaseTitle: string
  portalUrl: string
  note?: string
}): string {
  const noteHtml = opts.note
    ? `<p>${escapeHtml(opts.note).replace(/\n/g, '<br/>')}</p>`
    : '<p>Listen to the tracks and approve or request changes.</p>'
  return collabEmailShell({
    heading: 'Review invite',
    bodyHtml: `<p>Hi ${escapeHtml(opts.recipientName || 'there')},</p>
<p>You're invited to review <strong>${escapeHtml(opts.releaseTitle)}</strong>.</p>${noteHtml}`,
    ctaUrl: opts.portalUrl,
    ctaLabel: 'Listen & review',
  })
}

/** Map Resend webhook event type → send status + timestamp field. */
export function collabStatusFromResendEvent(
  eventType: string,
): { status: CollabEmailStatus; stamp: 'delivered_at' | 'opened_at' | 'bounced_at' | null } | null {
  const t = clean(eventType).toLowerCase()
  if (t === 'email.delivered') return { status: 'delivered', stamp: 'delivered_at' }
  if (t === 'email.opened') return { status: 'opened', stamp: 'opened_at' }
  if (t === 'email.bounced' || t === 'email.failed') return { status: 'bounced', stamp: 'bounced_at' }
  if (t === 'email.complained') return { status: 'complained', stamp: null }
  if (t === 'email.sent') return { status: 'sent', stamp: null }
  return null
}

export function isMissingCollabTableError(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false
  if (error.code === 'PGRST205' || error.code === '42P01') return true
  const msg = String(error.message || '')
  return (
    /release_collaborators|release_collab_/i.test(msg) &&
    /does not exist|Could not find|schema cache/i.test(msg)
  )
}

export const COLLAB_TABLE_MISSING_HINT =
  'Release Collab tables are not set up yet. Apply migration add_release_collab.sql.'
