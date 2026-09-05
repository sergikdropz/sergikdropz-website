import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createAiRun, isAdminAiToolExecutionEnabled, isAllowedTool, updateAiRun } from '@/lib/admin-ai'
import { executePlanOnRun, previewPlanOnRun } from '@/lib/ai/execute-run-plan'
import { OrchestratorStep, validatePlanSteps } from '@/lib/ai/orchestrator'
import { planGraphPayload, stepsFromPlanGraph } from '@/lib/ai/run-timeline'
import type { StepTimelineEntry } from '@/lib/ai/run-timeline'
import { getOwnedAiRun } from '@/lib/ai/ai-run-ownership'
import {
  beginIdempotentOperation,
  completeIdempotentOperation,
  normalizeIdempotencyKey,
} from '@/lib/auth/idempotency'
import { startAiTelemetry } from '@/lib/observability/ai-telemetry'
import { checkRateLimitAsync } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

type ExecuteBody = {
  runId?: string
  tool?: string
  payload?: Record<string, unknown>
  approve?: boolean
  planSteps?: OrchestratorStep[]
  idempotencyKey?: string
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return 'Internal server error'
}

export async function POST(request: NextRequest) {
  let activeRunId: string | null = null

  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rl = await checkRateLimitAsync(`admin-ai-execute:${session.user.id}`, 40, 60_000)
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'AI execute rate limit exceeded. Try again shortly.', code: 'AI_RATE_LIMIT' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
      )
    }

    const body = (await request.json().catch(() => ({}))) as ExecuteBody
    const toolRaw = body.tool?.trim()
    const payload = body.payload ?? {}
    const approve = Boolean(body.approve)
    const planSteps = Array.isArray(body.planSteps) ? body.planSteps : null

    const approveExistingRun = approve && Boolean(body.runId)

    if (!approve && !planSteps && (!toolRaw || !isAllowedTool(toolRaw))) {
      return NextResponse.json({ error: 'Invalid or non-whitelisted tool' }, { status: 400 })
    }

    if (approve && !planSteps && (!toolRaw || !isAllowedTool(toolRaw)) && !approveExistingRun) {
      return NextResponse.json(
        { error: 'Approve requires runId, or tool + payload, or planSteps' },
        { status: 400 }
      )
    }

    let stepsToRun: OrchestratorStep[] = []

    if (planSteps) {
      stepsToRun = planSteps.filter((step) => isAllowedTool(step.tool))
    } else if (approveExistingRun && !planSteps) {
      const { run: runRow, error: fetchError } = await getOwnedAiRun({
        runId: body.runId as string,
        adminId: session.user.id,
      })

      if (fetchError) {
        return NextResponse.json({ error: fetchError }, { status: 500 })
      }
      if (!runRow) {
        return NextResponse.json({ error: 'Run not found' }, { status: 404 })
      }

      const loaded = stepsFromPlanGraph((runRow.response as Record<string, unknown> | null)?.planGraph)
      if (loaded?.length) {
        stepsToRun = loaded
      } else if (toolRaw && isAllowedTool(toolRaw)) {
        stepsToRun = [
          {
            id: 'single-step',
            tool: toolRaw,
            payload,
            requiresApproval: true,
            riskTier: 'tier_1_draft',
            skillId: null,
          },
        ]
      } else {
        return NextResponse.json(
          { error: 'No planGraph on this run; re-run preview from the assistant first.' },
          { status: 400 }
        )
      }
    } else if (toolRaw && isAllowedTool(toolRaw)) {
      stepsToRun = [
        {
          id: 'single-step',
          tool: toolRaw,
          payload,
          requiresApproval: true,
          riskTier: 'tier_1_draft',
          skillId: null,
        },
      ]
    }

    if (!stepsToRun.length) {
      return NextResponse.json({ error: 'No executable steps provided' }, { status: 400 })
    }

    const disabledStep = stepsToRun.find((step) => !isAdminAiToolExecutionEnabled(step.tool))
    if (disabledStep) {
      return NextResponse.json(
        {
          error: `Tool "${disabledStep.tool}" is temporarily disabled (ADMIN_AI_DISABLED_TOOLS).`,
          details: [disabledStep.tool],
        },
        { status: 403 }
      )
    }

    const planValidation = validatePlanSteps(stepsToRun)
    if (!planValidation.valid) {
      return NextResponse.json(
        {
          error: 'Plan payload does not satisfy skill schema',
          details: planValidation.errors,
        },
        { status: 400 }
      )
    }

    const planSummary =
      stepsToRun.length > 1
        ? `Multi-step plan (${stepsToRun.length} tools)`
        : `Single-step: ${stepsToRun[0].tool}`
    const planMode = planSteps ? 'plan' : 'tool'
    const planGraph = planGraphPayload(stepsToRun, planSummary, planMode)

    if (!approve) {
      activeRunId =
        body.runId ||
        (await createAiRun({
          adminId: session.user.id,
          requestType: 'execute',
          prompt: planSteps
            ? `plan_steps=${JSON.stringify(
                stepsToRun.map((step) => ({ tool: step.tool, payload: step.payload }))
              )}`
            : `tool=${toolRaw} payload=${JSON.stringify(payload)}`,
        }))
      const previewResult = await previewPlanOnRun({
        runId: activeRunId,
        adminId: session.user.id,
        steps: stepsToRun,
        planGraph,
      })

      if (!previewResult.ok) {
        return NextResponse.json(
          {
            error: previewResult.error,
            runId: activeRunId,
            stepTimeline: previewResult.stepTimeline,
          },
          { status: 500 }
        )
      }

      const previews = previewResult.previews
      await updateAiRun({
        runId: activeRunId,
        status: 'approval_required',
        response: {
          planGraph,
          stepTimeline: previewResult.stepTimeline,
          requiresApproval: true,
          steps: previews.map((preview) => ({
            stepId: preview.stepId,
            tool: preview.tool,
            preview: preview.preview,
          })),
          stepPreviews: previews,
        },
      })

      return NextResponse.json({
        runId: activeRunId,
        actionId: previewResult.firstActionId,
        approved: false,
        message:
          previews.length > 1
            ? 'Multi-step preview created. Approval required before execution.'
            : 'Preview created. Approval required before execution.',
        toolPreview: previews[0]
          ? {
              tool: previews[0].tool,
              riskTier: previews[0].riskTier,
              requiresApproval: true,
              payload: previews[0].payload,
              preview: previews[0].preview,
            }
          : undefined,
        stepPreviews: previews,
      })
    }

    if (!body.runId) {
      return NextResponse.json({ error: 'runId is required to approve a previewed run' }, { status: 400 })
    }
    activeRunId = body.runId

    const { run: ownedRun, error: ownedError } = await getOwnedAiRun({
      runId: activeRunId,
      adminId: session.user.id,
    })
    if (ownedError) {
      return NextResponse.json({ error: ownedError }, { status: 500 })
    }
    if (!ownedRun) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 })
    }

    const idempotencyKey = normalizeIdempotencyKey(body.idempotencyKey)
    if (idempotencyKey) {
      const { existing } = await beginIdempotentOperation({
        adminId: session.user.id,
        operation: 'admin_ai_execute_approve',
        key: `${activeRunId}:${idempotencyKey}`,
      })
      if (existing?.status === 'completed' && existing.response) {
        return NextResponse.json(existing.response)
      }
    }

    const saved = (ownedRun.response as Record<string, unknown> | null) ?? {}

    let stepsForApproval = stepsToRun
    if (body.runId && !planSteps && !(toolRaw && isAllowedTool(toolRaw))) {
      const fromDb = stepsFromPlanGraph(saved.planGraph)
      if (fromDb?.length) {
        stepsForApproval = fromDb
      }
    }

    const disabledApprovalStep = stepsForApproval.find((step) => !isAdminAiToolExecutionEnabled(step.tool))
    if (disabledApprovalStep) {
      return NextResponse.json(
        {
          error: `Cannot approve: tool "${disabledApprovalStep.tool}" is temporarily disabled (ADMIN_AI_DISABLED_TOOLS).`,
          details: [disabledApprovalStep.tool],
        },
        { status: 403 }
      )
    }

    const approvalValidation = validatePlanSteps(stepsForApproval)
    if (!approvalValidation.valid) {
      return NextResponse.json(
        {
          error: 'Stored plan does not satisfy skill schema',
          details: approvalValidation.errors,
        },
        { status: 400 }
      )
    }

    const savedPlanGraph =
      (saved.planGraph as Record<string, unknown> | undefined) ??
      planGraphPayload(stepsForApproval, planSummary, planMode)

    const existingTimeline = saved.stepTimeline as StepTimelineEntry[] | undefined

    const telemetry = startAiTelemetry({
      actorId: session.user.id,
      kind: 'tool',
      name: 'admin_ai_execute_approve',
      approvalRequired: true,
      approved: true,
      meta: { runId: activeRunId, stepCount: stepsForApproval.length },
    })

    const execResult = await executePlanOnRun({
      runId: activeRunId,
      adminId: session.user.id,
      steps: stepsForApproval,
      planGraph: savedPlanGraph,
      existingTimeline,
    })

    if (!execResult.ok) {
      telemetry.fail(execResult.error)
      return NextResponse.json(
        {
          error: execResult.error,
          runId: activeRunId,
          results: execResult.executionResults,
          stepTimeline: execResult.stepTimeline,
        },
        { status: 500 }
      )
    }

    telemetry.complete({ meta: { tools: stepsForApproval.map((step) => step.tool) } })

    const executionResults = execResult.executionResults

    await updateAiRun({
      runId: activeRunId,
      status: 'completed',
      response: {
        planGraph: savedPlanGraph,
        stepTimeline: execResult.stepTimeline,
        executed: true,
        steps: executionResults,
      },
    })

    const approveResponse = {
      runId: activeRunId,
      actionId: execResult.firstActionId,
      approved: true,
      message:
        executionResults.length > 1
          ? `${executionResults.length} plan steps executed.`
          : `${executionResults[0]?.tool ?? 'tool'} executed.`,
      result: executionResults.length === 1 ? executionResults[0]?.output : undefined,
      results: executionResults,
    }

    if (idempotencyKey) {
      await completeIdempotentOperation({
        adminId: session.user.id,
        operation: 'admin_ai_execute_approve',
        key: `${activeRunId}:${idempotencyKey}`,
        status: 'completed',
        response: approveResponse,
      })
    }

    return NextResponse.json(approveResponse)
  } catch (error: unknown) {
    if (activeRunId) {
      await updateAiRun({
        runId: activeRunId,
        status: 'failed',
        errorMessage: getErrorMessage(error),
      })
    }

    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 })
  }
}
