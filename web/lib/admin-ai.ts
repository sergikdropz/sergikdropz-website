import { createSupabaseServerClient } from '@/lib/supabase'
import {
  generateAdminChatReply,
  type AdminChatModelOverrides,
  type AdminAiChatProvider,
} from '@/lib/ai/admin-chat-providers'
import type { AdminChatEnergyPreset, AdminChatHonestyMode } from '@/lib/ai/admin-chat-session-tuning'
import type { AdminAiAutoRouterMode } from '@/lib/ai/admin-chat-router'
import { getSkillByTool, validateAgainstSkillSchema } from '@/lib/ai/skills/registry'
import { executeAppleScript, executePlaywrightE2E } from '@/lib/admin-ai-automation'
import { fetchReleaseStudioSnapshot } from '@/lib/studio/release-snapshot'
import { fetchStudioCommandCenterSnapshot } from '@/lib/studio/command-center-snapshot'
import {
  applyAssignIsrcs,
  applyPatchReleaseMarketingCopy,
  applyUpdateCopyrightChecklist,
  previewAssignIsrcs,
  previewPatchReleaseMarketingCopy,
  previewUpdateCopyrightChecklist,
} from '@/lib/studio/admin-ai-studio-tools'
import {
  buildProductStrategyPack,
  normalizeProductStrategyPackPayload,
} from '@/lib/ai/product-strategy-pack'
import { refineProductStrategyPackMarkdown } from '@/lib/ai/refine-strategy-pack'
import {
  TOOL_POLICY,
  isAllowedTool,
  isAdminAiToolExecutionEnabled,
  getGloballyDisabledAdminAiTools,
  type AdminAiTool,
} from '@/lib/ai/tool-policy'

export type { AdminAiChatProvider } from '@/lib/ai/admin-chat-providers'
export type { AdminAiTool }
export { isAllowedTool, isAdminAiToolExecutionEnabled, getGloballyDisabledAdminAiTools }

type ToolResult = {
  title: string
  summary: string
  output: Record<string, unknown>
  riskTier: 'tier_1_draft' | 'tier_2_operational'
  requiresApproval: boolean
}

const TOOL_CONFIG: Record<AdminAiTool, { riskTier: ToolResult['riskTier']; requiresApproval: boolean }> =
  Object.fromEntries(
    (Object.keys(TOOL_POLICY) as AdminAiTool[]).map((tool) => [
      tool,
      {
        riskTier: TOOL_POLICY[tool].riskTier,
        requiresApproval: TOOL_POLICY[tool].requiresApproval,
      },
    ])
  ) as Record<AdminAiTool, { riskTier: ToolResult['riskTier']; requiresApproval: boolean }>

export function validateToolPayload(tool: AdminAiTool, payload: Record<string, unknown>) {
  const skill = getSkillByTool(tool)
  if (!skill?.inputSchema) {
    return { valid: true, errors: [] as string[] }
  }
  return validateAgainstSkillSchema(payload, skill.inputSchema)
}

export async function createAiRun(params: {
  adminId: string
  requestType: 'chat' | 'execute'
  prompt: string
}) {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('ai_runs')
    .insert({
      admin_id: params.adminId,
      request_type: params.requestType,
      prompt: params.prompt,
      status: 'pending',
    })
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(`Failed to create AI run: ${error?.message || 'unknown error'}`)
  }

  return data.id as string
}

export async function updateAiRun(params: {
  runId: string
  status: 'completed' | 'failed' | 'approval_required'
  response?: Record<string, unknown>
  errorMessage?: string
}) {
  const supabase = createSupabaseServerClient()
  const updateRow: Record<string, unknown> = {
    status: params.status,
    response: params.response ?? null,
    error_message: params.errorMessage ?? null,
  }
  if (params.status === 'completed' || params.status === 'failed') {
    updateRow.completed_at = new Date().toISOString()
  }

  const { error } = await supabase.from('ai_runs').update(updateRow).eq('id', params.runId)

  if (error) {
    console.error('Failed to update ai_runs:', error)
  }
}

/** Shallow-merge into `ai_runs.response` without changing status or completed_at (for plan/timeline progress). */
export async function patchAiRunResponse(runId: string, partial: Record<string, unknown>) {
  const supabase = createSupabaseServerClient()
  const { data, error: fetchError } = await supabase.from('ai_runs').select('response').eq('id', runId).single()
  if (fetchError) {
    console.error('Failed to read ai_runs for patch:', fetchError)
    return
  }
  const current = (data?.response as Record<string, unknown> | null) ?? {}
  const merged = { ...current, ...partial }
  const { error } = await supabase.from('ai_runs').update({ response: merged }).eq('id', runId)
  if (error) {
    console.error('Failed to patch ai_runs.response:', error)
  }
}

