import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import {
  CROWELOGIC_CHAT_ACCOUNT,
  CROWELOGIC_GPT61_BASE_URL,
  CROWELOGIC_GPT61_MODEL,
  crowelogicChatBlockReason,
  crowelogicChatHeaders,
  resolveCrowelogicEnv,
  crowelogicOpenAiUrl,
} from '@/lib/ai/crowelogic-env'
import { listModelsForAdminProvider } from '@/lib/ai/admin-provider-models'

export const dynamic = 'force-dynamic'

/** GET /api/admin/ai/crowelogic — status + live model probe for admin settings. */
export async function GET() {
  const session = await getServerSession()
  if (!session?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const env = resolveCrowelogicEnv()
  const models = await listModelsForAdminProvider('crowelogic')

  let chatProbe: { ok: boolean; message: string } | null = null
  if (env.configured) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 12_000)
      const res = await fetch(crowelogicOpenAiUrl(env.baseUrl, 'chat/completions'), {
        method: 'POST',
        headers: crowelogicChatHeaders(env.apiKey),
        signal: ctrl.signal,
        body: JSON.stringify({
          model: env.model,
          messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
          max_tokens: 8,
          temperature: 0,
          stream: false,
        }),
      })
      clearTimeout(t)
      const json = (await res.json().catch(() => ({}))) as {
        choices?: Array<{ message?: { content?: string } }>
        error?: { message?: string }
      }
      if (!res.ok) {
        chatProbe = { ok: false, message: json.error?.message || `HTTP ${res.status}` }
      } else {
        const text = json.choices?.[0]?.message?.content?.trim() || ''
        chatProbe = { ok: Boolean(text), message: text ? `Chat OK (${text.slice(0, 40)})` : 'Empty completion' }
      }
    } catch (e) {
      chatProbe = {
        ok: false,
        message: e instanceof Error ? e.message : 'Connection failed — is the Crowe bridge running?',
      }
    }
  }

  return NextResponse.json({
    configured: env.configured,
    credentialPresent: env.credentialPresent,
    activation: env.activation,
    account: CROWELOGIC_CHAT_ACCOUNT,
    blockReason: crowelogicChatBlockReason(env),
    baseUrl: env.baseUrl,
    baseSource: env.baseSource,
    keySource: env.keySource,
    model: env.model,
    models,
    chatProbe,
    setup: {
      envExample: [
        'CROWELOGIC_API_KEY=',
        `CROWELOGIC_BASE_URL=${CROWELOGIC_GPT61_BASE_URL}`,
        `CROWELOGIC_MODEL=${CROWELOGIC_GPT61_MODEL}`,
      ],
      notes: [
        'Uses the existing Crowe ID. The GPT-6.1 Sol gateway is live, but the first key was revoked and no replacement is stored.',
        'When a replacement key arrives, put it only in server env. Each chat request sends Idempotency-Key and stream:false. Balance is GET /v1/usage.',
        'Included allowance is 3,000 credits per period, 5 per request, through 2026-10-22. Requests stop at zero. No overage.',
        'CROWE_API_KEY is Crowe Creative (image and video) and does not enable this chat provider.',
      ],
    },
  })
}
