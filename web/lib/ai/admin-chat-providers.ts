import Anthropic from '@anthropic-ai/sdk'
import { takeChatStreamDeltas } from '@/lib/ai/admin-ai-reply-stream'
import {
  anthropicChatModelCandidates,
  isAnthropicModelNotFoundError,
} from '@/lib/ai/admin-anthropic-defaults'
import { ADMIN_AI_CHAT_PROVIDERS, type AdminAiChatProvider } from '@/lib/ai/admin-chat-types'
import {
  crowelogicChatBlockReason,
  crowelogicChatHeaders,
  isCrowelogicConfigured,
  resolveCrowelogicEnv,
  crowelogicOpenAiUrl,
} from '@/lib/ai/crowelogic-env'
import { ADMIN_AI_SMART_MODEL_OVERRIDE, pickSmartChatModelId } from '@/lib/ai/admin-smart-model-picker'
import { buildSmartProviderOrder, type AdminAiAutoRouterMode } from '@/lib/ai/admin-chat-router'
import { resolveInferredSkillForAdminChat } from '@/lib/ai/admin-chat-infer-skill'
import { runCursorAdminTurn, runCursorPrompt } from '@/lib/ai/cursor-intelligence-harness'
import { resolveOllamaAdminModelId } from '@/lib/ai/ollama-model-resolve'
import {
  buildSessionTuningPrompt,
  type AdminChatEnergyPreset,
  type AdminChatHonestyMode,
} from '@/lib/ai/admin-chat-session-tuning'
import { agentToolCatalogPrompt, parseAgentToolCalls } from '@/lib/ai/admin-ai-agent-tools'
import {
  agentReasoningProviderOrder,
  anthropicToolSpecs,
  openAiToolSpecs,
  readAnthropicAgentContent,
  toAnthropicMessages,
  toOpenAiMessages,
  toolCallsFromOpenAiMessage,
  type AgentToolCall,
  type AgentTranscriptMessage,
} from '@/lib/ai/admin-ai-agent-transcript'
import { applyDiffPromptHint } from '@/lib/ai/admin-ai-apply-diff'
import { sanitizeConnectedProviderReply } from '@/lib/ai/admin-chat-provider-echo'
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
/** Local sergikai is an 8B model. 30s aborted mid-reply after Anthropic credits ran out. */
const OLLAMA_CHAT_COMPLETION_TIMEOUT_MS = readEnvTimeoutMs('ADMIN_AI_OLLAMA_TIMEOUT_MS', 120_000)

export type { AdminAiChatProvider }

const SUPPORTED: AdminAiChatProvider[] = [...ADMIN_AI_CHAT_PROVIDERS]

/** Account-level refusals (empty credits, quota) should not pin chat to that provider. */
export function isProviderBillingBlock(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /credit balance is too low|insufficient[_\s-]?quota|purchase credits|exceeded your current quota|payment required/i.test(
    message,
  )
}

export function isChatAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.name === 'AbortError' || /operation was aborted/i.test(error.message)
}

function ollamaCanAnswer(): boolean {
  if (process.env.OLLAMA_BASE_URL?.trim() || process.env.OLLAMA_MODEL?.trim()) return true
  return !process.env.VERCEL && process.env.NODE_ENV !== 'production'
}

