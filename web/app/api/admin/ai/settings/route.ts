import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'
import { getGloballyDisabledAdminAiTools } from '@/lib/admin-ai'
import {
  listAdminChatProvidersStatus,
  resolveDefaultAdminChatProvider,
} from '@/lib/ai/admin-chat-providers'
import { loadAdminAiChatPreferences, mergeResolvedModels, PREF_KEYS } from '@/lib/ai/admin-ai-chat-preferences'
import { resolveCrowelogicEnv } from '@/lib/ai/crowelogic-env'
import { normalizeAutoRouterMode, type AdminAiAutoRouterMode } from '@/lib/ai/admin-chat-router'
import { ADMIN_AI_CHAT_PROVIDERS, type AdminAiChatProvider } from '@/lib/ai/admin-chat-types'
import { ADMIN_AI_SMART_MODEL_OVERRIDE } from '@/lib/ai/admin-smart-model-picker'
import { getEnvModelIdsResolved } from '@/lib/ai/admin-chat-env-models'

export const dynamic = 'force-dynamic'

const MODEL_KEYS: Record<AdminAiChatProvider, string> = {
  anthropic: PREF_KEYS.modelAnthropic,
  openai: PREF_KEYS.modelOpenai,
  ollama: PREF_KEYS.modelOllama,
  crowelogic: PREF_KEYS.modelCrowelogic,
}

function isValidModelId(value: string): boolean {
  const t = value.trim()
  if (!t || t.length > 200) return false
  if (t === ADMIN_AI_SMART_MODEL_OVERRIDE) return true
  return /^[\w.\-/:]+$/.test(t)
}

