import { createSupabaseServerClient } from '@/lib/supabase'
import { sendEmail } from '@/lib/email'
import {
  buildReleaseCollabContext,
  collabContextForPortal,
  type ReleaseCollabContext,
} from '@/lib/studio/collab-context'
import {
  collabHubEmailHtml,
  collabHubEmailSubject,
  collabPromoExtraHtml,
} from '@/lib/studio/collab-email-compose'
import { recordCollabEmailSend } from '@/lib/studio/collab-email-log'
import { collabOutboundReplyTo } from '@/lib/studio/release-collab'
import { collabReviewChecklistPatch } from '@/lib/studio/collab-review-writeback'
import { getSingleReleaseCopyrightReadiness } from '@/lib/studio/copyright-pipeline'
import {
  COLLAB_TABLE_MISSING_HINT,
  RELEASE_COLLAB_FROM_EMAIL,
  RELEASE_COLLAB_FROM_NAME,
  collabInviteExpiresAt,
  collabPortalUrl,
  collabReviewInviteHtml,
  collabReviewInviteSubject,
  collabThreadNotifyHtml,
  collabThreadNotifySubject,
  createCollabInviteToken,
  isCollabInviteActive,
  isMissingCollabTableError,
  normalizeCollabEmail,
  parseCollabRole,
  type CollabEmailKind,
  type CollabReviewStatus,
  type ReleaseCollabEmailSend,
  type ReleaseCollabInvite,
  type ReleaseCollabMessage,
  type ReleaseCollabReview,
  type ReleaseCollaborator,
} from '@/lib/studio/release-collab'
import { resolveVaultPlaybackUrl } from '@/lib/audio/resolve-vault-playback-url'

const COLLAB_SELECT =
  'id,release_id,name,email,role,notes,created_at,updated_at'
const MESSAGE_SELECT_FULL =
  'id,release_id,collaborator_id,author_type,author_name,author_email,body,notify_email,channel,email_subject,created_at'
const MESSAGE_SELECT_LEGACY =
  'id,release_id,collaborator_id,author_type,author_name,author_email,body,notify_email,created_at'

function isMissingMessageColumnError(error: { message?: string } | null): boolean {
  const msg = String(error?.message || '')
  return /channel|email_subject|inbound_email_id/i.test(msg) && /column|schema cache/i.test(msg)
}
const INVITE_SELECT =
  'id,release_id,collaborator_id,token,expires_at,revoked_at,last_accessed_at,created_at'
const REVIEW_SELECT =
  'id,release_id,collaborator_id,invite_id,status,note,reviewed_at,created_at,updated_at'
const SEND_SELECT =
  'id,release_id,collaborator_id,message_id,invite_id,resend_id,to_email,subject,kind,status,delivered_at,opened_at,bounced_at,error_message,created_at'

export type CollabMissing = { code: 'COLLAB_TABLE_MISSING'; error: string }

function missing(): CollabMissing {
  return { code: 'COLLAB_TABLE_MISSING', error: COLLAB_TABLE_MISSING_HINT }
}

function mapCollaborator(row: Record<string, unknown>): ReleaseCollaborator {
  return {
    id: String(row.id),
    release_id: String(row.release_id),
    name: String(row.name || ''),
    email: String(row.email || '').toLowerCase(),
    role: parseCollabRole(row.role),
    notes: row.notes != null ? String(row.notes) : null,
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  }
}

function mapMessage(row: Record<string, unknown>): ReleaseCollabMessage {
  const channel = row.channel === 'inbound_email' || row.channel === 'system' ? row.channel : 'app'
  return {
    id: String(row.id),
    release_id: String(row.release_id),
    collaborator_id: row.collaborator_id ? String(row.collaborator_id) : null,
    author_type: row.author_type === 'collaborator' ? 'collaborator' : 'studio',
    author_name: String(row.author_name || ''),
    author_email: row.author_email ? String(row.author_email) : null,
    body: String(row.body || ''),
    notify_email: Boolean(row.notify_email),
    channel,
    email_subject: row.email_subject != null ? String(row.email_subject) : null,
    created_at: String(row.created_at || ''),
  }
}

function mapInvite(row: Record<string, unknown>): ReleaseCollabInvite {
  return {
    id: String(row.id),
    release_id: String(row.release_id),
    collaborator_id: String(row.collaborator_id),
    token: String(row.token),
    expires_at: String(row.expires_at),
    revoked_at: row.revoked_at ? String(row.revoked_at) : null,
    last_accessed_at: row.last_accessed_at ? String(row.last_accessed_at) : null,
    created_at: String(row.created_at || ''),
  }
}

