import { describe, expect, it } from 'vitest'
import { resolveInferredSkillForAdminChat } from '@/lib/ai/admin-chat-infer-skill'

describe('resolveInferredSkillForAdminChat', () => {
  it('prefers explicit skillId over sticky and continuation', () => {
    const s = resolveInferredSkillForAdminChat('yes', {
      skillId: 'admin_intel',
      stickySkillId: 'product_strategy',
    })
    expect(s.id).toBe('admin_intel')
  })

  it.each(['yes', 'same thing', 'continue with that', 'carry on'] as const)(
    'reuses sticky admin_intel for continuation: %s',
    (msg) => {
      const s = resolveInferredSkillForAdminChat(msg, {
        skillId: null,
        stickySkillId: 'admin_intel',
      })
      expect(s.id).toBe('admin_intel')
    }
  )

  it('ignores sticky when the message is not a bare continuation', () => {
    const s = resolveInferredSkillForAdminChat('What is my release calendar for Q4?', {
      skillId: null,
      stickySkillId: 'product_strategy',
    })
    expect(s.id).toBe('admin_intel')
  })

  it('falls through to intent when sticky id is unknown', () => {
    const s = resolveInferredSkillForAdminChat('yes', {
      skillId: null,
      stickySkillId: 'not_a_real_skill',
    })
    expect(s.id).toBe('product_strategy')
  })
})
