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

export const ADMIN_AI_MENTION_SUGGESTIONS: Array<{ id: string; label: string; insert: string }> = [
  { id: 'release', label: '@release', insert: '@release ' },
  { id: 'growth', label: '@growth', insert: '@growth ' },
  { id: 'ops', label: '@ops', insert: '@ops ' },
  { id: 'due', label: '@due', insert: '@due ' },
  { id: 'canon', label: '@canon', insert: '@canon ' },
  { id: 'selection', label: '@selection', insert: '@selection ' },
  { id: 'desk-dk', label: '@desk:DistroKid', insert: '@desk:DistroKid ' },
  { id: 'desk-yt', label: '@desk:YouTube Studio', insert: '@desk:YouTube Studio ' },
  { id: 'desk-s4a', label: '@desk:Spotify Artists', insert: '@desk:Spotify Artists ' },
]
