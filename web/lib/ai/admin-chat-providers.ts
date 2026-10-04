import Anthropic from '@anthropic-ai/sdk'
import {
  anthropicChatModelCandidates,
  isAnthropicModelNotFoundError,
} from '@/lib/ai/admin-anthropic-defaults'
import { ADMIN_AI_CHAT_PROVIDERS, type AdminAiChatProvider } from '@/lib/ai/admin-chat-types'
import {
  crowelogicChatBlockReason,
  isCrowelogicConfigured,
  resolveCrowelogicEnv,
  crowelogicOpenAiUrl,
} from '@/lib/ai/crowelogic-env'
import { ADMIN_AI_SMART_MODEL_OVERRIDE, pickSmartChatModelId } from '@/lib/ai/admin-smart-model-picker'
import { buildSmartProviderOrder, type AdminAiAutoRouterMode } from '@/lib/ai/admin-chat-router'
import { resolveInferredSkillForAdminChat } from '@/lib/ai/admin-chat-infer-skill'
import { resolveOllamaModelIdForRequest } from '@/lib/ai/ollama-model-resolve'
import {
  buildSessionTuningPrompt,
  type AdminChatEnergyPreset,
  type AdminChatHonestyMode,
} from '@/lib/ai/admin-chat-session-tuning'
import { agentToolCatalogPrompt } from '@/lib/ai/admin-ai-agent-tools'
import { applyDiffPromptHint } from '@/lib/ai/admin-ai-apply-diff'
import { mentionCatalogPrompt } from '@/lib/ai/admin-ai-mentions'
import { adminAiToolLiteracyPrompt } from '@/lib/ai/admin-ai-tool-literacy'
import { adminChatActionChoicesPrompt } from '@/lib/ai/admin-chat-action-choices'
import type { AdminSkill } from '@/lib/ai/skills/types'

const CHAT_MAX_TOKENS = 900
const AGENT_MAX_TOKENS = 2_500

function readEnvTimeoutMs(name: string, defaultMs: number): number {
  const raw = Number.parseInt(process.env[name] || '', 10)
  return Number.isFinite(raw) && raw > 0 ? raw : defaultMs
}

/** Per-request cap for /v1/chat/completions (OpenAI + CroweLogic). */
const CHAT_COMPLETION_DEFAULT_TIMEOUT_MS = readEnvTimeoutMs('ADMIN_AI_CHAT_FETCH_TIMEOUT_MS', 100_000)
/** Shorter default for local Ollama so the router can try other providers after a hang. */
const OLLAMA_CHAT_COMPLETION_TIMEOUT_MS = readEnvTimeoutMs('ADMIN_AI_OLLAMA_TIMEOUT_MS', 30_000)

export type { AdminAiChatProvider }

const SUPPORTED: AdminAiChatProvider[] = [...ADMIN_AI_CHAT_PROVIDERS]

function normalizeProvider(value: string | undefined): AdminAiChatProvider | null {
  const v = value?.toLowerCase().trim()
  if (!v) return null
  return (SUPPORTED as string[]).includes(v) ? (v as AdminAiChatProvider) : null
}

