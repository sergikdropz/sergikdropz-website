import type { AdminAiPageContext } from '@/lib/ai/admin-ai-page-context'
import type { AdminAiStudioNavTarget } from '@/lib/admin-ai-studio-nav'
import type { WorkflowStepId } from '@/lib/studio/constants'

export type AdminAiQuickStartKind = 'priority' | 'creative' | 'playbook'

export type AdminAiQuickStart = {
  id: string
  kind: AdminAiQuickStartKind
  label: string
  detail: string
  message: string
  skillId?: string
  /** 1–10 urgency (priority) or impact (creative). */
  priorityScore?: number
  /** Deep-link into Release Studio when the user resumes this row. */
  nav?: AdminAiStudioNavTarget
}

/** Shared history row for priority + creative rotations. */
export type AdminAiQuickStartHistoryEntry = AdminAiPriorityHistoryEntry

export type AdminAiPriorityHistoryEntry = {
  id: string
  label: string
  detail: string
  message: string
  skillId?: string
  priorityScore: number
  at: number
  status: 'attended' | 'ignored'
  nav?: AdminAiStudioNavTarget
}

export type AdminAiPriorityQuickStartState = {
  current: AdminAiQuickStart[]
  attended: AdminAiPriorityHistoryEntry[]
  ignored: AdminAiPriorityHistoryEntry[]
  refreshCount: number
  /** Set when the visible pair had to recycle because exclude list exhausted the high-priority band. */
  poolExhausted?: boolean
}

export type AdminAiCreativeQuickStartState = AdminAiPriorityQuickStartState

/** Minimum score (1–10) for the “Needs attention” rotation. */
export const HIGH_PRIORITY_MIN_SCORE = 7

/** Visible “Needs attention” rows per refresh. */
export const PRIORITY_QUICK_START_VISIBLE_COUNT = 4

/** Visible “Explore & grow” rows per refresh. */
export const CREATIVE_QUICK_START_VISIBLE_COUNT = 4

/** When a status bucket exceeds this count, history is grouped by skill field. */
export const QUICK_START_HISTORY_FIELD_GROUP_THRESHOLD = 3

/** Field groups with more entries collapse into an expandable submenu. */
export const QUICK_START_HISTORY_FIELD_COLLAPSE_THRESHOLD = 3

export type QuickStartHistoryFieldGroup = {
  fieldId: string
  fieldLabel: string
  entries: AdminAiPriorityHistoryEntry[]
}

const QUICK_START_FIELD_LABELS: Record<string, string> = {
  general: 'General',
  release_ops: 'Release Ops',
  product_strategy: 'Marketing & Product Strategy',
  growth_marketing: 'Growth Marketing',
  smartlink_seo: 'Smartlink + UTM',
  e2e_qa: 'E2E & QA',
  mac_automation: 'Mac automation',
  admin_intel: 'Ops intelligence',
  sergik_intelligence: 'SergikAI intelligence',
  studio_release: 'Release Studio',
  playbooks: 'Playbooks',
}

export function quickStartHistoryFieldLabel(fieldId: string): string {
  const key = fieldId.trim() || 'general'
  return QUICK_START_FIELD_LABELS[key] ?? key.replace(/_/g, ' ')
}

/** Groups history rows by skill field (stable first-seen order). */
export function groupQuickStartHistoryByField(
  entries: AdminAiPriorityHistoryEntry[],
): QuickStartHistoryFieldGroup[] {
  const order: string[] = []
  const map = new Map<string, AdminAiPriorityHistoryEntry[]>()
  for (const entry of entries) {
    const fieldId = entry.skillId?.trim() || 'general'
    if (!map.has(fieldId)) {
      map.set(fieldId, [])
      order.push(fieldId)
    }
    map.get(fieldId)!.push(entry)
  }
  return order.map((fieldId) => ({
    fieldId,
    fieldLabel: quickStartHistoryFieldLabel(fieldId),
    entries: map.get(fieldId)!,
  }))
}

export type AdminAiUnfinishedBusinessEntry = {
  id: string
  kind: AdminAiQuickStartKind
  label: string
  detail: string
  message: string
  skillId?: string
  priorityScore: number
  at: number
  /** started = user launched the row; skipped = high-score item refreshed away */
  unfinishedReason: 'started' | 'skipped'
  nav?: AdminAiStudioNavTarget
}

/** Max unfinished rows on the quick-start panel. */
export const UNFINISHED_BUSINESS_VISIBLE_COUNT = 4

/** Ignored refresh rows at or above this score count as unfinished. */
export const UNFINISHED_SKIPPED_MIN_SCORE = 8

export function unfinishedEntryToHistoryEntry(entry: AdminAiUnfinishedBusinessEntry): AdminAiPriorityHistoryEntry {
  return {
    id: entry.id,
    label: entry.label,
    detail: entry.detail,
    message: entry.message,
    skillId: entry.skillId,
    priorityScore: entry.priorityScore,
    at: entry.at,
    status: entry.unfinishedReason === 'started' ? 'attended' : 'ignored',
  }
}

