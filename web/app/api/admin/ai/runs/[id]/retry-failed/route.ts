import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createAiRun, updateAiRun } from '@/lib/admin-ai'
import { createSupabaseServerClient } from '@/lib/supabase'
import { previewPlanOnRun } from '@/lib/ai/execute-run-plan'
import { planGraphPayload, stepsFromPlanGraph, type StepTimelineEntry } from '@/lib/ai/run-timeline'

export const dynamic = 'force-dynamic'

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parentId = params.id
    const supabase = createSupabaseServerClient()
    const { data: parent, error: parentError } = await supabase
      .from('ai_runs')
      .select('id,status,response')
      .eq('id', parentId)
      .eq('admin_id', session.user.id)
      .maybeSingle()

    if (parentError || !parent) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 })
    }

    const response = (parent.response as Record<string, unknown> | null) ?? {}
    const timeline = response.stepTimeline as StepTimelineEntry[] | undefined
    const allSteps = stepsFromPlanGraph(response.planGraph)

    if (!allSteps?.length) {
      return NextResponse.json({ error: 'Parent run has no planGraph to retry from' }, { status: 400 })
    }

    const failedIds = new Set(
      (timeline ?? [])
        .filter((entry) => entry.status === 'failed')
        .map((entry) => entry.stepId)
    )

    const retrySteps = allSteps.filter((step) => failedIds.has(step.id))

    if (!retrySteps.length) {
      return NextResponse.json(
        { error: 'No failed steps found on this run (check step timeline).' },
        { status: 400 }
      )
    }

    const planGraph = planGraphPayload(
      retrySteps,
      `Retry ${retrySteps.length} failed step(s) from run ${parentId}`,
      'plan'
    )

    const newRunId = await createAiRun({
      adminId: session.user.id,
      requestType: 'execute',
      prompt: `retry_failed_from=${parentId}`,
    })

    const previewResult = await previewPlanOnRun({
      runId: newRunId,
      adminId: session.user.id,
      steps: retrySteps,
      planGraph,
    })

    if (!previewResult.ok) {
      return NextResponse.json(
        { error: previewResult.error || 'Preview failed for retry run', retryRunId: newRunId },
        { status: 500 }
      )
    }

    const previews = previewResult.previews
    await updateAiRun({
      runId: newRunId,
      status: 'approval_required',
      response: {
        planGraph,
        stepTimeline: previewResult.stepTimeline,
        requiresApproval: true,
        retry_of: parentId,
        steps: previews.map((preview) => ({
          stepId: preview.stepId,
          tool: preview.tool,
          preview: preview.preview,
        })),
        stepPreviews: previews,
      },
    })

    return NextResponse.json({
      success: true,
      retryRunId: newRunId,
      message: `Queued ${retrySteps.length} failed step(s) for preview. Approve run ${newRunId} from the assistant (brain) or POST /api/admin/ai/execute with approve.`,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
