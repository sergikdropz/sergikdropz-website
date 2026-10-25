/**
 * Tools the Admin AI Agent may run mid-turn without Preview → Approve.
 * Database writes stay on /exec. The embedded Chromium page is live Playwright.
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
  'audit_music_books',
  'query_intelligence_harness',
  'query_meta_business_agent',
  'read_workspace',
] as const satisfies readonly AdminAiTool[]

export type AgentReadTool = (typeof AGENT_READ_TOOLS)[number]

/** Writes the loop may preview. runAdminTool is called with dryRun, so nothing is saved. */
export const AGENT_PREVIEW_TOOLS = [
  'patch_release_marketing_copy',
  'update_copyright_checklist',
  'assign_isrcs',
  'pull_distrokid_isrcs',
  'draft_product_strategy_pack',
  'generate_campaign_draft',
  'generate_smartlink_utm_plan',
  'create_distribution_release_draft',
  'run_meta_promo_pipeline',
] as const satisfies readonly AdminAiTool[]

export type AgentPreviewTool = (typeof AGENT_PREVIEW_TOOLS)[number]
export type AgentLoopTool = AgentReadTool | AgentPreviewTool

/** Playwright actions the agent may run on this chat's Chromium page. */
export const AGENT_BROWSER_LIVE_ACTIONS = new Set<AdminBrowserActionName>([
  'status',
  'read',
  'probe_fields',
  'inspect',
  'open',
  'navigate',
  'back',
  'reload',
  'wheel',
  'snapshot',
  'click',
  'type',
  'press',
  'soundcloud_prefill',
  'distrokid_bank_import',
  'meta_earnings_pull',
])

/** @deprecated Use AGENT_BROWSER_LIVE_ACTIONS. Kept so older imports still parse reads. */
export const AGENT_BROWSER_READ_ACTIONS = AGENT_BROWSER_LIVE_ACTIONS

export function isAgentReadTool(name: string): name is AgentReadTool {
  return (AGENT_READ_TOOLS as readonly string[]).includes(name)
}

export function isAgentPreviewTool(name: string): name is AgentPreviewTool {
  return (AGENT_PREVIEW_TOOLS as readonly string[]).includes(name)
}

export function isAgentLoopTool(name: string): name is AgentLoopTool {
  return isAgentReadTool(name) || isAgentPreviewTool(name)
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
    'AGENT MODE',
    'Decide the sequence and run it. Do not ask before each step.',
    'Call the tools on this request directly. The transcript keeps your last reply and each tool result. Use a /tool line only when those calls are unavailable:',
    '/tool <tool_name> {"key":"value"}',
    'Do not wrap that line in markdown fences. JSON on the same line. Empty object is `{}`.',
    'Run these yourself:',
    '- query_release_studio_snapshot {"releaseId":"<id>"}',
    '- query_ops_snapshot {"focus":"studio"|"nurturing"|"all"}',
    '- query_studio_command_center {"dueWithinDays":14}',
    '- query_platform_growth_snapshot {}',
    '- admin_browser {"action":"status"|"read"|"snapshot"|"probe_fields"|"inspect"|"navigate"|"open"|"back"|"reload"|"wheel"|"click"|"type"|"press"|"soundcloud_prefill", "url":"https://…", "releaseId":"<id>", "target":"visible label", "text":"characters to type", "x":0.5, "y":0.4} — runs live Playwright on this chat\'s Chromium page for external desks only. Do not open sergikdropz.com/admin, /studio, or localhost studio or admin. Those actions use the Release Studio page already open beside the chat. snapshot and read return page text plus a screenshot. On DistroKid album pages the same result includes distrokidCodes (UPC and each track ISRC from .isrc-value). Use that object. /isrc/ redirects to My Music. click and type need You drive off. Never click DistroKid Continue or Submit. distrokid_bank_import reads a CSV link already on distrokid.com/bank and ingests it. It does not click Continue, Submit, or Let\'s do it. meta_earnings_pull reads ad spend and Facebook creator earnings through the Graph API. soundcloud_prefill reads audio and artwork URLs from the database for releaseId, attaches those files on soundcloud.com/upload, and fills the EP. It never clicks Save.',
    '- audit_music_contract {"releaseId":"<id>"} or {"text":"…"}',
    '- audit_music_books {"text":"…","quotedCents":0,"paidCents":0,"currency":"usd"}',
    '- query_intelligence_harness {"mode":"probe"|"stack"|"knowledge", ...}',
    '- query_meta_business_agent {"action":"status"} or {"action":"test","message":"…"}. Official Meta Business Agent test chat. Customers on WhatsApp do not see it. Do not enable rollout.',
    '- read_workspace {"action":"search","query":"symbol or phrase"} or {"action":"read","path":"lib/ai/planner.ts","offset":1,"limit":180} — read-only files under web/ and knowledge/. Cite the path. No writes.',
    'Preview tools run inside this loop as dry runs and do not save: patch_release_marketing_copy, assign_isrcs, pull_distrokid_isrcs, update_copyright_checklist, draft_product_strategy_pack, generate_campaign_draft, generate_smartlink_utm_plan, create_distribution_release_draft, run_meta_promo_pipeline. Show that preview. The user approves before a database write.',
    'After each tool result, continue from the transcript. Do not pause to ask if you should read, navigate, probe, or fill the next obvious field. Stop when the task is done, a tool failed, You drive blocks a click or type, or the next click is DistroKid Continue/Submit or an /exec write that needs approval.',
    'For Studio field patches, prefer an ```ai-diff fenced JSON block with before/after so the user can Approve. UPC uses field "upc" (the release barcode). After DistroKid submits a code, store that exact value. Do not invent TBD for type, title, or genre.',
  ].join('\n')
}

export type ParsedAgentToolCall = {
  tool: AgentLoopTool
  payload: Record<string, unknown>
  raw: string
}

function acceptBrowserPayload(tool: string, payload: Record<string, unknown>): boolean {
  if (tool !== 'admin_browser') return true
  const action = String(payload.action || 'read')
  return AGENT_BROWSER_LIVE_ACTIONS.has(action as AdminBrowserActionName)
}

/** Pull `/tool name {json}` calls from a model reply, including fenced / messy local-model variants. */
export function parseAgentToolCalls(text: string): ParsedAgentToolCall[] {
  const out: ParsedAgentToolCall[] = []
  const seen = new Set<string>()
  const re = /\/tool\s+([a-z0-9_]+)/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    const tool = match[1]!
    if (!isAgentLoopTool(tool)) continue
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