export async function createAiAction(params: {
  runId: string
  tool: AdminAiTool
  payload: Record<string, unknown>
  status: 'previewed' | 'executed' | 'blocked'
  result?: Record<string, unknown>
}) {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('ai_actions')
    .insert({
      run_id: params.runId,
      tool_name: params.tool,
      payload: params.payload,
      status: params.status,
      result: params.result ?? null,
    })
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(`Failed to create AI action: ${error?.message || 'unknown error'}`)
  }

  return data.id as string
}

export async function createAiApproval(params: {
  runId: string
  actionId: string
  approvedBy: string
  approvalNote?: string
}) {
  const supabase = createSupabaseServerClient()
  const { error } = await supabase
    .from('ai_approvals')
    .insert({
      run_id: params.runId,
      action_id: params.actionId,
      approved_by: params.approvedBy,
      approval_note: params.approvalNote ?? null,
      approved: true,
      approved_at: new Date().toISOString(),
    })

  if (error) {
    throw new Error(`Failed to create approval: ${error.message}`)
  }
}

export async function updateAiAction(params: {
  actionId: string
  status: 'previewed' | 'executed' | 'blocked'
  result?: Record<string, unknown>
}) {
  const supabase = createSupabaseServerClient()
  const { error } = await supabase
    .from('ai_actions')
    .update({
      status: params.status,
      result: params.result ?? null,
    })
    .eq('id', params.actionId)

  if (error) {
    throw new Error(`Failed to update AI action: ${error.message}`)
  }
}

