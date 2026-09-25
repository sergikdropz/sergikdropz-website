import type {
  ParseStatementResult,
  RoyaltySource,
  StatementLineInput,
} from '@/lib/studio/royalties/types'
import { DEFAULT_ROYALTY_CURRENCY } from '@/lib/studio/royalties/constants'

function clean(value: unknown): string {
  return value == null ? '' : String(value).replace(/^\uFEFF/, '').trim()
}

function normHeader(h: string): string {
  return clean(h)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

/** Minimal CSV splitter that respects double-quoted fields. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cell += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === ',') {
      row.push(cell)
      cell = ''
      continue
    }
    if (ch === '\n') {
      row.push(cell)
      cell = ''
      if (row.some((c) => clean(c))) rows.push(row)
      row = []
      continue
    }
    cell += ch
  }
  row.push(cell)
  if (row.some((c) => clean(c))) rows.push(row)
  return rows
}

function moneyToCents(raw: string): number | null {
  const s = clean(raw).replace(/[$,\s]/g, '')
  if (!s || s === '-' || s === '—') return null
  const neg = s.startsWith('(') && s.endsWith(')')
  const n = Number(neg ? s.slice(1, -1) : s)
  if (!Number.isFinite(n)) return null
  return Math.round((neg ? -n : n) * 100)
}

function pick(row: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const v = row[key]
    if (v != null && clean(v)) return clean(v)
  }
  return ''
}

function detectSource(headers: string[]): RoyaltySource {
  const set = new Set(headers.map(normHeader))
  if (set.has('reportingdate') || set.has('salemonth') || set.has('earningsusd')) {
    return 'distrokid'
  }
  if (
    set.has('partneruserid') ||
    set.has('revelator') ||
    (set.has('netamount') && set.has('producttitle'))
  ) {
    return 'revelator'
  }
  if (set.has('isrc') || set.has('earnings') || set.has('revenue') || set.has('amount')) {
    return 'generic'
  }
  return 'manual'
}

const ISRC_KEYS = ['isrc', 'isrccode', 'trackisrc']
const UPC_KEYS = ['upc', 'ean', 'barcode', 'upcean']
const TITLE_KEYS = ['songtitle', 'tracktitle', 'title', 'producttitle', 'song']
const ALBUM_KEYS = ['albumname', 'albumtitle', 'release', 'releasetitle', 'productname']
const ARTIST_KEYS = ['artistname', 'artist', 'recordingartist', 'primaryartist']
const STORE_KEYS = ['store', 'retailer', 'dsp', 'platform', 'service']
const TERRITORY_KEYS = ['territory', 'country', 'countrycode', 'region']
const QTY_KEYS = ['quantity', 'units', 'qty', 'streams', 'plays']
const AMOUNT_KEYS = [
  'earningsusd',
  'earnings',
  'revenue',
  'netamount',
  'amount',
  'netrevenue',
  'payable',
  'royalty',
]
const CURRENCY_KEYS = ['currency', 'curr']
const DATE_KEYS = ['salemonth', 'reportingdate', 'period', 'date', 'transactiondate']

function rowToLine(row: Record<string, string>, defaultCurrency: string): StatementLineInput | null {
  const amountRaw = pick(row, AMOUNT_KEYS)
  const amountCents = moneyToCents(amountRaw)
  if (amountCents == null) return null

  const qtyRaw = pick(row, QTY_KEYS)
  const quantity = qtyRaw && Number.isFinite(Number(qtyRaw)) ? Number(qtyRaw) : null
  const currency = (pick(row, CURRENCY_KEYS) || defaultCurrency).toUpperCase()

  return {
    isrc: pick(row, ISRC_KEYS).replace(/[- ]/g, '').toUpperCase() || null,
    upc: pick(row, UPC_KEYS).replace(/\D/g, '') || null,
    trackTitle: pick(row, TITLE_KEYS) || null,
    albumTitle: pick(row, ALBUM_KEYS) || null,
    artistName: pick(row, ARTIST_KEYS) || null,
    store: pick(row, STORE_KEYS) || null,
    territory: pick(row, TERRITORY_KEYS) || null,
    quantity,
    amountCents,
    currency,
    saleDate: pick(row, DATE_KEYS) || null,
    raw: row,
  }
}

/**
 * Parse DistroKid / Revelator / generic royalty CSV into normalized line items.
 * Amounts become integer cents. Zero-amount rows are kept (adjustments).
 */
export function parseRoyaltyStatementCsv(csvText: string): ParseStatementResult {
  const warnings: string[] = []
  const rows = parseCsvRows(csvText)
  if (rows.length < 2) {
    return {
      source: 'manual',
      currency: DEFAULT_ROYALTY_CURRENCY,
      periodLabel: null,
      lines: [],
      warnings: ['CSV has no data rows'],
    }
  }

  const headerCells = rows[0].map(normHeader)
  const source = detectSource(headerCells)
  const lines: StatementLineInput[] = []
  let currency = DEFAULT_ROYALTY_CURRENCY
  const saleDates: string[] = []

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r]
    const map: Record<string, string> = {}
    for (let c = 0; c < headerCells.length; c++) {
      const key = headerCells[c]
      if (!key) continue
      map[key] = cells[c] ?? ''
    }
    const line = rowToLine(map, currency)
    if (!line) {
      warnings.push(`Skipped row ${r + 1}: no parsable amount`)
      continue
    }
    if (line.currency) currency = line.currency
    if (line.saleDate) saleDates.push(line.saleDate)
    lines.push(line)
  }

  let periodLabel: string | null = null
  if (saleDates.length) {
    const sorted = [...saleDates].sort()
    periodLabel =
      sorted[0] === sorted[sorted.length - 1]
        ? sorted[0]
        : `${sorted[0]} → ${sorted[sorted.length - 1]}`
  }

  if (!lines.length) {
    warnings.push('No statement lines parsed — check column headers (need Earnings / Amount / Revenue)')
  }

  return { source, currency, periodLabel, lines, warnings }
}
