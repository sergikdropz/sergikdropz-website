import { COPY_TEMPLATES, type MarketingCopy } from '@/lib/studio/constants'
import {
  buildLaunchCaption,
  buildPlatformTags,
  buildStoreDescription,
  buildYoutubeVisualizerDescription,
  catalogCopyPromptDigest,
  marketingCopyFromDna,
  type DnaCopyInput,
} from '@/lib/studio/vault-import'
import {
  copyFieldContextLine,
  formatCopyAdminDeskBrief,
  formatCopyIntelligenceBrief,
} from '@/lib/studio/copy-intelligence'

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

  // Keep intentional tracklist / credits / visualizer blocks intact.
  if (
    /^Tracklist\b/im.test(normalized) ||
    /^TRACK BY TRACK\b/im.test(normalized) ||
    /^CHAPTERS\b/im.test(normalized) ||
    /^Credits\b/im.test(normalized) ||
    /^CREDITS\b/im.test(normalized) ||
    /^Artwork\b/im.test(normalized) ||
    /^YOUTUBE TAGS\b/im.test(normalized) ||
    /^YOUTUBE HASHTAGS\b/im.test(normalized) ||
    /^INSTAGRAM\b/im.test(normalized)
  ) {
    return normalized
  }

  const parts = normalized.split(/\n\n+/).map((block) => clean(block)).filter(Boolean)
  const out: string[] = []

  for (const part of parts) {
    if (
      /^(Tracklist|TRACK BY TRACK|CHAPTERS|Credits|CREDITS|Artwork|Label:|YOUTUBE TAGS|YOUTUBE HASHTAGS|INSTAGRAM|X|TIKTOK|SOUNDCLOUD|BANDCAMP)\b/i.test(
        part,
      ) ||
      /^\d+\.\s/.test(part) ||
      /^\d{1,2}:\d{2}/.test(part)
    ) {
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

const YOUTUBE_REQUIRED_BLOCKS = ['TRACKLIST', 'CHAPTERS', 'CREDITS'] as const
const YOUTUBE_TAIL_RE = /\n(?=(?:TRACKLIST|CHAPTERS|CREDITS|#)\b)/
const STORE_TRACKLIST_RE = /(?:^|\n)(Tracklist\b[\s\S]*?)(?=\n(?:Credits|Artwork|Tags:|Listen|Why press play)|$)/i

function extractLabeledBlock(source: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = source.match(
    new RegExp(`(?:^|\\n)(${escaped}\\b[\\s\\S]*?)(?=\\n(?:TRACKLIST|CHAPTERS|CREDITS|#)|$)`, 'i'),
  )
  return match ? clean(match[1]) : ''
}

export function missingCatalogTitles(text: string, titles: string[]): string[] {
  const hay = clean(text).toLowerCase()
  return titles
    .map((title) => clean(title))
    .filter((title) => title.length > 0 && !hay.includes(title.toLowerCase()))
}

/** Only titles that appear inside TRACK BY TRACK count as described. */
export function missingVisualizerWalkTitles(text: string, titles: string[]): string[] {
  const walk = extractLabeledBlock(text, 'TRACK BY TRACK')
  return missingCatalogTitles(walk, titles)
}

/** Only titles inside the store Tracklist count as listed. */
export function missingStoreTracklistTitles(text: string, titles: string[]): string[] {
  const list = clean(text.match(STORE_TRACKLIST_RE)?.[1] || '')
  return missingCatalogTitles(list, titles)
}

/** Keep the track walk + required blocks when YouTube copy overflows the 5000-char cap. */
export function clipYoutubeVisualizer(text: string, max?: number): string {
  const value = clean(text)
  if (!max || value.length <= max) return value
  const match = value.match(/(?:^|\n)(TRACK BY TRACK\b[\s\S]*)$/i)
  const tail = match ? clean(match[1]) : ''
  if (!tail) return `${value.slice(0, max - 1).trimEnd()}…`
  if (tail.length >= max - 80) {
    return `${tail.slice(0, max - 1).trimEnd()}…`
  }
  const head = value.slice(0, value.length - tail.length).trimEnd()
  const budget = max - tail.length - 2
  return `${head.slice(0, budget).trimEnd()}\n\n${tail}`
}

function extractYoutubeWalkBlocks(seed: string): string[] {
  const walk = extractLabeledBlock(seed, 'TRACK BY TRACK').replace(/^TRACK BY TRACK\b\s*/i, '')
  return walk
    .split(/\n\n+/)
    .map((block) => clean(block))
    .filter(Boolean)
}

function extractYoutubeWalkBlock(seed: string, title: string): string {
  const needle = clean(title).toLowerCase()
  if (!needle) return ''
  return extractYoutubeWalkBlocks(seed).find((block) => block.toLowerCase().includes(needle)) || ''
}

function insertBeforeYoutubeTail(text: string, block: string): string {
  const chunk = clean(block)
  if (!chunk) return text
  const match = text.match(YOUTUBE_TAIL_RE)
  if (match && match.index != null) {
    return `${text.slice(0, match.index)}\n\n${chunk}${text.slice(match.index)}`
  }
  return `${text}\n\n${chunk}`
}

/** Keep AI prose but restore required YouTube blocks and any skipped track walk from the catalog seed. */
export function mergeYoutubeVisualizerStructure(
  aiText: string,
  seed?: string | null,
  titles?: string[],
): string {
  let text = clean(aiText)
  const source = clean(seed)
  if (!text) return source
  if (!source) return text

  const missingTitles = titles?.length ? missingVisualizerWalkTitles(text, titles) : []
  if (missingTitles.length) {
    const extras = missingTitles.map((title) => extractYoutubeWalkBlock(source, title)).filter(Boolean)
    if (extras.length) {
      const chunk = extras.join('\n\n')
      text = /^TRACK BY TRACK\b/im.test(text)
        ? insertBeforeYoutubeTail(text, chunk)
        : insertBeforeYoutubeTail(text, `TRACK BY TRACK\n\n${chunk}`)
    }
  }

  const missing = YOUTUBE_REQUIRED_BLOCKS.filter((block) => !new RegExp(`^${block}\\b`, 'im').test(text))
  if (!missing.length) return text
  const extras = missing.map((block) => extractLabeledBlock(source, block)).filter(Boolean)
  if (!extras.length) return text
  return `${text}\n\n${extras.join('\n\n')}`.trim()
}

/** Restore a store Tracklist that names every catalog cut when the model stops after the first. */
export function mergeStoreTrackCoverage(
  aiText: string,
  seed?: string | null,
  titles?: string[],
): string {
  const text = clean(aiText)
  const source = clean(seed)
  if (!text) return source
  if (!source || !titles?.length || !missingStoreTracklistTitles(text, titles).length) return text
  const seedList = clean(source.match(STORE_TRACKLIST_RE)?.[1] || '')
  if (!seedList) return text
  if (/^Tracklist\b/im.test(text)) {
    return text.replace(/(?:^|\n)Tracklist\b[\s\S]*?(?=\n(?:Credits|Artwork|Tags:|Listen|Why press play)|$)/i, `\n${seedList}`).trim()
  }
  return `${text}\n\n${seedList}`.trim()
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
  mode?: 'draft' | 'refine'
}): string {
  const meta = COPY_TEMPLATES[input.field]
  const digest = catalogCopyPromptDigest(input.catalog)
  const metadataDescription = clean(input.catalog.description)
  const catalogTitles = (input.catalog.tracks || [])
    .map((track) => clean(track.title))
    .filter(Boolean)
  const catalogNotes = (input.catalog.tracks || [])
    .map((track, index) => {
      const title = clean(track.title) || 'Untitled'
      const note = clean(track.description)
      const intention = clean(track.intention)
      return [
        `${index + 1}. ${title}`,
        note
          ? `Catalog press: ${note}`
          : `REQUIRED: write a unique listener-facing description for "${title}". Do not skip this cut.`,
        intention ? `Intention: ${intention}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    })
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
          '- Tracklist MUST include every catalog title with its own one-line press hook — do not stop after the first cut',
          '- Include artwork credits when present',
          '- Close with a clear listen/stream CTA',
          '- Final Tags line: artist · title · genre · subgenre · release type (natural SEO keywords, not hashtag spam)',
          '- Front-load searchable terms (artist, title, genre). No fake charts or playlist claims.',
        ].join('\n')
      : ''

  const youtubeSeo =
    input.field === 'youtube_visualizer'
      ? [
          'YouTube full-EP visualizer description requirements:',
          '- Headline first: "{Title} — Full EP Visualizer | {Artist}" (or Full Album / Track for those kinds)',
          '- This is ONE continuous video of the whole release in catalog order. No gaps / no space between tracks.',
          '- Open with a start-to-finish description of the EP as a single listen, grounded in Metadata + Catalog press notes',
          '- TRACK BY TRACK MUST include EVERY catalog track by exact title — no skipping, no merging two cuts into one paragraph, no "and the rest"',
          '- If the catalog lists N tracks, TRACK BY TRACK must have N headed entries, each with start–finish timestamps (00:00–03:24), BPM/key, press note, ISRC when known',
          '- TRACKLIST (continuous · no space between tracks) must list every track in EP order with start AND finish video times',
          '- The finish time of track N must equal the start time of track N+1',
          '- CHAPTERS section uses start stamps only, first line MUST be 00:00, chronological',
          '- CREDITS from Catalog contributors + artwork + label + year. Do not invent guests or durations',
          '- If a Catalog duration is missing, write "pending" — never guess a time',
          '- End with visualizer hashtags (#Visualizer #OfficialAudio #FullEP). Stay under 5000 characters.',
        ].join('\n')
      : ''

  const tagsSeo =
    input.field === 'platform_tags'
      ? [
          'Platform tags + hashtags requirements:',
          '- Keep labeled blocks: YOUTUBE TAGS, YOUTUBE HASHTAGS, INSTAGRAM / THREADS, X, TIKTOK, SOUNDCLOUD, BANDCAMP / STORE',
          '- YOUTUBE TAGS = comma-separated keywords with NO #. Stay under 500 characters. Include artist, title, genre, Official Audio, Visualizer, Full EP, and catalog track titles when they fit',
          '- YOUTUBE HASHTAGS = hashed discovery tags for the description (#Visualizer #OfficialAudio #FullEP plus brand/genre)',
          '- INSTAGRAM / THREADS = 10–14 hashtags (brand + title + genre + NewMusic/OutNow)',
          '- X = 4–6 short hashtags only',
          '- TIKTOK = 8–10 music-discovery hashtags. No fake viral/chart claims',
          '- SOUNDCLOUD = lowercase comma keywords',
          '- BANDCAMP / STORE = Tags: artist · title · genre line',
          '- Ground tags in Catalog genre/subgenre/artist. Do not invent playlist or chart names.',
        ].join('\n')
      : ''

  const mode = input.mode === 'draft' ? 'draft' : 'refine'
  const intelligence = formatCopyIntelligenceBrief({
    field: input.field,
    tracks: input.catalog.tracks || [],
  })
  const desk =
    mode === 'draft'
      ? `Write a fresh ${meta.label} from the sources. The catalog seed is structure only — prefer unified Sonic DNA + Catalog over a stub draft.`
      : `Polish ONLY the ${meta.label}. Prefer Metadata + Catalog + unified intelligence when they conflict with a sloppy draft.`

  const adminDesk = formatCopyAdminDeskBrief(input.field)

  return [
    `You are SergikAI on the SERGIK copy desk — a polymath marketing editor working with Admin AI agents (strategy, growth, smartlink, ops intel).`,
    `${desk}`,
    `Field: ${meta.label} (${input.field}) for "${clean(input.catalog.title) || 'Untitled'}".`,
    `Channel: ${meta.channel}.`,
    `Context: ${copyFieldContextLine(input.field)}.`,
    `Structure: ${meta.tip}`,
    limits,
    socialSeo,
    storeSeo,
    youtubeSeo,
    tagsSeo,
    `Write professional, organized copy — short paragraphs, clear sentences, no run-on walls of text.`,
    catalogTitles.length > 1
      ? `This release has ${catalogTitles.length} catalog tracks. Name and describe ALL of them: ${catalogTitles.join(', ')}.`
      : '',
    `Ground every claim in the sources below. Do not invent guests, cities, chart facts, awards, analytics, or durations.`,
    '',
    '## Unified Sonic DNA + polymath brief (authoritative feel / groove / culture)',
    intelligence,
    '',
    '## Admin AI desk — strategy + expansion',
    adminDesk || '(credits / catalog only)',
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
    mode === 'draft' ? '## Current draft (replace unless it already holds verified facts)' : '## Current draft to polish',
    clean(input.draft) || '(empty — write fresh from sources)',
    '',
    `Return ONLY valid JSON: {"text":"<copy here>"}.`,
    `Put real line breaks inside the JSON string — never write the characters \\n.`,
    `No markdown fences, no commentary, no keys other than text.`,
  ]
    .filter(Boolean)
    .join('\n')
}

/** Metadata panel DSP description — same intelligence desk as store copy, without marketing-only tags. */
export function buildListeningJourneyRefinePrompt(input: {
  catalog: DnaCopyInput
  draft?: string | null
  seed?: string | null
  mode?: 'draft' | 'refine'
}): string {
  const mode = input.mode === 'draft' ? 'draft' : 'refine'
  const intelligence = formatCopyIntelligenceBrief({
    field: 'store_description',
    tracks: input.catalog.tracks || [],
  })
  const adminDesk = formatCopyAdminDeskBrief('store_description')
  const digest = catalogCopyPromptDigest(input.catalog)
  const catalogTitles = (input.catalog.tracks || []).map((track) => clean(track.title)).filter(Boolean)

  const desk =
    mode === 'draft'
      ? 'Write a fresh Metadata listening journey from Catalog + unified Sonic DNA.'
      : 'Polish the Metadata listening journey. Prefer Catalog press notes + unified intelligence over a thin draft.'

  return [
    'You are SergikAI on the SERGIK copy desk — polymath editor with Admin AI strategy + smartlink agents.',
    desk,
    `Release: "${clean(input.catalog.title) || 'Untitled'}" (${clean(input.catalog.artist) || 'SERGIK'}).`,
    `Context: ${copyFieldContextLine('store_description')}.`,
    'Metadata description requirements:',
    '- Opening: start-to-finish listening journey across the full catalog order (one room, play in order)',
    '- Include ordered Tracklist with every catalog title',
    '- Include Credits from contributors when present',
    '- Include artwork designer / photographer / illustrator lines when present',
    '- Journalist tone — sensory, specific, no lab voice, no fake charts or playlist claims',
    '- Do NOT add a separate marketing Tags line or hashtag block (that lives in Copywriting Studio)',
    catalogTitles.length > 1
      ? `This release has ${catalogTitles.length} catalog tracks. Name ALL of them in the journey and tracklist: ${catalogTitles.join(', ')}.`
      : '',
    '',
    '## Unified Sonic DNA + polymath brief',
    intelligence,
    '',
    '## Admin AI desk',
    adminDesk || '(catalog only)',
    '',
    '## Metadata + Sonic DNA digest',
    digest,
    '',
    '## Seed from catalog (structure reference)',
    clean(input.seed) || '(none)',
    '',
    mode === 'draft' ? '## Current draft' : '## Current draft to polish',
    clean(input.draft) || '(empty — write fresh from sources)',
    '',
    'Return ONLY valid JSON: {"text":"<copy here>"}. Real newlines inside the string. No markdown fences.',
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
  } else if (input.field === 'youtube_visualizer') {
    text = buildYoutubeVisualizerDescription(input.catalog)
  } else if (input.field === 'elevator_pitch') {
    text =
      structureProCopy(draftIsRunOn ? seed || draft : draft || seed, {
        maxSentencesPerPara: 1,
      }).split(/\n\n/)[0] || seed
  } else if (input.field === 'social_caption') {
    text = buildLaunchCaption(input.catalog)
  } else if (input.field === 'platform_tags') {
    text = buildPlatformTags(input.catalog)
  } else if (input.field === 'spotify_pitch') {
    text = structureProCopy(draftIsRunOn ? seed || draft : draft || seed, {
      maxSentencesPerPara: 2,
    })
  } else if (input.field === 'credits_block') {
    text = draft || seed
  }

  const max = meta.hardMax || meta.softMax
  if (input.field === 'youtube_visualizer') {
    return clipYoutubeVisualizer(text, meta.hardMax)
  }
  if (
    input.field === 'store_description' ||
    input.field === 'social_caption' ||
    input.field === 'platform_tags'
  ) {
    return clip(text, max)
  }
  return clip(
    structureProCopy(text, { maxSentencesPerPara: input.field === 'elevator_pitch' ? 1 : 2 }),
    max,
  )
}