export function unfinishedBusinessEntryToQuickStart(entry: AdminAiUnfinishedBusinessEntry): AdminAiQuickStart {
  return {
    id: entry.id,
    kind: entry.kind,
    label: entry.label,
    detail: entry.detail,
    message: entry.message,
    skillId: entry.skillId,
    priorityScore: entry.priorityScore,
    nav: entry.nav,
  }
}

function mergeUnfinishedEntry(
  byId: Map<string, AdminAiUnfinishedBusinessEntry>,
  entry: AdminAiPriorityHistoryEntry,
  kind: AdminAiQuickStartKind,
  reason: 'started' | 'skipped',
  dismissedIds: Set<string>,
) {
  if (dismissedIds.has(entry.id)) return
  const candidate: AdminAiUnfinishedBusinessEntry = {
    id: entry.id,
    kind,
    label: entry.label,
    detail: entry.detail,
    message: entry.message,
    skillId: entry.skillId,
    priorityScore: entry.priorityScore,
    at: entry.at,
    unfinishedReason: reason,
    nav: entry.nav,
  }
  const existing = byId.get(entry.id)
  if (!existing) {
    byId.set(entry.id, candidate)
    return
  }
  const preferStarted = existing.unfinishedReason === 'started' || reason === 'started'
  const at = Math.max(existing.at, candidate.at)
  byId.set(entry.id, {
    ...candidate,
    at,
    unfinishedReason: preferStarted ? 'started' : candidate.unfinishedReason,
    kind: existing.at >= candidate.at ? existing.kind : candidate.kind,
  })
}

/** Collect open loops from one session’s priority + creative rotation state. */
export function collectSessionUnfinishedBusiness(
  priority: AdminAiPriorityQuickStartState | undefined,
  creative: AdminAiCreativeQuickStartState | undefined,
  dismissedIds: Set<string>,
): AdminAiUnfinishedBusinessEntry[] {
  const byId = new Map<string, AdminAiUnfinishedBusinessEntry>()
  for (const entry of priority?.attended ?? []) {
    mergeUnfinishedEntry(byId, entry, 'priority', 'started', dismissedIds)
  }
  for (const entry of creative?.attended ?? []) {
    mergeUnfinishedEntry(byId, entry, 'creative', 'started', dismissedIds)
  }
  for (const entry of priority?.ignored ?? []) {
    if (entry.priorityScore >= UNFINISHED_SKIPPED_MIN_SCORE) {
      mergeUnfinishedEntry(byId, entry, 'priority', 'skipped', dismissedIds)
    }
  }
  for (const entry of creative?.ignored ?? []) {
    if (entry.priorityScore >= UNFINISHED_SKIPPED_MIN_SCORE) {
      mergeUnfinishedEntry(byId, entry, 'creative', 'skipped', dismissedIds)
    }
  }
  return [...byId.values()].sort((a, b) => b.at - a.at)
}

/** Merge unfinished rows across chat sessions (deduped by suggestion id). */
export function collectAllUnfinishedBusinessFromSessions(
  sessions: Array<{
    priorityQuickStart?: AdminAiPriorityQuickStartState
    creativeQuickStart?: AdminAiCreativeQuickStartState
  }>,
  dismissedIds: Set<string>,
): AdminAiUnfinishedBusinessEntry[] {
  const byId = new Map<string, AdminAiUnfinishedBusinessEntry>()
  for (const session of sessions) {
    for (const row of collectSessionUnfinishedBusiness(
      session.priorityQuickStart,
      session.creativeQuickStart,
      dismissedIds,
    )) {
      const existing = byId.get(row.id)
      if (!existing) {
        byId.set(row.id, row)
        continue
      }
      const newer = row.at >= existing.at ? row : existing
      const preferStarted = existing.unfinishedReason === 'started' || row.unfinishedReason === 'started'
      byId.set(row.id, {
        ...newer,
        at: Math.max(row.at, existing.at),
        unfinishedReason: preferStarted ? 'started' : newer.unfinishedReason,
      })
    }
  }
  return [...byId.values()].sort((a, b) => b.at - a.at)
}

export function collectUnfinishedBusinessFromSessions(
  sessions: Array<{
    priorityQuickStart?: AdminAiPriorityQuickStartState
    creativeQuickStart?: AdminAiCreativeQuickStartState
  }>,
  dismissedIds: Set<string>,
  limit = UNFINISHED_BUSINESS_VISIBLE_COUNT,
): AdminAiUnfinishedBusinessEntry[] {
  return collectAllUnfinishedBusinessFromSessions(sessions, dismissedIds).slice(0, limit)
}

export function unfinishedEntryToQuickStartRow(entry: AdminAiUnfinishedBusinessEntry): AdminAiQuickStart {
  return {
    id: entry.id,
    kind: entry.kind,
    label: entry.label,
    detail: entry.detail,
    message: entry.message,
    skillId: entry.skillId,
    priorityScore: entry.priorityScore,
    nav: entry.nav,
  }
}

export type UnfinishedBusinessViewState = {
  refreshCount: number
  /** Ids rotated off the visible row on last refresh. */
  rotatedIds: string[]
}

