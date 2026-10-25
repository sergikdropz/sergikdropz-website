/**
 * Meta Business Agent Platform.
 * https://developers.facebook.com/documentation/meta-business-agent/quickstart
 *
 * Agent Test answers a message and does not put the agent in front of customers.
 * This module never sets rollout.enabled.
 */

export const META_BUSINESS_AGENT_VERSION = '2.0.0'

export type MetaBusinessAgentAction = 'status' | 'test' | 'onboard'

export type MetaBusinessAgentResult = {
  ok: boolean
  action: MetaBusinessAgentAction
  note: string
  eligible: boolean | null
  agentResponse: string | null
  conversationId: string | null
  messageId: string | null
  agentId: string | null
  canOnboard: boolean
  httpStatus: number | null
}

export function isMetaBusinessAgentIntent(message: string): boolean {
  return /meta business (assistant|agent)|business assistant chat|query_meta_business_agent/i.test(message)
}

export function metaBusinessAgentEntityId(explicit?: string | null, igUserId?: string | null): string | null {
  const fromEnv = (process.env.META_WHATSAPP_PHONE_NUMBER_ID || '').trim()
  const raw = (explicit || fromEnv || igUserId || '').trim()
  if (!/^[A-Za-z0-9._]{2,64}$/.test(raw)) return null
  return raw
}

export function metaBusinessAgentFailureNote(status: number, detail: string): string {
  if (status === 401) {
    return 'The saved Meta token cannot call Business Agent. The app needs whatsapp_business_messaging on a system-user token. The Page and Instagram scopes already connected do not include it.'
  }
  if (status === 403) {
    return 'WhatsApp Manager has not accepted the Meta Business Agent terms. Accept them under WhatsApp Manager, then ask again. This desk does not turn the agent on for customers.'
  }
  if (status === 404) {
    return 'No Meta Business Agent exists on this id yet. Create it after the terms are accepted. Creating it still leaves customer chat off.'
  }
  if (status === 400) {
    return (
      detail ||
      'Meta rejected the id. Set META_WHATSAPP_PHONE_NUMBER_ID to the phone number id in WhatsApp Manager.'
    )
  }
  if (status === 429) {
    return 'Meta’s hourly test-message limit is full. Wait, then ask again.'
  }
  return detail || `Meta Business Agent request failed (${status}).`
}

export function parseMetaBusinessAgentPayload(body: unknown): {
  detail: string
  agentResponse: string | null
  conversationId: string | null
  messageId: string | null
  agentId: string | null
  eligible: boolean | null
} {
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const error = record.error && typeof record.error === 'object' ? (record.error as Record<string, unknown>) : null
  const detail =
    (typeof record.detail === 'string' && record.detail) ||
    (error && typeof error.message === 'string' && error.message) ||
    (typeof record.title === 'string' && record.title) ||
    ''
  return {
    detail: detail.replace(/bearer\s+\S+/gi, 'bearer [redacted]').slice(0, 500),
    agentResponse: typeof record.agent_response === 'string' ? record.agent_response : null,
    conversationId: typeof record.conversation_id === 'string' ? record.conversation_id : null,
    messageId: typeof record.message_id === 'string' ? record.message_id : null,
    agentId: typeof record.agent_id === 'string' ? record.agent_id : null,
    eligible: typeof record.is_eligible === 'boolean' ? record.is_eligible : null,
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export async function callMetaBusinessAgent(input: {
  token: string
  entityId: string
  action: MetaBusinessAgentAction
  message?: string
  conversationId?: string
  fetchImpl?: FetchLike
}): Promise<MetaBusinessAgentResult> {
  const fetchImpl = input.fetchImpl || fetch
  const path =
    input.action === 'status' ? 'agent_eligibility' : input.action === 'onboard' ? 'agent_onboarding' : 'agent_test'
  const url = `https://api.facebook.com/${encodeURIComponent(input.entityId)}/${path}`
  const headers: Record<string, string> = {
    Authorization: `Bearer ${input.token}`,
    'X-API-Version': META_BUSINESS_AGENT_VERSION,
  }
  let response: Response
  if (input.action === 'status') {
    response = await fetchImpl(url, { headers, cache: 'no-store' })
  } else {
    headers['Content-Type'] = 'application/json'
    const payload =
      input.action === 'onboard'
        ? {}
        : {
            user_msg: (input.message || '').trim(),
            ...(input.conversationId ? { conversation_id: input.conversationId } : {}),
          }
    response = await fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      cache: 'no-store',
    })
  }
  const json = (await response.json().catch(() => ({}))) as unknown
  const parsed = parseMetaBusinessAgentPayload(json)
  if (!response.ok) {
    return {
      ok: false,
      action: input.action,
      note: metaBusinessAgentFailureNote(response.status, parsed.detail),
      eligible: parsed.eligible,
      agentResponse: null,
      conversationId: parsed.conversationId,
      messageId: null,
      agentId: null,
      canOnboard: response.status === 404,
      httpStatus: response.status,
    }
  }
  if (input.action === 'status') {
    const eligible = parsed.eligible === true
    return {
      ok: true,
      action: 'status',
      note: eligible
        ? 'This id can run a Meta Business Agent. Customer chat stays off until WhatsApp Manager enables it.'
        : 'Meta says this id cannot run a Business Agent.',
      eligible,
      agentResponse: null,
      conversationId: null,
      messageId: null,
      agentId: null,
      canOnboard: false,
      httpStatus: response.status,
    }
  }
  if (input.action === 'onboard') {
    return {
      ok: true,
      action: 'onboard',
      note: 'Meta created the agent. Customer chat stays off. Ask a test question to hear it.',
      eligible: null,
      agentResponse: null,
      conversationId: null,
      messageId: null,
      agentId: parsed.agentId,
      canOnboard: false,
      httpStatus: response.status,
    }
  }
  return {
    ok: true,
    action: 'test',
    note: parsed.agentResponse
      ? 'Meta Business Agent replied in a test conversation. Customers on WhatsApp do not see this.'
      : 'Meta accepted the test message and returned no reply text.',
    eligible: null,
    agentResponse: parsed.agentResponse,
    conversationId: parsed.conversationId,
    messageId: parsed.messageId,
    agentId: null,
    canOnboard: false,
    httpStatus: response.status,
  }
}
