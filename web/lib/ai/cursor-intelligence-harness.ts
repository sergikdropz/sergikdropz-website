import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { localAuditReplyFailed } from '@/lib/ai/ollama-admin-grounding'
import { opusHarnessSystemPrompt, opusHarnessUserMessage } from '@/lib/ai/opus-intelligence-harness'

const MISSING_KEY =
  'Set CURSOR_API_KEY from Cursor Dashboard → Integrations. This uses your Cursor plan, not Anthropic API credits.'

export function cursorBriefScriptPath(): string {
  const candidates = [
    path.resolve(process.cwd(), '../mcp/sergik-chat/brief.mjs'),
    path.resolve(process.cwd(), 'mcp/sergik-chat/brief.mjs'),
  ]
  return candidates.find((candidate) => existsSync(candidate)) || candidates[0]
}

export function cursorHarnessPrompt(input: {
  message: string
  adminAi: string
  harness: string
  activeSkillId?: string | null
}): string {
  return [opusHarnessSystemPrompt(), opusHarnessUserMessage(input)].join('\n\n')
}

function runBriefProcess(script: string, prompt: string, timeoutMs: number, model?: string | null): Promise<string> {
  const env = { ...process.env }
  const picked = model?.trim()
  if (picked) env.SERGIK_CURSOR_MODEL = picked
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      cwd: path.dirname(script),
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const out: Buffer[] = []
    const err: Buffer[] = []
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error('Cursor chat timed out'))
    }, timeoutMs)
    child.stdout.on('data', (chunk) => out.push(chunk))
    child.stderr.on('data', (chunk) => err.push(chunk))
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', () => {
      clearTimeout(timer)
      const text = Buffer.concat(out).toString('utf8').trim()
      if (text) {
        resolve(text)
        return
      }
      const detail = Buffer.concat(err).toString('utf8').trim()
      reject(new Error(detail || 'Cursor intelligence harness returned no reply'))
    })
    child.stdin.end(prompt)
  })
}

export const CURSOR_STATIC_MODELS = ['auto', 'composer-2.5']

/** Text-only Cursor turn that forwards word-sized deltas while the model writes. */
function runCursorTextStream(input: {
  prompt: string
  model: string
  onDelta: (text: string) => void
  timeoutMs?: number
}): Promise<{ ok: boolean; text: string; model: string; error?: string; streamed?: boolean }> {
  const script = cursorBriefScriptPath()
  const timeoutMs = input.timeoutMs ?? 75_000
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], {
      cwd: path.dirname(script),
      env: { ...process.env, SERGIK_CURSOR_TEXT_STREAM: '1', SERGIK_CURSOR_MODEL: input.model },
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
    })
    const rpc = child.stdio[3]
    if (!rpc || !('on' in rpc)) {
      child.kill('SIGTERM')
      resolve({ ok: false, text: '', model: input.model, error: 'Cursor text stream did not open.' })
      return
    }
    let settled = false
    let streamed = false
    const finish = (result: { ok: boolean; text: string; model: string; error?: string; streamed?: boolean }) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
      if (child.pid) {
        try {
          process.kill(-child.pid, 'SIGTERM')
        } catch {
          child.kill('SIGTERM')
        }
      }
    }
    const timer = setTimeout(() => finish({ ok: false, text: '', model: input.model, error: 'Cursor chat timed out' }), timeoutMs)
    const rl = readline.createInterface({ input: rpc as NodeJS.ReadableStream })
    rl.on('line', (line) => {
      let msg: { type?: string; text?: string; model?: string; error?: string }
      try {
        msg = JSON.parse(line) as typeof msg
      } catch {
        return
      }
      if (msg.type === 'delta' && msg.text) {
        streamed = true
        try {
          input.onDelta(msg.text)
        } catch {
          /* a slow UI must not stop the reply */
        }
        return
      }
      if (msg.type === 'done') {
        finish({ ok: true, text: (msg.text || '').trim(), model: msg.model || input.model, streamed })
        return
      }
      if (msg.type === 'error') {
        finish({ ok: false, text: '', model: input.model, error: msg.error || 'Cursor chat failed' })
      }
    })
    child.on('error', (error) => finish({ ok: false, text: '', model: input.model, error: error.message }))
    child.on('close', () => {
      if (!settled) finish({ ok: false, text: '', model: input.model, error: 'Cursor chat ended before a reply' })
    })
    child.stdin.end(input.prompt)
  })
}

