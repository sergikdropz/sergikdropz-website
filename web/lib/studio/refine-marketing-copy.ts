import { COPY_TEMPLATES, type MarketingCopy } from '@/lib/studio/constants'
import {
  buildLaunchCaption,
  buildStoreDescription,
  catalogCopyPromptDigest,
  marketingCopyFromDna,
  type DnaCopyInput,
} from '@/lib/studio/vault-import'

export const MARKETING_COPY_FIELDS = Object.keys(COPY_TEMPLATES) as (keyof MarketingCopy)[]

export function isMarketingCopyField(value: string): value is keyof MarketingCopy {
  return (MARKETING_COPY_FIELDS as string[]).includes(value)
}

function clean(value: unknown): string {
  return value == null ? '' : String(value).trim()
}

function clip(text: string, max?: number): string {
  const value = clean(text)
  if (!max || value.length <= max) return value
  return `${value.slice(0, max - 1).trimEnd()}…`
}

/** Break run-on walls of text into short paragraphs (2–3 sentences each). */
export function structureProCopy(text: string, opts?: { maxSentencesPerPara?: number }): string {
  const maxPer = opts?.maxSentencesPerPara ?? 2
  const normalized = clean(text)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
  if (!normalized) return ''

  // Keep intentional tracklist / credits blocks intact.
  if (/^Tracklist\b/im.test(normalized) || /^Credits\b/im.test(normalized) || /^Artwork\b/im.test(normalized)) {
    return normalized
  }

  const parts = normalized.split(/\n\n+/).map((block) => clean(block)).filter(Boolean)
  const out: string[] = []

  for (const part of parts) {
    if (/^(Tracklist|Credits|Artwork|Label:)\b/i.test(part) || /^\d+\.\s/.test(part)) {
      out.push(part)
      continue
    }
    const sentences = part
      .split(/(?<=[.!?…])\s+/)
      .map((s) => clean(s))
      .filter(Boolean)
    if (sentences.length <= maxPer) {
      out.push(sentences.join(' '))
      continue
    }
    for (let i = 0; i < sentences.length; i += maxPer) {
      out.push(sentences.slice(i, i + maxPer).join(' '))
    }
  }

  return out.join('\n\n').trim()
}

