/** Current Anthropic chat defaults (avoid retired `-latest` 3.5 aliases). */
export const DEFAULT_ANTHROPIC_CHAT_MODEL = 'claude-sonnet-4-6'
export const DEFAULT_ANTHROPIC_FAST_MODEL = 'claude-haiku-4-5'

const DEPRECATED_ANTHROPIC = new Set([
  'claude-3-5-sonnet-latest',
  'claude-3-5-haiku-latest',
  'claude-3-opus-latest',
])

/** Ordered candidates for admin chat; skips known-retired ids unless explicitly requested. */
export function anthropicChatModelCandidates(modelOverride?: string | null): string[] {
  const env = process.env.ANTHROPIC_CHAT_MODEL?.trim() || ''
  const out: string[] = []
  const push = (value?: string | null) => {
    const id = String(value || '').trim()
    if (!id || out.includes(id)) return
    out.push(id)
  }
  push(modelOverride)
  if (env && !DEPRECATED_ANTHROPIC.has(env)) push(env)
  push(DEFAULT_ANTHROPIC_CHAT_MODEL)
  push('claude-sonnet-4-20250514')
  push(DEFAULT_ANTHROPIC_FAST_MODEL)
  push('claude-haiku-4-5-20251001')
  return out
}

export function isAnthropicModelNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const status = (error as { status?: number }).status
  if (status === 404) return true
  const message = String((error as { message?: string }).message || '')
  return /not_found_error|model:/i.test(message) && /404/.test(message)
}
