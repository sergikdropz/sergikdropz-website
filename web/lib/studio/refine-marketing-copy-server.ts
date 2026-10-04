import type { SupabaseClient } from '@supabase/supabase-js'
import { generateChatReply } from '@/lib/admin-ai'
import { COPY_TEMPLATES, type MarketingCopy } from '@/lib/studio/constants'
import {
  buildRefineMarketingCopyPrompt,
  isMarketingCopyField,
  parseRefinedCopyReply,
  polishMarketingCopyFieldLocally,
  refinedCopyLooksCorrupt,
  sanitizeRefinedCopy,
  structureProCopy,
  clipYoutubeVisualizer,
  mergeStoreTrackCoverage,
  mergeYoutubeVisualizerStructure,
  missingVisualizerWalkTitles,
} from '@/lib/studio/refine-marketing-copy'
import { marketingCopyFromDna } from '@/lib/studio/vault-import'
import { loadDnaCopyInputForRelease } from '@/lib/studio/vault-import-server'
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

function clean(value: unknown): string {
  return value == null ? '' : String(value).trim()
}

function clipField(field: keyof MarketingCopy, text: string): string {
  const meta = COPY_TEMPLATES[field]
  const max = meta.hardMax || meta.softMax
  const value = clean(text)
  if (!max || value.length <= max) return value
  return `${value.slice(0, max - 1).trimEnd()}…`
}

function finalizeAiCopy(
  field: keyof MarketingCopy,
  parsed: string,
  seed?: string,
  titles?: string[],
): string {
  const cleaned = sanitizeRefinedCopy(parsed)
  if (!cleaned || refinedCopyLooksCorrupt(cleaned)) return ''
  let text =
    field === 'youtube_visualizer'
      ? mergeYoutubeVisualizerStructure(cleaned, seed, titles)
      : field === 'store_description'
        ? mergeStoreTrackCoverage(cleaned, seed, titles)
        : cleaned
  if (
    field === 'youtube_visualizer' &&
    titles?.length &&
    missingVisualizerWalkTitles(text, titles).length &&
    seed
  ) {
    text = seed
  }
  if (field === 'youtube_visualizer') {
    return clipYoutubeVisualizer(text, COPY_TEMPLATES.youtube_visualizer.hardMax)
  }
  if (
    field === 'store_description' ||
    field === 'social_caption' ||
    field === 'platform_tags' ||
    field === 'credits_block'
  ) {
    return clipField(field, text)
  }
  return clipField(
    field,
    structureProCopy(text, {
      maxSentencesPerPara: field === 'elevator_pitch' ? 1 : 2,
    }),
  )
}

export async function refineMarketingCopyField(
  supabase: SupabaseClient,
  releaseId: string,
  opts: {
    field: string
    draft?: string | null
    useAi?: boolean
    mode?: 'draft' | 'refine'
  },
): Promise<{
  field: keyof MarketingCopy
  text: string
  source: 'ai' | 'local'
}> {
  if (!isMarketingCopyField(opts.field)) {
    throw new Error(`Unknown marketing copy field: ${opts.field}`)
  }
  const field = opts.field
  const { input, existingCopy } = await loadDnaCopyInputForRelease(supabase, releaseId)
  const generated = marketingCopyFromDna(input)
  const mode = opts.mode === 'draft' ? 'draft' : 'refine'
  const draft =
    mode === 'draft'
      ? clean(opts.draft)
      : clean(opts.draft) || clean(existingCopy[field]) || clean(generated[field])

  if (opts.useAi === false) {
    return {
      field,
      text: polishMarketingCopyFieldLocally({
        field,
        draft: draft || generated[field],
        catalog: input,
      }),
      source: 'local',
    }
  }

  try {
    const prompt = buildRefineMarketingCopyPrompt({
      field,
      draft,
      catalog: input,
      seed: generated[field],
      mode,
    })
    const energy = copyFieldEnergyPreset(field)
    const skillId = copyFieldPrimarySkillId(field)
    const knowledge = buildSiteKnowledgeContext({
      message: copyFieldKnowledgeQuery(field, input.title),
      pathname: `/studio/releases/${releaseId}`,
    })
    const skillDesk = COPY_FIELD_ADMIN_AGENTS[field]
      .map((id) => {
        const skill = getSkillById(id)
        return skill ? `${skill.name}: ${skill.purpose}` : ''
      })
      .filter(Boolean)
      .join(' · ')
    const chat = await generateChatReply(prompt, {
      skillId,
      honestyMode: 'strict',
      energyPreset: energy,
      siteKnowledgePrompt: knowledge.prompt,
      pageContextPrompt: [
        'SergikAI copy desk. Copywriting only — do not call tools or mention /exec.',
        `Field context: ${copyFieldContextLine(field)}.`,
        `Admin AI desk: ${skillDesk || 'Release Studio'}.`,
        formatCopyAdminDeskBrief(field),
        'Ground feel, groove, culture, and listening benefits in the unified Sonic DNA / polymath brief.',
        'Use site knowledge only for real routes (music, videos, shop, share). Never invent analytics or store URLs.',
        'Return one JSON object: {"text":"..."}. Use real newlines inside the string, never the two characters backslash-n. No markdown fences.',
      ].join('\n'),
    })
    const titles = (input.tracks || []).map((track) => track.title).filter(Boolean)
    const finalized = finalizeAiCopy(field, parseRefinedCopyReply(chat.reply), generated[field], titles)
    if (finalized) {
      return { field, text: finalized, source: 'ai' }
    }
  } catch {
    /* fall through to local polish */
  }

  return {
    field,
    text: polishMarketingCopyFieldLocally({
      field,
      draft: draft || generated[field],
      catalog: input,
    }),
    source: 'local',
  }
}

export async function refineAllMarketingCopyFields(
  supabase: SupabaseClient,
  releaseId: string,
  opts?: { drafts?: Partial<MarketingCopy>; useAi?: boolean; mode?: 'draft' | 'refine' },
): Promise<{
  copy: MarketingCopy
  sources: Partial<Record<keyof MarketingCopy, 'ai' | 'local'>>
}> {
  const fields = Object.keys(COPY_TEMPLATES) as (keyof MarketingCopy)[]
  const copy: MarketingCopy = {}
  const sources: Partial<Record<keyof MarketingCopy, 'ai' | 'local'>> = {}
  for (const field of fields) {
    const result = await refineMarketingCopyField(supabase, releaseId, {
      field,
      draft: opts?.drafts?.[field],
      useAi: opts?.useAi,
      mode: opts?.mode,
    })
    copy[field] = result.text
    sources[field] = result.source
  }
  return { copy, sources }
}