function appendAccountFallbacks(tryOrder: AdminAiChatProvider[]) {
  const next: AdminAiChatProvider[] = []
  if (isOpenAiChatConfigured()) next.push('openai')
  if (isCrowelogicConfigured()) next.push('crowelogic')
  if (isCursorConfigured()) next.push('cursor')
  if (ollamaCanAnswer()) next.push('ollama')
  for (const id of next) {
    if (!tryOrder.includes(id)) tryOrder.push(id)
  }
}

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
  const globalExecHonesty = agentMode
    ? [
        'AGENT CONTRACT',
        'Read tools run immediately. Do not ask permission before a read, a search, a navigation, or a field probe.',
        'Preview tools in this loop are dry runs and do not save. Say they are previews.',
        'A database write happens only after the user approves. Do not claim a field was saved.',
        'A count, title, code, date, or live status must appear in LIVE CONTEXT, the open form, or a tool result from this turn.',
        'If THREAD MEMORY lists a checklist, do the next step. Do not repeat a step under Done.',
        'Skill text below may mention /exec. In agent mode, call the tool yourself. /exec is how the user approves a write after the dry run.',
        'You are the model selected for this turn. Probe the agent and tool harness yourself, including query_intelligence_harness. Do not hand this turn to another provider.',
      ].join('\n')
    : [
        'Writes and browser clicks/types need `/exec <tool_name> {<json>}` or Plan → Preview → Approve.',
        'When LIVE CONTEXT or TOOL RESULT blocks are present, treat them as read-only output already captured for this turn — cite them; do not claim a separate `/exec` ran unless the user submitted one.',
        'Required `/exec` format: one line `/exec <tool_name> ` then a single JSON object with double-quoted keys. Example: `/exec query_ops_snapshot {"focus":"studio"}`. Invalid examples: `/exec query_ops_snapshot focus=studio` or any shell-style `key=value` without JSON.',
      ].join('\n')

  const toolHints = agentMode
    ? ''
    : inferredSkill.id === 'admin_intel'
      ? 'Pipeline-wide summaries: `/exec query_ops_snapshot {"focus":"studio"}` (distribution/releases aggregate), `{"focus":"nurturing"}`, or `{"focus":"all"}`. For **due dates and roll-up priorities**, also suggest `/exec query_studio_command_center {"dueWithinDays":14}` (Release Studio tool—mention explicitly). Never invent counts—pull snapshots first.'
      : inferredSkill.id === 'sergik_intelligence'
        ? 'Intelligence stack: `/exec query_intelligence_harness {"mode":"stack","releaseId":"…"}`. SergikAI chat: `/exec query_sergikai_chat {"content":"…","dryRun":true}` then approve. Crowe Creative: `/exec query_crowe_creative {"action":"quote","kind":"video","model":"seedance"}` before generate. Meta Business Agent: `/exec query_meta_business_agent {"action":"status"}` then `{"action":"test","message":"…"}`. Test chat only. Modes on harness: ping | catalog | probe | knowledge | dev_mode.'
      : inferredSkill.id === 'music_business_counsel'
        ? 'Contract audit: `/exec audit_music_contract {"releaseId":"<id>","dealKind":"split_sheet"}` or pass `text`. Read-only. Cite topic ids from the memo. Do not write the copyright checklist from this agent.'
      : inferredSkill.id === 'music_business_books'
        ? 'Books review: `/exec audit_music_books {"quotedCents":0,"paidCents":0,"currency":"usd","text":"…"}`. Read-only. Do not invent tax or payout figures.'
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
    'You are an admin copilot for a music brand. You are connected. Never say that no LLM provider is available, and never tell the user to set an API key.',
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
    .join('\n\n')
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

function isCursorConfigured() {
  return Boolean(process.env.CURSOR_API_KEY?.trim())
}

function isProviderConfigured(id: AdminAiChatProvider): boolean {
  if (id === 'anthropic') return isAnthropicConfigured()
  if (id === 'openai') return isOpenAiChatConfigured()
  if (id === 'ollama') return isOllamaConfigured()
  if (id === 'cursor') return isCursorConfigured()
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
    { id: 'cursor', configured: isCursorConfigured() },
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
      'Configure one of: ANTHROPIC_API_KEY, OPENAI_API_KEY (+ optional OPENAI_CHAT_MODEL), OLLAMA_BASE_URL (+ OLLAMA_MODEL), CURSOR_API_KEY for Cursor plan models, or CROWELOGIC_API_KEY for CroweLM chat (local bridge, or hosted gateway after Pro linkage).',
      'Set ADMIN_AI_CHAT_PROVIDER to anthropic | openai | ollama | crowelogic | cursor to force a provider.',
    ].join('\n'),
    skill: inferredSkill,
    provider: null as AdminAiChatProvider | null,
  }
}

