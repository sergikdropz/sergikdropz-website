import { isCrowelogicConfigured } from '@/lib/ai/crowelogic-env'
import { OLLAMA_ADMIN_BASE_MODEL } from '@/lib/ai/ollama-defaults'
import { runIntelligenceHarness } from '@/lib/ai/intelligence-harness-server'
import { formatPolymathAdminDesk } from '@/lib/ai/polymath-admin-desk'

/** Probe-pack helper. Admin chat does not use this to switch the turn to Anthropic or OlliN. */
export function shouldGroundLocalAdmin(provider?: string | null): boolean {
  const requested = (provider || '').trim().toLowerCase()
  if (
    requested === 'anthropic' ||
    requested === 'openai' ||
    requested === 'crowelogic' ||
    requested === 'cursor'
  ) {
    return false
  }
  if (requested === 'ollama') return true
  return (process.env.ADMIN_AI_CHAT_PROVIDER || '').trim().toLowerCase() === 'ollama'
}

export function formatAdminAiProbe(): string {
  const line = (name: string, on: boolean) => `${name}: ${on ? 'configured' : 'missing'}`
  const adminModel = process.env.OLLAMA_ADMIN_MODEL?.trim() || OLLAMA_ADMIN_BASE_MODEL
  return [
    line('anthropic', Boolean(process.env.ANTHROPIC_API_KEY?.trim())),
    line('openai', Boolean(process.env.OPENAI_API_KEY?.trim())),
    `ollama: admin chat uses ${adminModel} when that tag is installed`,
    line('crowelogic', isCrowelogicConfigured()),
    `ADMIN_AI_CHAT_PROVIDER: ${process.env.ADMIN_AI_CHAT_PROVIDER?.trim() || 'unset'}`,
    'This probe does not know API credit balances.',
  ].join('\n')
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  return null
}

function clipLine(text: string, max: number): string {
  const value = text.replace(/\s+/g, ' ').trim()
  if (!value) return ''
  if (value.length <= max) return value
  return `${value.slice(0, max - 1).trimEnd()}…`
}

function probeMatchRecord(output: Record<string, unknown>): Record<string, unknown> | null {
  const direct = asRecord(output.matches)
  if (direct) return direct
  const ollin = asRecord(output.ollin)
  const probe = asRecord(ollin?.probe)
  const data = asRecord(probe?.data)
  return asRecord(data?.matches)
}

function harnessMatchLines(matches: Record<string, unknown> | null): string[] {
  if (!matches) return []
  const lines: string[] = []
  const skills = Array.isArray(matches.skills) ? matches.skills : []
  for (const row of skills.slice(0, 4)) {
    const rec = asRecord(row)
    if (!rec) continue
    const name = String(rec.name || rec.id || '').trim()
    const summary = clipLine(String(rec.summary || ''), 140)
    if (name) lines.push(`Skill: ${name}${summary ? ` — ${summary}` : ''}`)
  }
  const knowledge = Array.isArray(matches.knowledge) ? matches.knowledge : []
  for (const row of knowledge.slice(0, 3)) {
    const rec = asRecord(row)
    if (!rec) continue
    const meta = asRecord(rec.metadata)
    const title = String(meta?.heading || meta?.section || meta?.topic_id || '').trim()
    const text = clipLine(String(rec.text || ''), 160)
    if (text) lines.push(`Knowledge${title ? ` (${title})` : ''}: ${text}`)
  }
  const truth = Array.isArray(matches.product_truth) ? matches.product_truth : []
  for (const row of truth.slice(0, 2)) {
    const rec = asRecord(row)
    if (!rec) continue
    const heading = String(rec.heading || '').trim()
    const text = clipLine(String(rec.text || ''), 140)
    if (heading || text) lines.push(`Product truth${heading ? `: ${heading}` : ''}${text ? ` — ${text}` : ''}`)
  }
  return lines
}

export function formatHarnessProbe(output: Record<string, unknown>): string {
  const lines: string[] = []
  const connectivity = output.connectivity as { summary?: string } | undefined
  lines.push(connectivity?.summary?.trim() || 'Harness returned no connectivity line.')
  const dna = output.sonicDna as
    | { note?: string; unifiedIntelligenceTracks?: number; trackCount?: number }
    | null
    | undefined
  if (dna && typeof dna === 'object') {
    const unified = dna.unifiedIntelligenceTracks ?? 0
    const total = dna.trackCount ?? 0
    lines.push(`Sonic DNA unified ${unified}/${total}. ${dna.note || ''}`.trim())
  }
  const ollin = asRecord(output.ollin)
  const probe = asRecord(ollin?.probe)
  if (probe && probe.ok === false) {
    lines.push(`Harness probe offline: ${String(probe.error || 'failed')}`)
  }
  lines.push(...harnessMatchLines(probeMatchRecord(output)))
  return lines.join('\n').slice(0, 3_200)
}

/** True when OlliN or the harness probe itself failed. Crowe "key missing" is not an outage. */
export function harnessProbeIsOffline(text: string): boolean {
  return /OlliN Pro API offline|Harness probe failed|Harness probe offline|unreachable/i.test(text)
}

