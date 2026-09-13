import type { AdminSkill } from '@/lib/ai/skills/types'
import type { AdminAiChatProvider } from '@/lib/ai/admin-chat-types'
import {
  DEFAULT_ANTHROPIC_CHAT_MODEL,
  DEFAULT_ANTHROPIC_FAST_MODEL,
} from '@/lib/ai/admin-anthropic-defaults'
import { DEFAULT_OLLAMA_MODEL } from '@/lib/ai/ollama-defaults'
import { CROWELOGIC_DEFAULT_MODEL } from '@/lib/ai/crowelogic-env'

/** Stored in Supabase model override fields — resolved per chat from message + skill context. */
export const ADMIN_AI_SMART_MODEL_OVERRIDE = '_smart'

export function pickSmartChatModelId(
  provider: AdminAiChatProvider,
  message: string,
  skill: AdminSkill
): string {
  const lower = message.trim().toLowerCase()
  const long = message.length > 4000
  const plan = lower.startsWith('/plan')
  const exec = lower.startsWith('/exec')
  const heavy = plan || long || skill.riskTier === 'tier_2_operational'
  const codey = /typescript|javascript|react|next\.js|nextjs|debug|stack|error:|eslint|npm |pnpm /i.test(message)
  const fastChat = exec || (!heavy && !plan && !long && skill.riskTier === 'tier_1_draft' && !codey)

  const anthEnv = process.env.ANTHROPIC_CHAT_MODEL?.trim() || DEFAULT_ANTHROPIC_CHAT_MODEL
  const openEnv = process.env.OPENAI_CHAT_MODEL?.trim() || 'gpt-4o-mini'
  /** Hints only — `generateWithOllama` maps to the first installed tag when missing. */
  const ollEnv = process.env.OLLAMA_MODEL?.trim() || ''
  const crowEnv =
    process.env.CROWELOGIC_MODEL?.trim() ||
    process.env.CROWE_LOGIC_MODEL?.trim() ||
    CROWELOGIC_DEFAULT_MODEL

  switch (provider) {
    case 'anthropic': {
      if (exec || fastChat) {
        if (/haiku/i.test(anthEnv)) return anthEnv
        return DEFAULT_ANTHROPIC_FAST_MODEL
      }
      if (heavy) {
        if (/sonnet|opus/i.test(anthEnv)) return anthEnv
        return DEFAULT_ANTHROPIC_CHAT_MODEL
      }
      return anthEnv
    }
    case 'openai': {
      if (exec || fastChat) {
        if (/mini|3\.5/i.test(openEnv)) return openEnv
        return 'gpt-4o-mini'
      }
      if (heavy || codey) {
        if (/gpt-4o(?!-mini)|gpt-4-turbo|^o\d|^o1|^o3/i.test(openEnv)) return openEnv
        return 'gpt-4o'
      }
      return openEnv
    }
    case 'ollama': {
      if (ollEnv) {
        if (heavy && /70b|mixtral|llama3\.1|large|sergikai/i.test(ollEnv)) return ollEnv
        if ((exec || fastChat) && /3\.2|phi|gemma|small|sergikai/i.test(ollEnv)) return ollEnv
        if (!heavy && !exec && !fastChat) return ollEnv
      }
      return DEFAULT_OLLAMA_MODEL
    }
    case 'crowelogic':
    default: {
      if (exec || fastChat) {
        if (/auto|mini|haiku/i.test(crowEnv)) return crowEnv
        return CROWELOGIC_DEFAULT_MODEL
      }
      if (heavy || codey) {
        if (/supreme|apex|titan|oracle|4o/i.test(crowEnv)) return crowEnv
        return 'supreme'
      }
      return crowEnv
    }
  }
}