async function revealBufferedReply(text: string, onDelta: (chunk: string) => void) {
  const size = 18
  for (let index = 0; index < text.length; index += size) {
    onDelta(text.slice(index, index + size))
    await new Promise((resolve) => setTimeout(resolve, 12))
  }
}

async function readProviderDeltas(res: Response, onDelta: (chunk: string) => void): Promise<string> {
  const type = res.headers.get('content-type') || ''
  if (type.includes('application/json') || !res.body) {
    const json = (await res.json().catch(() => ({}))) as {
      choices?: Array<{ message?: { content?: string } }>
      content?: Array<{ text?: string }>
    }
    const text =
      json.choices?.[0]?.message?.content?.trim() ||
      json.content
        ?.map((part) => part.text || '')
        .filter(Boolean)
        .join('\n\n')
        .trim() ||
      ''
    if (!text) throw new Error('Empty completion from chat API')
    await revealBufferedReply(text, onDelta)
    return text
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''
  const take = (chunk: string) => {
    const parsed = takeChatStreamDeltas(chunk)
    buffer = parsed.rest
    for (const delta of parsed.deltas) {
      full += delta
      onDelta(delta)
    }
  }
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const pending = buffer
    buffer = ''
    take(pending)
  }
  buffer += decoder.decode()
  take(`${buffer}\n`)
  const text = full.trim()
  if (!text) throw new Error('Empty completion from chat API')
  return text
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
  temperature?: number
  onDelta?: (chunk: string) => void
}): Promise<string> {
  const base = params.baseUrl.replace(/\/$/, '')
  const url =
    params.crowelogic === true
      ? crowelogicOpenAiUrl(base, 'chat/completions')
      : `${base}/v1/chat/completions`
  const headers: Record<string, string> = params.crowelogic && params.apiKey
    ? crowelogicChatHeaders(params.apiKey)
    : { 'Content-Type': 'application/json' }
  if (!params.crowelogic && params.apiKey) {
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
        temperature: params.temperature ?? 0.35,
        ...(params.crowelogic ? { stream: false } : params.onDelta ? { stream: true } : {}),
      }),
    })
  } catch (e) {
    clearTimeout(t)
    if (isChatAbortError(e)) {
      throw new Error(
        `Chat request timed out after ${Math.round(timeoutMs / 1000)}s (is Ollama or gateway reachable?)`
      )
    }
    throw e
  }

  if (!res.ok) {
    clearTimeout(t)
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
    throw new Error(json.error?.message || `HTTP ${res.status}`)
  }

  try {
    if (!params.onDelta) {
      const json = (await res.json().catch(() => ({}))) as {
        choices?: Array<{ message?: { content?: string } }>
      }
      const text = json.choices?.[0]?.message?.content?.trim()
      if (!text) throw new Error('Empty completion from chat API')
      return text
    }
    return await readProviderDeltas(res, params.onDelta)
  } catch (e) {
    if (isChatAbortError(e)) {
      throw new Error(
        `Chat request timed out after ${Math.round(timeoutMs / 1000)}s (is Ollama or gateway reachable?)`
      )
    }
    throw e
  } finally {
    clearTimeout(t)
  }
}

async function streamAnthropicMessage(params: {
  apiKey: string
  model: string
  system: string
  message: string
  maxTokens: number
  onDelta: (chunk: string) => void
}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 95_000)
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': params.apiKey,
        'anthropic-version': '2023-06-01',
      },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: params.model,
        max_tokens: params.maxTokens,
        system: params.system,
        messages: [{ role: 'user', content: params.message }],
        stream: true,
      }),
    })
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; type?: string } }
      const err = new Error(
        `${json.error?.type || 'anthropic'} ${res.status} ${json.error?.message || ''}`.trim(),
      ) as Error & { status?: number }
      err.status = res.status
      throw err
    }
    return await readProviderDeltas(res, params.onDelta)
  } finally {
    clearTimeout(timer)
  }
}