export async function getLatestActionId(runId: string) {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('ai_actions')
    .select('id')
    .eq('run_id', runId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to fetch action: ${error.message}`)
  }

  return (data?.id as string | undefined) ?? null
}

function toSafeSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

function deriveDueDate(offsetDays: number) {
  const now = new Date()
  now.setDate(now.getDate() + offsetDays)
  return now.toISOString().slice(0, 10)
}

async function createReleaseChecklistTasks(params: {
  releaseName: string
  releaseDate: string
  adminId: string
  runId?: string
}) {
  const supabase = createSupabaseServerClient()
  const releaseDateObj = new Date(params.releaseDate)
  const validReleaseDate = !Number.isNaN(releaseDateObj.getTime())
  const releaseIso = validReleaseDate ? releaseDateObj.toISOString().slice(0, 10) : null

  const template = [
    {
      title: `Finalize masters + metadata for ${params.releaseName}`,
      description: 'Confirm master quality, ISRC/UPC, and distributor metadata before submission.',
      owner_label: 'Admin Ops',
      due_date: releaseIso ?? deriveDueDate(7),
      priority: 'high',
    },
    {
      title: `Validate artwork specs for ${params.releaseName}`,
      description: 'Confirm artwork dimensions, safe zones, and platform compliance.',
      owner_label: 'Creative',
      due_date: releaseIso ?? deriveDueDate(9),
      priority: 'medium',
    },
    {
      title: `Prepare launch distribution handoff for ${params.releaseName}`,
      description: 'Queue distribution package and verify release date/timezone settings.',
      owner_label: 'Release Ops',
      due_date: releaseIso ?? deriveDueDate(10),
      priority: 'high',
    },
    {
      title: `Review social + email launch assets for ${params.releaseName}`,
      description: 'Approve short-form copy, hooks, and launch day CTA variants.',
      owner_label: 'Marketing Lead',
      due_date: releaseIso ?? deriveDueDate(12),
      priority: 'medium',
    },
  ]

  const { data, error } = await supabase
    .from('admin_tasks')
    .insert(
      template.map((item) => ({
        ...item,
        status: 'todo',
        source: 'ai_release_checklist',
        source_ref: params.runId ?? null,
        metadata: {
          releaseName: params.releaseName,
          releaseDate: params.releaseDate,
        },
        created_by: params.adminId,
      }))
    )
    .select('id, title, due_date, owner_label, status, priority')

  if (error) {
    throw new Error(`Failed to create checklist tasks: ${error.message}`)
  }

  return data ?? []
}

async function createCampaignDraft(params: {
  artistName: string
  campaignGoal: string
  channels: unknown[]
  releaseId: string | null
  adminId: string
}) {
  const supabase = createSupabaseServerClient()
  const campaignName = `${params.artistName} - ${params.campaignGoal}`
  const fanSegmentFilter = {
    channels: params.channels,
    generatedBy: 'admin_ai',
  }

  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      name: campaignName,
      description: `AI draft campaign focused on: ${params.campaignGoal}`,
      release_id: params.releaseId,
      fan_segment_filter: fanSegmentFilter,
      status: 'draft',
      created_by: params.adminId,
    })
    .select('id, name, status, created_at')
    .single()

  if (error) {
    throw new Error(`Failed to create campaign draft: ${error.message}`)
  }

  const smartlinkDestination = `https://sergik.com/campaign/${encodeURIComponent(
    data.id
  )}`
  const smartlinkCampaign = toSafeSlug(`${params.artistName}-${params.campaignGoal}`) || 'campaign'
  const smartlink = await createSmartlinkWithUtm({
    destination: smartlinkDestination,
    campaign: smartlinkCampaign,
    source: 'admin-ai',
    medium: 'campaign',
    releaseId: params.releaseId,
    adminId: params.adminId,
  })

  const { data: followUpTask, error: taskError } = await supabase
    .from('admin_tasks')
    .insert({
      title: `Finalize rollout for campaign: ${campaignName}`,
      description: 'Review generated campaign + smartlink, assign owners, and schedule launch timeline.',
      status: 'todo',
      priority: 'medium',
      owner_label: 'Marketing Lead',
      source: 'ai_campaign_draft',
      source_ref: data.id,
      metadata: {
        campaignId: data.id,
        smartlinkId: smartlink.id,
      },
      created_by: params.adminId,
    })
    .select('id, title, status, source, created_at')
    .single()

  if (taskError) {
    throw new Error(`Failed to create campaign follow-up task: ${taskError.message}`)
  }

  return { campaign: data, smartlink, task: followUpTask }
}

async function createSmartlinkWithUtm(params: {
  destination: string
  campaign: string
  source: string
  medium: string
  releaseId: string | null
  adminId: string
}) {
  const supabase = createSupabaseServerClient()
  const utmUrl = `${params.destination}?utm_source=${encodeURIComponent(params.source)}&utm_medium=${encodeURIComponent(
    params.medium
  )}&utm_campaign=${encodeURIComponent(params.campaign)}`

  const slugBase = toSafeSlug(`${params.campaign}-${params.source}`)
  const slug = slugBase || `smartlink-${Date.now()}`

  const basePayload = {
    title: `AI Smartlink - ${params.campaign}`,
    destination_url: utmUrl,
    category: 'campaign',
    release_id: params.releaseId,
    description: 'Generated by Admin AI execute flow',
    metadata: {
      source: params.source,
      medium: params.medium,
      campaign: params.campaign,
      generatedBy: 'admin_ai',
    },
    created_by: params.adminId,
  }

  const candidateSlugs = [slug, `${slug}-${Date.now().toString(36).slice(-5)}`]
  for (const candidateSlug of candidateSlugs) {
    const { data, error } = await supabase
      .from('smartlinks')
      .insert({
        slug: candidateSlug,
        ...basePayload,
      })
      .select('id, slug, destination_url, category, created_at')
      .single()

    if (!error && data) {
      return { ...data, utmUrl }
    }

    if (error && error.code !== '23505') {
      throw new Error(`Failed to create smartlink: ${error.message}`)
    }
  }

  throw new Error('Failed to create smartlink: slug collision retries exhausted')
}

function snapshotErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return String(error)
}

/**
 * Read-only aggregates for nurturing + Release Studio (distribution_releases).
 * Best-effort per section so one missing table does not fail the whole snapshot.
 * Uses parallel reads per focus to reduce wall-clock latency (notably studio + open tasks).
 */
async function fetchOpsSnapshot(params: { focus: 'all' | 'nurturing' | 'studio' }) {
  const supabase = createSupabaseServerClient()
  const out: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    focus: params.focus,
  }

  const nurturing: Record<string, unknown> = {}
  const studio: Record<string, unknown> = {}

  const includeNurturing = params.focus === 'all' || params.focus === 'nurturing'
  const includeStudio = params.focus === 'all' || params.focus === 'studio'

  async function loadNurturing() {
    await Promise.all([
      (async () => {
        try {
          const { data: campaigns, error } = await supabase
            .from('campaigns')
            .select('id, name, status, scheduled_send_at, created_at')
            .order('created_at', { ascending: false })
            .limit(80)
          if (error) {
            nurturing.campaignsError = error.message
          } else {
            const statusCounts: Record<string, number> = {}
            for (const row of campaigns || []) {
              const r = row as { status?: string }
              const s = String(r.status ?? 'unknown')
              statusCounts[s] = (statusCounts[s] || 0) + 1
            }
            nurturing.campaigns = {
              recentSampleSize: campaigns?.length ?? 0,
              statusCounts,
              recent: (campaigns || []).slice(0, 8),
            }
          }
        } catch (e: unknown) {
          nurturing.campaignsError = snapshotErrorMessage(e)
        }
      })(),
      (async () => {
        try {
          const { count, error } = await supabase.from('fans').select('*', { count: 'exact', head: true })
          if (error) nurturing.fansError = error.message
          else nurturing.fansTotal = count ?? 0
        } catch (e: unknown) {
          nurturing.fansError = snapshotErrorMessage(e)
        }
      })(),
      (async () => {
        try {
          const [{ count: slCount, error: slCountErr }, { data: links, error: linksErr }] = await Promise.all([
            supabase.from('smartlinks').select('*', { count: 'exact', head: true }),
            supabase
              .from('smartlinks')
              .select('id, slug, title, category, total_clicks, created_at')
              .order('created_at', { ascending: false })
              .limit(8),
          ])
          if (slCountErr) nurturing.smartlinksError = slCountErr.message
          else nurturing.smartlinksTotal = slCount ?? 0
          if (linksErr) nurturing.smartlinksRecentError = linksErr.message
          else nurturing.smartlinksRecent = links ?? []
        } catch (e: unknown) {
          nurturing.smartlinksError = snapshotErrorMessage(e)
        }
      })(),
    ])
  }

  async function loadStudio() {
    try {
      const { data: rels, error } = await supabase
        .from('distribution_releases')
        .select('id, title, type, distributor_status, release_date, created_at')
        .order('created_at', { ascending: false })
        .limit(80)
      if (error) {
        studio.releasesError = error.message
      } else {
        const statusCounts: Record<string, number> = {}
        for (const row of rels || []) {
          const r = row as { distributor_status?: string }
          const s = String(r.distributor_status ?? 'unknown')
          statusCounts[s] = (statusCounts[s] || 0) + 1
        }
        studio.releases = {
          recentSampleSize: rels?.length ?? 0,
          distributorStatusCounts: statusCounts,
          recent: (rels || []).slice(0, 8),
        }
      }
    } catch (e: unknown) {
      studio.releasesError = snapshotErrorMessage(e)
    }
  }

  async function loadOpenTodos() {
    try {
      const { count, error } = await supabase
        .from('admin_tasks')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'todo')
      if (error) out.openTodoTasksError = error.message
      else out.openTodoTasks = count ?? 0
    } catch (e: unknown) {
      out.openTodoTasksError = snapshotErrorMessage(e)
    }
  }

  const tasks = loadOpenTodos()
  if (includeNurturing && includeStudio) {
    await Promise.all([loadNurturing(), loadStudio(), tasks])
  } else if (includeNurturing) {
    await Promise.all([loadNurturing(), tasks])
  } else if (includeStudio) {
    await Promise.all([loadStudio(), tasks])
  } else {
    await tasks
  }

  if (Object.keys(nurturing).length) out.nurturing = nurturing
  if (Object.keys(studio).length) out.studio = studio

  return out
}

async function insertDistributionReleaseDraft(params: {
  id: string
  title: string
  type: 'single' | 'ep' | 'album'
  releaseDate: string | null
  description?: string | null
  genre?: string | null
  subgenre?: string | null
}) {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('distribution_releases')
    .insert({
      id: params.id,
      title: params.title,
      type: params.type,
      release_date: params.releaseDate,
      description: params.description ?? null,
      genre: params.genre ?? null,
      subgenre: params.subgenre ?? null,
      distributor_status: 'draft',
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create distribution release: ${error.message}`)
  }
  return data
}

