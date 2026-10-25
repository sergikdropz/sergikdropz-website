/**
 * Cursor-style @ mentions for Admin AI composer.
 * Expands into prompt context before chat / agent runs.
 */

import { ADMIN_DESK_CARDS, deskCardForUrl, formatDeskCard } from '@/lib/ai/admin-ai-desks'

export type AdminAiMentionKind =
  | 'release'
  | 'desk'
  | 'growth'
  | 'canon'
  | 'selection'
  | 'ops'
  | 'due'

export type ParsedAdminAiMention = {
  kind: AdminAiMentionKind
  raw: string
  /** Desk label when kind === 'desk' */
  deskLabel?: string
}

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const DESK_LABELS_LONGEST_FIRST = [...ADMIN_DESK_CARDS]
  .map((c) => c.label)
  .sort((a, b) => b.length - a.length)

const SIMPLE_MENTION_RE = /@(?:release|growth|canon|selection|ops|due)\b/gi

export function parseAdminAiMentions(text: string): ParsedAdminAiMention[] {
  const found: ParsedAdminAiMention[] = []
  const seen = new Set<string>()

  for (const label of DESK_LABELS_LONGEST_FIRST) {
    const re = new RegExp(`@desk:${escapeRe(label)}\\b`, 'gi')
    for (const match of text.matchAll(re)) {
      const raw = match[0]
      const key = raw.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      found.push({ kind: 'desk', raw, deskLabel: label })
    }
  }

  // Bare @desk or unknown @desk:Token
  for (const match of text.matchAll(/@desk(?::([A-Za-z0-9._+-]+))?\b/gi)) {
    const raw = match[0]
    const key = raw.toLowerCase()
    if (seen.has(key)) continue
    // Skip if a longer known desk already consumed this span
    if ([...seen].some((s) => s.startsWith('@desk:') && key !== s && s.startsWith(key))) continue
    if (DESK_LABELS_LONGEST_FIRST.some((label) => key === `@desk:${label.toLowerCase()}`)) continue
    seen.add(key)
    found.push({ kind: 'desk', raw, deskLabel: match[1] || undefined })
  }

  for (const match of text.matchAll(SIMPLE_MENTION_RE)) {
    const raw = match[0]
    const key = raw.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const kind = key.slice(1) as AdminAiMentionKind
    found.push({ kind, raw })
  }

  return found
}

export function mentionCatalogPrompt(): string {
  return [
    '@ MENTIONS (user can type these in the composer)',
    '@release — active Release Studio release snapshot',
    '@growth — platform growth scorecard',
    '@ops — pipeline ops snapshot (studio)',
    '@due — studio command center due dates',
    '@canon — site architecture / brand truth reminders',
    '@selection — restate element picks already in the message',
    '@desk:DistroKid (or Spotify Artists, YouTube Studio, …) — that desk card + open that bookmark when answering',
  ].join('\n')
}

export type MentionExpansionInput = {
  message: string
  releaseId?: string | null
  releaseTitle?: string | null
  selectionBlocks?: string[]
  /** Preloaded blocks keyed by kind (from agent bootstrap). */
  blocks?: Partial<Record<AdminAiMentionKind | string, string>>
}

