import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scratchDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'scratch')

async function loadAgent() {
  try {
    const { Agent } = await import('@cursor/sdk')
    return Agent
  } catch {
    throw new Error('Install the Cursor SDK in mcp/sergik-chat (`npm install`) before using cursor chat.')
  }
}

/**
 * Cursor hands the whole answer to onDelta in one burst. Space it by word so the
 * admin panel paints it the way Anthropic's token stream does.
 */
function paceWords(onDelta) {
  let queue = ''
  let timer = null
  let done = null
  const settle = () => {
    if (done && !queue && !timer) {
      const resolve = done
      done = null
      resolve()
    }
  }
  const tick = () => {
    if (!queue) {
      timer = null
      settle()
      return
    }
    const match = queue.match(/^\s*\S+\s*/)
    const piece = match?.[0] || queue.slice(0, 16)
    queue = queue.slice(piece.length)
    try {
      onDelta(piece)
    } catch {
      /* a slow UI must not stop the reply */
    }
    timer = setTimeout(tick, 28)
  }
  return {
    push(text) {
      if (!text) return
      queue += text
      if (!timer) tick()
    },
    drain() {
      if (!queue && !timer) return Promise.resolve()
      return new Promise((resolve) => {
        done = resolve
      })
    },
  }
}

/** Agent.send text-delta events, paced one word at a time. */
async function streamAgentPrompt(prompt, createOptions, onDelta) {
  const Agent = await loadAgent()
  const agent = await Agent.create(createOptions)
  const pacer = typeof onDelta === 'function' ? paceWords(onDelta) : null
  try {
    const run = await agent.send(prompt, {
      onDelta: ({ update }) => {
        if (update?.type !== 'text-delta' || typeof update.text !== 'string' || !update.text) return
        pacer?.push(update.text)
      },
    })
    const result = await run.wait()
    await pacer?.drain()
    if (result.status !== 'finished') {
      throw new Error(result.error?.message || `Cursor chat ended with status ${result.status}`)
    }
    const text = String(result.result || '').trim()
    if (!text) throw new Error('Cursor chat returned an empty reply')
    return text
  } finally {
    if (typeof agent[Symbol.asyncDispose] === 'function') await agent[Symbol.asyncDispose]()
  }
}

/**
 * One Cursor agent turn on the Cursor plan.
 * The working directory is an empty scratch folder so this chat does not edit the
 * SERGIK repo. SDK sandboxing stays off: this Mac rejects it when ~/.cursor/sandbox.json
 * is present, and built-in shell/read/edit stay disabled. It does not use ANTHROPIC_API_KEY.
 */
export async function completeWithCursor(message, options = {}) {
  const apiKey = process.env.CURSOR_API_KEY?.trim()
  if (!apiKey) {
    throw new Error(
      'Set CURSOR_API_KEY from Cursor Dashboard → Integrations. This route uses your Cursor plan, not the Anthropic API key.',
    )
  }

  await mkdir(scratchDir, { recursive: true })
  const modelId = process.env.SERGIK_CURSOR_MODEL?.trim() || 'auto'
  const brief = String(message || '').trim()
  const prompt = options.brief
    ? brief
    : [
        'You are a text assistant for the SERGIK admin.',
        'Reply to the user message in plain text.',
        'Do not read files, edit files, run commands, or call tools.',
        '',
        brief,
      ].join('\n')
  if (!prompt) throw new Error('Cursor chat received an empty brief')

  const text = await streamAgentPrompt(
    prompt,
    {
      apiKey,
      model: { id: modelId },
      // Text only. Built-in shell, read, and edit tools are what made admin chat stall.
      tools: [],
      local: {
        cwd: scratchDir,
        settingSources: [],
        sandboxOptions: { enabled: false },
      },
    },
    options.onDelta,
  )
  return { text, model: modelId, backend: 'cursor' }
}

/**
 * One Cursor turn with the same admin tools Anthropic calls.
 * Built-in shell, read, and edit stay off. askTool runs each admin tool.
 */
export async function completeWithAdminTools(prompt, options = {}) {
  const apiKey = process.env.CURSOR_API_KEY?.trim()
  if (!apiKey) {
    throw new Error(
      'Set CURSOR_API_KEY from Cursor Dashboard → Integrations. This route uses your Cursor plan, not the Anthropic API key.',
    )
  }
  const ask = options.askTool
  if (typeof ask !== 'function') throw new Error('Cursor admin tools need an askTool callback')

  await mkdir(scratchDir, { recursive: true })
  const modelId = process.env.SERGIK_CURSOR_MODEL?.trim() || 'auto'
  const defs = Array.isArray(options.tools) ? options.tools : []
  let calls = 0
  const customTools = {}
  for (const def of defs) {
    const name = String(def?.name || '').trim()
    if (!name) continue
    customTools[name] = {
      description: String(def.description || name),
      inputSchema: def.inputSchema && typeof def.inputSchema === 'object' ? def.inputSchema : { type: 'object', properties: {} },
      execute: async (args) => {
        calls += 1
        if (calls > 8) return 'Stop calling tools. Answer from the results you already have.'
        const payload = args && typeof args === 'object' ? args : {}
        const result = await ask(name, payload)
        return typeof result === 'string' ? result : JSON.stringify(result ?? {})
      },
    }
  }

  const userPrompt = String(prompt || '').trim() || 'Continue the admin turn.'
  const system = String(options.system || '').trim()
  // The local Cursor CLI rejects --system-prompt. Keep the admin instructions in the user prompt.
  const fullPrompt = system ? `${system}\n\n${userPrompt}` : userPrompt
  const text = await streamAgentPrompt(
    fullPrompt,
    {
      apiKey,
      model: { id: modelId },
      tools: ['mcp'],
      local: {
        cwd: scratchDir,
        settingSources: [],
        sandboxOptions: { enabled: false },
        customTools,
      },
    },
    options.onDelta,
  )
  return { text, model: modelId, backend: 'cursor' }
}
