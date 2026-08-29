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
import { LuBrainCircuit, LuSettings2 } from 'react-icons/lu'
import { ADMIN_AI_FAB_ANCHOR_ID } from '@/components/shell/AppShell'
import { useAdminAiPageContextOptional } from '@/contexts/AdminAiPageContext'
import type { AdminAiPageContext } from '@/lib/ai/admin-ai-page-context'
import type { AdminChatRoutingEcho } from '@/lib/ai/admin-chat-guards'
import { STICKY_SKILL_CLIENT_TTL_MS } from '@/lib/ai/admin-chat-guards'
import type { AdminChatEnergyPreset, AdminChatHonestyMode } from '@/lib/ai/admin-chat-session-tuning'
import { isContinuationOnlyUserMessage } from '@/lib/ai/chat-skill-context'
import { suggestAnchorSnippetsFromUserText } from '@/lib/admin-ai-anchor-suggestions'
import { shallowPayloadDiffLines } from '@/lib/admin-ai-exec-preview-diff'
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
import { sameOriginApiUrl } from '@/lib/same-origin-api'
import { AdminAssistantRichText, AdminChatPlainText } from '@/components/AdminChatMessageContent'

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
  | 'create_distribution_release_draft'

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
  results?: Array<{ stepId: string; tool: ExecuteTool; output: Record<string, unknown> }>
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

type ChatProviderChoice = 'auto' | 'anthropic' | 'openai' | 'ollama' | 'crowelogic'

