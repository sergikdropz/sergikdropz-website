import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import {
  CROWELOGIC_CHAT_ACCOUNT,
  crowelogicChatBlockReason,
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
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.apiKey}`,
        },
        signal: ctrl.signal,
        body: JSON.stringify({
          model: env.model,
          messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
          max_tokens: 8,
          temperature: 0,
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
        'CROWELOGIC_API_KEY=customer-credential',
        'CROWELOGIC_BASE_URL=http://127.0.0.1:8011',
        'CROWELOGIC_MODEL=auto',
        '# Hosted Pro gateway, only after Crowe confirms linkage and the usage cap:',
        '# CROWELOGIC_BASE_URL=https://gateway.example/v1',
        '# CROWELOGIC_PRO_LINKED=1',
      ],
      notes: [
        'Uses the existing Crowe ID. No second account. The value in CROWELOGIC_API_KEY is a customer credential, stored only on the server.',
        'Hosted usage is metered by Crowe against the existing Pro allowance. Chat stays off until CROWELOGIC_PRO_LINKED=1.',
        'CROWE_API_KEY is Crowe Creative (image and video) and does not enable this chat provider.',
        'Local bridge on 127.0.0.1:8011 can be tested without the Pro flag. It is not the Pro bill.',
      ],
    },
  })
}
