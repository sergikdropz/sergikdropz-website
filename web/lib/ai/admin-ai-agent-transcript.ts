/**
 * One agent turn is a transcript: user, assistant, and tool messages.
 * The model calls tools directly. A /tool line is only the fallback.
 */

import {
  AGENT_BROWSER_LIVE_ACTIONS,
  isAgentLoopTool,
  parseAgentToolCalls,
  type AgentLoopTool,
} from '@/lib/ai/admin-ai-agent-tools'
import type { AdminBrowserActionName } from '@/lib/ai/admin-browser-shared'
import { autoProviderOrder } from '@/lib/ai/admin-chat-router'
import type { AdminAiChatProvider } from '@/lib/ai/admin-chat-types'

export type AgentToolCall = {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export type AgentTranscriptMessage =
  | { role: 'user'; content: string; images?: string[] }
  | { role: 'assistant'; content: string; toolCalls: AgentToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string }

type ToolDef = {
  name: AgentLoopTool
  description: string
  parameters: Record<string, unknown>
}

const AGENT_TOOL_DEFS: ToolDef[] = [
  {
    name: 'query_release_studio_snapshot',
    description: 'Read one release: tracks, ISRCs, UPC, blockers, and marketing copy.',
    parameters: {
      type: 'object',
      properties: {
        releaseId: { type: 'string', description: 'Release id from the page or thread' },
      },
      required: ['releaseId'],
    },
  },
  {
    name: 'query_ops_snapshot',
    description: 'Pipeline counts for studio, nurturing, or all.',
    parameters: {
      type: 'object',
      properties: {
        focus: { type: 'string', enum: ['studio', 'nurturing', 'all'] },
      },
    },
  },
  {
    name: 'query_studio_command_center',
    description: 'Releases due inside a day window.',
    parameters: {
      type: 'object',
      properties: {
        dueWithinDays: { type: 'number' },
      },
    },
  },
  {
    name: 'query_platform_growth_snapshot',
    description: 'DSP and social scorecard. Do not invent listener counts.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'admin_browser',
    description:
      'Read or move the embedded Chromium page. snapshot and read include pageOutline (role, name, value) and a screenshot. DistroKid album reads return distrokidCodes (UPC and each track ISRC). Do not open /isrc/ or sergikdropz /admin or /studio. Never click DistroKid Continue or Submit.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: [...AGENT_BROWSER_LIVE_ACTIONS] },
        url: { type: 'string' },
        target: { type: 'string', description: 'Visible label, or a snapshot id such as c3 from pageOutline' },
        text: { type: 'string' },
        key: { type: 'string' },
        x: { type: 'number' },
        y: { type: 'number' },
      },
      required: ['action'],
    },
  },
  {
    name: 'audit_music_contract',
    description: 'Read-only contract audit for a release or pasted text.',
    parameters: {
      type: 'object',
      properties: {
        releaseId: { type: 'string' },
        text: { type: 'string' },
        dealKind: { type: 'string' },
      },
    },
  },
  {
    name: 'audit_music_books',
    description: 'Read-only fee and payment review. Not a tax filing.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        quotedCents: { type: 'number' },
        paidCents: { type: 'number' },
        currency: { type: 'string' },
      },
    },
  },
  {
    name: 'query_intelligence_harness',
    description: 'Harness, product truth, or knowledge lookup. Use this before guessing a route, rule, or product fact.',
    parameters: {
      type: 'object',
      properties: {
        mode: { type: 'string' },
        releaseId: { type: 'string' },
        query: { type: 'string' },
      },
    },
  },
  {
    name: 'patch_release_marketing_copy',
    description: 'Dry-run a marketing copy or UPC change. Does not save. Pass merge true.',
    parameters: {
      type: 'object',
      properties: {
        releaseId: { type: 'string' },
        marketingCopy: { type: 'object' },
        upc: { type: 'string' },
        merge: { type: 'boolean' },
      },
      required: ['releaseId'],
    },
  },
  {
    name: 'assign_isrcs',
    description: 'Dry-run new QTA53 ISRCs for tracks that have no code. Does not save. Do not mint a second code when one already exists.',
    parameters: {
      type: 'object',
      properties: {
        releaseId: { type: 'string' },
        trackIds: { type: 'array', items: { type: 'string' } },
      },
      required: ['releaseId'],
    },
  },
  {
    name: 'pull_distrokid_isrcs',
    description:
      'Dry-run a DistroKid ISRC pull for this release. Opens the album page, reads distrokidCodes, and matches them onto Catalog tracks. Does not save. Use this when the user says pull the DistroKid ISRCs. Do not mint assign_isrcs for tracks DistroKid already coded.',
    parameters: {
      type: 'object',
      properties: {
        releaseId: { type: 'string' },
        dryRun: { type: 'boolean' },
      },
      required: ['releaseId'],
    },
  },
  {
    name: 'update_copyright_checklist',
    description: 'Dry-run a copyright checklist update. Does not save.',
    parameters: {
      type: 'object',
      properties: {
        releaseId: { type: 'string' },
        updates: { type: 'object', description: 'Checklist fields to change' },
      },
      required: ['releaseId'],
    },
  },
  {
    name: 'draft_product_strategy_pack',
    description: 'Draft a strategy pack for the open release or a stated goal. Does not publish.',
    parameters: {
      type: 'object',
      properties: {
        releaseId: { type: 'string' },
        primaryGoal: { type: 'string' },
        brandName: { type: 'string' },
        siteUrl: { type: 'string' },
      },
    },
  },
  {
    name: 'generate_campaign_draft',
    description: 'Dry-run a campaign draft. Does not save.',
    parameters: {
      type: 'object',
      properties: {
        releaseId: { type: 'string' },
        artistName: { type: 'string' },
        campaignGoal: { type: 'string' },
        channels: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  {
    name: 'generate_smartlink_utm_plan',
    description: 'Dry-run tracking links. Does not save.',
    parameters: {
      type: 'object',
      properties: {
        releaseId: { type: 'string' },
        destination: { type: 'string' },
        campaign: { type: 'string' },
        source: { type: 'string' },
        medium: { type: 'string' },
      },
    },
  },
  {
    name: 'create_distribution_release_draft',
    description: 'Dry-run a new release draft. Does not save.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        releaseDate: { type: 'string' },
      },
    },
  },
  {
    name: 'query_meta_business_agent',
    description:
      'Ask the official Meta Business Agent test API. action status checks eligibility. action test sends user_msg. Does not enable the agent for WhatsApp customers.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['status', 'test'] },
        message: { type: 'string' },
        conversationId: { type: 'string' },
      },
    },
  },
  {
    name: 'run_meta_promo_pipeline',
    description: 'Dry-run the Meta promo pipeline. Start with action status. Does not publish.',
    parameters: {
      type: 'object',
      properties: {
        releaseId: { type: 'string' },
        action: { type: 'string' },
        primaryGoal: { type: 'string' },
      },
      required: ['releaseId'],
    },
  },
  {
    name: 'read_workspace',
    description:
      'Read or search source under web/ and knowledge/. Use this before explaining how the product is built. Cite the path. Does not write.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['search', 'read'] },
        query: { type: 'string', description: 'Search text, 2–80 characters' },
        path: { type: 'string', description: 'File path such as lib/ai/planner.ts or knowledge/CANON.md' },
        offset: { type: 'number' },
        limit: { type: 'number' },
      },
    },
  },
]