async function generateWithAnthropic(
  message: string,
  system: string,
  modelOverride?: string | null,
  maxTokens?: number,
  onDelta?: (chunk: string) => void,
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
      if (onDelta) {
        return await streamAnthropicMessage({
          apiKey: key,
          model,
          system,
          message,
          maxTokens: maxTokens ?? CHAT_MAX_TOKENS,
          onDelta,
        })
      }
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
  onDelta?: (chunk: string) => void,
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
    onDelta,
  })
}

async function generateWithOllama(
  message: string,
  system: string,
  modelOverride?: string | null,
  maxTokens?: number,
  onDelta?: (chunk: string) => void,
) {
  const base = process.env.OLLAMA_BASE_URL?.trim() || 'http://127.0.0.1:11434'
  const model = await resolveOllamaAdminModelId(modelOverride)
  return completeOpenAICompatibleChat({
    baseUrl: base,
    apiKey: process.env.OLLAMA_API_KEY?.trim() || undefined,
    model,
    system,
    user: message,
    timeoutMs: OLLAMA_CHAT_COMPLETION_TIMEOUT_MS,
    maxTokens: Math.min(maxTokens ?? 700, 700),
    temperature: 0.2,
    onDelta,
  })
}

async function generateWithCrowelogic(
  message: string,
  system: string,
  modelOverride?: string | null,
  maxTokens?: number,
  onDelta?: (chunk: string) => void,
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
    onDelta,
  })
}

export type AdminChatModelOverrides = Partial<Record<AdminAiChatProvider, string>>

export type AdminChatReply = {
  reply: string
  skill: AdminSkill
  provider: AdminAiChatProvider | null
  /** Concrete model id passed to the provider API for this reply. */
  modelId?: string
  toolCalls?: AgentToolCall[]
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
    /** Called with each provider token chunk while the reply is still being written. */
    onDelta?: (chunk: string) => void
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
        reply = await generateWithAnthropic(message, system, modelIdUsed, maxTokens, options?.onDelta)
      } else if (provider === 'openai') {
        if (!isOpenAiChatConfigured()) continue
        reply = await generateWithOpenAI(message, system, modelIdUsed, maxTokens, options?.onDelta)
      } else if (provider === 'cursor') {
        if (!isCursorConfigured()) continue
        const cursor = await runCursorPrompt({
          prompt: `${system}\n\n${message}`,
          model: modelIdUsed,
          onDelta: options?.onDelta,
        })
        if (!cursor.ok) throw new Error(cursor.error || 'Cursor chat failed')
        reply = cursor.text
        if (options?.onDelta && reply && !cursor.streamed) await revealBufferedReply(reply, options.onDelta)
      } else if (provider === 'ollama') {
        reply = await generateWithOllama(message, system, modelIdUsed, maxTokens, options?.onDelta)
      } else {
        if (!isCrowelogicConfigured()) continue
        reply = await generateWithCrowelogic(message, system, modelIdUsed, maxTokens, options?.onDelta)
      }
      return {
        reply: sanitizeConnectedProviderReply(reply, provider, message),
        skill: inferredSkill,
        provider,
        modelId: modelIdUsed || undefined,
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      providerErrors.push(`${provider}: ${msg}`)
      if (!strictProvider && isProviderBillingBlock(e)) appendAccountFallbacks(tryOrder)
      continue
    }
  }

  if (strictProvider && requested) {
    return {
      reply: [`${requested} did not complete this turn.`, ...providerErrors].join('\n'),
      skill: inferredSkill,
      provider: null,
    }
  }
  return localGuidanceReply(message, inferredSkill, providerErrors)
}

const AGENT_STEP_MAX_TOKENS = 4_000

function toolsUnsupported(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  if (/\b400\b/.test(message)) return true
  return /tool/i.test(message) && /support|invalid|unrecognized|unknown|not enabled|unexpected|cannot|not implemented/i.test(message)
}

