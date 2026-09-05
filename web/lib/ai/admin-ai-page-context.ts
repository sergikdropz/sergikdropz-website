import {
  formatAdminAiFocusForPrompt,
  type AdminAiFocusContext,
} from '@/lib/ai/admin-ai-focus-context'

/** Client-provided UI context so Admin AI can ground answers in the current Release Studio view. */
export type AdminAiStudioReleaseContext = {
  releaseId: string
  title: string
  type?: string
  distributorStatus?: string
  releaseDate?: string | null
  readinessScore?: number
  nextAction?: string
  blockers?: string[]
  activeStep?: string
  completedSteps?: string[]
  trackCount?: number
  hasArtwork?: boolean
  hasGenre?: boolean
}

export type AdminAiPageContext = {
  surface: 'admin' | 'studio'
  pathname: string
  studio?: AdminAiStudioReleaseContext | null
  /** When false, focus tracking and field copilot prompts are disabled. */
  focusCopilotEnabled?: boolean
  focus?: AdminAiFocusContext | null
}

export function formatAdminAiPageContextForPrompt(ctx: AdminAiPageContext | null | undefined): string {
  if (!ctx) return ''

  const lines: string[] = [
    `UI surface: ${ctx.surface}`,
    `Path: ${ctx.pathname}`,
  ]

  if (ctx.studio?.releaseId) {
    const r = ctx.studio
    lines.push(
      '',
      'Active Release Studio release (user is viewing this release):',
      `- id: ${r.releaseId}`,
      `- title: ${r.title}`,
      r.type ? `- type: ${r.type}` : '',
      r.distributorStatus ? `- distributor_status: ${r.distributorStatus}` : '',
      r.releaseDate ? `- release_date: ${r.releaseDate}` : '',
      r.readinessScore != null ? `- readiness_score: ${r.readinessScore}` : '',
      r.nextAction ? `- next_best_action: ${r.nextAction}` : '',
      r.activeStep ? `- workflow_step_in_view: ${r.activeStep}` : '',
      r.completedSteps?.length
        ? `- completed_workflow_steps: ${r.completedSteps.join(', ')}`
        : '',
      r.trackCount != null ? `- track_count: ${r.trackCount}` : '',
      r.blockers?.length ? `- blockers: ${r.blockers.join('; ')}` : '',
      '',
      'When the user asks what is missing, blockers, or readiness for "this release", use release id above.',
      'Prefer /exec query_release_studio_snapshot with that releaseId, or query_ops_snapshot focus=studio for pipeline-wide counts.',
      'Do not invent ISRCs, UPCs, or live DSP status — only state what context or tools return.'
    )
  } else if (ctx.surface === 'studio') {
    lines.push(
      '',
      'User is in Release Studio but not on a specific release page.',
      'For pipeline counts use /exec query_ops_snapshot focus=studio.',
      'To create a draft use /exec create_distribution_release_draft or agent mode studio_release.'
    )
  }

  if (ctx.focusCopilotEnabled !== false && ctx.focus) {
    const focusBlock = formatAdminAiFocusForPrompt(ctx.focus)
    if (focusBlock) lines.push(focusBlock)
  } else if (ctx.focusCopilotEnabled === false) {
    lines.push('', 'Field copilot is OFF — do not assume a focused form field unless the user names one.')
  }

  return lines.filter(Boolean).join('\n')
}
