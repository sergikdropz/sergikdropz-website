import { isContinuationOnlyUserMessage } from '@/lib/ai/chat-skill-context'
import { getSkillById, inferSkillFromIntent } from '@/lib/ai/skills/registry'
import type { AdminSkill } from '@/lib/ai/skills/types'

/** Pure routing: locked skill → sticky continuation → intent inference. */
export function resolveInferredSkillForAdminChat(
  message: string,
  options: { skillId?: string | null; stickySkillId?: string | null }
): AdminSkill {
  const id = options?.skillId?.trim()
  if (id) {
    const s = getSkillById(id)
    if (s) return s
  }
  const sticky = options?.stickySkillId?.trim()
  if (sticky && isContinuationOnlyUserMessage(message)) {
    const s = getSkillById(sticky)
    if (s) return s
  }
  return inferSkillFromIntent(message)
}