async function openAiAgentStep(params: {
  baseUrl: string
  apiKey?: string
  model: string
  system: string
  transcript: AgentTranscriptMessage[]
  tools: boolean
  timeoutMs: number
  maxTokens?: number
  temperature?: number
  crowelogic?: boolean
}): Promise<{ text: string; toolCalls: AgentToolCall[] }> {
  const base = params.baseUrl.replace(/\/$/, '')
  const url =
    params.crowelogic === true
      ? crowelogicOpenAiUrl(base, 'chat/completions')
      : `${base}/v1/chat/completions`
  const headers: Record<string, string> = params.crowelogic && params.apiKey
    ? crowelogicChatHeaders(params.apiKey)
    : { 'Content-Type': 'application/json' }
  if (!params.crowelogic && params.apiKey) headers.Authorization = `Bearer ${params.apiKey}`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), params.timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      signal: ctrl.signal,
      body: JSON.stringify({
        model: params.model,
        messages: toOpenAiMessages(params.system, params.transcript),
        max_tokens: params.maxTokens ?? AGENT_STEP_MAX_TOKENS,
        temperature: params.temperature ?? 0.2,
        ...(params.crowelogic ? { stream: false } : {}),
        ...(params.tools ? { tools: openAiToolSpecs(), tool_choice: 'auto' } : {}),
      }),
    })
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
      throw new Error(json.error?.message || `HTTP ${res.status}`)
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null; tool_calls?: unknown } }>
    }
    const message = json.choices?.[0]?.message
    const text = typeof message?.content === 'string' ? message.content.trim() : ''
    const toolCalls = params.tools ? toolCallsFromOpenAiMessage(message) : []
    if (!text && !toolCalls.length) throw new Error('Empty completion from chat API')
    return { text, toolCalls }
  } catch (error) {
    if (isChatAbortError(error)) {
      throw new Error(
        `Chat request timed out after ${Math.round(params.timeoutMs / 1000)}s (is Ollama or gateway reachable?)`,
      )
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

async function anthropicAgentStep(params: {
  apiKey: string
  model: string
  system: string
  transcript: AgentTranscriptMessage[]
  tools: boolean
  timeoutMs?: number
}): Promise<{ text: string; toolCalls: AgentToolCall[] }> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), params.timeoutMs ?? 95_000)
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': params.apiKey,
        'anthropic-version': '2023-06-01',
      },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: params.model,
        max_tokens: AGENT_STEP_MAX_TOKENS,
        system: params.system,
        messages: toAnthropicMessages(params.transcript),
        ...(params.tools ? { tools: anthropicToolSpecs() } : {}),
      }),
    })
    const json = (await res.json().catch(() => ({}))) as {
      content?: unknown
      error?: { message?: string; type?: string }
    }
    if (!res.ok) {
      const err = new Error(
        `${json.error?.type || 'anthropic'} ${res.status} ${json.error?.message || ''}`.trim(),
      ) as Error & { status?: number }
      err.status = res.status
      throw err
    }
    const read = readAnthropicAgentContent(json.content)
    const toolCalls = params.tools ? read.toolCalls : []
    if (!read.text && !toolCalls.length) throw new Error('No textual response from Anthropic')
    return { text: read.text, toolCalls }
  } finally {
    clearTimeout(timer)
  }
}

function cursorAgentPrompt(system: string, transcript: AgentTranscriptMessage[]): string {
  const turns = transcript.slice(-12).map((message) => {
    if (message.role === 'user') return `User:\n${message.content}`
    if (message.role === 'assistant') {
      const calls = message.toolCalls
        .map((call) => `${call.name} ${JSON.stringify(call.arguments)}`)
        .join('\n')
      return `Assistant:\n${message.content}${calls ? `\n${calls}` : ''}`
    }
    return `Tool ${message.name}:\n${message.content.slice(0, message.name === 'query_intelligence_harness' ? 8000 : 4000)}`
  })
  return [
    'Unified intelligence is query_intelligence_harness with mode stack. Cite that tool result.',
    'This turn has no native tool channel. Ask for another admin tool with one line: /tool <name> {"key":"value"}. The admin loop runs it and sends the result back.',
    'Do not use the filesystem or shell.',
    system,
    ...turns,
  ]
    .filter((part) => part.trim())
    .join('\n\n')
}

