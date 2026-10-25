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

export type AdminAiFormFieldSnapshot = {
  label: string
  name: string
  value: string
  required: boolean
  invalid: boolean
}

export type AdminAiPageContext = {
  surface: 'admin' | 'studio'
  pathname: string
  studio?: AdminAiStudioReleaseContext | null
  /** When false, focus tracking and field copilot prompts are disabled. */
  focusCopilotEnabled?: boolean
  focus?: AdminAiFocusContext | null
  /** Visible controls on the signed-in page. The side browser cannot see these. */
  formFields?: AdminAiFormFieldSnapshot[]
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
      'Do not invent ISRCs, UPCs, or live DSP status — only state what context or tools return.',
      r.activeStep === 'copy'
        ? [
            '',
            'User is on the Copy workflow step — prioritize marketing_copy fields using snapshot adminAiBrief (Sonic DNA intel + YouTube timestamps).',
            'Preview with /exec patch_release_marketing_copy merge:true dryRun:true; pair product_strategy for discovery expansion on tags/social/store.',
          ].join('\n')
        : '',
      r.activeStep === 'catalog'
        ? '\nUser is on Catalog — check ISRCs, preview clips, DSP ingest hygiene, and durations for YouTube visualizer timelines.'
        : '',
      r.activeStep === 'rights'
        ? '\nUser is on Rights — copyright checklist + SERGIK UGC pack only; never claim YouTube/TikTok/Meta earnings unless ugc_pack is live.'
        : ''
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

  if (ctx.formFields?.length) {
    const rows = ctx.formFields.slice(0, 40).map((field) => {
      const flags = [field.required ? 'required' : '', field.invalid ? 'invalid' : ''].filter(Boolean).join(' ')
      const value = field.value ? JSON.stringify(field.value) : '(empty)'
      return `- ${field.label || field.name || 'field'}: ${value}${flags ? ` ${flags}` : ''}`
    })
    lines.push(
      '',
      'Open form on the signed-in page (live values, not the side browser):',
      ...rows,
      'Answer field questions from this list. Do not invent a value that is not here.',
    )
  }

  return lines.filter(Boolean).join('\n')
}

const SECRET_FIELD = /password|secret|token|api[_-]?key|credential/i

/** Visible inputs on the signed-in admin or studio page. Skips the chat panel and secrets. */
export function collectSignedInFormFields(
  doc: Pick<Document, 'querySelectorAll'> | null | undefined = typeof document === 'undefined' ? null : document,
): AdminAiFormFieldSnapshot[] {
  if (!doc) return []
  const nodes = Array.from(doc.querySelectorAll('input, textarea, select')) as Array<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >
  const out: AdminAiFormFieldSnapshot[] = []
  for (const el of nodes) {
    if (out.length >= 40) break
    if (el.closest('[data-admin-ai-panel]')) continue
    const input = el as HTMLInputElement
    const type = (input.type || el.tagName).toLowerCase()
    if (type === 'hidden' || type === 'password' || type === 'file' || type === 'submit' || type === 'button') continue
    const name = input.name || el.id || ''
    const style = typeof window !== 'undefined' ? window.getComputedStyle(el) : null
    const rect = el.getBoundingClientRect?.()
    if (style && (style.display === 'none' || style.visibility === 'hidden')) continue
    if (rect && (rect.width < 1 || rect.height < 1)) continue
    let label = ''
    const escapeId =
      typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(el.id) : el.id.replace(/"/g, '')
    if (el.id && 'querySelector' in el.ownerDocument) {
      const byFor = el.ownerDocument.querySelector(`label[for="${escapeId}"]`)
      if (byFor?.textContent) label = byFor.textContent
    }
    if (!label) label = el.getAttribute('aria-label') || el.getAttribute('placeholder') || name
    label = label.replace(/\s+/g, ' ').trim().slice(0, 80)
    if (SECRET_FIELD.test(`${name} ${label}`)) continue
    const value = String(input.value || '').replace(/\s+/g, ' ').trim().slice(0, 120)
    out.push({
      label,
      name: name.slice(0, 80),
      value,
      required: Boolean(input.required || el.getAttribute('aria-required') === 'true'),
      invalid: el.getAttribute('aria-invalid') === 'true',
    })
  }
  return out
}