export function createInitialUnfinishedBusinessViewState(): UnfinishedBusinessViewState {
  return { refreshCount: 0, rotatedIds: [] }
}

/** Rotate which unfinished rows are visible when the pool exceeds the cap. */
export function pickVisibleUnfinishedBusiness(
  all: AdminAiUnfinishedBusinessEntry[],
  view: UnfinishedBusinessViewState,
  sessionSeed: string,
  count = UNFINISHED_BUSINESS_VISIBLE_COUNT,
): AdminAiUnfinishedBusinessEntry[] {
  if (all.length <= count) return all
  const pool = all.map(unfinishedEntryToQuickStartRow)
  const exclude = new Set(view.rotatedIds)
  const { picks } = selectFreshQuickStartSuggestions(pool, count, {
    seed: `${sessionSeed}-unfinished-r${view.refreshCount}`,
    excludeIds: exclude,
    attendedIds: new Set(),
  })
  const pickIds = new Set(picks.map((row) => row.id))
  const visible = all.filter((row) => pickIds.has(row.id))
  return visible.length ? visible : all.slice(0, count)
}

export function refreshUnfinishedBusinessViewState(
  all: AdminAiUnfinishedBusinessEntry[],
  view: UnfinishedBusinessViewState,
  sessionSeed: string,
  count = UNFINISHED_BUSINESS_VISIBLE_COUNT,
): { view: UnfinishedBusinessViewState; visible: AdminAiUnfinishedBusinessEntry[] } {
  const currentVisible = pickVisibleUnfinishedBusiness(all, view, sessionSeed, count)
  const next: UnfinishedBusinessViewState = {
    refreshCount: view.refreshCount + 1,
    rotatedIds: [...new Set([...view.rotatedIds, ...currentVisible.map((row) => row.id)])].slice(-24),
  }
  const visible = pickVisibleUnfinishedBusiness(all, next, sessionSeed, count)
  return { view: next, visible }
}

export function createInitialPlaybookQuickStartState(
  pool: AdminAiQuickStart[],
  sessionSeed: string,
): AdminAiPriorityQuickStartState {
  return createInitialRotatingQuickStartState(
    pool,
    sessionSeed,
    3,
  )
}

export function markPlaybookQuickStartAttended(
  state: AdminAiPriorityQuickStartState,
  start: AdminAiQuickStart,
): AdminAiPriorityQuickStartState {
  return markRotatingQuickStartAttended(state, start)
}

export function refreshPlaybookQuickStartState(
  state: AdminAiPriorityQuickStartState,
  pool: AdminAiQuickStart[],
  sessionSeed: string,
): AdminAiPriorityQuickStartState {
  return refreshRotatingQuickStartState(state, pool, sessionSeed, 3)
}

const LEGACY_INTRO_MARKERS = [
  'How can I help? `/exec <tool>',
  'Release Studio copilot — I see the release',
] as const

export function isLegacyAdminAiIntro(content: string): boolean {
  const c = content.trim()
  return LEGACY_INTRO_MARKERS.some((m) => c.startsWith(m))
}

export function sanitizeAdminChatMessagesForDisplay<
  T extends { role: string; content: string },
>(messages: T[]): T[] {
  return messages.filter((m) => !(m.role === 'assistant' && isLegacyAdminAiIntro(m.content)))
}

export function isFreshAdminChat(messages: Array<{ role: string; content: string }>): boolean {
  const visible = sanitizeAdminChatMessagesForDisplay(messages)
  return visible.length === 0
}

