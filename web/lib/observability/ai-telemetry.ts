import { redactSecrets } from '@/lib/ai/provider-runtime'

export type AiTelemetryEvent = {
  correlationId: string
  actorId?: string | null
  kind: 'chat' | 'tool' | 'job' | 'provider'
  name: string
  status: 'started' | 'completed' | 'failed'
  durationMs?: number
  model?: string | null
  provider?: string | null
  promptChars?: number
  completionChars?: number
  knowledgeHash?: string | null
  approvalRequired?: boolean
  approved?: boolean
  error?: string | null
  meta?: Record<string, unknown>
}

function newCorrelationId(): string {
  return `ai_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Structured, redacted AI/job telemetry for logs and future metrics backends.
 * Never logs raw secrets or full prompts.
 */
export function emitAiTelemetry(event: AiTelemetryEvent) {
  const payload = {
    ...event,
    error: event.error ? redactSecrets(event.error).slice(0, 500) : null,
    ts: new Date().toISOString(),
  }

  if (event.status === 'failed') {
    console.error('[ai-telemetry]', JSON.stringify(payload))
  } else {
    console.info('[ai-telemetry]', JSON.stringify(payload))
  }
}

export function startAiTelemetry(partial: Omit<AiTelemetryEvent, 'status' | 'correlationId'> & {
  correlationId?: string
}) {
  const correlationId = partial.correlationId || newCorrelationId()
  const startedAt = Date.now()
  emitAiTelemetry({ ...partial, correlationId, status: 'started' })

  return {
    correlationId,
    complete(extra?: Partial<AiTelemetryEvent>) {
      emitAiTelemetry({
        ...partial,
        ...extra,
        correlationId,
        status: 'completed',
        durationMs: Date.now() - startedAt,
      })
    },
    fail(error: unknown, extra?: Partial<AiTelemetryEvent>) {
      emitAiTelemetry({
        ...partial,
        ...extra,
        correlationId,
        status: 'failed',
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      })
    },
  }
}
