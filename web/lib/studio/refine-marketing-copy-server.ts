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
} from '@/lib/studio/refine-marketing-copy'
import { marketingCopyFromDna } from '@/lib/studio/vault-import'
import { loadDnaCopyInputForRelease } from '@/lib/studio/vault-import-server'

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

function finalizeAiCopy(field: keyof MarketingCopy, parsed: string): string {
  const cleaned = sanitizeRefinedCopy(parsed)
  if (!cleaned || refinedCopyLooksCorrupt(cleaned)) return ''
  if (field === 'store_description' || field === 'social_caption' || field === 'credits_block') {
    return clipField(field, cleaned)
  }
  return clipField(
    field,
    structureProCopy(cleaned, {
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
  const draft =
    clean(opts.draft) ||
    clean(existingCopy[field]) ||
    clean(generated[field])

  if (opts.useAi === false) {
    return {
      field,
      text: polishMarketingCopyFieldLocally({ field, draft, catalog: input }),
      source: 'local',
    }
  }

  try {
    const prompt = buildRefineMarketingCopyPrompt({
      field,
      draft,
      catalog: input,
      seed: generated[field],
    })
    const chat = await generateChatReply(prompt, {
      skillId: 'studio_release',
      honestyMode: 'strict',
      energyPreset: 'studio_week',
      pageContextPrompt:
        'Copywriting only. Do not call tools or mention /exec. Return one JSON object: {"text":"..."}. Use real newlines inside the string, never the two characters backslash-n. No markdown fences.',
    })
    const finalized = finalizeAiCopy(field, parseRefinedCopyReply(chat.reply))
    if (finalized) {
      return { field, text: finalized, source: 'ai' }
    }
  } catch {
    /* fall through to local polish */
  }

  return {
    field,
    text: polishMarketingCopyFieldLocally({ field, draft, catalog: input }),
    source: 'local',
  }
}

export async function refineAllMarketingCopyFields(
  supabase: SupabaseClient,
  releaseId: string,
  opts?: { drafts?: Partial<MarketingCopy>; useAi?: boolean },
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
    })
    copy[field] = result.text
    sources[field] = result.source
  }
  return { copy, sources }
}