function hashSeed(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function clampPriority(n: number): number {
  return Math.min(10, Math.max(1, Math.round(n)))
}

function contextualPrioritySuggestions(ctx: AdminAiPageContext | null | undefined): AdminAiQuickStart[] {
  const studio = ctx?.studio
  const rows: AdminAiQuickStart[] = []

  if (studio?.releaseId) {
    const rid = studio.releaseId
    const title = studio.title || 'this release'
    const blockers = studio.blockers?.filter(Boolean) ?? []

    const activeStep = studio.activeStep as WorkflowStepId | undefined
    const navBase: AdminAiStudioNavTarget = { releaseId: rid, step: activeStep }

    if (blockers.length) {
      rows.push({
        id: `priority-blockers-${rid}`,
        kind: 'priority',
        priorityScore: clampPriority(9 + Math.min(blockers.length, 2) * 0.5),
        label: `Unblock “${title}”`,
        detail: `Because ${title}: ${blockers.length} blocker(s) — snapshot, next step, and honest DSP status.`,
        message: `What is blocking "${title}" from going live? List blockers, readiness score, and the single next workflow step. Use /exec query_release_studio_snapshot ${JSON.stringify({ releaseId: rid })}`,
        skillId: 'studio_release',
        nav: navBase,
      })
    }

    rows.push({
      id: `priority-readiness-${rid}`,
      kind: 'priority',
      priorityScore: blockers.length ? 8 : 7,
      label: `Release snapshot — ${title}`,
      detail: `Because ${title}: copy gaps, Sonic DNA unified, YouTube timestamps.`,
      message: `/exec query_release_studio_snapshot ${JSON.stringify({ releaseId: rid })}`,
      skillId: 'studio_release',
      nav: navBase,
    })

    const stepBoost: Record<string, number> = {
      catalog: 8,
      metadata: 7,
      rights: 8,
      copy: 9,
      delivery: 8,
      launch: 10,
    }
    const step = studio.activeStep
    if (step === 'copy') {
      rows.push({
        id: `priority-copy-desk-${rid}`,
        kind: 'priority',
        priorityScore: clampPriority((stepBoost.copy ?? 8) + (studio.readinessScore != null && studio.readinessScore < 70 ? 1 : 0)),
        label: 'Copy desk + intelligence stack',
        detail: 'Polymath copy, empty fields, harness probe.',
        message: `/exec query_intelligence_harness ${JSON.stringify({
          mode: 'stack',
          releaseId: rid,
          query: 'Sonic DNA unified intelligence marketing copy polymath',
        })}`,
        skillId: 'sergik_intelligence',
        nav: { releaseId: rid, step: 'copy' },
      })
    }
    if (step === 'launch' || studio.distributorStatus === 'draft') {
      rows.push({
        id: `priority-launch-${rid}`,
        kind: 'priority',
        priorityScore: stepBoost.launch ?? 9,
        label: 'Launch gate + GTM handoff',
        detail: 'DistroKid packet honesty, campaign scaffold.',
        message: [
          `Pre-launch check for "${title}" (${rid}).`,
          `/exec query_release_studio_snapshot ${JSON.stringify({ releaseId: rid })}`,
          'List go-live blockers, then /plan go-to-market with draft_product_strategy_pack when ready.',
        ].join('\n'),
        skillId: 'studio_release',
        nav: { releaseId: rid, step: 'launch' },
      })
    }
    if (step === 'rights') {
      rows.push({
        id: `priority-rights-${rid}`,
        kind: 'priority',
        priorityScore: stepBoost.rights ?? 8,
        label: 'Rights counsel audit',
        detail: 'Contract faults before any checklist write.',
        message: [
          `Audit music-business paperwork for "${title}" (${rid}).`,
          `/exec audit_music_contract ${JSON.stringify({ releaseId: rid })}`,
          'Address blockers first. Do not invent licenses or mark the checklist true from the memo.',
        ].join('\n'),
        skillId: 'music_business_counsel',
        nav: { releaseId: rid, step: 'rights' },
      })
    }
    if (step === 'catalog') {
      rows.push({
        id: `priority-isrc-${rid}`,
        kind: 'priority',
        priorityScore: 8,
        label: 'Catalog + ISRC hygiene',
        detail: 'Preview ISRC assignment and DSP ingest fields.',
        message: `/exec assign_isrcs ${JSON.stringify({ releaseId: rid, dryRun: true })}`,
        skillId: 'studio_release',
        nav: { releaseId: rid, step: 'catalog' },
      })
    }
    if (studio.releaseDate) {
      rows.push({
        id: `priority-countdown-${rid}`,
        kind: 'priority',
        priorityScore: 7,
        label: 'Street date pressure',
        detail: 'Command center + this release blockers.',
        message: `/exec query_studio_command_center ${JSON.stringify({ dueWithinDays: 14 })}`,
        skillId: 'studio_release',
      })
    }
  } else if (ctx?.surface === 'studio') {
    rows.push({
      id: 'priority-pipeline-studio',
      kind: 'priority',
      priorityScore: 8,
      label: 'Distribution pipeline snapshot',
      detail: 'Counts and status across Release Studio.',
      message: `/exec query_ops_snapshot ${JSON.stringify({ focus: 'studio' })}`,
      skillId: 'admin_intel',
    })
  }

  return rows
}

const GENERIC_PRIORITY_POOL: AdminAiQuickStart[] = [
  {
    id: 'priority-ops-all',
    kind: 'priority',
    priorityScore: 7,
    label: 'Ops pulse — studio + nurturing',
    detail: 'Campaigns, fans, smart links, distribution.',
    message: `/exec query_ops_snapshot ${JSON.stringify({ focus: 'all' })}`,
    skillId: 'admin_intel',
  },
  {
    id: 'priority-due-week',
    kind: 'priority',
    priorityScore: 8,
    label: 'Due this week',
    detail: 'At-risk releases and daily actions.',
    message: `/exec query_studio_command_center ${JSON.stringify({ dueWithinDays: 7 })}`,
    skillId: 'studio_release',
  },
  {
    id: 'priority-intel-stack',
    kind: 'priority',
    priorityScore: 7,
    label: 'Intelligence stack health',
    detail: 'OlliN harness, Crowe gateway, Dev Mode.',
    message: `/exec query_intelligence_harness ${JSON.stringify({ mode: 'stack' })}`,
    skillId: 'sergik_intelligence',
  },
  {
    id: 'priority-knowledge-stale',
    kind: 'priority',
    priorityScore: 5,
    label: 'Harness knowledge probe',
    detail: 'RAG across AGENTS, Canvas truth, Sonic DNA docs.',
    message: `/exec query_intelligence_harness ${JSON.stringify({
      mode: 'probe',
      query: 'SERGIK site canon Release Studio Sonic DNA gaps',
      limit: 6,
    })}`,
    skillId: 'sergik_intelligence',
  },
  {
    id: 'priority-nurturing-gap',
    kind: 'priority',
    priorityScore: 7,
    label: 'Fan + campaign gap scan',
    detail: 'Nurturing metrics before next launch push.',
    message: `/exec query_ops_snapshot ${JSON.stringify({ focus: 'nurturing' })}`,
    skillId: 'admin_intel',
  },
  {
    id: 'priority-growth-board',
    kind: 'priority',
    priorityScore: 9,
    label: 'Weekly Growth Board',
    detail: 'DSP scorecard → desk read → campaign draft (approve first).',
    message: '__playbook__:playbook-growth-board',
    skillId: 'growth_marketing',
  },
  {
    id: 'priority-growth-snapshot',
    kind: 'priority',
    priorityScore: 8,
    label: 'Platform growth scorecard',
    detail: 'Cite last desk ingest — never invent ML/streams.',
    message: '/exec query_platform_growth_snapshot {}',
    skillId: 'growth_marketing',
  },
  {
    id: 'priority-strategy-audit',
    kind: 'priority',
    priorityScore: 5,
    label: 'Site growth audit',
    detail: 'Conversion + SEO scaffold (no fake analytics).',
    message:
      '/plan Quick site audit: homepage CTA, /music discovery, share listen UX — output draft_product_strategy_pack sections only.',
    skillId: 'product_strategy',
  },
  {
    id: 'priority-checklist-new-release',
    kind: 'priority',
    priorityScore: 7,
    label: 'Release checklist scaffold',
    detail: 'Operational timeline for next drop.',
    message:
      '/exec create_release_checklist {"releaseName":"Next SERGIK release","releaseDate":"TBD"}',
    skillId: 'release_ops',
  },
  {
    id: 'priority-copyright-batch',
    kind: 'priority',
    priorityScore: 5,
    label: 'Rights backlog review',
    detail: 'Studio-wide copyright readiness (if releases exist).',
    message:
      '/exec query_ops_snapshot {"focus":"studio"} then list which releases need rights checklist work first.',
    skillId: 'admin_intel',
  },
  {
    id: 'priority-smartlink-hygiene',
    kind: 'priority',
    priorityScore: 4,
    label: 'Smart link + UTM hygiene',
    detail: 'Attribution before next campaign spend.',
    message:
      '/exec generate_smartlink_utm_plan {"destination":"https://sergik.com/music","campaign":"priority_audit","source":"instagram","medium":"social"}',
    skillId: 'smartlink_seo',
  },
  {
    id: 'priority-dev-smoke',
    kind: 'priority',
    priorityScore: 4,
    label: 'Admin smoke test',
    detail: 'Playwright guest path when dev server is up.',
    message: '/exec run_playwright_e2e {"spec":"e2e/admin-guest.spec.ts"}',
    skillId: 'e2e_qa',
  },
]

/** All priority candidates for the current UI context (sorted by score desc). */
export function buildPrioritySuggestionPool(ctx: AdminAiPageContext | null | undefined): AdminAiQuickStart[] {
  const merged = [...contextualPrioritySuggestions(ctx), ...GENERIC_PRIORITY_POOL]
  const byId = new Map<string, AdminAiQuickStart>()
  for (const row of merged) {
    const existing = byId.get(row.id)
    if (!existing || (row.priorityScore ?? 0) > (existing.priorityScore ?? 0)) {
      byId.set(row.id, row)
    }
  }
  return [...byId.values()].sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0))
}