export function compactOllamaAdminSystem(input: {
  skillName: string
  pageContext?: string | null
}): string {
  const page = input.pageContext?.trim() || ''
  const clipped = page.length > 4_000 ? `${page.slice(0, 4_000)}\n…` : page
  return [
    'You are the SERGIK admin writer for this turn. Ignore any Ableton Live, canvas, or DJ-software instructions.',
    'The first line of the reply is ## Verdict. Do not apologize. Do not say "let\'s focus". Do not offer to create a track, hype, or clip.',
    'You do not call tools. The server already ran the polymath desk, every Admin AI skill, and the Sergik unified intelligence harness. Those results are in the conversation.',
    'The polymath specialists quote measured Sonic DNA. Every Admin AI desk is listed. Use a desk only when its evidence is in the probes or LIVE CONTEXT.',
    'Use only the probes, LIVE CONTEXT, and the user message. If a value is missing, write "not in context". If a probe says offline, say offline. Do not invent analytics, guests, cities, charts, or harness rows.',
    'No autoplay. One primary call to action.',
    `Persona: ${input.skillName}.`,
    'Reply in this shape:',
    '## Verdict',
    'One sentence.',
    '## Evidence',
    'Bullets taken from the probes or live context.',
    '## Three moves',
    'Three numbered lines, one sentence each.',
    '## Offline',
    'What the probes could not read. Omit this section when nothing is offline.',
    clipped ? `LIVE CONTEXT\n${clipped}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

export async function collectLocalAdminGrounding(input: {
  message: string
  releaseId?: string | null
}): Promise<{ adminAi: string; harness: string }> {
  const adminAi = formatAdminAiProbe()
  try {
    const output = await runIntelligenceHarness({
      mode: 'stack',
      query: `SERGIK polymath admin ${input.message}`.slice(0, 400),
      releaseId: input.releaseId?.trim() || undefined,
      limit: 4,
    })
    return { adminAi, harness: formatHarnessProbe(output as unknown as Record<string, unknown>) }
  } catch (err) {
    const harness = err instanceof Error ? err.message : 'Harness probe failed.'
    return { adminAi, harness }
  }
}

/** The small model sometimes continues an old apology instead of writing the audit. */
export function localAuditReplyFailed(text: string): boolean {
  const value = text.trim()
  if (!value) return true
  if (/apologize|i'm sorry|i am sorry|let's focus|lets focus|let us focus|creating a hype/i.test(value)) return true
  if (/No LLM provider is available|Provider errors:/i.test(value)) return true
  if (!/^##\s+Verdict\b/m.test(value)) return true
  return false
}

export function composeLocalAuditReply(input: {
  message: string
  adminAi: string
  harness: string
}): string {
  const harnessLines = input.harness.split('\n').map((line) => line.trim()).filter(Boolean)
  const adminLines = input.adminAi.split('\n').map((line) => line.trim()).filter(Boolean)
  const lead = harnessLines[0] || 'Harness returned no connectivity line.'
  const reachable = /OlliN Pro API reachable/i.test(lead) && /Harness probe OK/i.test(lead)
  const ask = input.message.replace(/\s+/g, ' ').trim().slice(0, 160)
  const verdict = reachable
    ? `The Sergik harness is up, so this audit uses OlliN evidence.${ask ? ` Ask: ${ask}` : ''}`
    : `The Sergik harness is offline, so this audit only has the admin provider probe.${ask ? ` Ask: ${ask}` : ''}`

  const evidence = [
    ...harnessLines.slice(0, 6),
    ...adminLines.filter((line) => !/credit balances/i.test(line)).slice(0, 4),
  ].map((line) => `- ${line}`)

  const moves: string[] = []
  if (/CroweLM|customer credential missing/i.test(input.harness)) {
    moves.push('Leave CroweLM chat out of this turn until a customer credential is stored.')
  }
  if (/Crowe Creative offline|CROWE_API_KEY/i.test(input.harness)) {
    moves.push('Do not promise Crowe image or video generation.')
  }
  const dna = input.harness.match(/Sonic DNA unified (\d+)\/(\d+)/)
  if (dna && dna[1] === '0') {
    moves.push('Run Sonic DNA compile before any polymath copy claims.')
  } else if (dna) {
    moves.push(`Quote Sonic DNA only for the ${dna[1]} of ${dna[2]} unified tracks.`)
  }
  moves.push('Cite the rows above. Do not invent guests, cities, charts, or analytics.')
  const three = moves.slice(0, 3)
  while (three.length < 3) three.push('Name the release or page to audit next.')

  const offlineBits: string[] = []
  if (/CroweLM chat not configured|customer credential missing/i.test(input.harness)) {
    offlineBits.push('CroweLM chat: credential missing.')
  }
  if (/Crowe Creative offline|CROWE_API_KEY/i.test(input.harness)) {
    offlineBits.push('Crowe Creative: offline or key missing.')
  }
  if (/Dev Mode endpoint unavailable/i.test(input.harness)) {
    offlineBits.push('Dev Mode endpoint: unavailable.')
  }
  const cursorOffline = input.harness.match(/Cursor intelligence offline: (.+)/i)
  if (cursorOffline?.[1]) {
    offlineBits.push(`Cursor: ${cursorOffline[1].trim()}`)
  }
  const opusOffline = input.harness.match(/Claude Opus intelligence offline: (.+)/i)
  if (opusOffline?.[1]) {
    offlineBits.push(`Claude Opus: ${opusOffline[1].trim()}`)
  }
  if (!reachable) offlineBits.push(lead)

  return [
    '## Verdict',
    verdict,
    '## Evidence',
    evidence.join('\n') || '- not in context',
    '## Three moves',
    three.map((move, index) => `${index + 1}. ${move}`).join('\n'),
    offlineBits.length ? `## Offline\n${offlineBits.map((bit) => `- ${bit}`).join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function localGroundingTranscript(
  adminAi: string,
  harness: string,
  activeSkillId?: string | null,
): string {
  return [
    'POLYMATH + ADMIN AI DESK',
    formatPolymathAdminDesk(activeSkillId),
    '',
    'ADMIN AI PROBE',
    adminAi,
    '',
    'SERGIK UNIFIED INTELLIGENCE HARNESS',
    harness,
    '',
    'Write the reply from these probes and the desk. Cite them. Do not invent rows that are not here.',
  ].join('\n')
}
