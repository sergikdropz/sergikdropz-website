import { describe, expect, it } from 'vitest'
import {
  TOOL_POLICY,
  isAllowedTool,
  isAdminAiToolExecutionEnabled,
} from '@/lib/ai/tool-policy'

describe('tool-policy', () => {
  it('requires approval for every registered tool', () => {
    for (const tool of Object.keys(TOOL_POLICY) as Array<keyof typeof TOOL_POLICY>) {
      expect(TOOL_POLICY[tool].requiresApproval).toBe(true)
      expect(isAllowedTool(tool)).toBe(true)
      expect(isAdminAiToolExecutionEnabled(tool)).toBe(true)
    }
  })

  it('rejects unknown tools', () => {
    expect(isAllowedTool('drop_production_db')).toBe(false)
  })
})
