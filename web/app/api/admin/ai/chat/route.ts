import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { getEnvModelIdsResolvedForChat } from '@/lib/ai/admin-chat-env-models'
import { loadAdminAiChatPreferences, mergeResolvedModels } from '@/lib/ai/admin-ai-chat-preferences'
import {
  clampAdminAiChatPrompt,
  computeAdminChatStickyRouting,
  normalizeRegisteredSkillId,
  parseStickySkillInferredAtMs,
  resolveEffectiveStickySkillId,
  type AdminChatRoutingEcho,
} from '@/lib/ai/admin-chat-guards'
import { getAllowedAdminSkillIds } from '@/lib/ai/skills/registry'
import { runAdminAiAgentTurn, type AdminAiAgentEvent } from '@/lib/ai/admin-ai-agent-loop'
import { formatAdminAiPageContextForPrompt, type AdminAiPageContext } from '@/lib/ai/admin-ai-page-context'
import { createAiRun, updateAiRun } from '@/lib/admin-ai'
import { addAdminAiChatRoutingBreadcrumb } from '@/lib/observability/admin-ai-chat-sentry'
import { computeAdminChatRunFingerprint } from '@/lib/ai/admin-chat-run-fingerprint'
import {
  parseAdminChatEnergyPreset,
  parseAdminChatHonestyMode,
} from '@/lib/ai/admin-chat-session-tuning'
import { buildSiteKnowledgeContext } from '@/lib/ai/site-knowledge-context'
import { startAiTelemetry } from '@/lib/observability/ai-telemetry'
import { checkRateLimitAsync } from '@/lib/rate-limit'
import { buildPlatformGrowthContextPrompt, isGrowthDeskIntent } from '@/lib/ai/platform-growth-snapshot'

export const dynamic = 'force-dynamic'
/** Allow long provider round-trips on Vercel (override in platform if needed). */
export const maxDuration = 120

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return 'Internal server error'
}

