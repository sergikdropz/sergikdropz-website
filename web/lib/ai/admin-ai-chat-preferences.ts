import type { SupabaseClient } from '@supabase/supabase-js'
import { ADMIN_AI_CHAT_PROVIDERS, type AdminAiChatProvider } from '@/lib/ai/admin-chat-types'
import { normalizeAutoRouterMode, type AdminAiAutoRouterMode } from '@/lib/ai/admin-chat-router'
import { ADMIN_AI_SMART_MODEL_OVERRIDE } from '@/lib/ai/admin-smart-model-picker'

const PREF_KEYS = {
  autoRouterMode: 'admin_ai_auto_router_mode',
  modelAnthropic: 'admin_ai_model_anthropic',
  modelOpenai: 'admin_ai_model_openai',
  modelOllama: 'admin_ai_model_ollama',
  modelCrowelogic: 'admin_ai_model_crowelogic',
  assistantDefaultLlm: 'admin_ai_assistant_default_llm',
  sonicDnaLlm: 'admin_ai_sonic_dna_llm',
} as const

const ALL_KEYS = Object.values(PREF_KEYS)

function jsonbToTrimmedString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') {
    const t = value.trim()
    return t.length ? t : null
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }
  if (typeof value === 'object' && value !== null && 'value' in value) {
    return jsonbToTrimmedString((value as { value: unknown }).value)
  }
  return null
}

export type AdminAiAssistantLlmChoice = 'auto' | AdminAiChatProvider

export type AdminAiChatPreferences = {
  autoRouterMode: AdminAiAutoRouterMode
  modelOverrides: Partial<Record<AdminAiChatProvider, string>>
  assistantDefaultLlm: AdminAiAssistantLlmChoice
  /** LLM for Sonic DNA question / challenge / regenerate. Auto follows assistant default, then env. */
  sonicDnaLlm: AdminAiAssistantLlmChoice
}

function normalizeAssistantDefaultLlm(raw: unknown): AdminAiAssistantLlmChoice {
  const s = jsonbToTrimmedString(raw)?.toLowerCase()
  if (!s || s === 'auto') return 'auto'
  return (ADMIN_AI_CHAT_PROVIDERS as readonly string[]).includes(s) ? (s as AdminAiChatProvider) : 'auto'
}

function envFallbackRouterMode(): AdminAiAutoRouterMode | null {
  return normalizeAutoRouterMode(process.env.ADMIN_AI_AUTO_ROUTER)
}

export async function loadAdminAiChatPreferences(supabase: SupabaseClient): Promise<AdminAiChatPreferences> {
  const defaults: AdminAiChatPreferences = {
    autoRouterMode: envFallbackRouterMode() ?? 'smart',
    modelOverrides: {},
    assistantDefaultLlm: 'auto',
    sonicDnaLlm: 'auto',
  }

  try {
    const { data, error } = await supabase.from('settings').select('key, value').in('key', ALL_KEYS)
    if (error || !data?.length) {
      return defaults
    }

    const byKey = new Map(data.map((row) => [row.key, row.value]))

    const modeRaw = jsonbToTrimmedString(byKey.get(PREF_KEYS.autoRouterMode))
    const mode = normalizeAutoRouterMode(modeRaw) ?? defaults.autoRouterMode

    const modelOverrides: Partial<Record<AdminAiChatProvider, string>> = {}
    const ma = jsonbToTrimmedString(byKey.get(PREF_KEYS.modelAnthropic))
    const mo = jsonbToTrimmedString(byKey.get(PREF_KEYS.modelOpenai))
    const mol = jsonbToTrimmedString(byKey.get(PREF_KEYS.modelOllama))
    const mc = jsonbToTrimmedString(byKey.get(PREF_KEYS.modelCrowelogic))
    if (ma) modelOverrides.anthropic = ma
    if (mo) modelOverrides.openai = mo
    if (mol) modelOverrides.ollama = mol
    if (mc) modelOverrides.crowelogic = mc

    const assistantDefaultLlm = normalizeAssistantDefaultLlm(byKey.get(PREF_KEYS.assistantDefaultLlm))
    const sonicDnaLlm = normalizeAssistantDefaultLlm(byKey.get(PREF_KEYS.sonicDnaLlm))

    return { autoRouterMode: mode, modelOverrides, assistantDefaultLlm, sonicDnaLlm }
  } catch {
    return defaults
  }
}

export function mergeResolvedModels(
  envModels: Record<AdminAiChatProvider, string>,
  overrides: Partial<Record<AdminAiChatProvider, string>>
): Record<AdminAiChatProvider, string> {
  const pick = (id: AdminAiChatProvider) => {
    const o = overrides[id]?.trim()
    if (!o) return envModels[id]
    if (o === ADMIN_AI_SMART_MODEL_OVERRIDE) return envModels[id]
    return o
  }
  return {
    anthropic: pick('anthropic'),
    openai: pick('openai'),
    ollama: pick('ollama'),
    crowelogic: pick('crowelogic'),
  }
}

export function resolveSonicDnaChatProvider(
  prefs: Pick<AdminAiChatPreferences, 'sonicDnaLlm' | 'assistantDefaultLlm'>,
  envDefault: AdminAiChatProvider | null,
): AdminAiChatProvider | null {
  if (prefs.sonicDnaLlm !== 'auto') return prefs.sonicDnaLlm
  if (prefs.assistantDefaultLlm !== 'auto') return prefs.assistantDefaultLlm
  return envDefault
}

export { PREF_KEYS }
