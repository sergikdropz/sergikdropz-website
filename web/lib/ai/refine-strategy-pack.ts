import { generateAdminChatReply } from '@/lib/ai/admin-chat-providers'

const MAX_JSON_CHARS = 28_000

function truncateJson(raw: string): string {
  if (raw.length <= MAX_JSON_CHARS) return raw
  return `${raw.slice(0, MAX_JSON_CHARS)}\n\n… [truncated ${raw.length - MAX_JSON_CHARS} chars for LLM context]`
}

/**
 * Optional polish pass: converts deterministic pack JSON into an editorial markdown brief.
 * Runs server-side only when explicitly requested (e.g. preview + refineWithLlm).
 */
export async function refineProductStrategyPackMarkdown(params: {
  pack: Record<string, unknown>
}): Promise<{ markdown: string; provider: string | null; modelId?: string } | null> {
  let rawJson: string
  try {
    rawJson = JSON.stringify(params.pack)
  } catch {
    return null
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
    const reply = await generateAdminChatReply(userMessage, {
      skillId: 'product_strategy',
      autoRouterMode: 'smart',
    })
    const markdown = reply.reply?.trim()
    if (!markdown) return null
    return {
      markdown,
      provider: reply.provider,
      modelId: reply.modelId,
    }
  } catch {
    return null
  }
}