export function openAiToolSpecs() {
  return AGENT_TOOL_DEFS.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }))
}

export function anthropicToolSpecs() {
  return AGENT_TOOL_DEFS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  }))
}

/** Unpinned agent rounds. A chat-settings LLM does not use this list. */
export function agentReasoningProviderOrder(): AdminAiChatProvider[] {
  return autoProviderOrder()
}

export function clipChatHistory(
  messages: Array<{ role?: string; content?: string }>,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const out: Array<{ role: 'user' | 'assistant'; content: string }> = []
  for (const message of messages.slice(-12)) {
    const role = message.role === 'assistant' ? 'assistant' : message.role === 'user' ? 'user' : null
    if (!role) continue
    const content = String(message.content || '').trim().slice(0, 4_000)
    if (!content || content === '…' || content === 'Working…') continue
    out.push({ role, content })
  }
  return out
}

export function seedAgentTranscript(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  userMessage: string,
): AgentTranscriptMessage[] {
  const transcript: AgentTranscriptMessage[] = history.map((message) =>
    message.role === 'assistant'
      ? { role: 'assistant', content: message.content, toolCalls: [] }
      : { role: 'user', content: message.content },
  )
  const current = userMessage.trim()
  const last = transcript[transcript.length - 1]
  if (!(last?.role === 'user' && last.content === current)) {
    transcript.push({ role: 'user', content: current })
  }
  return transcript
}