export async function POST(request: NextRequest) {
  let runId: string | null = null
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rl = await checkRateLimitAsync(`admin-ai-chat:${session.user.id}`, 30, 60_000)
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'AI chat rate limit exceeded. Try again shortly.', code: 'AI_RATE_LIMIT' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
      )
    }

    const body = (await request.json().catch(() => ({}))) as {
      message?: string
      provider?: string | null
      skillId?: string | null
      stickySkillId?: string | null
      stickySkillInferredAt?: number | string | null
      honestyMode?: string | null
      energyPreset?: string | null
      pageContext?: AdminAiPageContext | null
      /** When false, skip mid-turn /tool loop (pure chat). Default true. */
      agent?: boolean | null
      /** NDJSON event stream of tool cards + final result. */
      stream?: boolean | null
      threadMemory?: unknown
      chatSessionId?: string
    }
    const trimmed = body.message?.trim() ?? ''
    const { message, truncated: promptTruncated } = clampAdminAiChatPrompt(trimmed)
    const provider = body.provider?.trim() || null
    const allowedSkillIds = getAllowedAdminSkillIds()
    const skillId = normalizeRegisteredSkillId(body.skillId, allowedSkillIds)
    const stickyRequested = normalizeRegisteredSkillId(body.stickySkillId, allowedSkillIds)
    const stickyInferredAtMs = parseStickySkillInferredAtMs(body.stickySkillInferredAt)
    const nowMs = Date.now()
    const { effectiveStickySkillId, droppedStale: stickyDroppedStale } = resolveEffectiveStickySkillId({
      stickySkillIdNormalized: stickyRequested,
      stickyInferredAtMs,
      nowMs,
    })
    const honestyMode = parseAdminChatHonestyMode(body.honestyMode)
    const energyPreset = parseAdminChatEnergyPreset(body.energyPreset)
    const agentEnabled = body.agent !== false
    const wantStream = body.stream === true
    if (!message) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 })
    }

    runId = await createAiRun({
      adminId: session.user.id,
      requestType: 'chat',
      prompt: message,
    })

    const supabase = createSupabaseServerClient()
    const [prefs, envResolved] = await Promise.all([
      loadAdminAiChatPreferences(supabase),
      getEnvModelIdsResolvedForChat(),
    ])
    const resolvedModelIds = mergeResolvedModels(envResolved, prefs.modelOverrides)
    const pageContextPrompt = formatAdminAiPageContextForPrompt(body.pageContext ?? null)
    const siteKnowledgeContext = buildSiteKnowledgeContext({
      message,
      pathname: body.pageContext?.pathname,
    })
    const growthSlice =
      skillId === 'growth_marketing' ||
      effectiveStickySkillId === 'growth_marketing' ||
      isGrowthDeskIntent(message)
        ? buildPlatformGrowthContextPrompt()
        : null
    const siteKnowledgePrompt = [siteKnowledgeContext.prompt, growthSlice].filter(Boolean).join('\n\n')

    const telemetry = startAiTelemetry({
      actorId: session.user.id,
      kind: 'chat',
      name: 'admin_ai_chat',
      knowledgeHash: siteKnowledgeContext.metadata.contentHash,
      provider: provider ?? null,
    })

    const turnInput = {
      message,
      adminId: session.user.id,
      agentEnabled,
      provider,
      modelOverrides: prefs.modelOverrides,
      resolvedModelIds,
      strictProvider: Boolean(provider),
      autoRouterMode: prefs.autoRouterMode,
      skillId,
      stickySkillId: effectiveStickySkillId,
      siteKnowledgePrompt: siteKnowledgePrompt || null,
      pageContextPrompt: pageContextPrompt || null,
      honestyMode: honestyMode ?? undefined,
      energyPreset: energyPreset ?? undefined,
      releaseId: body.pageContext?.studio?.releaseId ?? null,
      releaseTitle: body.pageContext?.studio?.title ?? null,
      threadMemory: body.threadMemory,
      chatSessionId: typeof body.chatSessionId === 'string' ? body.chatSessionId : undefined,
    }

    const finish = async (chatResult: Awaited<ReturnType<typeof runAdminAiAgentTurn>>) => {
      telemetry.complete({
        provider: chatResult.provider ?? null,
        model: chatResult.modelId ?? null,
        promptChars: message.length,
        completionChars: chatResult.reply.length,
        meta: {
          skillId: chatResult.skill.id,
          freshnessHours: siteKnowledgeContext.metadata.freshnessHours,
          toolSteps: chatResult.toolSteps.length,
        },
      })

      const { continuationOnly, stickyPersonaApplied } = computeAdminChatStickyRouting({
        message,
        skillId,
        stickySkillId: effectiveStickySkillId,
        inferredSkillId: chatResult.skill.id,
      })

      const routingEcho: AdminChatRoutingEcho = {
        continuationOnly,
        stickySkillId: effectiveStickySkillId,
        stickySkillRequested: stickyRequested,
        stickyDroppedStale,
        stickyInferredAtMs,
        stickyPersonaApplied,
        promptTruncated,
      }

      const runFingerprint = computeAdminChatRunFingerprint({
        messageLen: message.length,
        continuationOnly,
        stickyPersonaApplied,
        stickyDroppedStale,
        inferredSkillId: chatResult.skill.id,
        modelId: chatResult.modelId ?? '',
        provider: chatResult.provider ?? '',
        promptTruncated,
        honestyMode: honestyMode ?? '',
        energyPreset: energyPreset ?? '',
      })

      addAdminAiChatRoutingBreadcrumb({
        continuationOnly,
        stickyPersonaApplied,
        promptTruncated,
        stickyDroppedStale,
        stickyInferredAtPresent: stickyInferredAtMs !== null,
        inferredSkillId: chatResult.skill.id,
        skillLocked: Boolean(skillId),
      })

      await updateAiRun({
        runId: runId!,
        status: 'completed',
        response: {
          reply: chatResult.reply,
          chatProvider: chatResult.provider ?? null,
          modelId: chatResult.modelId ?? null,
          providerRequested: provider,
          strictProvider: Boolean(provider),
          inferredSkill: {
            id: chatResult.skill.id,
            name: chatResult.skill.name,
          },
          routing: routingEcho,
          runFingerprint,
          honestyMode: honestyMode ?? null,
          energyPreset: energyPreset ?? null,
          siteKnowledge: siteKnowledgeContext.metadata,
          toolSteps: chatResult.toolSteps,
          applyDiffs: chatResult.applyDiffs,
          memory: chatResult.memory,
        },
      })

      return {
        runId,
        reply: chatResult.reply,
        provider: chatResult.provider ?? null,
        modelId: chatResult.modelId ?? null,
        inferredSkill: {
          id: chatResult.skill.id,
          name: chatResult.skill.name,
          description: chatResult.skill.description,
        },
        routing: routingEcho,
        runFingerprint,
        honestyMode: honestyMode ?? null,
        energyPreset: energyPreset ?? null,
        siteKnowledge: siteKnowledgeContext.metadata,
        toolSteps: chatResult.toolSteps,
        applyDiffs: chatResult.applyDiffs,
        memory: chatResult.memory,
        memoryPatch: chatResult.memoryPatch,
        agent: agentEnabled,
      }
    }

    if (wantStream) {
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        async start(controller) {
          const send = (obj: unknown) => {
            controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`))
          }
          try {
            const chatResult = await runAdminAiAgentTurn({
              ...turnInput,
              onEvent: (event: AdminAiAgentEvent) => send({ type: 'event', event }),
            })
            const payload = await finish(chatResult)
            send({ type: 'done', ...payload })
          } catch (error: unknown) {
            if (runId) {
              await updateAiRun({
                runId,
                status: 'failed',
                errorMessage: getErrorMessage(error),
              }).catch(() => undefined)
            }
            send({ type: 'error', error: getErrorMessage(error) })
          } finally {
            controller.close()
          }
        },
      })
      return new Response(stream, {
        headers: {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      })
    }

    const chatResult = await runAdminAiAgentTurn(turnInput)
    return NextResponse.json(await finish(chatResult))
  } catch (error: unknown) {
    if (runId) {
      await updateAiRun({
        runId,
        status: 'failed',
        errorMessage: getErrorMessage(error),
      })
    }
    try {
      const { emitAiTelemetry } = await import('@/lib/observability/ai-telemetry')
      emitAiTelemetry({
        correlationId: `ai_fail_${Date.now().toString(36)}`,
        kind: 'chat',
        name: 'admin_ai_chat',
        status: 'failed',
        error: getErrorMessage(error),
      })
    } catch {
      /* ignore telemetry failures */
    }
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 })
  }
}
