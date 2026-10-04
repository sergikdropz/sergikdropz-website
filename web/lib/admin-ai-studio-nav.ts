import type { WorkflowStepId } from '@/lib/studio/constants'
import type { RightsActionSection } from '@/lib/studio/rights-action-target'
import { studioReleaseHref } from '@/lib/studio/studio-ia'

export type AdminAiStudioNavTarget = {
  releaseId: string
  step?: WorkflowStepId
  section?: RightsActionSection
  trackId?: string
  party?: string
}

const PENDING_STUDIO_NAV_KEY = 'sergik:admin-ai-studio-nav-v1'

export function stashPendingStudioNav(target: AdminAiStudioNavTarget) {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(PENDING_STUDIO_NAV_KEY, JSON.stringify(target))
  } catch {
    /* quota */
  }
}

/** Apply focus after navigation when the release workspace mounts. */
export function consumePendingStudioNav(releaseId: string): AdminAiStudioNavTarget | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(PENDING_STUDIO_NAV_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AdminAiStudioNavTarget
    if (String(parsed.releaseId || '') !== releaseId) return null
    sessionStorage.removeItem(PENDING_STUDIO_NAV_KEY)
    return parsed
  } catch {
    sessionStorage.removeItem(PENDING_STUDIO_NAV_KEY)
    return null
  }
}

export const RELEASE_MISSION_REFRESH_EVENT = 'sergik:release-mission-refresh'

export function dispatchReleaseMissionRefresh(releaseId: string) {
  if (typeof window === 'undefined' || !releaseId) return
  window.dispatchEvent(
    new CustomEvent(RELEASE_MISSION_REFRESH_EVENT, { detail: { releaseId } }),
  )
}

export function dispatchAdminAiStudioNavigate(target: AdminAiStudioNavTarget) {
  if (typeof window === 'undefined') return
  stashPendingStudioNav(target)
  window.dispatchEvent(new CustomEvent('admin-ai:studio-navigate', { detail: target }))
}

export function studioNavigateHref(target: AdminAiStudioNavTarget): string {
  return studioReleaseHref(target.releaseId, target.step ?? null)
}