async function providerAgentStep(params: {
  provider: AdminAiChatProvider
  model?: string
  system: string
  transcript: AgentTranscriptMessage[]
  tools: boolean
  timeoutMs?: number
  maxTokens?: number
}): Promise<{ text: string; toolCalls: AgentToolCall[] }> {
  const once = (tools: boolean) => {
    if (params.provider === 'anthropic') {
      const key = process.env.ANTHROPIC_API_KEY
      if (!key) throw new Error('ANTHROPIC_API_KEY is not set')
      return anthropicAgentStep({
        apiKey: key,
        model: params.model || anthropicChatModelCandidates(params.model)[0] || 'claude-sonnet-4-6',
        system: params.system,
        transcript: params.transcript,
        tools,
        timeoutMs: params.timeoutMs,
      })
    }
    if (params.provider === 'openai') {
      const key = process.env.OPENAI_API_KEY
      if (!key) throw new Error('OPENAI_API_KEY is not set')
      return openAiAgentStep({
        baseUrl: process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com',
        apiKey: key,
        model: params.model || process.env.OPENAI_CHAT_MODEL?.trim() || 'gpt-4o-mini',
        system: params.system,
        transcript: params.transcript,
        tools,
        timeoutMs: params.timeoutMs ?? CHAT_COMPLETION_DEFAULT_TIMEOUT_MS,
      })
    }
    if (params.provider === 'cursor') {
      return runCursorPrompt({
        prompt: cursorAgentPrompt(params.system, params.transcript),
        model: params.model,
      }).then((cursor) => {
        if (!cursor.ok) throw new Error(cursor.error || 'Cursor chat failed')
        const toolCalls = params.tools
          ? parseAgentToolCalls(cursor.text).map((call, index) => ({
              id: `cursor_${index + 1}_${call.tool}`,
              name: call.tool,
              arguments: call.payload,
            }))
          : []
        return { text: cursor.text, toolCalls }
      })
    }
    if (params.provider === 'ollama') {
      return resolveOllamaAdminModelId(params.model).then((model) =>
        openAiAgentStep({
          baseUrl: process.env.OLLAMA_BASE_URL?.trim() || 'http://127.0.0.1:11434',
          apiKey: process.env.OLLAMA_API_KEY?.trim() || undefined,
          model,
          system: params.system,
          transcript: params.transcript,
          tools: params.tools,
          timeoutMs: params.timeoutMs ?? OLLAMA_CHAT_COMPLETION_TIMEOUT_MS,
          maxTokens: params.maxTokens ?? 1_400,
          temperature: 0.2,
        }),
      )
    }
    const crowe = resolveCrowelogicEnv()
    if (!crowe.configured) throw new Error(crowelogicChatBlockReason(crowe) ?? 'CroweLM chat is not available.')
    return openAiAgentStep({
      baseUrl: crowe.baseUrl,
      apiKey: crowe.apiKey,
      model: params.model || crowe.model,
      system: params.system,
      transcript: params.transcript,
      tools,
      timeoutMs: params.timeoutMs ?? CHAT_COMPLETION_DEFAULT_TIMEOUT_MS,
      crowelogic: true,
    })
  }

  try {
    return await once(params.tools)
  } catch (error) {
    if (!params.tools || !toolsUnsupported(error)) throw error
    return once(false)
  }
}

