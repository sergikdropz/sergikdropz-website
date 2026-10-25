import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { completeWithCursor } from './cursor.mjs'
import { completeWithOllama } from './local.mjs'
import { ollamaBaseUrl, pickBackend } from './router.mjs'

const server = new McpServer({
  name: 'sergik-chat',
  version: '0.1.0',
})

function textResult(text, isError = false) {
  return { content: [{ type: 'text', text }], isError }
}

server.registerTool(
  'chat',
  {
    title: 'Local Sergik chat',
    description:
      'Answer with the local Ollama model (sergikai:latest). Spends no Anthropic API credits and no Cursor usage. Use this for everyday admin chat.',
    inputSchema: {
      message: z.string().describe('The user message to answer'),
      model: z.string().optional().describe('Ollama tag. Default sergikai:latest'),
    },
  },
  async ({ message, model }) => {
    try {
      const reply = await completeWithOllama(message, model)
      return textResult(reply.text)
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Local chat failed'
      return textResult(detail, true)
    }
  },
)

server.registerTool(
  'cursor_chat',
  {
    title: 'Cursor plan chat',
    description:
      'Answer with a Cursor agent on the Cursor plan (model SERGIK_CURSOR_MODEL, default auto). Does not use ANTHROPIC_API_KEY or a Claude Pro login. Runs in an empty scratch folder with the sandbox on. Slower and draws Cursor usage, so prefer chat unless you need this model.',
    inputSchema: {
      message: z.string().describe('The user message to answer'),
    },
  },
  async ({ message }) => {
    try {
      const reply = await completeWithCursor(message)
      return textResult(reply.text)
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Cursor chat failed'
      return textResult(detail, true)
    }
  },
)

server.registerTool(
  'chat_status',
  {
    title: 'Chat backend status',
    description: 'Report whether the local model is reachable and whether a Cursor API key is set. Never returns secrets.',
    inputSchema: {},
  },
  async () => {
    const base = ollamaBaseUrl()
    let ollama = 'down'
    try {
      const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(4000) })
      ollama = res.ok ? 'up' : `HTTP ${res.status}`
    } catch {
      ollama = 'down'
    }
    const cursorKey = process.env.CURSOR_API_KEY?.trim() ? 'set' : 'missing'
    const lines = [
      `local ollama: ${ollama} (${base})`,
      `default model: ${process.env.OLLAMA_MODEL?.trim() || 'sergikai:latest'}`,
      `cursor plan key: ${cursorKey}`,
      `cursor model: ${process.env.SERGIK_CURSOR_MODEL?.trim() || 'auto'}`,
      `route for "claude": ${pickBackend('claude')}`,
    ]
    return textResult(lines.join('\n'))
  },
)

const transport = new StdioServerTransport()
await server.connect(transport)
