import { extractMeasured, parseSonicDna } from '@/lib/audio/sonic-dna-quality'
import { hasUnifiedSonicDnaIntelligence } from '@/lib/audio/compose-unified-sonic-dna'
import { durationToSeconds } from '@/lib/studio/isrc-format'
import type { MarketingCopy } from '@/lib/studio/constants'

export type CopyPolymathAgent =
  | 'intention_analyst'
  | 'description_writer'
  | 'cultural_analyst'
  | 'musicologist'
  | 'emotional_psychologist'
  | 'psychology_analyst'
  | 'psychoacoustics_analyst'
  | 'genre_specialist'

/** Admin AI skills that sit beside the Sonic DNA polymath desk. */
export type CopyAdminAgent =
  | 'studio_release'
  | 'product_strategy'
  | 'growth_marketing'
  | 'smartlink_seo'
  | 'admin_intel'

export type CopyIntelCard = {
  title: string
  unified: boolean
  groove: string
  intention: string
  description: string
  culture: string
  musicology: string
  emotion: string
  psychology: string
  psychoacoustics: string
  related: string[]
  durationSec: number | null
}

export const COPY_FIELD_AGENTS: Record<keyof MarketingCopy, CopyPolymathAgent[]> = {
  elevator_pitch: ['intention_analyst', 'description_writer', 'genre_specialist'],
  press_blurb: ['description_writer', 'cultural_analyst', 'musicologist', 'intention_analyst'],
  spotify_pitch: ['genre_specialist', 'psychoacoustics_analyst', 'emotional_psychologist'],
  social_caption: ['intention_analyst', 'emotional_psychologist', 'description_writer'],
  store_description: ['description_writer', 'psychoacoustics_analyst', 'cultural_analyst', 'musicologist'],
  youtube_visualizer: [
    'description_writer',
    'intention_analyst',
    'cultural_analyst',
    'musicologist',
    'emotional_psychologist',
    'psychology_analyst',
    'psychoacoustics_analyst',
  ],
  platform_tags: [
    'genre_specialist',
    'cultural_analyst',
    'description_writer',
    'intention_analyst',
    'musicologist',
  ],
  credits_block: [],
}

export const COPY_FIELD_ADMIN_AGENTS: Record<keyof MarketingCopy, CopyAdminAgent[]> = {
  elevator_pitch: ['studio_release', 'product_strategy'],
  press_blurb: ['studio_release', 'product_strategy'],
  spotify_pitch: ['studio_release', 'product_strategy', 'growth_marketing'],
  social_caption: ['product_strategy', 'growth_marketing', 'smartlink_seo'],
  store_description: ['product_strategy', 'growth_marketing', 'smartlink_seo'],
  youtube_visualizer: ['product_strategy', 'growth_marketing', 'smartlink_seo'],
  platform_tags: ['product_strategy', 'growth_marketing', 'smartlink_seo', 'admin_intel'],
  credits_block: ['studio_release'],
}

const AGENT_LABEL: Record<CopyPolymathAgent, string> = {
  intention_analyst: 'intention',
  description_writer: 'description',
  cultural_analyst: 'culture',
  musicologist: 'musicology',
  emotional_psychologist: 'emotion',
  psychology_analyst: 'psychology',
  psychoacoustics_analyst: 'psychoacoustics',
  genre_specialist: 'genre lock',
}

const ADMIN_AGENT_LABEL: Record<CopyAdminAgent, string> = {
  studio_release: 'studio',
  product_strategy: 'strategy',
  growth_marketing: 'growth',
  smartlink_seo: 'smartlink',
  admin_intel: 'ops intel',
}

const ADMIN_AGENT_PURPOSE: Record<CopyAdminAgent, string> = {
  studio_release:
    'Release Studio Ops — catalog completeness, rights honesty, and DSP-safe claims. Never mark a store live without a store link.',
  product_strategy:
    'Marketing & Product Strategy — SEO clusters, conversion (one CTA), campaign timing, paste-ready angles. Never invent analytics.',
  growth_marketing:
    'Growth Marketing — channel cadence and launch velocity. Do not persist campaign rows or invent follower counts from this desk.',
  smartlink_seo:
    'Smartlink + UTM — attribution-safe destinations. Only name URLs that appear in catalog/store links; otherwise say “smart link pending”.',
  admin_intel:
    'Ops Intelligence — cite live counts only when a snapshot is provided below. Never invent pipeline, fan, or chart numbers.',
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {}
}

function clip(text: unknown, max = 220): string {
  const value = String(text || '').trim()
  if (!value || /awaiting audio analysis/i.test(value)) return ''
  if (/groove class|from measured usage|not from a crate name/i.test(value)) return ''
  if (value.length <= max) return value
  return `${value.slice(0, max - 1).trimEnd()}…`
}

