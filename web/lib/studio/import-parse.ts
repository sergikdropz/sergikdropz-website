export const SPLIT_ROLES = ['performer', 'writer', 'producer', 'publisher'] as const
export type SplitRole = (typeof SPLIT_ROLES)[number]

export const SPLIT_PROS = ['ASCAP', 'BMI', 'SESAC', 'GMR', 'SOCAN', 'PRS', 'GEMA', 'Other'] as const
export type SplitPro = (typeof SPLIT_PROS)[number]

export type SplitCopyright = 'master' | 'composition'

export type SplitRow = {
  name: string
  percentage: number
  legal_name?: string | null
  role?: SplitRole | string | null
  publisher?: string | null
  ipi?: string | null
  pro?: string | null
  /** When set, master and composition are separate 100% tables. */
  copyright?: SplitCopyright | null
}

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

export function isSplitRole(value: string): value is SplitRole {
  return (SPLIT_ROLES as readonly string[]).includes(value)
}

export function normalizeSplitRows(raw: unknown): SplitRow[] {
  if (!Array.isArray(raw)) return []
  const out: SplitRow[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const name = String((item as SplitRow).name || '').trim()
    const percentage = Number((item as SplitRow).percentage)
    if (!name && !Number.isFinite(percentage)) continue
    const roleRaw = String((item as SplitRow).role || '').trim().toLowerCase()
    const proRaw = String((item as SplitRow).pro || '').trim()
    const copyrightRaw = String((item as SplitRow).copyright || '').trim().toLowerCase()
    const copyright: SplitCopyright | null =
      copyrightRaw === 'master' || copyrightRaw === 'composition' ? copyrightRaw : null
    out.push({
      name,
      percentage: Number.isFinite(percentage) ? percentage : 0,
      legal_name: String((item as SplitRow).legal_name || '').trim() || null,
      role: isSplitRole(roleRaw) ? roleRaw : roleRaw || 'performer',
      publisher: String((item as SplitRow).publisher || '').trim() || null,
      ipi: String((item as SplitRow).ipi || '').replace(/\D/g, '') || null,
      pro: proRaw || null,
      copyright,
    })
  }
  return out
}

export function formatSplitsString(splits: SplitRow[]): string {
  return splits
    .filter((row) => row.name)
    .map((row) => `${row.name}:${row.percentage}`)
    .join(', ')
}

export function equalSplitPercentages(count: number): number[] {
  const n = Math.max(1, count)
  const base = Math.floor(10000 / n) / 100
  return Array.from({ length: n }, (_, index) =>
    index === n - 1 ? Math.round((100 - base * (n - 1)) * 100) / 100 : base,
  )
}

export function splitsAreSided(rows: SplitRow[]): boolean {
  return rows.some((row) => row.copyright === 'master' || row.copyright === 'composition')
}

export function sumSplitPercentage(rows: SplitRow[]): number {
  return rows.reduce((sum, row) => sum + (Number(row.percentage) || 0), 0)
}

function poolTotals100(rows: SplitRow[]): boolean {
  return rows.length > 0 && rows.some((row) => row.name) && Math.abs(sumSplitPercentage(rows) - 100) < 0.01
}

/** Legacy sheets total 100% once. Sided sheets need a 100% master table and a 100% composition table. */
export function splitsBalanceOk(raw: unknown): boolean {
  const rows = normalizeSplitRows(raw)
  if (!rows.length) return false
  if (!splitsAreSided(rows)) return poolTotals100(rows)
  const master = rows.filter((row) => row.copyright === 'master')
  const composition = rows.filter((row) => row.copyright === 'composition')
  return poolTotals100(master) && poolTotals100(composition)
}

export function separateSplitCopyrights(rows: SplitRow[]): SplitRow[] {
  const tagged = rows
    .filter((row) => row.name.trim())
    .map((row) => {
      if (row.copyright === 'master' || row.copyright === 'composition') return row
      const composition = row.role === 'writer' || row.role === 'publisher'
      return { ...row, copyright: composition ? ('composition' as const) : ('master' as const) }
    })
  let master = tagged.filter((row) => row.copyright === 'master')
  let composition = tagged.filter((row) => row.copyright === 'composition')
  if (!master.length && composition.length) {
    master = composition.map((row) => ({ ...row, copyright: 'master' as const, role: 'performer' }))
  }
  if (!composition.length && master.length) {
    composition = master.map((row) => ({
      ...row,
      copyright: 'composition' as const,
      role: 'writer',
      publisher: row.publisher || 'SERGIK Music',
    }))
  }
  const equalize = (list: SplitRow[]) => {
    const percents = equalSplitPercentages(list.length)
    return list.map((row, index) => ({ ...row, percentage: percents[index] ?? 0 }))
  }
  return [...equalize(master), ...equalize(composition)]
}

export function validateSplitsTotal(splits: SplitRow[]): string | null {
  if (splits.length === 0) return null
  if (splitsAreSided(splits)) {
    const master = sumSplitPercentage(splits.filter((row) => row.copyright === 'master'))
    const composition = sumSplitPercentage(splits.filter((row) => row.copyright === 'composition'))
    const masterOk = Math.abs(master - 100) < 0.01 && splits.some((row) => row.copyright === 'master' && row.name)
    const compositionOk =
      Math.abs(composition - 100) < 0.01 && splits.some((row) => row.copyright === 'composition' && row.name)
    if (masterOk && compositionOk) return null
    return `Master ${Math.round(master * 100) / 100}% and composition ${Math.round(composition * 100) / 100}% must each total 100%`
  }
  const total = sumSplitPercentage(splits)
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
