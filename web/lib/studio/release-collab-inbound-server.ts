import { createSupabaseServerClient } from '@/lib/supabase'
import {
  normalizeCollabEmail,
  isMissingCollabTableError,
} from '@/lib/studio/release-collab'
import {
  parseReleaseIdFromInboundRecipients,
  stripInboundReplyBody,
} from '@/lib/studio/collab-inbound'

type InboundWebhookData = {
  email_id?: string
  from?: string
  to?: string | string[]
  subject?: string
  text?: string | null
  html?: string | null
  message_id?: string
}

async function fetchReceivingEmailBody(emailId: string): Promise<{ text: string; subject: string }> {
  const key = process.env.RESEND_API_KEY?.trim()
  if (!key) return { text: '', subject: '' }

  const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: 'no-store',
  })
  if (!res.ok) {
    return { text: '', subject: '' }
  }
  const json = (await res.json().catch(() => ({}))) as {
    text?: string
    html?: string
    subject?: string
  }
  const text =
    String(json.text || '').trim() ||
    String(json.html || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  return { text, subject: String(json.subject || '').trim() }
}

function parseFromAddress(raw: unknown): { email: string | null; name: string } {
  const text = String(raw || '').trim()
  if (!text) return { email: null, name: 'Collaborator' }
  const match = text.match(/^(.+?)<([^>]+)>$/)
  if (match) {
    return {
      name: match[1].replace(/"/g, '').trim() || 'Collaborator',
      email: normalizeCollabEmail(match[2]),
    }
  }
  const email = normalizeCollabEmail(text)
  return { email, name: email ? text.split('@')[0] : 'Collaborator' }
}

/**
 * Ingest a Resend `email.received` webhook into the release collab thread.
 */
export async function ingestCollabInboundEmail(
  data: InboundWebhookData,
): Promise<{ ok: true; releaseId: string; messageId: string } | { ok: false; reason: string }> {
  const inboundId = data.email_id ? String(data.email_id) : ''
  if (!inboundId) return { ok: false, reason: 'missing_email_id' }

  const releaseId = parseReleaseIdFromInboundRecipients(data.to)
  if (!releaseId) return { ok: false, reason: 'unmatched_recipient' }

  const supabase = createSupabaseServerClient()

  const { data: existing } = await supabase
    .from('release_collab_messages')
    .select('id')
    .eq('inbound_email_id', inboundId)
    .maybeSingle()
  if (existing?.id) {
    return { ok: true, releaseId, messageId: String(existing.id) }
  }

  const { data: release } = await supabase
    .from('distribution_releases')
    .select('id')
    .eq('id', releaseId)
    .maybeSingle()
  if (!release) return { ok: false, reason: 'release_not_found' }

  let bodyText = String(data.text || '').trim()
  let subject = String(data.subject || '').trim()
  if (!bodyText) {
    const fetched = await fetchReceivingEmailBody(inboundId)
    bodyText = fetched.text
    if (!subject) subject = fetched.subject
  }
  const body = stripInboundReplyBody(bodyText)
  if (!body) return { ok: false, reason: 'empty_body' }

  const from = parseFromAddress(data.from)
  if (!from.email) return { ok: false, reason: 'invalid_from' }

  const { data: collab } = await supabase
    .from('release_collaborators')
    .select('id, name, email')
    .eq('release_id', releaseId)
    .eq('email', from.email)
    .maybeSingle()

  const { data: inserted, error } = await supabase
    .from('release_collab_messages')
    .insert({
      release_id: releaseId,
      collaborator_id: collab?.id ? String(collab.id) : null,
      author_type: 'collaborator',
      author_name: collab?.name ? String(collab.name) : from.name,
      author_email: from.email,
      body,
      notify_email: false,
      channel: 'inbound_email',
      email_subject: subject || null,
      inbound_email_id: inboundId,
    })
    .select('id')
    .single()

  if (error) {
    if (isMissingCollabTableError(error)) return { ok: false, reason: 'table_missing' }
    return { ok: false, reason: error.message }
  }

  return { ok: true, releaseId, messageId: String(inserted.id) }
}
