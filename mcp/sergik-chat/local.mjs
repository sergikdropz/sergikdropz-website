import { ollamaBaseUrl, ollamaModel } from './router.mjs'

export async function completeWithOllama(message, model) {
  const base = ollamaBaseUrl()
  const chosen = ollamaModel(model)
  const timeoutMs = Number(process.env.ADMIN_AI_OLLAMA_TIMEOUT_MS) || 120_000
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: chosen,
        messages: [{ role: 'user', content: message }],
        max_tokens: 900,
        temperature: 0.35,
        stream: false,
      }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      const detail = json?.error?.message || `HTTP ${res.status}`
      throw new Error(`Local model failed: ${detail}`)
    }
    const text = json?.choices?.[0]?.message?.content?.trim()
    if (!text) throw new Error('Local model returned an empty reply')
    return { text, model: chosen, backend: 'local' }
  } catch (error) {
    if (error instanceof Error && (error.name === 'AbortError' || /aborted/i.test(error.message))) {
      throw new Error(`Local model timed out after ${Math.round(timeoutMs / 1000)}s at ${base}`)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}
