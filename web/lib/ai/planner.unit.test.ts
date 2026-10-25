import { describe, expect, it } from 'vitest'
import { buildExecutionPlan } from '@/lib/ai/planner'

describe('buildExecutionPlan', () => {
  it('leaves missing fields empty instead of writing TBD', () => {
    const plan = buildExecutionPlan('create_release_checklist', {})
    expect(plan.canExecute).toBe(false)
    expect(plan.missingRequiredFields).toContain('releaseName')
    expect(plan.suggestedPayload.releaseName).toBeUndefined()
    expect(JSON.stringify(plan.suggestedPayload)).not.toContain('TBD')
  })
})
