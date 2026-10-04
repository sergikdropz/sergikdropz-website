/**
 * Cursor-style read-tool loop for Admin AI chat.
 * Writes stay on /exec Preview → Approve.
 */

import { runAdminTool } from '@/lib/admin-ai'
import {
  parseAdminAiApplyDiffs,
  stripAdminAiApplyDiffFences,
  type AdminAiApplyDiff,
} from '@/lib/ai/admin-ai-apply-diff'
import {
  isAgentReadTool,
  parseAgentToolCalls,
  replyTriedBrokenToolCall,
  stripAgentToolCalls,
  type ParsedAgentToolCall,
} from '@/lib/ai/admin-ai-agent-tools'
import { expandAdminAiMentions } from '@/lib/ai/admin-ai-mentions'
import {
  formatThreadMemoryForPrompt,
  inferMemoryPatchFromTurn,
  mergeThreadMemory,
  normalizeThreadMemory,
  type AdminAiThreadMemory,
  type ThreadMemoryPatch,
} from '@/lib/ai/admin-ai-thread-memory'
import { generateAdminChatReply, type AdminChatModelOverrides, type AdminChatReply } from '@/lib/ai/admin-chat-providers'
import type { AdminAiAutoRouterMode } from '@/lib/ai/admin-chat-router'
import type { AdminAiChatProvider } from '@/lib/ai/admin-chat-types'
import type { AdminChatEnergyPreset, AdminChatHonestyMode } from '@/lib/ai/admin-chat-session-tuning'
import { deskCardForUrl } from '@/lib/ai/admin-ai-desks'
import { buildAdminAiLiveContextPrompt, messageWantsLiveContext } from '@/lib/ai/admin-ai-chat-live-context'
import { goalFromKnownRelease } from '@/lib/ai/known-primary-goal'

const MAX_ROUNDS = 5
const MAX_BOOTSTRAP_TOOLS = 2
const MAX_TOOL_RESULT_CHARS = 3_500

export type AdminAiAgentToolStep = {
  id: string
  tool: string
  payload: Record<string, unknown>
  status: 'running' | 'done' | 'error'
  summary: string
  startedAt: number
  endedAt?: number
}

export type AdminAiAgentEvent =
  | { type: 'tool_start'; step: AdminAiAgentToolStep }
  | { type: 'tool_end'; step: AdminAiAgentToolStep }
  | { type: 'round'; round: number; replyPreview: string }
  | { type: 'done' }

export type AdminAiAgentTurnResult = AdminChatReply & {
  toolSteps: AdminAiAgentToolStep[]
  applyDiffs: AdminAiApplyDiff[]
  memory: AdminAiThreadMemory
  memoryPatch: ThreadMemoryPatch
  /** Reply with /tool lines removed; ai-diff fences kept for client parse or stripped. */
  reply: string
  /** Set when this turn stopped before the browser task was finished. */
  browserHold: string | null
}

function slimToolOutput(output: Record<string, unknown>): string {
  try {
    const json = JSON.stringify(output, (_, value) => {
      if (typeof value === 'string' && value.length > 400) return `${value.slice(0, 400)}…`
      if (typeof value === 'string' && value.startsWith('/9j/')) return '[image omitted]'
      return value
    })
    return json.length > MAX_TOOL_RESULT_CHARS
      ? `${json.slice(0, MAX_TOOL_RESULT_CHARS)}…`
      : json
  } catch {
    return '{"error":"unserializable"}'
  }
}

async function runOneTool(
  call: ParsedAgentToolCall,
  adminId: string,
  chatSessionId?: string,
): Promise<{ ok: boolean; summary: string; body: string }> {
  try {
    const payload =
      call.tool === 'admin_browser' && chatSessionId
        ? { ...call.payload, chatSessionId }
        : call.payload
    const result = await runAdminTool({
      tool: call.tool,
      payload,
      adminId,
      dryRun: true,
    })
    return {
      ok: true,
      summary: result.summary,
      body: slimToolOutput(result.output as Record<string, unknown>),
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, summary: message, body: JSON.stringify({ error: message }) }
  }
}

