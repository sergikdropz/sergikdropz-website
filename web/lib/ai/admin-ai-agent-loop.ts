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
  AGENT_BROWSER_LIVE_ACTIONS,
  isAgentLoopTool,
  isAgentPreviewTool,
  replyTriedBrokenToolCall,
  stripAgentToolCalls,
  type ParsedAgentToolCall,
} from '@/lib/ai/admin-ai-agent-tools'
import type { AdminBrowserActionName } from '@/lib/ai/admin-browser-shared'
import { expandAdminAiMentions } from '@/lib/ai/admin-ai-mentions'
import {
  formatThreadMemoryForPrompt,
  factsFromTurn,
  inferMemoryPatchFromTurn,
  mergeThreadMemory,
  normalizeThreadMemory,
  type AdminAiThreadMemory,
  type ThreadMemoryPatch,
} from '@/lib/ai/admin-ai-thread-memory'
import { advanceThreadChecklist } from '@/lib/ai/admin-ai-thread-checklist'
import { soundcloudUploadAgentPayload } from '@/lib/ai/soundcloud-upload'
import { createReplyDeltaPump } from '@/lib/ai/admin-ai-reply-stream'
import {
  replacementForProviderEcho,
  unwrapEchoedProviderFailure,
} from '@/lib/ai/admin-chat-provider-echo'
import { resolveInferredSkillForAdminChat } from '@/lib/ai/admin-chat-infer-skill'
import {
  generateAdminAgentStep,
  generateAdminChatReply,
  runCursorSkillTurn,
  type AdminChatModelOverrides,
  type AdminChatReply,
} from '@/lib/ai/admin-chat-providers'
import {
  latestAssistantText,
  reasoningFollowUp,
  resolveTurnToolCalls,
  seedAgentTranscript,
  type AgentToolCall,
  type AgentTranscriptMessage,
} from '@/lib/ai/admin-ai-agent-transcript'
import type { AdminAiAutoRouterMode } from '@/lib/ai/admin-chat-router'
import type { AdminAiChatProvider } from '@/lib/ai/admin-chat-types'
import type { AdminChatEnergyPreset, AdminChatHonestyMode } from '@/lib/ai/admin-chat-session-tuning'
import { deskCardForUrl } from '@/lib/ai/admin-ai-desks'
import { buildAdminAiLiveContextPrompt, messageWantsLiveContext } from '@/lib/ai/admin-ai-chat-live-context'
import { goalFromKnownRelease } from '@/lib/ai/known-primary-goal'
import { keepToolString, orderToolOutputForDistroKid } from '@/lib/ai/distrokid-page-codes'

const MAX_ROUNDS = 8

const MAX_BOOTSTRAP_TOOLS = 2
const MAX_TOOL_RESULT_CHARS = 16_000
const TOOL_STRING_MAX = 8_000

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
  | { type: 'reply_delta'; round: number; text: string }
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
  const ordered = orderToolOutputForDistroKid(output, TOOL_STRING_MAX)
  try {
    const json = JSON.stringify(ordered, (_, value) => {
      if (typeof value === 'string' && value.startsWith('/9j/')) return '[image omitted]'
      if (typeof value === 'string') return keepToolString(value, TOOL_STRING_MAX)
      return value
    })
    return json.length > MAX_TOOL_RESULT_CHARS
      ? `${json.slice(0, MAX_TOOL_RESULT_CHARS)}…`
      : json
  } catch {
    return '{"error":"unserializable"}'
  }
}

function takeBrowserImage(output: Record<string, unknown>): { body: Record<string, unknown>; image: string | null } {
  const raw = output.imageBase64
  const image = typeof raw === 'string' && raw.length > 80 && raw.length < 220_000 ? raw : null
  if (!('imageBase64' in output)) return { body: output, image: null }
  const rest = { ...output }
  delete rest.imageBase64
  return { body: { ...rest, screenshot: image ? 'attached' : 'omitted' }, image }
}