function buildSystemPrompt(
  inferredSkill: AdminSkill,
  siteKnowledgePrompt?: string | null,
  pageContextPrompt?: string | null,
  sessionTuningPrompt?: string | null,
  agentMode?: boolean,
) {
  const globalExecHonesty = [
    'Writes and browser clicks/types need `/exec <tool_name> {<json>}` or Plan → Preview → Approve.',
    'When LIVE CONTEXT or TOOL RESULT blocks are present, treat them as read-only output already captured for this turn — cite them; do not claim a separate `/exec` ran unless the user submitted one.',
    'Required `/exec` format: one line `/exec <tool_name> ` then a single JSON object with double-quoted keys. Example: `/exec query_ops_snapshot {"focus":"studio"}`. Invalid examples: `/exec query_ops_snapshot focus=studio` or any shell-style `key=value` without JSON.',
  ].join(' ')

  const toolHints =
    inferredSkill.id === 'admin_intel'
      ? 'Pipeline-wide summaries: `/exec query_ops_snapshot {"focus":"studio"}` (distribution/releases aggregate), `{"focus":"nurturing"}`, or `{"focus":"all"}`. For **due dates and roll-up priorities**, also suggest `/exec query_studio_command_center {"dueWithinDays":14}` (Release Studio tool—mention explicitly). Never invent counts—pull snapshots first.'
      : inferredSkill.id === 'sergik_intelligence'
        ? 'Intelligence stack: `/exec query_intelligence_harness {"mode":"stack","releaseId":"…"}`. SergikAI chat: `/exec query_sergikai_chat {"content":"…","dryRun":true}` then approve. Crowe Creative: `/exec query_crowe_creative {"action":"quote","kind":"video","model":"seedance"}` before generate. Modes on harness: ping | catalog | probe | knowledge | dev_mode.'
      : inferredSkill.id === 'music_business_counsel'
        ? 'Contract audit: `/exec audit_music_contract {"releaseId":"<id>","dealKind":"split_sheet"}` or pass `text`. Read-only. Cite topic ids from the memo. Do not write the copyright checklist from this agent.'
      : inferredSkill.id === 'studio_release'
        ? 'Per-release drill-down: `/exec query_release_studio_snapshot {"releaseId":"<id>"}` — response includes adminAiBrief (empty marketing fields, copy_intel per track, sonicDnaUnified, YouTube timestamp timeline). Writes: `/exec patch_release_marketing_copy {"releaseId":"<id>","marketingCopy":{...},"merge":true,"dryRun":true}` then approve without dryRun. Rolling calendar: `/exec query_studio_command_center {"dueWithinDays":7}`. Harness/RAG: query_intelligence_harness with releaseId. For tags/social/store discovery expansion, suggest switching to product_strategy or growth_marketing after the snapshot—never claim live DSP unless distributor_status is live.'
        : inferredSkill.id === 'product_strategy'
          ? 'Lead with structured scaffolding: Plan mode or `/exec draft_product_strategy_pack` for audits, conversion workflows, SEO outlines, campaign calendars, and paste-ready admin snippets. Meta promo publish desk: `/exec run_meta_promo_pipeline {"releaseId":"<id>","action":"status","primaryGoal":"Meta promo"}` with dryRun, then generate, arm, and publish or advance. Never invent post counts or claim Instagram DMs to all followers. Ask for URLs and screenshots early; never invent analytics—tell them how to verify. For Supabase campaign rows + tasks use Growth Marketing (`generate_campaign_draft`); for UTM/smartlinks use the Smartlink agent (`generate_smartlink_utm_plan`).'
          : inferredSkill.id === 'growth_marketing'
            ? 'Always ground in `/exec query_platform_growth_snapshot {}` (or the injected PLATFORM GROWTH SNAPSHOT). Re-ingest desks with `/exec admin_browser {"action":"navigate","url":"…"}` then `{"action":"read"}`. Persist work with `generate_campaign_draft` + `generate_smartlink_utm_plan`. Never invent ML/streams/followers; never push Marquee while ineligible. Hand Meta publish to product_strategy `run_meta_promo_pipeline`.'
            : ''
  const focusCopilot =
    pageContextPrompt?.includes('USER FOCUS')
      ? 'The user has a form field focused in the app. Prioritize that field for suggestions, rewrites, and fill requests. Use the ai-apply fenced block when providing a value to paste into the focused control.'
      : ''

  return [
    'You are an admin copilot for a music brand.',
    adminChatActionChoicesPrompt(),
    adminAiToolLiteracyPrompt(),
    mentionCatalogPrompt(),
    applyDiffPromptHint(),
    agentMode ? agentToolCatalogPrompt() : '',
    globalExecHonesty,
    inferredSkill.systemPrompt,
    toolHints,
    focusCopilot,
    siteKnowledgePrompt?.trim() ? `\n---\n${siteKnowledgePrompt.trim()}` : '',
    pageContextPrompt?.trim() ? `\n---\n${pageContextPrompt.trim()}` : '',
    sessionTuningPrompt?.trim() ? `\n---\n${sessionTuningPrompt.trim()}` : '',
  ]
    .filter(Boolean)
    .join(' ')
}

function isAnthropicConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim())
}

function isOpenAiChatConfigured() {
  return Boolean(process.env.OPENAI_API_KEY?.trim())
}

