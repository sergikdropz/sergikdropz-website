/**
 * CroweLM admin chat (OpenAI-compatible /v1/chat/completions, server-side only).
 *
 * Identity: the existing Crowe ID. No second Crowe account.
 * Credential: a deployment-only customer credential in server env. Never a password, never sent to the browser.
 * Live gateway: https://gpt61.crowelogic.com/v1 model gpt-6.1-sol. Non-streaming. 5 credits per request.
 * Billing: $99/month Pro. 3,000 credits per period, resets 2026-10-22. Requests stop at zero. No overage.
 * The first issued key was revoked before it was stored here. Chat stays off until a replacement key is set.
 * Crowe Creative (`CROWE_API_KEY`, api.crowelogic.com) is a separate media API.
 */
import { createHash, randomUUID } from 'crypto'

export const CROWELOGIC_CHAT_ACCOUNT = {
  identity: 'existing_crowe_id',
  billing: 'pro_allowance_via_gateway',
  separateAccount: false,
  credential: 'customer_credential',
  transport: 'server_openai_chat_completions',
  usageCapEnforcedBy: 'crowe_gateway',
} as const

export type CrowelogicActivation = 'off' | 'local_bridge' | 'pending_pro_linkage' | 'pro_gateway'

export type CrowelogicEnv = {
  baseUrl: string
  apiKey: string
  model: string
  /** Chat may be called. False while hosted Pro linkage is still unconfirmed. */
  configured: boolean
  /** Customer credential is present, even when chat is still off. */
  credentialPresent: boolean
  activation: CrowelogicActivation
  /** Which env var supplied the key (for admin UI, never the secret). */
  keySource: string | null
  baseSource: string | null
  /** True when the only configured credential is the revoked handoff key. */
  revokedCredential: boolean
}

const DEFAULT_LOCAL_BRIDGE = 'http://127.0.0.1:8011'
const DEFAULT_MODEL = 'auto'
export const CROWELOGIC_GPT61_BASE_URL = 'https://gpt61.crowelogic.com/v1'
export const CROWELOGIC_GPT61_MODEL = 'gpt-6.1-sol'
/** SHA-256 of the handoff key Crowe revoked on 2026-10-08. The raw key is not stored. */
const REVOKED_CROWELOGIC_KEY_SHA256 = 'f241505990e1724f27312bc546bcda23000de2a312ed147afbb2a8408680d2ac'

export function isRevokedCrowelogicKey(apiKey: string): boolean {
  const trimmed = apiKey.trim()
  if (!trimmed) return false
  return createHash('sha256').update(trimmed).digest('hex') === REVOKED_CROWELOGIC_KEY_SHA256
}

export function crowelogicChatHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'Idempotency-Key': randomUUID(),
  }
}

function isGpt61Gateway(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).hostname === 'gpt61.crowelogic.com'
  } catch {
    return false
  }
}

function firstTrimmed(...values: Array<string | undefined>): string {
  for (const value of values) {
    const t = value?.trim()
    if (t) return t
  }
  return ''
}

function isLocalCroweBridge(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname
    return host === '127.0.0.1' || host === 'localhost' || host === '::1'
  } catch {
    return false
  }
}

function proLinkageConfirmed(): boolean {
  const raw = process.env.CROWELOGIC_PRO_LINKED?.trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes'
}

export function resolveCrowelogicEnv(): CrowelogicEnv {
  const baseUrl =
    firstTrimmed(
      process.env.CROWELOGIC_BASE_URL,
      process.env.CROWE_LOGIC_URL,
      process.env.FOUNDRY_BASE_URL,
    ) || DEFAULT_LOCAL_BRIDGE

  let apiKey = ''
  let keySource: string | null = null
  for (const [name, value] of [
    ['CROWELOGIC_API_KEY', process.env.CROWELOGIC_API_KEY],
    ['CROWE_LOGIC_KEY', process.env.CROWE_LOGIC_KEY],
    ['FOUNDRY_API_KEY', process.env.FOUNDRY_API_KEY],
  ] as const) {
    const t = value?.trim()
    if (t) {
      apiKey = t
      keySource = name
      break
    }
  }

  let baseSource: string | null = null
  if (process.env.CROWELOGIC_BASE_URL?.trim()) baseSource = 'CROWELOGIC_BASE_URL'
  else if (process.env.CROWE_LOGIC_URL?.trim()) baseSource = 'CROWE_LOGIC_URL'
  else if (process.env.FOUNDRY_BASE_URL?.trim()) baseSource = 'FOUNDRY_BASE_URL'
  else baseSource = 'default_local_bridge'

  const normalizedBase = baseUrl.replace(/\/$/, '')
  const explicitModel = firstTrimmed(process.env.CROWELOGIC_MODEL, process.env.CROWE_LOGIC_MODEL)
  const model = explicitModel || (isGpt61Gateway(normalizedBase) ? CROWELOGIC_GPT61_MODEL : DEFAULT_MODEL)
  const revokedCredential = isRevokedCrowelogicKey(apiKey)
  const usableKey = revokedCredential ? '' : apiKey
  const credentialPresent = Boolean(usableKey)
  const local = isLocalCroweBridge(normalizedBase)
  const activation: CrowelogicActivation = !credentialPresent
    ? 'off'
    : local
      ? 'local_bridge'
      : isGpt61Gateway(normalizedBase) || proLinkageConfirmed()
        ? 'pro_gateway'
        : 'pending_pro_linkage'

  return {
    baseUrl: normalizedBase,
    apiKey: usableKey,
    model,
    configured: activation === 'local_bridge' || activation === 'pro_gateway',
    credentialPresent,
    activation,
    keySource: revokedCredential ? 'revoked' : keySource,
    baseSource,
    revokedCredential,
  }
}

/** Why chat must not call the gateway. Null when chat is enabled. */
export function crowelogicChatBlockReason(env: CrowelogicEnv): string | null {
  if (env.configured) return null
  if (env.revokedCredential) {
    return 'The Crowe API key in server env was revoked. Remove it and wait for a replacement. Do not reuse or forward it.'
  }
  if (env.activation === 'pending_pro_linkage') {
    return 'CroweLM is not activated. The customer credential is for the existing Crowe ID, but Pro linkage and the gateway usage cap are not confirmed yet.'
  }
  return 'Set CROWELOGIC_API_KEY to a replacement GPT-6.1 Sol deployment credential. CROWE_API_KEY is Crowe Creative only and does not turn on chat.'
}

export function isCrowelogicConfigured(): boolean {
  return resolveCrowelogicEnv().configured
}

export const CROWELOGIC_DEFAULT_MODEL = DEFAULT_MODEL
export const CROWELOGIC_DEFAULT_BASE_URL = DEFAULT_LOCAL_BRIDGE

/** OpenAI-compatible path: hosted CroweLM uses base ending in `/v1`; local bridge uses host-only base. */
export function crowelogicOpenAiUrl(
  baseUrl: string,
  resource: 'chat/completions' | 'models' | 'usage'
): string {
  const base = baseUrl.replace(/\/$/, '')
  if (base.endsWith('/v1')) return `${base}/${resource}`
  return `${base}/v1/${resource}`
}

/** CroweLM chat models (local bridge or hosted gateway). */
export const CROWELOGIC_STATIC_MODELS = [
  'auto',
  'gpt-6.1-sol',
  'crowelm-flash',
  'crowelm-apex',
  'crowelm-reason',
  'crowelm-parallel',
  'crowelm-mycelium',
  'supreme',
  'apex',
  'titan',
  'oracle',
  'gpt-4o-mini',
  'gpt-4o',
] as const
