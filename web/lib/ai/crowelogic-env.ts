/**
 * CroweLM admin chat (OpenAI-compatible /v1/chat/completions, server-side only).
 *
 * Identity: the existing Crowe ID. No second Crowe account.
 * Credential: a customer credential in server env. Never a password, never sent to the browser.
 * Billing: existing Pro subscription ($99/month). This period includes 3,000 credits through 2026-10-22. No automatic overage.
 * Activation: hosted chat stays off. GPT-6.1 Sol has no issued credential yet. Set CROWELOGIC_PRO_LINKED only after Crowe sends the deployment credential.
 * Crowe Creative (`CROWE_API_KEY`, api.crowelogic.com) is a separate media API.
 */

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
}

const DEFAULT_LOCAL_BRIDGE = 'http://127.0.0.1:8011'
const DEFAULT_MODEL = 'auto'

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

  const model =
    firstTrimmed(process.env.CROWELOGIC_MODEL, process.env.CROWE_LOGIC_MODEL) || DEFAULT_MODEL
  const credentialPresent = Boolean(apiKey)
  const local = isLocalCroweBridge(baseUrl)
  const activation: CrowelogicActivation = !credentialPresent
    ? 'off'
    : local
      ? 'local_bridge'
      : proLinkageConfirmed()
        ? 'pro_gateway'
        : 'pending_pro_linkage'

  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    apiKey,
    model,
    configured: activation === 'local_bridge' || activation === 'pro_gateway',
    credentialPresent,
    activation,
    keySource,
    baseSource,
  }
}

/** Why chat must not call the gateway. Null when chat is enabled. */
export function crowelogicChatBlockReason(env: CrowelogicEnv): string | null {
  if (env.configured) return null
  if (env.activation === 'pending_pro_linkage') {
    return 'CroweLM is not activated. The customer credential is for the existing Crowe ID, but Pro linkage and the gateway usage cap are not confirmed yet.'
  }
  return 'Set CROWELOGIC_API_KEY (customer credential on the existing Crowe ID). CROWE_API_KEY is Crowe Creative only and does not turn on chat.'
}

export function isCrowelogicConfigured(): boolean {
  return resolveCrowelogicEnv().configured
}

export const CROWELOGIC_DEFAULT_MODEL = DEFAULT_MODEL
export const CROWELOGIC_DEFAULT_BASE_URL = DEFAULT_LOCAL_BRIDGE

/** OpenAI-compatible path: hosted CroweLM uses base ending in `/v1`; local bridge uses host-only base. */
export function crowelogicOpenAiUrl(
  baseUrl: string,
  resource: 'chat/completions' | 'models'
): string {
  const base = baseUrl.replace(/\/$/, '')
  if (base.endsWith('/v1')) return `${base}/${resource}`
  return `${base}/v1/${resource}`
}

/** CroweLM chat models (local bridge or hosted gateway). */
export const CROWELOGIC_STATIC_MODELS = [
  'auto',
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
