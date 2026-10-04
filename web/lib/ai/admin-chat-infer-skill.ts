import { ADMIN_DESK_CARDS, deskSkillHintFromMessage } from '@/lib/ai/admin-ai-desks'
import { parseAdminAiMentions } from '@/lib/ai/admin-ai-mentions'
import { isContinuationOnlyUserMessage } from '@/lib/ai/chat-skill-context'
import { getSkillById, inferSkillFromIntent } from '@/lib/ai/skills/registry'
import type { AdminSkill } from '@/lib/ai/skills/types'

function skillHintFromMentions(message: string): string | null {
  for (const mention of parseAdminAiMentions(message)) {
    if (mention.kind === 'desk' && mention.deskLabel) {
      const card = ADMIN_DESK_CARDS.find(
        (c) => c.label.toLowerCase() === mention.deskLabel!.toLowerCase(),
      )
      if (card) return card.skillHint
    }
    if (mention.kind === 'release' || mention.kind === 'ops' || mention.kind === 'due') {
      return 'studio_release'
    }
    if (mention.kind === 'growth') return 'growth_marketing'
  }
  return null
}

/** Pure routing: locked skill → sticky continuation → desk/selection → intent. */
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
  const mentionHint = skillHintFromMentions(message)
  if (mentionHint) {
    const fromMention = getSkillById(mentionHint)
    if (fromMention) return fromMention
  }
  const deskHint = deskSkillHintFromMessage(message)
  if (deskHint) {
    const fromDesk = getSkillById(deskHint)
    if (fromDesk) return fromDesk
  }
  // Form / identifier questions with a Selected: or DOM Path: block → Release Studio.
  if (
    /(^|\n)(Selected:|Page:|DOM Path:)/.test(message) &&
    /\b(upc|isrc|field|form|metadata|release date|songwriter|genre|blocker|distrokid|revelator)\b/i.test(
      message,
    )
  ) {
    const studio = getSkillById('studio_release')
    if (studio) return studio
  }
  return inferSkillFromIntent(message)
}
