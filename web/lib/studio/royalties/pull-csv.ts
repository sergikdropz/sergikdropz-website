/** Turn documented Meta Graph rows into the CSV shape the statement parser already accepts. */

export type AdInsightRow = {
  campaign_name?: string
  adset_name?: string
  spend?: string
  impressions?: string
  account_currency?: string
  date_start?: string
  date_stop?: string
}

export type CreatorEarningPoint = {
  endTime: string
  /** Major currency units, such as dollars. Not micro-units. */
  amount: number | null
}

const DAY_CAP_CENTS = 10_000_000

/** Meta's Instagram account insights reject every earnings metric. The pull still finishes. */
export const INSTAGRAM_EARNINGS_UNAVAILABLE_NOTE =
  'Instagram insights are connected. Meta does not include creator earnings in professional-account insights, so nothing was written. Facebook Page content monetization stays on its own pull.'

export function majorUnitsToCents(amount: number): number | null {
  if (!Number.isFinite(amount)) return null
  const cents = Math.round(amount * 100)
  if (Math.abs(cents) > DAY_CAP_CENTS) return null
  return cents
}

/** Page insights return micro-units. 1_000_000 micro-units is one dollar. */
export function creatorEarningAmount(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const micro = row.microAmount ?? row.micro_amount
  if (typeof micro === 'number' && Number.isFinite(micro)) return micro / 1_000_000
  if (typeof micro === 'string' && micro.trim() && Number.isFinite(Number(micro))) return Number(micro) / 1_000_000
  for (const key of ['value', 'amount', 'earnings']) {
    if (typeof row[key] === 'number' && Number.isFinite(row[key])) return row[key] as number
  }
  return null
}

export function adInsightsToCsv(rows: AdInsightRow[], currency = 'USD'): string {
  const lines = ['Campaign name,Ad set name,Amount spent,Currency,Impressions,Reporting Date']
  for (const row of rows) {
    const spend = row.spend ?? ''
    if (!spend) continue
    lines.push(
      [
        csvCell(row.campaign_name || ''),
        csvCell(row.adset_name || ''),
        csvCell(spend),
        csvCell(row.account_currency || currency),
        csvCell(row.impressions || ''),
        csvCell(row.date_start || row.date_stop || ''),
      ].join(','),
    )
  }
  return `${lines.join('\n')}\n`
}

export function creatorEarningsToCsv(input: {
  pageId: string
  currency: string
  points: CreatorEarningPoint[]
  /** Set for Instagram so the ledger column is the professional account, not the Facebook Page. */
  store?: string
}): { csv: string; skipped: number; windowCents: number; dayCount: number } {
  const store = (input.store || '').trim()
  const lines = [store ? 'Page ID,Store,Approximate earnings,Currency,Reporting Date' : 'Page ID,Approximate earnings,Currency,Reporting Date']
  let skipped = 0
  let windowCents = 0
  let dayCount = 0
  for (const point of input.points) {
    if (point.amount == null) {
      skipped += 1
      continue
    }
    const cents = majorUnitsToCents(point.amount)
    if (cents == null) {
      skipped += 1
      continue
    }
    dayCount += 1
    windowCents += cents
    if (cents === 0) continue
    const cells = [csvCell(input.pageId)]
    if (store) cells.push(csvCell(store))
    cells.push(csvCell((cents / 100).toFixed(2)), csvCell(input.currency), csvCell(point.endTime.slice(0, 10)))
    lines.push(cells.join(','))
  }
  return { csv: `${lines.join('\n')}\n`, skipped, windowCents, dayCount }
}

function csvCell(value: string): string {
  const safe = /^[=+\-@]/.test(value.trimStart()) ? `'${value}` : value
  if (/[",\n]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`
  return safe
}