/** Raw Cursor plan completion. Does not use ANTHROPIC_API_KEY. */
export async function runCursorPrompt(input: {
  prompt: string
  model?: string | null
  onDelta?: (text: string) => void
}): Promise<{ ok: boolean; text: string; model: string; error?: string; streamed?: boolean }> {
  const model = input.model?.trim() || process.env.SERGIK_CURSOR_MODEL?.trim() || 'auto'
  if (!process.env.CURSOR_API_KEY?.trim()) {
    return { ok: false, text: '', model, error: MISSING_KEY }
  }
  const script = cursorBriefScriptPath()
  if (!existsSync(script)) {
    return { ok: false, text: '', model, error: 'Cursor brief bridge is missing (mcp/sergik-chat/brief.mjs).' }
  }
  if (input.onDelta) {
    return runCursorTextStream({ prompt: input.prompt, model, onDelta: input.onDelta })
  }
  try {
    const raw = await runBriefProcess(script, input.prompt, 75_000, model)
    const parsed = JSON.parse(raw) as { text?: string; model?: string; error?: string }
    if (parsed.error) return { ok: false, text: '', model: parsed.model || model, error: parsed.error }
    const text = (parsed.text || '').trim()
    if (!text) return { ok: false, text: '', model: parsed.model || model, error: 'Cursor returned an empty reply.' }
    return { ok: true, text, model: parsed.model || model }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Cursor chat failed.'
    return { ok: false, text: '', model, error }
  }
}

export async function listCursorModelIds(): Promise<{ ids: string[]; message?: string }> {
  const fallback = CURSOR_STATIC_MODELS
  if (!process.env.CURSOR_API_KEY?.trim()) {
    return { ids: fallback, message: 'Set CURSOR_API_KEY in web/.env.local — showing Cursor defaults.' }
  }
  const script = path.join(path.dirname(cursorBriefScriptPath()), 'models.mjs')
  if (!existsSync(script)) return { ids: fallback, message: 'Cursor model list bridge is missing.' }
  try {
    const raw = await runBriefProcess(script, '', 12_000)
    const parsed = JSON.parse(raw) as { ids?: string[]; error?: string }
    const ids = Array.isArray(parsed.ids) ? parsed.ids.map((id) => id.trim()).filter(Boolean) : []
    if (!ids.length) return { ids: fallback, message: parsed.error || 'Cursor returned no models.' }
    return { ids: ['auto', ...ids.filter((id) => id !== 'auto')] }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Cursor model list failed.'
    return { ids: fallback, message }
  }
}

/** Cursor plan agent writes the audit SergikAI shows. Does not use ANTHROPIC_API_KEY. */
export async function runCursorIntelligenceHarness(input: {
  message: string
  adminAi: string
  harness: string
  activeSkillId?: string | null
  model?: string | null
}): Promise<{ ok: boolean; brief: string; model: string; error?: string }> {
  const result = await runCursorPrompt({ prompt: cursorHarnessPrompt(input), model: input.model })
  if (!result.ok) return { ok: false, brief: result.text, model: result.model, error: result.error }
  if (localAuditReplyFailed(result.text)) {
    return { ok: false, brief: result.text, model: result.model, error: 'Cursor did not return an audit.' }
  }
  return { ok: true, brief: result.text, model: result.model }
}

export type CursorAdminToolSpec = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

