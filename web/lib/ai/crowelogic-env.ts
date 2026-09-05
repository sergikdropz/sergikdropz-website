/**
 * Crowe Logic / CroweLM gateway env (OpenAI-compatible /v1/chat/completions).
 * Accepts SERGIK names plus aliases used by OlliN Pro and Crowe Terminal.
 */

export type CrowelogicEnv = {
  baseUrl: string
  apiKey: string
  model: string
  configured: boolean
  /** Which env vars supplied the key (for admin UI, never the secret). */
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
    ['CROWE_API_KEY', process.env.CROWE_API_KEY],
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

  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    apiKey,
    model,
    configured: Boolean(apiKey),
    keySource,
    baseSource,
  }
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
