import { DEFAULT_OLLAMA_MODEL } from '@/lib/ai/ollama-defaults'

const TAG_CACHE_TTL_OK_MS = 60_000
const TAG_CACHE_ERR_MS = 5_000

type TagCache = { at: number; base: string; result: { names: string[]; ok: boolean; status: number } }

let tagCache: TagCache | null = null

function uniqSorted(ids: string[]): string[] {
  return Array.from(new Set(ids.map((s) => s.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  )
}

async function fetchJson(url: string, init?: RequestInit & { timeoutMs?: number }) {
  const { timeoutMs = 10_000, ...rest } = init ?? {}
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

/** Exported for admin model list and env default checks. */
export function ollamaTagMatchesPreference(want: string, tag: string): boolean {
  const t = tag.trim()
  const w = want.trim()
  if (!t || !w) return false
  if (t === w) return true
  const tagBase = t.split(':')[0] ?? t
  const wantBase = w.split(':')[0] ?? w
  if (tagBase === wantBase) return true
  if (t.startsWith(wantBase + ':') || t.startsWith(w + ':')) return true
  return false
}

/** Raw /api/tags result for admin list + error handling. */
export async function getOllamaApiTagsState(): Promise<{ names: string[]; ok: boolean; status: number }> {
  const base = (process.env.OLLAMA_BASE_URL?.trim() || 'http://127.0.0.1:11434').replace(/\/$/, '')
  const now = Date.now()
  if (tagCache && tagCache.base === base) {
    const maxAge = tagCache.result.ok && tagCache.result.names.length > 0 ? TAG_CACHE_TTL_OK_MS : TAG_CACHE_ERR_MS
    if (now - tagCache.at < maxAge) return tagCache.result
  }
  const headers: Record<string, string> = {}
  const key = process.env.OLLAMA_API_KEY?.trim()
  if (key) headers.Authorization = `Bearer ${key}`

  const { ok, status, json } = await fetchJson(`${base}/api/tags`, { headers, timeoutMs: 8000 })
  if (!ok) {
    const result = { names: [] as string[], ok: false, status }
    tagCache = { at: now, base, result }
    return result
  }
  const models = json.models as Array<{ name?: string; model?: string }> | undefined
  if (!Array.isArray(models)) {
    const result = { names: [] as string[], ok: true, status }
    tagCache = { at: now, base, result }
    return result
  }
  const names = uniqSorted(
    models.map((m) => (m.name || m.model || '').trim()).filter(Boolean)
  ) as string[]
  const result = { names, ok: true, status }
  tagCache = { at: now, base, result }
  return result
}

/**
 * Installed Ollama model names from /api/tags (short cache, errors → []).
 */
export async function fetchOllamaModelTagNames(): Promise<string[]> {
  const s = await getOllamaApiTagsState()
  return s.names
}

function pickBestMatchingTag(preference: string, tags: string[]): string | null {
  if (!tags.length || !preference.trim()) return null
  const p = preference.trim()
  const matches = tags.filter((t) => ollamaTagMatchesPreference(p, t))
  if (matches.length === 0) return null
  const exact = matches.find((m) => m === p)
  if (exact) return exact
  const withLatest = matches.find((m) => m.endsWith(':latest'))
  if (withLatest) return withLatest
  return matches.sort((a, b) => a.localeCompare(b))[0] ?? null
}

/**
 * Resolves a concrete Ollama tag to use for chat: prefer override, then OLLAMA_MODEL, then
 * first installed tag. If preference is not installed, falls back to the first available tag
 * (alphabetical) so requests don’t 404 on missing model names.
 */
export async function resolveOllamaModelIdForRequest(modelOverride?: string | null): Promise<string> {
  const envModel = process.env.OLLAMA_MODEL?.trim() || ''
  const preference = (modelOverride?.trim() || envModel).trim()
  const tags = await fetchOllamaModelTagNames()

  if (tags.length === 0) {
    return preference || envModel || DEFAULT_OLLAMA_MODEL
  }

  if (preference) {
    const best = pickBestMatchingTag(preference, tags)
    if (best) return best
    return tags[0] as string
  }

  if (envModel) {
    const best = pickBestMatchingTag(envModel, tags)
    if (best) return best
  }

  const sergikai = pickBestMatchingTag(DEFAULT_OLLAMA_MODEL, tags)
  if (sergikai) return sergikai

  return tags[0] as string
}

export function clearOllamaModelTagCache() {
  tagCache = null
}
