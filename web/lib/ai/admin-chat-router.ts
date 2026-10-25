import type { AdminSkill } from '@/lib/ai/skills/types'
import { ADMIN_AI_CHAT_PROVIDERS, type AdminAiChatProvider } from '@/lib/ai/admin-chat-types'

export type AdminAiAutoRouterMode = 'smart' | 'env_order'

export type AutoRouteSignal = {
  label: string
  detail?: string
}

const SUPPORTED: AdminAiChatProvider[] = [...ADMIN_AI_CHAT_PROVIDERS]

/**
 * Auto order for an unpinned chat. A model chosen in chat settings is not this list.
 * Anthropic is included only when ADMIN_AI_CHAT_PROVIDER=anthropic. OlliN is a tool probe, not a provider.
 */
export function autoProviderOrder(): AdminAiChatProvider[] {
  const raw = process.env.ADMIN_AI_CHAT_PROVIDER?.trim().toLowerCase()
  const fromEnv = raw && (SUPPORTED as string[]).includes(raw) ? (raw as AdminAiChatProvider) : null
  const pool: AdminAiChatProvider[] = ['openai', 'crowelogic', 'cursor', 'ollama']
  const out: AdminAiChatProvider[] = []
  if (fromEnv === 'anthropic') out.push('anthropic')
  else if (fromEnv) out.push(fromEnv)
  for (const id of pool) {
    if (!out.includes(id)) out.push(id)
  }
  return out
}

/** Provider order when the assistant menu is Auto. The selected menu LLM is handled separately and is not rerouted. */
export function buildSmartProviderOrder(_message: string, _skill: AdminSkill): AdminAiChatProvider[] {
  return autoProviderOrder()
}

export function explainAutoRoute(message: string, skill: AdminSkill): {
  providerOrder: AdminAiChatProvider[]
  signals: AutoRouteSignal[]
} {
  const signals: AutoRouteSignal[] = []
  signals.push({
    label: 'Inferred skill',
    detail: `${skill.name} (${skill.id}) · ${skill.riskTier}`,
  })

  signals.push({
    label: 'Routing rule',
    detail:
      message.trim().length > 0
        ? 'Auto uses this environment’s provider order. A model picked in chat settings runs that turn and probes the agent harness itself.'
        : 'Auto uses this environment’s provider order.',
  })

  return {
    providerOrder: buildSmartProviderOrder(message, skill),
    signals,
  }
}

export function normalizeAutoRouterMode(raw: string | undefined | null): AdminAiAutoRouterMode | null {
  const v = raw?.toLowerCase().trim()
  if (v === 'smart' || v === 'env_order') return v
  return null
}