function mapReview(row: Record<string, unknown>): ReleaseCollabReview {
  const status = String(row.status || 'pending') as CollabReviewStatus
  return {
    id: String(row.id),
    release_id: String(row.release_id),
    collaborator_id: String(row.collaborator_id),
    invite_id: row.invite_id ? String(row.invite_id) : null,
    status:
      status === 'approved' || status === 'changes_requested' ? status : 'pending',
    note: row.note != null ? String(row.note) : null,
    reviewed_at: row.reviewed_at ? String(row.reviewed_at) : null,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  }
}

function mapSend(row: Record<string, unknown>): ReleaseCollabEmailSend {
  return {
    id: String(row.id),
    release_id: String(row.release_id),
    collaborator_id: row.collaborator_id ? String(row.collaborator_id) : null,
    message_id: row.message_id ? String(row.message_id) : null,
    invite_id: row.invite_id ? String(row.invite_id) : null,
    resend_id: row.resend_id ? String(row.resend_id) : null,
    to_email: String(row.to_email || ''),
    subject: String(row.subject || ''),
    kind: (String(row.kind || 'other') as CollabEmailKind) || 'other',
    status: (String(row.status || 'sent') as ReleaseCollabEmailSend['status']) || 'sent',
    delivered_at: row.delivered_at ? String(row.delivered_at) : null,
    opened_at: row.opened_at ? String(row.opened_at) : null,
    bounced_at: row.bounced_at ? String(row.bounced_at) : null,
    error_message: row.error_message ? String(row.error_message) : null,
    created_at: String(row.created_at || ''),
  }
}

export async function listCollaborators(
  releaseId: string,
): Promise<{ collaborators: ReleaseCollaborator[] } | CollabMissing | { error: string }> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('release_collaborators')
    .select(COLLAB_SELECT)
    .eq('release_id', releaseId)
    .order('created_at', { ascending: true })
  if (error) {
    if (isMissingCollabTableError(error)) return missing()
    return { error: error.message }
  }
  return { collaborators: (data || []).map((row) => mapCollaborator(row as Record<string, unknown>)) }
}

export async function upsertCollaborator(input: {
  releaseId: string
  name: string
  email: string
  role?: string
  notes?: string | null
  id?: string
}): Promise<{ collaborator: ReleaseCollaborator } | CollabMissing | { error: string }> {
  const email = normalizeCollabEmail(input.email)
  const name = String(input.name || '').trim()
  if (!name) return { error: 'Name is required' }
  if (!email) return { error: 'Valid email is required' }

  const supabase = createSupabaseServerClient()
  const payload = {
    ...(input.id ? { id: input.id } : {}),
    release_id: input.releaseId,
    name,
    email,
    role: parseCollabRole(input.role),
    notes: input.notes != null ? String(input.notes).trim() || null : null,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('release_collaborators')
    .upsert(payload, { onConflict: 'release_id,email' })
    .select(COLLAB_SELECT)
    .single()

  if (error) {
    if (isMissingCollabTableError(error)) return missing()
    return { error: error.message }
  }
  return { collaborator: mapCollaborator(data as Record<string, unknown>) }
}

export async function deleteCollaborator(
  releaseId: string,
  collaboratorId: string,
): Promise<{ ok: true } | CollabMissing | { error: string }> {
  const supabase = createSupabaseServerClient()
  const { error } = await supabase
    .from('release_collaborators')
    .delete()
    .eq('id', collaboratorId)
    .eq('release_id', releaseId)
  if (error) {
    if (isMissingCollabTableError(error)) return missing()
    return { error: error.message }
  }
  return { ok: true }
}

export async function listMessages(
  releaseId: string,
): Promise<{ messages: ReleaseCollabMessage[] } | CollabMissing | { error: string }> {
  const supabase = createSupabaseServerClient()
  let data: Record<string, unknown>[] | null = null
  let error: { message?: string; code?: string } | null = null

  const full = await supabase
    .from('release_collab_messages')
    .select(MESSAGE_SELECT_FULL)
    .eq('release_id', releaseId)
    .order('created_at', { ascending: true })
  data = full.data as Record<string, unknown>[] | null
  error = full.error

  if (error && isMissingMessageColumnError(error)) {
    const legacy = await supabase
      .from('release_collab_messages')
      .select(MESSAGE_SELECT_LEGACY)
      .eq('release_id', releaseId)
      .order('created_at', { ascending: true })
    data = legacy.data as Record<string, unknown>[] | null
    error = legacy.error
  }

  if (error) {
    if (isMissingCollabTableError(error)) return missing()
    return { error: error.message || 'Failed to load messages' }
  }
  return { messages: (data || []).map((row) => mapMessage(row as Record<string, unknown>)) }
}

export async function listEmailSends(
  releaseId: string,
): Promise<{ sends: ReleaseCollabEmailSend[] } | CollabMissing | { error: string }> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('release_collab_email_sends')
    .select(SEND_SELECT)
    .eq('release_id', releaseId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) {
    if (isMissingCollabTableError(error)) return missing()
    return { error: error.message }
  }
  return { sends: (data || []).map((row) => mapSend(row as Record<string, unknown>)) }
}

