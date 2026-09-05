import type { AdminAiChatProvider } from '@/lib/ai/admin-chat-types'
import { CROWELOGIC_DEFAULT_MODEL, CROWELOGIC_STATIC_MODELS, resolveCrowelogicEnv, crowelogicOpenAiUrl } from '@/lib/ai/crowelogic-env'
import { DEFAULT_OLLAMA_MODEL, STATIC_OLLAMA_MODEL_HINTS } from '@/lib/ai/ollama-defaults'
import { getOllamaApiTagsState, ollamaTagMatchesPreference } from '@/lib/ai/ollama-model-resolve'

const OPENAI_BLOCKLIST =
  /embed|whisper|davinci|babbage|ada|tts|dall|moderation|realtime|audio|transcribe|image|text-moderation|omni-moderation/i

const STATIC_MODELS: Record<AdminAiChatProvider, string[]> = {
  anthropic: [
    'claude-sonnet-5',
    'claude-sonnet-4-6',
    'claude-sonnet-4-20250514',
    'claude-haiku-4-5',
    'claude-haiku-4-5-20251001',
    'claude-3-haiku-20240307',
  ],
  openai: [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo',
    'gpt-4',
    'gpt-3.5-turbo',
    'o1',
    'o1-mini',
    'o3-mini',
  ],
  ollama: [...STATIC_OLLAMA_MODEL_HINTS],
  crowelogic: [...CROWELOGIC_STATIC_MODELS],
}

function uniqSorted(ids: string[]): string[] {
  return Array.from(new Set(ids.map((s) => s.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  )
}

function openAiStyleFilter(id: string): boolean {
  if (!id || id.length > 128) return false
  if (OPENAI_BLOCKLIST.test(id)) return false
  return /^gpt-|^o\d|^chatgpt-/i.test(id) || id.includes('gpt-')
}

async function fetchJson(url: string, init?: RequestInit & { timeoutMs?: number }) {
  const { timeoutMs = 12_000, ...rest } = init ?? {}
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...rest, signal: ctrl.signal })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    return { ok: res.ok, status: res.status, json }
  } finally {
    clearTimeout(t)
  }
}

async function listOpenAiCompatibleModelIds(
  baseUrl: string,
  apiKey: string | undefined,
  options?: { loose?: boolean; absoluteUrl?: boolean }
): Promise<string[]> {
  const base = baseUrl.replace(/\/$/, '')
  const headers: Record<string, string> = {}
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  const url = options?.absoluteUrl ? base : `${base}/v1/models`
  const { ok, json } = await fetchJson(url, { headers })
  if (!ok) return []
  const data = json.data as Array<{ id?: string }> | undefined
  if (!Array.isArray(data)) return []
  const ids = data.map((m) => m.id).filter((id): id is string => Boolean(id && typeof id === 'string'))
  const strict = ids.filter((id) => openAiStyleFilter(id))
  if (strict.length > 0 && !options?.loose) {
    return uniqSorted(strict)
  }
  const loose = ids.filter((id) => !OPENAI_BLOCKLIST.test(id) && id.length > 0 && id.length < 120)
  return uniqSorted(loose.length ? loose : strict)
}

export type AdminModelListResult = {
  modelIds: string[]
  source: 'live' | 'static'
  /** ok = fetched catalog is authoritative; degraded = showing fallbacks; error = list unusable */
  status: 'ok' | 'degraded' | 'error'
  message?: string
  /** e.g. OLLAMA_MODEL — server checks this tag is installed when Ollama is live */
  envDefaultModelId?: string
  envDefaultPresent?: boolean
}

function mergeWithFallback(live: string[], fallback: string[], cap = 80): string[] {
  return uniqSorted([...live, ...fallback]).slice(0, cap)
}

