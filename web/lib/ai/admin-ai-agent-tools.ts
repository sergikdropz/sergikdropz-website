/**
 * Read-only tools the Admin AI Agent may run mid-turn without Preview → Approve.
 * Writes and browser clicks/types stay on /exec.
 */

import type { AdminAiTool } from '@/lib/ai/tool-policy'
import type { AdminBrowserActionName } from '@/lib/ai/admin-browser-shared'

export const AGENT_READ_TOOLS = [
  'query_release_studio_snapshot',
  'query_ops_snapshot',
  'query_studio_command_center',
  'query_platform_growth_snapshot',
  'admin_browser',
  'audit_music_contract',
  'query_intelligence_harness',
] as const satisfies readonly AdminAiTool[]

export type AgentReadTool = (typeof AGENT_READ_TOOLS)[number]

export const AGENT_BROWSER_READ_ACTIONS = new Set<AdminBrowserActionName>([
  'status',
  'read',
  'probe_fields',
  'inspect',
])

export function isAgentReadTool(name: string): name is AgentReadTool {
  return (AGENT_READ_TOOLS as readonly string[]).includes(name)
}

function extractJsonObject(source: string, fromIndex: number): string | null {
  const start = source.indexOf('{', fromIndex)
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i]!
    if (inString) {
      if (escape) {
        escape = false
        continue
      }
      if (ch === '\\') {
        escape = true
        continue
      }
      if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return source.slice(start, i + 1)
    }
  }
  return null
}

function parseJsonPayload(raw: string): Record<string, unknown> | null {
  const cleaned = raw.replace(/,\s*([}\]])/g, '$1')
  try {
    const payload = JSON.parse(cleaned) as Record<string, unknown>
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
    return payload
  } catch {
    return null
  }
}

export function agentToolCatalogPrompt(): string {
  return [
    'AGENT MODE (read tools mid-turn)',
    'When you need live data that is not already in LIVE CONTEXT or @ mentions, emit exactly one line per tool:',
    '/tool <tool_name> {"key":"value"}',
    'Do not wrap that line in markdown fences. JSON on the same line. Empty object is `{}`.',
    'Allowed read tools only:',
    '- query_release_studio_snapshot {"releaseId":"<id>"}',
    '- query_ops_snapshot {"focus":"studio"|"nurturing"|"all"}',
    '- query_studio_command_center {"dueWithinDays":14}',
    '- query_platform_growth_snapshot {}',
    '- admin_browser {"action":"status"|"read"|"probe_fields"|"inspect", ...} — no navigate/click/type',
    '- audit_music_contract {"releaseId":"<id>"} or {"text":"…"}',
    '- query_intelligence_harness {"mode":"probe"|"stack"|"knowledge", ...}',
    'After tool results arrive, answer the user in plain prose. Never invent /tool lines for writes, publishes, DistroKid submit, or browser click/type — those stay `/exec` with Preview → Approve.',
    'For Studio field patches, prefer an ```ai-diff fenced JSON block with before/after so the user can Approve.',
  ].join('\n')
}

export type ParsedAgentToolCall = {
  tool: AgentReadTool
  payload: Record<string, unknown>
  raw: string
}

function acceptBrowserPayload(tool: string, payload: Record<string, unknown>): boolean {
  if (tool !== 'admin_browser') return true
  const action = String(payload.action || 'read')
  return AGENT_BROWSER_READ_ACTIONS.has(action as AdminBrowserActionName)
}

/** Pull `/tool name {json}` calls from a model reply, including fenced / messy local-model variants. */
export function parseAgentToolCalls(text: string): ParsedAgentToolCall[] {
  const out: ParsedAgentToolCall[] = []
  const seen = new Set<string>()
  const re = /\/tool\s+([a-z0-9_]+)/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    const tool = match[1]!
    if (!isAgentReadTool(tool)) continue
    const after = match.index + match[0].length
    const rest = text.slice(after)
    const nextTool = rest.search(/\/tool\s+[a-z0-9_]+/i)
    const window = nextTool >= 0 ? rest.slice(0, nextTool) : rest
    const jsonRaw = extractJsonObject(window, 0) ?? '{}'
    const payload = parseJsonPayload(jsonRaw) ?? {}
    if (!acceptBrowserPayload(tool, payload)) continue
    const key = `${tool}:${JSON.stringify(payload)}`
    if (seen.has(key)) continue
    seen.add(key)
    const raw = `${match[0]} ${jsonRaw}`.replace(/\s+/g, ' ').trim()
    out.push({ tool, payload, raw })
    if (out.length >= 6) break
  }
  return out
}

/** True when the model tried to call a tool but the JSON/line was unusable. */
export function replyTriedBrokenToolCall(text: string): boolean {
  if (!/\/tool\b/i.test(text)) return false
  return parseAgentToolCalls(text).length === 0
}

/** Remove /tool lines from the user-facing reply. */
export function stripAgentToolCalls(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => !/\/tool\s+[a-z0-9_]+/i.test(line.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