export function filterHighPriorityPool(pool: AdminAiQuickStart[]): AdminAiQuickStart[] {
  return pool.filter((p) => (p.priorityScore ?? 0) >= HIGH_PRIORITY_MIN_SCORE)
}

export function toPriorityHistoryEntry(
  start: AdminAiQuickStart,
  status: 'attended' | 'ignored',
): AdminAiPriorityHistoryEntry {
  return {
    id: start.id,
    label: start.label,
    detail: start.detail,
    message: start.message,
    skillId: start.skillId,
    priorityScore: start.priorityScore ?? 5,
    at: Date.now(),
    status,
    nav: start.nav,
  }
}

export function historyEntryToQuickStart(entry: AdminAiPriorityHistoryEntry): AdminAiQuickStart {
  return {
    id: entry.id,
    kind: 'priority',
    label: entry.label,
    detail: entry.detail,
    message: entry.message,
    skillId: entry.skillId,
    priorityScore: entry.priorityScore,
    nav: entry.nav,
  }
}

/** Pick fresh priority rows — never repeats ids in excludeUntilReset unless pool is exhausted. */
export function selectFreshPrioritySuggestions(
  pool: AdminAiQuickStart[],
  count: number,
  options: {
    seed: string
    excludeIds: Set<string>
    attendedIds: Set<string>
  },
): { picks: AdminAiQuickStart[]; poolExhausted: boolean } {
  return selectFreshQuickStartSuggestions(pool, count, {
    ...options,
    filterPool: filterHighPriorityPool,
  })
}