async function runOneTool(
  call: ParsedAgentToolCall,
  adminId: string,
  chatSessionId?: string,
): Promise<{ ok: boolean; summary: string; body: string; image: string | null }> {
  try {
    const preview = isAgentPreviewTool(call.tool)
    const browserAction = String(call.payload.action || 'read') as AdminBrowserActionName
    const browserLive = call.tool === 'admin_browser' && AGENT_BROWSER_LIVE_ACTIONS.has(browserAction)
    const payload: Record<string, unknown> = {
      ...call.payload,
      ...(call.tool === 'admin_browser' && chatSessionId ? { chatSessionId } : {}),
      ...(preview ? { dryRun: true } : {}),
    }
    const result = await runAdminTool({
      tool: call.tool,
      payload,
      adminId,
      dryRun: preview || !browserLive,
      retainImages: browserLive,
    })
    const taken = takeBrowserImage(result.output as Record<string, unknown>)
    return {
      ok: true,
      summary: result.summary,
      body: slimToolOutput(taken.body),
      image: taken.image,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, summary: message, body: JSON.stringify({ error: message }), image: null }
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
  if (
    releaseId &&
    /\b(release|track|pitch|caption|copy|blocker|metadata|upc|isrc|catalog|contract|campaign|due|status|spotify|youtube)\b/i.test(
      input.message,
    )
  ) {
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

function asksForPermission(reply: string): boolean {
  const tail = reply.trim().slice(-800)
  return /\b(want me to|shall i|should i|do you want me to|would you like me to|your call|which should i|let me know if you want)\b/i.test(
    tail,
  )
}

/** Prior bubbles that are provider failures, not answers. Anthropic never had to continue from these. */
function cursorHistoryUnusable(text: string): boolean {
  return /No LLM provider is available|Cursor chat timed out|Cursor intelligence harness timed out|Error:\s*Unauthorized|^\s*Unauthorized\s*$/i.test(
    text,
  )
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
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
  onEvent?: (event: AdminAiAgentEvent) => void
  chatSessionId?: string
}): Promise<AdminAiAgentTurnResult> {
  const memory = normalizeThreadMemory(input.threadMemory)
  const echoed = unwrapEchoedProviderFailure(input.message)
  if (echoed.echoed) {
    const skill = resolveInferredSkillForAdminChat(echoed.text, {
      skillId: input.skillId,
      stickySkillId: input.stickySkillId,
    })
    return {
      reply: replacementForProviderEcho(echoed.text),
      skill,
      provider: 'ollama',
      toolCalls: [],
      toolSteps: [],
      applyDiffs: [],
      memory,
      memoryPatch: {},
      browserHold: null,
    }
  }
  const mentions = expandAdminAiMentions({
    message: input.message,
    releaseId: input.releaseId || memory.releaseId,
    releaseTitle: input.releaseTitle || memory.releaseTitle,
  })

  const openReleaseId = input.releaseId || memory.releaseId
  const live = await buildAdminAiLiveContextPrompt({
    message: input.message,
    releaseId: openReleaseId,
    chatSessionId: input.chatSessionId,
    groundRelease: Boolean(openReleaseId?.trim()),
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

  const mentioned = capBootstrapCalls(
    dedupeCalls(
      mentions.requestedTools.flatMap((t) => {
        if (!isAgentLoopTool(t.tool)) return []
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
  const soundcloudUpload = soundcloudUploadAgentPayload(input.message, openReleaseId)
  const bootstrapCalls = soundcloudUpload
    ? [
        {
          tool: 'admin_browser' as const,
          payload: soundcloudUpload,
          raw: `/tool admin_browser ${JSON.stringify(soundcloudUpload)}`,
        },
        ...mentioned.filter((call) => call.payload.action !== 'soundcloud_prefill'),
      ].slice(0, 3)
    : mentioned

  const toolSteps: AdminAiAgentToolStep[] = []
  const transcript: AgentTranscriptMessage[] = seedAgentTranscript(input.history ?? [], input.message)
  const emit = (event: AdminAiAgentEvent) => {
    try {
      input.onEvent?.(event)
    } catch {
      /* ignore */
    }
  }

  const stepOptions = {
    provider: input.provider,
    modelOverrides: input.modelOverrides,
    resolvedModelIds: input.resolvedModelIds,
    strictProvider: input.strictProvider,
    skillId: input.skillId,
    stickySkillId: input.stickySkillId,
    siteKnowledgePrompt: input.siteKnowledgePrompt,
    pageContextPrompt: pageContextPrompt || null,
    honestyMode: input.honestyMode,
    energyPreset: input.energyPreset,
  }

  const runNative = async (calls: AgentToolCall[]) => {
    const images: string[] = []
    for (const call of calls) {
      const step: AdminAiAgentToolStep = {
        id: `step_${toolSteps.length + 1}_${call.name}`,
        tool: call.name,
        payload: call.arguments,
        status: 'running',
        summary: `Running ${call.name}…`,
        startedAt: Date.now(),
      }
      toolSteps.push(step)
      emit({ type: 'tool_start', step: { ...step } })
      const unavailable = {
        ok: false,
        summary: 'That action is not available in this loop.',
        body: JSON.stringify({
          error: 'That action is not available in this loop. Database writes stay on /exec.',
        }),
        image: null as string | null,
      }
      let result = unavailable
      if (isAgentLoopTool(call.name)) {
        const browserBlocked =
          call.name === 'admin_browser' &&
          !AGENT_BROWSER_LIVE_ACTIONS.has(String(call.arguments.action || 'read') as AdminBrowserActionName)
        if (!browserBlocked) {
          result = await runOneTool(
            { tool: call.name, payload: call.arguments, raw: call.id },
            input.adminId,
            input.chatSessionId,
          )
        }
      }
      step.status = result.ok ? 'done' : 'error'
      step.summary = result.summary
      step.endedAt = Date.now()
      emit({ type: 'tool_end', step: { ...step } })
      transcript.push({
        role: 'tool',
        toolCallId: call.id,
        name: call.name,
        content: result.ok ? result.body : JSON.stringify({ error: result.summary }),
      })
      if (result.image) images.push(result.image)
    }
    if (images.length) {
      transcript.push({
        role: 'user',
        content:
          'Screenshot of the browser page from the tool result above. Use it with pageOutline and the text. Do not invent controls that are not visible.',
        images: images.slice(0, 2),
      })
    }
  }

  let last: AdminChatReply
  if (input.agentEnabled === false) {
    const pump = createReplyDeltaPump((text) => emit({ type: 'reply_delta', round: 0, text }))
    try {
      last = await generateAdminChatReply(input.message, {
        ...stepOptions,
        skillId: input.skillId || input.stickySkillId,
        autoRouterMode: input.autoRouterMode,
        agentMode: false,
        onDelta: (chunk) => pump.push(chunk),
      })
    } finally {
      pump.flush()
    }
  } else if ((input.provider || '').trim().toLowerCase() === 'cursor') {
    for (let index = transcript.length - 1; index >= 0; index -= 1) {
      const prior = transcript[index]
      if (prior?.role === 'assistant' && cursorHistoryUnusable(prior.content)) {
        transcript.splice(index, 1)
      }
    }
    if (bootstrapCalls.length) {
      const calls: AgentToolCall[] = bootstrapCalls.map((call, index) => ({
        id: `boot_${index + 1}`,
        name: call.tool,
        arguments: call.payload,
      }))
      transcript.push({ role: 'assistant', content: '', toolCalls: calls })
      await runNative(calls)
    }

    const started = Date.now()
    const budgetMs = 165_000
    let permissionNudges = 0
    let extractNudges = 0
    let fallbackUsed = false
    last = {
      reply: '',
      skill: resolveInferredSkillForAdminChat(input.message, {
        skillId: input.skillId,
        stickySkillId: input.stickySkillId,
      }),
      provider: 'cursor',
      toolCalls: [],
    }

    for (let round = 0; round < 3; round += 1) {
      const left = budgetMs - (Date.now() - started)
      if (left < 20_000) break
      const pump = createReplyDeltaPump((text) => emit({ type: 'reply_delta', round, text }))
      try {
        last = await runCursorSkillTurn(input.message, {
          ...stepOptions,
          transcript,
          timeoutMs: Math.min(left, round === 0 ? 120_000 : 40_000),
          onTool: async (name, args) => {
            if (!isAgentLoopTool(name)) return JSON.stringify({ error: 'That tool is not in the admin agent loop.' })
            const call: AgentToolCall = {
              id: `cursor_tool_${toolSteps.length + 1}`,
              name,
              arguments: args,
            }
            transcript.push({ role: 'assistant', content: '', toolCalls: [call] })
            await runNative([call])
            const found = [...transcript].reverse().find((row) => row.role === 'tool' && row.toolCallId === call.id)
            return found && found.role === 'tool' ? found.content : '{"error":"no result"}'
          },
          onDelta: (chunk) => pump.push(chunk),
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Cursor chat failed'
        last = { ...last, reply: message, provider: 'cursor', toolCalls: [] }
      } finally {
        pump.flush()
      }
      if (!last.provider) break
      const calls = resolveTurnToolCalls([], last.reply)
      transcript.push({ role: 'assistant', content: last.reply, toolCalls: calls })
      emit({ type: 'round', round, replyPreview: last.reply.slice(0, 200) })
      if (!calls.length) {
        if (!fallbackUsed && replyTriedBrokenToolCall(last.reply)) {
          const fallback = fallbackReadCall({
            message: input.message,
            releaseId: input.releaseId || memory.releaseId,
          })
          if (fallback && !liveContextCoversTool(live, fallback.tool)) {
            fallbackUsed = true
            const call: AgentToolCall = {
              id: 'fallback_1',
              name: fallback.tool,
              arguments: fallback.payload,
            }
            const assistant = transcript[transcript.length - 1]
            if (assistant?.role === 'assistant') assistant.toolCalls = [call]
            await runNative([call])
            continue
          }
        }
        if (permissionNudges < 2 && asksForPermission(last.reply)) {
          permissionNudges += 1
          transcript.push({
            role: 'user',
            content: 'You asked for permission instead of doing the work. Call the next tool now.',
          })
          continue
        }
        const grounded = /Release Studio \(auto\)|Browser open:|PLATFORM GROWTH SNAPSHOT/i.test(live)
        const follow =
          extractNudges < 2
            ? reasoningFollowUp(input.message, transcript, grounded, `${live}\n${input.pageContextPrompt || ''}`)
            : null
        if (follow) {
          extractNudges += 1
          transcript.push({ role: 'user', content: follow })
          continue
        }
        break
      }
      await runNative(calls)
    }

    if (transcript[transcript.length - 1]?.role === 'tool') {
      const left = budgetMs - (Date.now() - started)
      if (left >= 20_000) {
        transcript.push({
          role: 'user',
          content: 'Answer from the tool results above. Do not call more tools.',
        })
        const pump = createReplyDeltaPump((text) => emit({ type: 'reply_delta', round: 3, text }))
        try {
          last = await runCursorSkillTurn(input.message, {
            ...stepOptions,
            transcript,
            timeoutMs: Math.min(left, 40_000),
            onTool: async () => 'Stop calling tools. Answer from the results you already have.',
            onDelta: (chunk) => pump.push(chunk),
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Cursor chat failed'
          last = { ...last, reply: message, provider: 'cursor', toolCalls: [] }
        } finally {
          pump.flush()
        }
        transcript.push({ role: 'assistant', content: last.reply, toolCalls: [] })
      }
    }
    last = { ...last, reply: latestAssistantText(transcript) || last.reply }
  } else {
    if (bootstrapCalls.length) {
      const calls: AgentToolCall[] = bootstrapCalls.map((call, index) => ({
        id: `boot_${index + 1}`,
        name: call.tool,
        arguments: call.payload,
      }))
      transcript.push({ role: 'assistant', content: '', toolCalls: calls })
      await runNative(calls)
    }

    let permissionNudges = 0
    let extractNudges = 0
    let fallbackUsed = false
    last = {
      reply: '',
      skill: { id: input.skillId || 'studio_release', name: 'Release Studio' } as AdminChatReply['skill'],
      provider: null,
      toolCalls: [],
    }

    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      const pump = createReplyDeltaPump((text) => emit({ type: 'reply_delta', round, text }))
      try {
        last = await generateAdminAgentStep(input.message, {
          ...stepOptions,
          skillId: input.skillId ?? input.stickySkillId ?? (round === 0 ? undefined : last.skill.id),
          transcript,
          onDelta: (chunk) => pump.push(chunk),
        })
      } finally {
        pump.flush()
      }
      if (!last.provider) break
      const calls = resolveTurnToolCalls(last.toolCalls ?? [], last.reply)
      transcript.push({ role: 'assistant', content: last.reply, toolCalls: calls })
      emit({ type: 'round', round, replyPreview: last.reply.slice(0, 200) })
      if (!calls.length) {
        if (!fallbackUsed && replyTriedBrokenToolCall(last.reply)) {
          const fallback = fallbackReadCall({
            message: input.message,
            releaseId: input.releaseId || memory.releaseId,
          })
          if (fallback && !liveContextCoversTool(live, fallback.tool)) {
            fallbackUsed = true
            const call: AgentToolCall = {
              id: 'fallback_1',
              name: fallback.tool,
              arguments: fallback.payload,
            }
            const assistant = transcript[transcript.length - 1]
            if (assistant?.role === 'assistant') assistant.toolCalls = [call]
            await runNative([call])
            continue
          }
        }
        if (permissionNudges < 2 && asksForPermission(last.reply)) {
          permissionNudges += 1
          transcript.push({
            role: 'user',
            content: 'You asked for permission instead of doing the work. Call the next tool now.',
          })
          continue
        }
        const grounded = /Release Studio \(auto\)|Browser open:|PLATFORM GROWTH SNAPSHOT/i.test(live)
        const follow =
          extractNudges < 2
            ? reasoningFollowUp(input.message, transcript, grounded, `${live}\n${input.pageContextPrompt || ''}`)
            : null
        if (follow) {
          extractNudges += 1
          transcript.push({ role: 'user', content: follow })
          continue
        }
        break
      }
      await runNative(calls)
    }

    if (transcript[transcript.length - 1]?.role === 'tool') {
      transcript.push({
        role: 'user',
        content: 'Answer from the tool results above. Do not call more tools.',
      })
      const pump = createReplyDeltaPump((text) => emit({ type: 'reply_delta', round: MAX_ROUNDS, text }))
      try {
        last = await generateAdminAgentStep(input.message, {
          ...stepOptions,
          skillId: input.skillId ?? last.skill.id,
          transcript,
          tools: false,
          onDelta: (chunk) => pump.push(chunk),
        })
      } finally {
        pump.flush()
      }
      transcript.push({ role: 'assistant', content: last.reply, toolCalls: [] })
    }
    last = { ...last, reply: latestAssistantText(transcript) || last.reply }
  }

  const applyDiffs = parseAdminAiApplyDiffs(last.reply)
  const tail = transcript[transcript.length - 1]
  const leftoverTools =
    tail?.role === 'assistant' ? tail.toolCalls.map((call) => call.name) : []
  const browserHold = formatBrowserHold(toolSteps, leftoverTools)
  const stripped = stripAdminAiApplyDiffFences(stripAgentToolCalls(last.reply))
  const cleaned = stripped

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
  const factPatch = factsFromTurn({
    userText: input.message,
    assistantText: cleaned,
    toolBodies: transcript.filter((message) => message.role === 'tool').map((message) => message.content),
    previous: memory,
  })
  memoryPatch.codes = factPatch.codes
  memoryPatch.citedFiles = factPatch.citedFiles
  memoryPatch.openQuestion = factPatch.openQuestion
  memoryPatch.summary = factPatch.summary
  const checklist = advanceThreadChecklist({
    previous: memory.checklist,
    userText: input.message,
    assistantText: cleaned,
    releaseOpen: Boolean((input.releaseId || memory.releaseId || '').trim()),
    toolCalls: toolSteps.map((step) => ({ name: step.tool, payload: step.payload })),
    toolBodies: transcript.filter((message) => message.role === 'tool').map((message) => message.content),
  })
  if (checklist !== undefined) memoryPatch.checklist = checklist

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
