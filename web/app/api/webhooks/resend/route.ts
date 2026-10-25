import { NextRequest, NextResponse } from 'next/server'
import { verifyResendSignature } from '@/lib/email/resend-webhook-signature'
import { createSupabaseServerClient } from '@/lib/supabase'
import {
  collabStatusFromResendEvent,
  isMissingCollabTableError,
  isResendInboundReceivedEvent,
} from '@/lib/studio/release-collab'
import { ingestCollabInboundEmail } from '@/lib/studio/release-collab-inbound-server'
import { recordBroadcastInteraction } from '@/lib/email/broadcast-activity'
import { recordDepartmentInbound, stampDepartmentMailDelivery } from '@/lib/email/department-mailbox-store'
import { fileReleaseReplyInStudioMailbox } from '@/lib/studio/contract-mailbox'

export const dynamic = 'force-dynamic'

type ResendWebhookBody = {
  type?: string
  data?: {
    email_id?: string
    created_at?: string
    from?: string
    to?: string | string[]
    subject?: string
    text?: string | null
    html?: string | null
    [key: string]: unknown
  }
}

/**
 * POST /api/webhooks/resend
 * Updates release_collab_email_sends delivery / open / bounce status.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text()
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim()

  if (secret) {
    if (!verifyResendSignature(raw, request.headers, secret)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
  } else if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'RESEND_WEBHOOK_SECRET is required in production' },
      { status: 503 },
    )
  }

  let body: ResendWebhookBody
  try {
    body = JSON.parse(raw) as ResendWebhookBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const eventType = String(body.type || '')

  try {
    await recordBroadcastInteraction(eventType, body.data || {})
  } catch (error) {
    console.error('broadcast interaction:', error)
  }

  if (isResendInboundReceivedEvent(eventType)) {
    const inbound = await ingestCollabInboundEmail(body.data || {})
    if (inbound.ok) {
      try {
        await fileReleaseReplyInStudioMailbox(body.data || {}, inbound.releaseId)
      } catch (error) {
        console.error('studio contract inbox:', error)
      }
      return NextResponse.json({
        ok: true,
        inbound: true,
        department: true,
        releaseId: inbound.releaseId,
        messageId: inbound.messageId,
      })
    }
    if (inbound.reason === 'unmatched_recipient' || inbound.reason === 'release_not_found') {
      try {
        const stored = await recordDepartmentInbound(body.data || {})
        if (stored) return NextResponse.json({ ok: true, inbound: true, department: true })
      } catch (error) {
        console.error('department inbound mail:', error)
      }
    }
    return NextResponse.json({ ok: true, inbound: false, reason: inbound.reason })
  }

  const mapped = collabStatusFromResendEvent(eventType)
  const resendId = body.data?.email_id ? String(body.data.email_id) : ''

  if (!mapped || !resendId) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  const supabase = createSupabaseServerClient()
  const { data: existing, error: findError } = await supabase
    .from('release_collab_email_sends')
    .select('id,status,events')
    .eq('resend_id', resendId)
    .maybeSingle()

  if (findError) {
    if (isMissingCollabTableError(findError)) {
      try {
        await stampDepartmentMailDelivery(resendId, mapped.status)
      } catch (error) {
        console.error('department mail status:', error)
      }
      return NextResponse.json({ ok: true, skipped: 'table_missing' })
    }
    return NextResponse.json({ error: findError.message }, { status: 500 })
  }

  if (!existing) {
    try {
      await stampDepartmentMailDelivery(resendId, mapped.status)
    } catch (error) {
      console.error('department mail status:', error)
    }
    return NextResponse.json({ ok: true, unmatched: true })
  }

  const now = new Date().toISOString()
  const events = Array.isArray(existing.events) ? [...existing.events] : []
  events.push({ type: eventType, at: now, data: body.data || null })

  const patch: Record<string, unknown> = {
    status: mapped.status,
    events,
    updated_at: now,
  }
  if (mapped.stamp) patch[mapped.stamp] = now

  // Don't downgrade opened → delivered
  const rank: Record<string, number> = {
    queued: 0,
    sent: 1,
    delivered: 2,
    opened: 3,
    bounced: 4,
    complained: 4,
    failed: 4,
  }
  const prev = String(existing.status || 'sent')
  if ((rank[mapped.status] ?? 0) < (rank[prev] ?? 0) && mapped.status !== 'bounced') {
    delete patch.status
  }

  const { error: updateError } = await supabase
    .from('release_collab_email_sends')
    .update(patch)
    .eq('id', existing.id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, id: existing.id, status: mapped.status })
}
