import { createSupabaseServerClient } from '@/lib/supabase'
import type { CollabEmailKind, ReleaseCollabEmailSend } from '@/lib/studio/release-collab'
import { isMissingCollabTableError } from '@/lib/studio/release-collab'

export async function recordCollabEmailSend(input: {
  releaseId: string
  collaboratorId?: string | null
  messageId?: string | null
  inviteId?: string | null
  resendId?: string | null
  toEmail: string
  subject: string
  kind: CollabEmailKind
  status?: ReleaseCollabEmailSend['status']
  errorMessage?: string | null
}): Promise<void> {
  const supabase = createSupabaseServerClient()
  const payload = {
    release_id: input.releaseId,
    collaborator_id: input.collaboratorId || null,
    message_id: input.messageId || null,
    invite_id: input.inviteId || null,
    resend_id: input.resendId || null,
    to_email: input.toEmail,
    subject: input.subject,
    kind: input.kind,
    status: input.status || (input.resendId ? 'sent' : 'failed'),
    error_message: input.errorMessage || null,
  }
  let { error } = await supabase.from('release_collab_email_sends').insert(payload)
  if (
    error &&
    /kind|check constraint|release_collab_email_sends_kind/i.test(error.message || '') &&
    input.kind !== 'other'
  ) {
    ;({ error } = await supabase.from('release_collab_email_sends').insert({
      ...payload,
      kind: 'other',
    }))
  }
  if (error && !isMissingCollabTableError(error)) {
    console.error('recordCollabEmailSend failed', error.message)
  }
}

export async function postCollabSystemMessage(input: {
  releaseId: string
  body: string
  emailSubject?: string | null
}): Promise<void> {
  const supabase = createSupabaseServerClient()
  const { error } = await supabase.from('release_collab_messages').insert({
    release_id: input.releaseId,
    author_type: 'studio',
    author_name: 'Release Studio',
    author_email: null,
    body: input.body,
    notify_email: false,
    channel: 'system',
    email_subject: input.emailSubject || null,
  })
  if (error && !isMissingCollabTableError(error)) {
    console.error('postCollabSystemMessage failed', error.message)
  }
}