const AGENT_SKILL_MODES = [
  'release_ops',
  'product_strategy',
  'growth_marketing',
  'smartlink_seo',
  'e2e_qa',
  'mac_automation',
  'admin_intel',
  'studio_release',
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

function mergeStrategyPackRefinePayload(steps: PlanStep[], prefer: boolean): PlanStep[] {
  if (!prefer) return steps
  return steps.map((step) =>
    step.tool === 'draft_product_strategy_pack' ?
      { ...step, payload: { ...step.payload, refineWithLlm: true } }
    : step
  )
}

/** Force LLM polish on/off for strategy pack steps (e.g. regenerate preview). */
function applyStrategyPackPreviewMode(steps: PlanStep[], mode: 'polish' | 'deterministic'): PlanStep[] {
  return steps.map((step) => {
    if (step.tool !== 'draft_product_strategy_pack') return step
    const payload = { ...step.payload }
    if (mode === 'polish') {
      payload.refineWithLlm = true
    } else {
      delete payload.refineWithLlm
    }
    return { ...step, payload }
  })
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
      'Strategy pack preview — structured sections below. Approve when ready. (LLM polish runs on preview only when the checkbox is enabled.)',
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

const DEFAULT_ASSISTANT_INTRO =
  'How can I help? `/exec <tool> {<json>}` runs tools (example: `/exec query_ops_snapshot {"focus":"studio"}`). Plan → Preview → Approve for runbooks. Also: `/plan …`, attach files, mic. Strategy pack `draft_product_strategy_pack`; ops `query_ops_snapshot`; checklist `create_release_checklist`; studio `create_distribution_release_draft`; smartlink UTM; E2E; AppleScript. Agents: **product_strategy**, **growth_marketing**, **studio_release**, **admin_intel**, etc.'

const STUDIO_ASSISTANT_INTRO =
  'Release Studio copilot — I see the release you have open. Ask what is blocking go-live, draft copy, or run `/exec query_release_studio_snapshot` for a live snapshot. Use agent mode **studio_release** for drafts and readiness.'

const ADMIN_AI_SESSIONS_KEY = 'admin-ai-chat-sessions-v1'
const ADMIN_AI_HONESTY_LS = 'admin-ai-honesty-v1'
const ADMIN_AI_ENERGY_LS = 'admin-ai-energy-v1'
const ADMIN_AI_ANCHORS_PANEL_LS = 'admin-ai-anchors-panel-v1'
const ADMIN_AI_DOCK_MODE_KEY = 'admin-ai-dock-mode-v2'
const ADMIN_AI_DOCK_WIDTH_KEY = 'admin-ai-dock-width-v1'
const DOCK_PANEL_MAX_W = 720
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
  /** When true, strategy pack previews merge refineWithLlm into payloads (LLM polish on dry-run). */
  preferStrategyPackRefine: boolean
}

function createMessageId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function createEmptySession(id: string): AdminChatSession {
  return {
    id,
    title: 'New chat',
    updatedAt: Date.now(),
    messages: [{ id: createMessageId(), role: 'assistant', content: DEFAULT_ASSISTANT_INTRO }],
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
    preferStrategyPackRefine: false,
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
    toolRaw !== 'create_distribution_release_draft'
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

/** LLM polish for strategy pack dry-run previews (same state as former checkbox). */
function StrategyPackPolishToggle({
  on,
  onToggle,
  disabled,
}: {
  on: boolean
  onToggle: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      role="switch"
      aria-checked={on ? 'true' : 'false'}
      aria-label={`Strategy pack LLM polish on previews ${on ? 'on' : 'off'}`}
      title="When on, draft_product_strategy_pack /exec previews use your configured chat provider for LLM polish (dry-run only)."
      className={`rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors disabled:opacity-40 ${
        on
          ? 'border-amber-500/45 bg-amber-950/55 text-amber-100 hover:bg-amber-900/45'
          : 'border-gray-600 bg-gray-900 text-gray-400 hover:bg-gray-800 hover:text-gray-200'
      }`}
      onClick={onToggle}
    >
      Pack polish {on ? 'On' : 'Off'}
    </button>
  )
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

  const [sending, setSending] = useState(false)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const [panelSize, setPanelSize] = useState<{ w: number; h: number } | null>(null)
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
  const [agentMode, setAgentMode] = useState<AgentModeChoice>('auto')
  const [providerCatalog, setProviderCatalog] = useState<Array<{ id: string; configured: boolean }>>([])
  const [fileDragDepth, setFileDragDepth] = useState(0)
  const [isListening, setIsListening] = useState(false)
  const [speechError, setSpeechError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const [honestyMode, setHonestyMode] = useState<AdminChatHonestyMode>('strict')
  const [energyPreset, setEnergyPreset] = useState<AdminChatEnergyPreset>('default')
  const [explainOpen, setExplainOpen] = useState(false)
  const assistantPrefsLoaded = useRef(false)
  const anchorsPanelLoaded = useRef(false)
  const [anchorsPanelOpen, setAnchorsPanelOpen] = useState(false)
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
    anchorSuggestions,
    preferStrategyPackRefine,
  } = activeSession

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

  const startNewChat = useCallback(() => {
    const id = createMessageId()
    setSessions((prev) => {
      if (prev.length >= MAX_CHAT_SESSIONS) {
        const dropId = [...prev].sort((a, b) => a.updatedAt - b.updatedAt)[0]!.id
        return [...prev.filter((s) => s.id !== dropId), createEmptySession(id)]
      }
      return [...prev, createEmptySession(id)]
    })
    setActiveSessionId(id)
    setShowSessionHistory(false)
  }, [])

  const removeSession = useCallback((id: string) => {
    setSessions((prev) => (prev.length <= 1 ? prev : prev.filter((s) => s.id !== id)))
  }, [])

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
            messages: Array.isArray(s.messages) && s.messages.length > 0 ? s.messages : createEmptySession(s.id).messages,
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
            input: s.input ?? '',
            attachments: [],
            preferStrategyPackRefine: Boolean(s.preferStrategyPackRefine),
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
    if (typeof window === 'undefined') return
    if (!assistantPrefsLoaded.current) {
      try {
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
              messages: s.messages.slice(-MAX_PERSISTED_MESSAGES_PER_SESSION),
            })),
          })
        )
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
      const detail = (event as CustomEvent<{ message?: string; agentMode?: string }>).detail
      setEnabled(true)
      setOpen(true)
      if (
        detail?.agentMode === 'studio_release' ||
        detail?.agentMode === 'growth_marketing' ||
        detail?.agentMode === 'product_strategy'
      ) {
        setAgentMode(detail.agentMode)
      }
      if (typeof detail?.message === 'string' && detail.message.trim()) {
        setInput(detail.message.trim())
      }
    }

    window.addEventListener('admin-ai:toggle', onToggle as EventListener)
    window.addEventListener('admin-ai:open', onOpen as EventListener)
    function onApplyField(event: Event) {
      const detail = (event as CustomEvent<{ fieldId?: string; value?: string }>).detail
      if (!detail?.fieldId || typeof detail.value !== 'string') return
      applyFieldValue(detail.fieldId, detail.value)
    }

    window.addEventListener('admin-ai:prompt', onPrompt as EventListener)
    window.addEventListener('admin-ai:apply-field', onApplyField as EventListener)

    return () => {
      window.removeEventListener('admin-ai:toggle', onToggle as EventListener)
      window.removeEventListener('admin-ai:open', onOpen as EventListener)
      window.removeEventListener('admin-ai:prompt', onPrompt as EventListener)
      window.removeEventListener('admin-ai:apply-field', onApplyField as EventListener)
    }
  }, [])

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
          'query_release_studio_snapshot',
          'query_studio_command_center',
          'patch_release_marketing_copy',
          'update_copyright_checklist',
          'assign_isrcs',
        ]
        setDisabledTools(dt.filter((t): t is ExecuteTool => known.includes(t as ExecuteTool)))
      } catch {
        setSkills([])
      }
    }

    if (enabled) {
      void loadSkills()
    }
  }, [enabled])

  useEffect(() => {
    async function loadChatProviders() {
      try {
        const response = await adminAiFetch('/api/admin/ai/chat/providers')
        if (!response.ok) return
        const body = (await response.json().catch(() => ({}))) as ChatProvidersApi
        if (Array.isArray(body.providers)) {
          setProviderCatalog(body.providers)
        }
        if (body.assistantDefaultLlm === 'auto' || body.assistantDefaultLlm === 'anthropic' || body.assistantDefaultLlm === 'openai' || body.assistantDefaultLlm === 'ollama' || body.assistantDefaultLlm === 'crowelogic') {
          setChatProvider(body.assistantDefaultLlm)
        }
      } catch {
        setProviderCatalog([])
      }
    }
    if (enabled) {
      void loadChatProviders()
    }
  }, [enabled])

  useEffect(() => {
    setPortalReady(true)
  }, [])

  useEffect(() => {
    if (!portalReady || typeof document === 'undefined') return

    function resolveFabAnchor() {
      setFabAnchor(document.getElementById(ADMIN_AI_FAB_ANCHOR_ID))
    }

    resolveFabAnchor()
    const observer = new MutationObserver(resolveFabAnchor)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
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
    return () => {
      try {
        recognitionRef.current?.stop()
      } catch {
        /* ignore */
      }
      recognitionRef.current = null
    }
  }, [])

  const hasReadyAttachments = useMemo(
    () => attachments.some((a) => a.status === 'ready' && Boolean(a.excerpt?.trim())),
    [attachments]
  )
  const attachmentsBusy = useMemo(() => attachments.some((a) => a.status === 'reading'), [attachments])
  const canSend = enabled && !sending && !attachmentsBusy && (input.trim().length > 0 || hasReadyAttachments)

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

  async function ingestFiles(fileList: File[]) {
    const files = Array.from(fileList).slice(0, 8)
    for (const file of files) {
      const kind = classifyFile(file)
      const id = nextId()
      const lowerName = file.name.trim().toLowerCase()
      const looksSecret =
        lowerName === '.env' ||
        lowerName.startsWith('.env.') ||
        lowerName.endsWith('.pem') ||
        lowerName.endsWith('.key') ||
        lowerName.includes('id_rsa') ||
        lowerName.includes('credentials') ||
        lowerName.includes('service_account')
      if (looksSecret) {
        setAttachments((prev) => [
          ...prev,
          {
            id,
            file,
            kind: 'text',
            label: file.name,
            status: 'error',
            error: 'Secret-bearing files are blocked (.env, keys, credentials).',
          },
        ])
        continue
      }
      if (kind === 'unsupported') {
        setAttachments((prev) => [
          ...prev,
          {
            id,
            file,
            kind: 'text',
            label: file.name,
            status: 'error',
            error: 'Unsupported type. Use text/markdown/json/csv or common audio formats.',
          },
        ])
        continue
      }

      setAttachments((prev) => [
        ...prev,
        { id, file, kind, label: file.name, status: 'reading' },
      ])

      try {
        const excerpt =
          kind === 'text'
            ? truncateBody(await readTextFile(file), MAX_ATTACHMENT_CHARS)
            : truncateBody(await transcribeWithServer(file), MAX_ATTACHMENT_CHARS)
        setAttachments((prev) =>
          prev.map((a) => (a.id === id ? { ...a, status: 'ready' as const, excerpt } : a))
        )
      } catch (e) {
        setAttachments((prev) =>
          prev.map((a) =>
            a.id === id ? { ...a, status: 'error' as const, error: getErrorMessage(e) } : a
          )
        )
      }
    }
  }

  function buildAttachmentBlock(atts: PendingAttachment[]): string {
    const parts = atts.filter((a) => a.status === 'ready' && a.excerpt?.trim())
    if (!parts.length) return ''
    return parts.map((a) => `--- Attached: ${a.label} ---\n${a.excerpt!.trim()}`).join('\n\n')
  }

  function composeWithAttachments(base: string, atts: PendingAttachment[]) {
    const block = buildAttachmentBlock(atts)
    const raw = [base.trim(), block].filter(Boolean).join('\n\n')
    return truncateBody(raw, MAX_COMPOSED_MESSAGE_CHARS)
  }

  function speechRecognitionCtor(): (new () => SpeechRecognition) | null {
    if (typeof window === 'undefined') return null
    return (window.SpeechRecognition || window.webkitSpeechRecognition) as (new () => SpeechRecognition) | null
  }

  function toggleDictation() {
    setSpeechError(null)
    const Ctor = speechRecognitionCtor()
    if (!Ctor) {
      setSpeechError('Talk-to-text needs Chrome or Edge (Web Speech API).')
      return
    }
    if (isListening) {
      try {
        recognitionRef.current?.stop()
      } catch {
        /* ignore */
      }
      setIsListening(false)
      return
    }

    const rec = new Ctor()
    rec.lang = 'en-US'
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = (event: SpeechRecognitionEvent) => {
      let chunk = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        chunk += event.results[i]?.[0]?.transcript ?? ''
      }
      if (!chunk) return
      setInput((prev) => `${prev}${chunk}`)
    }
    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      setSpeechError(event.error || 'speech error')
      setIsListening(false)
    }
    rec.onend = () => {
      setIsListening(false)
      recognitionRef.current = null
    }
    recognitionRef.current = rec
    try {
      rec.start()
      setIsListening(true)
    } catch (e) {
      setSpeechError(getErrorMessage(e))
      setIsListening(false)
    }
  }

  async function sendChatMessage(content: string, skillId?: string) {
    const payload: {
      message: string
      provider?: string
      skillId?: string
      stickySkillId?: string
      stickySkillInferredAt?: number
      honestyMode?: AdminChatHonestyMode
      energyPreset?: AdminChatEnergyPreset
      pageContext?: AdminAiPageContext
    } = { message: content, honestyMode, energyPreset }
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
      payload.pageContext = pageCtx.pageContext
    }
    const response = await adminAiFetch('/api/admin/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to contact AI chat API.' }))
      throw new Error(errorData.error || 'Failed to contact AI chat API.')
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
      ? { approve: true, runId: (params as { approve: true; runId: string }).runId }
      : {
          tool: 'tool' in params ? params.tool : undefined,
          payload: 'payload' in params ? params.payload : undefined,
          approve: Boolean('approve' in params && params.approve),
          runId: 'runId' in params ? params.runId : undefined,
          planSteps: 'planSteps' in params ? params.planSteps : undefined,
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
    const mergedSteps = mergeStrategyPackRefinePayload(steps, preferStrategyPackRefine)
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
            result.message || 'Full runbook preview is ready. Review the timeline and approve when ready.',
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
    setSending(true)
    try {
      const merged = applyStrategyPackPreviewMode(pendingPlanSteps, mode)
      const first = merged[0]
      const result = await runExecute({
        tool: first.tool,
        payload: first.payload,
        approve: false,
        planSteps: merged,
      })
      setPendingPlanSteps(merged)
      setPendingAction(result)
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: 'assistant',
          content:
            mode === 'polish'
              ? 'Preview regenerated with LLM polish (dry-run).'
              : 'Preview regenerated (deterministic pack only).',
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

  function getSkillByTool(tool: ExecuteTool) {
    return skills.find((skill) => skill.allowedTools.includes(tool)) ?? null
  }

  function getMissingRequiredFields(tool: ExecuteTool, payload: Record<string, unknown>) {
    const skill = getSkillByTool(tool)
    const schema = skill?.inputSchema
    if (!schema) return []
    return Object.entries(schema)
      .filter(([, config]) => Boolean(config.required))
      .map(([field]) => field)
      .filter((field) => payload[field] === undefined || payload[field] === null || payload[field] === '')
  }

  /** Plan + dry-run execute preview (shared by `/exec` submit and Studio quick actions). */
  async function runExecDryRun(tool: ExecuteTool, basePayload: Record<string, unknown>) {
    let execPayload = basePayload
    if (preferStrategyPackRefine && tool === 'draft_product_strategy_pack') {
      execPayload = { ...execPayload, refineWithLlm: true }
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
    const graphSteps = mergeStrategyPackRefinePayload(graph.steps || [], preferStrategyPackRefine)
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
    if (!canSend) return

    const turnSessionId = activeSessionId
    const userText = input.trim()
    const attachmentSnapshot = [...attachments]
    const userLabel = `${userText || '(attachments only)'}${attachmentSnapshot.length ? ` · ${attachmentSnapshot.length} file(s)` : ''}`

    setInput('')
    setAttachments([])
    setMessages((prev) => [...prev, { id: nextId(), role: 'user', content: userLabel }])
    setSending(true)

    try {
      mergeIntoActive({ anchorSuggestions: [] })
      const prevSkillForHandoff = { id: activeSkill?.id ?? null, name: activeSkill?.name ?? null }
      const isPureChat = agentMode === 'chat'
      const agentSkillId = isAgentSkillMode(agentMode) ? agentMode : null

      if (!isPureChat) {
        const forcedPlanMessage =
          agentMode === 'plan' && userText && !userText.toLowerCase().startsWith('/plan ')
            ? userText
            : null
        const planMessage = forcedPlanMessage ?? parsePlanCommand(userText)
        if (planMessage) {
          const messageForPlan = composeWithAttachments(planMessage, attachmentSnapshot)
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

        const execLine = userText.split(/\r?\n/, 1)[0]?.trim() ?? ''
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

      const chatBody = composeWithAttachments(userText, attachmentSnapshot)
      const chatSkillId =
        isPureChat || agentMode === 'auto' || agentMode === 'plan'
          ? undefined
          : isAgentSkillMode(agentMode)
            ? agentMode
            : undefined
      mergeIntoActive({ anchorSuggestions: suggestAnchorSnippetsFromUserText(userText) })
      const result = await sendChatMessage(chatBody, chatSkillId)
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
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: 'assistant', content: result.reply },
      ])
      setSessions((prev) => {
        const i = prev.findIndex((s) => s.id === turnSessionId)
        if (i < 0) return prev
        const s = prev[i]!
        if (s.title !== 'New chat') return prev
        const firstLine = (userText.split(/\n/)[0] ?? userText).trim() ||
          (attachmentSnapshot[0]?.label ? `File: ${attachmentSnapshot[0].label}` : '')
        if (!firstLine) return prev
        const short = firstLine.length > 40 ? `${firstLine.slice(0, 38)}…` : firstLine
        const copy = [...prev]
        copy[i] = { ...s, title: short, updatedAt: Date.now() }
        return copy
      })
    } catch (error: unknown) {
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: 'assistant',
          content: `Error: ${getErrorMessage(error)}`,
        },
      ])
    } finally {
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

  async function approvePendingAction() {
    if (!pendingAction?.toolPreview) return
    const missingFieldsFromPlan = pendingPlanSteps.flatMap((step) => getMissingRequiredFields(step.tool, step.payload))
    const missingFields = missingFieldsFromPlan.length
      ? missingFieldsFromPlan
      : getMissingRequiredFields(pendingAction.toolPreview.tool, pendingAction.toolPreview.payload || {})
    if (missingFields.length) {
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: 'assistant',
          content: `Cannot approve yet. Missing required fields: ${missingFields.join(', ')}`,
        },
      ])
      return
    }
    setSending(true)
    try {
      const runId = pendingAction.runId || lastRunId || undefined
      const result = await runExecute(
        runId
          ? { approve: true, runId }
          : {
              tool: pendingAction.toolPreview.tool,
              payload: pendingAction.toolPreview.payload || {},
              approve: true,
              planSteps: pendingPlanSteps.length ? pendingPlanSteps : undefined,
            }
      )
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: 'assistant',
          content:
            result.message ||
            (result.results && result.results.length > 1
              ? `${result.results.length} plan steps executed.`
              : 'Action approved and executed.'),
        },
      ])
      setPendingAction(null)
      setPendingPlanSteps([])
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
  const dockRightLayout = !isStandalone && dockMode === 'dock-right'
  const dockLeftLayout = !isStandalone && dockMode === 'dock-left'
  const dockEdgeLayout = dockRightLayout || dockLeftLayout

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
    return (
          <div className="relative flex h-full min-h-0 flex-col" data-admin-ai-root>
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
                      <div key={s.id} className="group relative flex min-w-0 max-w-[min(7.5rem,32vw)] shrink-0 items-center">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveSessionId(s.id)
                            setShowSessionHistory(false)
                          }}
                          className={`min-w-0 flex-1 truncate rounded-t px-1.5 py-1.5 text-left text-[11px] font-medium leading-tight ${
                            s.id === activeSessionId
                              ? 'bg-gray-800 text-white ring-1 ring-inset ring-gray-600'
                              : 'text-gray-400 hover:bg-gray-800/80 hover:text-gray-200'
                          }`}
                          title={s.title}
                        >
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
              <div className="border-t border-gray-800/80 bg-gray-950/60 px-2.5 py-1.5">
                <p className="text-[10px] leading-relaxed text-gray-500">
                  <span className="font-mono text-gray-400">/plan</span> runbook ·{' '}
                  <span className="font-mono text-gray-400">/exec</span> tools — publish/spend/delete blocked in v1.
                </p>
                {activeSkill?.name ? (
                  <p className="mt-0.5 truncate text-[10px] text-purple-300/90">Active skill: {activeSkill.name}</p>
                ) : null}
                {disabledTools.length > 0 ? (
                  <p className="mt-0.5 truncate text-[10px] text-amber-300/90">Disabled: {disabledTools.join(', ')}</p>
                ) : null}
              </div>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`rounded-lg px-3 py-3 text-sm leading-relaxed ${
                    message.role === 'user'
                      ? 'ml-8 bg-purple-600/20 text-purple-100'
                      : message.role === 'assistant'
                      ? 'mr-8 bg-gray-800/95 text-gray-100 ring-1 ring-gray-700/80'
                      : 'bg-gray-900 text-gray-400'
                  }`}
                >
                  {message.role === 'assistant' ? (
                    <>
                      <AdminAssistantRichText content={message.content} />
                      {renderFocusApplyActions(message.content, pageFocus)}
                      {message.embed?.type === 'product_strategy_pack' ? (
                        <div className="mt-3 border-t border-gray-700/80 pt-3">
                          <ProductStrategyPackCard
                            output={message.embed.output}
                            onSendPolishToChat={appendStrategyPolishToThread}
                          />
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
              ))}
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
                      <p className="font-semibold">Pending approval</p>
                      <p>
                        Tool: {pendingAction.toolPreview.tool} | Risk: {pendingAction.toolPreview.riskTier}
                      </p>
                      {pendingPlanSteps.length > 0 && (
                        <div className="mt-1 rounded border border-amber-800/70 bg-black/20 p-2">
                          <p className="font-semibold text-amber-100">Runbook timeline ({pendingPlanSteps.length} steps)</p>
                          {pendingPlanSteps.map((step, index) => (
                            <p key={step.id} className="mt-1 text-[11px] text-amber-200">
                              {index + 1}. {step.tool} ({step.riskTier})
                            </p>
                          ))}
                        </div>
                      )}
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
                      <button
                        type="button"
                        onClick={approvePendingAction}
                        disabled={sending || missingFields.length > 0}
                        className="mt-2 rounded bg-amber-500 px-2 py-1 font-semibold text-black hover:bg-amber-400 disabled:opacity-60"
                      >
                        Approve and execute
                      </button>
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
              className={`border-t border-gray-800 p-3 transition-colors ${
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
                const { files } = e.dataTransfer
                if (files?.length) void ingestFiles(Array.from(files))
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
              <div className="mb-2 space-y-2 rounded-lg border border-gray-800/80 bg-gray-900/40 px-2 py-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Anchors</span>
                  {([0, 1, 2] as const).map((i) => (
                    <input
                      key={i}
                      type="text"
                      value={anchors[i]}
                      onChange={(e) => setAnchorSlot(i, e.target.value)}
                      disabled={!enabled || sending}
                      placeholder={`Anchor ${i + 1}`}
                      className="min-w-[5.5rem] max-w-[140px] flex-1 rounded border border-gray-700 bg-gray-950 px-2 py-1 text-[11px] text-gray-200 placeholder:text-gray-600"
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
                  >
                    Insert
                  </button>
                </div>
                {anchorSuggestions.length > 0 ? (
                  <div className="space-y-1">
                    <p className="text-[10px] text-gray-500">
                      Suggested from your last message (heuristic; may miss nuance or sensitive text). Click to fill the
                      first empty slot.
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {anchorSuggestions.map((s) => (
                        <button
                          key={s}
                          type="button"
                          disabled={!enabled || sending || anchors.every((a) => a.trim())}
                          onClick={() => applyAnchorSuggestion(s)}
                          className="max-w-full truncate rounded-full border border-gray-600 bg-gray-950/80 px-2 py-0.5 text-left text-[10px] text-gray-200 hover:bg-gray-800 disabled:opacity-40"
                          title={s}
                        >
                          {s.length > 48 ? `${s.slice(0, 46)}…` : s}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
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
              {attachments.length > 0 ? (
                <div className="mb-2 flex flex-wrap gap-1">
                  {attachments.map((a) => (
                    <span
                      key={a.id}
                      className={`inline-flex max-w-full items-center gap-1 rounded px-2 py-0.5 text-[11px] ${
                        a.status === 'error'
                          ? 'bg-red-900/50 text-red-200'
                          : a.status === 'reading'
                            ? 'bg-gray-800 text-gray-300'
                            : 'bg-gray-800 text-emerald-200'
                      }`}
                      title={a.error || a.excerpt?.slice(0, 200)}
                    >
                      <span className="truncate">{a.label}</span>
                      {a.status === 'reading' ? <span className="text-gray-500">…</span> : null}
                      <button
                        type="button"
                        className="text-gray-400 hover:text-white"
                        aria-label={`Remove ${a.label}`}
                        onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
              {fileDragDepth > 0 ? (
                <p className="mb-1 text-center text-[11px] font-medium text-purple-200">Drop files to attach</p>
              ) : null}
              {speechError ? (
                <p className="mb-1 text-[11px] text-amber-300">{speechError}</p>
              ) : null}
              {isStudioSurface ? (
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  {(() => {
                    const countdown = formatReleaseCountdownLabel(pageCtx?.pageContext.studio?.releaseDate ?? null)
                    return countdown ? (
                      <span
                        className="rounded-full border border-fuchsia-500/35 bg-fuchsia-950/40 px-2.5 py-1 text-[10px] font-medium text-fuchsia-100/95"
                        title={pageCtx?.pageContext.studio?.releaseDate ?? undefined}
                      >
                        {countdown}
                      </span>
                    ) : null
                  })()}
                  {pageCtx?.pageContext.studio?.releaseId ? (
                    <>
                      <button
                        type="button"
                        disabled={!enabled || sending}
                        className="rounded-full border border-violet-500/40 bg-violet-950/50 px-2.5 py-1 text-[10px] font-medium text-violet-200 hover:bg-violet-900/60 disabled:opacity-40"
                        onClick={() =>
                          setInput('What is blocking this release from going live? List blockers and the next workflow step.')
                        }
                      >
                        Blockers & next step
                      </button>
                      <button
                        type="button"
                        disabled={!enabled || sending}
                        className="rounded-full border border-gray-600 bg-gray-900 px-2.5 py-1 text-[10px] font-medium text-gray-300 hover:bg-gray-800 disabled:opacity-40"
                        onClick={() =>
                          setInput(
                            `/exec query_release_studio_snapshot ${JSON.stringify({ releaseId: pageCtx.pageContext.studio!.releaseId })}`
                          )
                        }
                      >
                        Live snapshot
                      </button>
                      <button
                        type="button"
                        disabled={!enabled || sending}
                        className="rounded-full border border-gray-600 bg-gray-900 px-2.5 py-1 text-[10px] font-medium text-gray-300 hover:bg-gray-800 disabled:opacity-40"
                        onClick={() =>
                          setInput(
                            'Draft a Spotify editorial pitch and Instagram launch caption for this release. Use only metadata you know from context; ask before inventing facts.'
                          )
                        }
                      >
                        Draft copy
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={!enabled || sending}
                      className="rounded-full border border-gray-600 bg-gray-900 px-2.5 py-1 text-[10px] font-medium text-gray-300 hover:bg-gray-800 disabled:opacity-40"
                      title="Run Release Studio ops snapshot (one tap). Shift-click to paste /exec into the composer instead."
                      onClick={triggerStudioPipelineSnapshot}
                    >
                      Studio pipeline
                    </button>
                  )}
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
                    disabled={!enabled || sending}
                    onToggle={() => setPreferStrategyPackRefine((v) => !v)}
                  />
                </div>
              ) : (
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
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
                    disabled={!enabled || sending}
                    onToggle={() => setPreferStrategyPackRefine((v) => !v)}
                  />
                </div>
              )}
              {focusCopilotEnabled && pageFocus && setPageFocus ? (
                <FieldCopilotPanel
                  focus={pageFocus}
                  enabled={enabled}
                  busy={sending}
                  onClear={() => setPageFocus(null)}
                  onFocusUpdate={setPageFocus}
                  requestCopilot={async (prompt) => {
                    const result = await sendChatMessage(prompt, 'studio_release')
                    return { reply: result.reply }
                  }}
                />
              ) : null}
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="h-24 w-full resize-none rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
                placeholder={
                  enabled
                    ? 'Type or dictate · /plan … · /exec … · drop text or audio files'
                    : 'Toggle AI ON to start'
                }
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1 text-[11px] text-gray-400">
                    Mode
                    <select
                      value={agentMode}
                      onChange={(e) => setAgentMode(e.target.value as AgentModeChoice)}
                      disabled={!enabled}
                      className="max-w-[min(220px,38vw)] min-w-[9.5rem] rounded border border-gray-700 bg-gray-950 px-1.5 py-1 text-[11px] text-gray-200"
                      title="Behaviors: Auto (detect /plan and /exec), Chat (no commands), Plan (runbook from text). Agents: lock persona and planning to a registered admin skill."
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
                              onChange={(e) => setChatProvider(e.target.value as ChatProviderChoice)}
                              disabled={!enabled}
                              className="min-w-0 flex-1 rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-[11px] text-gray-100"
                              title="Chat completion provider (see ADMIN_AI_CHAT_PROVIDER and provider API keys)"
                            >
                              <option value="auto">Auto</option>
                              {(['anthropic', 'openai', 'ollama', 'crowelogic'] as const).map((id) => {
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
                    aria-label={isListening ? 'Stop talk to text' : 'Talk to text'}
                    disabled={!enabled || !speechRecognitionCtor()}
                    onClick={() => toggleDictation()}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded border disabled:opacity-40 ${
                      isListening
                        ? 'border-red-700 bg-red-950/60 text-red-200'
                        : 'border-gray-600 bg-gray-900 text-gray-200 hover:bg-gray-800'
                    }`}
                    title={speechRecognitionCtor() ? 'Talk to text (Chrome / Edge)' : 'Talk to text not supported in this browser'}
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
    )
  }

  const fabButton = (
        <button
          type="button"
          onClick={handleAdminAiFabClick}
          className={`inline-flex h-11 w-11 items-center justify-center rounded-full border shadow-lg backdrop-blur-sm transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-400 ${
            !enabled
              ? 'border-gray-700 bg-gray-900/95 text-gray-500 hover:border-gray-600 hover:text-gray-300'
              : open
                ? 'border-purple-300/80 bg-purple-600 text-white shadow-purple-500/35 ring-2 ring-purple-400/45'
                : 'border-purple-500/55 bg-purple-600 text-white hover:bg-purple-500 hover:shadow-purple-900/50'
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
          <LuBrainCircuit className="h-5 w-5" aria-hidden />
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
            className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-700 bg-gray-950 shadow-2xl"
          >
            {renderAssistantInterior()}
          </div>
        </div>
      ) : (
        <div
          ref={panelRef}
          className={`fixed z-[11000] overflow-hidden border border-gray-700 bg-gray-950 shadow-2xl ${
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
                  width:
                    panelSize?.w ??
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
                    width:
                      panelSize?.w ??
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
          {dockRightLayout ? (
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
