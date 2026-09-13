import type { AdminAiChatProvider } from '@/lib/ai/admin-chat-types'
import { CROWELOGIC_DEFAULT_MODEL } from '@/lib/ai/crowelogic-env'
import { DEFAULT_ANTHROPIC_CHAT_MODEL } from '@/lib/ai/admin-anthropic-defaults'
import { DEFAULT_OLLAMA_MODEL } from '@/lib/ai/ollama-defaults'
import { resolveOllamaModelIdForRequest } from '@/lib/ai/ollama-model-resolve'

/** Fast fallback when Ollama is slow/unreachable (e.g. chat must not block on /api/tags). */
export function getEnvModelIdsFromEnvOnly(): Record<AdminAiChatProvider, string> {
  return {
    anthropic: process.env.ANTHROPIC_CHAT_MODEL?.trim() || DEFAULT_ANTHROPIC_CHAT_MODEL,
    openai: process.env.OPENAI_CHAT_MODEL?.trim() || 'gpt-4o-mini',
    ollama: process.env.OLLAMA_MODEL?.trim() || DEFAULT_OLLAMA_MODEL,
    crowelogic: process.env.CROWELOGIC_MODEL?.trim() || process.env.CROWE_LOGIC_MODEL?.trim() || CROWELOGIC_DEFAULT_MODEL,
  }
}

/**
 * Per-provider default model ids from env, with Ollama resolved against /api/tags
 * (same as Admin → Settings “Router & models”).
 */
export async function getEnvModelIdsResolved(): Promise<Record<AdminAiChatProvider, string>> {
  const base = {
    anthropic: process.env.ANTHROPIC_CHAT_MODEL?.trim() || DEFAULT_ANTHROPIC_CHAT_MODEL,
    openai: process.env.OPENAI_CHAT_MODEL?.trim() || 'gpt-4o-mini',
    ollama: process.env.OLLAMA_MODEL?.trim() || '',
    crowelogic: process.env.CROWELOGIC_MODEL?.trim() || process.env.CROWE_LOGIC_MODEL?.trim() || CROWELOGIC_DEFAULT_MODEL,
  } satisfies Record<AdminAiChatProvider, string>
  let ollama = base.ollama
  try {
    ollama = await resolveOllamaModelIdForRequest(null)
  } catch {
    ollama = base.ollama || DEFAULT_OLLAMA_MODEL
  }
  return { ...base, ollama }
}

const CHAT_OLLAMA_RESOLVE_BUDGET_MS = 3_200

/**
 * For chat API: same as getEnvModelIdsResolved, but Ollama tag lookup must not delay the
 * first byte long when the daemon is down (avoids spurious client timeouts / "Failed to fetch").
 */
export async function getEnvModelIdsResolvedForChat(): Promise<Record<AdminAiChatProvider, string>> {
  try {
    return await Promise.race([
      getEnvModelIdsResolved(),
      new Promise<Record<AdminAiChatProvider, string>>((_, reject) => {
        setTimeout(() => reject(new Error('getEnvModelIdsResolved timeout')), CHAT_OLLAMA_RESOLVE_BUDGET_MS)
      }),
    ])
  } catch {
    return getEnvModelIdsFromEnvOnly()
  }
}