function firstSentence(text: string, max = 180): string {
  const trimmed = text.trim()
  if (!trimmed) return ''
  const sentence = trimmed.split(/(?<=[.!?])\s+/)[0] || trimmed
  return clip(sentence, max)
}

export function copyFieldAgentLabels(field: keyof MarketingCopy): string[] {
  return COPY_FIELD_AGENTS[field].map((agent) => AGENT_LABEL[agent])
}

export function copyFieldAdminAgentLabels(field: keyof MarketingCopy): string[] {
  return COPY_FIELD_ADMIN_AGENTS[field].map((agent) => ADMIN_AGENT_LABEL[agent])
}

export function copyFieldPrimarySkillId(field: keyof MarketingCopy): CopyAdminAgent {
  return COPY_FIELD_ADMIN_AGENTS[field][0] || 'studio_release'
}

export function copyFieldKnowledgeQuery(field: keyof MarketingCopy, title?: string): string {
  const titleBit = String(title || '').trim()
  const prefix = titleBit ? `${titleBit} ` : ''
  switch (field) {
    case 'platform_tags':
      return `${prefix}youtube instagram tiktok soundcloud bandcamp hashtags share music videos social`
    case 'social_caption':
      return `${prefix}share instagram music launch smart link stories`
    case 'store_description':
      return `${prefix}shop music bandcamp store listen`
    case 'youtube_visualizer':
      return `${prefix}videos share listen visualizer youtube music`
    case 'spotify_pitch':
      return `${prefix}music streaming editorial playlists`
    case 'elevator_pitch':
    case 'press_blurb':
      return `${prefix}music about press releases`
    case 'credits_block':
      return `${prefix}studio catalog credits`
    default:
      return `${prefix}studio music copy`
  }
}

export function copyFieldContextLine(field: keyof MarketingCopy): string {
  const polymath = copyFieldAgentLabels(field)
  const admin = copyFieldAdminAgentLabels(field)
  const adminBit = admin.length ? ` · Admin AI: ${admin.join(' · ')}` : ''
  if (!polymath.length) {
    return `Catalog credits only — no Sonic DNA invention.${adminBit}`
  }
  return `SergikAI + polymath: ${polymath.join(' · ')}${adminBit}`
}

export function copyFieldAdminMode(
  field: keyof MarketingCopy,
): 'studio_release' | 'growth_marketing' | 'product_strategy' {
  const primary = copyFieldPrimarySkillId(field)
  if (primary === 'growth_marketing') return 'growth_marketing'
  if (primary === 'product_strategy' || primary === 'smartlink_seo' || primary === 'admin_intel') {
    return 'product_strategy'
  }
  return 'studio_release'
}