function contextualCreativeSuggestions(ctx: AdminAiPageContext | null | undefined): AdminAiQuickStart[] {
  const studio = ctx?.studio
  const rows: AdminAiQuickStart[] = []
  if (studio?.releaseId) {
    const rid = studio.releaseId
    const title = studio.title || 'this release'
    rows.push({
      id: `creative-release-share-${rid}`,
      kind: 'creative',
      priorityScore: 8,
      label: `Share listen story for “${title}”`,
      detail: 'Clip picker angles + caption hooks for the share page.',
      message: `Plan a share-listen promo for "${title}" (release ${rid}): hook, 15s clip storyboard, and one smart-link CTA. Use studio snapshot if helpful.`,
      skillId: 'growth_marketing',
    })
    if (studio.activeStep === 'copy') {
      rows.push({
        id: `creative-release-copy-variants-${rid}`,
        kind: 'creative',
        priorityScore: 9,
        label: `Copy desk variants — ${title}`,
        detail: 'Three DSP/YouTube description angles from current copy intel.',
        message: `/exec query_release_studio_snapshot ${JSON.stringify({ releaseId: rid })} then propose three description variants (short, cinematic, club-focused).`,
        skillId: 'studio_release',
      })
    }
    rows.push({
      id: `creative-release-visualizer-${rid}`,
      kind: 'creative',
      priorityScore: 7,
      label: `Visualizer / Crowe teaser — ${title}`,
      detail: 'Quote-first clip concept tied to the open release.',
      message: `/exec query_crowe_creative ${JSON.stringify({ action: 'quote', kind: 'video', model: 'seedance', seconds: 5, resolution: '720P' })} then tie the concept to "${title}" grooves (no spend without confirm).`,
      skillId: 'sergik_intelligence',
    })
  }
  if (ctx?.surface === 'studio') {
    rows.push({
      id: 'creative-studio-pipeline',
      kind: 'creative',
      priorityScore: 7,
      label: 'Studio pipeline growth ideas',
      detail: 'Workflow wins beyond the open release.',
      message:
        '/exec query_studio_command_center {"dueWithinDays":30} then suggest 3 creative ops improvements (not blockers).',
      skillId: 'studio_release',
    })
  }
  return rows
}

/** Pick fresh rows — never repeats ids in excludeUntilReset unless pool is exhausted. */
export function selectFreshQuickStartSuggestions(
  pool: AdminAiQuickStart[],
  count: number,
  options: {
    seed: string
    excludeIds: Set<string>
    attendedIds: Set<string>
    /** Optional pre-filter (e.g. high-priority band only). */
    filterPool?: (pool: AdminAiQuickStart[]) => AdminAiQuickStart[]
  },
): { picks: AdminAiQuickStart[]; poolExhausted: boolean } {
  const base = options.filterPool ? options.filterPool(pool) : pool
  let candidates = base.filter((p) => !options.excludeIds.has(p.id) && !options.attendedIds.has(p.id))
  let poolExhausted = false
  if (candidates.length < count) {
    poolExhausted = true
    candidates = base.filter((p) => !options.attendedIds.has(p.id))
  }
  if (candidates.length === 0) {
    return { picks: [], poolExhausted: true }
  }

  const rand = mulberry32(hashSeed(options.seed))
  const topBand = candidates.slice(0, Math.min(Math.max(count * 3, 8), candidates.length))
  const shuffled = [...topBand]
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!]
  }
  return { picks: shuffled.slice(0, count), poolExhausted }
}

function createInitialRotatingQuickStartState(
  pool: AdminAiQuickStart[],
  sessionSeed: string,
  count: number,
  filterPool?: (pool: AdminAiQuickStart[]) => AdminAiQuickStart[],
): AdminAiPriorityQuickStartState {
  const { picks, poolExhausted } = selectFreshQuickStartSuggestions(pool, count, {
    seed: `${sessionSeed}-init`,
    excludeIds: new Set(),
    attendedIds: new Set(),
    filterPool,
  })
  return {
    current: picks,
    attended: [],
    ignored: [],
    refreshCount: 0,
    poolExhausted,
  }
}

function markRotatingQuickStartAttended(
  state: AdminAiPriorityQuickStartState,
  start: AdminAiQuickStart,
): AdminAiPriorityQuickStartState {
  const entry = toPriorityHistoryEntry(start, 'attended')
  return {
    ...state,
    current: state.current.filter((r) => r.id !== start.id),
    ignored: state.ignored.filter((e) => e.id !== start.id),
    attended: [entry, ...state.attended.filter((e) => e.id !== start.id)].slice(0, 40),
  }
}

function refreshRotatingQuickStartState(
  state: AdminAiPriorityQuickStartState,
  pool: AdminAiQuickStart[],
  sessionSeed: string,
  count: number,
  filterPool?: (pool: AdminAiQuickStart[]) => AdminAiQuickStart[],
): AdminAiPriorityQuickStartState {
  const exclude = new Set<string>()
  const attendedIds = new Set(state.attended.map((e) => e.id))
  for (const row of state.current) exclude.add(row.id)
  for (const row of state.ignored) exclude.add(row.id)

  const ignoredNow = state.current.map((row) => toPriorityHistoryEntry(row, 'ignored'))
  const nextRefresh = state.refreshCount + 1
  const { picks, poolExhausted } = selectFreshQuickStartSuggestions(pool, count, {
    seed: `${sessionSeed}-r${nextRefresh}-${Date.now()}`,
    excludeIds: exclude,
    attendedIds,
    filterPool,
  })

  return {
    current: picks,
    attended: state.attended,
    ignored: [...ignoredNow, ...state.ignored].slice(0, 40),
    refreshCount: nextRefresh,
    poolExhausted,
  }
}

