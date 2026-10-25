import {
  createAiAction,
  createAiApproval,
  patchAiRunResponse,
  runAdminTool,
  updateAiRun,
} from '@/lib/admin-ai'
import { payloadSubmits } from '@/lib/ai/approval-rows'
import { payloadWithoutStrategyPolish } from '@/lib/ai/product-strategy-pack'
import { compareWriteToReread, type WriteVerification } from '@/lib/ai/admin-ai-write-verify'
import type { OrchestratorStep } from '@/lib/ai/orchestrator'
import {
  initialTimeline,
  markRemainingSkipped,
  setStepStatus,
  type StepTimelineEntry,
} from '@/lib/ai/run-timeline'

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return 'Internal server error'
}

export type StepPreviewRow = {
  stepId: string
  tool: OrchestratorStep['tool']
  riskTier: string
  requiresApproval: boolean
  payload: Record<string, unknown>
  preview: Record<string, unknown>
}

export async function previewPlanOnRun(params: {
  runId: string
  adminId: string
  steps: OrchestratorStep[]
  planGraph: Record<string, unknown>
}): Promise<
  | {
      ok: true
      previews: StepPreviewRow[]
      firstActionId: string | null
      stepTimeline: StepTimelineEntry[]
    }
  | { ok: false; error: string; stepTimeline: StepTimelineEntry[]; previews: StepPreviewRow[] }
> {
  let stepTimeline = initialTimeline(params.steps)
  const previews: StepPreviewRow[] = []
  let firstActionId: string | null = null

  await patchAiRunResponse(params.runId, {
    planGraph: params.planGraph,
    stepTimeline,
  })

  for (const step of params.steps) {
    try {
      const toolPreview = await runAdminTool({
        tool: step.tool,
        payload: step.payload,
        adminId: params.adminId,
        runId: params.runId,
        dryRun: true,
      })

      const actionId = await createAiAction({
        runId: params.runId,
        tool: step.tool,
        payload: step.payload,
        status: 'previewed',
        result: {
          stepId: step.id,
          title: toolPreview.title,
          summary: toolPreview.summary,
          preview: toolPreview.output,
        },
      })

      if (!firstActionId) firstActionId = actionId
      previews.push({
        stepId: step.id,
        tool: step.tool,
        riskTier: toolPreview.riskTier,
        requiresApproval: true,
        payload: step.payload,
        preview: toolPreview.output,
      })
      stepTimeline = setStepStatus(stepTimeline, step.id, 'previewed')
      await patchAiRunResponse(params.runId, { stepTimeline, lastPreviewAt: new Date().toISOString() })
    } catch (stepError: unknown) {
      const msg = getErrorMessage(stepError)
      stepTimeline = setStepStatus(stepTimeline, step.id, 'failed', msg)
      stepTimeline = markRemainingSkipped(stepTimeline, step.id)
      await patchAiRunResponse(params.runId, {
        stepTimeline,
        previewFailedStepId: step.id,
        previewError: msg,
      })
      await updateAiRun({
        runId: params.runId,
        status: 'failed',
        errorMessage: msg,
        response: {
          planGraph: params.planGraph,
          stepTimeline,
          requiresApproval: false,
          stepPreviews: previews,
          previewFailed: true,
        },
      })
      return { ok: false, error: msg, stepTimeline, previews }
    }
  }

  return { ok: true, previews, firstActionId, stepTimeline }
}

export async function executePlanOnRun(params: {
  runId: string
  adminId: string
  steps: OrchestratorStep[]
  planGraph: Record<string, unknown>
  existingTimeline?: StepTimelineEntry[] | null
}): Promise<
  | {
      ok: true
      executionResults: Array<{
        stepId: string
        tool: OrchestratorStep['tool']
        output: Record<string, unknown>
        verification?: WriteVerification | null
      }>
      firstActionId: string | null
      stepTimeline: StepTimelineEntry[]
    }
  | {
      ok: false
      error: string
      executionResults: Array<{
        stepId: string
        tool: OrchestratorStep['tool']
        output: Record<string, unknown>
        verification?: WriteVerification | null
      }>
      stepTimeline: StepTimelineEntry[]
    }
