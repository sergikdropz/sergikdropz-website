import { generateAdminChatReply } from '@/lib/ai/admin-chat-providers'

const MAX_JSON_CHARS = 28_000

function truncateJson(raw: string): string {
  if (raw.length <= MAX_JSON_CHARS) return raw
  return `${raw.slice(0, MAX_JSON_CHARS)}\n\n… [truncated ${raw.length - MAX_JSON_CHARS} chars for LLM context]`
}

const POLISH_TIMEOUT_MS = 30_000

export type StrategyPolishResult =
  | { ok: true; markdown: string; provider: string | null; modelId?: string }
  | { ok: false; reason: string }

function polishReason(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Strategy polish failed.'
  const text = message.replace(/\s+/g, ' ').trim()
  return text.slice(0, 180) || 'Strategy polish failed.'
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Strategy polish timed out. Scaffold kept.')), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

/**
 * Optional polish pass: converts deterministic pack JSON into an editorial markdown brief.
 * Runs server-side only when a preview explicitly asks for it.
 */
export async function refineProductStrategyPackMarkdown(params: {
  pack: Record<string, unknown>
}): Promise<StrategyPolishResult> {
  let rawJson: string
  try {
    rawJson = JSON.stringify(params.pack)
  } catch {
    return { ok: false, reason: 'The scaffold could not be sent to the model.' }
  }

  const packJson = truncateJson(rawJson)

  const userMessage = [
    'Convert the following deterministic **strategy pack JSON** into a concise markdown brief for the artist/DJ team.',
    '',
    'Rules:',
    '- Lead with **Goals** (1–2 lines) and **Top 5 actions this week** (numbered).',
    '- Mirror remaining sections: Site audit mindset, Conversion, SEO, Campaign timing, Admin snippets — only using facts implied by the JSON.',
    '- Do **not** invent analytics, audience sizes, or revenue; say how to verify metrics instead.',
    '- Respect audio UX: never recommend autoplay.',
    '- Keep under ~900 words; use ### headings and bullet lists.',
    '',
    'JSON:',
    '```json',
    packJson,
    '```',
  ].join('\n')

  try {
    const reply = await withTimeout(
      generateAdminChatReply(userMessage, {
        skillId: 'product_strategy',
        autoRouterMode: 'smart',
      }),
      POLISH_TIMEOUT_MS,
    )
    const markdown = reply.reply?.trim() ?? ''
    if (markdown.length < 40) {
      return { ok: false, reason: 'The model returned a brief that was too short to use. Scaffold kept.' }
    }
    return {
      ok: true,
      markdown,
      provider: reply.provider,
      modelId: reply.modelId,
    }
  } catch (error: unknown) {
    return { ok: false, reason: polishReason(error) }
  }
}