export function buildCopyFieldAdminAiPrompt(input: {
  field: keyof MarketingCopy
  releaseId: string
  releaseTitle: string
}): { message: string; agentMode: 'studio_release' | 'growth_marketing' | 'product_strategy' } {
  const title = input.releaseTitle.replace(/"/g, '\\"')
  const agents = COPY_FIELD_ADMIN_AGENTS[input.field]
  return {
    agentMode: copyFieldAdminMode(input.field),
    message: [
      `Expand strategy and discovery copy for "${title}" (${input.releaseId}) — field ${input.field}.`,
      `Admin AI desk for this field: ${agents.join(', ')}.`,
      `Polymath layers: ${copyFieldAgentLabels(input.field).join(', ') || 'credits only'}.`,
      `First run: /exec query_release_studio_snapshot ${JSON.stringify({ releaseId: input.releaseId })}`,
      'Ground every angle in Catalog + Metadata + unified Sonic DNA. Do not invent guests, cities, charts, analytics, or durations.',
      input.field === 'platform_tags'
        ? 'Propose platform-specific tag/hashtag expansion (YouTube comma tags vs hashed IG/X/TikTok/SoundCloud/Bandcamp). Keep each surface distinct.'
        : 'Propose expansion angles for this field, then paste-ready copy.',
      `If I approve, preview /exec patch_release_marketing_copy with merge:true for ${input.field} only.`,
    ].join('\n'),
  }
}

export function copyFieldEnergyPreset(
  field: keyof MarketingCopy,
): 'studio_week' | 'launch_day' {
  if (
    field === 'youtube_visualizer' ||
    field === 'social_caption' ||
    field === 'store_description' ||
    field === 'platform_tags'
  ) {
    return 'launch_day'
  }
  return 'studio_week'
}

export function extractCopyIntelCard(dna: unknown, title?: string): CopyIntelCard {
  const root = asRecord(parseSonicDna(dna) || dna)
  const measured = extractMeasured(root)
  const intel = asRecord(measured?.intelligence)
  const layers = asRecord(measured?.report?.layers)
  const genre = [measured?.genre?.primary || root.genres?.primaryGenres?.[0], measured?.genre?.subgenre]
    .filter(Boolean)
    .join(' / ')
  const bpm = measured?.bpm ?? root.technical?.bpm
  const key = measured?.key || root.harmony?.keySignature || root.musical?.keySignature
  const related = [
    ...(Array.isArray(intel.relatedGenres) ? intel.relatedGenres : []),
    ...(Array.isArray(root.genres?.relatedGenres) ? root.genres.relatedGenres : []),
  ]
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 8)
  const durationRaw =
    measured && 'duration' in measured
      ? (measured as { duration?: number }).duration
      : root.technical?.duration ?? root.duration_seconds ?? root.duration
  const durationSec = durationToSeconds(typeof durationRaw === 'number' ? durationRaw : Number(durationRaw))

  return {
    title: String(title || '').trim(),
    unified: hasUnifiedSonicDnaIntelligence(root),
    groove: [
      genre,
      bpm ? `${Math.round(Number(bpm))} BPM` : '',
      key && key !== 'Unknown' ? String(key) : '',
      measured?.drumFamily || '',
      measured?.timingFeel || '',
    ]
      .filter(Boolean)
      .join(' · '),
    intention: firstSentence(intel.intention || root.intention || '', 160),
    description: firstSentence(
      intel.description || root.description || measured?.report?.description || '',
      200,
    ),
    culture: firstSentence(
      layers.cultural || intel.cultural?.description || intel.regional?.regionalCharacteristics || '',
      180,
    ),
    musicology: firstSentence(layers.musicological || intel.musicology?.description || root.musicology?.description || '', 180),
    emotion: firstSentence(
      intel.emotional?.emotionalJourney ||
        (Array.isArray(intel.emotional?.primaryEmotions)
          ? intel.emotional.primaryEmotions.slice(0, 5).join(', ')
          : ''),
      160,
    ),
    psychology: firstSentence(
      layers.psychological || intel.emotional?.psychologicalProfile || '',
      180,
    ),
    psychoacoustics: firstSentence(
      layers.psychoacoustics ||
        intel.psychoacoustics?.sonicIntent ||
        intel.psychoacoustics?.socialUsage ||
        intel.psychoacoustics?.activationFormula ||
        '',
      180,
    ),
    related: [...new Set(related)],
    durationSec: durationSec != null && durationSec > 0 ? durationSec : null,
  }
}

export function copyIntelHasSignal(card: CopyIntelCard | null | undefined): boolean {
  if (!card) return false
  return Boolean(
    card.groove ||
      card.intention ||
      card.description ||
      card.culture ||
      card.musicology ||
      card.emotion ||
      card.psychology ||
      card.psychoacoustics ||
      card.related.length,
  )
}

function layerForAgent(card: CopyIntelCard, agent: CopyPolymathAgent): string {
  switch (agent) {
    case 'intention_analyst':
      return card.intention ? `Intention: ${card.intention}` : ''
    case 'description_writer':
      return card.description ? `Description: ${card.description}` : ''
    case 'cultural_analyst':
      return card.culture ? `Culture: ${card.culture}` : ''
    case 'musicologist':
      return card.musicology ? `Musicology: ${card.musicology}` : ''
    case 'emotional_psychologist':
      return card.emotion ? `Emotion: ${card.emotion}` : ''
    case 'psychology_analyst':
      return card.psychology ? `Psychology: ${card.psychology}` : ''
    case 'psychoacoustics_analyst':
      return card.psychoacoustics ? `Psychoacoustics: ${card.psychoacoustics}` : ''
    case 'genre_specialist':
      return card.groove ? `Groove lock: ${card.groove}` : ''
    default:
      return ''
  }
}