/** Build a MENTIONS CONTEXT block for the system/user prompt. */
export function expandAdminAiMentions(input: MentionExpansionInput): {
  mentions: ParsedAdminAiMention[]
  context: string
  /** Tools the agent should prefer to run if blocks are missing. */
  requestedTools: Array<{ tool: string; payload: Record<string, unknown> }>
} {
  const mentions = parseAdminAiMentions(input.message)
  if (!mentions.length) {
    return { mentions: [], context: '', requestedTools: [] }
  }

  const parts: string[] = ['MENTIONS CONTEXT']
  const requestedTools: Array<{ tool: string; payload: Record<string, unknown> }> = []

  for (const mention of mentions) {
    if (mention.kind === 'desk') {
      const label = mention.deskLabel?.toLowerCase()
      const card =
        ADMIN_DESK_CARDS.find((c) => c.label.toLowerCase() === label) ||
        ADMIN_DESK_CARDS.find((c) => label && c.label.toLowerCase().includes(label)) ||
        deskCardForUrl(input.blocks?.deskUrl || '')
      if (card) {
        parts.push(formatDeskCard(card))
        requestedTools.push({
          tool: 'admin_browser',
          payload: { action: 'status' },
        })
      } else {
        parts.push(`Desk mention ${mention.raw}: unknown desk label.`)
      }
      continue
    }

    const preloaded = input.blocks?.[mention.kind]
    if (preloaded?.trim()) {
      parts.push(preloaded.trim())
      continue
    }

    if (mention.kind === 'release') {
      if (input.releaseId) {
        parts.push(
          `Active release: ${input.releaseTitle || input.releaseId} (${input.releaseId}). Snapshot will load via agent tool.`,
        )
        requestedTools.push({
          tool: 'query_release_studio_snapshot',
          payload: { releaseId: input.releaseId },
        })
      } else {
        parts.push('@release: no active release in page context.')
      }
    } else if (mention.kind === 'growth') {
      requestedTools.push({ tool: 'query_platform_growth_snapshot', payload: {} })
      parts.push('@growth: loading platform growth snapshot…')
    } else if (mention.kind === 'ops') {
      requestedTools.push({ tool: 'query_ops_snapshot', payload: { focus: 'studio' } })
      parts.push('@ops: loading studio ops snapshot…')
    } else if (mention.kind === 'due') {
      requestedTools.push({ tool: 'query_studio_command_center', payload: { dueWithinDays: 14 } })
      parts.push('@due: loading command center…')
    } else if (mention.kind === 'canon') {
      parts.push(
        [
          'Canon reminders:',
          '- Ground answers in Release Studio / ops / growth tools — never invent DSP counts.',
          '- No autoplay audio; user-initiated playback only.',
          '- DistroKid is a delivery vendor; SERGIK ISRCs use QTA53; UGC partner is SERGIK.',
          '- Site architecture: knowledge/CANON.md + generated site-knowledge.',
        ].join('\n'),
      )
    } else if (mention.kind === 'selection') {
      const blocks = input.selectionBlocks?.filter(Boolean) || []
      parts.push(
        blocks.length
          ? `Selections:\n${blocks.join('\n\n')}`
          : '@selection: no element picks in this message.',
      )
    }
  }

  return {
    mentions,
    context: parts.join('\n\n'),
    requestedTools,
  }
}

export type MentionMenuItem = {
  id: string
  label: string
  insert: string
  hint: string
}

const SIMPLE_MENTION_ITEMS: MentionMenuItem[] = [
  { id: 'release', label: '@release', insert: '@release ', hint: 'Active release snapshot' },
  { id: 'growth', label: '@growth', insert: '@growth ', hint: 'Platform growth scorecard' },
  { id: 'ops', label: '@ops', insert: '@ops ', hint: 'Pipeline ops snapshot' },
  { id: 'due', label: '@due', insert: '@due ', hint: 'Studio due dates' },
  { id: 'canon', label: '@canon', insert: '@canon ', hint: 'Brand and site truth' },
  { id: 'selection', label: '@selection', insert: '@selection ', hint: 'Element picks in this message' },
]

/** Full @ menu: simple mentions plus every desk card. */
export function mentionMenuItems(): MentionMenuItem[] {
  return [
    ...SIMPLE_MENTION_ITEMS,
    ...ADMIN_DESK_CARDS.map((card) => ({
      id: `desk-${card.id}`,
      label: `@desk:${card.label}`,
      insert: `@desk:${card.label} `,
      hint: card.purpose,
    })),
  ]
}

export const ADMIN_AI_MENTION_SUGGESTIONS: Array<{ id: string; label: string; insert: string }> = mentionMenuItems()

export type ActiveComposerMention = {
  start: number
  /** Text from the @ through the caret, including the @. */
  query: string
}

/**
 * The @ token the caret is still inside. A finished token (space after a complete mention)
 * returns null. A space stays open while it is still a prefix of a longer label, such as
 * `@desk:YouTube Studio`.
 */
export function activeComposerMention(text: string, caret: number): ActiveComposerMention | null {
  if (caret < 0 || caret > text.length) return null
  const head = text.slice(0, caret)
  const at = head.lastIndexOf('@')
  if (at < 0) return null
  const prev = at > 0 ? head[at - 1] : ''
  if (prev && !/\s/.test(prev)) return null
  const query = head.slice(at)
  if (!query || query.includes('\n')) return null
  const q = query.toLowerCase()
  const labels = mentionMenuItems().map((item) => item.label.toLowerCase())
  const continues = labels.some(
    (label) =>
      label.startsWith(q) || (q.endsWith(' ') && label.startsWith(q.trimEnd()) && label.length > q.trimEnd().length),
  )
  const loose = !q.endsWith(' ') && filterMentionMenu(query).length > 0
  if (!continues && !loose) return null
  return { start: at, query }
}

/** Prefix matches first, then labels that contain the letters typed after @. */
export function filterMentionMenu(query: string): MentionMenuItem[] {
  const items = mentionMenuItems()
  const q = query.trim().toLowerCase()
  if (!q || q === '@') return items
  const prefix: MentionMenuItem[] = []
  const rest: MentionMenuItem[] = []
  const needle = q.startsWith('@') ? q.slice(1) : q
  for (const item of items) {
    const label = item.label.toLowerCase()
    if (label.startsWith(q)) prefix.push(item)
    else if (needle && label.includes(needle)) rest.push(item)
  }
  return [...prefix, ...rest]
}