/** One Cursor session that calls the admin tools through the parent process. */
export async function runCursorAdminTurn(input: {
  prompt: string
  system?: string
  model?: string | null
  tools: CursorAdminToolSpec[]
  onTool: (name: string, args: Record<string, unknown>) => Promise<string>
  onDelta?: (text: string) => void
  timeoutMs?: number
}): Promise<{ ok: boolean; text: string; model: string; error?: string; streamed?: boolean }> {
  const model = input.model?.trim() || process.env.SERGIK_CURSOR_MODEL?.trim() || 'auto'
  if (!process.env.CURSOR_API_KEY?.trim()) {
    return { ok: false, text: '', model, error: MISSING_KEY }
  }
  const script = cursorBriefScriptPath()
  if (!existsSync(script)) {
    return { ok: false, text: '', model, error: 'Cursor brief bridge is missing (mcp/sergik-chat/brief.mjs).' }
  }
  const idleMs = input.timeoutMs ?? 90_000
  const hardMs = input.timeoutMs ?? 170_000
  const started = Date.now()
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], {
      cwd: path.dirname(script),
      env: { ...process.env, SERGIK_CURSOR_ADMIN_TOOLS: '1', SERGIK_CURSOR_MODEL: model },
    detached: true,
      stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
    })
    const rpc = child.stdio[3]
    if (!rpc || !('on' in rpc)) {
      child.kill('SIGTERM')
      resolve({ ok: false, text: '', model, error: 'Cursor admin tool channel did not open.' })
      return
    }
    let settled = false
    let streamed = false
    const finish = (result: { ok: boolean; text: string; model: string; error?: string; streamed?: boolean }) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
      if (child.pid) {
        try {
          process.kill(-child.pid, 'SIGTERM')
        } catch {
          child.kill('SIGTERM')
        }
      }
    }
    let timer = setTimeout(() => finish({ ok: false, text: '', model, error: 'Cursor chat timed out' }), idleMs)
    const bump = () => {
      clearTimeout(timer)
      const left = hardMs - (Date.now() - started)
      if (left <= 0) {
        finish({ ok: false, text: '', model, error: 'Cursor chat timed out' })
        return
      }
      timer = setTimeout(() => finish({ ok: false, text: '', model, error: 'Cursor chat timed out' }), Math.min(idleMs, left))
    }
    const rl = readline.createInterface({ input: rpc as NodeJS.ReadableStream })
    rl.on('line', (line) => {
      bump()
      let msg: { type?: string; id?: string; name?: string; arguments?: Record<string, unknown>; text?: string; model?: string; error?: string }
      try {
        msg = JSON.parse(line) as typeof msg
      } catch {
        return
      }
      if (msg.type === 'delta' && msg.text) {
        streamed = true
        try {
          input.onDelta?.(msg.text)
        } catch {
          /* a slow UI must not stop the reply */
        }
        return
      }
      if (msg.type === 'tool' && msg.id && msg.name) {
        void input
          .onTool(msg.name, msg.arguments && typeof msg.arguments === 'object' ? msg.arguments : {})
          .then((content) => {
            child.stdin.write(`${JSON.stringify({ type: 'result', id: msg.id, content })}\n`)
          })
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : 'tool failed'
            child.stdin.write(`${JSON.stringify({ type: 'result', id: msg.id, content: JSON.stringify({ error: message }) })}\n`)
          })
        return
      }
      if (msg.type === 'done') {
        finish({ ok: true, text: (msg.text || '').trim(), model: msg.model || model, streamed })
        return
      }
      if (msg.type === 'error') {
        finish({ ok: false, text: '', model, error: msg.error || 'Cursor chat failed' })
      }
    })
    child.on('error', (error) => finish({ ok: false, text: '', model, error: error.message }))
    child.on('close', () => {
      if (!settled) finish({ ok: false, text: '', model, error: 'Cursor chat ended before a reply' })
    })
    child.stdin.write(
      `${JSON.stringify({ type: 'start', prompt: input.prompt, system: input.system || '', tools: input.tools })}\n`,
    )
  })
}