export function createInitialPriorityQuickStartState(
  pool: AdminAiQuickStart[],
  sessionSeed: string,
): AdminAiPriorityQuickStartState {
  return createInitialRotatingQuickStartState(pool, sessionSeed, PRIORITY_QUICK_START_VISIBLE_COUNT, filterHighPriorityPool)
}

export function markPriorityQuickStartAttended(
  state: AdminAiPriorityQuickStartState,
  start: AdminAiQuickStart,
): AdminAiPriorityQuickStartState {
  return markRotatingQuickStartAttended(state, start)
}

export function refreshPriorityQuickStartState(
  state: AdminAiPriorityQuickStartState,
  pool: AdminAiQuickStart[],
  sessionSeed: string,
): AdminAiPriorityQuickStartState {
  return refreshRotatingQuickStartState(state, pool, sessionSeed, PRIORITY_QUICK_START_VISIBLE_COUNT, filterHighPriorityPool)
}

const CREATIVE_POOL: AdminAiQuickStart[] = [
  {
    id: 'creative-strategy-home',
    kind: 'creative',
    priorityScore: 8,
    label: 'Homepage conversion audit',
    detail: 'Product strategy pack — hero, proof, CTA, mobile.',
    message:
      '/plan Audit sergik.com homepage for conversion: one primary CTA, proof above fold, and mobile audio UX. Include draft_product_strategy_pack focus site_audit + conversion.',
    skillId: 'product_strategy',
  },
  {
    id: 'creative-campaign',
    kind: 'creative',
    priorityScore: 7,
    label: 'Draft release-week campaign',
    detail: 'Persisted campaign rows + tasks in Supabase.',
    message:
      '/exec generate_campaign_draft {"artistName":"SERGIK","campaignGoal":"Release week awareness + smart link clicks","channels":["instagram","youtube","spotify"]}',
    skillId: 'growth_marketing',
  },
  {
    id: 'creative-grow-spotify',
    kind: 'creative',
    priorityScore: 9,
    label: 'How do we grow Spotify?',
    detail: 'Growth coach grounded in platform scorecard.',
    message:
      'How do we grow Spotify monthly listeners this month? Cite query_platform_growth_snapshot — never invent analytics. Give 3 P0/P1 moves.',
    skillId: 'growth_marketing',
  },
  {
    id: 'creative-smartlink',
    kind: 'creative',
    priorityScore: 6,
    label: 'Smart link + UTM plan',
    detail: 'Attribution-safe links for bio and stories.',
    message:
      '/exec generate_smartlink_utm_plan {"destination":"https://sergik.com/music","campaign":"release_push","source":"instagram","medium":"social"}',
    skillId: 'smartlink_seo',
  },
  {
    id: 'creative-meta-promo',
    kind: 'creative',
    priorityScore: 8,
    label: 'Meta promo pipeline',
    detail: 'Preview the Instagram + Facebook schedule before anything posts.',
    message:
      '/plan Run the Meta promo pipeline: status, then generate the schedule, arm image slots, and preview publish due. Use run_meta_promo_pipeline. Do not DM followers.',
    skillId: 'product_strategy',
  },
  {
    id: 'creative-seo-music',
    kind: 'creative',
    priorityScore: 7,
    label: 'SEO cluster for /music + shares',
    detail: 'Keyword clusters and internal links for discovery.',
    message:
      '/plan SEO content brief: branded vs intent-led keywords for /music, share listen pages, and DJ software hub. Output paste-ready outlines.',
    skillId: 'product_strategy',
  },
  {
    id: 'creative-sergikai-chat',
    kind: 'creative',
    priorityScore: 8,
    label: 'Ask SergikAI harness',
    detail: 'OlliN Pro chat with server-side tools (preview first).',
    message:
      '/exec query_sergikai_chat {"content":"What should SERGIK prioritize this week across Release Studio, Sonic DNA, and site growth? Ground in harness probe if API is up.","dryRun":true}',
    skillId: 'sergik_intelligence',
  },
  {
    id: 'creative-crowe-quote',
    kind: 'creative',
    priorityScore: 6,
    label: 'Price a visualizer teaser clip',
    detail: 'Crowe Creative quote before spending credits.',
    message:
      '/exec query_crowe_creative {"action":"quote","kind":"video","model":"seedance","seconds":5,"resolution":"720P"}',
    skillId: 'sergik_intelligence',
  },
  {
    id: 'creative-youtube-viz',
    kind: 'creative',
    priorityScore: 7,
    label: 'YouTube visualizer chapter plan',
    detail: 'Continuous EP timestamps + tag vocabulary.',
    message:
      'Outline a YouTube visualizer description with continuous chapter timestamps and comma tags aligned to the groove lock. Ask me which release id if not in context.',
    skillId: 'studio_release',
  },
  {
    id: 'creative-dj-hub',
    kind: 'creative',
    priorityScore: 6,
    label: 'DJ software hub positioning',
    detail: 'Developer-artist crossover narrative.',
    message:
      '/plan Position the DJ software hub: credibility for developers, demo video storyboard, and download funnel CTA.',
    skillId: 'product_strategy',
  },
  {
    id: 'creative-sonic-dna',
    kind: 'creative',
    priorityScore: 7,
    label: 'Sonic DNA encyclopedia gap scan',
    detail: 'Harness probe for classifier + unified intelligence.',
    message:
      '/exec query_intelligence_harness {"mode":"probe","query":"Sonic DNA unified intelligence classifier encyclopedia gaps","limit":6}',
    skillId: 'sergik_intelligence',
  },
  {
    id: 'creative-fan-nurture',
    kind: 'creative',
    priorityScore: 6,
    label: 'Fan nurturing ideas',
    detail: 'Segments, email angles, and smart link CTAs.',
    message:
      '/exec query_ops_snapshot {"focus":"nurturing"} then suggest 3 low-lift fan engagement moves grounded in the counts returned.',
    skillId: 'admin_intel',
  },
  {
    id: 'creative-events',
    kind: 'creative',
    priorityScore: 5,
    label: 'Booking + events content',
    detail: 'Calendar CTAs and post-gig follow-up copy.',
    message:
      '/plan Draft booking page improvements: trust signals, rider FAQ, and Google Calendar / iCal clarity for promoters.',
    skillId: 'product_strategy',
  },
  {
    id: 'creative-merch',
    kind: 'creative',
    priorityScore: 5,
    label: 'Merch funnel scaffold',
    detail: 'Future storefront — strategy only, no fake SKUs.',
    message:
      '/plan Merch store MVP: product taxonomy, Stripe-first checkout flow, and launch checklist tied to artist brand.',
    skillId: 'product_strategy',
  },
  {
    id: 'creative-e2e',
    kind: 'creative',
    priorityScore: 4,
    label: 'Smoke-test guest admin paths',
    detail: 'Playwright e2e when dev server is up.',
    message: '/exec run_playwright_e2e {"spec":"e2e/admin-guest.spec.ts"}',
    skillId: 'e2e_qa',
  },
  {
    id: 'creative-social-caption',
    kind: 'creative',
    priorityScore: 7,
    label: 'Social caption variants',
    detail: 'Three hooks × one CTA — no fake viral claims.',
    message:
      'Draft three Instagram caption variants (hook + feel + one CTA) for the next release. Use studio context if I have a release open; otherwise ask which title.',
    skillId: 'growth_marketing',
  },
]

