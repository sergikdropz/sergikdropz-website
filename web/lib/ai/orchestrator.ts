import { getSkillById, getSkillByTool, inferSkillFromIntent, validateAgainstSkillSchema } from '@/lib/ai/skills/registry'
import { AdminAiTool, isAdminAiToolExecutionEnabled, isAllowedTool } from '@/lib/admin-ai'

export type OrchestratorStep = {
  id: string
  tool: AdminAiTool
  payload: Record<string, unknown>
  requiresApproval: boolean
  riskTier: string
  skillId: string | null
}

export type PlanGraph = {
  mode: 'tool' | 'intent'
  summary: string
  steps: OrchestratorStep[]
  approvalRequired: boolean
}

function buildStep(tool: AdminAiTool, payload: Record<string, unknown>): OrchestratorStep {
  const skill = getSkillByTool(tool)
  return {
    id: `step_${tool}_${Math.random().toString(36).slice(2, 8)}`,
    tool,
    payload,
    requiresApproval: true,
    riskTier: skill?.riskTier ?? 'tier_1_draft',
    skillId: skill?.id ?? null,
  }
}

function normalizePayload(payload: Record<string, unknown> | undefined) {
  return payload ?? {}
}

function toSafeCampaignSlug(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'release-week'
  )
}

function inferReleaseName(message: string) {
  const quoted = message.match(/"([^"]{3,80})"/)
  if (quoted?.[1]) return quoted[1].trim()

  const releasePattern = message.match(/release(?:\s+for|\s+called|\s+named)?\s+([a-z0-9' -]{3,60})/i)
  if (releasePattern?.[1]) return releasePattern[1].trim()

  return 'Upcoming Release'
}

function defaultPayloadForTool(tool: AdminAiTool, message: string): Record<string, unknown> {
  if (tool === 'create_release_checklist') {
    const releaseName = inferReleaseName(message)
    const releaseDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    return { releaseName, releaseDate }
  }

  if (tool === 'generate_campaign_draft') {
    const releaseName = inferReleaseName(message)
    return {
      artistName: 'SERGIK',
      campaignGoal: `Drive awareness and streams for ${releaseName}`,
      channels: ['instagram', 'youtube', 'spotify'],
    }
  }

  if (tool === 'draft_product_strategy_pack') {
    const m = message.toLowerCase()
    const weeksMatch = message.match(/(\d+)\s*weeks?/)
    const weeks =
      weeksMatch ? Number(weeksMatch[1]) :
      m.includes('month') ? 8 :
      4
    const urlMatch = message.match(/https?:\/\/[^\s<>"')]+/)
    const goal =
      message.replace(/^\/plan\s+/i, '').trim().slice(0, 400) ||
      inferReleaseName(message)
    const focuses: string[] = []
    if (/(audit|screenshot|heuristic|\bau\/ux\b)/i.test(message)) focuses.push('site_audit')
    if (/(conversion|funnel|landing|email sequence|\bcro\b)/i.test(message)) focuses.push('conversion')
    if (/(seo|keyword|content brief|site structure)/i.test(message)) focuses.push('seo')
    if (/(launch checklist|social calendar|campaign blueprint|timing)/i.test(message)) focuses.push('campaign')
    if (/(admin|config|snippet|paste|\butm\b|newsletter template)/i.test(message)) focuses.push('admin_config')
    const payload: Record<string, unknown> = {
      brandName: 'SERGIK',
      primaryGoal: goal,
      timelineWeeks: weeks,
    }
    if (urlMatch?.[0]) payload.siteUrl = urlMatch[0]
    if (focuses.length) payload.focusAreas = focuses
    return payload
  }

  if (tool === 'run_playwright_e2e') {
    return {
      spec: 'e2e/admin-guest.spec.ts',
    }
  }

  if (tool === 'run_applescript') {
    return {
      script: 'return "admin-ai mac ready"',
    }
  }

  if (tool === 'query_ops_snapshot') {
    const m = message.toLowerCase()
    let focus: string = 'all'
    if (m.includes('studio') && m.includes('distribution') && !m.includes('nurturing')) {
      focus = 'studio'
    } else if (
      m.includes('nurturing') ||
      (m.includes('campaign') && !m.includes('distribution')) ||
      m.includes('fans') ||
      m.includes('smart link')
    ) {
      focus = 'nurturing'
    } else if (m.includes('studio only') || (m.includes('release studio') && m.includes('only'))) {
      focus = 'studio'
    }
    return { focus }
  }

  if (tool === 'query_release_studio_snapshot') {
    const idMatch = message.match(/release[-_a-z0-9]+/i)
    return {
      releaseId: idMatch?.[0] ?? 'release-current',
    }
  }

  if (tool === 'query_studio_command_center') {
    const daysMatch = message.match(/(\d+)\s*days?/)
    return {
      dueWithinDays: daysMatch ? Number(daysMatch[1]) : 7,
    }
  }

  if (tool === 'patch_release_marketing_copy') {
    const idMatch = message.match(/release[-_a-z0-9]+/i)
    return {
      releaseId: idMatch?.[0] ?? '',
      marketingCopy: {},
      merge: true,
    }
  }

  if (tool === 'update_copyright_checklist') {
    const idMatch = message.match(/release[-_a-z0-9]+/i)
    return {
      releaseId: idMatch?.[0] ?? '',
      updates: {},
    }
  }

  if (tool === 'assign_isrcs') {
    const idMatch = message.match(/release[-_a-z0-9]+/i)
    return {
      releaseId: idMatch?.[0] ?? '',
    }
  }

  if (tool === 'create_distribution_release_draft') {
    const title = inferReleaseName(message)
    const nextMonth = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const m = message.toLowerCase()
    const type = m.includes(' album') || m.includes(' lp') ? 'album' : m.includes(' ep') ? 'ep' : 'single'
    return {
      title,
      type,
      releaseDate: nextMonth,
    }
  }

  return {
    destination: 'https://sergik.com/music',
    campaign: 'release-week',
    source: 'instagram',
    medium: 'social',
  }
}

export function buildPlanGraphForTool(tool: AdminAiTool, payload?: Record<string, unknown>): PlanGraph {
  if (!isAdminAiToolExecutionEnabled(tool)) {
    return {
      mode: 'tool',
      summary: `Tool ${tool} is temporarily disabled (ADMIN_AI_DISABLED_TOOLS)`,
      steps: [],
      approvalRequired: false,
    }
  }
  const step = buildStep(tool, normalizePayload(payload))
  return {
    mode: 'tool',
    summary: `Single-step plan for ${tool}`,
    steps: [step],
    approvalRequired: true,
  }
}

export function buildPlanGraphForIntent(
  message: string,
  options?: {
    /** When set, build a plan around this skill's primary tool (admin agents). */
    skillId?: string
  }
): PlanGraph {
  const lowered = message.toLowerCase()
  const steps: OrchestratorStep[] = []

  if (options?.skillId) {
    const forced = getSkillById(options.skillId)
    if (forced) {
      const tool = forced.allowedTools[0]
      if (tool && isAllowedTool(tool)) {
        if (isAdminAiToolExecutionEnabled(tool)) {
          steps.push(buildStep(tool, defaultPayloadForTool(tool, message)))
        }
      }
    }
  }

  if (steps.length === 0 && options?.skillId && getSkillById(options.skillId)) {
    return {
      mode: 'intent',
      summary: `Agent ${options.skillId} has no runnable step (tool disabled or missing)`,
      steps: [],
      approvalRequired: false,
    }
  }

  if (steps.length === 0) {
    // Minimal multi-step choreography for common admin intents.
    const releaseIdMatch = message.match(/release[-_a-z0-9]+/i)
    const releaseId = releaseIdMatch?.[0] ?? null
    const releaseName = inferReleaseName(message)

    if (
      (lowered.includes('post-launch') ||
        lowered.includes('post launch') ||
        lowered.includes('launch handoff') ||
        lowered.includes('campaign handoff') ||
        (lowered.includes('live') && lowered.includes('campaign'))) &&
      (lowered.includes('campaign') || lowered.includes('smartlink') || lowered.includes('utm'))
    ) {
      const campaignPayload = {
        ...defaultPayloadForTool('generate_campaign_draft', message),
        releaseId,
        campaignGoal: `Post-launch push for ${releaseName}`,
      }
      const utmPayload = {
        destination: releaseId
          ? `https://sergik.com/studio/releases/${encodeURIComponent(releaseId)}`
          : 'https://sergik.com/music',
        campaign: toSafeCampaignSlug(releaseName),
        source: 'instagram',
        medium: 'social',
        releaseId,
      }
      steps.push(
        buildStep('generate_campaign_draft', campaignPayload),
        buildStep('generate_smartlink_utm_plan', utmPayload)
      )
    } else if (lowered.includes('release') && lowered.includes('campaign')) {
      steps.push(
        buildStep('create_release_checklist', defaultPayloadForTool('create_release_checklist', message)),
        buildStep('generate_campaign_draft', defaultPayloadForTool('generate_campaign_draft', message))
      )
    } else {
      const inferred = inferSkillFromIntent(message)
      const tool = inferred.allowedTools[0]
      if (tool && isAllowedTool(tool)) {
        steps.push(buildStep(tool, defaultPayloadForTool(tool, message)))
      }
    }
  }

  const beforeFilter = steps.length
  const enabledSteps = steps.filter((step) => isAdminAiToolExecutionEnabled(step.tool))
  const omitted = beforeFilter - enabledSteps.length

  let summary =
    enabledSteps.length > 1 ? 'Multi-step orchestration plan' : 'Single-step intent plan'
  if (omitted > 0) {
    summary += ` (${omitted} step(s) omitted: tool disabled via ADMIN_AI_DISABLED_TOOLS)`
  }

  return {
    mode: 'intent',
    summary,
    steps: enabledSteps,
    approvalRequired: enabledSteps.length > 0,
  }
}

export function validatePlanSteps(steps: OrchestratorStep[]) {
  const errors: string[] = []

  for (const step of steps) {
    if (!isAllowedTool(step.tool)) {
      errors.push(`Step ${step.id}: tool ${step.tool} is not whitelisted`)
      continue
    }

    if (!isAdminAiToolExecutionEnabled(step.tool)) {
      errors.push(`Step ${step.id}: tool ${step.tool} is temporarily disabled (ADMIN_AI_DISABLED_TOOLS)`)
      continue
    }

    const skill = getSkillByTool(step.tool)
    if (!skill?.inputSchema) continue
    const validation = validateAgainstSkillSchema(step.payload, skill.inputSchema)
    if (!validation.valid) {
      errors.push(`Step ${step.id}: ${validation.errors.join('; ')}`)
    }
  }

  return { valid: errors.length === 0, errors }
}
