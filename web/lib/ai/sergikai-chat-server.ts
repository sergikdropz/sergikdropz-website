import {
  ollinProRequestJson,
  resolveOllinProEnv,
  type OllinProJson,
} from '@/lib/ai/ollin-pro-api-client'

function defaultSessionId(): string | undefined {
  return (
    process.env.AIBLETON_MCP_SESSION_ID?.trim() ||
    process.env.OLLIN_PRO_CHAT_SESSION_ID?.trim() ||
    undefined
  )
}

export async function resolveSergikaiSessionId(sessionId?: string): Promise<string> {
  const sid = sessionId?.trim() || defaultSessionId()
  if (sid) return sid

  const created = await ollinProRequestJson('POST', '/api/sessions', {
    query: { name: 'SERGIK Admin AI' },
    timeoutMs: 15_000,
  })
  if (!created.ok) {
    throw new Error(created.error || 'Could not create OlliN Pro chat session')
  }
  const newId = String(created.data?.id || '').trim()
  if (!newId) throw new Error('Session create returned no id')
  return newId
}

function extractAssistantReply(payload: OllinProJson | undefined): string {
  if (!payload) return ''
  const direct = payload.content ?? payload.message ?? payload.reply
  if (typeof direct === 'string' && direct.trim()) return direct.trim()
  const choices = payload.choices
  if (Array.isArray(choices) && choices[0] && typeof choices[0] === 'object') {
    const msg = (choices[0] as OllinProJson).message
    if (msg && typeof msg === 'object' && typeof (msg as OllinProJson).content === 'string') {
      return String((msg as OllinProJson).content).trim()
    }
  }
  return ''
}

async function pollOllinJob(jobId: string, deadlineMs = 90_000): Promise<OllinProJson> {
  const started = Date.now()
  let last: OllinProJson = { job_id: jobId }
  while (Date.now() - started < deadlineMs) {
    await new Promise((r) => setTimeout(r, 1500))
    const job = await ollinProRequestJson('GET', `/api/jobs/${encodeURIComponent(jobId)}`, {
      timeoutMs: 20_000,
    })
    if (!job.ok) continue
    last = job.data ?? last
    const status = String(last.status || last.state || '').toLowerCase()
    if (['completed', 'succeeded', 'success', 'failed', 'error', 'cancelled'].includes(status)) {
      return last
    }
  }
  return { ...last, pollTimedOut: true }
}

export type SergikaiChatParams = {
  content: string
  sessionId?: string
  threadId?: string
  waitForJob?: boolean
  dryRun?: boolean
}

export async function runSergikaiChat(params: SergikaiChatParams) {
  const content = params.content.trim()
  if (!content) throw new Error('content is required for SergikAI chat')

  const ollinEnv = resolveOllinProEnv()
  const sessionId =
    params.sessionId?.trim() ||
    defaultSessionId() ||
    (params.dryRun ? '(create on approve)' : await resolveSergikaiSessionId())

  if (params.dryRun) {
    return {
      dryRun: true,
      ollinEnv,
      sessionId,
      wouldSend: {
        content: content.slice(0, 4000),
        metadata: { source: 'sergik_web_admin_ai', ollin_pro_dev_mode: true },
        thread_id: params.threadId || null,
      },
      hint: 'Approve to POST /api/sessions/{id}/messages — SergikAI may run OlliN tools server-side.',
    }
  }

  const body: OllinProJson = {
    content,
    metadata: { source: 'sergik_web_admin_ai', ollin_pro_dev_mode: true },
  }
  if (params.threadId?.trim()) body.thread_id = params.threadId.trim()

  const sent = await ollinProRequestJson('POST', `/api/sessions/${encodeURIComponent(sessionId)}/messages`, {
    body,
    timeoutMs: 120_000,
  })

  if (!sent.ok) {
    return {
      dryRun: false,
      ollinEnv,
      sessionId,
      error: sent.error || 'Chat send failed',
      apiPath: sent.path,
      payload: sent.data,
    }
  }

  const data = sent.data ?? {}
  const jobId = String(data.job_id || '').trim()
  const state = String(data.state || data.status || '').toLowerCase()

  if (params.waitForJob !== false && jobId && state === 'queued') {
    const job = await pollOllinJob(jobId)
    const history = await ollinProRequestJson(
      'GET',
      `/api/sessions/${encodeURIComponent(sessionId)}/messages`,
      { query: { limit: 12, thread_id: params.threadId }, timeoutMs: 20_000 },
    )
    const replyFromHistory = extractReplyFromHistory(history.data)
    return {
      dryRun: false,
      ollinEnv,
      sessionId,
      queued: true,
      jobId,
      job,
      reply: replyFromHistory || extractAssistantReply(job),
      messages: history.ok ? history.data : null,
    }
  }

  return {
    dryRun: false,
    ollinEnv,
    sessionId,
    reply: extractAssistantReply(data),
    raw: data,
  }
}

function extractReplyFromHistory(data: OllinProJson | undefined): string {
  if (!data) return ''
  const messages = data.messages ?? data.items
  if (!Array.isArray(messages)) return ''
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const row = messages[i]
    if (!row || typeof row !== 'object') continue
    const role = String((row as OllinProJson).role || '').toLowerCase()
    if (role !== 'assistant') continue
    const text = extractAssistantReply(row as OllinProJson)
    if (text) return text
  }
  return ''
}
