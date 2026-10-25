/** Live reply text: provider deltas, with tool calls and diff fences held back until they are safe to hide. */

export function takeChatStreamDeltas(buffer: string): { deltas: string[]; rest: string } {
  const lines = buffer.split('\n')
  const rest = lines.pop() ?? ''
  const deltas: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) continue
    const piece = deltaFromChatSse(trimmed.slice(5).trim())
    if (piece) deltas.push(piece)
  }
  return { deltas, rest }
}

export function deltaFromChatSse(data: string): string {
  if (!data || data === '[DONE]') return ''
  try {
    const json = JSON.parse(data) as {
      type?: string
      choices?: Array<{ delta?: { content?: string | null } }>
      delta?: { text?: string }
    }
    const openai = json.choices?.[0]?.delta?.content
    if (typeof openai === 'string' && openai) return openai
    if (json.type === 'content_block_delta' && typeof json.delta?.text === 'string' && json.delta.text) {
      return json.delta.text
    }
  } catch {
    return ''
  }
  return ''
}

export function createReplyDeltaPump(
  emit: (text: string) => void,
  options?: { chars?: number; waitMs?: number },
) {
  const chars = options?.chars ?? 28
  const waitMs = options?.waitMs ?? 36
  let pending = ''
  let timer: ReturnType<typeof setTimeout> | null = null
  const flush = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (!pending) return
    const text = pending
    pending = ''
    emit(text)
  }
  return {
    push(chunk: string) {
      if (!chunk) return
      pending += chunk
      if (pending.length >= chars) flush()
      else if (!timer) timer = setTimeout(flush, waitMs)
    },
    flush,
  }
}

/** Prose the user can read while the model is still writing. Incomplete tool lines stay hidden. */
export function visibleStreamingReply(raw: string): string {
  let text = raw.replace(/```ai-diff\s*[\s\S]*?```/gi, '')
  const fenceAt = text.search(/```ai-diff/i)
  if (fenceAt >= 0) text = text.slice(0, fenceAt)
  const incompleteTail = !text.endsWith('\n')
  const kept = text.split('\n').filter((line, index, lines) => {
    const last = index === lines.length - 1
    if (last && incompleteTail && /\/tool\b/i.test(line)) return false
    if (last && incompleteTail && /^`{1,3}(ai-diff)?$/i.test(line.trim())) return false
    if (/\/tool\s+[a-z0-9_]+/i.test(line)) return false
    return true
  })
  return kept.join('\n').replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n')
}
