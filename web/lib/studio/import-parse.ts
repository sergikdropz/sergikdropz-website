export type SplitRow = { name: string; percentage: number }

export type ParsedIsrcRow = {
  line: number
  track_id?: string
  title?: string
  isrc?: string
  action: 'assign_new' | 'set_existing'
  error?: string
}

export type ParsedSplitRow = {
  line: number
  track_id?: string
  title?: string
  splits: SplitRow[]
  error?: string
}

/** Minimal CSV: handles quoted fields with commas */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const row: string[] = []
    let cell = ''
    let inQuotes = false
    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i]
      if (ch === '"') {
        inQuotes = !inQuotes
        continue
      }
      if (ch === ',' && !inQuotes) {
        row.push(cell.trim())
        cell = ''
        continue
      }
      cell += ch
    }
    row.push(cell.trim())
    rows.push(row)
  }
  return rows
}

/** `Name:50, Name2:50` or `Name 50%` */
export function parseSplitsString(raw: string): SplitRow[] {
  const trimmed = raw.trim()
  if (!trimmed) return []

  return trimmed.split(/[,;|]/).map((part) => {
    const segment = part.trim()
    const colon = segment.match(/^(.+?)\s*[:=]\s*(\d+(?:\.\d+)?)\s*%?$/)
    if (colon) {
      return { name: colon[1].trim(), percentage: parseFloat(colon[2]) }
    }
    const pct = segment.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*%$/)
    if (pct) {
      return { name: pct[1].trim(), percentage: parseFloat(pct[2]) }
    }
    return { name: segment, percentage: 0 }
  })
}

export function validateSplitsTotal(splits: SplitRow[]): string | null {
  if (splits.length === 0) return null
  const total = splits.reduce((s, r) => s + r.percentage, 0)
  if (Math.abs(total - 100) > 0.01) {
    return `Splits total ${total}% (must be 100%)`
  }
  return null
}

function headerIndex(headers: string[], names: string[]): number {
  const lower = headers.map((h) => h.toLowerCase().replace(/\s+/g, '_'))
  for (const name of names) {
    const i = lower.indexOf(name)
    if (i >= 0) return i
  }
  return -1
}

export function parseIsrcImportCsv(text: string): ParsedIsrcRow[] {
  const rows = parseCsv(text)
  if (rows.length === 0) return []

  const [first, ...rest] = rows
  const hasHeader =
    first.some((c) => /track|title|isrc/i.test(c)) && !validateIsrcCell(first.join(''))
  const headers = hasHeader ? first : ['track_id', 'title', 'isrc']
  const dataRows = hasHeader ? rest : rows

  const trackIdCol = headerIndex(headers, ['track_id', 'id', 'track'])
  const titleCol = headerIndex(headers, ['title', 'track_title', 'name'])
  const isrcCol = headerIndex(headers, ['isrc', 'isrc_full', 'code'])

  return dataRows.map((cells, idx) => {
    const line = hasHeader ? idx + 2 : idx + 1
    const track_id =
      trackIdCol >= 0 ? cells[trackIdCol]?.trim() || undefined : cells[0]?.trim() || undefined
    const title =
      titleCol >= 0 ? cells[titleCol]?.trim() || undefined : undefined
    const isrcRaw =
      isrcCol >= 0
        ? cells[isrcCol]?.trim().toUpperCase().replace(/-/g, '')
        : cells[cells.length - 1]?.trim().toUpperCase().replace(/-/g, '')

    if (!track_id && !title) {
      return { line, error: 'Need track_id or title', action: 'assign_new' as const }
    }

    if (!isrcRaw || isrcRaw === 'AUTO' || isrcRaw === 'NEW') {
      return {
        line,
        track_id,
        title,
        action: 'assign_new' as const,
      }
    }

    return {
      line,
      track_id,
      title,
      isrc: isrcRaw,
      action: 'set_existing' as const,
    }
  })
}

function validateIsrcCell(s: string): boolean {
  return /^[A-Z0-9]{12}$/i.test(s.replace(/-/g, ''))
}

export function parseSplitsImportCsv(text: string): ParsedSplitRow[] {
  const rows = parseCsv(text)
  if (rows.length === 0) return []

  const [first, ...rest] = rows
  const hasHeader = first.some((c) => /track|title|split/i.test(c))
  const headers = hasHeader ? first : ['track_id', 'splits']
  const dataRows = hasHeader ? rest : rows

  const trackIdCol = headerIndex(headers, ['track_id', 'id', 'track'])
  const titleCol = headerIndex(headers, ['title', 'track_title', 'name'])
  const splitsCol = headerIndex(headers, ['splits', 'split_sheet', 'split', 'owners'])

  return dataRows.map((cells, idx) => {
    const line = hasHeader ? idx + 2 : idx + 1
    const track_id =
      trackIdCol >= 0 ? cells[trackIdCol]?.trim() || undefined : cells[0]?.trim() || undefined
    const title = titleCol >= 0 ? cells[titleCol]?.trim() || undefined : undefined
    const splitsRaw =
      splitsCol >= 0
        ? cells[splitsCol]?.trim()
        : cells[1]?.trim() || cells[cells.length - 1]?.trim()

    if (!track_id && !title) {
      return { line, splits: [], error: 'Need track_id or title' }
    }
    if (!splitsRaw) {
      return { line, track_id, title, splits: [], error: 'Missing splits column' }
    }

    const splits = parseSplitsString(splitsRaw)
    const splitError = validateSplitsTotal(splits)
    return {
      line,
      track_id,
      title,
      splits,
      error: splitError || undefined,
    }
  })
}

export const ISRC_IMPORT_TEMPLATE = `# track_id,title,isrc
# Use AUTO or leave isrc empty to generate a new code
track-001,My Song,AUTO
track-002,Feature Track,USRC17607839`

export const SPLITS_IMPORT_TEMPLATE = `# track_id,title,splits
track-001,My Song,SERGIK:100
track-002,Feature,SERGIK:50,Producer:50`