export function formatCopyIntelligenceBrief(input: {
  field: keyof MarketingCopy
  tracks: Array<{ title?: string | null; intel?: CopyIntelCard | null }>
}): string {
  const agents = COPY_FIELD_AGENTS[input.field]
  const tracks = input.tracks
  if (!agents.length) {
    return 'Credits field — use Catalog contributors and artwork only. Do not invent Sonic DNA claims.'
  }
  if (!tracks.length) {
    return `Polymath team (${copyFieldAgentLabels(input.field).join(', ')}) is standing by, but no unified intelligence card is loaded yet.`
  }

  const body = tracks
    .map((track, index) => {
      const card = track.intel
      const title = card?.title || track.title || 'Untitled'
      if (!card || !copyIntelHasSignal(card)) {
        return `${index + 1}. ${title}\nWrite a unique listener-facing description for this cut from catalog press / intention. Do not skip it.`
      }
      const layers = agents.map((agent) => layerForAgent(card, agent)).filter(Boolean)
      if (
        card.related.length &&
        (input.field === 'spotify_pitch' ||
          input.field === 'press_blurb' ||
          input.field === 'platform_tags' ||
          input.field === 'social_caption' ||
          input.field === 'youtube_visualizer' ||
          input.field === 'store_description')
      ) {
        layers.push(`Related traditions (tag/pitch vocabulary only): ${card.related.slice(0, 6).join(', ')}`)
      }
      if (!layers.length && card.groove) layers.push(`Groove lock: ${card.groove}`)
      return [
        `${index + 1}. ${title}${card.unified ? ' · unified intelligence' : ''}`,
        card.groove && !layers.some((line) => line.startsWith('Groove lock')) ? `Groove: ${card.groove}` : '',
        ...layers,
        'Required: unique description for this exact title — do not fold it into another cut.',
      ]
        .filter(Boolean)
        .join('\n')
    })
    .filter(Boolean)
    .join('\n\n')

  return [
    `SergikAI copy desk · polymath specialists for this field: ${copyFieldAgentLabels(input.field).join(', ')}.`,
    `Admin AI agents on this field: ${COPY_FIELD_ADMIN_AGENTS[input.field].join(', ') || 'none'}.`,
    'Use only these measured / encyclopedia claims. Do not invent guests, cities, charts, or durations.',
    body,
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function formatCopyAdminDeskBrief(field: keyof MarketingCopy): string {
  const agents = COPY_FIELD_ADMIN_AGENTS[field]
  if (!agents.length) return ''
  return [
    `Admin AI desk (${copyFieldAdminAgentLabels(field).join(', ')}):`,
    ...agents.map((agent) => `- ${ADMIN_AGENT_LABEL[agent]}: ${ADMIN_AGENT_PURPOSE[agent]}`),
    formatCopyAdminStrategyBrief(field),
  ]
    .filter(Boolean)
    .join('\n')
}

export function formatCopyAdminStrategyBrief(field: keyof MarketingCopy): string {
  switch (field) {
    case 'platform_tags':
      return [
        'Strategy + expansion (do not invent playlist, chart, or viral claims):',
        '- Treat each labeled block as a different discovery surface — do not paste the same 14 tags everywhere.',
        '- YouTube TAGS = comma search keywords (no #), front-load artist / title / genre / Official Audio / Visualizer.',
        '- YouTube HASHTAGS + Instagram / X / TikTok = hashed discovery; X stays 4–6; TikTok stays music-discovery not fake-viral.',
        '- SoundCloud = lowercase player-search keywords; Bandcamp = store tags that match the genre lock.',
        '- Expand only from catalog genre/subgenre, related traditions, guests, and cut titles already in the brief.',
        '- If a smart link or store URL is not in the sources, write “smart link pending” — never invent a tracking URL.',
      ].join('\n')
    case 'social_caption':
      return [
        'Strategy + expansion:',
        '- Hook + one feel line + one real CTA. Prefer /music, share pages, or a store link that exists in sources.',
        '- Hashtags support the caption; they do not replace Tags & hashtags field structure.',
        '- Never invent follower counts, playlist adds, or city shows.',
      ].join('\n')
    case 'youtube_visualizer':
      return [
        'Strategy + expansion:',
        '- SEO headline + continuous timestamps + every catalog cut. Description keywords must match YouTube TAGS vocabulary.',
        '- Point listeners to real site routes (/music, /videos, share listen) only when those surfaces exist in site knowledge.',
        '- Do not invent chapter times or guest credits.',
      ].join('\n')
    case 'store_description':
      return [
        'Strategy + expansion:',
        '- One primary CTA (listen / buy). Proof comes from catalog press + credits only.',
        '- Front-load artist, title, genre. Tags line is SEO, not hashtag spam.',
        '- Name Bandcamp/shop only when a store link or catalog label supports it.',
      ].join('\n')
    case 'spotify_pitch':
      return [
        'Strategy + expansion:',
        '- Editorial pitch: groove lock, listening context, and related traditions from DNA — never fake playlist names.',
        '- Describe floor use and energy without claiming editorial placement.',
      ].join('\n')
    case 'elevator_pitch':
    case 'press_blurb':
      return [
        'Strategy + expansion:',
        '- Position the release in culture + groove. One proof line from catalog press or credits.',
        '- No invented quotes, cities, or chart facts.',
      ].join('\n')
    case 'credits_block':
      return 'Strategy: Catalog contributors + artwork only. Do not invent names, societies, or splits.'
    default:
      return ''
  }
}
