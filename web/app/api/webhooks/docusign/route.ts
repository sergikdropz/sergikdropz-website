import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { checkRateLimitAsync } from '@/lib/rate-limit'
import {
  DocuSignError,
  fetchContractEnvelope,
  persistEnvelopeUpdate,
  readDocuSignConfig,
  verifyDocuSignHmac,
} from '@/lib/studio/docusign'
import {
  isRightsPacketKind,
  parseConnectPayload,
  statusPatchForEnvelope,
  type DocuSignEnvelopeRecord,
} from '@/lib/studio/docusign-records'

export const dynamic = 'force-dynamic'

const RELEASE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,120}$/

/**
 * POST /api/webhooks/docusign
 * DocuSign Connect (JSON SIM). Status is confirmed with a live envelope fetch
 * before a packet is marked approved.
 */
export async function POST(request: NextRequest) {
  try {
    const config = readDocuSignConfig()
    if (!config) return NextResponse.json({ error: 'DocuSign is not configured' }, { status: 503 })

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const rl = await checkRateLimitAsync(`docusign-webhook:${ip}`, 60, 60_000)
    if (!rl.ok) return NextResponse.json({ error: 'Rate limit' }, { status: 429 })

    const raw = await request.text()
    if (config.connectHmac) {
      const signature = request.headers.get('x-docusign-signature-1')
      if (!verifyDocuSignHmac(raw, signature, config.connectHmac)) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
    }

    let parsed: unknown = {}
    try {
      parsed = raw ? JSON.parse(raw) : {}
    } catch {
      return NextResponse.json({ error: 'Expected JSON' }, { status: 400 })
    }
    const hint = parseConnectPayload(parsed)
    if (!hint.envelopeId) return NextResponse.json({ ok: true, ignored: true })

    const remote = await fetchContractEnvelope(config, hint.envelopeId)
    const releaseId = remote.releaseId || hint.releaseId
    const kind = remote.kind || hint.kind
    if (!releaseId || !RELEASE_ID_RE.test(releaseId) || !kind || !isRightsPacketKind(kind)) {
      return NextResponse.json({ ok: true, ignored: true })
    }

    const supabase = createSupabaseServerClient()
    const now = new Date().toISOString()
    const record: DocuSignEnvelopeRecord = {
      envelopeId: remote.envelopeId,
      kind,
      status: remote.status,
      recipients: [],
      sentAt: now,
      updatedAt: now,
    }
    await persistEnvelopeUpdate(supabase, {
      releaseId,
      record,
      statusPatch: remote.status === 'completed' ? statusPatchForEnvelope(kind, 'completed') : null,
    })
    return NextResponse.json({ ok: true, envelopeId: remote.envelopeId, status: remote.status })
  } catch (error) {
    if (error instanceof DocuSignError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'DocuSign webhook failed' },
      { status: 500 },
    )
  }
}
