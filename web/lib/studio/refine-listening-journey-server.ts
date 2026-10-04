import type { SupabaseClient } from '@supabase/supabase-js'
import { generateChatReply } from '@/lib/admin-ai'
import { buildSiteKnowledgeContext } from '@/lib/ai/site-knowledge-context'
import { getSkillById } from '@/lib/ai/skills/registry'
import {
  COPY_FIELD_ADMIN_AGENTS,
  copyFieldContextLine,
  copyFieldEnergyPreset,
  copyFieldKnowledgeQuery,
  copyFieldPrimarySkillId,
  formatCopyAdminDeskBrief,
} from '@/lib/studio/copy-intelligence'
import {
  buildListeningJourneyRefinePrompt,
  parseRefinedCopyReply,
  structureProCopy,
} from '@/lib/studio/refine-marketing-copy'
import { releaseDescriptionFromCatalog } from '@/lib/studio/vault-import'
import { loadDnaCopyInputForRelease } from '@/lib/studio/vault-import-server'

function clean(value: unknown): string {
  return value == null ? '' : String(value).trim()
}

export async function refineReleaseListeningJourney(
  supabase: SupabaseClient,
  releaseId: string,
  opts?: {
    draft?: string | null
    useAi?: boolean
    mode?: 'draft' | 'refine'
  },
): Promise<{ text: string; source: 'ai' | 'local' }> {
  const { input } = await loadDnaCopyInputForRelease(supabase, releaseId)
  const seed = releaseDescriptionFromCatalog(input)
  const mode = opts?.mode === 'draft' ? 'draft' : 'refine'
  const draft =
    mode === 'draft' ? clean(opts?.draft) : clean(opts?.draft) || clean(input.description) || seed

  if (opts?.useAi === false) {
    return { text: seed || draft, source: 'local' }
  }

  try {
    const prompt = buildListeningJourneyRefinePrompt({
      catalog: input,
      draft,
      seed,
      mode,
    })
    const skillId = copyFieldPrimarySkillId('store_description')
    const knowledge = buildSiteKnowledgeContext({
      message: copyFieldKnowledgeQuery('store_description', input.title),
      pathname: `/studio/releases/${releaseId}`,
    })
    const skillDesk = COPY_FIELD_ADMIN_AGENTS.store_description
      .map((id) => {
        const skill = getSkillById(id)
        return skill ? `${skill.name}: ${skill.purpose}` : ''
      })
      .filter(Boolean)
      .join(' · ')
    const chat = await generateChatReply(prompt, {
      skillId,
      honestyMode: 'strict',
      energyPreset: copyFieldEnergyPreset('store_description'),
      siteKnowledgePrompt: knowledge.prompt,
      pageContextPrompt: [
        'SergikAI metadata listening journey desk. Copywriting only — do not call tools or mention /exec.',
        `Field context: ${copyFieldContextLine('store_description')}.`,
        `Admin AI desk: ${skillDesk || 'Release Studio'}.`,
        formatCopyAdminDeskBrief('store_description'),
        'Ground the journey in unified Sonic DNA + catalog press notes. Return one JSON object: {"text":"..."}.',
      ].join('\n'),
    })
    const parsed = clean(parseRefinedCopyReply(chat.reply))
    if (parsed.length >= 80) {
      return { text: parsed, source: 'ai' }
    }
  } catch {
    /* local fallback */
  }

  const fallback = seed || structureProCopy(draft, { maxSentencesPerPara: 2 })
  return { text: fallback || draft, source: 'local' }
}
