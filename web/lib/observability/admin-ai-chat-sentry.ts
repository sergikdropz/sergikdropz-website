import * as Sentry from '@sentry/nextjs'

/**
 * Sentry breadcrumbs for admin AI chat routing (no user message text).
 * Safe when DSN is unset — SDK no-ops.
 */
export function addAdminAiChatRoutingBreadcrumb(data: {
  continuationOnly: boolean
  stickyPersonaApplied: boolean
  promptTruncated: boolean
  stickyDroppedStale: boolean
  stickyInferredAtPresent: boolean
  inferredSkillId: string
  skillLocked: boolean
}): void {
  Sentry.addBreadcrumb({
    category: 'admin_ai.chat',
    type: 'default',
    message: 'admin_chat_routing',
    level: 'info',
    data: {
      continuation_only: data.continuationOnly,
      sticky_persona_applied: data.stickyPersonaApplied,
      prompt_truncated: data.promptTruncated,
      sticky_dropped_stale: data.stickyDroppedStale,
      sticky_inferred_at_present: data.stickyInferredAtPresent,
      inferred_skill_id: data.inferredSkillId,
      skill_locked: data.skillLocked,
    },
  })
}
