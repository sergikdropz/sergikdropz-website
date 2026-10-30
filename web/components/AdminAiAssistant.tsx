'use client'

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type SetStateAction,
} from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { LuSettings2 } from 'react-icons/lu'
import { loadMerchFont, merchFontById } from '@/lib/merch/text-fonts'
import { ADMIN_AI_FAB_ANCHOR_ID } from '@/components/shell/AppShell'
import { useAdminAiPageContextOptional } from '@/contexts/AdminAiPageContext'
import { collectSignedInFormFields, type AdminAiPageContext } from '@/lib/ai/admin-ai-page-context'
import type { AdminChatRoutingEcho } from '@/lib/ai/admin-chat-guards'
import { STICKY_SKILL_CLIENT_TTL_MS } from '@/lib/ai/admin-chat-guards'
import type { AdminChatEnergyPreset, AdminChatHonestyMode } from '@/lib/ai/admin-chat-session-tuning'
import { isContinuationOnlyUserMessage } from '@/lib/ai/chat-skill-context'
import { clipChatHistory } from '@/lib/ai/admin-ai-agent-transcript'
import { appendDictationText } from '@/lib/ai/dictation-text'
import { suggestThreadAnchors, threadMemoryWithAnchors } from '@/lib/admin-ai-anchor-suggestions'
import { shallowPayloadDiffLines } from '@/lib/admin-ai-exec-preview-diff'
import { composerGhostSuggestion, planArmedPrompt, recommendReplyFollowUps, sanitizeArmedPrompts, MAX_STORED_ARMED_PROMPTS, type StoredArmedPrompt } from '@/lib/ai/admin-ai-composer-suggestion'
import {
  ADMIN_AI_FOCUS_SESSION_EVENT,
  ADMIN_AI_SESSIONS_KEY,
  attachedThreadTitle,
  notifyChatThreadsChanged,
  questionThreadTitle,
} from '@/lib/ai/admin-ai-chat-threads'
import { firstPartyWorkspaceFromUrl } from '@/lib/ai/first-party-workspace'
import { buildApprovalRows, payloadWithoutDryRun, type ApprovalRow } from '@/lib/ai/approval-rows'
import { applyKnownPrimaryGoal, goalFromKnownRelease, type KnownGoalContext } from '@/lib/ai/known-primary-goal'
import {
  readStrategyPackPolish,
  strategyPackPolishCue,
  withStrategyPackPolish,
  type StrategyPackPolishMode,
  type StrategyPackPolishState,
} from '@/lib/ai/product-strategy-pack'
import {
  missingRequiredSkillFields,
  resolveSkillForTool,
} from '@/lib/ai/skills/resolve-skill-for-tool'
import { formatReleaseCountdownLabel } from '@/lib/admin-ai-release-countdown'
import { useClampedFixedMenuPosition } from '@/hooks/useClampedFixedMenuPosition'
import PopupMenuDragHeader from '@/components/ui/PopupMenuDragHeader'
import {
  applyFieldValue,
  parseAiApplyBlock,
  type AdminAiFocusContext,
} from '@/lib/ai/admin-ai-focus-context'
import FieldCopilotPanel from '@/components/FieldCopilotPanel'
import { ProductStrategyPackCard } from '@/components/admin/ProductStrategyPackCard'
import { AdminAiWorkingStatus } from '@/components/admin/AdminAiWorkingStatus'
import { visibleStreamingReply } from '@/lib/ai/admin-ai-reply-stream'
import AdminAiQuickStartPanel from '@/components/admin/AdminAiQuickStartPanel'
import AdminAiBrowserDock from '@/components/admin/AdminAiBrowserDock'
import AdminAiElementPickerButton from '@/components/admin/AdminAiElementPickerButton'
import AdminAiComposerField, {
  type AdminAiComposerFieldHandle,
  type ComposerChipView,
} from '@/components/admin/AdminAiComposerField'
import {
  appendMissingChipTokens,
  chipsIn,
  composerDisplayText,
  composerLinkLabel,
  composerPlainText,
  expandComposerMessage,
  insertChipToken,
  isHttpUrl,
  linksFromDrop,
  removeChipToken,
  stripChipKind,
  stripPlanPrefix,
  type ComposerChipKind,
} from '@/lib/ai/admin-ai-composer-chips'
import AdminAiStudioMissionStrip from '@/components/admin/AdminAiStudioMissionStrip'
import ArmedPromptStack from '@/components/admin/ArmedPromptStack'
import {
  AdminAiApplyDiffCards,
  AdminAiMemoryStrip,
  AdminAiToolStepCards,
} from '@/components/admin/AdminAiAgentPanels'
import type { AdminAiApplyDiff } from '@/lib/ai/admin-ai-apply-diff'
import type { AdminAiAgentToolStep } from '@/lib/ai/admin-ai-agent-loop'
import {
  checkpointFromMarketingPatch,
  previousFieldsFromPreview,
  pushCheckpoint,
  type AdminAiCheckpoint,
} from '@/lib/ai/admin-ai-checkpoints'
import {
  emptyThreadMemory,
  mergeThreadMemory,
  normalizeThreadMemory,
  type AdminAiThreadMemory,
} from '@/lib/ai/admin-ai-thread-memory'
import { noteApprovedWrite } from '@/lib/ai/admin-ai-thread-checklist'
import { buildMissionDock, type MissionDockAction } from '@/lib/admin-ai-mission-dock'
import {
  dispatchAdminAiStudioNavigate,
  studioNavigateHref,
  type AdminAiStudioNavTarget,
} from '@/lib/admin-ai-studio-nav'
import {
  findPlaybookById,
  parsePlaybookIdFromQuickStart,
  playbookPoolAsQuickStarts,
  type AdminAiPlaybook,
} from '@/lib/admin-ai-playbooks'
import {
  buildCreativeSuggestionPool,
  buildPrioritySuggestionPool,
  collectAllUnfinishedBusinessFromSessions,
  createInitialCreativeQuickStartState,
  createInitialPlaybookQuickStartState,
  createInitialPriorityQuickStartState,
  createInitialUnfinishedBusinessViewState,
  historyEntryToQuickStart,
  isFreshAdminChat,
  markCreativeQuickStartAttended,
  markPlaybookQuickStartAttended,
  markPriorityQuickStartAttended,
  pickVisibleUnfinishedBusiness,
  refreshCreativeQuickStartState,
  refreshPlaybookQuickStartState,
  refreshPriorityQuickStartState,
  refreshUnfinishedBusinessViewState,
  sanitizeAdminChatMessagesForDisplay,
  unfinishedBusinessEntryToQuickStart,
  type AdminAiCreativeQuickStartState,
  type AdminAiPriorityQuickStartState,
  type AdminAiQuickStart,
  type AdminAiUnfinishedBusinessEntry,
  type UnfinishedBusinessViewState,
} from '@/lib/admin-ai-quick-starts'
import { consumePendingAdminAiPrompt } from '@/lib/admin-ai-client'
import { getStudioStepAiPrompt } from '@/lib/studio/admin-ai-step-prompts'
import { sameOriginApiUrl } from '@/lib/same-origin-api'
import {
  AdminAssistantRichText,
  AdminChatActionChoices,
  AdminChatPlainText,
  AdminChatReplySuggestions,
  AdminReplyCopyButton,
  replyThreadTitle,
} from '@/components/AdminChatMessageContent'
import { parseAdminChatActionChoices } from '@/lib/ai/admin-chat-action-choices'

/** Same-origin fetch with clearer errors when the dev server is down or the connection is refused. */
function adminAiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(sameOriginApiUrl(path), { ...init, credentials: 'same-origin' }).catch((err) => {
    const base = err instanceof Error ? err.message : 'Request failed'
    const hint =
      err instanceof TypeError
        ? ' — Is the dev server running? Open the app at the same host and port the server uses (e.g. http://127.0.0.1:3001 if `npm run dev` binds to 3001).'
        : ''
    throw new Error(`${base}${hint}`)
  })
}

type ChatRole = 'user' | 'assistant' | 'system'

type ChatEmbedProductStrategyPack = {
  type: 'product_strategy_pack'
  output: Record<string, unknown>
}

type ChatMessage = {
  id: string
  role: ChatRole
  content: string
  embed?: ChatEmbedProductStrategyPack
  toolSteps?: AdminAiAgentToolStep[]
  applyDiffs?: AdminAiApplyDiff[]
}

type ExecuteTool =
  | 'create_release_checklist'
  | 'draft_product_strategy_pack'
  | 'generate_campaign_draft'
  | 'generate_smartlink_utm_plan'
  | 'run_playwright_e2e'
  | 'run_applescript'
  | 'query_ops_snapshot'
  | 'query_release_studio_snapshot'
  | 'query_studio_command_center'
  | 'patch_release_marketing_copy'
  | 'update_copyright_checklist'
  | 'assign_isrcs'
  | 'pull_distrokid_isrcs'
  | 'create_distribution_release_draft'
  | 'query_intelligence_harness'
  | 'query_sergikai_chat'
  | 'query_crowe_creative'
  | 'query_meta_business_agent'
  | 'audit_music_contract'
  | 'audit_music_books'
  | 'run_meta_promo_pipeline'
  | 'admin_browser'
  | 'query_platform_growth_snapshot'
  | 'read_workspace'

type ToolPreview = {
  tool: ExecuteTool
  riskTier: string
  requiresApproval: boolean
  payload?: Record<string, unknown>
  preview: Record<string, unknown>
}

type StepPreview = {
  stepId: string
  tool: ExecuteTool
  riskTier: string
  requiresApproval: boolean
  payload: Record<string, unknown>
  preview: Record<string, unknown>
}

type AssistantActionResponse = {
  runId?: string
  approved?: boolean
  message?: string
  toolPreview?: ToolPreview
  actionId?: string
  stepPreviews?: StepPreview[]
  results?: Array<{
    stepId: string
    tool: ExecuteTool
    output: Record<string, unknown>
    verification?: { matched: boolean; summary: string } | null
  }>
}

type SkillSchemaField = {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  required?: boolean
  description: string
}

type SkillSummary = {
  id: string
  name: string
  description: string
  purpose: string
  requiredContext: string[]
  allowedTools: ExecuteTool[]
  riskTier: string
  confidenceRules: string[]
  inputSchema?: Record<string, SkillSchemaField> | null
}

type ChatProviderChoice = 'auto' | 'anthropic' | 'openai' | 'ollama' | 'crowelogic' | 'cursor'

function isChatProviderChoice(value: string | null | undefined): value is ChatProviderChoice {
  return (
    value === 'auto' ||
    value === 'anthropic' ||
    value === 'openai' ||
    value === 'ollama' ||
    value === 'crowelogic' ||
    value === 'cursor'
  )
}

const AGENT_SKILL_MODES = [
  'release_ops',
  'product_strategy',
  'growth_marketing',
  'smartlink_seo',
  'e2e_qa',
  'mac_automation',
  'admin_intel',
  'sergik_intelligence',
  'studio_release',
  'music_business_counsel',
] as const
type AgentSkillModeId = (typeof AGENT_SKILL_MODES)[number]
type AgentModeChoice = 'auto' | 'chat' | 'plan' | AgentSkillModeId

function isAgentSkillMode(mode: AgentModeChoice): mode is AgentSkillModeId {
  return (AGENT_SKILL_MODES as readonly string[]).includes(mode)
}

type ChatResponse = {
  reply: string
  runId: string
  provider?: string | null
  modelId?: string | null
  inferredSkill?: {
    id: string
    name: string
    description?: string
  }
  routing?: AdminChatRoutingEcho
  runFingerprint?: string
  honestyMode?: AdminChatHonestyMode | null
  energyPreset?: AdminChatEnergyPreset | null
  toolSteps?: AdminAiAgentToolStep[]
  applyDiffs?: AdminAiApplyDiff[]
  memory?: AdminAiThreadMemory
  memoryPatch?: Record<string, unknown>
  browserHold?: string | null
}

type ChatProvidersApi = {
  defaultProvider: string | null
  providers: Array<{ id: string; configured: boolean }>
  assistantDefaultLlm?: ChatProviderChoice
}

type PlanResponse = {
  mode: 'execution' | 'intent'
  plan?: {
    skill?: {
      id: string
      name: string
      description: string
      riskTier: string
    } | null
    tool?: ExecuteTool
    canExecute?: boolean
    missingRequiredFields?: string[]
    suggestedPayload?: Record<string, unknown>
  }
  graph?: {
    mode: 'tool' | 'intent'
    summary: string
    approvalRequired: boolean
    steps: PlanStep[]
  }
  error?: string
}

type PlanStep = {
  id: string
  tool: ExecuteTool
  payload: Record<string, unknown>
  requiresApproval: boolean
  riskTier: string
  skillId: string | null
}

function strategyPackPreviewNote(output: Record<string, unknown>): string {
  const live = readStrategyPackPolish(output)
  if (live?.state === 'applied') {
    return `Strategy pack preview. ${live.note} Approve keeps the scaffold and does not call the model again.`
  }
  if (live?.state === 'failed') {
    return `Strategy pack preview kept the scaffold. ${live.note}`
  }
  return 'Strategy pack preview — structured sections below. Approve when ready.'
}

function strategyPackPreviewRows(action: AssistantActionResponse): StepPreview[] {
  if (Array.isArray(action.stepPreviews) && action.stepPreviews.length > 0) {
    return action.stepPreviews.filter((s) => s.tool === 'draft_product_strategy_pack')
  }
  if (action.toolPreview?.tool === 'draft_product_strategy_pack') {
    return [
      {
        stepId: 'single-preview',
        tool: action.toolPreview.tool,
        riskTier: action.toolPreview.riskTier,
        requiresApproval: action.toolPreview.requiresApproval,
        payload: action.toolPreview.payload ?? {},
        preview: action.toolPreview.preview,
      },
    ]
  }
  return []
}

function strategyPackEmbedChatMessagesFromResult(result: AssistantActionResponse): ChatMessage[] {
  return strategyPackPreviewRows(result).map((row) => ({
    id: createMessageId(),
    role: 'assistant',
    content:
      strategyPackPreviewNote(row.preview),
    embed: { type: 'product_strategy_pack', output: row.preview },
  }))
}

type PreflightSuggestion = {
  tool: ExecuteTool
  missingRequiredFields: string[]
  suggestedPayload: Record<string, unknown>
}

type PendingAttachment = {
  id: string
  file: File
  kind: 'text' | 'audio'
  label: string
  status: 'reading' | 'ready' | 'error'
  excerpt?: string
  error?: string
}

/** Element reference kept beside the composer. The chip itself sits inline in `input`. */
type ElementPickChip = {
  id: string
  label: string
  text: string
}

type ComposerLink = {
  id: string
  url: string
  label: string
}

const ADMIN_AI_UNFINISHED_DISMISS_LS = 'admin-ai-unfinished-dismissed-v1'
const ADMIN_AI_UNFINISHED_ARCHIVE_LS = 'admin-ai-unfinished-archive-v1'
const ADMIN_AI_LLM_LS = 'admin-ai-llm-v1'
const ADMIN_AI_HONESTY_LS = 'admin-ai-honesty-v1'
const ADMIN_AI_ENERGY_LS = 'admin-ai-energy-v1'
const ADMIN_AI_ANCHORS_PANEL_LS = 'admin-ai-anchors-panel-v1'
const ADMIN_AI_DOCK_MODE_KEY = 'admin-ai-dock-mode-v2'
const ADMIN_AI_DOCK_WIDTH_KEY = 'admin-ai-dock-width-v1'
const ADMIN_AI_STANDALONE_CHAT_W_KEY = 'admin-ai-standalone-chat-width-v1'
const ADMIN_AI_DOCK_BROWSER_CHAT_W_KEY = 'admin-ai-dock-browser-chat-w'
const ADMIN_AI_BROWSER_WORKSPACE_KEY = 'admin-ai-browser-workspace'
const DOCK_PANEL_MAX_W = 1440
const STANDALONE_CHAT_MIN_W = 280
const STANDALONE_BROWSER_MIN_W = 320
const STANDALONE_CHAT_DEFAULT_W = 420
const MAX_CHAT_SESSIONS = 8
const MAX_PERSISTED_MESSAGES_PER_SESSION = 100

export type ChatDockMode = 'floating' | 'dock-right' | 'dock-left'

type AdminChatSession = {
  id: string
  title: string
  updatedAt: number
  messages: ChatMessage[]
  activeSkill: ChatResponse['inferredSkill'] | null
  /** Epoch ms when `activeSkill` was last set (chat/plan/exec); used to expire sticky persona. */
  activeSkillInferredAt: number | null
  /** Up to three sticky context lines the user can insert into the composer. */
  anchors: [string, string, string]
  lastRoutingEcho: AdminChatRoutingEcho | null
  lastRunFingerprint: string | null
  skillShiftNotice: {
    fromId: string
    fromName: string
    toId: string
    toName: string
  } | null
  preflightSuggestion: PreflightSuggestion | null
  pendingPlanSteps: PlanStep[]
  lastRunbookGraph: PlanResponse['graph'] | null
  pendingAction: AssistantActionResponse | null
  /** Prior `/exec` preview payload for the same tool (session-only shallow diff). */
  execPreviewDiffBaseline: { tool: string; payload: Record<string, unknown> } | null
  /** Heuristic snippets from the last user send — user must click to apply (never auto-filled). */
  anchorSuggestions: string[]
  input: string
  attachments: PendingAttachment[]
  /** Element picker chips. Full DOM reference is expanded where the chip sits in `input`. */
  elementPicks: ElementPickChip[]
  /** Dropped http(s) links. The chip sits inline in `input`. */
  links: ComposerLink[]
  /** When true, strategy pack previews merge refineWithLlm into payloads (LLM polish on dry-run). */
  preferStrategyPackRefine: boolean
  /** Sticky goal / release / desk across skill switches. */
  threadMemory: AdminAiThreadMemory
  /** Undo stack for approved Apply diffs. */
  checkpoints: AdminAiCheckpoint[]
  /** Prompts armed to send themselves at a date and time from the latest reply. */
  armedPrompts?: StoredArmedPrompt[]
  /** Release Studio ids this thread is attached to. */
  attachedReleaseIds?: string[]
  /** Rotating high-priority quick starts (fresh chat only). */
  priorityQuickStart?: AdminAiPriorityQuickStartState
  /** Rotating explore quick starts (fresh chat only). */
  creativeQuickStart?: AdminAiCreativeQuickStartState
  /** Rotating release playbooks (fresh chat only). */
  playbookQuickStart?: AdminAiPriorityQuickStartState
  /** Rotation state for unfinished business rows. */
  unfinishedView?: UnfinishedBusinessViewState
}

function releaseAdminBrowserChat(id: string) {
  void fetch('/api/admin/ai/browser', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'release', actor: 'user', chatSessionId: id }),
  }).catch(() => undefined)
}

function createMessageId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function sanitizeRotatingQuickStartState(
  raw: unknown,
): AdminAiPriorityQuickStartState | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const s = raw as AdminAiPriorityQuickStartState
  if (!Array.isArray(s.current)) return undefined
  return {
    current: s.current.filter((r) => r && typeof r.id === 'string'),
    attended: Array.isArray(s.attended) ? s.attended.filter((e) => e && typeof e.id === 'string') : [],
    ignored: Array.isArray(s.ignored) ? s.ignored.filter((e) => e && typeof e.id === 'string') : [],
    refreshCount: typeof s.refreshCount === 'number' ? s.refreshCount : 0,
    poolExhausted: Boolean(s.poolExhausted),
  }
}

function sanitizeElementPicks(raw: unknown): ElementPickChip[] {
  if (!Array.isArray(raw)) return []
  return raw
    .flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const row = item as { id?: unknown; label?: unknown; text?: unknown }
      if (typeof row.text !== 'string' || !row.text.trim()) return []
      const label = typeof row.label === 'string' && row.label.trim() ? row.label.trim().slice(0, 80) : 'element'
      return [
        {
          id: typeof row.id === 'string' && row.id ? row.id : createMessageId(),
          label,
          text: row.text.slice(0, 4000),
        },
      ]
    })
    .slice(0, 8)
}

function composerDraftFromSession(input: unknown, picksRaw: unknown, linksRaw: unknown): {
  input: string
  elementPicks: ElementPickChip[]
  links: ComposerLink[]
} {
  const elementPicks = sanitizeElementPicks(picksRaw)
  const links = sanitizeComposerLinks(linksRaw)
  return {
    input: appendMissingChipTokens(
      appendMissingChipTokens(stripChipKind(typeof input === 'string' ? input : '', 'file'), 'element', elementPicks.map((pick) => pick.id)),
      'link',
      links.map((link) => link.id),
    ),
    elementPicks,
    links,
  }
}

function sanitizeComposerLinks(raw: unknown): ComposerLink[] {
  if (!Array.isArray(raw)) return []
  return raw
    .flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const row = item as { id?: unknown; url?: unknown; label?: unknown }
      if (typeof row.url !== 'string' || !isHttpUrl(row.url)) return []
      const id = typeof row.id === 'string' && /^[A-Za-z0-9_-]{8,80}$/.test(row.id) ? row.id : createMessageId()
      const label =
        typeof row.label === 'string' && row.label.trim()
          ? row.label.trim().slice(0, 80)
          : composerLinkLabel(row.url)
      return [{ id, url: row.url.slice(0, 2000), label }]
    })
    .slice(0, 8)
}

function createEmptySession(id: string): AdminChatSession {
  return {
    id,
    title: 'New chat',
    updatedAt: Date.now(),
    messages: [],
    activeSkill: null,
    activeSkillInferredAt: null,
    anchors: ['', '', ''],
    lastRoutingEcho: null,
    lastRunFingerprint: null,
    skillShiftNotice: null,
    preflightSuggestion: null,
    pendingPlanSteps: [],
    lastRunbookGraph: null,
    pendingAction: null,
    execPreviewDiffBaseline: null,
    anchorSuggestions: [],
    input: '',
    attachments: [],
    elementPicks: [],
    links: [],
    preferStrategyPackRefine: false,
    threadMemory: emptyThreadMemory(),
    checkpoints: [],
    armedPrompts: [],
    attachedReleaseIds: [],
  }
}

const MAX_ATTACHMENT_CHARS = 14_000
const MAX_COMPOSED_MESSAGE_CHARS = 95_000

const PANEL_PAD = 8
const PANEL_MIN_W = 280
const PANEL_MIN_H = 200

type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const TEXT_FILE_EXTENSIONS = new Set([
  'txt',
  'md',
  'markdown',
  'json',
  'csv',
  'tsv',
  'log',
  'env',
  'yaml',
  'yml',
  'xml',
  'html',
  'css',
  'sql',
])

const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'm4a', 'aac', 'webm', 'ogg', 'flac', 'mpeg'])

function extensionOf(name: string) {
  const i = name.lastIndexOf('.')
  return i === -1 ? '' : name.slice(i + 1).toLowerCase()
}

function classifyFile(file: File): 'text' | 'audio' | 'unsupported' {
  const ext = extensionOf(file.name)
  if (TEXT_FILE_EXTENSIONS.has(ext)) return 'text'
  if (AUDIO_EXTENSIONS.has(ext) || file.type.startsWith('audio/')) return 'audio'
  return 'unsupported'
}