function liveContextCoversTool(live: string, tool: string): boolean {
  if (!live.trim()) return false
  if (tool === 'query_release_studio_snapshot') return /Release Studio \(auto\)/.test(live)
  if (tool === 'admin_browser') return /Browser open:|Form fields \(/.test(live)
  if (tool === 'query_platform_growth_snapshot') return /PLATFORM GROWTH SNAPSHOT/i.test(live)
  if (tool === 'query_ops_snapshot') return /query_ops_snapshot|ops snapshot/i.test(live)
  if (tool === 'query_studio_command_center') return /due this week|command center/i.test(live)
  return false
}

function capBootstrapCalls(calls: ParsedAgentToolCall[], live: string): ParsedAgentToolCall[] {
  return calls.filter((call) => !liveContextCoversTool(live, call.tool)).slice(0, MAX_BOOTSTRAP_TOOLS)
}

function fallbackReadCall(input: {
  message: string
  releaseId?: string | null
}): ParsedAgentToolCall | null {
  const releaseId = input.releaseId?.trim()
  if (releaseId && /\b(upc|isrc|release|blocker|metadata|distrokid|@release)\b/i.test(input.message)) {
    return {
      tool: 'query_release_studio_snapshot',
      payload: { releaseId },
      raw: `/tool query_release_studio_snapshot ${JSON.stringify({ releaseId })}`,
    }
  }
  if (messageWantsLiveContext(input.message)) {
    return {
      tool: 'admin_browser',
      payload: { action: 'status' },
      raw: '/tool admin_browser {"action":"status"}',
    }
  }
  return null
}

function dedupeCalls(calls: ParsedAgentToolCall[]): ParsedAgentToolCall[] {
  const seen = new Set<string>()
  const out: ParsedAgentToolCall[] = []
  for (const call of calls) {
    const key = `${call.tool}:${JSON.stringify(call.payload)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(call)
  }
  return out
}

export async function runAdminAiAgentTurn(input: {
  message: string
  adminId: string
  agentEnabled?: boolean
  provider?: string | null
  modelOverrides?: AdminChatModelOverrides
  resolvedModelIds?: Partial<Record<AdminAiChatProvider, string>>
  strictProvider?: boolean
  autoRouterMode?: AdminAiAutoRouterMode
  skillId?: string | null
  stickySkillId?: string | null
  siteKnowledgePrompt?: string | null
  pageContextPrompt?: string | null
  honestyMode?: AdminChatHonestyMode | null
  energyPreset?: AdminChatEnergyPreset | null
  releaseId?: string | null
  releaseTitle?: string | null
  threadMemory?: unknown
  onEvent?: (event: AdminAiAgentEvent) => void
  chatSessionId?: string
}): Promise<AdminAiAgentTurnResult> {
  const memory = normalizeThreadMemory(input.threadMemory)
  const mentions = expandAdminAiMentions({
    message: input.message,
    releaseId: input.releaseId || memory.releaseId,
    releaseTitle: input.releaseTitle || memory.releaseTitle,
  })

  const live = await buildAdminAiLiveContextPrompt({
    message: input.message,
    releaseId: input.releaseId || memory.releaseId,
    chatSessionId: input.chatSessionId,
  }).catch(() => '')

  const memoryPrompt = formatThreadMemoryForPrompt(memory)
  const pageContextPrompt = [
    input.pageContextPrompt?.trim(),
    memoryPrompt,
    mentions.context,
    live,
  ]
    .filter(Boolean)
    .join('\n\n')

  const bootstrapCalls = capBootstrapCalls(
    dedupeCalls(
      mentions.requestedTools.flatMap((t) => {
        if (!isAgentReadTool(t.tool)) return []
        return [
          {
            tool: t.tool,
            payload: t.payload,
            raw: `/tool ${t.tool} ${JSON.stringify(t.payload)}`,
          },
        ]
      }),
    ),
    live,
  )

  const toolSteps: AdminAiAgentToolStep[] = []
  const toolTranscript: string[] = []
  const emit = (event: AdminAiAgentEvent) => {
    try {
      input.onEvent?.(event)
    } catch {
      /* ignore */
    }
  }

  const runCalls = async (calls: ParsedAgentToolCall[]) => {
    for (const call of dedupeCalls(calls)) {
      const step: AdminAiAgentToolStep = {
        id: `step_${toolSteps.length + 1}_${call.tool}`,
        tool: call.tool,
        payload: call.payload,
        status: 'running',
        summary: `Running ${call.tool}…`,
        startedAt: Date.now(),
      }
      toolSteps.push(step)
      emit({ type: 'tool_start', step: { ...step } })
      const result = await runOneTool(call, input.adminId, input.chatSessionId)
      step.status = result.ok ? 'done' : 'error'
      step.summary = result.summary
      step.endedAt = Date.now()
      emit({ type: 'tool_end', step: { ...step } })
      toolTranscript.push(
        `TOOL RESULT ${call.tool}\nPayload: ${JSON.stringify(call.payload)}\n${result.body}`,
      )
    }
  }

  // Bootstrap mention tools before the first model call when agent is on.
  if (input.agentEnabled !== false && bootstrapCalls.length) {
    await runCalls(bootstrapCalls)
  }

  let userMessage = input.message
  if (toolTranscript.length) {
    userMessage = `${input.message}\n\n---\n${toolTranscript.join('\n\n')}\n---`
  }

  let last: AdminChatReply = await generateAdminChatReply(userMessage, {
    provider: input.provider,
    modelOverrides: input.modelOverrides,
    resolvedModelIds: input.resolvedModelIds,
    strictProvider: input.strictProvider,
    autoRouterMode: input.autoRouterMode,
    skillId: input.skillId,
    stickySkillId: input.stickySkillId,
    siteKnowledgePrompt: input.siteKnowledgePrompt,
    pageContextPrompt: pageContextPrompt || null,
    honestyMode: input.honestyMode,
    energyPreset: input.energyPreset,
    agentMode: input.agentEnabled !== false,
  })

  emit({ type: 'round', round: 0, replyPreview: last.reply.slice(0, 200) })

  if (input.agentEnabled !== false) {
    if (!parseAgentToolCalls(last.reply).length && replyTriedBrokenToolCall(last.reply)) {
      const fallback = fallbackReadCall({
        message: input.message,
        releaseId: input.releaseId || memory.releaseId,
      })
      if (fallback && !liveContextCoversTool(live, fallback.tool)) {
        await runCalls([fallback])
        last = await generateAdminChatReply(
          [
            input.message,
            '',
            '---',
            ...toolTranscript,
            '---',
            'Your previous /tool line was invalid. Use the TOOL RESULT above and answer the user now. Do not emit another /tool unless data is still missing. If you need the user to choose a next step, end with a ```choices fence.',
          ].join('\n'),
          {
            provider: input.provider ?? last.provider,
            modelOverrides: input.modelOverrides,
            resolvedModelIds: input.resolvedModelIds,
            strictProvider: input.strictProvider,
            autoRouterMode: input.autoRouterMode,
            skillId: input.skillId ?? last.skill.id,
            stickySkillId: input.stickySkillId,
            siteKnowledgePrompt: input.siteKnowledgePrompt,
            pageContextPrompt: pageContextPrompt || null,
            honestyMode: input.honestyMode,
            energyPreset: input.energyPreset,
            agentMode: true,
          },
        )
        emit({ type: 'round', round: 0, replyPreview: last.reply.slice(0, 200) })
      }
    }

    for (let round = 1; round <= MAX_ROUNDS; round += 1) {
      const calls = parseAgentToolCalls(last.reply)
      if (!calls.length) break
      await runCalls(calls)
      const followUp = [
        input.message,
        '',
        '---',
        ...toolTranscript,
        '---',
        'Use the tool results above. Answer the user now. Do not repeat /tool lines unless you still lack data. If you need the user to choose a next step, end with a ```choices fence.',
      ].join('\n')
      last = await generateAdminChatReply(followUp, {
        provider: input.provider ?? last.provider,
        modelOverrides: input.modelOverrides,
        resolvedModelIds: input.resolvedModelIds,
        strictProvider: input.strictProvider,
        autoRouterMode: input.autoRouterMode,
        skillId: input.skillId ?? last.skill.id,
        stickySkillId: input.stickySkillId,
        siteKnowledgePrompt: input.siteKnowledgePrompt,
        pageContextPrompt: pageContextPrompt || null,
        honestyMode: input.honestyMode,
        energyPreset: input.energyPreset,
        agentMode: true,
      })
      emit({ type: 'round', round, replyPreview: last.reply.slice(0, 200) })
    }
  }

  const applyDiffs = parseAdminAiApplyDiffs(last.reply)
  const leftoverTools =
    input.agentEnabled !== false ? parseAgentToolCalls(last.reply).map((call) => call.tool) : []
  const browserHold = formatBrowserHold(toolSteps, leftoverTools)
  const cleaned = stripAdminAiApplyDiffFences(stripAgentToolCalls(last.reply))

  const deskFromTools = toolSteps
    .map((s) => {
      if (s.tool !== 'admin_browser') return null
      return null
    })
    .find(Boolean)

  void deskFromTools
  const pageMatch = input.message.match(/^Page:\s*(\S+)/m)
  const deskUrl = pageMatch?.[1] || memory.deskUrl
  const desk = deskCardForUrl(deskUrl || '')

  const memoryPatch = inferMemoryPatchFromTurn({
    message: input.message,
    releaseId: input.releaseId || memory.releaseId,
    releaseTitle: input.releaseTitle || memory.releaseTitle,
    deskUrl: deskUrl || null,
    deskLabel: desk?.label || memory.deskLabel || null,
    skillId: last.skill.id,
  })
  const knownTitle = input.releaseTitle || memory.releaseTitle
  if (!memory.goal && !memoryPatch.goal && knownTitle) {
    memoryPatch.goal = goalFromKnownRelease(knownTitle)
  }
  if (toolSteps.some((s) => s.tool === 'admin_browser' && s.status === 'done')) {
    memoryPatch.addNote = memoryPatch.addNote || 'Probed open browser desk this turn.'
  }

  const nextMemory = mergeThreadMemory(memory, memoryPatch)
  emit({ type: 'done' })

  return {
    ...last,
    reply: cleaned,
    toolSteps,
    applyDiffs,
    memory: nextMemory,
    memoryPatch,
    browserHold,
  }
}

function formatBrowserHold(steps: AdminAiAgentToolStep[], leftover: string[]): string | null {
  const failed = steps.filter((step) => step.status === 'error' && step.summary.trim())
  const parts: string[] = []
  if (failed.length) {
    parts.push(
      failed
        .slice(0, 2)
        .map((step) => step.summary.replace(/\s+/g, ' ').trim())
        .join(' · '),
    )
  }
  if (leftover.length) {
    const names = [...new Set(leftover)].slice(0, 3).join(', ')
    parts.push(`still needs ${names}`)
  }
  if (!parts.length) return null
  const body = parts.join('. ')
  const clipped = body.length > 160 ? `${body.slice(0, 157)}…` : body
  return `Unfinished: ${clipped}. Turn off You drive to hand this page back.`
}