export async function listReviews(
  releaseId: string,
): Promise<{ reviews: ReleaseCollabReview[] } | CollabMissing | { error: string }> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('release_collab_reviews')
    .select(REVIEW_SELECT)
    .eq('release_id', releaseId)
  if (error) {
    if (isMissingCollabTableError(error)) return missing()
    return { error: error.message }
  }
  return { reviews: (data || []).map((row) => mapReview(row as Record<string, unknown>)) }
}

async function activeInviteForCollaborator(
  releaseId: string,
  collaboratorId: string,
): Promise<ReleaseCollabInvite | null> {
  const supabase = createSupabaseServerClient()
  const { data } = await supabase
    .from('release_collab_invites')
    .select(INVITE_SELECT)
    .eq('release_id', releaseId)
    .eq('collaborator_id', collaboratorId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(5)
  const rows = (data || []).map((row) => mapInvite(row as Record<string, unknown>))
  return rows.find((row) => isCollabInviteActive(row)) || null
}

export async function postStudioMessage(input: {
  releaseId: string
  body: string
  authorName: string
  authorEmail?: string | null
  notify?: boolean
  siteOrigin?: string
}): Promise<
  | { message: ReleaseCollabMessage; notified: number }
  | CollabMissing
  | { error: string }
> {
  const body = String(input.body || '').trim()
  if (!body) return { error: 'Message body is required' }

  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('release_collab_messages')
    .insert({
      release_id: input.releaseId,
      author_type: 'studio',
      author_name: input.authorName.trim() || 'SERGIK',
      author_email: input.authorEmail || null,
      body,
      notify_email: Boolean(input.notify),
      channel: 'app',
    })
    .select(MESSAGE_SELECT_FULL)
    .single()

  if (error) {
    if (isMissingCollabTableError(error)) return missing()
    return { error: error.message }
  }

  const message = mapMessage(data as Record<string, unknown>)
  let notified = 0

  if (input.notify) {
    if (!process.env.RESEND_API_KEY) {
      return { error: 'RESEND_API_KEY is not configured — cannot notify by email.' }
    }

    const collabs = await listCollaborators(input.releaseId)
    if ('code' in collabs || 'error' in collabs) return collabs
    if (!collabs.collaborators.length) {
      return { error: 'Add collaborators before sending email notifications.' }
    }

    const { data: release } = await supabase
      .from('distribution_releases')
      .select('title')
      .eq('id', input.releaseId)
      .maybeSingle()
    const releaseTitle = String(release?.title || 'SERGIK release')

    for (const collab of collabs.collaborators) {
      const invite = await activeInviteForCollaborator(input.releaseId, collab.id)
      const portalUrl = invite ? collabPortalUrl(invite.token, input.siteOrigin) : undefined
      const subject = collabHubEmailSubject(releaseTitle, 'New message')
      try {
        const result = await sendEmail({
          to: collab.email,
          subject,
          html: collabThreadNotifyHtml({
            recipientName: collab.name,
            releaseTitle,
            authorName: message.author_name,
            body: message.body,
            portalUrl,
          }),
          from: `${RELEASE_COLLAB_FROM_NAME} <${RELEASE_COLLAB_FROM_EMAIL}>`,
          replyTo: collabOutboundReplyTo(input.releaseId),
          tags: [
            { name: 'type', value: 'release_collab' },
            { name: 'kind', value: 'thread_notify' },
            { name: 'release_id', value: input.releaseId.slice(0, 200) },
          ],
        })
        await recordCollabEmailSend({
          releaseId: input.releaseId,
          collaboratorId: collab.id,
          messageId: message.id,
          inviteId: invite?.id,
          resendId: result.messageId || null,
          toEmail: collab.email,
          subject,
          kind: 'thread_notify',
          status: 'sent',
        })
        notified += 1
      } catch (err) {
        await recordCollabEmailSend({
          releaseId: input.releaseId,
          collaboratorId: collab.id,
          messageId: message.id,
          toEmail: collab.email,
          subject,
          kind: 'thread_notify',
          status: 'failed',
          errorMessage: err instanceof Error ? err.message : 'Send failed',
        })
      }
    }
  }

  return { message, notified }
}

export async function sendCollabHubEmail(input: {
  releaseId: string
  body: string
  subject?: string
  authorName: string
  authorEmail?: string | null
  collaboratorIds?: string[]
  promoLinks?: Array<{ label: string; url: string }>
  siteOrigin?: string
}): Promise<
  | {
      message: ReleaseCollabMessage
      sent: number
      subject: string
      failures?: Array<{ email: string; message: string }>
    }
  | CollabMissing
  | { error: string; failures?: Array<{ email: string; message: string }> }
> {
  const body = String(input.body || '').trim()
  if (!body) return { error: 'Message body is required' }

  if (!process.env.RESEND_API_KEY?.trim()) {
    return {
      error:
        'RESEND_API_KEY is not configured. Add an active (uncommented) RESEND_API_KEY=re_... line in web/.env.local, then run: npm run dev:restart',
    }
  }

  const collabs = await listCollaborators(input.releaseId)
  if ('code' in collabs || 'error' in collabs) return collabs

  const idSet = new Set((input.collaboratorIds || []).map(String))
  const recipients = collabs.collaborators.filter((c) =>
    idSet.size ? idSet.has(c.id) : true,
  )
  if (!recipients.length) {
    return { error: 'Add collaborators or select who should receive this email.' }
  }

  const supabase = createSupabaseServerClient()
  const { data: release } = await supabase
    .from('distribution_releases')
    .select('title')
    .eq('id', input.releaseId)
    .maybeSingle()
  const releaseTitle = String(release?.title || 'SERGIK release')
  const subject = collabHubEmailSubject(releaseTitle, String(input.subject || 'Collaboration update'))

  let message: ReleaseCollabMessage

  const { data: inserted, error } = await supabase
    .from('release_collab_messages')
    .insert({
      release_id: input.releaseId,
      author_type: 'studio',
      author_name: input.authorName.trim() || 'SERGIK',
      author_email: input.authorEmail || null,
      body,
      notify_email: true,
      channel: 'app',
      email_subject: subject,
    })
    .select(MESSAGE_SELECT_FULL)
    .single()

  if (error) {
    if (isMissingMessageColumnError(error)) {
      const legacy = await supabase
        .from('release_collab_messages')
        .insert({
          release_id: input.releaseId,
          author_type: 'studio',
          author_name: input.authorName.trim() || 'SERGIK',
          author_email: input.authorEmail || null,
          body,
          notify_email: true,
        })
        .select(MESSAGE_SELECT_LEGACY)
        .single()
      if (legacy.error) {
        if (isMissingCollabTableError(legacy.error)) return missing()
        return { error: legacy.error.message }
      }
      message = mapMessage(legacy.data as Record<string, unknown>)
    } else {
      if (isMissingCollabTableError(error)) return missing()
      return { error: error.message }
    }
  } else {
    message = mapMessage(inserted as Record<string, unknown>)
  }

  let sent = 0
  const failures: Array<{ email: string; message: string }> = []

  for (const collab of recipients) {
    const invite = await activeInviteForCollaborator(input.releaseId, collab.id)
    const portalUrl = invite ? collabPortalUrl(invite.token, input.siteOrigin) : undefined
    const links = [...(input.promoLinks || [])]
    if (portalUrl) {
      links.push({ label: 'Review portal', url: portalUrl })
    }
    try {
      const result = await sendEmail({
        to: collab.email,
        subject,
        html: collabHubEmailHtml({
          recipientName: collab.name,
          releaseTitle,
          authorName: message.author_name,
          body: message.body,
          extraHtml: collabPromoExtraHtml(links),
        }),
        from: `${RELEASE_COLLAB_FROM_NAME} <${RELEASE_COLLAB_FROM_EMAIL}>`,
        replyTo: collabOutboundReplyTo(input.releaseId),
        tags: [
          { name: 'type', value: 'release_collab' },
          { name: 'kind', value: 'hub_email' },
          { name: 'release_id', value: input.releaseId.slice(0, 200) },
        ],
      })
      await recordCollabEmailSend({
        releaseId: input.releaseId,
        collaboratorId: collab.id,
        messageId: message.id,
        inviteId: invite?.id,
        resendId: result.messageId || null,
        toEmail: collab.email,
        subject,
        kind: 'hub_email',
        status: 'sent',
      })
      sent += 1
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Send failed'
      failures.push({ email: collab.email, message: errMsg })
      await recordCollabEmailSend({
        releaseId: input.releaseId,
        collaboratorId: collab.id,
        messageId: message.id,
        toEmail: collab.email,
        subject,
        kind: 'hub_email',
        status: 'failed',
        errorMessage: errMsg,
      })
    }
  }

  if (!sent) {
    const detail = failures[0]?.message
    return {
      error: detail
        ? `Email could not be sent: ${detail}`
        : 'Email could not be sent to any recipient.',
      failures,
    }
  }

  return { message, sent, subject, failures: failures.length ? failures : undefined }
}

export async function createReviewInvite(input: {
  releaseId: string
  collaboratorId: string
  note?: string
  createdBy?: string | null
  siteOrigin?: string
  daysValid?: number
}): Promise<
  | { invite: ReleaseCollabInvite; portalUrl: string; emailed: boolean }
  | CollabMissing
  | { error: string }
> {
  const supabase = createSupabaseServerClient()
  const { data: collab, error: collabError } = await supabase
    .from('release_collaborators')
    .select(COLLAB_SELECT)
    .eq('id', input.collaboratorId)
    .eq('release_id', input.releaseId)
    .maybeSingle()

  if (collabError) {
    if (isMissingCollabTableError(collabError)) return missing()
    return { error: collabError.message }
  }
  if (!collab) return { error: 'Collaborator not found' }

  const collaborator = mapCollaborator(collab as Record<string, unknown>)
  const token = createCollabInviteToken()
  const expiresAt = collabInviteExpiresAt(input.daysValid ?? 14)

  const { data: inviteRow, error } = await supabase
    .from('release_collab_invites')
    .insert({
      release_id: input.releaseId,
      collaborator_id: collaborator.id,
      token,
      expires_at: expiresAt,
      created_by: input.createdBy || null,
    })
    .select(INVITE_SELECT)
    .single()

  if (error) {
    if (isMissingCollabTableError(error)) return missing()
    return { error: error.message }
  }

  const invite = mapInvite(inviteRow as Record<string, unknown>)
  await supabase.from('release_collab_reviews').upsert(
    {
      release_id: input.releaseId,
      collaborator_id: collaborator.id,
      invite_id: invite.id,
      status: 'pending',
      note: null,
      reviewed_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'release_id,collaborator_id' },
  )

  const portalUrl = collabPortalUrl(token, input.siteOrigin)
  let emailed = false

  if (process.env.RESEND_API_KEY) {
    const { data: release } = await supabase
      .from('distribution_releases')
      .select('title')
      .eq('id', input.releaseId)
      .maybeSingle()
    const releaseTitle = String(release?.title || 'SERGIK release')
    const subject = collabReviewInviteSubject(releaseTitle)
    try {
      const result = await sendEmail({
        to: collaborator.email,
        subject,
        html: collabReviewInviteHtml({
          recipientName: collaborator.name,
          releaseTitle,
          portalUrl,
          note: input.note,
        }),
        from: `${RELEASE_COLLAB_FROM_NAME} <${RELEASE_COLLAB_FROM_EMAIL}>`,
        replyTo: collabOutboundReplyTo(input.releaseId),
        tags: [
          { name: 'type', value: 'release_collab' },
          { name: 'kind', value: 'review_invite' },
          { name: 'release_id', value: input.releaseId.slice(0, 200) },
        ],
      })
      await recordCollabEmailSend({
        releaseId: input.releaseId,
        collaboratorId: collaborator.id,
        inviteId: invite.id,
        resendId: result.messageId || null,
        toEmail: collaborator.email,
        subject,
        kind: 'review_invite',
        status: 'sent',
      })
      emailed = true
    } catch (err) {
      await recordCollabEmailSend({
        releaseId: input.releaseId,
        collaboratorId: collaborator.id,
        inviteId: invite.id,
        toEmail: collaborator.email,
        subject,
        kind: 'review_invite',
        status: 'failed',
        errorMessage: err instanceof Error ? err.message : 'Send failed',
      })
    }
  }

  return { invite, portalUrl, emailed }
}

export type CollabPortalTrack = {
  id: string
  title: string
  trackNumber: number | null
  duration: number | null
  artworkUrl: string | null
  playbackUrl: string | null
}

export type CollabPortalPayload = {
  release: {
    id: string
    title: string
    artworkUrl: string | null
    albumArtist: string | null
    releaseDate: string | null
  }
  collaborator: ReleaseCollaborator
  invite: ReleaseCollabInvite
  messages: ReleaseCollabMessage[]
  review: ReleaseCollabReview | null
  tracks: CollabPortalTrack[]
  context: ReturnType<typeof collabContextForPortal> | null
}

export async function resolveCollabPortal(
  token: string,
): Promise<CollabPortalPayload | CollabMissing | { error: string; status: number }> {
  const supabase = createSupabaseServerClient()
  const { data: inviteRow, error } = await supabase
    .from('release_collab_invites')
    .select(INVITE_SELECT)
    .eq('token', token)
    .maybeSingle()

  if (error) {
    if (isMissingCollabTableError(error)) return missing()
    return { error: error.message, status: 500 }
  }
  if (!inviteRow) return { error: 'Invite not found', status: 404 }

  const invite = mapInvite(inviteRow as Record<string, unknown>)
  if (!isCollabInviteActive(invite)) {
    return { error: 'This review link has expired or been revoked', status: 410 }
  }

  await supabase
    .from('release_collab_invites')
    .update({ last_accessed_at: new Date().toISOString() })
    .eq('id', invite.id)

  const { data: collab } = await supabase
    .from('release_collaborators')
    .select(COLLAB_SELECT)
    .eq('id', invite.collaborator_id)
    .maybeSingle()
  if (!collab) return { error: 'Collaborator not found', status: 404 }

  const { data: release } = await supabase
    .from('distribution_releases')
    .select('id,title,artwork_url,album_artist,release_date')
    .eq('id', invite.release_id)
    .maybeSingle()
  if (!release) return { error: 'Release not found', status: 404 }

  const messagesResult = await listMessages(invite.release_id)
  if ('code' in messagesResult) return messagesResult
  if ('error' in messagesResult) return { error: messagesResult.error, status: 500 }

  const { data: reviewRow } = await supabase
    .from('release_collab_reviews')
    .select(REVIEW_SELECT)
    .eq('release_id', invite.release_id)
    .eq('collaborator_id', invite.collaborator_id)
    .maybeSingle()

  const { data: trackRows } = await supabase
    .from('distribution_tracks')
    .select('id,title,track_number,duration,artwork_url,wav_url')
    .eq('release_id', invite.release_id)
    .order('track_number', { ascending: true })

  const tracks: CollabPortalTrack[] = await Promise.all(
    (trackRows || []).map(async (row) => {
      const wav = row.wav_url ? String(row.wav_url) : ''
      let playbackUrl: string | null = null
      if (wav) {
        try {
          const resolved = await resolveVaultPlaybackUrl(wav)
          playbackUrl = resolved?.url || wav
        } catch {
          playbackUrl = wav.startsWith('http') || wav.startsWith('/') ? wav : null
        }
      }
      return {
        id: String(row.id),
        title: String(row.title || 'Untitled'),
        trackNumber: row.track_number != null ? Number(row.track_number) : null,
        duration: row.duration != null ? Number(row.duration) : null,
        artworkUrl: row.artwork_url ? String(row.artwork_url) : null,
        playbackUrl,
      }
    }),
  )

  const replyTo = collabOutboundReplyTo(invite.release_id)
  const fullContext = await buildReleaseCollabContext(supabase, invite.release_id, {
    replyToAddress: replyTo,
  })

  return {
    release: {
      id: String(release.id),
      title: String(release.title || 'Untitled'),
      artworkUrl: release.artwork_url ? String(release.artwork_url) : null,
      albumArtist: release.album_artist ? String(release.album_artist) : null,
      releaseDate: release.release_date ? String(release.release_date) : null,
    },
    collaborator: mapCollaborator(collab as Record<string, unknown>),
    invite,
    messages: messagesResult.messages,
    review: reviewRow ? mapReview(reviewRow as Record<string, unknown>) : null,
    tracks,
    context: fullContext ? collabContextForPortal(fullContext) : null,
  }
}

export async function postCollaboratorMessage(input: {
  token: string
  body: string
}): Promise<{ message: ReleaseCollabMessage } | CollabMissing | { error: string; status: number }> {
  const portal = await resolveCollabPortal(input.token)
  if ('code' in portal) return portal
  if ('error' in portal && 'status' in portal) return portal

  const body = String(input.body || '').trim()
  if (!body) return { error: 'Message body is required', status: 400 }

  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('release_collab_messages')
    .insert({
      release_id: portal.release.id,
      collaborator_id: portal.collaborator.id,
      author_type: 'collaborator',
      author_name: portal.collaborator.name,
      author_email: portal.collaborator.email,
      body,
      notify_email: false,
      channel: 'app',
    })
    .select(MESSAGE_SELECT_FULL)
    .single()

  if (error) {
    if (isMissingCollabTableError(error)) return missing()
    return { error: error.message, status: 500 }
  }
  return { message: mapMessage(data as Record<string, unknown>) }
}

export async function submitCollabReview(input: {
  token: string
  status: 'approved' | 'changes_requested'
  note?: string
}): Promise<{ review: ReleaseCollabReview } | CollabMissing | { error: string; status: number }> {
  if (input.status !== 'approved' && input.status !== 'changes_requested') {
    return { error: 'status must be approved or changes_requested', status: 400 }
  }

  const portal = await resolveCollabPortal(input.token)
  if ('code' in portal) return portal
  if ('error' in portal && 'status' in portal) return portal

  const supabase = createSupabaseServerClient()
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('release_collab_reviews')
    .upsert(
      {
        release_id: portal.release.id,
        collaborator_id: portal.collaborator.id,
        invite_id: portal.invite.id,
        status: input.status,
        note: input.note != null ? String(input.note).trim() || null : null,
        reviewed_at: now,
        updated_at: now,
      },
      { onConflict: 'release_id,collaborator_id' },
    )
    .select(REVIEW_SELECT)
    .single()

  if (error) {
    if (isMissingCollabTableError(error)) return missing()
    return { error: error.message, status: 500 }
  }

  const statusLabel = input.status === 'approved' ? 'approved' : 'requested changes on'
  await supabase.from('release_collab_messages').insert({
    release_id: portal.release.id,
    collaborator_id: portal.collaborator.id,
    author_type: 'collaborator',
    author_name: portal.collaborator.name,
    author_email: portal.collaborator.email,
    body: input.note?.trim()
      ? `${portal.collaborator.name} ${statusLabel} this release: ${input.note.trim()}`
      : `${portal.collaborator.name} ${statusLabel} this release.`,
    notify_email: false,
    channel: 'app',
  })

  const review = mapReview(data as Record<string, unknown>)

  const collabsResult = await listCollaborators(portal.release.id)
  const reviewsResult = await listReviews(portal.release.id)
  if (
    input.status === 'approved' &&
    !('code' in collabsResult) &&
    !('error' in collabsResult) &&
    !('code' in reviewsResult) &&
    !('error' in reviewsResult)
  ) {
    const { data: trackRows } = await supabase
      .from('distribution_tracks')
      .select('id, title, splits, contributors')
      .eq('release_id', portal.release.id)
    const readiness = await getSingleReleaseCopyrightReadiness(supabase, portal.release.id)
    const patch = collabReviewChecklistPatch({
      collaborators: collabsResult.collaborators,
      reviews: reviewsResult.reviews.map((r) => ({
        collaborator_id: r.collaborator_id,
        status: r.status,
      })),
      ops: readiness?.ops ?? {
        split_sheet_status: 'missing',
        producer_agreement_status: 'missing',
        sample_clearance_status: 'missing',
      },
      tracks: trackRows || [],
    })
    if (patch) {
      await supabase
        .from('release_copyright_checklists')
        .upsert({ release_id: portal.release.id, ...patch }, { onConflict: 'release_id' })
      await supabase.from('release_collab_messages').insert({
        release_id: portal.release.id,
        author_type: 'studio',
        author_name: 'Release Studio',
        author_email: null,
        body: `All collaborator reviews approved — updated rights checklist (${Object.keys(patch).join(', ')}).`,
        notify_email: false,
        channel: 'system',
      })
    }
  }

  return { review }
}

export async function loadReleaseCollabContext(
  releaseId: string,
): Promise<ReleaseCollabContext | null | CollabMissing | { error: string }> {
  const supabase = createSupabaseServerClient()
  const ctx = await buildReleaseCollabContext(supabase, releaseId, {
    replyToAddress: collabOutboundReplyTo(releaseId),
  })
  return ctx
}

export async function getCollabOverview(): Promise<
  | {
      releases: Array<{
        id: string
        title: string
        artworkUrl: string | null
        releaseDate: string | null
        trackCount: number
        projectKind: 'single' | 'ep' | 'release'
        collaboratorCount: number
        messageCount: number
        pendingReviews: number
        lastMessageAt: string | null
        lastMessageAuthor: string | null
        lastMessagePreview: string | null
      }>
    }
  | CollabMissing
  | { error: string }
> {
  const supabase = createSupabaseServerClient()
  const { data: releases, error: relError } = await supabase
    .from('distribution_releases')
    .select('id,title,artwork_url,release_date,updated_at')
    .order('updated_at', { ascending: false })
    .limit(100)

  if (relError) return { error: relError.message }

  const { data: collabs, error: cError } = await supabase
    .from('release_collaborators')
    .select('release_id')
  if (cError) {
    if (isMissingCollabTableError(cError)) return missing()
    return { error: cError.message }
  }

  let messages: Array<Record<string, unknown>> | null = null
  const msgFull = await supabase
    .from('release_collab_messages')
    .select('release_id,created_at,author_name,body,author_type,channel')
    .order('created_at', { ascending: false })
    .limit(800)
  if (msgFull.error && isMissingMessageColumnError(msgFull.error)) {
    const legacy = await supabase
      .from('release_collab_messages')
      .select('release_id,created_at,author_name,body,author_type')
      .order('created_at', { ascending: false })
      .limit(800)
    messages = (legacy.data || []) as Array<Record<string, unknown>>
  } else {
    messages = (msgFull.data || []) as Array<Record<string, unknown>>
  }

  const { data: reviews } = await supabase
    .from('release_collab_reviews')
    .select('release_id,status')

  const collabCount = new Map<string, number>()
  for (const row of collabs || []) {
    const id = String(row.release_id)
    collabCount.set(id, (collabCount.get(id) || 0) + 1)
  }
  const messageCount = new Map<string, number>()
  const lastMessage = new Map<string, string>()
  const lastPreview = new Map<string, { author: string; preview: string }>()
  for (const row of messages || []) {
    const id = String(row.release_id)
    messageCount.set(id, (messageCount.get(id) || 0) + 1)
    if (!lastMessage.has(id) && row.created_at) {
      lastMessage.set(id, String(row.created_at))
      const rawBody = String(row.body || '').trim()
      lastPreview.set(id, {
        author: String(row.author_name || 'Unknown'),
        preview: rawBody.length > 120 ? `${rawBody.slice(0, 117)}…` : rawBody,
      })
    }
  }

  const { data: trackCounts } = await supabase
    .from('distribution_tracks')
    .select('release_id')
  const tracksPerRelease = new Map<string, number>()
  for (const row of trackCounts || []) {
    const id = String(row.release_id)
    tracksPerRelease.set(id, (tracksPerRelease.get(id) || 0) + 1)
  }
  const pending = new Map<string, number>()
  for (const row of reviews || []) {
    if (String(row.status) !== 'pending') continue
    const id = String(row.release_id)
    pending.set(id, (pending.get(id) || 0) + 1)
  }

  const mapped = (releases || []).map((r) => {
    const id = String(r.id)
    const trackCount = tracksPerRelease.get(id) || 0
    const preview = lastPreview.get(id)
    const projectKind: 'single' | 'ep' | 'release' =
      trackCount === 1 ? 'single' : trackCount > 1 ? 'ep' : 'release'
    return {
      id,
      title: String(r.title || 'Untitled'),
      artworkUrl: r.artwork_url ? String(r.artwork_url) : null,
      releaseDate: r.release_date ? String(r.release_date) : null,
      trackCount,
      projectKind,
      collaboratorCount: collabCount.get(id) || 0,
      messageCount: messageCount.get(id) || 0,
      pendingReviews: pending.get(id) || 0,
      lastMessageAt: lastMessage.get(id) || null,
      lastMessageAuthor: preview?.author || null,
      lastMessagePreview: preview?.preview || null,
    }
  })

  const withCollaborators = mapped.filter((r) => r.collaboratorCount > 0)

  withCollaborators.sort((a, b) => {
    const ta = a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0
    const tb = b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0
    if (ta !== tb) return tb - ta
    return a.title.localeCompare(b.title)
  })

  return { releases: withCollaborators }
}