function isOllamaConfigured() {
  const base = process.env.OLLAMA_BASE_URL?.trim() || 'http://127.0.0.1:11434'
  return Boolean(base)
}

function isProviderConfigured(id: AdminAiChatProvider): boolean {
  if (id === 'anthropic') return isAnthropicConfigured()
  if (id === 'openai') return isOpenAiChatConfigured()
  if (id === 'ollama') return isOllamaConfigured()
  return isCrowelogicConfigured()
}

export function listAdminChatProvidersStatus(): {
  id: AdminAiChatProvider
  configured: boolean
}[] {
  return [
    { id: 'anthropic', configured: isAnthropicConfigured() },
    { id: 'openai', configured: isOpenAiChatConfigured() },
    { id: 'ollama', configured: isOllamaConfigured() },
    { id: 'crowelogic', configured: isCrowelogicConfigured() },
  ]
}

/** Default provider from ADMIN_AI_CHAT_PROVIDER or first provider with credentials (ollama last). */
export function resolveDefaultAdminChatProvider(): AdminAiChatProvider | null {
  const fromEnv = normalizeProvider(process.env.ADMIN_AI_CHAT_PROVIDER)
  if (fromEnv && isProviderConfigured(fromEnv)) return fromEnv

  if (isAnthropicConfigured()) return 'anthropic'
  if (isOpenAiChatConfigured()) return 'openai'
  if (isCrowelogicConfigured()) return 'crowelogic'
  return 'ollama'
}

function localGuidanceReply(
  message: string,
  inferredSkill: AdminSkill,
  errors: string[],
) {
  const hint =
    errors.length === 0
      ? 'Set credentials for at least one provider.'
      : errors.length === 1
        ? `Last error: ${errors[0]}`
        : ['Provider errors:', ...errors.map((e, i) => `${i + 1}. ${e}`)].join('\n')
  return {
    reply: [
      'No LLM provider is available with the current environment.',
      hint,
      `Request received: "${message.slice(0, 500)}${message.length > 500 ? '…' : ''}"`,
      `Detected skill: ${inferredSkill.name} (${inferredSkill.id}).`,
      '',
      'Configure one of: ANTHROPIC_API_KEY, OPENAI_API_KEY (+ optional OPENAI_CHAT_MODEL), OLLAMA_BASE_URL (+ OLLAMA_MODEL), or CROWELOGIC_API_KEY for CroweLM chat (local bridge, or hosted gateway after Pro linkage).',
      'Set ADMIN_AI_CHAT_PROVIDER to anthropic | openai | ollama | crowelogic to force a provider.',
    ].join('\n'),
    skill: inferredSkill,
    provider: null as AdminAiChatProvider | null,
  }
}

async function completeOpenAICompatibleChat(params: {
  baseUrl: string
  apiKey?: string
  model: string
  system: string
  user: string
  /** Override default (e.g. short timeout for local Ollama so other providers can run). */
  timeoutMs?: number
  /** CroweLM hosted gateway uses base ending in /v1 (no double /v1/). */
  crowelogic?: boolean
  maxTokens?: number
}): Promise<string> {
  const base = params.baseUrl.replace(/\/$/, '')
  const url =
    params.crowelogic === true
      ? crowelogicOpenAiUrl(base, 'chat/completions')
      : `${base}/v1/chat/completions`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (params.apiKey) {
    headers.Authorization = `Bearer ${params.apiKey}`
  }

  const timeoutMs = params.timeoutMs ?? CHAT_COMPLETION_DEFAULT_TIMEOUT_MS
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      signal: ctrl.signal,
      body: JSON.stringify({
        model: params.model,
        messages: [
          { role: 'system', content: params.system },
          { role: 'user', content: params.user },
        ],
        max_tokens: params.maxTokens ?? CHAT_MAX_TOKENS,
        temperature: 0.35,
      }),
    })
  } catch (e) {
    if (e instanceof Error && (e.name === 'AbortError' || e.message === 'The operation was aborted.')) {
      throw new Error(
        `Chat request timed out after ${Math.round(timeoutMs / 1000)}s (is Ollama or gateway reachable?)`
      )
    }
    throw e
  } finally {
    clearTimeout(t)
  }

  const json = (await res.json().catch(() => ({}))) as {
    choices?: Array<{ message?: { content?: string } }>
    error?: { message?: string }
  }

  if (!res.ok) {
    const msg = json.error?.message || `HTTP ${res.status}`
    throw new Error(`${msg}`)
  }

  const text = json.choices?.[0]?.message?.content?.trim()
  if (!text) {
    throw new Error('Empty completion from chat API')
  }
  return text
}

