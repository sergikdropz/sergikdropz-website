import type { AdminSkill } from '@/lib/ai/skills/types'
import { ADMIN_AI_CHAT_PROVIDERS, type AdminAiChatProvider } from '@/lib/ai/admin-chat-types'

export type AdminAiAutoRouterMode = 'smart' | 'env_order'

export type AutoRouteSignal = {
  label: string
  detail?: string
}

const SUPPORTED: AdminAiChatProvider[] = [...ADMIN_AI_CHAT_PROVIDERS]

function dedupe(order: AdminAiChatProvider[]): AdminAiChatProvider[] {
  const out: AdminAiChatProvider[] = []
  for (const p of order) {
    if (!out.includes(p)) out.push(p)
  }
  for (const p of SUPPORTED) {
    if (!out.includes(p)) out.push(p)
  }
  return out
}

/**
 * Context-aware provider order when the assistant is on Auto (no fixed provider).
 * Uses slash-commands, message size, inferred admin skill, and light keyword hints.
 */
export function buildSmartProviderOrder(message: string, skill: AdminSkill): AdminAiChatProvider[] {
  const lower = message.trim().toLowerCase()
  const tier = skill.riskTier

  if (lower.startsWith('/exec')) {
    return dedupe(['openai', 'anthropic', 'crowelogic', 'ollama'])
  }

  if (lower.startsWith('/plan') || message.length > 4000) {
    return dedupe(['anthropic', 'openai', 'crowelogic', 'ollama'])
  }

  if (tier === 'tier_2_operational') {
    return dedupe(['anthropic', 'openai', 'crowelogic', 'ollama'])
  }

  if (tier === 'tier_1_draft') {
    return dedupe(['openai', 'anthropic', 'crowelogic', 'ollama'])
  }

  if (/typescript|javascript|react|next\.js|nextjs|debug|stack\s*trace|error:|exception|npm |pnpm |eslint/i.test(message)) {
    return dedupe(['openai', 'anthropic', 'crowelogic', 'ollama'])
  }

  // Short conversational default: favor cost/latency, still fall back to stronger models.
  return dedupe(['openai', 'ollama', 'anthropic', 'crowelogic'])
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

  const lower = message.trim().toLowerCase()
  if (lower.startsWith('/exec')) {
    signals.push({ label: 'Routing rule', detail: '/exec — JSON tools; prefer OpenAI-compatible stack first' })
  } else if (lower.startsWith('/plan') || message.length > 4000) {
    const detail = lower.startsWith('/plan')
      ? '/plan — long-form runbooks; prefer strongest reasoning first'
      : 'Long prompt — prefer strongest reasoning first'
    signals.push({ label: 'Routing rule', detail })
  } else if (skill.riskTier === 'tier_2_operational') {
    signals.push({ label: 'Routing rule', detail: 'Operational skill — prefer Claude-class reasoning first' })
  } else if (skill.riskTier === 'tier_1_draft') {
    signals.push({ label: 'Routing rule', detail: 'Draft-tier skill — prefer fast OpenAI-class first' })
  } else if (
    /typescript|javascript|react|next\.js|nextjs|debug|stack\s*trace|error:|exception|npm |pnpm |eslint/i.test(message)
  ) {
    signals.push({ label: 'Routing rule', detail: 'Dev/code keywords — prefer OpenAI-class first' })
  } else {
    signals.push({ label: 'Routing rule', detail: 'Default chat — balance cost/latency vs capability' })
  }

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
