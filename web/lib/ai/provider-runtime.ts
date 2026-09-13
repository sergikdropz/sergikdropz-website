/**
 * Provider-neutral LLM completion runtime shared by Admin AI and Sonic DNA agents.
 * Centralizes timeout, model selection metadata, and redaction helpers.
 */

import { resolveCrowelogicEnv, crowelogicOpenAiUrl } from '@/lib/ai/crowelogic-env'

export type AiProviderId = 'anthropic' | 'openai' | 'ollama' | 'crowelogic'

export type AiCompletionRequest = {
  provider: AiProviderId
  model: string
  system: string
  user: string
  maxTokens?: number
  temperature?: number
  timeoutMs?: number
}

export type AiCompletionResult = {
  text: string
  provider: AiProviderId
  model: string
  durationMs: number
  /** Approximate prompt size for cost/telemetry (chars, not tokens). */
  promptChars: number
  completionChars: number
}

function readTimeoutMs(name: string, fallback: number): number {
  const raw = Number.parseInt(process.env[name] || '', 10)
  return Number.isFinite(raw) && raw > 0 ? raw : fallback
}

const DEFAULT_TIMEOUT_MS = readTimeoutMs('ADMIN_AI_CHAT_FETCH_TIMEOUT_MS', 100_000)

/** Strip obvious secrets from text before logging or persisting prompts. */
export function redactSecrets(text: string): string {
  return text
    .replace(/(sk-[a-zA-Z0-9]{20,})/g, '[REDACTED_KEY]')
    .replace(/(Bearer\s+)[A-Za-z0-9._-]{20,}/gi, '$1[REDACTED_TOKEN]')
    .replace(
      /((?:api[_-]?key|secret|password|token)\s*[:=]\s*)['"]?[^'"\s]+/gi,
      '$1[REDACTED]'
    )
}

export async function completeChat(request: AiCompletionRequest): Promise<AiCompletionResult> {
  const started = Date.now()
  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS
  let text = ''

  if (request.provider === 'anthropic') {
    text = await completeAnthropic(request, timeoutMs)
  } else {
    text = await completeOpenAiCompatible(request, timeoutMs)
  }

  return {
    text,
    provider: request.provider,
    model: request.model,
    durationMs: Date.now() - started,
    promptChars: request.system.length + request.user.length,
    completionChars: text.length,
  }
}

async function completeAnthropic(request: AiCompletionRequest, timeoutMs: number): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set')

  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey: key, maxRetries: 1, timeout: timeoutMs })
  const response = await client.messages.create({
    model: request.model,
    max_tokens: request.maxTokens ?? 900,
    system: request.system,
    messages: [{ role: 'user', content: request.user }],
  })
  const textParts = response.content
    .filter((part) => part.type === 'text')
    .map((part) => part.text.trim())
    .filter(Boolean)
  if (!textParts.length) throw new Error('No textual response from Anthropic')
  return textParts.join('\n\n')
}

async function completeOpenAiCompatible(
  request: AiCompletionRequest,
  timeoutMs: number
): Promise<string> {
  let baseUrl = ''
  let apiKey: string | undefined

  if (request.provider === 'openai') {
    baseUrl = process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com'
    apiKey = process.env.OPENAI_API_KEY?.trim()
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set')
  } else if (request.provider === 'ollama') {
    baseUrl = process.env.OLLAMA_BASE_URL?.trim() || 'http://127.0.0.1:11434'
    apiKey = process.env.OLLAMA_API_KEY?.trim() || undefined
  } else {
    const crowe = resolveCrowelogicEnv()
    baseUrl = crowe.baseUrl
    apiKey = crowe.apiKey
    if (!crowe.configured) {
      throw new Error('Set CROWELOGIC_API_KEY or CROWE_API_KEY for Crowe Logic')
    }
  }

  const base = baseUrl.replace(/\/$/, '')
  const url =
    request.provider === 'crowelogic'
      ? crowelogicOpenAiUrl(base, 'chat/completions')
      : `${base}/v1/chat/completions`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      signal: ctrl.signal,
      body: JSON.stringify({
        model: request.model,
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.user },
        ],
        max_tokens: request.maxTokens ?? 900,
        temperature: request.temperature ?? 0.35,
      }),
    })
    const json = (await res.json().catch(() => ({}))) as {
      choices?: Array<{ message?: { content?: string } }>
      error?: { message?: string }
    }
    if (!res.ok) throw new Error(json.error?.message || `HTTP ${res.status}`)
    const text = json.choices?.[0]?.message?.content?.trim()
    if (!text) throw new Error('Empty completion from chat API')
    return text
  } catch (error) {
    if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('aborted'))) {
      throw new Error(`Chat request timed out after ${Math.round(timeoutMs / 1000)}s`)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}
