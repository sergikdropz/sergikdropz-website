/**
 * Server-side client for the local OlliN Pro / AiBLETON FastAPI (same routes as ollin_pro_cursor_mcp).
 */

export type OllinProJson = Record<string, unknown>

export type OllinProClientResult = {
  ok: boolean
  apiBase: string
  path: string
  status?: number
  data?: OllinProJson
  error?: string
}

function readApiBase(): string {
  return (
    process.env.AIBLETON_API_BASE?.trim() ||
    process.env.OLLIN_PRO_API_BASE?.trim() ||
    'http://127.0.0.1:8000'
  ).replace(/\/$/, '')
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  const jwt =
    process.env.AIBLETON_MCP_JWT?.trim() ||
    process.env.AIBLETON_JWT?.trim() ||
    process.env.OLLIN_PRO_JWT?.trim() ||
    ''
  if (jwt) headers.Authorization = `Bearer ${jwt}`
  return headers
}

export async function ollinProRequestJson(
  method: 'GET' | 'POST',
  path: string,
  options?: {
    query?: Record<string, string | number | boolean | undefined | null>
    body?: OllinProJson
    timeoutMs?: number
  },
): Promise<OllinProClientResult> {
  const apiBase = readApiBase()
  let url = `${apiBase}${path.startsWith('/') ? path : `/${path}`}`
  if (options?.query) {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(options.query)) {
      if (value === undefined || value === null) continue
      params.set(key, String(value))
    }
    const qs = params.toString()
    if (qs) url = `${url}?${qs}`
  }

  const timeoutMs = options?.timeoutMs ?? 25_000
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      method,
      headers: authHeaders(),
      signal: ctrl.signal,
      body: options?.body != null ? JSON.stringify(options.body) : undefined,
    })
    const text = await res.text()
    let data: OllinProJson | undefined
    if (text.trim()) {
      try {
        data = JSON.parse(text) as OllinProJson
      } catch {
        data = { raw: text.slice(0, 4000) }
      }
    }
    if (!res.ok) {
      return {
        ok: false,
        apiBase,
        path,
        status: res.status,
        data,
        error: `HTTP ${res.status}`,
      }
    }
    return { ok: true, apiBase, path, status: res.status, data: data ?? { ok: true } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Request failed'
    return { ok: false, apiBase, path, error: message }
  } finally {
    clearTimeout(timer)
  }
}

export async function ollinProPing(): Promise<OllinProClientResult> {
  for (const path of ['/api/health', '/health', '/openapi.json'] as const) {
    const out = await ollinProRequestJson('GET', path, { timeoutMs: 8_000 })
    if (out.ok) return out
    if (out.status === 404) continue
  }
  return ollinProRequestJson('GET', '/api/dataset/harness', {
    query: { full: 'false' },
    timeoutMs: 12_000,
  })
}

export async function ollinProHarnessCatalog(full = false) {
  return ollinProRequestJson('GET', '/api/dataset/harness', {
    query: { full: String(full) },
    timeoutMs: 30_000,
  })
}

export async function ollinProHarnessProbe(query: string, limit = 8, withKnowledge = true) {
  return ollinProRequestJson('GET', '/api/dataset/harness/probe', {
    query: {
      q: query,
      limit,
      with_knowledge: String(withKnowledge).toLowerCase(),
    },
    timeoutMs: 45_000,
  })
}

export async function ollinProKnowledgeSearch(query: string, k = 8) {
  return ollinProRequestJson('GET', '/api/knowledge/search', {
    query: { q: query, k },
    timeoutMs: 30_000,
  })
}

export async function ollinProDevModeStatus() {
  return ollinProRequestJson('GET', '/api/ollin-pro/dev-mode', { timeoutMs: 12_000 })
}

export function resolveOllinProEnv() {
  return {
    apiBase: readApiBase(),
    hasJwt: Boolean(
      process.env.AIBLETON_MCP_JWT?.trim() ||
        process.env.AIBLETON_JWT?.trim() ||
        process.env.OLLIN_PRO_JWT?.trim(),
    ),
  }
}
