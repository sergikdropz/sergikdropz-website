export type SonicDnaChatEntry = {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Build admin guidance for Re-run audio / whole-report rewrite from the live
 * prompt plus recent chat (Accuracy Challenge + Question notes).
 */
export function collectSonicDnaAdminGuidance(
  prompt: string,
  thread: SonicDnaChatEntry[],
  opts?: { maxUserNotes?: number; maxAssistantChars?: number },
): string {
  const maxUserNotes = opts?.maxUserNotes ?? 6
  const maxAssistantChars = opts?.maxAssistantChars ?? 900
  const parts: string[] = []
  const seen = new Set<string>()

  const push = (raw: string, prefix?: string) => {
    const text = raw.replace(/\s+/g, ' ').trim()
    if (!text) return
    const key = text.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    parts.push(prefix ? `${prefix}${text}` : text)
  }

  const userNotes = thread
    .filter((entry) => entry.role === 'user')
    .map((entry) => entry.content)
    .filter((content) => content.trim().length > 0)
    .slice(-maxUserNotes)

  for (const note of userNotes) push(note)

  const live = prompt.trim()
  if (live) push(live)

  // Last accuracy-challenge / override reply often embeds the admin correction.
  const lastAssistant = [...thread].reverse().find((entry) => entry.role === 'assistant')
  if (lastAssistant?.content) {
    const clipped = lastAssistant.content.trim().slice(0, maxAssistantChars)
    if (/challenge|override|admin input|incorrect|wrong|prefer/i.test(clipped)) {
      push(clipped, 'Recent challenge findings: ')
    }
  }

  return parts.join('\n\n').trim()
}

export function buildAudioRerunRewriteMessage(guidance: string): string {
  const base =
    'Fresh audio measurement completed — rewrite the whole report and every section from the measured groove.'
  const notes = guidance.trim()
  if (!notes) return base
  return [
    base,
    '',
    'ADMIN ACCURACY GUIDANCE (highest priority for genre/feel/culture/description labeling when compatible with measured BPM, drums, bass, and key):',
    notes,
    '',
    'Honor this guidance as an Admin Override in every rewritten section. Do not revert to playlist/folder/title crate labels that the admin corrected.',
  ].join('\n')
}