/** Cursor session for Auto and every locked admin skill. Same tool list Anthropic uses. */
export async function runCursorSkillTurn(
  message: string,
  options: {
    transcript: AgentTranscriptMessage[]
    modelOverrides?: AdminChatModelOverrides
    resolvedModelIds?: Partial<Record<AdminAiChatProvider, string>>
    skillId?: string | null
    stickySkillId?: string | null
    honestyMode?: AdminChatHonestyMode | null
    energyPreset?: AdminChatEnergyPreset | null
    siteKnowledgePrompt?: string | null
    pageContextPrompt?: string | null
    onTool: (name: string, args: Record<string, unknown>) => Promise<string>
    onDelta?: (chunk: string) => void
    timeoutMs?: number
  },
): Promise<AdminChatReply> {
  const inferredSkill = resolveInferredSkillForAdminChat(message, {
    skillId: options.skillId,
    stickySkillId: options.stickySkillId,
  })
  const sessionTuning = buildSessionTuningPrompt(options.honestyMode ?? null, options.energyPreset ?? null)
  const system = buildSystemPrompt(
    inferredSkill,
    options.siteKnowledgePrompt,
    options.pageContextPrompt,
    sessionTuning,
    true,
  )
  const rawModel = options.modelOverrides?.cursor?.trim()
  const model =
    rawModel && rawModel !== ADMIN_AI_SMART_MODEL_OVERRIDE
      ? rawModel
      : rawModel === ADMIN_AI_SMART_MODEL_OVERRIDE
        ? pickSmartChatModelId('cursor', message, inferredSkill)
        : options.resolvedModelIds?.cursor
  const turns = options.transcript.slice(-12).map((row) => {
    if (row.role === 'user') return `User:\n${row.content}`
    if (row.role === 'assistant') {
      const calls = row.toolCalls
        .map((call) => `${call.name} ${JSON.stringify(call.arguments)}`)
        .join('\n')
      return `Assistant:\n${row.content}${calls ? `\n${calls}` : ''}`
    }
    return `Tool ${row.name}:\n${row.content.slice(0, row.name === 'query_intelligence_harness' ? 8000 : 4000)}`
  })
  const cursor = await runCursorAdminTurn({
    system,
    prompt: turns.filter((part) => part.trim()).join('\n\n') || message,
    model,
    tools: anthropicToolSpecs().map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.input_schema as Record<string, unknown>,
    })),
    onTool: options.onTool,
    onDelta: options.onDelta,
    timeoutMs: options.timeoutMs,
  })
  if (!cursor.ok) throw new Error(cursor.error || 'Cursor chat failed')
  if (options.onDelta && cursor.text && !cursor.streamed) await revealBufferedReply(cursor.text, options.onDelta)
  return {
    reply: cursor.text,
    toolCalls: [],
    skill: inferredSkill,
    provider: 'cursor',
    modelId: cursor.model || undefined,
  }
}