export async function listModelsForAdminProvider(provider: AdminAiChatProvider): Promise<AdminModelListResult> {
  const fallback = STATIC_MODELS[provider]

  try {
    if (provider === 'openai') {
      const key = process.env.OPENAI_API_KEY?.trim()
      const base = process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com'
      if (!key) {
        return {
          modelIds: fallback,
          source: 'static',
          status: 'degraded',
          message: 'Set OPENAI_API_KEY — listing static chat defaults only (not live from API).',
        }
      }
      const ids = await listOpenAiCompatibleModelIds(base, key)
      if (ids.length) {
        return {
          modelIds: mergeWithFallback(ids, fallback),
          source: 'live',
          status: 'ok',
          message: `${ids.length} model(s) from API · defaults merged for quick picks`,
        }
      }
      return {
        modelIds: fallback,
        source: 'static',
        status: 'degraded',
        message: 'OpenAI /v1/models empty or not permitted — static defaults; check key and org.',
      }
    }

    if (provider === 'crowelogic') {
      const crowe = resolveCrowelogicEnv()
      if (!crowe.configured) {
        return {
          modelIds: fallback,
          source: 'static',
          status: 'degraded',
          message:
            'Set CROWELOGIC_API_KEY or CROWE_API_KEY — static CroweLM defaults. Start local bridge at 127.0.0.1:8011 or set CROWELOGIC_BASE_URL.',
        }
      }
      const ids = await listOpenAiCompatibleModelIds(
        crowelogicOpenAiUrl(crowe.baseUrl, 'models'),
        crowe.apiKey,
        { loose: true, absoluteUrl: true }
      )
      if (ids.length) {
        return {
          modelIds: mergeWithFallback(ids, fallback),
          source: 'live',
          status: 'ok',
          message: `${ids.length} model(s) from ${crowe.baseUrl}`,
          envDefaultModelId: crowe.model,
          envDefaultPresent: ids.includes(crowe.model) || ids.some((id) => id.startsWith(crowe.model)),
        }
      }
      return {
        modelIds: fallback,
        source: 'static',
        status: 'degraded',
        message: `Gateway at ${crowe.baseUrl} did not return models — is the Foundry bridge running?`,
        envDefaultModelId: crowe.model,
        envDefaultPresent: false,
      }
    }

    if (provider === 'ollama') {
      const envModel = process.env.OLLAMA_MODEL?.trim() || DEFAULT_OLLAMA_MODEL
      const b = (process.env.OLLAMA_BASE_URL?.trim() || 'http://127.0.0.1:11434').replace(/\/$/, '')
      const { names: ids, ok, status } = await getOllamaApiTagsState()
      if (!ok) {
        return {
          modelIds: fallback,
          source: 'static',
          status: 'error',
          message: `Ollama unreachable at ${b} (HTTP ${status}) — not installed / not running, or wrong OLLAMA_BASE_URL. ollama pull <name> after fixing.`,
          envDefaultModelId: envModel,
          envDefaultPresent: false,
        }
      }
      const envDefaultPresent = ids.some((id) => ollamaTagMatchesPreference(envModel, id))
      if (ids.length) {
        return {
          modelIds: ids,
          source: 'live',
          status: 'ok',
          message: envDefaultPresent
            ? `${ids.length} model(s) installed · ${envModel} is available (OLLAMA_MODEL)`
            : `${ids.length} model(s) installed · OLLAMA_MODEL "${envModel}" not in list — ollama pull ${envModel.split(':')[0]}`,
          envDefaultModelId: envModel,
          envDefaultPresent,
        }
      }
      return {
        modelIds: fallback,
        source: 'static',
        status: 'degraded',
        message: `Ollama has no local models. Run: ollama pull ${envModel.split(':')[0]}`,
        envDefaultModelId: envModel,
        envDefaultPresent: false,
      }
    }

    // anthropic
    const key = process.env.ANTHROPIC_API_KEY?.trim()
    if (!key) {
      return {
        modelIds: fallback,
        source: 'static',
        status: 'degraded',
        message: 'Set ANTHROPIC_API_KEY — static Claude name hints only (not from API).',
      }
    }
    const { ok, status, json } = await fetchJson('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
    })
    if (!ok) {
      return {
        modelIds: fallback,
        source: 'static',
        status: 'degraded',
        message: `Anthropic /v1/models failed (HTTP ${status}) — static list; key may be invalid or endpoint blocked.`,
      }
    }
    const data = json.data as Array<{ id?: string; name?: string }> | undefined
    if (!Array.isArray(data)) {
      return {
        modelIds: fallback,
        source: 'static',
        status: 'degraded',
        message: 'Unexpected Anthropic response shape',
      }
    }
    const ids = uniqSorted(
      data
        .map((m) => (m.id || m.name || '').trim())
        .filter((id) => id && /claude/i.test(id))
    )
    if (ids.length) {
      return {
        modelIds: mergeWithFallback(ids, fallback),
        source: 'live',
        status: 'ok',
        message: `${ids.length} Claude model(s) from API`,
      }
    }
    return {
      modelIds: fallback,
      source: 'static',
      status: 'degraded',
      message: 'No Claude ids returned from /v1/models — static defaults; check API key.',
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return { modelIds: fallback, source: 'static', status: 'error', message: msg }
  }
}
