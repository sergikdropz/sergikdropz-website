import type {
  AmountBasis,
  ParseStatementResult,
  RoyaltySource,
  StatementCategory,
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
  if (set.has('amountspent') || set.has('adspend') || set.has('adsetname') || set.has('campaignname')) {
    return 'meta_ads'
  }
  if (
    set.has('contentmonetization') ||
    set.has('approximateearnings') ||
    set.has('monetizationstatus') ||
    (set.has('pageid') && (set.has('earnings') || set.has('earningsusd')))
  ) {
    return 'meta_creator'
  }
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

function categoryFor(source: RoyaltySource): StatementCategory {
  if (source === 'meta_ads') return 'meta_ad_spend'
  if (source === 'meta_creator') return 'meta_creator'
  return 'recording_royalty'
}

function basisFor(headers: string[]): AmountBasis {
  const set = new Set(headers.map(normHeader))
  if ([...set].some((key) => key.startsWith('net'))) return 'net'
  if ([...set].some((key) => key.startsWith('gross'))) return 'gross'
  return 'unknown'
}

/** Spreadsheet formulas must not become live formulas if a row is exported again. */
function neutralizeCell(value: string): string {
  const trimmed = value.trimStart()
  return /^[=+\-@]/.test(trimmed) ? `'${value}` : value
}

const ISRC_KEYS = ['isrc', 'isrccode', 'trackisrc']
const UPC_KEYS = ['upc', 'ean', 'barcode', 'upcean']
const TITLE_KEYS = ['songtitle', 'tracktitle', 'title', 'producttitle', 'song', 'campaignname']
const ALBUM_KEYS = ['albumname', 'albumtitle', 'release', 'releasetitle', 'productname']
const ARTIST_KEYS = ['artistname', 'artist', 'recordingartist', 'primaryartist']
const STORE_KEYS = ['store', 'retailer', 'dsp', 'platform', 'service']
const TERRITORY_KEYS = ['territory', 'country', 'countrycode', 'region']
const QTY_KEYS = ['quantity', 'units', 'qty', 'streams', 'plays']
const AMOUNT_KEYS = [
  'earningsusd',
  'approximateearnings',
  'earnings',
  'revenue',
  'netamount',
  'amountspent',
  'adspend',
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
    raw: Object.fromEntries(Object.entries(row).map(([key, value]) => [key, neutralizeCell(value)])),
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
      category: 'recording_royalty',
      amountBasis: 'unknown',
      currency: DEFAULT_ROYALTY_CURRENCY,
      periodLabel: null,
      lines: [],
      warnings: ['CSV has no data rows'],
    }
  }

  const headerCells = rows[0].map(normHeader)
  const source = detectSource(headerCells)
  const category = categoryFor(source)
  const amountBasis = basisFor(headerCells)
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
    warnings.push('No statement lines parsed — check column headers (need Earnings / Amount / Revenue / Amount spent)')
  }
  if (category === 'meta_ad_spend') {
    warnings.push('Ad spend is a cost. It is not royalty income and is not allocated to collaborators.')
  }
  if (category === 'meta_creator') {
    warnings.push('Meta creator payouts stay with the LLC. They are not split like master royalties.')
  }
  if (amountBasis === 'unknown' && lines.length) {
    warnings.push('Fee treatment is unknown. The reported amount is stored as-is, with no 20% deduction.')
  }

  return { source, category, amountBasis, currency, periodLabel, lines, warnings }
}