/** Unescape model output and strip JSON / markdown scaffolding leftovers. */
export function sanitizeRefinedCopy(text: string): string {
  let value = clean(text)
  if (!value) return ''

  // Turn literal escape sequences into real characters first (common model glitch).
  value = value
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\./g, '.')
    .replace(/\\\\/g, '\\')

  // Prefer extracting a JSON text field even from broken replies.
  const extracted = extractJsonTextField(value)
  if (extracted) value = extracted

  // Drop leftover JSON / fence wrappers if still present.
  value = value
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .replace(/^\s*\{\s*"?(?:text|copy|value)"?\s*:\s*"?/i, '')
    .replace(/"?\s*\}\s*$/i, '')
    .replace(/^["']+|["']+$/g, '')

  // Remove orphan JSON keys / punctuation lines the model sometimes injects.
  value = value
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => {
      const t = line.trim()
      if (!t) return true
      if (/^[{}\[\],]+$/.test(t)) return false
      if (/^"?(?:text|copy|value)"?\s*:/i.test(t)) return false
      if (/^\\n+$/i.test(t)) return false
      // Lone em/en dash separators with no words
      if (/^[—–\-·•]+$/.test(t)) return false
      return true
    })
    .join('\n')

  // Collapse noisy blank runs created by removed lines.
  value = value
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()

  return value
}

function extractJsonTextField(raw: string): string | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = clean(fenced?.[1] || raw)

  // Strict JSON first.
  try {
    const parsed = JSON.parse(body) as { text?: unknown; copy?: unknown; value?: unknown }
    const text = clean(parsed.text ?? parsed.copy ?? parsed.value)
    if (text) return text
  } catch {
    /* continue */
  }

  // Repair truncated / single-quoted / trailing-comma JSON.
  try {
    const repaired = body
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/'/g, '"')
    const parsed = JSON.parse(repaired) as { text?: unknown; copy?: unknown; value?: unknown }
    const text = clean(parsed.text ?? parsed.copy ?? parsed.value)
    if (text) return text
  } catch {
    /* continue */
  }

  // Pull "text": "...." even when the rest of the object is garbage.
  const quoted = body.match(/"(?:text|copy|value)"\s*:\s*"((?:\\.|[^"\\])*)"/i)
  if (quoted?.[1]) {
    try {
      return JSON.parse(`"${quoted[1]}"`) as string
    } catch {
      return quoted[1]
    }
  }

  // Broken object: {"text":  <copy...> "}  or {"text": copy without quotes
  const loose = body.match(
    /"(?:text|copy|value)"\s*:\s*"?\s*([\s\S]*?)(?:"\s*\}\s*$|"\s*$|\}\s*$|$)/i,
  )
  if (loose?.[1]) {
    const chunk = clean(loose[1])
      .replace(/^["']+|["']+$/g, '')
      .replace(/"\s*,?\s*}?\s*$/i, '')
      .trim()
    if (chunk && !/^(?:text|copy|value)$/i.test(chunk)) return chunk
  }

  return null
}

export function parseRefinedCopyReply(reply: string): string {
  const raw = clean(reply)
  if (!raw) return ''
  const sanitized = sanitizeRefinedCopy(raw)
  if (!sanitized) return ''
  // If we still look like raw JSON scaffolding, try one more extraction pass.
  if (/^\s*\{/.test(sanitized) && /"(?:text|copy|value)"\s*:/i.test(sanitized)) {
    const again = extractJsonTextField(sanitized)
    if (again) return sanitizeRefinedCopy(again)
    return ''
  }
  return sanitized
}

/** True when the model reply still looks contaminated after sanitize. */
export function refinedCopyLooksCorrupt(text: string): boolean {
  const value = clean(text)
  if (!value) return true
  if (/\{"text"\s*:/i.test(value)) return true
  if (/\\n/.test(value)) return true
  if (/\\\./.test(value)) return true
  if (/^\s*```/.test(value)) return true
  // Mostly punctuation / escapes with almost no words
  const words = value.match(/[A-Za-z]{3,}/g) || []
  if (words.length < 3 && value.length > 40) return true
  return false
}

export function buildRefineMarketingCopyPrompt(input: {
  field: keyof MarketingCopy
  draft: string
  catalog: DnaCopyInput
  seed?: string
}): string {
  const meta = COPY_TEMPLATES[input.field]
  const digest = catalogCopyPromptDigest(input.catalog)
  const metadataDescription = clean(input.catalog.description)
  const catalogNotes = (input.catalog.tracks || [])
    .map((track, index) => {
      const note = clean(track.description)
      const intention = clean(track.intention)
      if (!note && !intention) return ''
      return [
        `${index + 1}. ${clean(track.title) || 'Untitled'}`,
        note ? `Catalog press: ${note}` : '',
        intention ? `Intention: ${intention}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    })
    .filter(Boolean)
    .join('\n\n')

  const limits = [
    meta.softMax ? `Soft target: ~${meta.softMax} characters.` : '',
    meta.hardMax ? `Hard limit: ${meta.hardMax} characters — never exceed.` : '',
  ]
    .filter(Boolean)
    .join(' ')

  const socialSeo =
    input.field === 'social_caption'
      ? [
          'SEO launch caption requirements:',
          '- Hook first line with OUT NOW + title + artist',
          '- One short feel line from metadata/catalog press notes',
          '- Facts line: track count, BPM range, genre/subgenre',
          '- Clear CTA (Stream everywhere / link in bio)',
          '- End with 10–14 hashtags: #SERGIK, title tag, genre/subgenre, #NewEP/#NewSingle, #NewMusic #OutNow #NowPlaying #ElectronicMusic #DanceMusic plus groove tags when relevant',
          '- Prefer line breaks over run-on text. No fake chart or playlist claims.',
        ].join('\n')
      : ''

  const storeSeo =
    input.field === 'store_description'
      ? [
          'SEO + engagement store description requirements:',
          '- Headline first: "{Title} by {Artist} — {Genre} {EP|Single|Album}"',
          '- Facts line with track count, BPM range, keys, genre/subgenre, label, year',
          '- Two short engagement paragraphs from Metadata description + Catalog press notes (not one run-on block)',
          '- One "Why press play" line that sells a start-to-finish listen',
          '- Tracklist section with numbered titles, BPM/key/genre, and a one-line press hook each',
          '- Include artwork credits when present',
          '- Close with a clear listen/stream CTA',
          '- Final Tags line: artist · title · genre · subgenre · release type (natural SEO keywords, not hashtag spam)',
          '- Front-load searchable terms (artist, title, genre). No fake charts or playlist claims.',
        ].join('\n')
      : ''

  return [
    `You are a music marketing editor for SERGIK Release Studio.`,
    `Refine ONLY the ${meta.label} (${input.field}) for "${clean(input.catalog.title) || 'Untitled'}".`,
    `Channel: ${meta.channel}.`,
    `Structure: ${meta.tip}`,
    limits,
    socialSeo,
    storeSeo,
    `Write professional, organized copy — short paragraphs, clear sentences, no run-on walls of text.`,
    `Ground every claim in the sources below. Do not invent guests, cities, chart facts, or awards.`,
    `Prefer the Metadata description and Catalog press notes when they conflict with a sloppy draft.`,
    '',
    '## Release metadata description',
    metadataDescription || '(empty)',
    '',
    '## Catalog track descriptions',
    catalogNotes || '(empty)',
    '',
    '## Metadata + Sonic DNA digest',
    digest,
    '',
    '## Seed from catalog/DNA (optional structure)',
    clean(input.seed) || '(none)',
    '',
    '## Current draft to polish',
    clean(input.draft) || '(empty — write fresh from sources)',
    '',
    `Return ONLY valid JSON: {"text":"<copy here>"}.`,
    `Put real line breaks inside the JSON string — never write the characters \\n.`,
    `No markdown fences, no commentary, no keys other than text.`,
  ]
    .filter(Boolean)
    .join('\n')
}

/** Deterministic structured polish when AI is unavailable — still updates the field. */
export function polishMarketingCopyFieldLocally(input: {
  field: keyof MarketingCopy
  draft?: string | null
  catalog: DnaCopyInput
}): string {
  const meta = COPY_TEMPLATES[input.field]
  const generated = marketingCopyFromDna(input.catalog)
  const draft = clean(input.draft)
  const seed = clean(generated[input.field])
  const metadata = clean(input.catalog.description)
  const sentenceHits = (draft.match(/[.!?…]/g) || []).length
  const draftIsRunOn = draft.length > 160 && sentenceHits < 2

  let text = draftIsRunOn ? seed || metadata || draft : draft || seed
  if (input.field === 'press_blurb') {
    const lead = structureProCopy(text || metadata || seed, { maxSentencesPerPara: 2 })
    text = lead || seed
  } else if (input.field === 'store_description') {
    text = buildStoreDescription(input.catalog)
  } else if (input.field === 'elevator_pitch') {
    text =
      structureProCopy(draftIsRunOn ? seed || draft : draft || seed, {
        maxSentencesPerPara: 1,
      }).split(/\n\n/)[0] || seed
  } else if (input.field === 'social_caption') {
    text = buildLaunchCaption(input.catalog)
  } else if (input.field === 'spotify_pitch') {
    text = structureProCopy(draftIsRunOn ? seed || draft : draft || seed, {
      maxSentencesPerPara: 2,
    })
  } else if (input.field === 'credits_block') {
    text = draft || seed
  }

  const max = meta.hardMax || meta.softMax
  if (input.field === 'store_description' || input.field === 'social_caption') {
    return clip(text, max)
  }
  return clip(
    structureProCopy(text, { maxSentencesPerPara: input.field === 'elevator_pitch' ? 1 : 2 }),
    max,
  )
}
