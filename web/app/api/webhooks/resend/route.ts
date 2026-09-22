import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { createSupabaseServerClient } from '@/lib/supabase'
import {
  collabStatusFromResendEvent,
  isMissingCollabTableError,
} from '@/lib/studio/release-collab'

export const dynamic = 'force-dynamic'

/**
 * Verify Resend/Svix-style signature when RESEND_WEBHOOK_SECRET is set.
 * Accepts either `whsec_…` (base64 after prefix) or raw HMAC secret.
 */
function verifyResendSignature(
  payload: string,
  headers: Headers,
  secret: string,
): boolean {
  const msgId = headers.get('svix-id') || headers.get('webhook-id')
  const timestamp = headers.get('svix-timestamp') || headers.get('webhook-timestamp')
  const signatureHeader =
    headers.get('svix-signature') || headers.get('webhook-signature') || ''
  if (!msgId || !timestamp || !signatureHeader) return false

  const ageSec = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (!Number.isFinite(ageSec) || ageSec > 60 * 5) return false

  let key = secret
  if (secret.startsWith('whsec_')) {
    key = Buffer.from(secret.slice(6), 'base64').toString('binary')
  }

  const signed = `${msgId}.${timestamp}.${payload}`
  const expected = createHmac('sha256', key).update(signed).digest('base64')
  const candidates = signatureHeader
    .split(' ')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (part.includes(',') ? part.split(',')[1] : part.replace(/^v1,/, '')))

  const expectedBuf = Buffer.from(expected)
  for (const candidate of candidates) {
    try {
      const got = Buffer.from(candidate)
      if (got.length === expectedBuf.length && timingSafeEqual(got, expectedBuf)) {
        return true
      }
    } catch {
      /* continue */
    }
  }
  return false
}

type ResendWebhookBody = {
  type?: string
  data?: {
    email_id?: string
    created_at?: string
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
      return NextResponse.json({ ok: true, skipped: 'table_missing' })
    }
    return NextResponse.json({ error: findError.message }, { status: 500 })
  }

  if (!existing) {
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
