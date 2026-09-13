import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { listOwnedAiRuns } from '@/lib/ai/ai-run-ownership'

export const dynamic = 'force-dynamic'

type RunRow = {
  id: string
  admin_id: string
  request_type: 'chat' | 'execute'
  prompt: string
  response: Record<string, unknown> | null
  status: 'pending' | 'approval_required' | 'completed' | 'failed'
  error_message: string | null
  created_at: string
  completed_at: string | null
}

type ActionRow = {
  id: string
  run_id: string
  tool_name: string
  status: string
  created_at: string
}

type ApprovalRow = {
  id: string
  run_id: string
  action_id: string
  approved: boolean
  approved_at: string | null
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const requestType = searchParams.get('request_type')
    const page = Number.parseInt(searchParams.get('page') || '1', 10)
    const limit = Number.parseInt(searchParams.get('limit') || '25', 10)
    const offset = Math.max(0, (page - 1) * limit)

    const supabase = createSupabaseServerClient()
    const { data, error, count } = await listOwnedAiRuns({
      adminId: session.user.id,
      status,
      requestType,
      offset,
      limit,
    })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const runIds = (data || []).map((row) => row.id)
    let actionsByRun: Record<string, ActionRow[]> = {}
    let approvalsByRun: Record<string, ApprovalRow[]> = {}

    if (runIds.length > 0) {
      const { data: actions, error: actionsError } = await supabase
        .from('ai_actions')
        .select('id, run_id, tool_name, status, created_at')
        .in('run_id', runIds)
        .order('created_at', { ascending: false })

      if (!actionsError && actions) {
        actionsByRun = (actions as ActionRow[]).reduce<Record<string, ActionRow[]>>((acc, action) => {
          acc[action.run_id] = acc[action.run_id] || []
          acc[action.run_id].push(action)
          return acc
        }, {})
      }

      const { data: approvals, error: approvalsError } = await supabase
        .from('ai_approvals')
        .select('id, run_id, action_id, approved, approved_at')
        .in('run_id', runIds)
        .order('created_at', { ascending: false })

      if (!approvalsError && approvals) {
        approvalsByRun = (approvals as ApprovalRow[]).reduce<Record<string, ApprovalRow[]>>((acc, approval) => {
          acc[approval.run_id] = acc[approval.run_id] || []
          acc[approval.run_id].push(approval)
          return acc
        }, {})
      }
    }

    return NextResponse.json({
      runs: ((data || []) as RunRow[]).map((run) => ({
        ...run,
        actions: actionsByRun[run.id] || [],
        approvals: approvalsByRun[run.id] || [],
      })),
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.max(1, Math.ceil((count || 0) / limit)),
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