function truncateBody(text: string, max: number) {
  const t = text.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}\n\n[truncated — original length ${t.length} chars]`
}

async function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsText(file)
  })
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return 'Unexpected failure'
}

function nextId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/** Natural-language runbook only (no execution). Rest of line after `/plan ` is the goal. */
function parsePlanCommand(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed.toLowerCase().startsWith('/plan ')) return null
  const rest = trimmed.slice(6).trim()
  return rest.length ? rest : null
}

function parseExecuteCommand(input: string): { tool: ExecuteTool; payload: Record<string, unknown> } | null {
  const trimmed = input.trim()
  if (!trimmed.toLowerCase().startsWith('/exec ')) return null

  const withoutPrefix = trimmed.slice(6).trim()
  if (!withoutPrefix) return null

  const firstSpace = withoutPrefix.indexOf(' ')
  const toolRaw = (firstSpace === -1 ? withoutPrefix : withoutPrefix.slice(0, firstSpace)).trim()
  const payloadRaw = (firstSpace === -1 ? '' : withoutPrefix.slice(firstSpace + 1)).trim()

  if (
    toolRaw !== 'create_release_checklist' &&
    toolRaw !== 'draft_product_strategy_pack' &&
    toolRaw !== 'generate_campaign_draft' &&
    toolRaw !== 'generate_smartlink_utm_plan' &&
    toolRaw !== 'run_playwright_e2e' &&
    toolRaw !== 'run_applescript' &&
    toolRaw !== 'query_ops_snapshot' &&
    toolRaw !== 'query_release_studio_snapshot' &&
    toolRaw !== 'query_studio_command_center' &&
    toolRaw !== 'patch_release_marketing_copy' &&
    toolRaw !== 'update_copyright_checklist' &&
    toolRaw !== 'assign_isrcs' &&
    toolRaw !== 'pull_distrokid_isrcs' &&
    toolRaw !== 'create_distribution_release_draft' &&
    toolRaw !== 'query_intelligence_harness' &&
    toolRaw !== 'query_sergikai_chat' &&
    toolRaw !== 'query_crowe_creative' &&
    toolRaw !== 'audit_music_contract' &&
    toolRaw !== 'run_meta_promo_pipeline' &&
    toolRaw !== 'admin_browser' &&
    toolRaw !== 'query_platform_growth_snapshot' &&
    toolRaw !== 'read_workspace'
  ) {
    return null
  }

  if (!payloadRaw) {
    return { tool: toolRaw, payload: {} }
  }

  try {
    const payload = JSON.parse(payloadRaw) as Record<string, unknown>
    return { tool: toolRaw, payload }
  } catch {
    return null
  }
}

export type AdminAiAssistantPresentation = 'overlay' | 'standaloneWindow'

function FieldFocusToggle({
  copilotOn,
  onToggle,
  disabled,
}: {
  copilotOn: boolean
  onToggle: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      role="switch"
      aria-checked={copilotOn ? 'true' : 'false'}
      aria-label={`Field focus copilot ${copilotOn ? 'on' : 'off'}`}
      className={`rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors disabled:opacity-40 ${
        copilotOn
          ? 'border-emerald-500/50 bg-emerald-950/60 text-emerald-200 hover:bg-emerald-900/50'
          : 'border-gray-600 bg-gray-900 text-gray-400 hover:bg-gray-800 hover:text-gray-200'
      }`}
      onClick={onToggle}
    >
      Field focus {copilotOn ? 'On' : 'Off'}
    </button>
  )
}

function AnchorsPanelToggle({
  open,
  onToggle,
  disabled,
}: {
  open: boolean
  onToggle: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      role="switch"
      aria-checked={open ? 'true' : 'false'}
      aria-label={`Memory anchors panel ${open ? 'on' : 'off'}`}
      className={`rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors disabled:opacity-40 ${
        open
          ? 'border-purple-500/50 bg-purple-950/60 text-purple-200 hover:bg-purple-900/50'
          : 'border-gray-600 bg-gray-900 text-gray-400 hover:bg-gray-800 hover:text-gray-200'
      }`}
      onClick={onToggle}
    >
      Anchors {open ? 'On' : 'Off'}
    </button>
  )
}

const PACK_POLISH_MODE_LS = 'admin-ai-pack-polish-mode-v1'

const PACK_POLISH_MODES: Array<{ id: StrategyPackPolishMode; label: string; detail: string }> = [
  { id: 'suggest', label: 'Suggest', detail: 'Glow when a strategy pack is the next step. You click to turn it on.' },
  { id: 'auto', label: 'Auto', detail: 'Turn polish on when that cue appears. Click still turns it off.' },
  { id: 'always', label: 'Always on', detail: 'Every strategy pack preview gets a brief.' },
  { id: 'off', label: 'Always off', detail: 'Scaffold only. No glow.' },
]

/** Preview-only editorial brief. The glow is a cue. One click turns the brief on or off. */
function StrategyPackPolishToggle({
  on,
  live,
  mode,
  cue,
  hasPreview,
  onToggle,
  onMode,
  onPolishPreview,
  onScaffoldPreview,
  disabled,
}: {
  on: boolean
  live: { state: StrategyPackPolishState; note: string } | null
  mode: StrategyPackPolishMode
  cue: boolean
  hasPreview: boolean
  onToggle: () => void
  onMode: (mode: StrategyPackPolishMode) => void
  onPolishPreview: () => void
  onScaffoldPreview: () => void
  disabled?: boolean
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const missed = on && live?.state === 'failed'
  const ready = on && live?.state === 'applied'
  const showCue = !on && cue && (mode === 'suggest' || mode === 'auto')
  const label = !on ? 'Pack polish Off' : missed ? 'Pack polish Missed' : ready ? 'Pack polish Ready' : 'Pack polish On'
  const title = showCue
    ? 'A strategy pack brief would help. Click once to turn polish on. Right-click for Suggest, Auto, Always on, or Always off.'
    : !on
      ? 'Off. Click once to ask for a brief on the next strategy pack preview. Right-click for Suggest, Auto, Always on, or Always off.'
      : missed
        ? `On. Last preview kept the scaffold. ${live?.note ?? ''} Click to turn off.`
        : ready
          ? `On. ${live?.note ?? 'Last preview includes the brief.'} Click to turn off.`
          : 'On. The next strategy pack preview adds an editorial brief. Click to turn off.'
  const solid = missed
    ? 'border-rose-300 bg-rose-400 text-rose-950 hover:bg-rose-300'
    : ready
      ? 'border-emerald-300 bg-emerald-400 text-emerald-950 hover:bg-emerald-300'
      : on
        ? 'border-amber-200 bg-amber-400 text-amber-950 hover:bg-amber-300'
        : 'border-gray-600 bg-gray-900 text-gray-400 hover:bg-gray-800 hover:text-gray-200'

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    const onPointer = (event: MouseEvent) => {
      if (event.button !== 0) return
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('[data-admin-ai-pack-polish-menu]')) return
      if (buttonRef.current?.contains(target)) return
      close()
    }
    const timer = window.setTimeout(() => document.addEventListener('mousedown', onPointer), 0)
    document.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu])

  return (
    <>
      <span className="relative inline-flex rounded-full">
        <button
          ref={buttonRef}
          type="button"
          disabled={disabled}
          role="switch"
          aria-checked={on ? 'true' : 'false'}
          aria-haspopup="menu"
          aria-label={title}
          title={title}
          data-pack-polish-mode={mode}
          className={`relative overflow-hidden rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors disabled:opacity-40 ${
            showCue ? 'admin-ai-pack-polish-cue' : ''
          } ${solid}`}
          onClick={onToggle}
          onContextMenu={(event) => {
            event.preventDefault()
            event.stopPropagation()
            const rect = buttonRef.current?.getBoundingClientRect()
            const x = rect ? rect.left : event.clientX
            const y = rect ? rect.top : event.clientY
            setMenu({ x, y })
          }}
        >
          {showCue ? <span className="admin-ai-pack-polish-glow" data-testid="admin-ai-pack-polish-glow" aria-hidden /> : null}
          <span className="relative z-[1]">{label}</span>
        </button>
      </span>
      {menu && typeof document !== 'undefined'
        ? createPortal(
            <div
              data-admin-ai-pack-polish-menu
              role="menu"
              aria-label="Pack polish actions"
              className="fixed z-[12050] w-64 overflow-hidden rounded-lg border border-gray-600 bg-gray-900 text-sm shadow-2xl"
              style={{
                left: Math.min(menu.x, window.innerWidth - 272),
                top: Math.max(8, menu.y - 228),
              }}
            >
              {PACK_POLISH_MODES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={mode === item.id}
                  className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-gray-800"
                  onClick={() => {
                    onMode(item.id)
                    setMenu(null)
                  }}
                >
                  <span className={`text-xs font-medium ${mode === item.id ? 'text-amber-200' : 'text-gray-100'}`}>
                    {mode === item.id ? '✓ ' : ''}
                    {item.label}
                  </span>
                  <span className="text-[10px] leading-snug text-gray-500">{item.detail}</span>
                </button>
              ))}
              <div className="border-t border-gray-800">
                <button
                  type="button"
                  role="menuitem"
                  disabled={disabled || !hasPreview}
                  className="block w-full px-3 py-2 text-left text-xs text-gray-100 hover:bg-gray-800 disabled:opacity-40"
                  onClick={() => {
                    onPolishPreview()
                    setMenu(null)
                  }}
                >
                  Polish this preview
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={disabled || !hasPreview}
                  className="block w-full px-3 py-2 text-left text-xs text-gray-100 hover:bg-gray-800 disabled:opacity-40"
                  onClick={() => {
                    onScaffoldPreview()
                    setMenu(null)
                  }}
                >
                  Scaffold this preview
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

function canConsumeWheel(el: HTMLElement, deltaX: number, deltaY: number): boolean {
  const style = getComputedStyle(el)
  const overflowY = style.overflowY
  const overflowX = style.overflowX
  if ((overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') && el.scrollHeight > el.clientHeight + 1) {
    if (deltaY < 0 && el.scrollTop > 0) return true
    if (deltaY > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1) return true
  }
  if ((overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'overlay') && el.scrollWidth > el.clientWidth + 1) {
    if (deltaX < 0 && el.scrollLeft > 0) return true
    if (deltaX > 0 && el.scrollLeft + el.clientWidth < el.scrollWidth - 1) return true
  }
  return false
}

/** Wheel over the assistant must not scroll the page behind it. Inner scrollers still move. */
function wheelStaysInsideAdminAiPanel(event: WheelEvent): boolean {
  const target = event.target
  if (!(target instanceof Element)) return false
  const panel = target.closest('[data-admin-ai-panel]')
  if (!panel) return false
  let node: Element | null = target
  while (node && panel.contains(node)) {
    if (node instanceof HTMLElement && canConsumeWheel(node, event.deltaX, event.deltaY)) return true
    if (node === panel) break
    node = node.parentElement
  }
  return false
}

export default function AdminAiAssistant({
  presentation = 'overlay',
  defaultOpen = false,
}: {
  presentation?: AdminAiAssistantPresentation
  /** When false, assistant starts collapsed (default for admin + studio). */
  defaultOpen?: boolean
}) {
  const isStandalone = presentation === 'standaloneWindow'
  const pageCtx = useAdminAiPageContextOptional()
  const isStudioSurface = pageCtx?.pageContext.surface === 'studio'
  const focusCopilotEnabled = pageCtx?.focusCopilotEnabled ?? true
  const setFocusCopilotEnabled = pageCtx?.setFocusCopilotEnabled
  const setPageFocus = pageCtx?.setPageFocus
  const pageFocus = focusCopilotEnabled ? (pageCtx?.pageFocus ?? null) : null

  const { initialSessionId, initialSessions } = useMemo(() => {
    const id = createMessageId()
    return { initialSessionId: id, initialSessions: [createEmptySession(id)] as AdminChatSession[] }
  }, [])

  const [enabled, setEnabled] = useState(true)
  const [open, setOpen] = useState(defaultOpen)
  const [sessions, setSessions] = useState<AdminChatSession[]>(initialSessions)
  const [activeSessionId, setActiveSessionId] = useState<string>(initialSessionId)
  const [showSessionHistory, setShowSessionHistory] = useState(false)
  const historyPopoverRef = useRef<HTMLDivElement | null>(null)
  const sessionsHydrated = useRef(false)
  const unfinishedDismissHydrated = useRef(false)
  const [dismissedUnfinishedIds, setDismissedUnfinishedIds] = useState<string[]>([])
  const [dismissedUnfinishedArchive, setDismissedUnfinishedArchive] = useState<
    AdminAiUnfinishedBusinessEntry[]
  >([])
  const [missionRefreshNonce, setMissionRefreshNonce] = useState(0)
  const [missionBlockerCount, setMissionBlockerCount] = useState(0)
  const [threadAwayFromBottom, setThreadAwayFromBottom] = useState(false)
  const [threadHasEarlierUserMessage, setThreadHasEarlierUserMessage] = useState(false)

  const [sending, setSending] = useState(false)
  const [queuedExec, setQueuedExec] = useState<string | null>(null)
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null)
  const replyStreamRef = useRef({ round: -1, raw: '' })
  const sendLockRef = useRef(false)
  const sendComposerTurnRef = useRef<(rawText: string, fromComposer: boolean) => Promise<void>>(
    async () => undefined,
  )
  const [browserLiveNote, setBrowserLiveNote] = useState<string | null>(null)
  const [browserHolds, setBrowserHolds] = useState<Record<string, string>>({})
  const [approvalEditId, setApprovalEditId] = useState<string | null>(null)
  const [approvalEditDraft, setApprovalEditDraft] = useState('')
  const [approvalEditError, setApprovalEditError] = useState<string | null>(null)
  const [approvalHiddenRowIds, setApprovalHiddenRowIds] = useState<string[]>([])
  const panelRef = useRef<HTMLDivElement | null>(null)
  const threadScrollRef = useRef<HTMLDivElement | null>(null)
  /** True while the reader is at the latest message, so incoming reply content keeps the bottom in view. */
  const threadStickRef = useRef(true)
  const threadScrollLockRef = useRef(false)
  const threadScrollTopRef = useRef(0)
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const [panelSize, setPanelSize] = useState<{ w: number; h: number } | null>(null)
  const [browserPaneOpen, setBrowserPaneOpen] = useState(() => {
    if (typeof window === 'undefined') return true
    return window.localStorage.getItem('admin-ai-browser-side-expanded') !== '0'
  })
  const [dockBrowserWorkspace, setDockBrowserWorkspace] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(ADMIN_AI_BROWSER_WORKSPACE_KEY) === '1'
  })
  const [chatPaneWidth, setChatPaneWidth] = useState(() => {
    if (typeof window === 'undefined') return STANDALONE_CHAT_DEFAULT_W
    const stored = Number(window.localStorage.getItem(ADMIN_AI_STANDALONE_CHAT_W_KEY))
    return Number.isFinite(stored) && stored >= STANDALONE_CHAT_MIN_W
      ? stored
      : STANDALONE_CHAT_DEFAULT_W
  })
  const [dockBesideChatW, setDockBesideChatW] = useState(() => {
    if (typeof window === 'undefined') return 440
    const stored = Number(window.localStorage.getItem(ADMIN_AI_DOCK_BROWSER_CHAT_W_KEY))
    return Number.isFinite(stored) && stored >= STANDALONE_CHAT_MIN_W ? stored : 440
  })
  const splitResizeRef = useRef<{ startX: number; startW: number; dock: boolean; grow: 1 | -1 } | null>(null)
  const [isSplitResizing, setIsSplitResizing] = useState(false)
  const resizeStartRef = useRef<{
    edge: ResizeEdge
    startLeft: number
    startTop: number
    startWidth: number
    startHeight: number
    startPointerX: number
    startPointerY: number
  } | null>(null)
  const [isResizing, setIsResizing] = useState(false)
  const wasResizingDock = useRef(false)
  const [dockMode, setDockMode] = useState<ChatDockMode>('dock-left')
  const dockModeHydrated = useRef(false)
  const [gripDockMenu, setGripDockMenu] = useState<{ x: number; y: number } | null>(null)
  const [tabMenu, setTabMenu] = useState<{ x: number; y: number; sessionId: string } | null>(null)
  const gripDockMenuRef = useRef<HTMLDivElement | null>(null)
  const gripDockMenuClamp = useClampedFixedMenuPosition(
    !!gripDockMenu,
    gripDockMenu,
    { width: 200, height: 180 },
    { externalRef: gripDockMenuRef },
  )
  /** Render into document.body so position:fixed is always relative to the browser viewport, not layout ancestors (transform/filter/backdrop). */
  const [portalReady, setPortalReady] = useState(false)
  const [fabAnchor, setFabAnchor] = useState<HTMLElement | null>(null)
  const [skills, setSkills] = useState<SkillSummary[]>([])
  const [disabledTools, setDisabledTools] = useState<ExecuteTool[]>([])
  const [chatProvider, setChatProvider] = useState<ChatProviderChoice>('auto')
  const chatProviderTouchedRef = useRef(false)
  const [agentMode, setAgentMode] = useState<AgentModeChoice>('auto')
  const [providerCatalog, setProviderCatalog] = useState<Array<{ id: string; configured: boolean }>>([])
  const [fileDragDepth, setFileDragDepth] = useState(0)
  const [dictationPhase, setDictationPhase] = useState<'idle' | 'recording' | 'transcribing'>('idle')
  const [speechError, setSpeechError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const dictationStreamRef = useRef<MediaStream | null>(null)
  const composerRef = useRef<AdminAiComposerFieldHandle | null>(null)
  const [honestyMode, setHonestyMode] = useState<AdminChatHonestyMode>('strict')
  const [energyPreset, setEnergyPreset] = useState<AdminChatEnergyPreset>('default')
  const [explainOpen, setExplainOpen] = useState(false)
  const assistantPrefsLoaded = useRef(false)
  const anchorsPanelLoaded = useRef(false)
  const [anchorsPanelOpen, setAnchorsPanelOpen] = useState(false)
  const polishModeLoaded = useRef(false)
  const polishAutoHold = useRef(false)
  const [polishMode, setPolishMode] = useState<StrategyPackPolishMode>('suggest')
  const [chatSettingsMenuOpen, setChatSettingsMenuOpen] = useState(false)
  const chatSettingsMenuRef = useRef<HTMLDivElement | null>(null)

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) ?? sessions[0]!,
    [sessions, activeSessionId]
  )
  const {
    messages,
    input,
    attachments,
    elementPicks,
    links,
    activeSkill,
    activeSkillInferredAt,
    anchors,
    lastRoutingEcho,
    lastRunFingerprint,
    skillShiftNotice,
    preflightSuggestion,
    pendingPlanSteps,
    lastRunbookGraph,
    pendingAction,
    execPreviewDiffBaseline,
    preferStrategyPackRefine,
    threadMemory,
    checkpoints,
    armedPrompts,
  } = activeSession
  const picks = elementPicks ?? []
  const linkChips = links ?? []
  const inputLiveRef = useRef(input)
  const attachmentsLiveRef = useRef(attachments)
  const picksLiveRef = useRef(picks)
  const linksLiveRef = useRef(linkChips)
  inputLiveRef.current = input
  attachmentsLiveRef.current = attachments
  picksLiveRef.current = picks
  linksLiveRef.current = linkChips
  const sendArmedPromptRef = useRef<(text: string) => void>(() => undefined)
  const firingArmedIdRef = useRef<string | null>(null)
  sendArmedPromptRef.current = (text: string) => {
    void sendComposerTurn(text, false)
  }

  const visibleMessages = useMemo(() => sanitizeAdminChatMessagesForDisplay(messages), [messages])

  const threadDistanceFromBottom = useCallback((el: HTMLElement) => {
    return el.scrollHeight - el.scrollTop - el.clientHeight
  }, [])

  const earlierUserMessageTop = useCallback((el: HTMLElement) => {
    const pad = Number.parseFloat(getComputedStyle(el).paddingTop) || 0
    const viewTop = el.getBoundingClientRect().top + pad
    const nodes = el.querySelectorAll<HTMLElement>('[data-thread-user-message]')
    let target: number | null = null
    for (const node of nodes) {
      const top = el.scrollTop + (node.getBoundingClientRect().top - viewTop)
      if (top < el.scrollTop - 28) target = top
      else break
    }
    return target
  }, [])

  const jumpToPreviousUserMessage = useCallback(() => {
    const el = threadScrollRef.current
    if (!el) return
    const top = earlierUserMessageTop(el)
    if (top == null) return
    threadStickRef.current = false
    el.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
  }, [earlierUserMessageTop])

  const jumpThreadToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = threadScrollRef.current
    if (!el) return
    threadStickRef.current = true
    threadScrollLockRef.current = true
    el.scrollTo({ top: el.scrollHeight, behavior })
    const release = () => {
      threadScrollLockRef.current = false
      setThreadAwayFromBottom(threadDistanceFromBottom(el) > 48)
    }
    if (behavior === 'smooth') {
      const started = performance.now()
      const tick = () => {
        if (!threadScrollLockRef.current) return
        const away = threadDistanceFromBottom(el) > 48
        if (!away || performance.now() - started > 1500) {
          release()
          return
        }
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    } else {
      requestAnimationFrame(release)
    }
  }, [threadDistanceFromBottom])

  useEffect(() => {
    const el = threadScrollRef.current
    if (!el) return

    const publishAway = () => {
      const top = el.scrollTop
      const previousTop = threadScrollTopRef.current
      threadScrollTopRef.current = top
      const away = threadDistanceFromBottom(el) > 48
      if (threadScrollLockRef.current) {
        if (top + 2 < previousTop) {
          threadStickRef.current = false
          threadScrollLockRef.current = false
        }
      } else {
        threadStickRef.current = !away
      }
      setThreadAwayFromBottom((current) => (current === away ? current : away))
      const earlier = earlierUserMessageTop(el) != null
      setThreadHasEarlierUserMessage((current) => (current === earlier ? current : earlier))
    }

    const followThread = () => {
      if (!threadStickRef.current) {
        publishAway()
        return
      }
      if (threadDistanceFromBottom(el) > 1) {
        threadScrollLockRef.current = true
        el.scrollTop = el.scrollHeight
        threadScrollTopRef.current = el.scrollTop
        requestAnimationFrame(() => {
          threadScrollLockRef.current = false
        })
      }
      setThreadAwayFromBottom(false)
    }

    threadStickRef.current = threadDistanceFromBottom(el) <= 48
    publishAway()
    el.addEventListener('scroll', publishAway, { passive: true })
    const resizeObserver = new ResizeObserver(() => followThread())
    const watchChildren = () => {
      resizeObserver.disconnect()
      resizeObserver.observe(el)
      for (const child of el.children) resizeObserver.observe(child)
    }
    watchChildren()
    const mutationObserver = new MutationObserver(() => {
      watchChildren()
      followThread()
    })
    mutationObserver.observe(el, { childList: true, subtree: true, characterData: true })

    return () => {
      el.removeEventListener('scroll', publishAway)
      resizeObserver.disconnect()
      mutationObserver.disconnect()
    }
  }, [open, activeSessionId, threadDistanceFromBottom, earlierUserMessageTop])

  useEffect(() => {
    if (!sending) return
    threadStickRef.current = true
    const el = threadScrollRef.current
    if (!el) return
    threadScrollLockRef.current = true
    el.scrollTop = el.scrollHeight
    threadScrollTopRef.current = el.scrollTop
    const frame = requestAnimationFrame(() => {
      threadScrollLockRef.current = false
      setThreadAwayFromBottom(false)
    })
    return () => cancelAnimationFrame(frame)
  }, [sending])
  const actionChoiceHostId = useMemo(() => {
    for (let i = visibleMessages.length - 1; i >= 0; i -= 1) {
      const message = visibleMessages[i]
      if (!message || message.role === 'system') continue
      if (message.role !== 'assistant') return null
      return message.id
    }
    return null
  }, [visibleMessages])
  const showQuickStart = useMemo(() => isFreshAdminChat(messages), [messages])
  const prioritySuggestionPool = useMemo(
    () => buildPrioritySuggestionPool(pageCtx?.pageContext ?? null),
    [pageCtx?.pageContext],
  )
  const creativeSuggestionPool = useMemo(
    () => buildCreativeSuggestionPool(pageCtx?.pageContext ?? null),
    [pageCtx?.pageContext],
  )
  const priorityQuickStart = activeSession.priorityQuickStart
  const creativeQuickStart = activeSession.creativeQuickStart
  const priorityHistory = useMemo(() => {
    const p = priorityQuickStart
    if (!p) return []
    return [...p.attended, ...p.ignored].sort((a, b) => b.at - a.at)
  }, [priorityQuickStart])
  const creativeHistory = useMemo(() => {
    const c = creativeQuickStart
    if (!c) return []
    return [...c.attended, ...c.ignored].sort((a, b) => b.at - a.at)
  }, [creativeQuickStart])
  const allUnfinishedBusiness = useMemo(
    () => collectAllUnfinishedBusinessFromSessions(sessions, new Set(dismissedUnfinishedIds)),
    [sessions, dismissedUnfinishedIds],
  )

  const unfinishedView =
    activeSession.unfinishedView ?? createInitialUnfinishedBusinessViewState()

  const visibleUnfinishedBusiness = useMemo(
    () =>
      pickVisibleUnfinishedBusiness(allUnfinishedBusiness, unfinishedView, activeSessionId),
    [allUnfinishedBusiness, unfinishedView, activeSessionId],
  )

  const playbookSuggestionPool = useMemo(
    () => playbookPoolAsQuickStarts(pageCtx?.pageContext ?? null),
    [pageCtx?.pageContext],
  )

  const playbookQuickStart = activeSession.playbookQuickStart
  const playbookHistory = useMemo(() => {
    const p = playbookQuickStart
    if (!p) return []
    return [...p.attended, ...p.ignored].sort((a, b) => b.at - a.at)
  }, [playbookQuickStart])

  const visiblePlaybookRows = useMemo(() => {
    const ids = playbookQuickStart?.current ?? []
    return ids
      .map((row) => {
        const id = parsePlaybookIdFromQuickStart(row)
        if (!id) return null
        return findPlaybookById(pageCtx?.pageContext ?? null, id) ?? null
      })
      .filter((book): book is AdminAiPlaybook => Boolean(book))
  }, [playbookQuickStart, pageCtx?.pageContext])

  const studioMissionReleaseId = pageCtx?.pageContext?.studio?.releaseId
  const studioReleaseTitle = pageCtx?.pageContext?.studio?.title
  const studioActiveStep = pageCtx?.pageContext?.studio?.activeStep
  const anchorIdeas = useMemo(() => {
    const lastUser = [...messages].reverse().find((message) => message.role === 'user')?.content ?? ''
    const assistants = messages.filter((message) => message.role === 'assistant')
    const latestAssistant = assistants[assistants.length - 1]?.content ?? ''
    const recentAssistant = assistants
      .slice(-4)
      .map((message) => message.content)
      .join('\n')
    return suggestThreadAnchors({
      lastUserText: lastUser.slice(0, 2000),
      recentAssistantText: recentAssistant.slice(-6000),
      latestAssistantText: latestAssistant.slice(-2500),
      goal: threadMemory?.goal,
      releaseTitle: threadMemory?.releaseTitle || studioReleaseTitle,
      deskLabel: threadMemory?.deskLabel,
      activeStep: studioActiveStep,
      notes: threadMemory?.notes,
      existingAnchors: anchors,
    })
  }, [messages, threadMemory, studioReleaseTitle, studioActiveStep, anchors])

  const workingPhraseContext = useMemo(() => {
    const lastUser = [...messages].reverse().find((message) => message.role === 'user')?.content ?? ''
    return [
      threadMemory?.goal,
      threadMemory?.deskLabel,
      threadMemory?.releaseTitle || studioReleaseTitle,
      lastUser.slice(0, 400),
    ]
      .filter((part) => part?.trim())
      .join('\n')
  }, [messages, threadMemory, studioReleaseTitle])

  const polishCue = useMemo(() => {
    const lastUser = [...messages].reverse().find((message) => message.role === 'user')?.content ?? ''
    return strategyPackPolishCue({
      agentMode,
      planTools: pendingPlanSteps.map((step) => step.tool),
      texts: [input, lastUser.slice(0, 500), threadMemory?.goal ?? ''],
    })
  }, [messages, agentMode, pendingPlanSteps, input, threadMemory?.goal])

  const mergeIntoActive = useCallback(
    (patch: Partial<AdminChatSession> | ((s: AdminChatSession) => Partial<AdminChatSession>)) => {
      setSessions((prev) => {
        const i = prev.findIndex((s) => s.id === activeSessionId)
        if (i < 0) return prev
        const cur = prev[i]!
        const p = typeof patch === 'function' ? patch(cur) : patch
        const next: AdminChatSession = { ...cur, ...p, updatedAt: Date.now() }
        const copy = [...prev]
        copy[i] = next
        return copy
      })
    },
    [activeSessionId]
  )

  useEffect(() => {
    if (threadMemory?.goal || !studioReleaseTitle) return
    mergeIntoActive({
      threadMemory: mergeThreadMemory(threadMemory ?? emptyThreadMemory(), {
        goal: goalFromKnownRelease(studioReleaseTitle, studioActiveStep),
        releaseId: studioMissionReleaseId,
        releaseTitle: studioReleaseTitle,
      }),
    })
  }, [threadMemory, studioReleaseTitle, studioActiveStep, studioMissionReleaseId, mergeIntoActive])

  useEffect(() => {
    const patch: Partial<AdminChatSession> = {}
    if (!activeSession.priorityQuickStart) {
      patch.priorityQuickStart = createInitialPriorityQuickStartState(prioritySuggestionPool, activeSessionId)
    }
    if (!activeSession.creativeQuickStart) {
      patch.creativeQuickStart = createInitialCreativeQuickStartState(creativeSuggestionPool, activeSessionId)
    }
    if (!activeSession.playbookQuickStart && playbookSuggestionPool.length > 0) {
      patch.playbookQuickStart = createInitialPlaybookQuickStartState(
        playbookSuggestionPool,
        activeSessionId,
      )
    }
    if (!activeSession.unfinishedView) {
      patch.unfinishedView = createInitialUnfinishedBusinessViewState()
    }
    if (Object.keys(patch).length > 0) mergeIntoActive(patch)
  }, [
    activeSession.priorityQuickStart,
    activeSession.creativeQuickStart,
    activeSession.playbookQuickStart,
    activeSession.unfinishedView,
    prioritySuggestionPool,
    creativeSuggestionPool,
    playbookSuggestionPool,
    activeSessionId,
    mergeIntoActive,
  ])

  const setMessages = useCallback(
    (up: SetStateAction<ChatMessage[]>) => {
      mergeIntoActive((s) => ({
        messages: typeof up === 'function' ? (up as (m: ChatMessage[]) => ChatMessage[])(s.messages) : up,
      }))
    },
    [mergeIntoActive]
  )
  const setInput = useCallback(
    (up: SetStateAction<string>) => {
      mergeIntoActive((s) => ({
        input: typeof up === 'function' ? (up as (i: string) => string)(s.input) : up,
      }))
    },
    [mergeIntoActive]
  )
  const setAttachments = useCallback(
    (up: SetStateAction<PendingAttachment[]>) => {
      mergeIntoActive((s) => ({
        attachments: typeof up === 'function' ? (up as (a: PendingAttachment[]) => PendingAttachment[])(s.attachments) : up,
      }))
    },
    [mergeIntoActive]
  )
  const setElementPicks = useCallback(
    (up: SetStateAction<ElementPickChip[]>) => {
      mergeIntoActive((s) => ({
        elementPicks:
          typeof up === 'function' ? (up as (picks: ElementPickChip[]) => ElementPickChip[])(s.elementPicks ?? []) : up,
      }))
    },
    [mergeIntoActive]
  )
  const setLinks = useCallback(
    (up: SetStateAction<ComposerLink[]>) => {
      mergeIntoActive((s) => ({
        links: typeof up === 'function' ? (up as (rows: ComposerLink[]) => ComposerLink[])(s.links ?? []) : up,
      }))
    },
    [mergeIntoActive]
  )

  useEffect(() => {
    const present = chipsIn(input)
    const elementIds = new Set(present.filter((chip) => chip.kind === 'element').map((chip) => chip.id))
    const fileIds = new Set(present.filter((chip) => chip.kind === 'file').map((chip) => chip.id))
    const linkIds = new Set(present.filter((chip) => chip.kind === 'link').map((chip) => chip.id))
    const nextPicks = picks.filter((pick) => elementIds.has(pick.id))
    const nextLinks = linkChips.filter((link) => linkIds.has(link.id))
    const nextFiles = attachments.filter((file) => fileIds.has(file.id))
    if (nextPicks.length === picks.length && nextLinks.length === linkChips.length && nextFiles.length === attachments.length) {
      return
    }
    mergeIntoActive({ elementPicks: nextPicks, links: nextLinks, attachments: nextFiles })
  }, [input, picks, linkChips, attachments, mergeIntoActive])

  const setActiveSkill = useCallback(
    (up: SetStateAction<ChatResponse['inferredSkill'] | null>) => {
      mergeIntoActive((s) => {
        const next =
          typeof up === 'function'
            ? (up as (p: ChatResponse['inferredSkill'] | null) => ChatResponse['inferredSkill'] | null)(s.activeSkill)
            : up
        return {
          activeSkill: next,
          activeSkillInferredAt: next ? Date.now() : null,
        }
      })
    },
    [mergeIntoActive]
  )
  const setPreflightSuggestion = useCallback(
    (up: SetStateAction<PreflightSuggestion | null>) => {
      mergeIntoActive((s) => ({
        preflightSuggestion:
          typeof up === 'function'
            ? (up as (p: PreflightSuggestion | null) => PreflightSuggestion | null)(s.preflightSuggestion)
            : up,
      }))
    },
    [mergeIntoActive]
  )
  const setPendingPlanSteps = useCallback(
    (up: SetStateAction<PlanStep[]>) => {
      mergeIntoActive((s) => ({
        pendingPlanSteps: typeof up === 'function' ? (up as (v: PlanStep[]) => PlanStep[])(s.pendingPlanSteps) : up,
      }))
    },
    [mergeIntoActive]
  )
  const setLastRunbookGraph = useCallback(
    (up: SetStateAction<PlanResponse['graph'] | null>) => {
      mergeIntoActive((s) => ({
        lastRunbookGraph: typeof up === 'function' ? (up as (v: PlanResponse['graph'] | null) => PlanResponse['graph'] | null)(s.lastRunbookGraph) : up,
      }))
    },
    [mergeIntoActive]
  )
  const setPendingAction = useCallback(
    (up: SetStateAction<AssistantActionResponse | null>) => {
      mergeIntoActive((s) => {
        const resolved =
          typeof up === 'function'
            ? (up as (p: AssistantActionResponse | null) => AssistantActionResponse | null)(s.pendingAction)
            : up

        let execPreviewDiffBaseline: AdminChatSession['execPreviewDiffBaseline'] = null
        if (resolved === null) {
          execPreviewDiffBaseline = null
        } else if (
          resolved.toolPreview?.tool &&
          s.pendingAction?.toolPreview?.tool &&
          resolved.toolPreview.tool === s.pendingAction.toolPreview.tool &&
          s.pendingAction.toolPreview.payload &&
          typeof s.pendingAction.toolPreview.payload === 'object' &&
          !Array.isArray(s.pendingAction.toolPreview.payload)
        ) {
          execPreviewDiffBaseline = {
            tool: s.pendingAction.toolPreview.tool,
            payload: { ...(s.pendingAction.toolPreview.payload as Record<string, unknown>) },
          }
        }

        return {
          pendingAction: resolved,
          execPreviewDiffBaseline,
        }
      })
    },
    [mergeIntoActive]
  )

  const setPreferStrategyPackRefine = useCallback(
    (up: SetStateAction<boolean>) => {
      mergeIntoActive((s) => ({
        preferStrategyPackRefine:
          typeof up === 'function'
            ? (up as (v: boolean) => boolean)(s.preferStrategyPackRefine)
            : up,
      }))
    },
    [mergeIntoActive]
  )

  const setAnchorSlot = useCallback(
    (index: 0 | 1 | 2, value: string) => {
      mergeIntoActive((s) => {
        const next: [string, string, string] = [...s.anchors] as [string, string, string]
        next[index] = value
        return { anchors: next }
      })
    },
    [mergeIntoActive]
  )

  const applyAnchorSuggestion = useCallback(
    (snippet: string) => {
      mergeIntoActive((s) => {
        const emptyIdx = s.anchors.findIndex((a) => !a.trim())
        if (emptyIdx < 0) return {}
        const next: [string, string, string] = [...s.anchors] as [string, string, string]
        next[emptyIdx as 0 | 1 | 2] = snippet
        return { anchors: next }
      })
    },
    [mergeIntoActive]
  )

  const dismissSkillShiftNotice = useCallback(() => {
    mergeIntoActive({ skillShiftNotice: null })
  }, [mergeIntoActive])

  const openReplyInNewChat = useCallback(
    (raw: string) => {
      const content = raw.trim()
      if (!content) return
      const id = createMessageId()
      const memory = threadMemory ?? emptyThreadMemory()
      const session = {
        ...createEmptySession(id),
        title: replyThreadTitle(content),
        updatedAt: Date.now(),
        messages: [{ id: createMessageId(), role: 'assistant' as const, content }],
        threadMemory: {
          ...emptyThreadMemory(),
          goal: memory.goal,
          releaseId: memory.releaseId,
          releaseTitle: memory.releaseTitle,
          deskUrl: memory.deskUrl,
          deskLabel: memory.deskLabel,
          updatedAt: Date.now(),
        },
      }
      setSessions((prev) => {
        const next = [...prev, session]
        if (next.length <= MAX_CHAT_SESSIONS) return next
        const dropId = [...prev].sort((a, b) => a.updatedAt - b.updatedAt)[0]!.id
        releaseAdminBrowserChat(dropId)
        return next.filter((row) => row.id !== dropId)
      })
      setActiveSessionId(id)
      setShowSessionHistory(false)
    },
    [threadMemory],
  )

  const startNewChat = useCallback(() => {
    const id = createMessageId()
    setSessions((prev) => {
      if (prev.length >= MAX_CHAT_SESSIONS) {
        const dropId = [...prev].sort((a, b) => a.updatedAt - b.updatedAt)[0]!.id
        releaseAdminBrowserChat(dropId)
        return [...prev.filter((s) => s.id !== dropId), createEmptySession(id)]
      }
      return [...prev, createEmptySession(id)]
    })
    setActiveSessionId(id)
    setShowSessionHistory(false)
  }, [])

  const removeSession = useCallback((id: string) => {
    setSessions((prev) => (prev.length <= 1 ? prev : prev.filter((s) => s.id !== id)))
    releaseAdminBrowserChat(id)
  }, [])

  useEffect(() => {
    setSessions((prev) => {
      let changed = false
      const next = prev.map((session) => {
        if (!(session.attachedReleaseIds ?? []).length) return session
        const memory = session.threadMemory ?? emptyThreadMemory()
        const releaseTitle = memory.releaseTitle?.trim()
        if (!releaseTitle) return session
        const userLines = session.messages.filter((message) => message.role === 'user').map((message) => message.content)
        const title = attachedThreadTitle({
          releaseTitle,
          goal: memory.goal,
          texts: [...memory.notes, ...userLines],
        })
        if (session.title === title) return session
        changed = true
        return { ...session, title, updatedAt: Date.now() }
      })
      return changed ? next : prev
    })
  }, [sessions])

  const setSessionReleaseAttachment = useCallback(
    (sessionId: string, releaseId: string, releaseTitle: string | null, attach: boolean) => {
      setSessions((prev) =>
        prev.map((session) => {
          if (session.id !== sessionId) return session
          const current = session.attachedReleaseIds ?? []
          const attachedReleaseIds = attach
            ? current.includes(releaseId)
              ? current
              : [...current, releaseId].slice(0, 12)
            : current.filter((id) => id !== releaseId)
          const memory = session.threadMemory ?? emptyThreadMemory()
          const userLines = session.messages.filter((message) => message.role === 'user').map((message) => message.content)
          const namedRelease = releaseTitle || memory.releaseTitle || 'Release'
          return {
            ...session,
            attachedReleaseIds,
            title: attach
              ? attachedThreadTitle({
                  releaseTitle: namedRelease,
                  goal: memory.goal,
                  texts: [...memory.notes, ...userLines],
                })
              : questionThreadTitle(userLines),
            threadMemory: attach
              ? {
                  ...memory,
                  releaseId: memory.releaseId || releaseId,
                  releaseTitle: memory.releaseTitle || releaseTitle || memory.releaseTitle,
                }
              : memory,
            updatedAt: Date.now(),
          }
        }),
      )
    },
    [],
  )

  useEffect(() => {
    if (sessions.length > 0 && !sessions.some((s) => s.id === activeSessionId)) {
      setActiveSessionId(sessions[0]!.id)
    }
  }, [sessions, activeSessionId])

  useEffect(() => {
    if (typeof window === 'undefined' || sessionsHydrated.current) return
    try {
      const raw = localStorage.getItem(ADMIN_AI_SESSIONS_KEY)
      if (raw) {
        const data = JSON.parse(raw) as { activeSessionId?: string; sessions?: AdminChatSession[] }
        if (Array.isArray(data.sessions) && data.sessions.length > 0) {
          const cleaned: AdminChatSession[] = data.sessions.map((s) => ({
            id: s.id,
            title: s.title || 'Chat',
            updatedAt: s.updatedAt ?? Date.now(),
            messages: sanitizeAdminChatMessagesForDisplay(
              Array.isArray(s.messages) ? s.messages : [],
            ) as AdminChatSession['messages'],
            activeSkill: s.activeSkill ?? null,
            activeSkillInferredAt: typeof s.activeSkillInferredAt === 'number' ? s.activeSkillInferredAt : null,
            anchors:
              Array.isArray(s.anchors) && s.anchors.length === 3
                ? [String(s.anchors[0] ?? ''), String(s.anchors[1] ?? ''), String(s.anchors[2] ?? '')]
                : ['', '', ''],
            lastRoutingEcho: s.lastRoutingEcho && typeof s.lastRoutingEcho === 'object' ? (s.lastRoutingEcho as AdminChatRoutingEcho) : null,
            lastRunFingerprint: typeof s.lastRunFingerprint === 'string' ? s.lastRunFingerprint : null,
            skillShiftNotice:
              s.skillShiftNotice &&
              typeof s.skillShiftNotice === 'object' &&
              typeof (s.skillShiftNotice as { fromId?: string }).fromId === 'string'
                ? (s.skillShiftNotice as AdminChatSession['skillShiftNotice'])
                : null,
            preflightSuggestion: s.preflightSuggestion ?? null,
            pendingPlanSteps: Array.isArray(s.pendingPlanSteps) ? s.pendingPlanSteps : [],
            lastRunbookGraph: s.lastRunbookGraph ?? null,
            pendingAction: s.pendingAction ?? null,
            execPreviewDiffBaseline:
              s.execPreviewDiffBaseline &&
              typeof s.execPreviewDiffBaseline === 'object' &&
              typeof (s.execPreviewDiffBaseline as { tool?: string }).tool === 'string' &&
              typeof (s.execPreviewDiffBaseline as { payload?: unknown }).payload === 'object' &&
              (s.execPreviewDiffBaseline as { payload?: unknown }).payload !== null &&
              !Array.isArray((s.execPreviewDiffBaseline as { payload?: unknown }).payload)
                ? {
                    tool: (s.execPreviewDiffBaseline as { tool: string }).tool,
                    payload: {
                      ...((s.execPreviewDiffBaseline as { payload: Record<string, unknown> }).payload ?? {}),
                    },
                  }
                : null,
            anchorSuggestions: Array.isArray(s.anchorSuggestions)
              ? s.anchorSuggestions.filter((x) => typeof x === 'string').slice(0, 5)
              : [],
            ...composerDraftFromSession(s.input, s.elementPicks, s.links),
            attachments: [],
            preferStrategyPackRefine: Boolean(s.preferStrategyPackRefine),
            threadMemory: normalizeThreadMemory(
              (s as { threadMemory?: unknown }).threadMemory ?? emptyThreadMemory(),
            ),
            checkpoints: Array.isArray((s as { checkpoints?: unknown }).checkpoints)
              ? ((s as { checkpoints: AdminAiCheckpoint[] }).checkpoints || []).slice(-12)
              : [],
            armedPrompts: sanitizeArmedPrompts((s as { armedPrompts?: unknown }).armedPrompts),
            attachedReleaseIds: Array.isArray((s as { attachedReleaseIds?: unknown }).attachedReleaseIds)
              ? (s as { attachedReleaseIds: unknown[] }).attachedReleaseIds
                  .filter((id): id is string => typeof id === 'string' && id.length > 0)
                  .slice(0, 12)
              : [],
            priorityQuickStart: sanitizeRotatingQuickStartState(s.priorityQuickStart),
            creativeQuickStart: sanitizeRotatingQuickStartState(s.creativeQuickStart),
            playbookQuickStart: sanitizeRotatingQuickStartState(s.playbookQuickStart),
            unfinishedView:
              s.unfinishedView && typeof s.unfinishedView === 'object'
                ? {
                    refreshCount:
                      typeof (s.unfinishedView as UnfinishedBusinessViewState).refreshCount === 'number'
                        ? (s.unfinishedView as UnfinishedBusinessViewState).refreshCount
                        : 0,
                    rotatedIds: Array.isArray((s.unfinishedView as UnfinishedBusinessViewState).rotatedIds)
                      ? (s.unfinishedView as UnfinishedBusinessViewState).rotatedIds.filter(
                          (id) => typeof id === 'string',
                        )
                      : [],
                  }
                : undefined,
          }))
          setSessions(cleaned)
          if (data.activeSessionId && cleaned.some((x) => x.id === data.activeSessionId)) {
            setActiveSessionId(data.activeSessionId)
          } else {
            setActiveSessionId(cleaned[0]!.id)
          }
        }
      }
    } catch {
      /* keep defaults */
    }
    sessionsHydrated.current = true
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || unfinishedDismissHydrated.current) return
    try {
      const archiveRaw = localStorage.getItem(ADMIN_AI_UNFINISHED_ARCHIVE_LS)
      if (archiveRaw) {
        const parsed = JSON.parse(archiveRaw) as AdminAiUnfinishedBusinessEntry[]
        if (Array.isArray(parsed)) {
          setDismissedUnfinishedArchive(parsed.filter((row) => row && typeof row.id === 'string').slice(0, 40))
        }
      }
      const raw = localStorage.getItem(ADMIN_AI_UNFINISHED_DISMISS_LS)
      if (raw) {
        const parsed = JSON.parse(raw) as unknown
        if (Array.isArray(parsed)) {
          setDismissedUnfinishedIds(parsed.filter((x) => typeof x === 'string').slice(0, 80))
        }
      }
    } catch {
      /* keep */
    }
    unfinishedDismissHydrated.current = true
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !unfinishedDismissHydrated.current) return
    try {
      localStorage.setItem(ADMIN_AI_UNFINISHED_DISMISS_LS, JSON.stringify(dismissedUnfinishedIds.slice(0, 80)))
      localStorage.setItem(
        ADMIN_AI_UNFINISHED_ARCHIVE_LS,
        JSON.stringify(dismissedUnfinishedArchive.slice(0, 40)),
      )
    } catch {
      /* quota */
    }
  }, [dismissedUnfinishedIds, dismissedUnfinishedArchive])

  const dismissedUnfinishedHistory = useMemo(
    () =>
      dismissedUnfinishedArchive.map((entry) => ({
        id: entry.id,
        label: entry.label,
        detail: `${entry.detail} · dismissed`,
        message: entry.message,
        skillId: entry.skillId,
        priorityScore: entry.priorityScore,
        at: entry.at,
        status: 'ignored' as const,
        nav: entry.nav,
      })),
    [dismissedUnfinishedArchive],
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!assistantPrefsLoaded.current) {
      try {
        const llm = localStorage.getItem(ADMIN_AI_LLM_LS)
        if (isChatProviderChoice(llm)) setChatProvider(llm)
        const h = localStorage.getItem(ADMIN_AI_HONESTY_LS)
        if (h === 'relaxed' || h === 'strict') setHonestyMode(h)
        const e = localStorage.getItem(ADMIN_AI_ENERGY_LS)
        if (e === 'default' || e === 'tour_prep' || e === 'studio_week' || e === 'launch_day') {
          setEnergyPreset(e)
        }
      } catch {
        /* keep */
      }
      assistantPrefsLoaded.current = true
      return
    }
    try {
      localStorage.setItem(ADMIN_AI_HONESTY_LS, honestyMode)
      localStorage.setItem(ADMIN_AI_ENERGY_LS, energyPreset)
    } catch {
      /* quota */
    }
  }, [honestyMode, energyPreset])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!polishModeLoaded.current) {
      try {
        const stored = localStorage.getItem(PACK_POLISH_MODE_LS)
        if (stored === 'suggest' || stored === 'auto' || stored === 'always' || stored === 'off') {
          setPolishMode(stored)
        }
      } catch {
        /* keep */
      }
      polishModeLoaded.current = true
      return
    }
    try {
      localStorage.setItem(PACK_POLISH_MODE_LS, polishMode)
    } catch {
      /* quota */
    }
  }, [polishMode])

  useEffect(() => {
    if (!polishModeLoaded.current) return
    if (polishMode === 'always') {
      if (!preferStrategyPackRefine) setPreferStrategyPackRefine(true)
      return
    }
    if (polishMode === 'off') {
      if (preferStrategyPackRefine) setPreferStrategyPackRefine(false)
      return
    }
    if (!polishCue) polishAutoHold.current = false
    if (polishMode === 'auto' && polishCue && !polishAutoHold.current && !preferStrategyPackRefine) {
      setPreferStrategyPackRefine(true)
    }
  }, [polishMode, polishCue, preferStrategyPackRefine])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!anchorsPanelLoaded.current) {
      try {
        if (localStorage.getItem(ADMIN_AI_ANCHORS_PANEL_LS) === '1') setAnchorsPanelOpen(true)
      } catch {
        /* keep */
      }
      anchorsPanelLoaded.current = true
      return
    }
    try {
      localStorage.setItem(ADMIN_AI_ANCHORS_PANEL_LS, anchorsPanelOpen ? '1' : '0')
    } catch {
      /* quota */
    }
  }, [anchorsPanelOpen])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = localStorage.getItem(ADMIN_AI_DOCK_MODE_KEY)
      if (raw === 'dock-right' || raw === 'dock-left' || raw === 'floating') {
        setDockMode(raw as ChatDockMode)
      }
      if (raw !== 'floating') {
        const wRaw = localStorage.getItem(ADMIN_AI_DOCK_WIDTH_KEY)
        const w = wRaw ? Number.parseInt(wRaw, 10) : NaN
        if (Number.isFinite(w) && w >= PANEL_MIN_W && w <= DOCK_PANEL_MAX_W) {
          const vh = window.innerHeight
          setPanelSize({ w, h: Math.max(PANEL_MIN_H, vh - PANEL_PAD * 2) })
        }
      }
    } catch {
      /* keep default */
    }
    dockModeHydrated.current = true
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !dockModeHydrated.current) return
    try {
      localStorage.setItem(ADMIN_AI_DOCK_MODE_KEY, dockMode)
    } catch {
      /* quota */
    }
  }, [dockMode])

  const firstPersist = useRef(true)
  useEffect(() => {
    if (typeof window === 'undefined' || !sessionsHydrated.current) return
    if (firstPersist.current) {
      firstPersist.current = false
      return
    }
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(
          ADMIN_AI_SESSIONS_KEY,
          JSON.stringify({
            activeSessionId,
            sessions: sessions.map((s) => ({
              ...s,
              attachments: [],
              input: stripChipKind(s.input, 'file'),
              messages: s.messages.slice(-MAX_PERSISTED_MESSAGES_PER_SESSION),
            })),
          })
        )
        notifyChatThreadsChanged()
      } catch {
        /* quota */
      }
    }, 500)
    return () => clearTimeout(t)
  }, [sessions, activeSessionId])

  useEffect(() => {
    if (!showSessionHistory) return
    function onDown(e: MouseEvent) {
      if (historyPopoverRef.current && !historyPopoverRef.current.contains(e.target as Node)) {
        setShowSessionHistory(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [showSessionHistory])

  useEffect(() => {
    if (!chatSettingsMenuOpen) return
    function onPointerDown(e: PointerEvent) {
      const el = chatSettingsMenuRef.current
      if (el && !el.contains(e.target as Node)) setChatSettingsMenuOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setChatSettingsMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [chatSettingsMenuOpen])

  useEffect(() => {
    if (!enabled) setChatSettingsMenuOpen(false)
  }, [enabled])

  useEffect(() => {
    if (!tabMenu) return
    function onDown(e: MouseEvent) {
      if (e.button !== 0) return
      const target = e.target as HTMLElement | null
      if (target?.closest('[data-admin-ai-tab-menu]')) return
      setTabMenu(null)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setTabMenu(null)
    }
    const timer = window.setTimeout(() => {
      document.addEventListener('mousedown', onDown)
    }, 0)
    document.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [tabMenu])

  useEffect(() => {
    if (!gripDockMenu) return

    function onDown(e: MouseEvent) {
      if (gripDockMenuRef.current?.contains(e.target as Node)) return
      setGripDockMenu(null)
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setGripDockMenu(null)
    }

    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [gripDockMenu])

  useEffect(() => {
    function onToggle() {
      setEnabled((prevEnabled) => {
        const nextEnabled = !prevEnabled
        setOpen(nextEnabled ? true : false)
        return nextEnabled
      })
    }

    function onOpen() {
      setEnabled(true)
      setOpen(true)
    }

    function onPrompt(event: Event) {
      const detail = (event as CustomEvent<{ message?: string; agentMode?: string; submit?: boolean }>).detail
      setEnabled(true)
      setOpen(true)
      if (
        detail?.agentMode === 'studio_release' ||
        detail?.agentMode === 'sergik_intelligence' ||
        detail?.agentMode === 'admin_intel' ||
        detail?.agentMode === 'growth_marketing' ||
        detail?.agentMode === 'product_strategy' ||
        detail?.agentMode === 'music_business_counsel'
      ) {
        setAgentMode(detail.agentMode)
      }
      if (typeof detail?.message === 'string' && detail.message.trim()) {
        const message = detail.message.trim()
        if (detail.submit) {
          setQueuedExec(message)
          setInput('')
        } else {
          setInput(message)
        }
      }
    }

    function onFocusSession(event: Event) {
      const sessionId = (event as CustomEvent<{ sessionId?: string }>).detail?.sessionId
      if (!sessionId) return
      setEnabled(true)
      setOpen(true)
      setActiveSessionId(sessionId)
    }

    window.addEventListener('admin-ai:toggle', onToggle as EventListener)
    window.addEventListener('admin-ai:open', onOpen as EventListener)
    window.addEventListener(ADMIN_AI_FOCUS_SESSION_EVENT, onFocusSession as EventListener)
    function onApplyField(event: Event) {
      const detail = (event as CustomEvent<{ fieldId?: string; value?: string }>).detail
      if (!detail?.fieldId || typeof detail.value !== 'string') return
      applyFieldValue(detail.fieldId, detail.value)
    }

    window.addEventListener('admin-ai:prompt', onPrompt as EventListener)
    window.addEventListener('admin-ai:apply-field', onApplyField as EventListener)

    const pending = consumePendingAdminAiPrompt()
    if (pending) {
      onPrompt(new CustomEvent('admin-ai:prompt', { detail: pending }))
    }

    return () => {
      window.removeEventListener('admin-ai:toggle', onToggle as EventListener)
      window.removeEventListener('admin-ai:open', onOpen as EventListener)
      window.removeEventListener(ADMIN_AI_FOCUS_SESSION_EVENT, onFocusSession as EventListener)
      window.removeEventListener('admin-ai:prompt', onPrompt as EventListener)
      window.removeEventListener('admin-ai:apply-field', onApplyField as EventListener)
    }
  }, [setInput, setQueuedExec])

  useEffect(() => {
    if (!enabled || sending || !queuedExec) return
    const message = queuedExec
    setQueuedExec(null)
    void sendComposerTurnRef.current(message, false)
  }, [enabled, sending, queuedExec])

  useEffect(() => {
    async function loadSkills() {
      try {
        const response = await adminAiFetch('/api/admin/ai/skills')
        if (!response.ok) return
        const body = (await response.json().catch(() => ({}))) as {
          skills?: SkillSummary[]
          disabledTools?: string[]
        }
        setSkills(Array.isArray(body.skills) ? body.skills : [])
        const dt = Array.isArray(body.disabledTools) ? body.disabledTools : []
        const known: ExecuteTool[] = [
          'create_release_checklist',
          'draft_product_strategy_pack',
          'generate_campaign_draft',
          'generate_smartlink_utm_plan',
          'run_playwright_e2e',
          'run_applescript',
          'query_ops_snapshot',
          'create_distribution_release_draft',
          'query_intelligence_harness',
          'query_sergikai_chat',
          'query_crowe_creative',
          'audit_music_contract',
          'audit_music_books',
          'query_release_studio_snapshot',
          'query_studio_command_center',
          'patch_release_marketing_copy',
          'update_copyright_checklist',
          'assign_isrcs',
          'run_meta_promo_pipeline',
          'admin_browser',
          'query_platform_growth_snapshot',
          'read_workspace',
        ]
        setDisabledTools(dt.filter((t): t is ExecuteTool => known.includes(t as ExecuteTool)))
      } catch {
        setSkills([])
      }
    }

    // Defer until the panel is actually open — don't compete with page navigation.
    if (enabled && (open || isStandalone)) {
      void loadSkills()
    }
  }, [enabled, open, isStandalone])

  useEffect(() => {
    async function loadChatProviders() {
      try {
        const response = await adminAiFetch('/api/admin/ai/chat/providers')
        if (!response.ok) return
        const body = (await response.json().catch(() => ({}))) as ChatProvidersApi
        if (Array.isArray(body.providers)) {
          setProviderCatalog(body.providers)
        }
        const saved = body.assistantDefaultLlm
        let localChoice: string | null = null
        try {
          localChoice = window.localStorage.getItem(ADMIN_AI_LLM_LS)
        } catch {
          localChoice = null
        }
        if (chatProviderTouchedRef.current || isChatProviderChoice(localChoice)) return
        if (isChatProviderChoice(saved)) setChatProvider(saved)
      } catch {
        setProviderCatalog([])
      }
    }
    if (enabled && (open || isStandalone)) {
      void loadChatProviders()
    }
  }, [enabled, open, isStandalone])

  useEffect(() => {
    setPortalReady(true)
  }, [])

  useEffect(() => {
    void loadMerchFont(merchFontById('orbitron'))
  }, [])

  useEffect(() => {
    if (!portalReady || typeof document === 'undefined') return

    function resolveFabAnchor() {
      setFabAnchor(document.getElementById(ADMIN_AI_FAB_ANCHOR_ID))
    }

    resolveFabAnchor()
    // Prefer a one-shot + idle retry over a body-wide MutationObserver (expensive on admin).
    const idleId =
      typeof window !== 'undefined' && 'requestIdleCallback' in window
        ? window.requestIdleCallback(() => resolveFabAnchor(), { timeout: 1500 })
        : null
    const timeoutId = window.setTimeout(resolveFabAnchor, 400)
    return () => {
      window.clearTimeout(timeoutId)
      if (idleId != null && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId)
      }
    }
  }, [portalReady])

  useEffect(() => {
    if (!fabAnchor) return
    const hide =
      !isStandalone &&
      open &&
      (dockMode === 'dock-left' || dockMode === 'dock-right')
    fabAnchor.style.display = hide ? 'none' : ''
    return () => {
      fabAnchor.style.display = ''
    }
  }, [fabAnchor, isStandalone, dockMode, open])

  /** Reserve horizontal space on <main> when an edge dock strip is visible (see AdminLayoutClient). */
  useEffect(() => {
    if (typeof document === 'undefined') return

    const edgeDock =
      !isStandalone && (dockMode === 'dock-right' || dockMode === 'dock-left') && enabled && open

    if (!edgeDock) {
      document.documentElement.style.removeProperty('--admin-ai-dock-inset')
      document.documentElement.style.removeProperty('--admin-ai-dock-inset-left')
      document.documentElement.style.removeProperty('--admin-ai-dock-inset-right')
      return
    }

    function applyInset() {
      const vw = window.innerWidth
      const wFallback = Math.min(
        DOCK_PANEL_MAX_W,
        Math.min(420, Math.max(PANEL_MIN_W, vw - PANEL_PAD * 2))
      )
      const w = panelSize?.w ?? wFallback
      const inset = `${Math.min(
        Math.max(w, PANEL_MIN_W),
        Math.min(DOCK_PANEL_MAX_W, Math.max(PANEL_MIN_W, vw - PANEL_PAD))
      )}px`
      if (dockMode === 'dock-left') {
        document.documentElement.style.setProperty('--admin-ai-dock-inset-left', inset)
        document.documentElement.style.removeProperty('--admin-ai-dock-inset-right')
        document.documentElement.style.removeProperty('--admin-ai-dock-inset')
      } else {
        document.documentElement.style.setProperty('--admin-ai-dock-inset-right', inset)
        document.documentElement.style.setProperty('--admin-ai-dock-inset', inset)
        document.documentElement.style.removeProperty('--admin-ai-dock-inset-left')
      }
    }

    applyInset()
    window.addEventListener('resize', applyInset)
    return () => {
      window.removeEventListener('resize', applyInset)
      document.documentElement.style.removeProperty('--admin-ai-dock-inset')
      document.documentElement.style.removeProperty('--admin-ai-dock-inset-left')
      document.documentElement.style.removeProperty('--admin-ai-dock-inset-right')
    }
  }, [isStandalone, dockMode, enabled, open, panelSize])

  useEffect(() => {
    if (!isStandalone && !(enabled && open)) return
    const onWheel = (event: WheelEvent) => {
      if (wheelStaysInsideAdminAiPanel(event)) return
      const target = event.target
      if (!(target instanceof Element) || !target.closest('[data-admin-ai-panel]')) return
      event.preventDefault()
    }
    document.addEventListener('wheel', onWheel, { capture: true, passive: false })
    return () => document.removeEventListener('wheel', onWheel, { capture: true })
  }, [isStandalone, enabled, open])

  useEffect(() => {
    if (!open || isStandalone || dockMode === 'dock-right' || dockMode === 'dock-left') return

    const sidePadding = 16
    const topPadding = 24
    const w = Math.min(420, window.innerWidth - sidePadding * 2)
    const h = Math.round(window.innerHeight * 0.7)

    setPanelSize((prev) => prev ?? { w, h })
    setPosition((prev) => {
      if (prev) return prev
      const defaultX = Math.max(sidePadding, window.innerWidth - w - sidePadding)
      const defaultY = Math.max(topPadding, window.innerHeight * 0.15)
      return { x: defaultX, y: defaultY }
    })
  }, [open, isStandalone, dockMode])

  useEffect(() => {
    if (!open || isStandalone || (dockMode !== 'dock-right' && dockMode !== 'dock-left')) return
    const w = Math.min(DOCK_PANEL_MAX_W, Math.min(420, window.innerWidth - PANEL_PAD * 2))
    const vh = window.innerHeight
    setPanelSize((prev) => ({ w: prev?.w ?? w, h: Math.max(PANEL_MIN_H, vh - PANEL_PAD * 2) }))
    setPosition(null)
  }, [open, isStandalone, dockMode])

  useEffect(() => {
    if (
      !dockModeHydrated.current ||
      isStandalone ||
      (dockMode !== 'dock-right' && dockMode !== 'dock-left') ||
      !enabled ||
      !open
    ) {
      return
    }

    function onWinResize() {
      const vh = window.innerHeight
      setPanelSize((prev) =>
        prev
          ? { w: Math.min(prev.w, DOCK_PANEL_MAX_W, window.innerWidth - PANEL_PAD * 2), h: Math.max(PANEL_MIN_H, vh - PANEL_PAD * 2) }
          : {
              w: Math.min(DOCK_PANEL_MAX_W, Math.min(420, window.innerWidth - PANEL_PAD * 2)),
              h: Math.max(PANEL_MIN_H, vh - PANEL_PAD * 2),
            }
      )
    }
    onWinResize()
    window.addEventListener('resize', onWinResize)
    return () => window.removeEventListener('resize', onWinResize)
  }, [dockMode, enabled, open, isStandalone])

  useEffect(() => {
    if (!isDragging) return

    function handlePointerMove(event: PointerEvent) {
      const panel = panelRef.current
      if (!panel) return

      const panelRect = panel.getBoundingClientRect()
      const maxX = Math.max(8, window.innerWidth - panelRect.width - 8)
      const maxY = Math.max(8, window.innerHeight - panelRect.height - 8)

      const nextX = Math.min(Math.max(8, event.clientX - dragOffsetRef.current.x), maxX)
      const nextY = Math.min(Math.max(8, event.clientY - dragOffsetRef.current.y), maxY)
      setPosition({ x: nextX, y: nextY })
    }

    function handlePointerUp() {
      setIsDragging(false)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [isDragging])

  useEffect(() => {
    if (!isResizing) return

    function applyResizeMove(event: PointerEvent) {
      const s = resizeStartRef.current
      if (!s) return

      // Right-docked strip: resize width from the west edge only; keep panel flush to viewport right.
      if (dockMode === 'dock-right' && !isStandalone && s.edge === 'w') {
        const dx = event.clientX - s.startPointerX
        const vh = window.innerHeight
        let width = Math.max(PANEL_MIN_W, s.startWidth - dx)
        width = Math.min(width, window.innerWidth - PANEL_PAD * 2, DOCK_PANEL_MAX_W)
        setPanelSize({ w: width, h: Math.max(PANEL_MIN_H, vh - PANEL_PAD * 2) })
        setPosition(null)
        return
      }

      // Left-docked strip: resize width from the east edge only; keep panel flush after sidebar.
      if (dockMode === 'dock-left' && !isStandalone && s.edge === 'e') {
        const dx = event.clientX - s.startPointerX
        const vh = window.innerHeight
        let width = Math.max(PANEL_MIN_W, s.startWidth + dx)
        width = Math.min(width, window.innerWidth - PANEL_PAD * 2, DOCK_PANEL_MAX_W)
        setPanelSize({ w: width, h: Math.max(PANEL_MIN_H, vh - PANEL_PAD * 2) })
        setPosition(null)
        return
      }

      const dx = event.clientX - s.startPointerX
      const dy = event.clientY - s.startPointerY
      const vw = window.innerWidth
      const vh = window.innerHeight

      let left = s.startLeft
      let top = s.startTop
      let width = s.startWidth
      let height = s.startHeight

      const edge = s.edge
      const includesWest = edge === 'w' || edge === 'nw' || edge === 'sw'
      const includesEast = edge === 'e' || edge === 'ne' || edge === 'se'
      const includesNorth = edge === 'n' || edge === 'nw' || edge === 'ne'
      const includesSouth = edge === 's' || edge === 'sw' || edge === 'se'

      if (includesWest) {
        left = s.startLeft + dx
        width = s.startWidth - dx
      } else if (includesEast) {
        width = s.startWidth + dx
      }

      if (includesNorth) {
        top = s.startTop + dy
        height = s.startHeight - dy
      } else if (includesSouth) {
        height = s.startHeight + dy
      }

      width = Math.max(PANEL_MIN_W, width)
      height = Math.max(PANEL_MIN_H, height)
      width = Math.min(width, vw - PANEL_PAD * 2)
      height = Math.min(height, vh - PANEL_PAD * 2)

      if (includesWest && width <= PANEL_MIN_W + 0.001) {
        left = s.startLeft + s.startWidth - PANEL_MIN_W
        width = PANEL_MIN_W
      }
      if (includesNorth && height <= PANEL_MIN_H + 0.001) {
        top = s.startTop + s.startHeight - PANEL_MIN_H
        height = PANEL_MIN_H
      }

      left = Math.max(PANEL_PAD, Math.min(left, vw - width - PANEL_PAD))
      top = Math.max(PANEL_PAD, Math.min(top, vh - height - PANEL_PAD))

      if (left + width > vw - PANEL_PAD) {
        width = vw - PANEL_PAD - left
      }
      if (top + height > vh - PANEL_PAD) {
        height = vh - PANEL_PAD - top
      }

      width = Math.max(PANEL_MIN_W, width)
      height = Math.max(PANEL_MIN_H, height)

      setPosition({ x: left, y: top })
      setPanelSize({ w: width, h: height })
    }

    function handlePointerUp() {
      resizeStartRef.current = null
      setIsResizing(false)
    }

    window.addEventListener('pointermove', applyResizeMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', applyResizeMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [isResizing, dockMode, isStandalone])

  useEffect(() => {
    if (isResizing) {
      wasResizingDock.current = true
      return
    }
    if (!wasResizingDock.current) return
    wasResizingDock.current = false
    if (isStandalone || (dockMode !== 'dock-right' && dockMode !== 'dock-left') || !panelSize?.w) return
    try {
      localStorage.setItem(ADMIN_AI_DOCK_WIDTH_KEY, String(Math.round(panelSize.w)))
    } catch {
      /* quota */
    }
  }, [isResizing, dockMode, panelSize?.w, isStandalone])

  useEffect(() => {
    if (!isSplitResizing) return
    function onMove(event: PointerEvent) {
      const drag = splitResizeRef.current
      if (!drag) return
      const panel = panelRef.current
      const total = panel?.clientWidth || window.innerWidth
      const browserMin = drag.dock ? 640 : STANDALONE_BROWSER_MIN_W
      const maxChat = Math.max(STANDALONE_CHAT_MIN_W, total - browserMin)
      const next = Math.round(
        Math.min(maxChat, Math.max(STANDALONE_CHAT_MIN_W, drag.startW + drag.grow * (event.clientX - drag.startX)))
      )
      if (drag.dock) setDockBesideChatW(next)
      else setChatPaneWidth(next)
    }
    function onUp() {
      const drag = splitResizeRef.current
      splitResizeRef.current = null
      setIsSplitResizing(false)
      if (drag?.dock) {
        setDockBesideChatW((w) => {
          try {
            localStorage.setItem(ADMIN_AI_DOCK_BROWSER_CHAT_W_KEY, String(Math.round(w)))
          } catch {
            /* quota */
          }
          return w
        })
        return
      }
      setChatPaneWidth((w) => {
        try {
          localStorage.setItem(ADMIN_AI_STANDALONE_CHAT_W_KEY, String(Math.round(w)))
        } catch {
          /* quota */
        }
        return w
      })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [isSplitResizing])

  useEffect(() => {
    if (!isStandalone || !browserPaneOpen) return
    function clampChatWidth() {
      const total = panelRef.current?.clientWidth || window.innerWidth
      const maxChat = Math.max(STANDALONE_CHAT_MIN_W, total - STANDALONE_BROWSER_MIN_W)
      setChatPaneWidth((w) => Math.min(maxChat, Math.max(STANDALONE_CHAT_MIN_W, w)))
    }
    clampChatWidth()
    window.addEventListener('resize', clampChatWidth)
    return () => window.removeEventListener('resize', clampChatWidth)
  }, [isStandalone, browserPaneOpen])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(ADMIN_AI_BROWSER_WORKSPACE_KEY, dockBrowserWorkspace ? '1' : '0')
    } catch {
      /* quota */
    }
  }, [dockBrowserWorkspace])

  useEffect(() => {
    if (isStandalone || !dockBrowserWorkspace || (dockMode !== 'dock-left' && dockMode !== 'dock-right')) return
    function clampChatWidth() {
      const total = panelRef.current?.clientWidth || 0
      if (total < 480) return
      const maxChat = Math.max(STANDALONE_CHAT_MIN_W, total - 640)
      setDockBesideChatW((w) => Math.min(maxChat, Math.max(STANDALONE_CHAT_MIN_W, w)))
    }
    clampChatWidth()
    window.addEventListener('resize', clampChatWidth)
    return () => window.removeEventListener('resize', clampChatWidth)
  }, [isStandalone, dockBrowserWorkspace, dockMode])

  useEffect(() => {
    return () => {
      try {
        mediaRecorderRef.current?.stop()
      } catch {
        /* ignore */
      }
      dictationStreamRef.current?.getTracks().forEach((track) => track.stop())
      dictationStreamRef.current = null
      mediaRecorderRef.current = null
    }
  }, [])

  const attachmentsBusy = useMemo(() => attachments.some((a) => a.status === 'reading'), [attachments])
  const canSend =
    enabled &&
    !sending &&
    !attachmentsBusy &&
    (composerPlainText(input).length > 0 ||
      chipsIn(input).some((chip) => {
        if (chip.kind === 'element' || chip.kind === 'link') return true
        const file = attachments.find((row) => row.id === chip.id)
        return file?.status === 'ready' && Boolean(file.excerpt?.trim())
      }))

  const composerChipViews = useMemo<ComposerChipView[]>(() => {
    return chipsIn(input).map((chip) => {
      if (chip.kind === 'element') {
        const pick = picks.find((row) => row.id === chip.id)
        return {
          kind: chip.kind,
          id: chip.id,
          label: pick?.label ?? 'element',
          title: pick?.text ?? '',
          tone: 'element' as const,
        }
      }
      if (chip.kind === 'file') {
        const file = attachments.find((row) => row.id === chip.id)
        const tone =
          file?.status === 'error' ? ('file-error' as const) : file?.status === 'reading' ? ('file-reading' as const) : ('file' as const)
        return {
          kind: chip.kind,
          id: chip.id,
          label: file?.label ?? 'file',
          title: file?.error || file?.excerpt?.slice(0, 280) || '',
          tone,
        }
      }
      const link = linkChips.find((row) => row.id === chip.id)
      return {
        kind: chip.kind,
        id: chip.id,
        label: link?.label ?? 'link',
        title: link?.url ?? '',
        tone: 'link' as const,
      }
    })
  }, [input, picks, attachments, linkChips])

  const composerGuide = useMemo(() => {
    const steps = heldApprovalSteps()
    const missing = steps.flatMap((step) => getMissingRequiredFields(step.tool, step.payload))
    const submit = missing.length ? undefined : buildApprovalRows(steps).find((row) => row.phase === 'submit')
    const studio = pageCtx?.pageContext?.studio
    const guide = {
      messages,
      heldWrite: submit?.label ?? null,
      goal: threadMemory?.goal ?? null,
      releaseTitle: threadMemory?.releaseTitle || studioReleaseTitle || null,
      studio: studio
        ? {
            title: studio.title,
            nextAction: studio.nextAction,
            blockers: studio.blockers,
            hasArtwork: studio.hasArtwork,
            hasGenre: studio.hasGenre,
            trackCount: studio.trackCount,
            releaseDate: studio.releaseDate,
            readinessScore: studio.readinessScore,
          }
        : null,
      focus: pageFocus
        ? {
            fieldLabel: pageFocus.fieldLabel,
            fieldKey: pageFocus.fieldKey,
            fieldType: pageFocus.fieldType,
            value: pageFocus.value,
            section: pageFocus.section,
            entityLabel: pageFocus.entityLabel,
            hint: pageFocus.hint,
          }
        : null,
    }
    return {
      suggestion: composerGhostSuggestion(guide),
      followUps: recommendReplyFollowUps(guide),
    }
  }, [messages, pendingPlanSteps, pendingAction, skills, threadMemory, pageFocus, pageCtx?.pageContext?.studio, studioReleaseTitle])
  const composerSuggestion = composerGuide.suggestion
  const replyFollowUps = composerGuide.followUps

  useEffect(() => {
    if (!sessionsHydrated.current) return
    const last = [...messages].reverse().find((message) => message.role === 'assistant' && message.content.trim())
    if (!last) return
    const plan = planArmedPrompt(last.content)
    if (!plan) return
    const existing = armedPrompts ?? []
    if (existing.some((row) => row.prompt === plan.prompt && row.runAt === plan.runAt)) return
    mergeIntoActive({
      armedPrompts: [
        ...existing,
        {
          id: createMessageId(),
          prompt: plan.prompt,
          runAt: plan.runAt,
          whenLabel: plan.whenLabel,
          status: 'armed' as const,
        },
      ].slice(-MAX_STORED_ARMED_PROMPTS),
    })
  }, [messages, armedPrompts, mergeIntoActive])

  useEffect(() => {
    if (!sessionsHydrated.current) return
    const tick = () => {
      const due = (armedPrompts ?? []).find((row) => row.status === 'armed' && row.runAt <= Date.now())
      if (!due || firingArmedIdRef.current) return
      firingArmedIdRef.current = due.id
      mergeIntoActive((session) => ({
        armedPrompts: (session.armedPrompts ?? []).map((row) =>
          row.id === due.id ? { ...row, status: 'fired' as const } : row,
        ),
      }))
      sendArmedPromptRef.current(due.prompt)
      window.setTimeout(() => {
        if (firingArmedIdRef.current === due.id) firingArmedIdRef.current = null
      }, 5000)
    }
    tick()
    const timer = window.setInterval(tick, 30_000)
    return () => window.clearInterval(timer)
  }, [armedPrompts, activeSessionId, mergeIntoActive])

  const lastRunId = useMemo(() => {
    const fromPending = pendingAction?.runId
    if (typeof fromPending === 'string' && fromPending.trim()) return fromPending.trim()
    const runWithId = [...messages]
      .reverse()
      .find((msg) => msg.role === 'system' && msg.content.includes('runId='))
    if (!runWithId) return null
    const match = runWithId.content.match(/runId=([a-f0-9-]+)/i)
    return match?.[1] ?? null
  }, [messages, pendingAction])

  async function transcribeWithServer(file: File): Promise<string> {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('filename', file.name)
    const res = await adminAiFetch('/api/admin/ai/transcribe', { method: 'POST', body: fd })
    const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string }
    if (!res.ok) throw new Error(data.error || 'Transcription failed')
    if (!data.text?.trim()) throw new Error('Empty transcript')
    return data.text.trim()
  }

  function composerValueNow() {
    return composerRef.current?.currentValue() ?? inputLiveRef.current
  }

  function dropOldestChip<T extends { id: string }>(kind: ComposerChipKind, value: string, rows: T[]): { value: string; rows: T[] } {
    if (rows.length < 8) return { value, rows }
    const oldest = rows[0]
    if (!oldest) return { value, rows }
    return { value: removeChipToken(value, kind, oldest.id), rows: rows.slice(1) }
  }

  async function ingestFiles(fileList: File[], atOffset?: number | null) {
    const incoming = Array.from(fileList).slice(0, 8)
    let value = composerValueNow()
    let files = [...attachmentsLiveRef.current]
    let cursor = atOffset ?? composerRef.current?.insertionOffset() ?? value.length
    const jobs: Array<{ id: string; file: File; kind: 'text' | 'audio' }> = []

    for (const file of incoming) {
      const trimmed = dropOldestChip('file', value, files)
      value = trimmed.value
      files = trimmed.rows
      const id = nextId()
      const kind = classifyFile(file)
      const lowerName = file.name.trim().toLowerCase()
      const looksSecret =
        lowerName === '.env' ||
        lowerName.startsWith('.env.') ||
        lowerName.endsWith('.pem') ||
        lowerName.endsWith('.key') ||
        lowerName.includes('id_rsa') ||
        lowerName.includes('credentials') ||
        lowerName.includes('service_account')
      const storedKind: 'text' | 'audio' = kind === 'audio' ? 'audio' : 'text'
      let status: PendingAttachment['status'] = 'reading'
      let error: string | undefined
      if (looksSecret) {
        status = 'error'
        error = 'Secret-bearing files are blocked (.env, keys, credentials).'
      } else if (kind === 'unsupported') {
        status = 'error'
        error = 'Unsupported type. Use text/markdown/json/csv or common audio formats.'
      }
      const placed = insertChipToken(value, cursor, 'file', id)
      value = placed.value
      cursor = placed.caret
      files = [...files, { id, file, kind: storedKind, label: file.name, status, error }]
      if (status === 'reading') jobs.push({ id, file, kind: storedKind })
    }

    if (!incoming.length) return
    inputLiveRef.current = value
    composerRef.current?.expectCaretAt(cursor)
    mergeIntoActive({ input: value, attachments: files })

    for (const job of jobs) {
      try {
        const excerpt =
          job.kind === 'text'
            ? truncateBody(await readTextFile(job.file), MAX_ATTACHMENT_CHARS)
            : truncateBody(await transcribeWithServer(job.file), MAX_ATTACHMENT_CHARS)
        setAttachments((prev) => prev.map((row) => (row.id === job.id ? { ...row, status: 'ready' as const, excerpt } : row)))
      } catch (e) {
        setAttachments((prev) =>
          prev.map((row) => (row.id === job.id ? { ...row, status: 'error' as const, error: getErrorMessage(e) } : row))
        )
      }
    }
  }

  function insertLinks(urls: string[], atOffset?: number | null) {
    if (!urls.length) return
    let value = composerValueNow()
    let rows = [...linksLiveRef.current]
    let cursor = atOffset ?? composerRef.current?.insertionOffset() ?? value.length
    for (const url of urls) {
      const trimmed = dropOldestChip('link', value, rows)
      value = trimmed.value
      rows = trimmed.rows
      const id = nextId()
      const placed = insertChipToken(value, cursor, 'link', id)
      value = placed.value
      cursor = placed.caret
      rows = [...rows, { id, url, label: composerLinkLabel(url) }]
    }
    inputLiveRef.current = value
    composerRef.current?.expectCaretAt(cursor)
    mergeIntoActive({ input: value, links: rows })
  }

  function insertElementPick(pick: { label: string; text: string }) {
    let value = composerValueNow()
    let rows = [...picksLiveRef.current]
    const trimmed = dropOldestChip('element', value, rows)
    value = trimmed.value
    rows = trimmed.rows
    const id = nextId()
    const placed = insertChipToken(value, composerRef.current?.insertionOffset() ?? value.length, 'element', id)
    inputLiveRef.current = placed.value
    composerRef.current?.expectCaretAt(placed.caret)
    mergeIntoActive({
      input: placed.value,
      elementPicks: [...rows, { id, label: pick.label, text: pick.text }],
    })
  }

  function removeComposerChip(kind: ComposerChipKind, id: string) {
    const value = removeChipToken(composerValueNow(), kind, id)
    inputLiveRef.current = value
    mergeIntoActive({ input: value })
  }

  function composeComposerMessage(
    base: string,
    atts: PendingAttachment[],
    pickRows: ElementPickChip[],
    linkRows: ComposerLink[],
  ) {
    return truncateBody(
      expandComposerMessage(base, { elements: pickRows, attachments: atts, links: linkRows }),
      MAX_COMPOSED_MESSAGE_CHARS,
    )
  }

  function mailComposeExcerpt(): string {
    const nodes = [...document.querySelectorAll('textarea[aria-label], input[aria-label]')]
    const lines: string[] = []
    for (const node of nodes) {
      if (!(node instanceof HTMLTextAreaElement || node instanceof HTMLInputElement)) continue
      const label = node.getAttribute('aria-label') || ''
      if (!/^(Press title|Press for .+|Promo title|Promo for .+|Cover title|Link label)$/.test(label)) continue
      const value = node.value.trim()
      if (!value) continue
      lines.push(`${label}:\n${value}`)
    }
    return lines.join('\n\n')
  }

  function attachedComposerContext(): string {
    const value = composerValueNow()
    if (!chipsIn(value).length) return ''
    const picksNow = picksLiveRef.current
    const aboutMail = picksNow.some((pick) => /message|press|promo/i.test(`${pick.label}\n${pick.text}`))
    const live = aboutMail ? mailComposeExcerpt() : ''
    if (live) return live
    return composeComposerMessage(value, attachmentsLiveRef.current, picksNow, linksLiveRef.current)
  }

  function appendSpokenText(transcript: string) {
    const next = appendDictationText(composerValueNow(), transcript)
    inputLiveRef.current = next
    composerRef.current?.expectCaretAt(next.length)
    setInput(next)
  }

  function stopDictationTracks() {
    dictationStreamRef.current?.getTracks().forEach((track) => track.stop())
    dictationStreamRef.current = null
  }

  async function toggleDictation() {
    setSpeechError(null)
    if (dictationPhase === 'transcribing') return
    if (dictationPhase === 'recording') {
      const rec = mediaRecorderRef.current
      if (rec && rec.state !== 'inactive') rec.stop()
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setSpeechError('This browser cannot record the microphone.')
      return
    }

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setSpeechError('Allow the microphone to use talk to text.')
      return
    }

    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : ''
    const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
    const chunks: Blob[] = []
    rec.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    rec.onstop = () => {
      stopDictationTracks()
      mediaRecorderRef.current = null
      const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' })
      if (blob.size < 800) {
        setDictationPhase('idle')
        setSpeechError('No speech captured. Talk, then tap the mic again.')
        return
      }
      const ext = (rec.mimeType || '').includes('mp4') ? 'm4a' : 'webm'
      const file = new File([blob], `dictation.${ext}`, { type: blob.type || 'audio/webm' })
      setDictationPhase('transcribing')
      void transcribeWithServer(file)
        .then((text) => {
          appendSpokenText(text)
          setSpeechError(null)
        })
        .catch((error: unknown) => {
          setSpeechError(getErrorMessage(error))
        })
        .finally(() => setDictationPhase('idle'))
    }
    dictationStreamRef.current = stream
    mediaRecorderRef.current = rec
    try {
      rec.start()
      setDictationPhase('recording')
    } catch (error: unknown) {
      stopDictationTracks()
      mediaRecorderRef.current = null
      setDictationPhase('idle')
      setSpeechError(getErrorMessage(error))
    }
  }

  async function sendChatMessage(
    content: string,
    skillId?: string,
    options?: {
      onToolStep?: (step: AdminAiAgentToolStep) => void
      onReplyDelta?: (text: string, round: number) => void
    },
  ) {
    const agentEnabled = agentMode !== 'chat'
    const payload: {
      message: string
      provider?: string
      skillId?: string
      stickySkillId?: string
      stickySkillInferredAt?: number
      honestyMode?: AdminChatHonestyMode
      energyPreset?: AdminChatEnergyPreset
      pageContext?: AdminAiPageContext
      agent?: boolean
      stream?: boolean
      threadMemory?: AdminAiThreadMemory
      chatSessionId?: string
      history?: Array<{ role: 'user' | 'assistant'; content: string }>
    } = {
      message: content,
      honestyMode,
      energyPreset,
      agent: agentEnabled,
      stream: true,
      threadMemory: threadMemoryWithAnchors(threadMemory ?? emptyThreadMemory(), anchors),
      chatSessionId: activeSessionId,
      history: clipChatHistory(messages),
    }
    if (chatProvider !== 'auto') {
      payload.provider = chatProvider
    }
    if (skillId) {
      payload.skillId = skillId
    } else if (activeSkill?.id && typeof activeSkillInferredAt === 'number') {
      const age = Date.now() - activeSkillInferredAt
      if (age >= 0 && age < STICKY_SKILL_CLIENT_TTL_MS) {
        payload.stickySkillId = activeSkill.id
        payload.stickySkillInferredAt = activeSkillInferredAt
      }
    }
    if (pageCtx?.pageContext) {
      const formFields = collectSignedInFormFields()
      payload.pageContext = formFields.length
        ? { ...pageCtx.pageContext, formFields }
        : pageCtx.pageContext
    }
    const postChat = () =>
      adminAiFetch('/api/admin/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

    let sessionStillAdmin = false
    let response = await postChat()
    if (response.status === 401) {
      const sessionRes = await adminAiFetch('/api/auth/session').catch(() => null)
      const session = sessionRes?.ok ? await sessionRes.json().catch(() => null) : null
      sessionStillAdmin = Boolean(session?.authenticated && session?.isAdmin)
      if (sessionStillAdmin) {
        response = await postChat()
      }
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to contact AI chat API.' }))
      if (response.status === 401) {
        throw new Error(
          sessionStillAdmin
            ? 'Chat could not confirm the admin session. Send this message once more.'
            : 'Your admin session expired. Sign in again, then send this message once more.'
        )
      }
      throw new Error(errorData.error || 'Failed to contact AI chat API.')
    }

    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('ndjson') && response.body) {
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let finalPayload: ChatResponse | null = null
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const row = JSON.parse(line) as {
              type?: string
              event?: { type?: string; step?: AdminAiAgentToolStep; text?: string; round?: number }
              error?: string
            } & ChatResponse
            if (row.type === 'event' && row.event?.type === 'reply_delta' && row.event.text) {
              options?.onReplyDelta?.(row.event.text, row.event.round ?? 0)
            } else if (row.type === 'event' && row.event?.step) {
              options?.onToolStep?.(row.event.step)
            } else if (row.type === 'done') {
              finalPayload = row
            } else if (row.type === 'error') {
              throw new Error(row.error || 'Chat stream failed')
            }
          } catch (err) {
            if (err instanceof SyntaxError) continue
            throw err
          }
        }
      }
      if (!finalPayload) throw new Error('Chat stream ended without a result')
      return finalPayload
    }

    return (await response.json()) as ChatResponse
  }

  async function runExecute(
    params:
      | { approve: true; runId: string }
      | {
          tool?: ExecuteTool
          payload?: Record<string, unknown>
          approve?: boolean
          runId?: string
          planSteps?: PlanStep[]
        }
  ) {
    const useApproveShortcut =
      params.approve === true &&
      'runId' in params &&
      Boolean(params.runId) &&
      !('tool' in params) &&
      !('planSteps' in params) &&
      !('payload' in params)

    const requestBody = useApproveShortcut
      ? {
          approve: true,
          runId: (params as { approve: true; runId: string }).runId,
          chatSessionId: activeSessionId,
        }
      : {
          tool: 'tool' in params ? params.tool : undefined,
          payload: 'payload' in params ? params.payload : undefined,
          approve: Boolean('approve' in params && params.approve),
          runId: 'runId' in params ? params.runId : undefined,
          planSteps: 'planSteps' in params ? params.planSteps : undefined,
          chatSessionId: activeSessionId,
        }
    const response = await adminAiFetch('/api/admin/ai/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    })

    const responseBody = (await response.json().catch(() => ({}))) as AssistantActionResponse & {
      error?: string
      details?: string[]
    }
    if (!response.ok) {
      const detailText =
        Array.isArray(responseBody.details) && responseBody.details.length
          ? ` (${responseBody.details.join('; ')})`
          : ''
      throw new Error(`${responseBody.error || 'Execution failed'}${detailText}`)
    }
    return responseBody
  }

  async function fetchIntentPlan(message: string, skillId?: string) {
    const response = await adminAiFetch('/api/admin/ai/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, ...(skillId ? { skillId } : {}) }),
    })
    const data = (await response.json().catch(() => ({}))) as PlanResponse
    if (!response.ok || !data.graph) {
      throw new Error(data.error || 'Failed to build intent plan')
    }
    return data
  }

  function formatRunbookMessage(data: PlanResponse): string {
    const graph = data.graph
    if (!graph) return 'No runbook graph returned.'
    const skill = data.plan?.skill
    const lines: string[] = []
    if (skill) {
      lines.push(`Skill: ${skill.name} (${skill.id}) — ${skill.description}`)
    }
    lines.push(`Runbook (${graph.mode}): ${graph.summary}`)
    lines.push(`Steps (${graph.steps.length}):`)
    graph.steps.forEach((step, index) => {
      const payloadJson = JSON.stringify(step.payload)
      lines.push(`  ${index + 1}. ${step.tool} [${step.riskTier}] ${payloadJson}`)
    })
    lines.push('Use the buttons below to copy a step into the composer, or preview the full runbook.')
    return lines.join('\n')
  }

  async function previewFullRunbookFromGraph(steps: PlanStep[]) {
    if (!steps.length) return
    const mergedSteps = withStrategyPackPolish(steps, preferStrategyPackRefine)
    const missingByStep = mergedSteps.map((step) => ({
      tool: step.tool,
      missing: getMissingRequiredFields(step.tool, step.payload),
    }))
    const blocking = missingByStep.filter((row) => row.missing.length > 0)
    if (blocking.length > 0) {
      const detail = blocking.map((b) => `${b.tool}: ${b.missing.join(', ')}`).join('; ')
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: 'assistant',
          content: `Cannot preview full runbook — missing required fields: ${detail}. Use “Insert step” to fix payloads, then try again.`,
        },
      ])
      return
    }

    setPreflightSuggestion(null)
    setPendingPlanSteps(mergedSteps)
    const first = mergedSteps[0]
    try {
      const result = await runExecute({
        tool: first.tool,
        payload: first.payload,
        approve: false,
        planSteps: mergedSteps,
      })
      setPendingAction(result)
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: 'assistant',
          content:
            result.message ||
              'Runbook preview is ready. Each action is its own row. A submit row is the only control that sends that step.',
        },
        ...strategyPackEmbedChatMessagesFromResult(result),
      ])
    } catch (error: unknown) {
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: 'assistant', content: `Runbook preview failed: ${getErrorMessage(error)}` },
      ])
    }
  }

  function appendStrategyPolishToThread(markdown: string) {
    setMessages((prev) => [
      ...prev,
      {
        id: nextId(),
        role: 'assistant',
        content: `### Strategy polish\n\n${markdown}`,
      },
    ])
  }

  async function regeneratePendingPreview(mode: 'polish' | 'deterministic') {
    if (!pendingPlanSteps.length) return
    const polish = mode === 'polish'
    setPreferStrategyPackRefine(polish)
    setSending(true)
    try {
      const merged = withStrategyPackPolish(pendingPlanSteps, polish)
      const first = merged[0]
      const result = await runExecute({
        tool: first.tool,
        payload: first.payload,
        approve: false,
        planSteps: merged,
      })
      setPendingPlanSteps(merged)
      setPendingAction(result)
      const polishLive = readStrategyPackPolish(strategyPackPreviewRows(result)[0]?.preview)
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: 'assistant',
          content: !polish
            ? 'Preview regenerated. Scaffold only.'
            : polishLive?.state === 'failed'
              ? `Preview regenerated. Scaffold kept. ${polishLive.note}`
              : polishLive?.state === 'applied'
                ? `Preview regenerated. ${polishLive.note}`
                : 'Preview regenerated.',
        },
        ...strategyPackEmbedChatMessagesFromResult(result),
      ])
    } catch (error: unknown) {
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: 'assistant', content: `Regenerate failed: ${getErrorMessage(error)}` },
      ])
    } finally {
      setSending(false)
    }
  }

  async function planExecution(tool: ExecuteTool, payload: Record<string, unknown>) {
    const response = await adminAiFetch('/api/admin/ai/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool, payload }),
    })
    const body = (await response.json().catch(() => ({}))) as PlanResponse
    if (!response.ok || !body.plan || !body.graph) {
      throw new Error(body.error || 'Failed to build execution plan')
    }
    return {
      plan: body.plan,
      graph: body.graph,
    }
  }

  function knownGoalContext(): KnownGoalContext {
    return {
      goal: threadMemory?.goal,
      releaseTitle: threadMemory?.releaseTitle || studioReleaseTitle,
      activeStep: studioActiveStep,
    }
  }

  function getSkillByTool(tool: ExecuteTool) {
    return resolveSkillForTool(skills, tool)
  }

  function getMissingRequiredFields(tool: ExecuteTool, payload: Record<string, unknown>) {
    return missingRequiredSkillFields(
      getSkillByTool(tool),
      applyKnownPrimaryGoal(tool, payload, knownGoalContext()),
      tool
    )
  }

  /** Plan + dry-run execute preview (shared by `/exec` submit and Studio quick actions). */
  async function runExecDryRun(
    tool: ExecuteTool,
    basePayload: Record<string, unknown>,
  ): Promise<AssistantActionResponse | undefined> {
    let execPayload = applyKnownPrimaryGoal(tool, basePayload, knownGoalContext())
    if (tool === 'draft_product_strategy_pack') {
      execPayload = withStrategyPackPolish([{ tool, payload: execPayload }], preferStrategyPackRefine)[0]!.payload
    }
    const { plan, graph } = await planExecution(tool, execPayload)
    if (plan.skill) {
      setActiveSkill({
        id: plan.skill.id,
        name: plan.skill.name,
        description: plan.skill.description,
      })
    }

    const missingFields = plan.missingRequiredFields ?? []
    if (missingFields.length > 0) {
      setPendingAction(null)
      setPendingPlanSteps([])
      setPreflightSuggestion({
        tool,
        missingRequiredFields: missingFields,
        suggestedPayload: plan.suggestedPayload ?? execPayload,
      })
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: 'assistant',
          content: `Preflight blocked execution for ${tool}. Missing required fields: ${missingFields.join(', ')}.`,
        },
      ])
      return
    }

    setPreflightSuggestion(null)
    const graphSteps = withStrategyPackPolish(graph.steps || [], preferStrategyPackRefine)
    setPendingPlanSteps(graphSteps)
    setLastRunbookGraph(graph)
    const result = await runExecute({
      tool,
      payload: execPayload,
      approve: false,
      planSteps: graphSteps,
    })
    setPendingAction(result)
    setMessages((prev) => [
      ...prev,
      {
        id: nextId(),
        role: 'assistant',
        content: result.message || 'Execution preview is ready. Review and approve to continue.',
      },
      ...strategyPackEmbedChatMessagesFromResult(result),
    ])
    if (studioMissionReleaseId) setMissionRefreshNonce((n) => n + 1)
    return result
  }

  async function triggerStudioPipelineSnapshot(e: ReactMouseEvent<HTMLButtonElement>) {
    if (!enabled || sending) return
    if (e.shiftKey) {
      setInput('/exec query_ops_snapshot {"focus":"studio"}')
      return
    }
    setSending(true)
    try {
      mergeIntoActive({ anchorSuggestions: [] })
      setMessages((prev) => [...prev, { id: nextId(), role: 'user', content: 'Studio pipeline' }])
      await runExecDryRun('query_ops_snapshot', { focus: 'studio' })
    } catch (error: unknown) {
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: 'assistant', content: `Error: ${getErrorMessage(error)}` },
      ])
    } finally {
      setSending(false)
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await sendComposerTurn(input, true)
  }

  async function sendComposerTurn(rawText: string, fromComposer: boolean) {
    if (sendLockRef.current || !enabled || sending) return
    if (fromComposer && !canSend) return

    const turnSessionId = activeSessionId
    const userText = rawText.trim()
    if (!userText) return
    const attachmentSnapshot = fromComposer ? [...attachments] : []
    const pickSnapshot = fromComposer ? [...picks] : []
    const linkSnapshot = fromComposer ? [...linkChips] : []
    const plain = composerPlainText(userText)
    const userLabel = composerDisplayText(userText, [
      ...pickSnapshot.map((pick) => ({ kind: 'element' as const, id: pick.id, label: pick.label })),
      ...attachmentSnapshot.map((file) => ({ kind: 'file' as const, id: file.id, label: file.label })),
      ...linkSnapshot.map((link) => ({ kind: 'link' as const, id: link.id, label: link.label })),
    ])

    sendLockRef.current = true
    if (fromComposer) {
      setInput('')
      setAttachments([])
      setElementPicks([])
      setLinks([])
    }
    setMessages((prev) => [...prev, { id: nextId(), role: 'user', content: userLabel }])
    setSending(true)

    try {
      mergeIntoActive({ anchorSuggestions: [] })
      const prevSkillForHandoff = { id: activeSkill?.id ?? null, name: activeSkill?.name ?? null }
      const isPureChat = agentMode === 'chat'
      const agentSkillId = isAgentSkillMode(agentMode) ? agentMode : null

      if (!isPureChat) {
        const hasPlanBody = plain.length > 0 || chipsIn(userText).length > 0
        const forcedPlanMessage =
          agentMode === 'plan' && hasPlanBody && !plain.toLowerCase().startsWith('/plan ') ? userText : null
        const planMessage = forcedPlanMessage ?? stripPlanPrefix(userText)
        if (planMessage && (composerPlainText(planMessage).length > 0 || chipsIn(planMessage).length > 0)) {
          const messageForPlan = composeComposerMessage(planMessage, attachmentSnapshot, pickSnapshot, linkSnapshot)
          const data = await fetchIntentPlan(
            messageForPlan,
            agentSkillId ?? undefined
          )
          setLastRunbookGraph(data.graph ?? null)
          if (data.plan?.skill) {
            setActiveSkill({
              id: data.plan.skill.id,
              name: data.plan.skill.name,
              description: data.plan.skill.description,
            })
          }
          setMessages((prev) => [
            ...prev,
            {
              id: nextId(),
              role: 'assistant',
              content: formatRunbookMessage(data),
            },
          ])
          return
        }

        const execLine = plain.split(/\r?\n/, 1)[0]?.trim() ?? ''
        const exec = parseExecuteCommand(execLine)
        if (exec) {
          if (attachmentSnapshot.some((a) => a.status === 'ready')) {
            setMessages((prev) => [
              ...prev,
              {
                id: nextId(),
                role: 'assistant',
                content:
                  'Attachments are not merged into `/exec` payloads. Use a free-form message to include file text, or paste values into the JSON line.',
              },
            ])
            return
          }
          await runExecDryRun(exec.tool, exec.payload)
          return
        }
      }

      const chatBody = composeComposerMessage(userText, attachmentSnapshot, pickSnapshot, linkSnapshot)
      const chatSkillId =
        isPureChat || agentMode === 'auto' || agentMode === 'plan'
          ? undefined
          : isAgentSkillMode(agentMode)
            ? agentMode
            : undefined
      mergeIntoActive({ anchorSuggestions: [] })
      const liveSteps: AdminAiAgentToolStep[] = []
      const streamingId = nextId()
      const placeholder = agentMode === 'chat' ? '…' : 'Working…'
      replyStreamRef.current = { round: -1, raw: '' }
      setStreamingMessageId(streamingId)
      setBrowserLiveNote('In progress: Assistant is working on this chat.')
      setMessages((prev) => [
        ...prev,
        {
          id: streamingId,
          role: 'assistant',
          content: placeholder,
          toolSteps: [],
        },
      ])
      const result = await sendChatMessage(chatBody, chatSkillId, {
        onReplyDelta: (text, round) => {
          const stream = replyStreamRef.current
          if (stream.round !== round) {
            stream.round = round
            stream.raw = ''
          }
          stream.raw += text
          const visible = visibleStreamingReply(stream.raw)
          setMessages((prev) =>
            prev.map((m) =>
              m.id === streamingId ? { ...m, content: visible.trim() ? visible : placeholder } : m,
            ),
          )
        },
        onToolStep: (step) => {
          followWorkspaceOnOpenPage(step)
          const idx = liveSteps.findIndex((s) => s.id === step.id)
          if (idx >= 0) liveSteps[idx] = step
          else liveSteps.push(step)
          const line = step.summary.replace(/\s+/g, ' ').trim().slice(0, 160)
          if (line) {
            setBrowserLiveNote(step.status === 'error' ? `Unfinished: ${line}` : `In progress: ${line}`)
          }
          const visible = visibleStreamingReply(replyStreamRef.current.raw)
          setMessages((prev) =>
            prev.map((m) =>
              m.id === streamingId
                ? { ...m, content: visible.trim() ? visible : placeholder, toolSteps: [...liveSteps] }
                : m,
            ),
          )
        },
      })
      setActiveSkill(result.inferredSkill ?? null)
      mergeIntoActive({
        lastRoutingEcho: result.routing ?? null,
        lastRunFingerprint: result.runFingerprint ?? null,
        threadMemory: result.memory
          ? normalizeThreadMemory(result.memory)
          : mergeThreadMemory(threadMemory ?? emptyThreadMemory(), result.memoryPatch as never),
        skillShiftNotice:
          prevSkillForHandoff.id &&
          result.inferredSkill?.id &&
          prevSkillForHandoff.id !== result.inferredSkill.id &&
          !chatSkillId &&
          !isContinuationOnlyUserMessage(plain)
            ? {
                fromId: prevSkillForHandoff.id,
                fromName: prevSkillForHandoff.name ?? prevSkillForHandoff.id,
                toId: result.inferredSkill.id,
                toName: result.inferredSkill.name,
              }
            : null,
      })
      setMessages((prev) =>
        prev.map((m) =>
          m.id === streamingId
            ? {
                ...m,
                content: result.reply,
                toolSteps: result.toolSteps?.length ? result.toolSteps : liveSteps,
                applyDiffs: result.applyDiffs ?? [],
              }
            : m,
        ),
      )
      setSessions((prev) => {
        const i = prev.findIndex((s) => s.id === turnSessionId)
        if (i < 0) return prev
        const s = prev[i]!
        if (s.title !== 'New chat') return prev
        const firstLine = (userLabel.split('\n')[0] ?? userLabel).trim()
        if (!firstLine) return prev
        const short = firstLine.length > 40 ? `${firstLine.slice(0, 38)}…` : firstLine
        const copy = [...prev]
        copy[i] = { ...s, title: short, updatedAt: Date.now() }
        return copy
      })
      settleBrowserHold(turnSessionId, result.browserHold ?? null)
    } catch (error: unknown) {
      settleBrowserHold(
        turnSessionId,
        `Unfinished: ${getErrorMessage(error).replace(/\s+/g, ' ').trim().slice(0, 160)}. Turn off You drive to hand this page back.`,
      )
      setMessages((prev) => {
        const errText = `Error: ${getErrorMessage(error)}`
        const assistantAt = [...prev].reverse().findIndex((m) => m.role === 'assistant')
        const userAt = [...prev].reverse().findIndex((m) => m.role === 'user')
        if (assistantAt >= 0 && (userAt < 0 || assistantAt < userAt)) {
          const idx = prev.length - 1 - assistantAt
          const current = prev[idx]!
          const partial = current.content === 'Working…' || current.content === '…' ? '' : current.content
          return prev.map((m, i) =>
            i === idx
              ? { ...m, content: partial ? `${partial}\n\n${errText}` : errText, toolSteps: m.toolSteps }
              : m,
          )
        }
        return [...prev, { id: nextId(), role: 'assistant', content: errText }]
      })
    } finally {
      sendLockRef.current = false
      setStreamingMessageId(null)
      setBrowserLiveNote(null)
      setSending(false)
    }
  }

  sendComposerTurnRef.current = sendComposerTurn

  function settleBrowserHold(sessionId: string, hold: string | null) {
    setBrowserHolds((prev) => {
      const next = { ...prev }
      if (hold) next[sessionId] = hold
      else delete next[sessionId]
      return next
    })
  }

  function applyStudioNav(nav: AdminAiStudioNavTarget) {
    dispatchAdminAiStudioNavigate(nav)
    const onRelease = pageCtx?.pageContext?.studio?.releaseId === nav.releaseId
    if (!onRelease && typeof window !== 'undefined') {
      window.location.assign(studioNavigateHref(nav))
    }
  }

  function followWorkspaceOnOpenPage(step: AdminAiAgentToolStep) {
    if (step.status !== 'done' || step.tool !== 'admin_browser') return
    const action = String(step.payload.action || '')
    if (action !== 'open' && action !== 'navigate') return
    const workspace = firstPartyWorkspaceFromUrl(typeof step.payload.url === 'string' ? step.payload.url : '')
    if (!workspace?.releaseId) return
    applyStudioNav({
      releaseId: workspace.releaseId,
      ...(workspace.step ? { step: workspace.step } : {}),
    })
  }

  async function handlePlaybookRun(playbook: AdminAiPlaybook) {
    if (!enabled || sending) return
    const releaseId = pageCtx?.pageContext?.studio?.releaseId
    if (playbook.requiresRelease && !releaseId) {
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: 'assistant',
          content: 'Open a release in Release Studio first — this playbook needs an active release id.',
        },
      ])
      return
    }
    if (playbook.openStep && releaseId) {
      applyStudioNav({ releaseId, step: playbook.openStep })
    }
    const playbookRow = playbookSuggestionPool.find(
      (row) => parsePlaybookIdFromQuickStart(row) === playbook.id,
    )
    if (playbookRow && activeSession.playbookQuickStart) {
      mergeIntoActive({
        playbookQuickStart: markPlaybookQuickStartAttended(activeSession.playbookQuickStart, playbookRow),
      })
    }
    if (isAgentSkillMode(playbook.skillId as AgentModeChoice)) {
      setAgentMode(playbook.skillId as AgentModeChoice)
    }
    setMessages((prev) => [
      ...prev,
      {
        id: nextId(),
        role: 'user',
        content: `Playbook: ${playbook.label} (${playbook.steps.length} dry-run steps)`,
      },
    ])
    setSending(true)
    try {
      mergeIntoActive({ anchorSuggestions: [] })
      for (const step of playbook.steps) {
        if (step.kind !== 'exec') continue
        const payload = { ...step.payload }
        if (releaseId && payload.releaseId == null) {
          payload.releaseId = releaseId
        }
        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            role: 'system',
            content: `Playbook step — ${step.label}`,
          },
        ])
        await runExecDryRun(step.tool as ExecuteTool, payload)
      }
    } catch (error: unknown) {
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: 'assistant', content: `Playbook error: ${getErrorMessage(error)}` },
      ])
    } finally {
      setSending(false)
    }
  }

  async function handleQuickStartPick(start: AdminAiQuickStart) {
    if (!enabled || sending) return
    if (start.nav) {
      applyStudioNav(start.nav)
    }
    if (start.kind === 'priority' && activeSession.priorityQuickStart) {
      mergeIntoActive({
        priorityQuickStart: markPriorityQuickStartAttended(activeSession.priorityQuickStart, start),
      })
    }
    if (start.kind === 'creative' && activeSession.creativeQuickStart) {
      mergeIntoActive({
        creativeQuickStart: markCreativeQuickStartAttended(activeSession.creativeQuickStart, start),
      })
    }
    if (start.skillId && isAgentSkillMode(start.skillId as AgentModeChoice)) {
      setAgentMode(start.skillId as AgentModeChoice)
    }

    const userText = start.message.trim()
    const turnSessionId = activeSessionId
    setMessages((prev) => [...prev, { id: nextId(), role: 'user', content: userText }])
    setSending(true)

    try {
      mergeIntoActive({ anchorSuggestions: [] })
      const prevSkillForHandoff = { id: activeSkill?.id ?? null, name: activeSkill?.name ?? null }
      const agentSkillId =
        start.skillId && isAgentSkillMode(start.skillId as AgentModeChoice)
          ? start.skillId
          : isAgentSkillMode(agentMode)
            ? agentMode
            : null

      const planMessage = parsePlanCommand(userText)
      if (planMessage) {
        const data = await fetchIntentPlan(planMessage, agentSkillId ?? undefined)
        setLastRunbookGraph(data.graph ?? null)
        if (data.plan?.skill) {
          setActiveSkill({
            id: data.plan.skill.id,
            name: data.plan.skill.name,
            description: data.plan.skill.description,
          })
        }
        setMessages((prev) => [
          ...prev,
          { id: nextId(), role: 'assistant', content: formatRunbookMessage(data) },
        ])
        return
      }

      const execLine = userText.split(/\r?\n/, 1)[0]?.trim() ?? ''
      const exec = parseExecuteCommand(execLine)
      if (exec) {
        await runExecDryRun(exec.tool, exec.payload)
        return
      }

      const chatSkillId = agentSkillId ?? undefined
      mergeIntoActive({ anchorSuggestions: [] })
      const streamingId = nextId()
      const placeholder = 'Working…'
      replyStreamRef.current = { round: -1, raw: '' }
      setStreamingMessageId(streamingId)
      setBrowserLiveNote('In progress: Assistant is working on this chat.')
      setMessages((prev) => [
        ...prev,
        { id: streamingId, role: 'assistant', content: placeholder, toolSteps: [] },
      ])
      const result = await sendChatMessage(userText, chatSkillId, {
        onReplyDelta: (text, round) => {
          const stream = replyStreamRef.current
          if (stream.round !== round) {
            stream.round = round
            stream.raw = ''
          }
          stream.raw += text
          const visible = visibleStreamingReply(stream.raw)
          setMessages((prev) =>
            prev.map((m) =>
              m.id === streamingId ? { ...m, content: visible.trim() ? visible : placeholder } : m,
            ),
          )
        },
        onToolStep: (step) => {
          followWorkspaceOnOpenPage(step)
          const line = step.summary.replace(/\s+/g, ' ').trim().slice(0, 160)
          if (line) {
            setBrowserLiveNote(step.status === 'error' ? `Unfinished: ${line}` : `In progress: ${line}`)
          }
        },
      })
      setActiveSkill(result.inferredSkill ?? null)
      mergeIntoActive({
        lastRoutingEcho: result.routing ?? null,
        lastRunFingerprint: result.runFingerprint ?? null,
        skillShiftNotice:
          prevSkillForHandoff.id &&
          result.inferredSkill?.id &&
          prevSkillForHandoff.id !== result.inferredSkill.id &&
          !chatSkillId &&
          !isContinuationOnlyUserMessage(userText)
            ? {
                fromId: prevSkillForHandoff.id,
                fromName: prevSkillForHandoff.name ?? prevSkillForHandoff.id,
                toId: result.inferredSkill.id,
                toName: result.inferredSkill.name,
              }
            : null,
      })
      setMessages((prev) =>
        prev.map((m) => (m.id === streamingId ? { ...m, content: result.reply } : m)),
      )
      settleBrowserHold(turnSessionId, result.browserHold ?? null)
      setSessions((prev) => {
        const i = prev.findIndex((s) => s.id === turnSessionId)
        if (i < 0) return prev
        const s = prev[i]!
        if (s.title !== 'New chat') return prev
        const short =
          start.label.length > 40 ? `${start.label.slice(0, 38)}…` : start.label
        const copy = [...prev]
        copy[i] = { ...s, title: short, updatedAt: Date.now() }
        return copy
      })
    } catch (error: unknown) {
      settleBrowserHold(
        turnSessionId,
        `Unfinished: ${getErrorMessage(error).replace(/\s+/g, ' ').trim().slice(0, 160)}. Turn off You drive to hand this page back.`,
      )
      setMessages((prev) => {
        const errText = `Error: ${getErrorMessage(error)}`
        const assistantAt = [...prev].reverse().findIndex((m) => m.role === 'assistant')
        const userAt = [...prev].reverse().findIndex((m) => m.role === 'user')
        if (assistantAt >= 0 && (userAt < 0 || assistantAt < userAt)) {
          const idx = prev.length - 1 - assistantAt
          const current = prev[idx]!
          const partial = current.content === 'Working…' || current.content === '…' ? '' : current.content
          return prev.map((m, i) =>
            i === idx ? { ...m, content: partial ? `${partial}\n\n${errText}` : errText } : m,
          )
        }
        return [...prev, { id: nextId(), role: 'assistant', content: errText }]
      })
    } finally {
      setStreamingMessageId(null)
      setBrowserLiveNote(null)
      setSending(false)
    }
  }

  function IconAttach() {
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M7.5 10.5l4.95-4.95a2.5 2.5 0 113.54 3.54L9.63 15.45a4 4 0 11-5.66-5.66l6.01-6.01" />
      </svg>
    )
  }

  function IconMic() {
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="7" y="3" width="6" height="10" rx="3" />
        <path d="M5 10a5 5 0 0010 0M10 15v3M7 18h6" />
      </svg>
    )
  }

  function IconSend() {
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M3 10L17 3l-3.5 14-4.2-5.1L3 10z" />
      </svg>
    )
  }

  function heldApprovalSteps(): PlanStep[] {
    const ctx = knownGoalContext()
    const raw = (() => {
      if (pendingPlanSteps.length) return pendingPlanSteps
      const preview = pendingAction?.toolPreview
      if (!preview) return []
      return [
        {
          id: 'single-step',
          tool: preview.tool,
          payload: preview.payload ?? {},
          requiresApproval: true,
          riskTier: preview.riskTier,
          skillId: null,
        },
      ]
    })()
    return raw.map((step) => {
      const payload = applyKnownPrimaryGoal(step.tool, step.payload, ctx)
      return payload === step.payload ? step : { ...step, payload }
    })
  }

  function replaceHeldSteps(next: PlanStep[]) {
    setApprovalEditId(null)
    setApprovalEditError(null)
    setPendingPlanSteps(next)
    if (!next.length) {
      setPendingAction(null)
      return
    }
    const first = next[0]!
    setPendingAction((prev) =>
      prev?.toolPreview
        ? {
            ...prev,
            toolPreview: {
              ...prev.toolPreview,
              tool: first.tool,
              payload: first.payload,
              riskTier: first.riskTier,
            },
          }
        : prev
    )
  }

  function beginApprovalEdit(row: ApprovalRow) {
    setApprovalEditId(row.id)
    setApprovalEditDraft(JSON.stringify(payloadWithoutDryRun(row.payload), null, 2))
    setApprovalEditError(null)
  }

  function saveApprovalEdit(row: ApprovalRow) {
    let parsed: unknown
    try {
      parsed = JSON.parse(approvalEditDraft)
    } catch {
      setApprovalEditError('Payload must be valid JSON.')
      return
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      setApprovalEditError('Payload must be a JSON object.')
      return
    }
    const payload = payloadWithoutDryRun(parsed as Record<string, unknown>)
    const missing = getMissingRequiredFields(row.tool, payload)
    if (missing.length) {
      setApprovalEditError(`Missing required fields: ${missing.join(', ')}`)
      return
    }
    replaceHeldSteps(
      heldApprovalSteps().map((step) => (step.id === row.sourceStepId ? { ...step, payload } : step))
    )
  }

  function dropApprovalSource(sourceStepId: string) {
    setApprovalHiddenRowIds((ids) => ids.filter((id) => id !== sourceStepId && !id.startsWith(`${sourceStepId}:`)))
    replaceHeldSteps(heldApprovalSteps().filter((step) => step.id !== sourceStepId))
  }

  function dropApprovalRow(row: ApprovalRow) {
    const steps = heldApprovalSteps()
    const siblings = buildApprovalRows(steps).filter(
      (candidate) => candidate.sourceStepId === row.sourceStepId && candidate.id !== row.id && !approvalHiddenRowIds.includes(candidate.id)
    )
    if (!siblings.length) {
      dropApprovalSource(row.sourceStepId)
      return
    }
    setApprovalHiddenRowIds((ids) => (ids.includes(row.id) ? ids : [...ids, row.id]))
  }

  async function approveApprovalRow(row: ApprovalRow) {
    const missing = getMissingRequiredFields(row.tool, row.payload)
    if (missing.length) {
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: 'assistant',
          content: `Cannot approve yet. Missing required fields: ${missing.join(', ')}`,
        },
      ])
      return
    }
    setSending(true)
    try {
      const heldPreview = row.id.endsWith(':preview')
      if (heldPreview) {
        const result = await runExecute({
          tool: row.tool,
          payload: row.payload,
          approve: false,
        })
        setPendingAction((prev) =>
          prev ? { ...prev, message: result.message, stepPreviews: result.stepPreviews ?? prev.stepPreviews } : result
        )
        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            role: 'assistant',
            content: result.message || `${row.label} refreshed. Nothing was submitted.`,
          },
          ...strategyPackEmbedChatMessagesFromResult(result),
        ])
        return
      }
      const prepared = await runExecute({
        tool: row.tool,
        payload: row.payload,
        approve: false,
      })
      if (!prepared.runId) {
        throw new Error('Preview did not return a run to approve.')
      }
      const result = await runExecute({
        tool: row.tool,
        payload: row.payload,
        approve: true,
        runId: prepared.runId,
        planSteps: [
          {
            id: row.sourceStepId,
            tool: row.tool,
            payload: row.payload,
            requiresApproval: true,
            riskTier: row.riskTier,
            skillId: null,
          },
        ],
      })
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: 'assistant',
          content: result.message || `${row.label} approved and sent.`,
        },
      ])
      const verifications = (result.results || []).map((item) => item.verification).filter((item) => item != null)
      const verified = verifications.some((item) => item.matched === false) ? false : verifications.length ? true : null
      const checklist = noteApprovedWrite(threadMemory?.checklist, { verified })
      if (checklist || verifications[0]?.summary) {
        mergeIntoActive({
          threadMemory: mergeThreadMemory(threadMemory ?? emptyThreadMemory(), {
            ...(checklist ? { checklist } : {}),
            ...(verifications[0]?.summary ? { addNote: verifications[0].summary.slice(0, 240) } : {}),
          }),
        })
      }
      dropApprovalSource(row.sourceStepId)
    } catch (error: unknown) {
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: 'assistant',
          content: `Approval failed: ${getErrorMessage(error)}`,
        },
      ])
    } finally {
      setSending(false)
    }
  }

  function openStandaloneAssistWindow() {
    if (typeof window === 'undefined') return
    const url = `${window.location.origin}/admin/ai-assistant/window`
    const feats = [`popup=yes`, `width=720`, `height=820`, `left=120`, `top=72`].join(',')
    const win = window.open(url, 'sergik-admin-ai-assistant', feats)
    win?.focus()
  }

  function applyDockFloating() {
    setGripDockMenu(null)
    setDockMode('floating')
    if (typeof window === 'undefined') return
    const vw = window.innerWidth
    const vh = window.innerHeight
    const fallbackW = Math.min(420, vw - 32)
    const fallbackH = Math.round(vh * 0.7)
    setPanelSize((prev) => ({ w: prev?.w ?? fallbackW, h: prev?.h ?? fallbackH }))
    setPosition((prev) =>
      prev ?? {
        x: Math.max(16, vw - fallbackW - 16),
        y: Math.max(24, vh * 0.15),
      }
    )
  }

  function applyDockWorkspaceRight() {
    setGripDockMenu(null)
    setDockMode('dock-right')
    setPosition(null)
    if (typeof window === 'undefined') return
    const vw = window.innerWidth
    const vh = window.innerHeight
    const fallbackW = Math.min(DOCK_PANEL_MAX_W, Math.min(420, vw - PANEL_PAD * 2))
    setPanelSize((prev) => ({
      w: prev?.w ?? fallbackW,
      h: Math.max(PANEL_MIN_H, vh - PANEL_PAD * 2),
    }))
  }

  function applyDockWorkspaceLeft() {
    setGripDockMenu(null)
    setDockMode('dock-left')
    setPosition(null)
    if (typeof window === 'undefined') return
    const vw = window.innerWidth
    const vh = window.innerHeight
    const fallbackW = Math.min(DOCK_PANEL_MAX_W, Math.min(420, vw - PANEL_PAD * 2))
    setPanelSize((prev) => ({
      w: prev?.w ?? fallbackW,
      h: Math.max(PANEL_MIN_H, vh - PANEL_PAD * 2),
    }))
  }

  function startDrag(event: React.PointerEvent<HTMLElement>) {
    if (isStandalone || dockMode === 'dock-right' || dockMode === 'dock-left') return
    const panel = panelRef.current
    if (!panel) return

    const rect = panel.getBoundingClientRect()
    dragOffsetRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    }
    setIsDragging(true)
  }

  function startResize(event: React.PointerEvent, edge: ResizeEdge) {
    if (isStandalone) return
    if (dockMode === 'dock-right' && edge !== 'w') return
    if (dockMode === 'dock-left' && edge !== 'e') return
    event.preventDefault()
    event.stopPropagation()
    const panel = panelRef.current
    if (!panel) return

    const rect = panel.getBoundingClientRect()
    resizeStartRef.current = {
      edge,
      startLeft: rect.left,
      startTop: rect.top,
      startWidth: rect.width,
      startHeight: rect.height,
      startPointerX: event.clientX,
      startPointerY: event.clientY,
    }

    const el = event.currentTarget
    if (el instanceof HTMLElement && event.pointerId != null) {
      try {
        el.setPointerCapture(event.pointerId)
      } catch {
        /* ignore */
      }
    }
    setIsResizing(true)
  }

  function startStandaloneSplitResize(event: React.PointerEvent<HTMLDivElement>) {
    if (!isStandalone || !browserPaneOpen) return
    event.preventDefault()
    event.stopPropagation()
    splitResizeRef.current = { startX: event.clientX, startW: chatPaneWidth, dock: false, grow: 1 }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      /* ignore */
    }
    setIsSplitResizing(true)
  }

  function startDockBrowserSplitResize(event: React.PointerEvent<HTMLDivElement>) {
    if (isStandalone || !dockBrowserWorkspace) return
    event.preventDefault()
    event.stopPropagation()
    splitResizeRef.current = {
      startX: event.clientX,
      startW: dockBesideChatW,
      dock: true,
      grow: dockMode === 'dock-right' ? -1 : 1,
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      /* ignore */
    }
    setIsSplitResizing(true)
  }

  const dockRightLayout = !isStandalone && dockMode === 'dock-right'
  const dockLeftLayout = !isStandalone && dockMode === 'dock-left'
  const dockEdgeLayout = dockRightLayout || dockLeftLayout
  const dockBrowserBeside = dockEdgeLayout && dockBrowserWorkspace

  const handleAdminAiFabClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      if (event.shiftKey) {
        setEnabled((prev) => {
          const next = !prev
          if (!next) setOpen(false)
          return next
        })
        return
      }
      if (!enabled) {
        setEnabled(true)
        setOpen(true)
        return
      }
      setOpen((prev) => !prev)
    },
    [enabled]
  )

  function renderFocusApplyActions(messageContent: string, focus: AdminAiFocusContext | null) {
    if (!focus?.canApply) return null
    const applyValue = parseAiApplyBlock(messageContent)
    if (!applyValue) return null
    return (
      <div className="mt-2 flex flex-wrap gap-2 border-t border-gray-700/80 pt-2">
        <button
          type="button"
          className="rounded-full bg-emerald-600/90 px-2.5 py-1 text-[10px] font-medium text-white hover:bg-emerald-500"
          onClick={() => applyFieldValue(focus.fieldId, applyValue)}
        >
          Apply to {focus.fieldLabel}
        </button>
      </div>
    )
  }

  function renderAssistantInterior() {
    const composerToggles = (
      <>
        {setFocusCopilotEnabled ? (
          <FieldFocusToggle
            copilotOn={focusCopilotEnabled}
            disabled={!enabled || sending}
            onToggle={() => setFocusCopilotEnabled(!focusCopilotEnabled)}
          />
        ) : null}
        <AnchorsPanelToggle
          open={anchorsPanelOpen}
          disabled={!enabled || sending}
          onToggle={() => {
            if (anchorsPanelOpen) setExplainOpen(false)
            setAnchorsPanelOpen((o) => !o)
          }}
        />
        <StrategyPackPolishToggle
          on={preferStrategyPackRefine}
          live={readStrategyPackPolish(strategyPackPreviewRows(pendingAction ?? { message: '' })[0]?.preview ?? null)}
          mode={polishMode}
          cue={polishCue}
          hasPreview={pendingPlanSteps.some((step) => step.tool === 'draft_product_strategy_pack')}
          disabled={!enabled || sending}
          onToggle={() => {
            const next = !preferStrategyPackRefine
            if (!next && polishMode === 'always') setPolishMode('suggest')
            if (!next && polishMode === 'auto') polishAutoHold.current = true
            if (next && polishMode === 'off') setPolishMode('suggest')
            setPreferStrategyPackRefine(next)
          }}
          onMode={(nextMode) => {
            setPolishMode(nextMode)
            polishAutoHold.current = false
            if (nextMode === 'always') setPreferStrategyPackRefine(true)
            if (nextMode === 'off') setPreferStrategyPackRefine(false)
          }}
          onPolishPreview={() => void regeneratePendingPreview('polish')}
          onScaffoldPreview={() => void regeneratePendingPreview('deterministic')}
        />
      </>
    )

    const missionDock = buildMissionDock(pageCtx?.pageContext ?? null)

    function handleMissionAction(action: MissionDockAction) {
      if (action.type === 'prompt') {
        setInput(action.message)
        return
      }
      if (action.type === 'week') {
        setInput(`/exec query_studio_command_center ${JSON.stringify({ dueWithinDays: 7 })}`)
        return
      }
      if (action.type === 'open-launch') {
        if (studioMissionReleaseId) applyStudioNav({ releaseId: studioMissionReleaseId, step: 'launch' })
        return
      }
      if (action.type === 'distrokid-hydrate') {
        if (!studioMissionReleaseId) return
        const releaseId = studioMissionReleaseId
        const target = action.target === 'my_music' ? 'my_music' : 'upload'
        void (async () => {
          setSending(true)
          try {
            applyStudioNav({ releaseId, step: 'delivery' })
            const res = await adminAiFetch(`/api/studio/releases/${encodeURIComponent(releaseId)}/distrokid`)
            const json = (await res.json().catch(() => ({}))) as {
              error?: string
              packet?: {
                worksheet?: string
                upload_url?: string
                my_music_url?: string
                blockers?: string[]
                release?: { title?: string; release_date?: string }
              }
              window?: {
                label?: string
                upload_by?: string | null
                release_date?: string | null
              }
            }
            if (!res.ok) {
              setMessages((prev) => [
                ...prev,
                {
                  id: nextId(),
                  role: 'assistant',
                  content: json.error || 'Could not load DistroKid packet for hydrate.',
                },
              ])
              return
            }
            const { buildDistroKidBrowserHydrate } = await import('@/lib/ai/distrokid-browser-hydrate')
            const { dispatchAdminAiBrowserHydrate } = await import('@/lib/admin-ai-client')
            const packet = json.packet as {
              worksheet?: string
              upload_url?: string
              my_music_url?: string
              blockers?: string[]
              ok?: boolean
              release?: Record<string, unknown>
              tracks?: unknown[]
            } | undefined
            const detail = buildDistroKidBrowserHydrate({
              releaseId,
              releaseTitle: String(packet?.release?.title || pageCtx?.pageContext?.studio?.title || ''),
              target,
              worksheet: packet?.worksheet || '',
              uploadBy: json.window?.upload_by,
              streetDate: String(packet?.release?.release_date || json.window?.release_date || ''),
              windowLabel: json.window?.label,
              blockers: packet?.blockers,
              uploadUrl: packet?.upload_url,
              myMusicUrl: packet?.my_music_url,
            })
            dispatchAdminAiBrowserHydrate(detail)
            if (target === 'upload' && packet?.release && Array.isArray(packet.tracks) && !packet.blockers?.length) {
              await new Promise((r) => window.setTimeout(r, 1200))
              await adminAiFetch('/api/admin/ai/browser', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  actor: 'user',
                  action: 'navigate',
                  url: packet.upload_url || 'https://distrokid.com/new/',
                }),
              })
              await new Promise((r) => window.setTimeout(r, 1800))
              const prefillRes = await adminAiFetch('/api/admin/ai/browser', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  actor: 'user',
                  action: 'distrokid_prefill',
                  distrokidPacket: { release: packet.release, tracks: packet.tracks },
                }),
              })
              const prefillJson = (await prefillRes.json().catch(() => ({}))) as {
                distrokidPrefill?: { filled?: string[]; skipped?: string[] }
                error?: string
              }
              const filled = prefillJson.distrokidPrefill?.filled?.length || 0
              setMessages((prev) => [
                ...prev,
                {
                  id: nextId(),
                  role: 'assistant',
                  content: [
                    `Filled DistroKid desk for “${detail.releaseTitle || releaseId}” (${filled} field(s)).`,
                    'Social Media Pack stays off. Metadata + artwork/WAV uploads run on the desk — review, Continue in DistroKid, then Mark submitted on the schedule card.',
                  ].join(' '),
                },
              ])
            } else {
              setMessages((prev) => [
                ...prev,
                {
                  id: nextId(),
                  role: 'assistant',
                  content: `Opened DistroKid ${target === 'my_music' ? 'My Music' : 'upload'} desk for “${detail.releaseTitle || releaseId}”. Worksheet staged — use Paste worksheet if needed. Mark submitted on the DistroKid schedule card after upload.`,
                },
              ])
            }
          } finally {
            setSending(false)
          }
        })()
        return
      }
      if (action.type === 'soundcloud-upload') {
        if (!studioMissionReleaseId) return
        const releaseId = studioMissionReleaseId
        const releaseTitle = pageCtx?.pageContext?.studio?.title || releaseId
        void (async () => {
          setSending(true)
          try {
            const prefillRes = await adminAiFetch('/api/admin/ai/browser', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                actor: 'user',
                action: 'soundcloud_prefill',
                releaseId,
                chatSessionId: activeSessionId,
              }),
            })
            const prefillJson = (await prefillRes.json().catch(() => ({}))) as {
              text?: string
              error?: string
              soundcloudPrefill?: { filled?: string[] }
            }
            const filled = prefillJson.soundcloudPrefill?.filled?.length || 0
            setMessages((prev) => [
              ...prev,
              {
                id: nextId(),
                role: 'assistant',
                content:
                  prefillJson.error ||
                  prefillJson.text ||
                  `Filled SoundCloud for “${releaseTitle}” from database files (${filled} step(s)). Review the form, then click Save. Nothing is posted automatically.`,
              },
            ])
          } finally {
            setSending(false)
          }
        })()
        return
      }
      if (action.type === 'harness') {
        const query = action.query
        const payload = {
          mode: 'stack' as const,
          query,
          ...(studioMissionReleaseId ? { releaseId: studioMissionReleaseId } : {}),
        }
        void (async () => {
          setSending(true)
          try {
            setMessages((prev) => [
              ...prev,
              {
                id: nextId(),
                role: 'user',
                content: `/exec query_intelligence_harness ${JSON.stringify(payload)}`,
              },
            ])
            await runExecDryRun('query_intelligence_harness', payload)
          } finally {
            setSending(false)
          }
        })()
        return
      }
      if (action.type === 'fix-blocker' || !studioMissionReleaseId) return
      const releaseId = studioMissionReleaseId
      if (action.type === 'snapshot') {
        void (async () => {
          setSending(true)
          try {
            setMessages((prev) => [
              ...prev,
              {
                id: nextId(),
                role: 'user',
                content: `/exec query_release_studio_snapshot ${JSON.stringify({ releaseId })}`,
              },
            ])
            await runExecDryRun('query_release_studio_snapshot', { releaseId })
          } finally {
            setSending(false)
          }
        })()
        return
      }
      if (action.type === 'copy-dry-run') {
        void (async () => {
          setSending(true)
          try {
            applyStudioNav({ releaseId, step: 'copy' })
            const payload = { releaseId, merge: true, dryRun: true, marketingCopy: {} }
            setMessages((prev) => [
              ...prev,
              {
                id: nextId(),
                role: 'user',
                content: `/exec patch_release_marketing_copy ${JSON.stringify(payload)}`,
              },
            ])
            await runExecDryRun('patch_release_marketing_copy', payload)
          } finally {
            setSending(false)
          }
        })()
      }
    }

    const dockBrowserPane = (
      <>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize chat and browser"
          title="Drag to resize"
          onPointerDown={isStandalone ? startStandaloneSplitResize : startDockBrowserSplitResize}
          className="group relative z-10 w-1.5 shrink-0 cursor-ew-resize touch-none bg-gray-800/80 hover:bg-purple-600/50"
        >
          <span className="pointer-events-none absolute inset-y-0 -left-1 -right-1" />
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-gray-800 bg-gray-950">
          <AdminAiBrowserDock
            layout="side"
            chatSessionId={activeSessionId}
            releaseId={studioMissionReleaseId}
            assistantActing={sending}
            taskNotice={sending ? null : browserHolds[activeSessionId] ?? null}
            expanded={isStandalone ? browserPaneOpen : true}
            onExpandedChange={isStandalone ? setBrowserPaneOpen : undefined}
            onExitWorkspace={isStandalone ? undefined : () => setDockBrowserWorkspace(false)}
            persistExpanded={isStandalone}
          />
        </div>
      </>
    )

    return (
          <div className="relative flex h-full min-h-0 flex-1 flex-col" data-admin-ai-root>
            <div className="select-none border-b border-gray-800">
              <div className="flex items-stretch gap-0.5 px-1.5 py-1">
                {isStandalone ? (
                  <Link
                    href="/admin"
                    className="mx-2 flex shrink-0 items-center rounded py-1 text-[11px] font-medium text-purple-400 hover:text-purple-300"
                  >
                    ← Admin
                  </Link>
                ) : (
                  <button
                    type="button"
                    className={`ml-4 flex w-4 shrink-0 flex-col items-center justify-center gap-0.5 rounded py-0.5 text-gray-500 hover:text-gray-300 ${
                      dockMode === 'dock-right' || dockMode === 'dock-left'
                        ? 'cursor-default'
                        : isDragging
                          ? 'cursor-grabbing'
                          : 'cursor-grab'
                    }`}
                    onPointerDown={(e) => {
                      if (e.button !== 0) return
                      startDrag(e)
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      if (typeof window !== 'undefined') {
                        const vw = window.innerWidth
                        const vh = window.innerHeight
                        setGripDockMenu({
                          x: Math.min(e.clientX, vw - 200),
                          y: Math.min(e.clientY, vh - 140),
                        })
                      }
                      setShowSessionHistory(false)
                    }}
                    aria-label="Move panel — right-click for dock mode"
                    title="Floating: drag to move. Right-click: dock on workspace edge or floating."
                  >
                    <span className="h-px w-3 rounded-sm bg-current" />
                    <span className="h-px w-3 rounded-sm bg-current" />
                    <span className="h-px w-3 rounded-sm bg-current" />
                  </button>
                )}
                {dockEdgeLayout ? (
                  <button
                    type="button"
                    className="-ml-0.5 inline-flex h-8 w-7 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-800 hover:text-white"
                    aria-label="Collapse assistant panel"
                    title="Collapse panel"
                    onClick={() => setOpen(false)}
                  >
                    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d={dockLeftLayout ? 'M12.5 5l-5 5 5 5' : 'M7.5 5l5 5-5 5'}
                      />
                    </svg>
                  </button>
                ) : null}
                <div className="min-w-0 flex-1 overflow-x-auto border-b border-transparent">
                  <div className="flex h-8 min-w-0 items-end gap-0.5">
                    {sessions.map((s) => (
                      <div
                        key={s.id}
                        className={`group relative flex min-w-0 shrink-0 items-center ${
                          (s.attachedReleaseIds ?? []).length
                            ? 'max-w-[min(16rem,46vw)]'
                            : 'max-w-[min(7.5rem,32vw)]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setActiveSessionId(s.id)
                            setShowSessionHistory(false)
                          }}
                          onContextMenu={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            setShowSessionHistory(false)
                            setGripDockMenu(null)
                            setTabMenu({ x: event.clientX, y: event.clientY, sessionId: s.id })
                          }}
                          className={`min-w-0 flex-1 truncate rounded-t px-1.5 py-1.5 text-left text-[11px] font-medium leading-tight ${
                            s.id === activeSessionId
                              ? 'bg-gray-800 text-white ring-1 ring-inset ring-gray-600'
                              : 'text-gray-400 hover:bg-gray-800/80 hover:text-gray-200'
                          }`}
                          title={s.title}
                        >
                          {(s.attachedReleaseIds ?? []).length > 0 ? (
                            <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-violet-400 align-middle" aria-hidden />
                          ) : null}
                          {s.title}
                        </button>
                        {sessions.length > 1 ? (
                          <button
                            type="button"
                            className="ml-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[12px] leading-none text-gray-500/90 hover:bg-red-900/50 hover:text-red-200"
                            aria-label="Close tab"
                            onClick={(e) => {
                              e.stopPropagation()
                              removeSession(s.id)
                            }}
                          >
                            ×
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="relative flex shrink-0 items-center gap-0.5 self-center pr-0.5" ref={historyPopoverRef}>
                  <button
                    type="button"
                    className="inline-flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-gray-800 hover:text-white"
                    aria-label="Chat history and tasks"
                    title="Chats, history & server runs"
                    onClick={() => setShowSessionHistory((v) => !v)}
                  >
                    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
                      <path d="M4.5 5.5H15" />
                      <path d="M4.5 10H15" />
                      <path d="M4.5 14.5H11" />
                    </svg>
                  </button>
                  {!isStandalone ? (
                    <button
                      type="button"
                      className="inline-flex h-7 w-8 items-center justify-center rounded text-gray-400 hover:bg-gray-800 hover:text-white"
                      aria-label="Open assistant in separate window"
                      title="Opens a new browser window — drag it to another display"
                      onClick={openStandaloneAssistWindow}
                    >
                      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.35" aria-hidden>
                        <rect x="2.5" y="3.5" width="9" height="7" rx="0.8" />
                        <path d="M8.5 10.5v3.5a1.5 1.5 0 001.5 1.5h6.5a1.5 1.5 0 001.5-1.5V8.5a1.5 1.5 0 00-1.5-1.5H13" />
                      </svg>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="inline-flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-gray-800 hover:text-white"
                    aria-label="Start new chat"
                    title="New chat"
                    onClick={startNewChat}
                  >
                    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                      <rect x="4" y="5" width="10" height="10" rx="1.2" />
                      <path d="M12.5 3.5h3v3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  {isStandalone && !browserPaneOpen ? (
                    <button
                      type="button"
                      className="inline-flex h-7 items-center gap-1 rounded px-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300/90 hover:bg-gray-800 hover:text-amber-200"
                      aria-label="Show browser pane"
                      title="Show browser beside chat"
                      onClick={() => setBrowserPaneOpen(true)}
                    >
                      Browser
                    </button>
                  ) : null}
                  {showSessionHistory ? (
                    <div className="absolute right-0 top-8 z-[80] w-[min(18rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-gray-600 bg-gray-900 shadow-2xl">
                      <p className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                        Chats & tasks
                      </p>
                      <ul className="max-h-44 overflow-y-auto border-t border-gray-800/80">
                        {[...sessions]
                          .sort((a, b) => b.updatedAt - a.updatedAt)
                          .map((s) => (
                            <li key={s.id} className="border-b border-gray-800/50 last:border-0">
                              <button
                                type="button"
                                className={`flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-gray-800/90 ${
                                  s.id === activeSessionId ? 'bg-gray-800/50' : ''
                                }`}
                                onClick={() => {
                                  setActiveSessionId(s.id)
                                  setShowSessionHistory(false)
                                }}
                              >
                                <span className="min-w-0 flex-1 truncate text-gray-200">{s.title}</span>
                                <span className="shrink-0 tabular-nums text-[10px] text-gray-500">
                                  {new Date(s.updatedAt).toLocaleString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              </button>
                            </li>
                          ))}
                      </ul>
                      <div className="border-t border-gray-800 bg-gray-950/60 px-2.5 py-2">
                        <Link
                          href="/admin/ai-runs"
                          className="text-[11px] font-medium text-purple-400 hover:text-purple-300"
                          onClick={() => setShowSessionHistory(false)}
                        >
                          Open AI runs (server) →
                        </Link>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
              <AdminAiMemoryStrip
                memory={threadMemory ?? null}
                checkpoints={checkpoints ?? []}
                undoBusy={sending}
                onUndo={(checkpoint) => {
                  void (async () => {
                    try {
                      await runExecDryRun(
                        checkpoint.tool as ExecuteTool,
                        { ...checkpoint.restorePayload, dryRun: true },
                      )
                      setMessages((prev) => [
                        ...prev,
                        {
                          id: nextId(),
                          role: 'assistant',
                          content: `Undo staged for “${checkpoint.label}”. Approve the preview to restore the previous values.`,
                        },
                      ])
                    } catch (error: unknown) {
                      setMessages((prev) => [
                        ...prev,
                        {
                          id: nextId(),
                          role: 'assistant',
                          content: `Undo failed: ${getErrorMessage(error)}`,
                        },
                      ])
                    }
                  })()
                }}
              />
            </div>

            <div
              className={`flex min-h-0 flex-1 ${(isStandalone && browserPaneOpen) || dockBrowserBeside ? 'flex-row' : 'flex-col'} ${
                isSplitResizing ? 'select-none' : ''
              }`}
            >
              {dockRightLayout && dockBrowserWorkspace ? dockBrowserPane : null}
              <div
                className={`flex min-h-0 flex-col ${isStandalone || dockBrowserBeside ? '' : 'min-h-0 flex-1'}`}
                style={
                  isStandalone && browserPaneOpen
                    ? { width: chatPaneWidth, flex: '0 0 auto', maxWidth: '70%' }
                    : isStandalone
                      ? { flex: '1 1 auto', width: '100%' }
                      : dockBrowserBeside
                        ? { width: dockBesideChatW, flex: '0 0 auto', minWidth: STANDALONE_CHAT_MIN_W }
                        : undefined
                }
              >
            {!isStandalone && !dockBrowserBeside ? (
              <AdminAiBrowserDock
                layout="stack"
                chatSessionId={activeSessionId}
                releaseId={studioMissionReleaseId}
                assistantActing={sending}
                taskNotice={sending ? null : browserHolds[activeSessionId] ?? null}
                onWorkspaceExpand={() => setDockBrowserWorkspace(true)}
              />
            ) : null}
                  <div className="relative flex min-h-0 flex-1 flex-col">
                  <div
                    ref={threadScrollRef}
                    className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-y-contain px-3 py-3"
                  >
              <AdminAiQuickStartPanel
                  compact={!showQuickStart}
                  sessionId={activeSessionId}
                  smartExpand={{
                    hasRelease: Boolean(studioMissionReleaseId),
                    unfinishedCount: allUnfinishedBusiness.length,
                    priorityCount: priorityQuickStart?.current.length ?? prioritySuggestionPool.length,
                    blockerCount: Math.max(
                      missionBlockerCount,
                      pageCtx?.pageContext?.studio?.blockers?.length ?? 0,
                    ),
                  }}
                  sectionCounts={{
                    priority: priorityQuickStart?.current.length ?? 0,
                    unfinished: allUnfinishedBusiness.length,
                    playbooks: playbookSuggestionPool.length,
                    creative: creativeQuickStart?.current.length ?? 0,
                  }}
                  priority={priorityQuickStart?.current ?? []}
                  creative={creativeQuickStart?.current ?? []}
                  priorityHistory={priorityHistory}
                  creativeHistory={creativeHistory}
                  unfinishedBusiness={visibleUnfinishedBusiness}
                  allUnfinishedCount={allUnfinishedBusiness.length}
                  dismissedUnfinishedHistory={dismissedUnfinishedHistory}
                  onRefreshUnfinished={() => {
                    const next = refreshUnfinishedBusinessViewState(
                      allUnfinishedBusiness,
                      unfinishedView,
                      activeSessionId,
                    )
                    mergeIntoActive({ unfinishedView: next.view })
                  }}
                  onRestoreDismissedUnfinished={(entry) => {
                    const archived = dismissedUnfinishedArchive.find((row) => row.id === entry.id)
                    setDismissedUnfinishedIds((prev) => prev.filter((id) => id !== entry.id))
                    setDismissedUnfinishedArchive((prev) => prev.filter((row) => row.id !== entry.id))
                    if (archived) void handleQuickStartPick(unfinishedBusinessEntryToQuickStart(archived))
                  }}
                  showPlaybookSection={playbookSuggestionPool.length > 0}
                  playbooks={visiblePlaybookRows}
                  playbookHistory={playbookHistory}
                  playbookPoolExhaustedHint={Boolean(playbookQuickStart?.poolExhausted)}
                  onRefreshPlaybooks={() => {
                    if (!activeSession.playbookQuickStart) return
                    mergeIntoActive({
                      playbookQuickStart: refreshPlaybookQuickStartState(
                        activeSession.playbookQuickStart,
                        playbookSuggestionPool,
                        activeSessionId,
                      ),
                    })
                  }}
                  onRunPlaybook={(book) => void handlePlaybookRun(book)}
                  onPickPlaybookHistory={(entry) => {
                    const id = parsePlaybookIdFromQuickStart(historyEntryToQuickStart(entry))
                    if (!id) return
                    const book = findPlaybookById(pageCtx?.pageContext ?? null, id)
                    if (book) void handlePlaybookRun(book)
                  }}
                  priorityPoolExhaustedHint={Boolean(priorityQuickStart?.poolExhausted)}
                  creativePoolExhaustedHint={Boolean(creativeQuickStart?.poolExhausted)}
                  disabled={!enabled || sending}
                  onDismissUnfinished={(id) => {
                    const entry = allUnfinishedBusiness.find((row) => row.id === id)
                    if (entry) {
                      setDismissedUnfinishedArchive((prev) => [
                        entry,
                        ...prev.filter((row) => row.id !== id),
                      ].slice(0, 40))
                    }
                    setDismissedUnfinishedIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
                  }}
                  onRefreshPriority={() => {
                    if (!activeSession.priorityQuickStart) return
                    mergeIntoActive({
                      priorityQuickStart: refreshPriorityQuickStartState(
                        activeSession.priorityQuickStart,
                        prioritySuggestionPool,
                        activeSessionId,
                      ),
                    })
                  }}
                  onRefreshCreative={() => {
                    if (!activeSession.creativeQuickStart) return
                    mergeIntoActive({
                      creativeQuickStart: refreshCreativeQuickStartState(
                        activeSession.creativeQuickStart,
                        creativeSuggestionPool,
                        activeSessionId,
                      ),
                    })
                  }}
                  onPick={(start) => void handleQuickStartPick(start)}
                />
              {!showQuickStart
                ? visibleMessages.map((message) => (
                  <div
                    key={message.id}
                    {...(message.role === 'user' ? { 'data-thread-user-message': '' } : {})}
                    className={`rounded-lg px-3 py-3 text-sm leading-relaxed ${
                      message.role === 'user'
                        ? 'ml-8 bg-purple-600/20 text-right text-purple-100'
                        : message.role === 'assistant'
                          ? 'mr-8 bg-gray-800/95 text-gray-100 ring-1 ring-gray-700/80'
                          : 'bg-gray-900 text-gray-400'
                    }`}
                  >
                    {message.role === 'assistant' ? (
                      <>
                        {message.toolSteps?.length ? (
                          <AdminAiToolStepCards steps={message.toolSteps} />
                        ) : null}
                        {message.content === 'Working…' || message.content === '…' ? (
                          <AdminAiWorkingStatus note={browserLiveNote} context={workingPhraseContext} />
                        ) : (
                          <div className={message.toolSteps?.length ? 'mt-3' : undefined}>
                            <AdminAssistantRichText content={message.content} />
                            {message.id === streamingMessageId ? (
                              <span className="admin-ai-working-caret" aria-hidden />
                            ) : null}
                          </div>
                        )}
                        {message.id === actionChoiceHostId &&
                        message.id !== streamingMessageId &&
                        message.content !== 'Working…' &&
                        message.content !== '…' ? (
                          parseAdminChatActionChoices(message.content) ? (
                            <AdminChatActionChoices
                              content={message.content}
                              disabled={!enabled || sending}
                              onPick={(text) => void sendComposerTurn(text, false)}
                            />
                          ) : replyFollowUps.length && !input.trim() ? (
                            <AdminChatReplySuggestions
                              items={replyFollowUps}
                              disabled={!enabled || sending}
                              onPick={(text) => void sendComposerTurn(text, false)}
                            />
                          ) : null
                        ) : null}
                        {message.applyDiffs?.length ? (
                          <AdminAiApplyDiffCards
                            diffs={message.applyDiffs}
                            busy={sending}
                            onApprove={(diff, payload) => {
                              void (async () => {
                                try {
                                  const previewResult = await runExecDryRun(
                                    'patch_release_marketing_copy',
                                    payload,
                                  )
                                  const preview =
                                    previewResult?.toolPreview?.preview ||
                                    previewResult?.stepPreviews?.find(
                                      (row) => row.tool === 'patch_release_marketing_copy',
                                    )?.preview
                                  mergeIntoActive({
                                    checkpoints: pushCheckpoint(
                                      checkpoints ?? [],
                                      checkpointFromMarketingPatch({
                                        releaseId: diff.releaseId,
                                        fields: { [diff.field]: diff.after },
                                        previous: previousFieldsFromPreview(
                                          diff.field,
                                          diff.before,
                                          preview,
                                        ),
                                        summary: `Proposed ${diff.label || diff.field}`,
                                      }),
                                    ),
                                  })
                                } catch (error: unknown) {
                                  setMessages((prev) => [
                                    ...prev,
                                    {
                                      id: nextId(),
                                      role: 'assistant',
                                      content: `Apply preview failed: ${getErrorMessage(error)}`,
                                    },
                                  ])
                                }
                              })()
                            }}
                          />
                        ) : null}
                        {renderFocusApplyActions(message.content, pageFocus)}
                        {message.embed?.type === 'product_strategy_pack' ? (
                          <div className="mt-3 border-t border-gray-700/80 pt-3">
                            <ProductStrategyPackCard
                              output={message.embed.output}
                              onSendPolishToChat={appendStrategyPolishToThread}
                            />
                          </div>
                        ) : null}
                        {message.content !== 'Working…' &&
                        message.content !== '…' &&
                        message.id !== streamingMessageId ? (
                          <div className="mt-2 flex justify-between gap-1">
                            <button
                              type="button"
                              onClick={() => openReplyInNewChat(message.content)}
                              className="rounded-md border border-gray-600/80 bg-gray-900/80 px-2 py-0.5 text-[10px] font-medium text-gray-300 hover:bg-gray-800 hover:text-white"
                              aria-label="Open reply in a new chat"
                            >
                              New thread
                            </button>
                            <AdminReplyCopyButton text={message.content} />
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <AdminChatPlainText
                        content={message.content}
                        className={
                          message.role === 'user' ? 'text-purple-50/95' : 'font-mono text-[11px] text-gray-500'
                        }
                      />
                    )}
                  </div>
                ))
                : null}
            </div>
            {threadHasEarlierUserMessage ? (
              <button
                type="button"
                className="absolute top-2 right-3 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-gray-600 bg-gray-900/95 text-sm leading-none text-gray-200 shadow-md hover:bg-gray-800 hover:text-white"
                aria-label="Jump to previous message you sent"
                title="Previous message you sent"
                onClick={jumpToPreviousUserMessage}
              >
                <span aria-hidden>↑</span>
              </button>
            ) : null}
            {threadAwayFromBottom ? (
              <button
                type="button"
                className="absolute bottom-2 right-3 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-gray-600 bg-gray-900/95 text-sm leading-none text-gray-200 shadow-md hover:bg-gray-800 hover:text-white"
                aria-label="Jump to bottom of thread"
                title="Jump to bottom"
                onClick={() => jumpThreadToBottom('smooth')}
              >
                <span aria-hidden>↓</span>
              </button>
            ) : null}
            </div>

            {lastRunbookGraph && lastRunbookGraph.steps.length > 0 && (
              <div className="relative border-t border-cyan-800/50 bg-cyan-950/30 px-3 py-2 pr-9 text-xs text-cyan-100">
                <button
                  type="button"
                  onClick={() => setLastRunbookGraph(null)}
                  className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded text-cyan-300/80 hover:bg-cyan-900/80 hover:text-cyan-50"
                  aria-label="Dismiss runbook plan"
                  title="Dismiss runbook plan"
                >
                  <span className="text-base leading-none" aria-hidden>
                    ×
                  </span>
                </button>
                <p className="font-semibold text-cyan-50">Runbook (dry plan)</p>
                <p className="mt-0.5 text-[11px] text-cyan-200/90">{lastRunbookGraph.summary}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {lastRunbookGraph.steps.map((step, index) => (
                    <button
                      key={step.id}
                      type="button"
                      disabled={sending}
                      onClick={() =>
                        setInput(`/exec ${step.tool} ${JSON.stringify(step.payload)}`)
                      }
                      className="rounded bg-cyan-900/80 px-2 py-1 text-[11px] font-medium text-cyan-50 hover:bg-cyan-800 disabled:opacity-50"
                    >
                      Step {index + 1}: {step.tool}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={sending}
                  onClick={async () => {
                    setSending(true)
                    try {
                      await previewFullRunbookFromGraph(lastRunbookGraph.steps)
                    } finally {
                      setSending(false)
                    }
                  }}
                  className="mt-2 w-full rounded bg-cyan-600 px-2 py-1.5 text-[11px] font-semibold text-black hover:bg-cyan-500 disabled:opacity-50"
                >
                  Preview full runbook (queues approval)
                </button>
              </div>
            )}

            {pendingAction?.toolPreview && (
              <div className="relative border-t border-amber-700/60 bg-amber-950/40 px-3 py-2 pr-9 text-xs text-amber-200">
                <button
                  type="button"
                  onClick={() => {
                    setPendingAction(null)
                    setPendingPlanSteps([])
                    setApprovalHiddenRowIds([])
                    setApprovalEditId(null)
                  }}
                  className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded text-amber-300/80 hover:bg-amber-900/50 hover:text-amber-50"
                  aria-label="Dismiss pending approval"
                  title="Dismiss pending approval"
                >
                  <span className="text-base leading-none" aria-hidden>
                    ×
                  </span>
                </button>
                {(() => {
                  const skill = getSkillByTool(pendingAction.toolPreview.tool)
                  const missingFields = pendingPlanSteps.length
                    ? pendingPlanSteps.flatMap((step) => getMissingRequiredFields(step.tool, step.payload))
                    : getMissingRequiredFields(pendingAction.toolPreview.tool, pendingAction.toolPreview.payload || {})

                  return (
                    <>
                      <p className="font-semibold">Held actions</p>
                      <p className="mt-0.5 text-[11px] text-amber-100/90">
                        Edit or drop any row. A submit row is the only control that sends that step.
                      </p>
                      {skill && (
                        <p className="mt-1 text-amber-100">
                          Skill: {skill.name} ({skill.id})
                        </p>
                      )}
                      {missingFields.length > 0 ? (
                        <p className="mt-1 text-red-300">Missing required fields: {missingFields.join(', ')}</p>
                      ) : (
                        <p className="mt-1 text-emerald-300">All required fields are present.</p>
                      )}
                      <details className="mt-2 rounded border border-amber-800/60 bg-black/25 px-2 py-1.5 text-[11px] text-amber-100/95">
                        <summary className="cursor-pointer select-none font-medium text-amber-50/95">
                          Payload Δ (session)
                        </summary>
                        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-snug text-amber-100/90">
                          {(
                            execPreviewDiffBaseline &&
                            execPreviewDiffBaseline.tool !== pendingAction.toolPreview.tool
                              ? ['(baseline tool differs from current preview; send a new preview to reset session diff.)']
                              : shallowPayloadDiffLines(
                                  execPreviewDiffBaseline?.payload ?? null,
                                  (pendingAction.toolPreview.payload ?? {}) as Record<string, unknown>
                                )
                          ).join('\n')}
                        </pre>
                      </details>
                      {strategyPackPreviewRows(pendingAction).map((row) => (
                        <div key={row.stepId} className="mt-2 max-h-[min(70vh,520px)] overflow-y-auto rounded-lg border border-amber-800/50 bg-black/20 p-2">
                          <ProductStrategyPackCard
                            output={row.preview}
                            density="compact"
                            onSendPolishToChat={appendStrategyPolishToThread}
                          />
                        </div>
                      ))}
                      {pendingPlanSteps.some((s) => s.tool === 'draft_product_strategy_pack') ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          <button
                            type="button"
                            disabled={sending || missingFields.length > 0}
                            onClick={() => void regeneratePendingPreview('polish')}
                            aria-label="Regenerate strategy pack preview with LLM polish"
                            className="rounded bg-emerald-700/90 px-2 py-1 text-[10px] font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                          >
                            Regenerate with LLM polish
                          </button>
                          <button
                            type="button"
                            disabled={sending || missingFields.length > 0}
                            onClick={() => void regeneratePendingPreview('deterministic')}
                            aria-label="Regenerate strategy pack preview without LLM polish"
                            className="rounded border border-amber-600/60 bg-transparent px-2 py-1 text-[10px] font-medium text-amber-100 hover:bg-amber-950/60 disabled:opacity-50"
                          >
                            Regenerate (no polish)
                          </button>
                        </div>
                      ) : null}
                      {buildApprovalRows(heldApprovalSteps())
                        .filter((row) => !approvalHiddenRowIds.includes(row.id))
                        .map((row, index) => {
                        const rowMissing = getMissingRequiredFields(row.tool, row.payload)
                        const editing = approvalEditId === row.id
                        return (
                          <div key={row.id} className="mt-2 rounded border border-amber-800/70 bg-black/20 p-2">
                            <p className="font-semibold text-amber-50">
                              {index + 1}. {row.label}
                            </p>
                            <p className="mt-0.5 text-[11px] text-amber-100/90">
                              {row.phase === 'submit'
                                ? 'Held. Approve sends this step only.'
                                : row.id.endsWith(':preview')
                                  ? 'Preview. Approve refreshes the draft and does not send it.'
                                  : 'Read. Approve runs this lookup only.'}
                            </p>
                            {row.detail ? <p className="mt-0.5 text-[11px] text-amber-200/90">{row.detail}</p> : null}
                            {rowMissing.length > 0 ? (
                              <p className="mt-1 text-red-300">Missing: {rowMissing.join(', ')}</p>
                            ) : null}
                            {editing ? (
                              <div className="mt-1">
                                <textarea
                                  value={approvalEditDraft}
                                  onChange={(e) => setApprovalEditDraft(e.target.value)}
                                  rows={6}
                                  spellCheck={false}
                                  aria-label={`Edit payload for ${row.label}`}
                                  className="w-full rounded border border-amber-800/70 bg-gray-950 p-2 font-mono text-[10px] leading-snug text-amber-50"
                                />
                                {approvalEditError ? <p className="mt-1 text-red-300">{approvalEditError}</p> : null}
                                <button
                                  type="button"
                                  onClick={() => saveApprovalEdit(row)}
                                  className="mt-1 rounded bg-amber-500 px-2 py-1 text-[10px] font-semibold text-black hover:bg-amber-400"
                                >
                                  Save edit
                                </button>
                              </div>
                            ) : null}
                            <div className="mt-2 flex flex-wrap gap-1">
                              <button
                                type="button"
                                onClick={() => (editing ? setApprovalEditId(null) : beginApprovalEdit(row))}
                                className="rounded border border-amber-600/60 px-2 py-1 text-[10px] font-medium text-amber-100 hover:bg-amber-950/60"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => dropApprovalRow(row)}
                                className="rounded border border-amber-600/60 px-2 py-1 text-[10px] font-medium text-amber-100 hover:bg-amber-950/60"
                              >
                                Drop
                              </button>
                              <button
                                type="button"
                                onClick={() => void approveApprovalRow(row)}
                                disabled={sending || rowMissing.length > 0}
                                className="rounded bg-amber-500 px-2 py-1 text-[10px] font-semibold text-black hover:bg-amber-400 disabled:opacity-60"
                              >
                                Approve
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </>
                  )
                })()}
              </div>
            )}

            {preflightSuggestion && (
              <div className="relative border-t border-blue-700/60 bg-blue-950/40 px-3 py-2 pr-9 text-xs text-blue-200">
                <button
                  type="button"
                  onClick={() => setPreflightSuggestion(null)}
                  className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded text-blue-300/80 hover:bg-blue-900/50 hover:text-blue-50"
                  aria-label="Dismiss preflight guidance"
                  title="Dismiss preflight guidance"
                >
                  <span className="text-base leading-none" aria-hidden>
                    ×
                  </span>
                </button>
                <p className="font-semibold">Preflight guidance</p>
                <p>
                  Missing fields for {preflightSuggestion.tool}: {preflightSuggestion.missingRequiredFields.join(', ')}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setInput(
                      `/exec ${preflightSuggestion.tool} ${JSON.stringify(preflightSuggestion.suggestedPayload)}`
                    )
                  }
                  className="mt-2 rounded bg-blue-500 px-2 py-1 font-semibold text-black hover:bg-blue-400"
                >
                  Insert suggested command
                </button>
              </div>
            )}

            <form
              onSubmit={onSubmit}
              className={`shrink-0 border-t border-gray-800 p-3 transition-colors ${
                fileDragDepth > 0 ? 'bg-purple-950/40 ring-1 ring-inset ring-purple-500/60' : ''
              }`}
              onDragEnter={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (enabled) setFileDragDepth((d) => d + 1)
              }}
              onDragLeave={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (enabled) setFileDragDepth((d) => Math.max(0, d - 1))
              }}
              onDragOver={(e) => {
                e.preventDefault()
                e.stopPropagation()
              }}
              onDrop={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setFileDragDepth(0)
                if (!enabled) return
                const offset = composerRef.current?.offsetFromPoint(e.clientX, e.clientY) ?? null
                const { files } = e.dataTransfer
                if (files?.length) {
                  void ingestFiles(Array.from(files), offset)
                  return
                }
                const urls = linksFromDrop({
                  uriList: e.dataTransfer.getData('text/uri-list'),
                  plain: e.dataTransfer.getData('text/plain'),
                  moz: e.dataTransfer.getData('text/x-moz-url'),
                })
                if (urls.length) insertLinks(urls, offset)
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                aria-label="Attach text or audio files to the assistant"
                accept=".txt,.md,.markdown,.json,.csv,.tsv,.log,.yaml,.yml,.xml,.html,.css,.sql,audio/*,.mp3,.wav,.m4a,.webm,.ogg,.aac,.flac"
                onChange={(e) => {
                  const list = e.target.files
                  if (list?.length) void ingestFiles(Array.from(list))
                  e.target.value = ''
                }}
              />
              {skillShiftNotice ? (
                <div className="relative mb-2 rounded-lg border border-amber-700/50 bg-amber-950/40 px-2.5 py-2 pr-8 text-[11px] text-amber-100">
                  <button
                    type="button"
                    onClick={dismissSkillShiftNotice}
                    className="absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded text-amber-200/80 hover:bg-amber-900/60"
                    aria-label="Dismiss context shift notice"
                  >
                    <span className="text-base leading-none" aria-hidden>
                      ×
                    </span>
                  </button>
                  <p className="font-semibold text-amber-50">Skill context shifted</p>
                  <p className="mt-0.5 text-amber-100/95">
                    {skillShiftNotice.fromName} → {skillShiftNotice.toName}. Use Mode to lock an agent if you want to stay pinned.
                  </p>
                </div>
              ) : null}
              {anchorsPanelOpen ? (
              <div className="mb-2 space-y-2 rounded-lg border border-gray-800/80 bg-gray-900/40 px-2 py-2" data-testid="admin-ai-anchors">
                <p className="text-[10px] leading-snug text-gray-400">
                  <span className="font-semibold uppercase tracking-wide text-gray-500">Anchors</span>
                  {' '}
                  Pin up to three facts this chat should keep. Filled slots go with every message. Click a suggestion to fill the first empty slot.
                </p>
                {anchorIdeas.length > 0 ? (
                  <div className="flex flex-wrap gap-1" data-testid="admin-ai-anchor-suggestions">
                    {anchorIdeas.map((idea) => (
                      <button
                        key={`${idea.reason}:${idea.text}`}
                        type="button"
                        disabled={!enabled || sending || anchors.every((anchor) => anchor.trim())}
                        onClick={() => applyAnchorSuggestion(idea.text)}
                        className="max-w-full truncate rounded-full border border-gray-600 bg-gray-950/80 px-2 py-0.5 text-left text-[10px] text-gray-200 hover:bg-gray-800 disabled:opacity-40"
                        title={anchors.every((anchor) => anchor.trim()) ? 'Clear a slot to pin another fact' : idea.text}
                      >
                        <span className="text-gray-500">{idea.reason}</span> {idea.text.length > 56 ? `${idea.text.slice(0, 54)}…` : idea.text}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-gray-500">
                    Suggestions appear from the release, codes, desk, and the latest reply. You can also type a fact into a slot.
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-1.5">
                  {([0, 1, 2] as const).map((i) => (
                    <input
                      key={i}
                      type="text"
                      value={anchors[i]}
                      onChange={(e) => setAnchorSlot(i, e.target.value)}
                      disabled={!enabled || sending}
                      placeholder={i === 0 ? 'Release or rule' : i === 1 ? 'Code or date' : 'Next fact'}
                      aria-label={`Pinned fact ${i + 1}`}
                      className="min-w-[5.5rem] max-w-[180px] flex-1 rounded border border-gray-700 bg-gray-950 px-2 py-1 text-[11px] text-gray-200 placeholder:text-gray-600"
                    />
                  ))}
                  <button
                    type="button"
                    disabled={!enabled || sending || !anchors.some((a) => a.trim())}
                    onClick={() => {
                      const parts = anchors.map((a) => a.trim()).filter(Boolean)
                      if (!parts.length) return
                      const block = parts.join('\n')
                      setInput((prev) => (prev.trim() ? `${block}\n${prev}` : block))
                    }}
                    className="rounded border border-gray-600 bg-gray-800 px-2 py-1 text-[10px] font-medium text-gray-200 hover:bg-gray-700 disabled:opacity-40"
                    title="Also paste the pinned facts into the composer so you can edit them before sending"
                  >
                    Add to message
                  </button>
                </div>
                {attachments.some((a) => a.kind === 'audio') ? (
                  <p className="text-[10px] leading-snug text-gray-500">
                    Clip-to-strategy: transcription is not wired yet. Paste a transcript into an anchor or send it as a
                    free-form message so the model can use it.
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={!enabled}
                    onClick={() => setExplainOpen((o) => !o)}
                    className="rounded border border-purple-600/50 bg-purple-950/40 px-2 py-1 text-[10px] font-medium text-purple-200 hover:bg-purple-900/50 disabled:opacity-40"
                  >
                    {explainOpen ? 'Hide' : 'Explain'} last reply
                  </button>
                  {lastRunFingerprint ? (
                    <span className="font-mono text-[10px] text-gray-500" title="Run fingerprint (support / logs)">
                      {lastRunFingerprint}
                    </span>
                  ) : null}
                </div>
                {explainOpen ? (
                  lastRoutingEcho ? (
                    <dl className="grid max-w-md grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px] text-gray-300">
                      <dt className="text-gray-500">Continuation-only</dt>
                      <dd>{lastRoutingEcho.continuationOnly ? 'Yes' : 'No'}</dd>
                      <dt className="text-gray-500">Sticky applied</dt>
                      <dd>{lastRoutingEcho.stickyPersonaApplied ? 'Yes' : 'No'}</dd>
                      <dt className="text-gray-500">Sticky dropped (stale)</dt>
                      <dd>{lastRoutingEcho.stickyDroppedStale ? 'Yes' : 'No'}</dd>
                      <dt className="text-gray-500">Prompt truncated</dt>
                      <dd>{lastRoutingEcho.promptTruncated ? 'Yes' : 'No'}</dd>
                      <dt className="text-gray-500">Sticky (effective)</dt>
                      <dd className="font-mono text-gray-400">{lastRoutingEcho.stickySkillId ?? '—'}</dd>
                      <dt className="text-gray-500">Sticky requested</dt>
                      <dd className="font-mono text-gray-400">{lastRoutingEcho.stickySkillRequested ?? '—'}</dd>
                    </dl>
                  ) : (
                    <p className="text-[11px] text-gray-500">Send a chat message to capture routing metadata.</p>
                  )
                ) : null}
              </div>
              ) : null}
              {fileDragDepth > 0 ? (
                <p className="mb-1 text-center text-[11px] font-medium text-purple-200">Drop files or links into the message</p>
              ) : null}
              {dictationPhase === 'recording' ? (
                <p className="mb-1 text-[11px] text-red-300">Listening… tap the mic again to transcribe.</p>
              ) : dictationPhase === 'transcribing' ? (
                <p className="mb-1 text-[11px] text-amber-200">Transcribing…</p>
              ) : speechError ? (
                <p className="mb-1 text-[11px] text-amber-300">{speechError}</p>
              ) : null}
              {pageCtx ? (
                <AdminAiStudioMissionStrip
                  docked
                  dock={missionDock}
                  onAction={handleMissionAction}
                  statusNote={
                    <ArmedPromptStack
                      prompts={armedPrompts ?? []}
                      onCancel={(id) =>
                        mergeIntoActive({
                          armedPrompts: (armedPrompts ?? []).map((row) =>
                            row.id === id ? { ...row, status: 'cancelled' as const } : row,
                          ),
                        })
                      }
                    />
                  }
                  releaseId={studioMissionReleaseId}
                  releaseTitle={pageCtx?.pageContext?.studio?.title}
                  activeStep={pageCtx?.pageContext?.studio?.activeStep}
                  refreshNonce={missionRefreshNonce}
                  disabled={!enabled || sending}
                  onMissionChange={(mission) => setMissionBlockerCount(mission?.blockers?.length ?? 0)}
                  onFixTopBlocker={(start) => void handleQuickStartPick(start)}
                  onOpenBlocker={applyStudioNav}
                  draftCopyLabel={
                    pageCtx?.pageContext?.studio?.activeStep === 'copy' ? 'Full copy runbook' : 'Draft copy'
                  }
                  onDraftCopy={() => {
                    const studio = pageCtx?.pageContext.studio
                    if (!studio?.releaseId) return
                    const prompt = getStudioStepAiPrompt('copy', studio.releaseId, studio.title)
                    setInput(prompt.message)
                  }}
                  onWeekPriorities={() =>
                    setInput(`/exec query_studio_command_center ${JSON.stringify({ dueWithinDays: 7 })}`)
                  }
                  onSnapshot={() => {
                    void (async () => {
                      setSending(true)
                      try {
                        setMessages((prev) => [
                          ...prev,
                          {
                            id: nextId(),
                            role: 'user',
                            content: `/exec query_release_studio_snapshot ${JSON.stringify({ releaseId: studioMissionReleaseId })}`,
                          },
                        ])
                        await runExecDryRun('query_release_studio_snapshot', {
                          releaseId: studioMissionReleaseId,
                        })
                      } finally {
                        setSending(false)
                      }
                    })()
                  }}
                  onHarness={() => {
                    void (async () => {
                      setSending(true)
                      try {
                        setMessages((prev) => [
                          ...prev,
                          {
                            id: nextId(),
                            role: 'user',
                            content: `/exec query_intelligence_harness ${JSON.stringify({
                              mode: 'stack',
                              releaseId: studioMissionReleaseId,
                              query: 'Sonic DNA unified intelligence Release Studio polymath',
                            })}`,
                          },
                        ])
                        await runExecDryRun('query_intelligence_harness', {
                          mode: 'stack',
                          releaseId: studioMissionReleaseId,
                          query: 'Sonic DNA unified intelligence Release Studio polymath',
                        })
                      } finally {
                        setSending(false)
                      }
                    })()
                  }}
                  onCopyDryRun={() => {
                    void (async () => {
                      if (!studioMissionReleaseId) return
                      setSending(true)
                      try {
                        applyStudioNav({ releaseId: studioMissionReleaseId, step: 'copy' })
                        setMessages((prev) => [
                          ...prev,
                          {
                            id: nextId(),
                            role: 'user',
                            content: `/exec patch_release_marketing_copy ${JSON.stringify({
                              releaseId: studioMissionReleaseId,
                              merge: true,
                              dryRun: true,
                              marketingCopy: {},
                            })}`,
                          },
                        ])
                        await runExecDryRun('patch_release_marketing_copy', {
                          releaseId: studioMissionReleaseId,
                          merge: true,
                          dryRun: true,
                          marketingCopy: {},
                        })
                      } finally {
                        setSending(false)
                      }
                    })()
                  }}
                  onOpenLaunch={() => {
                    if (!studioMissionReleaseId) return
                    applyStudioNav({ releaseId: studioMissionReleaseId, step: 'launch' })
                  }}
                />
              ) : isStudioSurface ? (
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    disabled={!enabled || sending}
                    className="rounded-full border border-gray-600 bg-gray-900 px-2.5 py-1 text-[10px] font-medium text-gray-300 hover:bg-gray-800 disabled:opacity-40"
                    title="Run Release Studio ops snapshot (one tap). Shift-click to paste /exec into the composer instead."
                    onClick={triggerStudioPipelineSnapshot}
                  >
                    Studio pipeline
                  </button>
                </div>
              ) : null}
              {activeSkill?.name || disabledTools.length > 0 ? (
                <div className="mb-2 -mt-1 text-center">
                  {activeSkill?.name ? (
                    <p className="truncate text-[10px] text-purple-300/90">Active skill: {activeSkill.name}</p>
                  ) : null}
                  {disabledTools.length > 0 ? (
                    <p className="truncate text-[10px] text-amber-300/90">Disabled: {disabledTools.join(', ')}</p>
                  ) : null}
                </div>
              ) : null}
              <div
                className={
                  focusCopilotEnabled && pageFocus
                    ? 'rounded-lg border border-violet-500/40 bg-gray-900 shadow-inner'
                    : ''
                }
              >
                {focusCopilotEnabled && pageFocus && setPageFocus ? (
                  <FieldCopilotPanel
                    focus={pageFocus}
                    enabled={enabled}
                    busy={sending}
                    onClear={() => setPageFocus(null)}
                    onFocusUpdate={setPageFocus}
                    attachedContext={attachedComposerContext()}
                    requestCopilot={async (prompt) => {
                      const result = await sendChatMessage(prompt, 'studio_release')
                      return { reply: result.reply }
                    }}
                  />
                ) : null}
                <AdminAiComposerField
                  ref={composerRef}
                  value={input}
                  chips={composerChipViews}
                  disabled={!enabled}
                  framed={!(focusCopilotEnabled && pageFocus)}
                  onChange={setInput}
                  onRemoveChip={removeComposerChip}
                  suggestion={composerSuggestion}
                  placeholder={
                    !enabled
                      ? 'Toggle AI ON to start'
                      : focusCopilotEnabled && pageFocus
                        ? `Draft ${pageFocus.fieldLabel} · or type a message`
                        : focusCopilotEnabled
                          ? 'Click a field to draft it here · or type a message'
                          : 'Type · @release · /plan · /exec · drop files'
                  }
                />
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">{composerToggles}</div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1 text-[11px] text-gray-400">
                    Mode
                    <select
                      value={agentMode}
                      onChange={(e) => setAgentMode(e.target.value as AgentModeChoice)}
                      disabled={!enabled}
                      className="max-w-[min(220px,38vw)] min-w-[9.5rem] rounded border border-gray-700 bg-gray-950 px-1.5 py-1 text-[11px] text-gray-200"
                      title="Behaviors: Auto (detect /plan and /exec, Agent tools on), Chat (no tools), Plan (runbook from text). Agents: lock persona and planning to a registered admin skill."
                    >
                      <optgroup label="Behaviors">
                        <option value="auto">Auto</option>
                        <option value="chat">Chat</option>
                        <option value="plan">Plan</option>
                      </optgroup>
                      <optgroup label="Agents">
                        {AGENT_SKILL_MODES.map((id) => (
                          <option key={id} value={id}>
                            {skills.find((s) => s.id === id)?.name ?? id}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                    {agentMode === 'chat' ? (
                      <span
                        className="max-w-[14rem] text-[10px] leading-tight text-amber-300/90"
                        title="Chat mode skips Agent tools, live desk probes, and /exec detection. Switch to Auto to look things up."
                      >
                        Tools off — switch to Auto to look up desks and releases
                      </span>
                    ) : null}
                  </label>
                  <div ref={chatSettingsMenuRef} className="relative">
                    <button
                      type="button"
                      id="admin-ai-chat-settings-trigger"
                      aria-expanded={chatSettingsMenuOpen}
                      aria-haspopup="dialog"
                      aria-controls="admin-ai-chat-settings-menu"
                      disabled={!enabled}
                      onClick={() => setChatSettingsMenuOpen((o) => !o)}
                      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border text-gray-300 transition-colors hover:text-white disabled:opacity-40 ${
                        chatSettingsMenuOpen
                          ? 'border-purple-500/60 bg-purple-950/50 text-purple-100'
                          : 'border-gray-700 bg-gray-950 hover:border-gray-600 hover:bg-gray-900'
                      }`}
                      title="Model, honesty, and energy"
                    >
                      <LuSettings2 className="h-4 w-4" aria-hidden />
                      <span className="sr-only">Chat settings</span>
                    </button>
                    {chatSettingsMenuOpen ? (
                      <div
                        id="admin-ai-chat-settings-menu"
                        role="dialog"
                        aria-label="Chat settings"
                        className="absolute bottom-full left-0 z-[120] mb-1.5 w-[min(17.5rem,calc(100vw-1.25rem))] rounded-lg border border-gray-800/90 bg-gray-950/98 p-2.5 shadow-2xl ring-1 ring-black/50 backdrop-blur-md"
                      >
                        <div className="space-y-2.5">
                          <div className="flex items-center gap-2">
                            <span className="w-14 shrink-0 text-[11px] text-gray-500">LLM</span>
                            <select
                              value={chatProvider}
                              onChange={(e) => {
                                const next = e.target.value as ChatProviderChoice
                                chatProviderTouchedRef.current = true
                                setChatProvider(next)
                                try {
                                  window.localStorage.setItem(ADMIN_AI_LLM_LS, next)
                                } catch {
                                  /* keep the in-memory choice */
                                }
                                void adminAiFetch('/api/admin/ai/settings', {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ preferences: { assistantDefaultLlm: next } }),
                                }).catch(() => {})
                              }}
                              disabled={!enabled}
                              className="min-w-0 flex-1 rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-[11px] text-gray-100"
                              title="This model runs the turn and can probe every agent and tool"
                            >
                              <option value="auto">Auto</option>
                              {(['anthropic', 'openai', 'ollama', 'crowelogic', 'cursor'] as const).map((id) => {
                                const ok =
                                  !providerCatalog.length ||
                                  id === 'ollama' ||
                                  Boolean(providerCatalog.find((p) => p.id === id)?.configured)
                                return (
                                  <option key={id} value={id} disabled={!ok}>
                                    {id}
                                    {!ok ? ' (off)' : ''}
                                  </option>
                                )
                              })}
                            </select>
                          </div>
                          <p className="text-[10px] leading-snug text-gray-500">
                            This model runs the turn. Every agent and tool is a harness it can probe.
                          </p>
                          <div className="flex items-center gap-2">
                            <span className="w-14 shrink-0 text-[11px] text-gray-500">Energy</span>
                            <select
                              value={energyPreset}
                              onChange={(e) => setEnergyPreset(e.target.value as AdminChatEnergyPreset)}
                              disabled={!enabled}
                              className="min-w-0 flex-1 rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-[11px] text-gray-100"
                              title="Tuning for checklist density and tone."
                            >
                              <option value="default">Default</option>
                              <option value="tour_prep">Tour prep</option>
                              <option value="studio_week">Studio week</option>
                              <option value="launch_day">Launch day</option>
                            </select>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="w-14 shrink-0 text-[11px] text-gray-500">Honesty</span>
                            <select
                              value={honestyMode}
                              onChange={(e) => setHonestyMode(e.target.value as AdminChatHonestyMode)}
                              disabled={!enabled}
                              className="min-w-0 flex-1 rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-[11px] text-gray-100"
                              title="Strict: no invented metrics. Relaxed: speculative ideas only when you ask, clearly labeled."
                            >
                              <option value="strict">Strict</option>
                              <option value="relaxed">Relaxed</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <AdminAiElementPickerButton
                    disabled={!enabled}
                    onPick={(pick) => {
                      insertElementPick(pick)
                    }}
                  />
                  <button
                    type="button"
                    aria-label="Attach files"
                    title="Attach files"
                    disabled={!enabled || attachmentsBusy}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex h-8 w-8 items-center justify-center rounded border border-gray-600 bg-gray-900 text-gray-200 hover:bg-gray-800 disabled:opacity-40"
                  >
                    <IconAttach />
                  </button>
                  <button
                    type="button"
                    aria-label={
                      dictationPhase === 'recording'
                        ? 'Stop talk to text'
                        : dictationPhase === 'transcribing'
                          ? 'Transcribing'
                          : 'Talk to text'
                    }
                    aria-pressed={dictationPhase === 'recording'}
                    disabled={!enabled || dictationPhase === 'transcribing'}
                    onClick={() => void toggleDictation()}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded border disabled:opacity-40 ${
                      dictationPhase === 'recording'
                        ? 'border-red-700 bg-red-950/60 text-red-200'
                        : 'border-gray-600 bg-gray-900 text-gray-200 hover:bg-gray-800'
                    }`}
                    title={
                      dictationPhase === 'recording'
                        ? 'Stop and transcribe'
                        : dictationPhase === 'transcribing'
                          ? 'Transcribing…'
                          : 'Talk to text'
                    }
                  >
                    <IconMic />
                  </button>
                  <button
                    type="submit"
                    aria-label={sending ? 'Sending' : attachmentsBusy ? 'Reading attachments' : 'Send message'}
                    disabled={!canSend}
                    className="inline-flex h-8 w-8 items-center justify-center rounded bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-50"
                    title={sending ? 'Sending…' : attachmentsBusy ? 'Reading…' : 'Send'}
                  >
                    <IconSend />
                  </button>
                </div>
              </div>
            </form>
              </div>

              {(isStandalone && browserPaneOpen) || (dockLeftLayout && dockBrowserWorkspace) ? dockBrowserPane : null}
            </div>
          </div>
    )
  }

  const fabButton = (
        <button
          type="button"
          onClick={handleAdminAiFabClick}
          className={`inline-flex h-11 w-11 items-center justify-center rounded-full border shadow-lg backdrop-blur-sm transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-status-info ${
            !enabled
              ? 'border-gray-700 bg-gray-900/95 text-gray-500 hover:border-gray-600 hover:text-gray-300'
              : open
                ? 'border-status-info/60 bg-status-info/25 text-status-info ring-2 ring-status-info/40'
                : 'border-status-info/40 bg-status-info/15 text-status-info hover:bg-status-info/25'
          }`}
          aria-label={
            !enabled
              ? 'Turn on Admin AI and open assistant'
              : open
                ? 'Close Admin AI assistant'
                : 'Open Admin AI assistant'
          }
          title={
            !enabled
              ? 'Open Admin AI (currently off). Shift+click to turn on without opening.'
              : open
                ? 'Close Admin AI. Shift+click to turn AI off.'
                : 'Open Admin AI. Shift+click to turn AI off.'
          }
        >
          <span
            aria-hidden
            className="text-[15px] leading-none tracking-wide"
            style={{ fontFamily: 'Orbitron, sans-serif', fontWeight: 700 }}
          >
            AI
          </span>
        </button>
  )

  const floatingUi = (
    <>
      {!isStandalone && !(dockEdgeLayout && open)
        ? fabAnchor
          ? createPortal(fabButton, fabAnchor)
          : (
            <div className="fixed z-[11000] max-md:left-4 max-md:top-[3.75rem] md:left-[calc(var(--shell-nav-width)+1rem)] md:top-4">
              {fabButton}
            </div>
          )
        : null}

      {(isStandalone || (enabled && open)) &&
        (isStandalone ? (
        <div className="fixed inset-0 z-[11000] box-border flex flex-col bg-neutral-950 p-3">
          <div
            ref={panelRef}
            data-admin-ai-panel
            className="flex min-h-0 flex-1 flex-col overflow-hidden overscroll-contain rounded-xl border border-gray-700 bg-gray-950 shadow-2xl"
          >
            {renderAssistantInterior()}
          </div>
        </div>
      ) : (
        <div
          ref={panelRef}
          data-admin-ai-panel
          className={`fixed z-[11000] flex flex-col overflow-hidden overscroll-contain border border-gray-700 bg-gray-950 shadow-2xl ${
            dockRightLayout
              ? 'rounded-l-xl rounded-r-none border-r-0'
              : dockLeftLayout
                ? 'left-0 rounded-r-xl rounded-l-none border-l-0 md:left-[var(--shell-nav-width,14rem)]'
                : `rounded-xl ${panelSize ? '' : 'h-[70vh] w-[min(420px,calc(100vw-2rem))]'}`
          } ${isResizing ? 'select-none' : ''}`}
          style={
            dockRightLayout
              ? {
                  left: 'auto',
                  right: 0,
                  top: PANEL_PAD,
                  bottom: `calc(${PANEL_PAD}px + var(--global-music-player-height, 0px))`,
                  width: dockBrowserBeside
                    ? 'calc(100vw - var(--shell-nav-width, 14rem) - 12px)'
                    : panelSize?.w ??
                      (typeof window !== 'undefined'
                        ? Math.min(
                            DOCK_PANEL_MAX_W,
                            Math.min(420, window.innerWidth - PANEL_PAD * 2)
                          )
                        : 420),
                }
              : dockLeftLayout
                ? {
                    right: 'auto',
                    top: PANEL_PAD,
                    bottom: `calc(${PANEL_PAD}px + var(--global-music-player-height, 0px))`,
                    width: dockBrowserBeside
                      ? 'calc(100vw - var(--shell-nav-width, 14rem) - 12px)'
                      : panelSize?.w ??
                        (typeof window !== 'undefined'
                          ? Math.min(
                              DOCK_PANEL_MAX_W,
                              Math.min(420, window.innerWidth - PANEL_PAD * 2)
                            )
                          : 420),
                  }
              : {
                  left: position?.x ?? 16,
                  top: position?.y ?? 24,
                  ...(panelSize ? { width: panelSize.w, height: panelSize.h } : undefined),
                }
          }
        >
          {renderAssistantInterior()}
          {dockBrowserBeside ? null : dockRightLayout ? (
            <div
              className="pointer-events-auto absolute inset-y-0 left-0 z-[62] w-3 cursor-ew-resize touch-none border-l border-gray-600/80 bg-gradient-to-r from-gray-800/95 to-transparent shadow-[2px_0_8px_rgba(0,0,0,0.35)] hover:border-purple-500/50 hover:from-purple-950/35"
              onPointerDown={(e) => startResize(e, 'w')}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize assistant panel"
            />
          ) : dockLeftLayout ? (
            <div
              className="pointer-events-auto absolute inset-y-0 right-0 z-[62] w-3 cursor-ew-resize touch-none border-r border-gray-600/80 bg-gradient-to-l from-gray-800/95 to-transparent shadow-[-2px_0_8px_rgba(0,0,0,0.35)] hover:border-purple-500/50 hover:from-purple-950/35"
              onPointerDown={(e) => startResize(e, 'e')}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize assistant panel"
            />
          ) : (
            <div className="pointer-events-none absolute inset-0 z-[60]" aria-hidden>
              {/* Edges inset so corners use corner grips */}
              <div
                className="pointer-events-auto absolute left-10 right-10 top-0 z-[61] h-2 cursor-ns-resize touch-none hover:bg-white/5"
                onPointerDown={(e) => startResize(e, 'n')}
              />
              <div
                className="pointer-events-auto absolute bottom-0 left-10 right-10 z-[61] h-2 cursor-ns-resize touch-none hover:bg-white/5"
                onPointerDown={(e) => startResize(e, 's')}
              />
              <div
                className="pointer-events-auto absolute bottom-10 left-0 top-10 z-[61] w-2 cursor-ew-resize touch-none hover:bg-white/5"
                onPointerDown={(e) => startResize(e, 'w')}
              />
              <div
                className="pointer-events-auto absolute bottom-10 right-0 top-10 z-[61] w-2 cursor-ew-resize touch-none hover:bg-white/5"
                onPointerDown={(e) => startResize(e, 'e')}
              />
              <div
                className="pointer-events-auto absolute left-0 top-0 z-[62] h-4 w-4 cursor-nwse-resize touch-none hover:bg-white/5"
                onPointerDown={(e) => startResize(e, 'nw')}
              />
              <div
                className="pointer-events-auto absolute right-0 top-0 z-[62] h-4 w-4 cursor-nesw-resize touch-none hover:bg-white/5"
                onPointerDown={(e) => startResize(e, 'ne')}
              />
              <div
                className="pointer-events-auto absolute bottom-0 left-0 z-[62] h-4 w-4 cursor-nesw-resize touch-none hover:bg-white/5"
                onPointerDown={(e) => startResize(e, 'sw')}
              />
              <div
                className="pointer-events-auto absolute bottom-0 right-0 z-[62] h-4 w-4 cursor-nwse-resize touch-none hover:bg-white/5"
                onPointerDown={(e) => startResize(e, 'se')}
              />
            </div>
          )}
        </div>
      ))}

      {tabMenu ? (
        <div
          data-admin-ai-tab-menu
          role="menu"
          aria-label="Chat tab actions"
          className="fixed z-[12050] min-w-[14rem] overflow-hidden rounded-lg border border-gray-600 bg-gray-900 text-sm shadow-2xl"
          style={{
            left: Math.min(tabMenu.x, (typeof window !== 'undefined' ? window.innerWidth : 800) - 230),
            top: Math.min(tabMenu.y, (typeof window !== 'undefined' ? window.innerHeight : 600) - 160),
          }}
        >
          {(() => {
            const session = sessions.find((row) => row.id === tabMenu.sessionId)
            if (!session) return null
            const releaseId = studioMissionReleaseId
            const releaseTitle = studioReleaseTitle || 'this release'
            const attached = Boolean(releaseId && (session.attachedReleaseIds ?? []).includes(releaseId))
            return (
              <div className="py-1">
                <button
                  type="button"
                  role="menuitem"
                  disabled={!releaseId}
                  className="flex w-full flex-col items-start px-3 py-2 text-left text-xs text-gray-200 hover:bg-gray-800 disabled:cursor-not-allowed disabled:text-gray-500"
                  onClick={() => {
                    if (!releaseId) return
                    setSessionReleaseAttachment(session.id, releaseId, studioReleaseTitle ?? null, !attached)
                    setTabMenu(null)
                  }}
                >
                  <span>{attached ? `Detach from ${releaseTitle}` : `Attach to ${releaseTitle}`}</span>
                  <span className="text-[10px] text-gray-500">
                    {releaseId ? 'Keep this chat on the release' : 'Open a release in Studio first'}
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center px-3 py-2 text-left text-xs text-gray-200 hover:bg-gray-800"
                  onClick={() => {
                    void navigator.clipboard?.writeText(session.title)
                    setTabMenu(null)
                  }}
                >
                  Copy chat title
                </button>
                {sessions.length > 1 ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center px-3 py-2 text-left text-xs text-red-200 hover:bg-red-950/50"
                    onClick={() => {
                      removeSession(session.id)
                      setTabMenu(null)
                    }}
                  >
                    Close tab
                  </button>
                ) : null}
              </div>
            )
          })()}
        </div>
      ) : null}

      {gripDockMenu && !isStandalone ? (
        <div
          ref={gripDockMenuClamp.ref}
          {...gripDockMenuClamp.rootProps}
          role="menu"
          className="fixed min-w-[12.5rem] overflow-y-auto rounded-lg border border-gray-600 bg-gray-900 text-sm shadow-2xl"
          style={gripDockMenuClamp.style}
        >
          <PopupMenuDragHeader title="Dock mode" headerProps={gripDockMenuClamp.headerProps} />
          <div className="py-1">
          <button
            type="button"
            role="menuitem"
            className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-xs hover:bg-gray-800 ${dockMode === 'floating' ? 'bg-gray-800/80 text-purple-200' : 'text-gray-200'}`}
            onClick={() => applyDockFloating()}
          >
            <span>Floating</span>
            <span className="text-[10px] text-gray-500">Move anywhere · drag grip</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className={`flex w-full flex-col items-start px-3 py-2 text-left text-xs hover:bg-gray-800 ${dockMode === 'dock-left' ? 'bg-gray-800/80 text-purple-200' : 'text-gray-200'}`}
            onClick={() => applyDockWorkspaceLeft()}
          >
            Dock to workspace left
            <span className="text-[10px] text-gray-500">Full-height strip after sidebar</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className={`flex w-full flex-col items-start px-3 py-2 text-left text-xs hover:bg-gray-800 ${dockMode === 'dock-right' ? 'bg-gray-800/80 text-purple-200' : 'text-gray-200'}`}
            onClick={() => applyDockWorkspaceRight()}
          >
            Dock to workspace right
            <span className="text-[10px] text-gray-500">Full-height strip, flush right</span>
          </button>
          </div>
        </div>
      ) : null}
    </>
  )

  if (typeof document === 'undefined' || !portalReady) {
    return null
  }

  return createPortal(floatingUi, document.body)
}
