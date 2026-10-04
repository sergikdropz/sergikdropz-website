import type { AdminAiQuickStart } from '@/lib/admin-ai-quick-starts'
import type { AdminAiStudioNavTarget } from '@/lib/admin-ai-studio-nav'
import { workflowStepForActionKind } from '@/lib/studio/studio-ia'

export type QuickStartSectionKey = 'playbooks' | 'unfinished' | 'priority' | 'creative'

export type QuickStartExpandState = Record<QuickStartSectionKey, boolean>

export const ADMIN_AI_QUICKSTART_EXPAND_LS = 'admin-ai-quickstart-expand-v1'

export const EMPTY_QUICKSTART_EXPAND: QuickStartExpandState = {
  playbooks: false,
  unfinished: false,
  priority: false,
  creative: false,
}

export type ReleaseMissionDockHints = {
  nextAction: string | null
  nextActionKind: string | null
  blockers: string[]
}

/** Which single section to auto-expand on a fresh session (no saved toggle state). */
export function pickSmartDefaultExpandedSection(input: {
  hasRelease: boolean
  unfinishedCount: number
  priorityCount: number
  blockerCount: number
}): QuickStartSectionKey | null {
  if (input.unfinishedCount > 0) return 'unfinished'
  if (input.hasRelease && input.blockerCount > 0) return 'priority'
  if (input.priorityCount > 0) return 'priority'
  if (!input.hasRelease) return 'creative'
  return null
}

export function loadQuickStartExpandState(sessionId: string): QuickStartExpandState | null {
  if (typeof window === 'undefined' || !sessionId) return null
  try {
    const raw = localStorage.getItem(ADMIN_AI_QUICKSTART_EXPAND_LS)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, Partial<QuickStartExpandState>>
    const row = parsed[sessionId]
    if (!row || typeof row !== 'object') return null
    return {
      playbooks: Boolean(row.playbooks),
      unfinished: Boolean(row.unfinished),
      priority: Boolean(row.priority),
      creative: Boolean(row.creative),
    }
  } catch {
    return null
  }
}

export function saveQuickStartExpandState(sessionId: string, state: QuickStartExpandState): void {
  if (typeof window === 'undefined' || !sessionId) return
  try {
    const raw = localStorage.getItem(ADMIN_AI_QUICKSTART_EXPAND_LS)
    const parsed = raw ? (JSON.parse(raw) as Record<string, QuickStartExpandState>) : {}
    parsed[sessionId] = state
    const keys = Object.keys(parsed)
    const trimmed =
      keys.length > 24
        ? Object.fromEntries(keys.slice(-24).map((k) => [k, parsed[k]!]))
        : parsed
    localStorage.setItem(ADMIN_AI_QUICKSTART_EXPAND_LS, JSON.stringify(trimmed))
  } catch {
    /* quota */
  }
}

/** Quick-start row for mission strip “Fix top blocker”. */
export function buildMissionBlockerFixQuickStart(
  releaseId: string,
  mission: ReleaseMissionDockHints,
): AdminAiQuickStart | null {
  const label = mission.nextAction?.trim() || mission.blockers[0]?.trim()
  if (!label) return null

  const step = workflowStepForActionKind(mission.nextActionKind)
  const nav: AdminAiStudioNavTarget = { releaseId, step }
  const blockerNote =
    mission.blockers.length > 0
      ? `${mission.blockers.length} blocker${mission.blockers.length === 1 ? '' : 's'} in mission control`
      : 'Top mission action'

  let message = `Release "${releaseId}": ${label}. Start with /exec query_release_studio_snapshot ${JSON.stringify({ releaseId })} then propose the safest dry-run fix.`
  if (mission.nextActionKind === 'assign_isrc') {
    message = [
      `Assign missing ISRCs for release ${releaseId}.`,
      `Preview first: /exec assign_isrcs ${JSON.stringify({ releaseId, dryRun: true })}`,
      'List tracks still missing ISRCs and whether auto-assign is safe.',
    ].join(' ')
  }

  return {
    id: `mission-fix-${mission.nextActionKind || 'blocker'}`,
    kind: 'priority',
    label,
    detail: blockerNote,
    message,
    skillId: 'studio_release',
    priorityScore: 10,
    nav,
  }
}