export function buildCreativeSuggestionPool(ctx: AdminAiPageContext | null | undefined): AdminAiQuickStart[] {
  const merged = [...contextualCreativeSuggestions(ctx), ...CREATIVE_POOL]
  const byId = new Map<string, AdminAiQuickStart>()
  for (const row of merged) {
    const existing = byId.get(row.id)
    if (!existing || (row.priorityScore ?? 0) > (existing.priorityScore ?? 0)) {
      byId.set(row.id, row)
    }
  }
  return [...byId.values()].sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0))
}

export function createInitialCreativeQuickStartState(
  pool: AdminAiQuickStart[],
  sessionSeed: string,
): AdminAiCreativeQuickStartState {
  return createInitialRotatingQuickStartState(pool, sessionSeed, CREATIVE_QUICK_START_VISIBLE_COUNT)
}

export function markCreativeQuickStartAttended(
  state: AdminAiCreativeQuickStartState,
  start: AdminAiQuickStart,
): AdminAiCreativeQuickStartState {
  return markRotatingQuickStartAttended(state, start)
}

export function refreshCreativeQuickStartState(
  state: AdminAiCreativeQuickStartState,
  pool: AdminAiQuickStart[],
  sessionSeed: string,
): AdminAiCreativeQuickStartState {
  return refreshRotatingQuickStartState(state, pool, sessionSeed, CREATIVE_QUICK_START_VISIBLE_COUNT)
}

/** @deprecated use creative quick-start state */
export function buildCreativeQuickStarts(sessionSeed: string, _excludeIds?: Set<string>): AdminAiQuickStart[] {
  return createInitialCreativeQuickStartState(buildCreativeSuggestionPool(null), sessionSeed).current
}

/** @deprecated use buildCreativeQuickStarts + priority state */
export function buildAdminAiQuickStarts(
  sessionSeed: string,
  pageContext?: AdminAiPageContext | null,
): AdminAiQuickStart[] {
  const pool = buildPrioritySuggestionPool(pageContext)
  const priority = createInitialPriorityQuickStartState(pool, sessionSeed).current
  const creative = createInitialCreativeQuickStartState(
    buildCreativeSuggestionPool(pageContext),
    sessionSeed,
  ).current
  return [...priority, ...creative]
}
