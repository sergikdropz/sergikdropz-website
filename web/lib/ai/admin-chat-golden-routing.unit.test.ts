import { describe, expect, it } from 'vitest'
import cases from '@/lib/ai/__fixtures__/admin-chat-golden-routing.json'
import { resolveInferredSkillForAdminChat } from '@/lib/ai/admin-chat-infer-skill'

type GoldenCase = {
  id: string
  message: string
  skillId: string | null
  stickySkillId: string | null
  expectedInferredSkillId: string
}

describe('admin chat golden routing (infer + sticky)', () => {
  it.each(cases as GoldenCase[])('$id → $expectedInferredSkillId', (c) => {
    const s = resolveInferredSkillForAdminChat(c.message, {
      skillId: c.skillId,
      stickySkillId: c.stickySkillId,
    })
    expect(s.id).toBe(c.expectedInferredSkillId)
  })
})
