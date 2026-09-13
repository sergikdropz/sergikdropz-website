import type { OrchestratorStep } from '@/lib/ai/orchestrator'
import { isAllowedTool } from '@/lib/admin-ai'

export type PlanStepStatus = 'pending' | 'previewed' | 'executed' | 'failed' | 'skipped'

export type StepTimelineEntry = {
  stepId: string
  tool: string
  order: number
  status: PlanStepStatus
  error?: string
}

export function initialTimeline(steps: OrchestratorStep[]): StepTimelineEntry[] {
  return steps.map((step, index) => ({
    stepId: step.id,
    tool: step.tool,
    order: index,
    status: 'pending' as PlanStepStatus,
  }))
}

export function setStepStatus(
  timeline: StepTimelineEntry[],
  stepId: string,
  status: PlanStepStatus,
  error?: string
): StepTimelineEntry[] {
  return timeline.map((entry) =>
    entry.stepId === stepId
      ? {
          ...entry,
          status,
          ...(error !== undefined ? { error } : {}),
        }
      : entry
  )
}

export function markRemainingSkipped(timeline: StepTimelineEntry[], afterStepId: string): StepTimelineEntry[] {
  const idx = timeline.findIndex((t) => t.stepId === afterStepId)
  if (idx === -1) return timeline
  return timeline.map((entry, i) => {
    if (i <= idx) return entry
    if (entry.status === 'pending' || entry.status === 'previewed') {
      return { ...entry, status: 'skipped' as PlanStepStatus }
    }
    return entry
  })
}

export function planGraphPayload(steps: OrchestratorStep[], summary: string, mode: 'tool' | 'intent' | 'plan') {
  return {
    mode,
    summary,
    steps: steps.map((step) => ({
      id: step.id,
      tool: step.tool,
      payload: step.payload,
      requiresApproval: step.requiresApproval,
      riskTier: step.riskTier,
      skillId: step.skillId,
    })),
  }
}

export function stepsFromPlanGraph(graph: unknown): OrchestratorStep[] | null {
  if (!graph || typeof graph !== 'object') return null
  const stepsRaw = (graph as { steps?: unknown }).steps
  if (!Array.isArray(stepsRaw)) return null
  const out: OrchestratorStep[] = []
  for (const raw of stepsRaw) {
    if (!raw || typeof raw !== 'object') continue
    const s = raw as Record<string, unknown>
    const tool = s.tool
    const id = s.id
    if (typeof tool !== 'string' || typeof id !== 'string' || !isAllowedTool(tool)) continue
    out.push({
      id,
      tool,
      payload: (typeof s.payload === 'object' && s.payload !== null ? s.payload : {}) as Record<string, unknown>,
      requiresApproval: Boolean(s.requiresApproval),
      riskTier: typeof s.riskTier === 'string' ? s.riskTier : 'tier_1_draft',
      skillId: typeof s.skillId === 'string' ? s.skillId : null,
    })
  }
  return out.length ? out : null
}