export function latestAssistantText(transcript: AgentTranscriptMessage[]): string {
  for (let index = transcript.length - 1; index >= 0; index -= 1) {
    const message = transcript[index]
    if (message?.role === 'assistant' && message.content.trim()) return message.content
  }
  return ''
}

export function toOpenAiMessages(system: string, transcript: AgentTranscriptMessage[]) {
  const messages: Array<Record<string, unknown>> = [{ role: 'system', content: system }]
  for (const message of transcript) {
    if (message.role === 'user') {
      if (message.images?.length) {
        messages.push({
          role: 'user',
          content: [
            { type: 'text', text: message.content },
            ...message.images.slice(0, 2).map((data) => ({
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${data}`, detail: 'low' },
            })),
          ],
        })
      } else {
        messages.push({ role: 'user', content: message.content })
      }
      continue
    }
    if (message.role === 'tool') {
      messages.push({
        role: 'tool',
        tool_call_id: message.toolCallId,
        content: message.content,
      })
      continue
    }
    const toolCalls = message.toolCalls.map((call) => ({
      id: call.id,
      type: 'function',
      function: {
        name: call.name,
        arguments: JSON.stringify(call.arguments ?? {}),
      },
    }))
    messages.push({
      role: 'assistant',
      content: message.content || null,
      ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
    })
  }
  return messages
}

type AnthropicBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string }
  | { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg'; data: string } }

export function toAnthropicMessages(transcript: AgentTranscriptMessage[]) {
  const messages: Array<{ role: 'user' | 'assistant'; content: string | AnthropicBlock[] }> = []

  const appendUser = (block: AnthropicBlock | string) => {
    const last = messages[messages.length - 1]
    if (last?.role === 'user') {
      const blocks: AnthropicBlock[] = Array.isArray(last.content)
        ? last.content
        : [{ type: 'text', text: last.content }]
      blocks.push(typeof block === 'string' ? { type: 'text', text: block } : block)
      last.content = blocks
      return
    }
    messages.push({
      role: 'user',
      content: typeof block === 'string' ? block : [block],
    })
  }

  for (const message of transcript) {
    if (message.role === 'user') {
      appendUser(message.content)
      for (const data of message.images?.slice(0, 2) ?? []) {
        appendUser({
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data },
        })
      }
      continue
    }
    if (message.role === 'tool') {
      appendUser({
        type: 'tool_result',
        tool_use_id: message.toolCallId,
        content: message.content,
      })
      continue
    }
    const blocks: AnthropicBlock[] = []
    if (message.content.trim()) blocks.push({ type: 'text', text: message.content })
    for (const call of message.toolCalls) {
      blocks.push({
        type: 'tool_use',
        id: call.id,
        name: call.name,
        input: call.arguments ?? {},
      })
    }
    if (!blocks.length) continue
    messages.push({ role: 'assistant', content: blocks.length === 1 && blocks[0]?.type === 'text' ? blocks[0].text : blocks })
  }

  if (messages[0]?.role === 'assistant') {
    messages.unshift({ role: 'user', content: 'Continue from the transcript.' })
  }
  return messages
}

export function toolCallsFromOpenAiMessage(message: unknown): AgentToolCall[] {
  if (!message || typeof message !== 'object') return []
  const calls = (message as { tool_calls?: unknown }).tool_calls
  if (!Array.isArray(calls)) return []
  const out: AgentToolCall[] = []
  calls.forEach((call, index) => {
    if (!call || typeof call !== 'object') return
    const row = call as { id?: string; function?: { name?: string; arguments?: unknown } }
    const name = row.function?.name?.trim() || ''
    if (!name) return
    out.push({
      id: row.id?.trim() || `call_${index + 1}`,
      name,
      arguments: argumentsRecord(row.function?.arguments),
    })
  })
  return out
}

export function readAnthropicAgentContent(content: unknown): { text: string; toolCalls: AgentToolCall[] } {
  if (!Array.isArray(content)) return { text: '', toolCalls: [] }
  const texts: string[] = []
  const toolCalls: AgentToolCall[] = []
  content.forEach((part, index) => {
    if (!part || typeof part !== 'object') return
    const row = part as { type?: string; text?: string; id?: string; name?: string; input?: unknown }
    if (row.type === 'text' && row.text?.trim()) texts.push(row.text.trim())
    if (row.type === 'tool_use' && row.name?.trim()) {
      toolCalls.push({
        id: row.id?.trim() || `toolu_${index + 1}`,
        name: row.name.trim(),
        arguments: argumentsRecord(row.input),
      })
    }
  })
  return { text: texts.join('\n\n'), toolCalls }
}

function argumentsRecord(raw: unknown): Record<string, unknown> {
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>
    } catch {
      return {}
    }
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>
  return {}
}

function browserActionAllowed(name: string, args: Record<string, unknown>): boolean {
  if (name !== 'admin_browser') return true
  const action = String(args.action || 'read')
  return AGENT_BROWSER_LIVE_ACTIONS.has(action as AdminBrowserActionName)
}

/** Native tool calls win. /tool lines are used only when the API returned none. */
export function resolveTurnToolCalls(native: AgentToolCall[], text: string): AgentToolCall[] {
  const fromApi = native
    .filter((call) => isAgentLoopTool(call.name) && browserActionAllowed(call.name, call.arguments))
    .slice(0, 6)
  if (fromApi.length) return fromApi
  return parseAgentToolCalls(text).map((call, index) => ({
    id: `line_${index + 1}_${call.tool}`,
    name: call.tool,
    arguments: call.payload,
  }))
}

const NEEDS_SOURCE =
  /\b(release|track|catalog|isrc|upc|blocker|due|campaign|listener|follower|stream|playlist|distrokid|spotify|youtube|instagram|soundcloud|mail|inbox|pitch|caption|artwork|contract|split|schedule|reminder|vault|status|how many)\b/i
const NEEDS_CODE =
  /\b(source file|codebase|component|typescript|route handler|implementation|in the code|how is .{0,48} implemented)\b/i
const ASKS_CHANGE = /\b(write|draft|update|patch|fix|set|assign|fill|change|add|publish|schedule|save)\b/i
const CLAIMS_DONE =
  /\b(saved|updated|patched|assigned|published|applied|i(?:'ve| have) (?:updated|saved|written|patched|assigned))\b/i

function inventedIsrcs(assistant: string, corpus: string): string | null {
  const codes = assistant.match(/\b[A-Z]{2}[A-Z0-9]{3}\d{7}\b/g) ?? []
  const missing = [...new Set(codes.filter((code) => !corpus.includes(code)))]
  if (!missing.length) return null
  return `The reply cites ${missing.slice(0, 3).join(', ')}, which is not in the tool results. Read the source again or remove the code.`
}

function inventedCounts(assistant: string, corpus: string): string | null {
  const claims = [...assistant.matchAll(/\b(\d{1,6})\s+(tracks?|songs?|blockers?|listeners?|followers?|streams?|campaigns?|releases?|playlists?)\b/gi)]
  const missing = [...new Set(claims.filter((match) => !new RegExp(`\\b${match[1]}\\b`).test(corpus)).map((match) => `${match[1]} ${match[2]}`))]
  if (!missing.length) return null
  return `The reply claims ${missing.slice(0, 2).join(', ')}, and that number is not in the tool results or the open release. Read the source again or remove the count.`
}

function inventedTitles(assistant: string, corpus: string): string | null {
  const corpusFold = corpus.toLowerCase()
  const found: string[] = []
  for (const match of assistant.matchAll(/["“]([^"”\n]{3,80})["”]|'([^'\n]{3,80})'/g)) {
    const title = (match[1] || match[2] || '').trim()
    if (!/[A-Za-z]/.test(title)) continue
    if (/[/\\]|\.tsx?\b|^c\d+$/i.test(title)) continue
    if (/^(upc|isrc|spotify|distrokid|youtube|instagram|soundcloud|release studio)$/i.test(title)) continue
    if (title.length < 8 && !title.includes(' ')) continue
    if (corpusFold.includes(title.toLowerCase())) continue
    found.push(title)
  }
  const unique = [...new Set(found)]
  if (!unique.length) return null
  return `The reply names ${unique.slice(0, 2).join(', ')}, which is not in the tool results or the open release. Read the source again or remove the title.`
}

/** Concrete values in the reply that the tool results, form, and release card do not contain. */
export function claimConflicts(assistant: string, corpus: string): string | null {
  const invented = inventedIsrcs(assistant, corpus)
  if (invented) return invented

  const dates = [...new Set(assistant.match(/\b20\d{2}-\d{2}-\d{2}\b/g) ?? [])]
  const missingDates = dates.filter((date) => !corpus.includes(date))
  if (missingDates.length) {
    return `The reply uses the date ${missingDates.slice(0, 2).join(', ')}, which is not in the tool results or the open release. Read the source again or remove the date.`
  }

  if (/\bupc\b/i.test(assistant)) {
    const upcs = [...new Set(assistant.match(/\b\d{12,13}\b/g) ?? [])].filter((code) => !corpus.includes(code))
    if (upcs.length) {
      return `The reply cites UPC ${upcs.slice(0, 2).join(', ')}, which is not in the tool results or the open release. Read the source again or remove it.`
    }
  }

  if (/\bupc\b[^.]{0,48}\b(empty|blank|missing)\b/i.test(assistant) && /upc:\s*\d{12,13}/i.test(corpus)) {
    return 'The open release already has a UPC. Cite that value. Do not call the field empty.'
  }
  if (
    /\bisrcs?\b[^.]{0,48}\b(all missing|none|no codes)\b/i.test(assistant) &&
    /\b[A-Z]{2}[A-Z0-9]{3}\d{7}\b/.test(corpus)
  ) {
    return 'The source lists an ISRC. Cite the codes that are present. Do not say there are none.'
  }

  const counts = inventedCounts(assistant, corpus)
  if (counts) return counts
  const titles = inventedTitles(assistant, corpus)
  if (titles) return titles
  if (/\b(no tracks|zero tracks|track list is empty)\b/i.test(assistant) && /"title"\s*:\s*"[^"]+"/i.test(corpus)) {
    return 'The source lists tracks. Cite those titles. Do not say there are none.'
  }
  return null
}

/**
 * One nudge when the reply skipped the source, or claimed a save that was not previewed.
 * DistroKid album codes are one case of the same rule.
 */
export function reasoningFollowUp(
  userText: string,
  transcript: AgentTranscriptMessage[],
  grounded = false,
  extraCorpus = '',
): string | null {
  const toolNotes = transcript.filter((message) => message.role === 'tool').map((message) => message.content)
  const lastAssistant = [...transcript].reverse().find((message) => message.role === 'assistant' && message.content.trim())
  const assistantText = lastAssistant?.role === 'assistant' ? lastAssistant.content : ''

  const dkCodes = /isrc|upc/i.test(userText) && /\b(distrokid|dk)\b/i.test(userText)
  if (dkCodes && !toolNotes.some((note) => /distrokidCodes|DISTROKID CODES/.test(note))) {
    return 'The ISRC list is not in the transcript yet. Call admin_browser on the album page /dashboard/album/?albumuuid= and read it. Use the distrokidCodes field. Do not open /isrc/.'
  }

  if (NEEDS_CODE.test(userText) && !toolNotes.some((note) => /read_workspace|"action":"read"|"action":"search"/.test(note))) {
    return 'This question is about how the product is built. Call read_workspace with action search or read. Cite the file path. Do not invent an implementation.'
  }

  const hasPreview =
    toolNotes.some((note) => /dryRun|preview|before/i.test(note)) || /```ai-diff/i.test(assistantText)
  if (ASKS_CHANGE.test(userText) && CLAIMS_DONE.test(assistantText) && !hasPreview) {
    return 'That change is not saved. Call the matching preview tool. It runs as a dry run. Or show an ai-diff with before and after. The user approves before anything is written.'
  }

  if (NEEDS_SOURCE.test(userText) && toolNotes.length === 0 && !grounded) {
    return 'Read the source before answering. Call the tool that owns this data: query_release_studio_snapshot for the open release, query_ops_snapshot for pipeline counts, query_studio_command_center for due dates, query_platform_growth_snapshot for listener and follower numbers, admin_browser to read an external page, read_workspace for product source, audit_music_contract for a contract, or query_intelligence_harness for product knowledge. Cite that result. Do not invent counts, codes, dates, or live status.'
  }

  if (toolNotes.length || extraCorpus.trim()) {
    const invented = claimConflicts(assistantText, `${userText}\n${toolNotes.join('\n')}\n${extraCorpus}`)
    if (invented) return invented
  }
  return null
}

export function extractFollowUp(userText: string, transcript: AgentTranscriptMessage[]): string | null {
  return reasoningFollowUp(userText, transcript, false)
}
