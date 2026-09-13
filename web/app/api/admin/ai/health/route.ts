import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import {
  createAiAction,
  createAiApproval,
  createAiRun,
  runAdminTool,
  updateAiAction,
  updateAiRun,
} from '@/lib/admin-ai'

export const dynamic = 'force-dynamic'

type HealthResponse = {
  ok: boolean
  checks: Array<{
    table: string
    exists: boolean
    rowCount?: number
    error?: string
  }>
  latestRun?: {
    id: string
    status: string
    created_at: string
  } | null
}

async function getTableCheck(supabase: ReturnType<typeof createSupabaseServerClient>, table: string) {
  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })

  if (error) {
    return { table, exists: false, error: error.message }
  }

  return { table, exists: true, rowCount: count ?? 0 }
}

export async function GET() {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createSupabaseServerClient()
    const tables = [
      'ai_runs',
      'ai_actions',
      'ai_approvals',
      'admin_ai_digest_sends',
      'admin_tasks',
      'campaigns',
      'smartlinks',
    ]
    const checks = await Promise.all(tables.map((table) => getTableCheck(supabase, table)))

    const { data: latestRun } = await supabase
      .from('ai_runs')
      .select('id, status, created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const response: HealthResponse = {
      ok: checks.every((check) => check.exists),
      checks,
      latestRun: latestRun ?? null,
    }

    return NextResponse.json(response)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST() {
  let runId: string | null = null
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = {
      artistName: 'SERGIK',
      campaignGoal: `Self test ${new Date().toISOString()}`,
    }

    runId = await createAiRun({
      adminId: session.user.id,
      requestType: 'execute',
      prompt: `tool=generate_campaign_draft payload=${JSON.stringify(payload)}`,
    })

    const preview = await runAdminTool({
      tool: 'generate_campaign_draft',
      payload,
      adminId: session.user.id,
      runId,
      dryRun: true,
    })

    const actionId = await createAiAction({
      runId,
      tool: 'generate_campaign_draft',
      payload,
      status: 'previewed',
      result: {
        title: preview.title,
        summary: preview.summary,
        preview: preview.output,
      },
    })

    await updateAiRun({
      runId,
      status: 'approval_required',
      response: {
        selfTest: true,
        preview: preview.output,
      },
    })

    const executed = await runAdminTool({
      tool: 'generate_campaign_draft',
      payload,
      adminId: session.user.id,
      runId,
      dryRun: false,
    })

    await updateAiAction({
      actionId,
      status: 'executed',
      result: {
        title: executed.title,
        summary: executed.summary,
        output: executed.output,
      },
    })

    await createAiApproval({
      runId,
      actionId,
      approvedBy: session.user.id,
      approvalNote: 'Self-test auto-approval',
    })

    await updateAiRun({
      runId,
      status: 'completed',
      response: {
        selfTest: true,
        output: executed.output,
      },
    })

    return NextResponse.json({
      ok: true,
      message: 'Self-test completed.',
      runId,
      actionId,
      output: executed.output,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Self-test failed'
    if (runId) {
      await updateAiRun({
        runId,
        status: 'failed',
        errorMessage: message,
      })
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
