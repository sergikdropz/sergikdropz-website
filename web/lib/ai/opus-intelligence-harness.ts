import Anthropic from '@anthropic-ai/sdk'
import { localAuditReplyFailed, localGroundingTranscript } from '@/lib/ai/ollama-admin-grounding'

/** Admin chat already completed turns on this id. Override with ANTHROPIC_HARNESS_MODEL. */
export const DEFAULT_OPUS_HARNESS_MODEL = 'claude-opus-5-5'

export function opusHarnessModelId(): string {
  return process.env.ANTHROPIC_HARNESS_MODEL?.trim() || DEFAULT_OPUS_HARNESS_MODEL
}

export function opusHarnessSystemPrompt(): string {
  return [
    'You are the SERGIK intelligence harness. SergikAI will show your reply as the audit.',
    'Use only the polymath desk, the admin provider probe, and the OlliN harness in the user message.',
    'Do not invent analytics, guests, cities, charts, BPM, drum patterns, or harness rows.',
    'If a line says offline, missing, or not configured, keep that in Offline.',
    'No autoplay. One primary call to action.',
    'The first line is ## Verdict. Do not apologize.',
    '## Verdict',
    'One sentence.',
    '## Evidence',
    'Bullets copied from the probes.',
    '## Three moves',
    'Three numbered lines.',
    '## Offline',
    'What the probes could not read. Omit this section when nothing is offline.',
  ].join('\n')
}

export function opusHarnessUserMessage(input: {
  message: string
  adminAi: string
  harness: string
  activeSkillId?: string | null
}): string {
  const ask = input.message.replace(/\s+/g, ' ').trim().slice(0, 500)
  return [`Ask: ${ask || 'Audit this turn.'}`, localGroundingTranscript(input.adminAi, input.harness, input.activeSkillId)].join(
    '\n\n',
  )
}

export async function runOpusIntelligenceHarness(input: {
  message: string
  adminAi: string
  harness: string
  activeSkillId?: string | null
}): Promise<{ ok: boolean; brief: string; model: string; error?: string }> {
  const model = opusHarnessModelId()
  const key = process.env.ANTHROPIC_API_KEY?.trim()
  if (!key) {
    return { ok: false, brief: '', model, error: 'ANTHROPIC_API_KEY is not set' }
  }
  try {
    const anthropic = new Anthropic({ apiKey: key, maxRetries: 0, timeout: 90_000 })
    const response = await anthropic.messages.create({
      model,
      max_tokens: 900,
      system: opusHarnessSystemPrompt(),
      messages: [{ role: 'user', content: opusHarnessUserMessage(input) }],
    })
    const brief = response.content
      .filter((part) => part.type === 'text')
      .map((part) => part.text.trim())
      .filter(Boolean)
      .join('\n\n')
      .trim()
    if (!brief || localAuditReplyFailed(brief)) {
      return { ok: false, brief, model, error: 'Opus did not return an audit.' }
    }
    return { ok: true, brief, model }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Opus intelligence harness failed.'
    return { ok: false, brief: '', model, error }
  }
}
