import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { isAdminAiToolExecutionEnabled, isAllowedTool } from '@/lib/admin-ai'
import { normalizeRegisteredSkillId } from '@/lib/ai/admin-chat-guards'
import { getAllowedAdminSkillIds } from '@/lib/ai/skills/registry'
import { buildExecutionPlan, buildIntentPlan } from '@/lib/ai/planner'
import { buildPlanGraphForIntent, buildPlanGraphForTool } from '@/lib/ai/orchestrator'

export const dynamic = 'force-dynamic'

type PlanBody = {
  message?: string
  tool?: string
  payload?: Record<string, unknown>
  /** Bias plan toward a specific admin agent skill. */
  skillId?: string
}

export async function POST(request: NextRequest) {
  const session = await getServerSession()
  if (!session?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as PlanBody
  const payload = body.payload ?? {}

  if (body.tool?.trim()) {
    const tool = body.tool.trim()
    if (!isAllowedTool(tool)) {
      return NextResponse.json({ error: 'Invalid or non-whitelisted tool' }, { status: 400 })
    }
    if (!isAdminAiToolExecutionEnabled(tool)) {
      return NextResponse.json(
        { error: `Tool "${tool}" is temporarily disabled (ADMIN_AI_DISABLED_TOOLS).` },
        { status: 403 }
      )
    }
    const plan = buildExecutionPlan(tool, payload)
    const graph = buildPlanGraphForTool(tool, payload)
    return NextResponse.json({ mode: 'execution', plan, graph })
  }

  if (body.message?.trim()) {
    const message = body.message.trim()
    const allowed = getAllowedAdminSkillIds()
    const normalized = normalizeRegisteredSkillId(body.skillId, allowed)
    const skillId = normalized ?? undefined
    const plan = buildIntentPlan(message, { skillId })
    const graph = buildPlanGraphForIntent(message, { skillId })
    return NextResponse.json({ mode: 'intent', plan, graph })
  }

  return NextResponse.json({ error: 'message or tool is required' }, { status: 400 })
}
