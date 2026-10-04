/**
 * Crowe Creative Film Engine (api.crowelogic.com) — same surface as crowe-creative MCP.
 */

export type CroweCreativeJson = Record<string, unknown>

export type CroweCreativeEnv = {
  baseUrl: string
  apiKey: string
  configured: boolean
  keySource: string | null
}

const DEFAULT_BASE = 'https://api.crowelogic.com'

function firstTrimmed(...values: Array<string | undefined>): string {
  for (const value of values) {
    const t = value?.trim()
    if (t) return t
  }
  return ''
}

export function resolveCroweCreativeEnv(): CroweCreativeEnv {
  let apiKey = ''
  let keySource: string | null = null
  for (const [name, value] of [['CROWE_API_KEY', process.env.CROWE_API_KEY]] as const) {
    const t = value?.trim()
    if (t) {
      apiKey = t
      keySource = name
      break
    }
  }

  const baseUrl =
    firstTrimmed(process.env.CROWE_API_URL, process.env.AIBLETON_CROWE_CREATIVE_URL) || DEFAULT_BASE

  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    apiKey,
    configured: Boolean(apiKey),
    keySource,
  }
}

function authHeaders(apiKey: string, json = true): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'X-API-Key': apiKey,
  }
  if (json) headers['Content-Type'] = 'application/json'
  return headers
}

export async function croweCreativeRequest(
  method: 'GET' | 'POST',
  path: string,
  body?: CroweCreativeJson,
  timeoutMs = 30_000,
): Promise<{ ok: boolean; status: number; data: CroweCreativeJson; error?: string }> {
  const env = resolveCroweCreativeEnv()
  if (!env.configured) {
    return {
      ok: false,
      status: 0,
      data: {},
      error: 'Crowe Creative API key not set (CROWE_API_KEY). The CroweLM chat credential is separate.',
    }
  }

  const url = `${env.baseUrl}${path.startsWith('/') ? path : `/${path}`}`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      method,
      headers: authHeaders(env.apiKey),
      signal: ctrl.signal,
      body: body != null ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    let data: CroweCreativeJson = {}
    if (text.trim()) {
      try {
        data = JSON.parse(text) as CroweCreativeJson
      } catch {
        data = { raw: text.slice(0, 2000) }
      }
    }
    if (!res.ok) {
      return { ok: false, status: res.status, data, error: `HTTP ${res.status}` }
    }
    return { ok: true, status: res.status, data }
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: {},
      error: err instanceof Error ? err.message : 'Request failed',
    }
  } finally {
    clearTimeout(timer)
  }
}

/** Remove huge base64 blobs from tool output stored in ai_runs. */
export function sanitizeCroweCreativePayload(data: CroweCreativeJson): CroweCreativeJson {
  const walk = (value: unknown, key?: string): unknown => {
    if (typeof value === 'string') {
      if (
        key &&
        /base64|b64|image|video|content|bytes/i.test(key) &&
        value.length > 200
      ) {
        return `[omitted ${value.length} chars — use job URL or download in Crowe/OlliN Pro]`
      }
      if (value.startsWith('data:') && value.length > 200) {
        return `[omitted data-uri ${value.length} chars]`
      }
      return value
    }
    if (Array.isArray(value)) return value.map((item) => walk(item))
    if (value && typeof value === 'object') {
      const out: CroweCreativeJson = {}
      for (const [k, v] of Object.entries(value as CroweCreativeJson)) {
        out[k] = walk(v, k) as CroweCreativeJson[string]
      }
      return out
    }
    return value
  }
  return walk(data) as CroweCreativeJson
}

export async function croweCreativeListModels() {
  return croweCreativeRequest('GET', '/api/gateway/media/models', undefined, 25_000)
}

export async function croweCreativeCredits() {
  return croweCreativeRequest('GET', '/api/gateway/credits', undefined, 25_000)
}

export async function croweCreativeQuote(input: {
  kind: 'video' | 'image'
  model: string
  seconds?: number
  resolution?: string
  count?: number
}) {
  const body: CroweCreativeJson = { kind: input.kind, model: input.model }
  if (input.kind === 'video') {
    body.seconds = input.seconds ?? 5
    body.resolution = input.resolution ?? '720P'
  } else {
    body.count = input.count ?? 1
  }
  return croweCreativeRequest('POST', '/api/gateway/media/quote', body, 25_000)
}

export async function croweCreativeGenerateImage(prompt: string, model: string, count = 1) {
  return croweCreativeRequest(
    'POST',
    '/api/gateway/media/image',
    { prompt, model, count },
    120_000,
  )
}

export async function croweCreativeGenerateVideo(input: {
  prompt: string
  model: string
  seconds?: number
  resolution?: string
  aspect_ratio?: string
}) {
  return croweCreativeRequest(
    'POST',
    '/api/gateway/media/video',
    {
      prompt: input.prompt,
      model: input.model,
      seconds: input.seconds ?? 5,
      resolution: input.resolution ?? '720P',
      aspect_ratio: input.aspect_ratio ?? '16:9',
    },
    300_000,
  )
}
