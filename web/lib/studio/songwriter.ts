import { namesForRole, parseContributors } from '@/lib/studio/track-credits'
import { US_ISRC_REGISTRANT } from '@/lib/studio/isrc-format'

export type WriterLegalRow = {
  stage: string
  legal: string
}

const DEFAULT_ARTIST = 'SERGIK'
const KNOWN_LEGAL: Record<string, string> = {
  sergik: US_ISRC_REGISTRANT.name,
  sergikdropz: US_ISRC_REGISTRANT.name,
}

function clean(value: unknown): string {
  return value == null ? '' : String(value).trim()
}

export function knownLegalName(stage: string | null | undefined): string | null {
  const key = clean(stage).toLowerCase()
  return KNOWN_LEGAL[key] || null
}

export function isStageName(value: string, extra: string[] = []): boolean {
  const text = clean(value)
  if (!text) return false
  const stages = new Set(
    [DEFAULT_ARTIST, ...extra, ...Object.keys(KNOWN_LEGAL)].map((name) => name.toLowerCase()),
  )
  if (stages.has(text.toLowerCase())) return true
  return !/\s/.test(text) && text === text.toUpperCase() && text.length > 2
}

export function looksLikeLegalName(value: string, extraStages: string[] = []): boolean {
  const text = clean(value)
  if (!text || !/\s/.test(text)) return false
  return !isStageName(text, extraStages)
}

/** Billed primaries, featured, vocalists, and explicit writers — everyone who needs a legal name. */
export function songwriterParties(contributors: unknown, fallback = DEFAULT_ARTIST): string[] {
  const rows = parseContributors(contributors)
  const names = [
    ...namesForRole(rows, 'primary'),
    ...namesForRole(rows, 'featured'),
    ...namesForRole(rows, 'vocalist'),
    ...namesForRole(rows, 'writer'),
  ]
  const seen = new Set<string>()
  const out: string[] = []
  for (const name of names) {
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(name)
  }
  return out.length ? out : [fallback]
}

export function parseWriterLegalNames(raw: unknown): WriterLegalRow[] {
  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (!item || typeof item !== 'object') return null
        const stage = clean((item as { stage?: unknown }).stage)
        const legal = clean((item as { legal?: unknown; legal_name?: unknown }).legal
          ?? (item as { legal_name?: unknown }).legal_name)
        if (!stage && !legal) return null
        return { stage, legal }
      })
      .filter((row): row is WriterLegalRow => Boolean(row))
  }

  const text = clean(raw)
  if (!text) return []
  if (text.startsWith('[')) {
    try {
      return parseWriterLegalNames(JSON.parse(text))
    } catch {
      /* fall through */
    }
  }

  const chunks = text.split(/\s*;\s*|\s*\|\s*|(?:,\s*)(?=[^,]{1,40}\s*[:=])/).flatMap((part) => {
    const pair = part.match(/^(.{1,80}?)\s*[:=]\s*(.+)$/)
    if (pair) return [{ stage: clean(pair[1]), legal: clean(pair[2]) }]
    return part
      .split(/\s*,\s*/)
      .map((name) => clean(name))
      .filter(Boolean)
      .map((name) => ({ stage: '', legal: name }))
  })
  return chunks.filter((row) => row.stage || row.legal)
}

export function serializeWriterLegalNames(rows: WriterLegalRow[]): string | null {
  const filled = rows
    .map((row) => ({ stage: clean(row.stage), legal: clean(row.legal) }))
    .filter((row) => row.stage || row.legal)
  if (!filled.length) return null
  if (filled.some((row) => row.stage)) return JSON.stringify(filled)
  return filled.map((row) => row.legal).filter(Boolean).join(', ')
}

export function seedWriterLegalRows(
  contributors: unknown,
  persisted?: unknown,
  extraStages: string[] = [],
): WriterLegalRow[] {
  const parties = songwriterParties(contributors)
  const parsed = parseWriterLegalNames(persisted)
  const byStage = new Map<string, string>()
  const unpaired: string[] = []
  for (const row of parsed) {
    if (row.stage) byStage.set(row.stage.toLowerCase(), row.legal)
    else if (row.legal) unpaired.push(row.legal)
  }

  let unpairedIndex = 0
  return parties.map((stage) => {
    const fromStage = byStage.get(stage.toLowerCase())
    if (fromStage) return { stage, legal: fromStage }
    const known = knownLegalName(stage)
    const next = unpaired[unpairedIndex]
    if (known) {
      if (next && next.toLowerCase() === known.toLowerCase()) unpairedIndex += 1
      return { stage, legal: known }
    }
    if (next && looksLikeLegalName(next, extraStages) && next.toLowerCase() !== stage.toLowerCase()) {
      unpairedIndex += 1
      return { stage, legal: next }
    }
    return { stage, legal: '' }
  })
}

export function writerLegalNameIssues(
  value: string | null | undefined,
  stageNames: string[] = [],
  contributors?: unknown,
): string[] {
  const extra = stageNames.map(clean).filter(Boolean)
  const rows = contributors
    ? seedWriterLegalRows(contributors, value, extra)
    : parseWriterLegalNames(value).map((row) => ({
        stage: row.stage || 'Songwriter',
        legal: row.legal,
      }))

  if (!rows.length) {
    return ['Add collaborator legal name(s) — first and last, not the stage name.']
  }

  const issues: string[] = []
  for (const row of rows) {
    const legal = clean(row.legal)
    const stage = clean(row.stage)
    if (!legal) {
      issues.push(
        stage && stage !== 'Songwriter'
          ? `Add a collaborator legal name for ${stage} (first and last, not the stage name).`
          : 'Add collaborator legal name(s) — first and last, not the stage name.',
      )
      continue
    }
    if (isStageName(legal, extra) || (stage && legal.toLowerCase() === stage.toLowerCase())) {
      issues.push(`“${legal}” is a stage name. PROs and Apple need the legal name.`)
      continue
    }
    if (!looksLikeLegalName(legal, extra)) {
      issues.push(`“${legal}” looks like a stage name. Use a real first and last name.`)
    }
  }
  return issues
}
