import type { AdminAiThreadMemory } from '@/lib/ai/admin-ai-thread-memory'

const EMAIL = /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g

export type AnchorSuggestion = {
  text: string
  reason: 'Release' | 'Goal' | 'Desk' | 'Step' | 'Code' | 'Date' | 'Next'
}

const STEP_LABEL: Record<string, string> = {
  catalog: 'Catalog',
  metadata: 'Metadata',
  rights: 'Rights',
  copy: 'Copy',
  delivery: 'Delivery',
  launch: 'Launch',
}

function clip(value: string, max: number): string {
  const text = value.replace(/\s+/g, ' ').trim()
  if (text.length <= max) return text
  return `${text.slice(0, max - 1).trimEnd()}…`
}

function usableGoal(goal: string | null | undefined, releaseTitle: string | null | undefined): string | null {
  if (!goal?.trim()) return null
  const release = releaseTitle?.trim() ?? ''
  const stripped = goal
    .replace(/launch support for/gi, '')
    .replace(release ? new RegExp(release.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi') : /$^/, '')
    .replace(/["“”']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (stripped.length < 12) return null
  return clip(goal, 80)
}

function alreadyPinned(text: string, existing: string[]): boolean {
  const needle = text.trim().toLowerCase()
  if (!needle) return true
  return existing.some((anchor) => {
    const have = anchor.trim().toLowerCase()
    if (!have) return false
    return have.includes(needle) || needle.includes(have)
  })
}

function codeLabel(before: string): string | null {
  const window = before.toLowerCase()
  if (!/upc|barcode|ean|distrokid|studio/.test(window)) return null
  const distro = window.lastIndexOf('distrokid')
  const studio = window.lastIndexOf('studio')
  if (distro > studio && distro >= 0) return 'DistroKid UPC'
  if (studio > distro && /upc|barcode|ean|has|still|matches/.test(window)) return 'Studio UPC'
  if (/upc|barcode|ean/.test(window)) return 'UPC'
  return null
}

function labeledCodes(blob: string): AnchorSuggestion[] {
  const out: AnchorSuggestion[] = []
  const seen = new Set<string>()
  for (const match of blob.matchAll(/\d{12,13}/g)) {
    const code = match[0]
    if (!code || seen.has(code) || match.index == null) continue
    const label = codeLabel(blob.slice(Math.max(0, match.index - 90), match.index))
    if (!label) continue
    seen.add(code)
    out.push({ text: `${label} ${code}`, reason: 'Code' })
    if (out.length >= 3) break
  }
  const isrcs = [...blob.matchAll(/\bQTA53[A-Z0-9]{7}\b/gi)].map((match) => match[0].toUpperCase())
  const unique = [...new Set(isrcs)].slice(0, 4)
  if (unique.length) out.push({ text: `ISRCs ${unique.join(', ')}`, reason: 'Code' })
  return out
}

function findDate(blob: string): AnchorSuggestion | null {
  const named =
    /\b((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2},?\s+20\d{2})\b/
  const match = blob.match(named)
  if (match?.[1] && match.index != null) {
    const around = blob.slice(Math.max(0, match.index - 48), match.index + match[0].length + 24)
    const reasonWord = /street|release date|drop|delivers/i.test(around) ? 'Release date' : 'Date'
    return { text: `${reasonWord} ${match[1]}`, reason: 'Date' }
  }
  const iso = blob.match(/\b(20\d{2}-\d{2}-\d{2})\b/)
  return iso?.[1] ? { text: `Date ${iso[1]}`, reason: 'Date' } : null
}

function findNext(assistant: string): string | null {
  for (const line of assistant.split('\n')) {
    const text = line
      .replace(/^[\s>*#-]+/, '')
      .replace(/^\d+\.\s+/, '')
      .replace(/\*\*/g, '')
      .trim()
    if (text.length < 16 || text.length > 110 || text.endsWith('?')) continue
    if (!/\b(copy|approve|paste|open|wait|pull|match|write|leave|store|pitch|check)\b/i.test(text)) continue
    if (/\b(done|completed|already|matched|everything for this goal)\b/i.test(text)) continue
    return clip(text, 90)
  }
  return null
}

function deskFromText(blob: string, deskLabel: string | null | undefined): string | null {
  if (deskLabel?.trim()) return deskLabel.trim()
  if (/distrokid\.com|\bdistrokid\b/i.test(blob)) return 'DistroKid'
  if (/soundexchange|sxdirect/i.test(blob)) return 'SoundExchange'
  if (/spotify/i.test(blob)) return 'Spotify'
  if (/youtube/i.test(blob)) return 'YouTube'
  return null
}

/** Facts worth pinning. Skips the user's own question and anything already in a slot. */
export function suggestThreadAnchors(input: {
  lastUserText?: string | null
  recentAssistantText?: string | null
  latestAssistantText?: string | null
  goal?: string | null
  releaseTitle?: string | null
  deskLabel?: string | null
  activeStep?: string | null
  notes?: string[]
  existingAnchors?: string[]
}): AnchorSuggestion[] {
  const existing = input.existingAnchors ?? []
  const user = (input.lastUserText ?? '').replace(EMAIL, ' ')
  const assistant = (input.recentAssistantText ?? '').replace(EMAIL, ' ')
  const notes = (input.notes ?? []).join('\n')
  const blob = [user, assistant, notes].join('\n')
  const candidates: AnchorSuggestion[] = []

  const release = input.releaseTitle?.trim()
  if (release) candidates.push({ text: release, reason: 'Release' })

  const goal = usableGoal(input.goal, release)
  if (goal) candidates.push({ text: goal, reason: 'Goal' })

  const desk = deskFromText(blob, input.deskLabel)
  if (desk) candidates.push({ text: `Desk: ${desk}`, reason: 'Desk' })

  const step = input.activeStep ? STEP_LABEL[input.activeStep] : undefined
  if (step) candidates.push({ text: `Step: ${step}`, reason: 'Step' })

  candidates.push(...labeledCodes(blob))

  const date = findDate(blob)
  if (date) candidates.push(date)

  const next = findNext(input.latestAssistantText ?? assistant)
  if (next) candidates.push({ text: next, reason: 'Next' })

  const out: AnchorSuggestion[] = []
  for (const candidate of candidates) {
    if (out.length >= 8) break
    if (candidate.text.length < 4) continue
    if (alreadyPinned(candidate.text, existing)) continue
    if (out.some((item) => item.text.toLowerCase() === candidate.text.toLowerCase())) continue
    out.push(candidate)
  }
  return out
}

/** Pinned slot text rides with the chat request. It is not written back into saved notes. */
export function threadMemoryWithAnchors(
  memory: AdminAiThreadMemory,
  anchors: string[],
): AdminAiThreadMemory {
  const pinned = anchors
    .map((anchor) => anchor.trim())
    .filter(Boolean)
    .map((anchor) => `Pinned: ${anchor}`)
  if (!pinned.length) return memory
  const room = Math.max(0, 12 - pinned.length)
  return { ...memory, notes: [...memory.notes.slice(-room), ...pinned] }
}