> {
  const sameLength = params.existingTimeline && params.existingTimeline.length === params.steps.length
  const idsMatch =
    sameLength &&
    params.steps.every((s) => params.existingTimeline!.some((t) => t.stepId === s.id))
  let stepTimeline =
    idsMatch && params.existingTimeline ? [...params.existingTimeline] : initialTimeline(params.steps)

  const executionResults: Array<{
    stepId: string
    tool: OrchestratorStep['tool']
    output: Record<string, unknown>
    verification?: WriteVerification | null
  }> = []
  let firstActionId: string | null = null

  for (const step of params.steps) {
    try {
      const toolResult = await runAdminTool({
        tool: step.tool,
        payload: payloadWithoutStrategyPolish(step.payload),
        adminId: params.adminId,
        runId: params.runId,
        dryRun: !payloadSubmits(step.payload),
      })

      const actionId = await createAiAction({
        runId: params.runId,
        tool: step.tool,
        payload: step.payload,
        status: 'executed',
        result: {
          stepId: step.id,
          title: toolResult.title,
          summary: toolResult.summary,
          output: toolResult.output,
        },
      })

      if (!firstActionId) firstActionId = actionId

      await createAiApproval({
        runId: params.runId,
        actionId,
        approvedBy: params.adminId,
        approvalNote: 'Approved via admin AI run',
      })

      executionResults.push({
        stepId: step.id,
        tool: step.tool,
        output: toolResult.output,
        verification: await verifyExecutedWrite({
          adminId: params.adminId,
          runId: params.runId,
          tool: step.tool,
          payload: step.payload,
        }),
      })
      stepTimeline = setStepStatus(stepTimeline, step.id, 'executed')
      await patchAiRunResponse(params.runId, { stepTimeline, lastExecutedAt: new Date().toISOString() })
    } catch (stepError: unknown) {
      const msg = getErrorMessage(stepError)
      stepTimeline = setStepStatus(stepTimeline, step.id, 'failed', msg)
      stepTimeline = markRemainingSkipped(stepTimeline, step.id)
      await patchAiRunResponse(params.runId, {
        stepTimeline,
        executeFailedStepId: step.id,
        executeError: msg,
        partialResults: executionResults,
      })
      await updateAiRun({
        runId: params.runId,
        status: 'failed',
        errorMessage: msg,
        response: {
          planGraph: params.planGraph,
          stepTimeline,
          executed: false,
          partialResults: executionResults,
          executeFailedStepId: step.id,
        },
      })
      return { ok: false, error: msg, executionResults, stepTimeline }
    }
  }

  return { ok: true, executionResults, firstActionId, stepTimeline }
}

const SNAPSHOT_WRITES = new Set<string>([
  'patch_release_marketing_copy',
  'update_copyright_checklist',
  'assign_isrcs',
  'pull_distrokid_isrcs',
  'create_distribution_release_draft',
  'run_meta_promo_pipeline',
  'generate_campaign_draft',
])

const RELEASE_ID_REQUIRED = new Set<string>([
  'patch_release_marketing_copy',
  'update_copyright_checklist',
  'assign_isrcs',
  'pull_distrokid_isrcs',
  'create_distribution_release_draft',
])

async function verifyExecutedWrite(params: {
  adminId: string
  runId: string
  tool: string
  payload: Record<string, unknown>
}): Promise<WriteVerification | null> {
  if (!payloadSubmits(params.payload) || !SNAPSHOT_WRITES.has(params.tool)) return null
  const releaseId =
    params.tool === 'create_distribution_release_draft'
      ? String(params.payload.id || params.payload.releaseId || '').trim()
      : String(params.payload.releaseId || '').trim()
  if (!releaseId) {
    if (!RELEASE_ID_REQUIRED.has(params.tool)) return null
    return {
      matched: false,
      checks: [],
      summary: `${params.tool} saved. No release id was on the write, so it was not re-read.`,
    }
  }
  try {
    const read = await runAdminTool({
      tool: 'query_release_studio_snapshot',
      payload: { releaseId },
      adminId: params.adminId,
      runId: params.runId,
      dryRun: true,
    })
    return compareWriteToReread({
      tool: params.tool,
      payload: params.payload,
      reread: read.output,
    })
  } catch (error: unknown) {
    return {
      matched: false,
      checks: [],
      summary: `Saved, but the re-read failed: ${getErrorMessage(error)}`,
    }
  }
}