export async function GET() {
  const session = await getServerSession()
  if (!session?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const env = await getEnvModelIdsResolved()
  let preferences = {
    autoRouterMode: 'smart' as AdminAiAutoRouterMode,
    envRouterHint: process.env.ADMIN_AI_AUTO_ROUTER?.trim() || null,
    assistantDefaultLlm: 'auto' as 'auto' | AdminAiChatProvider,
    sonicDnaLlm: 'auto' as 'auto' | AdminAiChatProvider,
    modelOverrides: {
      anthropic: null as string | null,
      openai: null as string | null,
      ollama: null as string | null,
      crowelogic: null as string | null,
    },
    resolvedModels: env,
  }

  try {
    const supabase = createSupabaseServerClient()
    const prefs = await loadAdminAiChatPreferences(supabase)
    preferences = {
      autoRouterMode: prefs.autoRouterMode,
      envRouterHint: process.env.ADMIN_AI_AUTO_ROUTER?.trim() || null,
      assistantDefaultLlm: prefs.assistantDefaultLlm,
      sonicDnaLlm: prefs.sonicDnaLlm,
      modelOverrides: {
        anthropic: prefs.modelOverrides.anthropic ?? null,
        openai: prefs.modelOverrides.openai ?? null,
        ollama: prefs.modelOverrides.ollama ?? null,
        crowelogic: prefs.modelOverrides.crowelogic ?? null,
      },
      resolvedModels: mergeResolvedModels(env, prefs.modelOverrides),
    }
  } catch {
    // preferences stay at defaults if Supabase is unavailable
  }

  const crowe = resolveCrowelogicEnv()

  return NextResponse.json({
    chat: {
      configuredProvider: process.env.ADMIN_AI_CHAT_PROVIDER?.trim() || null,
      effectiveDefault: resolveDefaultAdminChatProvider(),
      providers: listAdminChatProvidersStatus(),
      models: env,
      endpoints: {
        openaiBaseUrl: process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com',
        ollamaBaseUrl: process.env.OLLAMA_BASE_URL?.trim() || 'http://127.0.0.1:11434',
        crowelogicBaseUrl: crowe.baseUrl,
        crowelogicBaseSource: crowe.baseSource,
        crowelogicKeySource: crowe.keySource,
      },
      apiKeysPresent: {
        anthropic: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
        openai: Boolean(process.env.OPENAI_API_KEY?.trim()),
        ollama: Boolean(process.env.OLLAMA_API_KEY?.trim()),
        crowelogic: crowe.configured,
      },
    },
    preferences,
    tools: {
      disabledTools: getGloballyDisabledAdminAiTools(),
    },
    digest: {
      dedupMinutes: process.env.ADMIN_AI_DIGEST_DEDUP_MINUTES?.trim() || '45',
      webhookConfigured: Boolean(process.env.ADMIN_AI_DIGEST_WEBHOOK_URL?.trim()),
    },
    note: 'API keys and base URLs are read from server environment only. Router mode and model overrides below are stored in the settings table (Supabase). See web/.env.example for env fallbacks.',
  })
}

export async function PATCH(request: NextRequest) {
  const session = await getServerSession()
  if (!session?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as {
    preferences?: {
      autoRouterMode?: string
      models?: Partial<Record<AdminAiChatProvider, string>>
      assistantDefaultLlm?: string
      sonicDnaLlm?: string
    }
  }

  const prefs = body.preferences
  if (
    !prefs ||
    (prefs.autoRouterMode === undefined &&
      !prefs.models &&
      prefs.assistantDefaultLlm === undefined &&
      prefs.sonicDnaLlm === undefined)
  ) {
    return NextResponse.json(
      {
        error:
          'Provide preferences.autoRouterMode, preferences.models, preferences.assistantDefaultLlm, and/or preferences.sonicDnaLlm',
      },
      { status: 400 }
    )
  }

  const supabase = createSupabaseServerClient()

  if (prefs.autoRouterMode !== undefined) {
    const mode = normalizeAutoRouterMode(String(prefs.autoRouterMode))
    if (!mode) {
      return NextResponse.json({ error: 'autoRouterMode must be smart or env_order' }, { status: 400 })
    }
    const { error } = await supabase.from('settings').upsert(
      {
        key: PREF_KEYS.autoRouterMode,
        value: mode,
        description: 'Admin AI: auto-routing strategy when assistant LLM is Auto (smart = context-aware)',
        updated_by: session.user.id,
      },
      { onConflict: 'key' }
    )
    if (error) {
      console.error('admin ai prefs upsert router mode', error)
      return NextResponse.json({ error: 'Failed to save router mode' }, { status: 500 })
    }
  }

  if (prefs.models && typeof prefs.models === 'object') {
    for (const [id, raw] of Object.entries(prefs.models) as [AdminAiChatProvider, string][]) {
      if (!MODEL_KEYS[id]) continue
      const val = raw === undefined || raw === null ? '' : String(raw)
      if (!val.trim()) {
        const { error } = await supabase.from('settings').delete().eq('key', MODEL_KEYS[id])
        if (error) {
          console.error('admin ai prefs delete model', error)
          return NextResponse.json({ error: `Failed to clear model override for ${id}` }, { status: 500 })
        }
        continue
      }
      if (!isValidModelId(val)) {
        return NextResponse.json(
          { error: `Invalid model id for ${id}: use letters, numbers, dots, slashes, colons, dashes (max 200 chars)` },
          { status: 400 }
        )
      }
      const { error } = await supabase.from('settings').upsert(
        {
          key: MODEL_KEYS[id],
          value: val.trim(),
          description: `Admin AI: chat model override for ${id} (overrides env default when set)`,
          updated_by: session.user.id,
        },
        { onConflict: 'key' }
      )
      if (error) {
        console.error('admin ai prefs upsert model', error)
        return NextResponse.json({ error: `Failed to save model for ${id}` }, { status: 500 })
      }
    }
  }

  if (prefs.assistantDefaultLlm !== undefined) {
    const raw = String(prefs.assistantDefaultLlm).toLowerCase().trim()
    if (!raw || raw === 'auto') {
      const { error } = await supabase.from('settings').delete().eq('key', PREF_KEYS.assistantDefaultLlm)
      if (error) {
        console.error('admin ai prefs delete assistant default', error)
        return NextResponse.json({ error: 'Failed to clear assistant default LLM' }, { status: 500 })
      }
    } else if (!(ADMIN_AI_CHAT_PROVIDERS as readonly string[]).includes(raw)) {
      return NextResponse.json(
        { error: 'assistantDefaultLlm must be auto, anthropic, openai, ollama, or crowelogic' },
        { status: 400 }
      )
    } else {
      const { error } = await supabase.from('settings').upsert(
        {
          key: PREF_KEYS.assistantDefaultLlm,
          value: raw,
          description: 'Admin AI: default LLM in floating assistant (auto = use Auto routing)',
          updated_by: session.user.id,
        },
        { onConflict: 'key' }
      )
      if (error) {
        console.error('admin ai prefs upsert assistant default', error)
        return NextResponse.json({ error: 'Failed to save assistant default LLM' }, { status: 500 })
      }
    }
  }

  if (prefs.sonicDnaLlm !== undefined) {
    const raw = String(prefs.sonicDnaLlm).toLowerCase().trim()
    if (!raw || raw === 'auto') {
      const { error } = await supabase.from('settings').delete().eq('key', PREF_KEYS.sonicDnaLlm)
      if (error) {
        console.error('admin ai prefs delete sonic dna llm', error)
        return NextResponse.json({ error: 'Failed to clear Sonic DNA LLM' }, { status: 500 })
      }
    } else if (!(ADMIN_AI_CHAT_PROVIDERS as readonly string[]).includes(raw)) {
      return NextResponse.json(
        { error: 'sonicDnaLlm must be auto, anthropic, openai, ollama, or crowelogic' },
        { status: 400 }
      )
    } else {
      const { error } = await supabase.from('settings').upsert(
        {
          key: PREF_KEYS.sonicDnaLlm,
          value: raw,
          description: 'Admin AI: LLM for Sonic DNA question, challenge, and regenerate',
          updated_by: session.user.id,
        },
        { onConflict: 'key' }
      )
      if (error) {
        console.error('admin ai prefs upsert sonic dna llm', error)
        return NextResponse.json({ error: 'Failed to save Sonic DNA LLM' }, { status: 500 })
      }
    }
  }

  await logActivity({
    actionType: 'update',
    resourceType: 'setting',
    resourceId: 'admin_ai_preferences',
    details: { keys: Object.keys(prefs) },
  })

  return NextResponse.json({ success: true })
}