/** One reasoning step. The transcript is the conversation; tools are native calls. */
export async function generateAdminAgentStep(
  message: string,
  options: {
    transcript: AgentTranscriptMessage[]
    tools?: boolean
    provider?: AdminAiChatProvider | string | null
    modelOverrides?: AdminChatModelOverrides
    resolvedModelIds?: Partial<Record<AdminAiChatProvider, string>>
    strictProvider?: boolean
    skillId?: string | null
    stickySkillId?: string | null
    honestyMode?: AdminChatHonestyMode | null
    energyPreset?: AdminChatEnergyPreset | null
    siteKnowledgePrompt?: string | null
    pageContextPrompt?: string | null
    onDelta?: (chunk: string) => void
  },
): Promise<AdminChatReply> {
  const inferredSkill = resolveInferredSkillForAdminChat(message, {
    skillId: options.skillId,
    stickySkillId: options.stickySkillId,
  })
  const sessionTuning = buildSessionTuningPrompt(options.honestyMode ?? null, options.energyPreset ?? null)
  const system = buildSystemPrompt(
    inferredSkill,
    options.siteKnowledgePrompt,
    options.pageContextPrompt,
    sessionTuning,
    true,
  )
  const requested = normalizeProvider(
    typeof options.provider === 'string' ? options.provider : options.provider ?? undefined,
  )
  const strict = Boolean(options.strictProvider && requested)
  const tryOrder: AdminAiChatProvider[] = []
  const push = (id: AdminAiChatProvider) => {
    if (!tryOrder.includes(id)) tryOrder.push(id)
  }
  if (strict && requested) push(requested)
  else {
    if (requested) push(requested)
    for (const id of agentReasoningProviderOrder()) push(id)
  }

  const modelFor = (id: AdminAiChatProvider) => {
    const raw = options.modelOverrides?.[id]?.trim()
    if (raw === ADMIN_AI_SMART_MODEL_OVERRIDE) return pickSmartChatModelId(id, message, inferredSkill)
    if (raw) return raw
    return options.resolvedModelIds?.[id]
  }

  const providerErrors: string[] = []
  for (const provider of tryOrder) {
    if (provider === 'anthropic' && !isAnthropicConfigured()) continue
    if (provider === 'openai' && !isOpenAiChatConfigured()) continue
    if (provider === 'crowelogic' && !isCrowelogicConfigured()) continue
    if (provider === 'cursor' && !isCursorConfigured()) continue
    const models =
      provider === 'anthropic' ? anthropicChatModelCandidates(modelFor(provider)) : [modelFor(provider)]
    let lastError: unknown
    for (const modelId of models) {
      try {
        const step = await providerAgentStep({
          provider,
          model: modelId,
          system,
          transcript: options.transcript,
          tools: options.tools !== false,
          maxTokens: provider === 'ollama' ? 1_400 : undefined,
        })
        const reply = sanitizeConnectedProviderReply(step.text, provider, message)
        if (options.onDelta && reply) options.onDelta(reply)
        const usedModel = provider === 'ollama' ? await resolveOllamaAdminModelId(modelId) : modelId
        return {
          reply,
          toolCalls: reply === step.text ? step.toolCalls : [],
          skill: inferredSkill,
          provider,
          modelId: usedModel || undefined,
        }
      } catch (error) {
        lastError = error
        if (provider === 'anthropic' && isAnthropicModelNotFoundError(error)) continue
        break
      }
    }
    if (lastError) {
      providerErrors.push(`${provider}: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
      if (!strict && isProviderBillingBlock(lastError)) appendAccountFallbacks(tryOrder)
    }
  }

  if (strict && requested) {
    return {
      reply: [`${requested} did not complete this turn.`, ...providerErrors].join('\n'),
      skill: inferredSkill,
      provider: null,
      toolCalls: [],
    }
  }
  const fallback = localGuidanceReply(message, inferredSkill, providerErrors)
  return { ...fallback, toolCalls: [] }
}

/** Short follow-up that rewrites the sticky session summary. Empty string if no provider answers. */
export async function completeSessionSummary(input: {
  previousSummary: string
  userText: string
  assistantText: string
  toolNames: string[]
  provider?: string | null
}): Promise<string> {
  const system = [
    'Update the working session summary for a music-admin copilot.',
    'Stay under 500 characters.',
    'Keep release ids, codes, decisions, file paths, and open questions that appear in this turn.',
    'Do not invent facts. Do not give advice. Plain prose.',
  ].join(' ')
  const content = [
    input.previousSummary ? `Previous summary:\n${input.previousSummary.slice(0, 800)}` : 'No previous summary.',
    `User:\n${input.userText.replace(/\s+/g, ' ').trim().slice(0, 700)}`,
    `Assistant:\n${input.assistantText.replace(/\s+/g, ' ').trim().slice(0, 900)}`,
    input.toolNames.length ? `Tools this turn: ${input.toolNames.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
  const transcript: AgentTranscriptMessage[] = [{ role: 'user', content }]
  const requested = normalizeProvider(input.provider ?? undefined)
  const order = requested ? [requested] : agentReasoningProviderOrder()
  const seen = new Set<AdminAiChatProvider>()
  for (const provider of order) {
    if (seen.has(provider)) continue
    seen.add(provider)
    if (!isProviderConfigured(provider)) continue
    try {
      const step = await providerAgentStep({
        provider,
        system,
        transcript,
        tools: false,
        timeoutMs: 12_000,
      })
      const text = step.text.replace(/^summary:\s*/i, '').trim()
      if (text) return text.slice(0, 1200)
    } catch {
      continue
    }
  }
  return ''
}
