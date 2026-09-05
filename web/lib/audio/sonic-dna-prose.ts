export type SonicDnaProseBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }

const USAGE_PREFIX =
  /^(Groove class|Kick is used|Snare\/clap is used|Hats are used|Bass is used|Low end is used|Sustained |Instrument scene:|Social usage|Sonic intent|Activation formula|Listener effect)/i

const FACT_PREFIX = /^(Pulse|Drum family|Bass lock|Root\/key|Key|BPM|Why|Scene)\b/i
const INLINE_DRUM_FACT = /^(kick|snare|hats)\b/i

function splitSentences(text: string): string[] {
  const chunks: string[] = []
  for (const line of text.split(/\n+/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const matches = trimmed.match(/[^.!?]+[.!?]+(?:["')\]]+)?(?:\s|$)|[^.!?]+$/g)
    if (!matches) {
      chunks.push(trimmed)
      continue
    }
    for (const match of matches) {
      const sentence = match.trim()
      if (sentence) chunks.push(sentence)
    }
  }
  return chunks
}

function splitSemicolons(sentence: string): string[] {
  if (!sentence.includes(';')) return [sentence.trim()].filter(Boolean)
  return sentence
    .split(';')
    .map((part) => part.trim().replace(/\.$/, ''))
    .filter(Boolean)
}

function titleCaseLabel(label: string): string {
  if (label.toLowerCase() === 'bpm') return 'BPM'
  if (label.toLowerCase() === 'root/key') return 'Root / key'
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function asLabeledFact(bit: string): string {
  const cleaned = bit.replace(/\.$/, '').trim()
  const labeled = cleaned.match(
    /^(Pulse|Drum family|Bass lock|Root\/key|Instrument scene|Kick|Snare|Hats|Key|BPM)\s*[:–-]?\s*(.+)$/i,
  )
  if (labeled?.[2]) return `${titleCaseLabel(labeled[1])}: ${labeled[2].trim()}`
  return cleaned
}

function chunkSentences(sentences: string[], size = 2): string[] {
  const paragraphs: string[] = []
  for (let i = 0; i < sentences.length; i += size) {
    paragraphs.push(
      sentences
        .slice(i, i + size)
        .map((sentence) => (/[.!?]"?$/.test(sentence) ? sentence : `${sentence}.`))
        .join(' '),
    )
  }
  return paragraphs
}

export function formatSonicDnaProse(raw: string, options?: { headings?: boolean }): SonicDnaProseBlock[] {
  const text = String(raw || '').replace(/[ \t]+/g, ' ').trim()
  if (!text) return []

  const facts: string[] = []
  const usage: string[] = []
  const rest: string[] = []
  let inDrumFamily = false

  for (const sentence of splitSentences(text)) {
    const bits = splitSemicolons(sentence)
    for (const bit of bits) {
      if (FACT_PREFIX.test(bit) || (inDrumFamily && INLINE_DRUM_FACT.test(bit))) {
        facts.push(asLabeledFact(bit))
        inDrumFamily = /^Drum family\b/i.test(bit) || inDrumFamily
        if (!/^Drum family\b/i.test(bit) && !INLINE_DRUM_FACT.test(bit)) inDrumFamily = false
        continue
      }
      inDrumFamily = false
      if (USAGE_PREFIX.test(bit)) {
        usage.push(bit.replace(/\.$/, ''))
        continue
      }
      rest.push(bit)
    }
  }

  const headings = options?.headings !== false
  const showHeadings = headings && (facts.length > 0 || usage.length > 0) && rest.length > 0
  const blocks: SonicDnaProseBlock[] = []
  if (facts.length) {
    if (showHeadings) blocks.push({ type: 'heading', text: 'Measured facts' })
    blocks.push({ type: 'list', items: facts })
  }
  if (usage.length) {
    if (showHeadings) blocks.push({ type: 'heading', text: 'How it is used' })
    blocks.push({ type: 'list', items: usage })
  }
  const paragraphs = chunkSentences(rest)
  if (paragraphs.length) {
    if (showHeadings) blocks.push({ type: 'heading', text: 'Context' })
    for (const paragraph of paragraphs) blocks.push({ type: 'paragraph', text: paragraph })
  }
  return blocks
}

export function measuredGrooveFacts(measured: {
  bpm?: number | null
  timingFeel?: string | null
  drumFamily?: string | null
  camelot?: string | null
  key?: string | null
  bass?: { lock?: string | null; rootNote?: string | null } | null
  percussion?: { kickRole?: string | null; snareRole?: string | null; hatGrid?: string | null } | null
  instruments?: Array<{ label?: string; confidence?: number }>
} | null | undefined): Array<{ label: string; value: string }> {
  if (!measured) return []
  const rows: Array<{ label: string; value: string }> = []
  if (measured.bpm) {
    const feel = measured.timingFeel ? ` (${measured.timingFeel})` : ''
    rows.push({ label: 'Pulse', value: `${Math.round(Number(measured.bpm))} BPM${feel}` })
  }
  if (measured.drumFamily) rows.push({ label: 'Drum family', value: String(measured.drumFamily) })
  if (measured.percussion?.kickRole) rows.push({ label: 'Kick', value: String(measured.percussion.kickRole) })
  if (measured.percussion?.snareRole) rows.push({ label: 'Snare', value: String(measured.percussion.snareRole) })
  if (measured.percussion?.hatGrid) rows.push({ label: 'Hats', value: String(measured.percussion.hatGrid) })
  if (measured.bass?.lock) {
    const around = measured.bass.rootNote ? ` around ${measured.bass.rootNote}` : ''
    rows.push({ label: 'Bass lock', value: `${measured.bass.lock}${around}` })
  }
  if (measured.key) {
    rows.push({
      label: 'Root / key',
      value: `${measured.key}${measured.camelot ? ` / Camelot ${measured.camelot}` : ''}`,
    })
  }
  const scene = (measured.instruments || [])
    .filter((item) => (item.confidence || 0) >= 0.4)
    .map((item) => item.label)
    .filter(Boolean)
  if (scene.length) rows.push({ label: 'Scene', value: scene.join(', ') })
  return rows
}