export async function runAdminTool(params: {
  tool: AdminAiTool
  payload: Record<string, unknown>
  adminId: string
  runId?: string
  dryRun?: boolean
}): Promise<ToolResult> {
  const { tool, payload } = params
  const dryRun = Boolean(params.dryRun)

  if (!isAdminAiToolExecutionEnabled(tool)) {
    throw new Error(`Tool "${tool}" is temporarily disabled (ADMIN_AI_DISABLED_TOOLS)`)
  }

  const skill = getSkillByTool(tool)
  if (tool === 'create_release_checklist') {
    const releaseName = String(payload.releaseName || 'Untitled release')
    const releaseDate = String(payload.releaseDate || 'TBD')
    const createdTasks = dryRun
      ? [
          { id: 'preview-1', title: `Finalize masters + metadata for ${releaseName}` },
          { id: 'preview-2', title: `Validate artwork specs for ${releaseName}` },
          { id: 'preview-3', title: `Prepare launch distribution handoff for ${releaseName}` },
          { id: 'preview-4', title: `Review social + email launch assets for ${releaseName}` },
        ]
      : await createReleaseChecklistTasks({
          releaseName,
          releaseDate,
          adminId: params.adminId,
          runId: params.runId,
        })

    const result: ToolResult = {
      title: 'Release checklist draft',
      summary: `Generated operational checklist for ${releaseName} targeting ${releaseDate}.`,
      output: {
        releaseName,
        releaseDate,
        dryRun,
        tasksCreated: createdTasks.length,
        tasks: createdTasks,
      },
      ...TOOL_CONFIG[tool],
    }
    if (skill?.outputSchema) {
      const validation = validateAgainstSkillSchema(result.output, skill.outputSchema)
      if (!validation.valid) {
        throw new Error(`Skill output validation failed for ${skill.id}: ${validation.errors.join('; ')}`)
      }
    }
    return result
  }

  if (tool === 'draft_product_strategy_pack') {
    const normalized = normalizeProductStrategyPackPayload(payload)
    const { refineWithLlm, ...packParams } = normalized
    const pack = buildProductStrategyPack(packParams)

    let refinedMarkdown: string | undefined
    let refinementMeta: { provider?: string | null; modelId?: string } | undefined
    if (refineWithLlm && dryRun) {
      const refined = await refineProductStrategyPackMarkdown({ pack })
      if (refined?.markdown) {
        refinedMarkdown = refined.markdown
        refinementMeta = { provider: refined.provider, modelId: refined.modelId }
      }
    }

    const summaryGoal =
      normalized.primaryGoal.length > 140 ? `${normalized.primaryGoal.slice(0, 137)}…` : normalized.primaryGoal
    const result: ToolResult = {
      title: 'Marketing & product strategy pack',
      summary: `Structured scaffold for ${normalized.brandName} — ${summaryGoal}`,
      output: {
        ...pack,
        dryRun,
        ...(refinedMarkdown ? { refinedMarkdown, refinementMeta } : {}),
      },
      ...TOOL_CONFIG[tool],
    }
    if (skill?.outputSchema) {
      const validation = validateAgainstSkillSchema(result.output, skill.outputSchema)
      if (!validation.valid) {
        throw new Error(`Skill output validation failed for ${skill.id}: ${validation.errors.join('; ')}`)
      }
    }
    return result
  }

  if (tool === 'generate_campaign_draft') {
    const artistName = String(payload.artistName || 'SERGIK')
    const campaignGoal = String(payload.campaignGoal || 'Boost release awareness')
    const channels = Array.isArray(payload.channels) ? payload.channels : ['Instagram', 'Email', 'Smart Link']
    const releaseId = payload.releaseId ? String(payload.releaseId) : null
    const createdCampaign = dryRun
      ? {
          campaign: {
            id: 'preview-campaign',
            name: `${artistName} - ${campaignGoal}`,
            status: 'draft',
            created_at: new Date().toISOString(),
          },
          smartlink: {
            id: 'preview-smartlink',
            slug: toSafeSlug(`${artistName}-${campaignGoal}`) || 'preview-campaign-link',
            destination_url: 'https://sergik.com/campaign/preview',
            category: 'campaign',
            created_at: new Date().toISOString(),
            utmUrl: 'https://sergik.com/campaign/preview?utm_source=admin-ai&utm_medium=campaign&utm_campaign=preview',
          },
          task: {
            id: 'preview-task',
            title: 'Finalize rollout for campaign: SERGIK - Release week push',
            status: 'todo',
            source: 'ai_campaign_draft',
            created_at: new Date().toISOString(),
          },
        }
      : await createCampaignDraft({
          artistName,
          campaignGoal,
          channels,
          releaseId,
          adminId: params.adminId,
        })

    const result: ToolResult = {
      title: 'Campaign draft',
      summary: `Created initial campaign plan for ${artistName}.`,
      output: {
        artistName,
        campaignGoal,
        channels,
        campaign: createdCampaign.campaign,
        smartlink: createdCampaign.smartlink,
        task: createdCampaign.task,
        dryRun,
        phases: [
          { phase: 'Tease', timing: 'T-10 to T-7', objective: 'Build anticipation' },
          { phase: 'Launch', timing: 'T-2 to T+2', objective: 'Drive clicks and streams' },
          { phase: 'Retarget', timing: 'T+3 to T+10', objective: 'Re-engage warm audience' },
        ],
      },
      ...TOOL_CONFIG[tool],
    }
    if (skill?.outputSchema) {
      const validation = validateAgainstSkillSchema(result.output, skill.outputSchema)
      if (!validation.valid) {
        throw new Error(`Skill output validation failed for ${skill.id}: ${validation.errors.join('; ')}`)
      }
    }
    return result
  }

  if (tool === 'run_playwright_e2e') {
    const out = await executePlaywrightE2E({
      spec: payload.spec ? String(payload.spec) : undefined,
      project: payload.project ? String(payload.project) : undefined,
      grep: payload.grep ? String(payload.grep) : undefined,
      dryRun,
    })
    const result: ToolResult = {
      title: 'Playwright E2E',
      summary: dryRun
        ? 'Preview: would run Playwright against PLAYWRIGHT_BASE_URL (dev server must already be up).'
        : `Playwright completed in ${out.durationMs}ms (spec ${out.spec}; exit ${out.exitCode ?? 'n/a'}).`,
      output: { ...out },
      ...TOOL_CONFIG[tool],
    }
    if (skill?.outputSchema) {
      const validation = validateAgainstSkillSchema(result.output, skill.outputSchema)
      if (!validation.valid) {
        throw new Error(`Skill output validation failed for ${skill.id}: ${validation.errors.join('; ')}`)
      }
    }
    return result
  }

  if (tool === 'run_applescript') {
    const out = await executeAppleScript({ script: String(payload.script || ''), dryRun })
    const result: ToolResult = {
      title: 'AppleScript',
      summary: dryRun
        ? 'Preview: would run AppleScript via osascript (macOS only; enable with ADMIN_AI_APPLESCRIPT_ENABLED).'
        : 'AppleScript finished successfully.',
      output: { ...out },
      ...TOOL_CONFIG[tool],
    }
    if (skill?.outputSchema) {
      const validation = validateAgainstSkillSchema(result.output, skill.outputSchema)
      if (!validation.valid) {
        throw new Error(`Skill output validation failed for ${skill.id}: ${validation.errors.join('; ')}`)
      }
    }
    return result
  }

  if (tool === 'query_ops_snapshot') {
    const rawFocus = String(payload.focus || 'all').toLowerCase()
    const focus: 'all' | 'nurturing' | 'studio' =
      rawFocus === 'nurturing' || rawFocus === 'studio' ? rawFocus : 'all'
    const snapshot = await fetchOpsSnapshot({ focus })
    const result: ToolResult = {
      title: 'Ops snapshot',
      summary:
        focus === 'all'
          ? 'Pulled nurturing + Release Studio aggregates from the database.'
          : focus === 'nurturing'
            ? 'Pulled nurturing aggregates (campaigns, fans, smart links).'
            : 'Pulled Release Studio aggregates (distribution releases).',
      output: {
        ...snapshot,
        dryRun,
      },
      ...TOOL_CONFIG[tool],
    }
    if (skill?.outputSchema) {
      const validation = validateAgainstSkillSchema(result.output, skill.outputSchema)
      if (!validation.valid) {
        throw new Error(`Skill output validation failed for ${skill.id}: ${validation.errors.join('; ')}`)
      }
    }
    return result
  }

  if (tool === 'query_release_studio_snapshot') {
    const releaseId = String(payload.releaseId || '').trim()
    if (!releaseId) {
      throw new Error('releaseId is required for query_release_studio_snapshot')
    }
    const snapshot = await fetchReleaseStudioSnapshot(releaseId)
    const copyright = snapshot.copyright as { readiness_score?: number; blockers?: string[]; next_best_action?: { label?: string } } | null
    const result: ToolResult = {
      title: 'Release Studio snapshot',
      summary: `Loaded release "${String(snapshot.release.title ?? releaseId)}" with ${snapshot.tracks.length} track(s).`,
      output: {
        ...snapshot,
        readiness_score: copyright?.readiness_score ?? null,
        blockers: copyright?.blockers ?? [],
        next_best_action: copyright?.next_best_action?.label ?? null,
        studioUrl: `/studio/releases/${encodeURIComponent(releaseId)}`,
        dryRun,
      },
      ...TOOL_CONFIG[tool],
    }
    if (skill?.outputSchema) {
      const validation = validateAgainstSkillSchema(result.output, skill.outputSchema)
      if (!validation.valid) {
        throw new Error(`Skill output validation failed for ${skill.id}: ${validation.errors.join('; ')}`)
      }
    }
    return result
  }

  if (tool === 'query_studio_command_center') {
    const dueWithinDays = Number(payload.dueWithinDays)
    const snapshot = await fetchStudioCommandCenterSnapshot({
      dueWithinDays: Number.isFinite(dueWithinDays) && dueWithinDays > 0 ? dueWithinDays : 7,
    })
    const result: ToolResult = {
      title: 'Studio command center',
      summary: `${snapshot.dueThisWeek.length} release(s) due within ${Number.isFinite(dueWithinDays) ? dueWithinDays : 7} days; ${snapshot.alerts.at_risk_count} at risk.`,
      output: { ...snapshot, dryRun },
      ...TOOL_CONFIG[tool],
    }
    if (skill?.outputSchema) {
      const validation = validateAgainstSkillSchema(result.output, skill.outputSchema)
      if (!validation.valid) {
        throw new Error(`Skill output validation failed for ${skill.id}: ${validation.errors.join('; ')}`)
      }
    }
    return result
  }

  if (tool === 'patch_release_marketing_copy') {
    const releaseId = String(payload.releaseId || '').trim()
    if (!releaseId) throw new Error('releaseId is required')
    const marketingCopy =
      payload.marketingCopy && typeof payload.marketingCopy === 'object'
        ? (payload.marketingCopy as Record<string, unknown>)
        : {}
    const merge = payload.merge !== false
    const preview = await previewPatchReleaseMarketingCopy({ releaseId, marketingCopy, merge })
    const applied = dryRun
      ? null
      : await applyPatchReleaseMarketingCopy({ releaseId, marketingCopy, merge })
    const result: ToolResult = {
      title: dryRun ? 'Marketing copy preview' : 'Marketing copy updated',
      summary: dryRun
        ? `Would update ${preview.fieldsUpdated.join(', ')} on "${preview.title}".`
        : `Updated ${preview.fieldsUpdated.join(', ')} on "${preview.title}".`,
      output: {
        releaseId,
        fieldsUpdated: preview.fieldsUpdated,
        before: preview.before,
        after: preview.after,
        release: applied?.release ?? null,
        studioUrl: preview.studioUrl,
        dryRun,
      },
      ...TOOL_CONFIG[tool],
    }
    if (skill?.outputSchema) {
      const validation = validateAgainstSkillSchema(result.output, skill.outputSchema)
      if (!validation.valid) {
        throw new Error(`Skill output validation failed for ${skill.id}: ${validation.errors.join('; ')}`)
      }
    }
    return result
  }

  if (tool === 'update_copyright_checklist') {
    const releaseId = String(payload.releaseId || '').trim()
    if (!releaseId) throw new Error('releaseId is required')
    const updates =
      payload.updates && typeof payload.updates === 'object'
        ? (payload.updates as Record<string, unknown>)
        : payload
    const preview = await previewUpdateCopyrightChecklist({ releaseId, updates })
    const applied = dryRun
      ? null
      : await applyUpdateCopyrightChecklist({ releaseId, updates })
    const result: ToolResult = {
      title: dryRun ? 'Copyright checklist preview' : 'Copyright checklist updated',
      summary: dryRun
        ? `Would update ${preview.fieldsUpdated.join(', ')} (stage ${preview.currentStage}, score ${preview.currentScore}).`
        : `Updated ${preview.fieldsUpdated.join(', ')}; readiness ${applied?.readiness.readiness_score ?? 'n/a'}.`,
      output: {
        releaseId,
        fieldsUpdated: preview.fieldsUpdated,
        updates: preview.updates,
        readiness: applied?.readiness ?? null,
        studioUrl: preview.studioUrl,
        dryRun,
      },
      ...TOOL_CONFIG[tool],
    }
    if (skill?.outputSchema) {
      const validation = validateAgainstSkillSchema(result.output, skill.outputSchema)
      if (!validation.valid) {
        throw new Error(`Skill output validation failed for ${skill.id}: ${validation.errors.join('; ')}`)
      }
    }
    return result
  }

  if (tool === 'assign_isrcs') {
    const releaseId = payload.releaseId ? String(payload.releaseId).trim() : undefined
    const trackIds = Array.isArray(payload.trackIds)
      ? payload.trackIds.map((id) => String(id)).filter(Boolean)
      : undefined
    const preview = await previewAssignIsrcs({ releaseId, trackIds })
    const applied = dryRun ? null : await applyAssignIsrcs({ releaseId, trackIds })
    const count = preview.count ?? preview.tracksToAssign?.length ?? 0
    const result: ToolResult = {
      title: dryRun ? 'ISRC assignment preview' : 'ISRCs assigned',
      summary: dryRun
        ? `Would assign ISRCs to ${count} track(s).`
        : `Assigned ISRCs to ${applied?.successful ?? 0} of ${applied?.total ?? 0} track(s).`,
      output: {
        preview,
        result: applied,
        studioUrl: preview.releaseId
          ? `/studio/releases/${encodeURIComponent(preview.releaseId)}`
          : applied?.studioUrl ?? null,
        dryRun,
      },
      ...TOOL_CONFIG[tool],
    }
    if (skill?.outputSchema) {
      const validation = validateAgainstSkillSchema(result.output, skill.outputSchema)
      if (!validation.valid) {
        throw new Error(`Skill output validation failed for ${skill.id}: ${validation.errors.join('; ')}`)
      }
    }
    return result
  }

  if (tool === 'create_distribution_release_draft') {
    const id = payload.id ? String(payload.id) : `release-${Date.now()}`
    const title = String(payload.title || 'Untitled release')
    const typeRaw = String(payload.type || 'single').toLowerCase()
    const allowedTypes = ['single', 'ep', 'album'] as const
    const type = allowedTypes.includes(typeRaw as (typeof allowedTypes)[number])
      ? (typeRaw as 'single' | 'ep' | 'album')
      : 'single'
    const releaseDateRaw = payload.releaseDate ? String(payload.releaseDate) : ''
    const releaseDate =
      releaseDateRaw && !Number.isNaN(Date.parse(releaseDateRaw))
        ? releaseDateRaw.slice(0, 10)
        : null
    const description = payload.description != null ? String(payload.description) : null
    const genre = payload.genre != null ? String(payload.genre) : null
    const subgenre = payload.subgenre != null ? String(payload.subgenre) : null

    const releaseRow = dryRun
      ? {
          id,
          title,
          type,
          release_date: releaseDate,
          description,
          genre,
          subgenre,
          distributor_status: 'draft',
          preview: true,
        }
      : await insertDistributionReleaseDraft({
          id,
          title,
          type,
          releaseDate,
          description,
          genre,
          subgenre,
        })

    const result: ToolResult = {
      title: 'Distribution release draft',
      summary: dryRun
        ? `Preview: would create draft release "${title}" (${type}).`
        : `Created draft distribution release "${title}" (${type}). Open Release Studio to add tracks.`,
      output: {
        release: releaseRow,
        studioUrl: `/studio/releases/${encodeURIComponent(id)}`,
        dryRun,
      },
      ...TOOL_CONFIG[tool],
    }
    if (skill?.outputSchema) {
      const validation = validateAgainstSkillSchema(result.output, skill.outputSchema)
      if (!validation.valid) {
        throw new Error(`Skill output validation failed for ${skill.id}: ${validation.errors.join('; ')}`)
      }
    }
    return result
  }

  if (tool === 'generate_smartlink_utm_plan') {
    const destination = String(payload.destination || 'https://sergik.com/release')
    const campaign = String(payload.campaign || 'release_push')
    const source = String(payload.source || 'instagram')
    const medium = String(payload.medium || 'social')
    const releaseId = payload.releaseId ? String(payload.releaseId) : null
    const createdSmartlink = dryRun
      ? {
          id: 'preview-smartlink',
          slug: toSafeSlug(`${campaign}-${source}`),
          destination_url: destination,
          category: 'campaign',
          created_at: new Date().toISOString(),
          utmUrl: `${destination}?utm_source=${encodeURIComponent(source)}&utm_medium=${encodeURIComponent(
            medium
          )}&utm_campaign=${encodeURIComponent(campaign)}`,
        }
      : await createSmartlinkWithUtm({
          destination,
          campaign,
          source,
          medium,
          releaseId,
          adminId: params.adminId,
        })

    const result: ToolResult = {
      title: 'Smartlink + UTM plan',
      summary: 'Generated canonical UTM strategy and created smartlink record.',
      output: {
        destination,
        campaign,
        source,
        medium,
        smartlink: createdSmartlink,
        utmUrl: createdSmartlink.utmUrl,
        dryRun,
        linkAliases: ['bio-link', 'story-link', 'email-cta'],
      },
      ...TOOL_CONFIG[tool],
    }
    if (skill?.outputSchema) {
      const validation = validateAgainstSkillSchema(result.output, skill.outputSchema)
      if (!validation.valid) {
        throw new Error(`Skill output validation failed for ${skill.id}: ${validation.errors.join('; ')}`)
      }
    }
    return result
  }

  const exhaustive: never = tool
  throw new Error(`Unhandled admin tool: ${String(exhaustive)}`)
}

export async function generateChatReply(
  message: string,
  options?: {
    provider?: string | null
    modelOverrides?: AdminChatModelOverrides
    resolvedModelIds?: Partial<Record<AdminAiChatProvider, string>>
    /** When true and provider is set, only that provider is used (no silent fallback). */
    strictProvider?: boolean
    autoRouterMode?: AdminAiAutoRouterMode
    skillId?: string | null
    stickySkillId?: string | null
    siteKnowledgePrompt?: string | null
    pageContextPrompt?: string | null
    honestyMode?: AdminChatHonestyMode | null
    energyPreset?: AdminChatEnergyPreset | null
  }
) {
  return generateAdminChatReply(message, {
    provider: options?.provider,
    modelOverrides: options?.modelOverrides,
    resolvedModelIds: options?.resolvedModelIds,
    strictProvider: options?.strictProvider,
    autoRouterMode: options?.autoRouterMode,
    skillId: options?.skillId,
    stickySkillId: options?.stickySkillId,
    siteKnowledgePrompt: options?.siteKnowledgePrompt,
    pageContextPrompt: options?.pageContextPrompt,
    honestyMode: options?.honestyMode,
    energyPreset: options?.energyPreset,
  })
}
