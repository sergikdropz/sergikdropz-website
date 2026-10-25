/**
 * Royalty ledger track table — column order, visibility, and widths.
 * Header behavior matches the music browser: click to sort, drag to reorder,
 * drag the right edge to resize, right-click to show or hide columns.
 */

import type { LedgerSortField } from '@/lib/studio/royalties/ledger-groups'

export type LedgerColumnKey = LedgerSortField

export type LedgerOptionalColumn = Exclude<LedgerColumnKey, 'title'>

export const LEDGER_OPTIONAL_COLUMNS: LedgerOptionalColumn[] = [
  'lines',
  'amount',
  'youtube',
  'youtubeAmount',
  'instagram',
  'instagramAmount',
]

export const LEDGER_COLUMN_LABELS: Record<LedgerColumnKey, string> = {
  title: 'Title',
  lines: 'Lines',
  amount: 'Amount',
  youtube: 'YouTube',
  youtubeAmount: 'YouTube $',
  instagram: 'Instagram',
  instagramAmount: 'Instagram $',
}

export const LEDGER_DEFAULT_COLUMN_ORDER: LedgerColumnKey[] = ['title', ...LEDGER_OPTIONAL_COLUMNS]

export const LEDGER_COLUMN_WIDTH_MIN = 56
export const LEDGER_COLUMN_WIDTH_MAX = 480

export const LEDGER_DEFAULT_COLUMN_WIDTHS: Record<LedgerColumnKey, number> = {
  title: 280,
  lines: 72,
  amount: 96,
  youtube: 168,
  youtubeAmount: 104,
  instagram: 168,
  instagramAmount: 116,
}

const VISIBLE_KEY = 'sergik-royalties-ledger-columns'
const ORDER_KEY = 'sergik-royalties-ledger-column-order'
const WIDTHS_KEY = 'sergik-royalties-ledger-column-widths'

const ALL_COLUMNS = new Set<LedgerColumnKey>(LEDGER_DEFAULT_COLUMN_ORDER)

export function ledgerColumnAlign(column: LedgerColumnKey): 'left' | 'right' {
  return column === 'title' || column === 'youtube' || column === 'instagram' ? 'left' : 'right'
}

export function clampLedgerColumnWidth(width: number): number {
  return Math.min(LEDGER_COLUMN_WIDTH_MAX, Math.max(LEDGER_COLUMN_WIDTH_MIN, Math.round(width)))
}

export function reorderLedgerColumns(
  order: LedgerColumnKey[],
  from: LedgerColumnKey,
  to: LedgerColumnKey,
): LedgerColumnKey[] {
  if (from === to) return order
  const next = order.filter((column) => column !== from)
  const index = next.indexOf(to)
  if (index === -1) return order
  next.splice(index, 0, from)
  return next
}

export function visibleLedgerColumns(
  order: LedgerColumnKey[],
  visibleOptional: Set<LedgerOptionalColumn>,
): LedgerColumnKey[] {
  return order.filter((column) => column === 'title' || visibleOptional.has(column as LedgerOptionalColumn))
}

export function loadLedgerColumnVisibility(): Set<LedgerOptionalColumn> {
  const defaults = new Set(LEDGER_OPTIONAL_COLUMNS)
  if (typeof window === 'undefined') return defaults
  try {
    const raw = localStorage.getItem(VISIBLE_KEY)
    if (!raw) return defaults
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return defaults
    const next = new Set<LedgerOptionalColumn>()
    for (const key of parsed) {
      if (LEDGER_OPTIONAL_COLUMNS.includes(key as LedgerOptionalColumn)) {
        next.add(key as LedgerOptionalColumn)
      }
    }
    return next.size > 0 ? next : defaults
  } catch {
    return defaults
  }
}

export function saveLedgerColumnVisibility(visible: Set<LedgerOptionalColumn>): void {
  try {
    localStorage.setItem(
      VISIBLE_KEY,
      JSON.stringify(LEDGER_OPTIONAL_COLUMNS.filter((key) => visible.has(key))),
    )
  } catch {
    /* ignore */
  }
}

export function loadLedgerColumnOrder(): LedgerColumnKey[] {
  if (typeof window === 'undefined') return [...LEDGER_DEFAULT_COLUMN_ORDER]
  try {
    const raw = localStorage.getItem(ORDER_KEY)
    if (!raw) return [...LEDGER_DEFAULT_COLUMN_ORDER]
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return [...LEDGER_DEFAULT_COLUMN_ORDER]
    const order: LedgerColumnKey[] = []
    for (const key of parsed) {
      if (typeof key === 'string' && ALL_COLUMNS.has(key as LedgerColumnKey)) {
        order.push(key as LedgerColumnKey)
      }
    }
    for (const key of LEDGER_DEFAULT_COLUMN_ORDER) {
      if (!order.includes(key)) order.push(key)
    }
    return order
  } catch {
    return [...LEDGER_DEFAULT_COLUMN_ORDER]
  }
}

export function saveLedgerColumnOrder(order: LedgerColumnKey[]): void {
  try {
    localStorage.setItem(ORDER_KEY, JSON.stringify(order))
  } catch {
    /* ignore */
  }
}

export function loadLedgerColumnWidths(): Record<LedgerColumnKey, number> {
  const merged = { ...LEDGER_DEFAULT_COLUMN_WIDTHS }
  if (typeof window === 'undefined') return merged
  try {
    const raw = localStorage.getItem(WIDTHS_KEY)
    if (!raw) return merged
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return merged
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!ALL_COLUMNS.has(key as LedgerColumnKey)) continue
      const width = Number(value)
      if (!Number.isFinite(width)) continue
      merged[key as LedgerColumnKey] = clampLedgerColumnWidth(width)
    }
    return merged
  } catch {
    return merged
  }
}

export function saveLedgerColumnWidths(widths: Partial<Record<LedgerColumnKey, number>>): void {
  try {
    const payload: Partial<Record<LedgerColumnKey, number>> = {}
    for (const [key, value] of Object.entries(widths)) {
      if (!ALL_COLUMNS.has(key as LedgerColumnKey)) continue
      const width = Number(value)
      if (!Number.isFinite(width)) continue
      payload[key as LedgerColumnKey] = clampLedgerColumnWidth(width)
    }
    localStorage.setItem(WIDTHS_KEY, JSON.stringify(payload))
  } catch {
    /* ignore */
  }
}
