import readline from 'node:readline'
import { writeSync } from 'node:fs'
import { completeWithAdminTools, completeWithCursor } from './cursor.mjs'

function writeRpc(payload) {
  writeSync(3, `${JSON.stringify(payload)}\n`)
}

if (process.env.SERGIK_CURSOR_ADMIN_TOOLS === '1') {
  const pending = new Map()
  let startMsg = null
  const startWaiters = []
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
  rl.on('line', (line) => {
    let msg
    try {
      msg = JSON.parse(line)
    } catch {
      return
    }
    if (msg?.type === 'start' && !startMsg) {
      startMsg = msg
      const waiter = startWaiters.shift()
      if (waiter) waiter(msg)
      return
    }
    if (msg?.type === 'result' && pending.has(msg.id)) {
      const resolve = pending.get(msg.id)
      pending.delete(msg.id)
      resolve(String(msg.content ?? ''))
    }
  })
  const start = await new Promise((resolve) => {
    if (startMsg) resolve(startMsg)
    else startWaiters.push(resolve)
  })
  let seq = 0
  try {
    const result = await completeWithAdminTools(start.prompt, {
      system: start.system,
      tools: start.tools,
      onDelta: (text) => writeRpc({ type: 'delta', text }),
      askTool: (name, args) =>
        new Promise((resolve) => {
          const id = `t${(seq += 1)}`
          pending.set(id, resolve)
          writeRpc({ type: 'tool', id, name, arguments: args })
        }),
    })
    writeRpc({ type: 'done', text: result.text, model: result.model })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Cursor chat failed'
    writeRpc({ type: 'error', error: detail })
    process.exitCode = 1
  }
} else if (process.env.SERGIK_CURSOR_TEXT_STREAM === '1') {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  const message = Buffer.concat(chunks).toString('utf8')
  try {
    const result = await completeWithCursor(message, {
      brief: true,
      onDelta: (text) => writeRpc({ type: 'delta', text }),
    })
    writeRpc({ type: 'done', text: result.text, model: result.model })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Cursor chat failed'
    writeRpc({ type: 'error', error: detail })
    process.exitCode = 1
  }
} else {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  const message = Buffer.concat(chunks).toString('utf8')
  try {
    const result = await completeWithCursor(message, { brief: true })
    process.stdout.write(JSON.stringify({ text: result.text, model: result.model }))
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Cursor chat failed'
    process.stdout.write(JSON.stringify({ error: detail }))
    process.exitCode = 1
  }
}