async function generateWithAnthropic(
  message: string,
  system: string,
  modelOverride?: string | null,
  maxTokens?: number,
) {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set')
  const anthropic = new Anthropic({
    apiKey: key,
    maxRetries: 0,
    timeout: 95_000,
  })
  let lastError: unknown
  for (const model of anthropicChatModelCandidates(modelOverride)) {
    try {
      const response = await anthropic.messages.create({
        model,
        max_tokens: maxTokens ?? CHAT_MAX_TOKENS,
        system,
        messages: [{ role: 'user', content: message }],
      })
      const textParts = response.content
        .filter((part) => part.type === 'text')
        .map((part) => part.text.trim())
        .filter(Boolean)
      if (!textParts.length) throw new Error('No textual response from Anthropic')
      return textParts.join('\n\n')
    } catch (e) {
      lastError = e
      if (!isAnthropicModelNotFoundError(e)) throw e
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Anthropic model not found')
}

async function generateWithOpenAI(
  message: string,
  system: string,
  modelOverride?: string | null,
  maxTokens?: number,
) {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY is not set')
  const model = modelOverride?.trim() || process.env.OPENAI_CHAT_MODEL?.trim() || 'gpt-4o-mini'
  const base = process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com'
  return completeOpenAICompatibleChat({
    baseUrl: base,
    apiKey: key,
    model,
    system,
    user: message,
    timeoutMs: CHAT_COMPLETION_DEFAULT_TIMEOUT_MS,
    maxTokens,
  })
}

async function generateWithOllama(
  message: string,
  system: string,
  modelOverride?: string | null,
  maxTokens?: number,
) {
  const base = process.env.OLLAMA_BASE_URL?.trim() || 'http://127.0.0.1:11434'
  const model = await resolveOllamaModelIdForRequest(modelOverride)
  return completeOpenAICompatibleChat({
    baseUrl: base,
    apiKey: process.env.OLLAMA_API_KEY?.trim() || undefined,
    model,
    system,
    user: message,
    timeoutMs: OLLAMA_CHAT_COMPLETION_TIMEOUT_MS,
    maxTokens,
  })
}

async function generateWithCrowelogic(
  message: string,
  system: string,
  modelOverride?: string | null,
  maxTokens?: number,
) {
  const crowe = resolveCrowelogicEnv()
  if (!crowe.configured) {
    throw new Error(crowelogicChatBlockReason(crowe) ?? 'CroweLM chat is not available.')
  }
  const model = modelOverride?.trim() || crowe.model
  return completeOpenAICompatibleChat({
    baseUrl: crowe.baseUrl,
    apiKey: crowe.apiKey,
    model,
    system,
    user: message,
    timeoutMs: CHAT_COMPLETION_DEFAULT_TIMEOUT_MS,
    crowelogic: true,
    maxTokens,
  })
}

export type AdminChatModelOverrides = Partial<Record<AdminAiChatProvider, string>>

export type AdminChatReply = {
  reply: string
  skill: AdminSkill
  provider: AdminAiChatProvider | null
  /** Concrete model id passed to the provider API for this reply. */
  modelId?: string
}

export async function generateAdminChatReply(
  message: string,
  options?: {
    provider?: AdminAiChatProvider | string | null
    modelOverrides?: AdminChatModelOverrides
    /**
     * Effective model per provider (env + Supabase merge from mergeResolvedModels).
     * Used when no per-provider override or when override is empty.
     */
    resolvedModelIds?: Partial<Record<AdminAiChatProvider, string>>
    /** When true (e.g. user picked a provider in the assistant), only that provider is tried. */
    strictProvider?: boolean
    autoRouterMode?: AdminAiAutoRouterMode
    /** Constrain the assistant to a specific admin agent (skill) persona. */
    skillId?: string | null
    /** When Auto/chat mode and the message is a bare continuation (“proceed”, “yes”), reuse this persona. */
    stickySkillId?: string | null
    /** Optional session UX: stricter vs brainstorm-friendly framing. */
    honestyMode?: AdminChatHonestyMode | null
    /** Optional session UX: response pacing / checklist density. */
    energyPreset?: AdminChatEnergyPreset | null
    /** Compact, query-aware route and architecture grounding from the generated site index. */
    siteKnowledgePrompt?: string | null
    pageContextPrompt?: string | null
    /** Enables /tool mid-turn catalog + higher max_tokens. */
    agentMode?: boolean
  }
): Promise<AdminChatReply> {
  const inferredSkill = resolveInferredSkillForAdminChat(message, {
    skillId: options?.skillId,
    stickySkillId: options?.stickySkillId,
  })
  const sessionTuning = buildSessionTuningPrompt(options?.honestyMode ?? null, options?.energyPreset ?? null)
  const agentMode = Boolean(options?.agentMode)
  const maxTokens = agentMode ? AGENT_MAX_TOKENS : CHAT_MAX_TOKENS
  const system = buildSystemPrompt(
    inferredSkill,
    options?.siteKnowledgePrompt,
    options?.pageContextPrompt,
    sessionTuning,
    agentMode,
  )

  const requested = normalizeProvider(
    typeof options?.provider === 'string' ? options.provider : options?.provider ?? undefined
  )

  const modelOverrides = options?.modelOverrides ?? {}
  const resolvedModelIds = options?.resolvedModelIds
  const strictProvider = Boolean(options?.strictProvider && requested)
  const autoMode: AdminAiAutoRouterMode = options?.autoRouterMode ?? 'smart'

  const tryOrder: AdminAiChatProvider[] = []
  if (requested) {
    if (strictProvider) {
      tryOrder.push(requested)
    } else if (isProviderConfigured(requested)) {
      tryOrder.push(requested)
      const fallback = resolveDefaultAdminChatProvider()
      if (fallback && !tryOrder.includes(fallback)) {
        tryOrder.push(fallback)
      }
      for (const p of SUPPORTED) {
        if (!tryOrder.includes(p)) tryOrder.push(p)
      }
    }
  }
  if (tryOrder.length === 0) {
    if (autoMode === 'smart') {
      for (const p of buildSmartProviderOrder(message, inferredSkill)) {
        if (!tryOrder.includes(p)) tryOrder.push(p)
      }
    } else {
      const fallback = resolveDefaultAdminChatProvider()
      if (fallback) {
        tryOrder.push(fallback)
      }
      for (const p of SUPPORTED) {
        if (!tryOrder.includes(p)) tryOrder.push(p)
      }
    }
  }

  const providerErrors: string[] = []
  for (const provider of tryOrder) {
    try {
      let reply: string
      const modelFor = (id: AdminAiChatProvider) => {
        const raw = modelOverrides[id]?.trim()
        if (raw === ADMIN_AI_SMART_MODEL_OVERRIDE) {
          return pickSmartChatModelId(id, message, inferredSkill)
        }
        if (raw) return raw
        return resolvedModelIds?.[id]
      }
      const modelIdUsed = modelFor(provider)
      if (provider === 'anthropic') {
        if (!isAnthropicConfigured()) continue
        reply = await generateWithAnthropic(message, system, modelIdUsed, maxTokens)
      } else if (provider === 'openai') {
        if (!isOpenAiChatConfigured()) continue
        reply = await generateWithOpenAI(message, system, modelIdUsed, maxTokens)
      } else if (provider === 'ollama') {
        reply = await generateWithOllama(message, system, modelIdUsed, maxTokens)
      } else {
        if (!isCrowelogicConfigured()) continue
        reply = await generateWithCrowelogic(message, system, modelIdUsed, maxTokens)
      }
      return {
        reply,
        skill: inferredSkill,
        provider,
        modelId: modelIdUsed || undefined,
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      providerErrors.push(`${provider}: ${msg}`)
      continue
    }
  }

  return localGuidanceReply(message, inferredSkill, providerErrors)
}
