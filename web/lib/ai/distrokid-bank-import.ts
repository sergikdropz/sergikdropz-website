import {
  bankTableTextToCsv,
  nextBankPageHref,
  planDistroKidBank,
  type BankLink,
  type BankPageRead,
} from '@/lib/ai/distrokid-bank-page'

export const DISTROKID_BANK_URL = 'https://distrokid.com/bank'

const CSV_CAP = 1_500_000

type BankPage = {
  url: () => string
  goto: (url: string, opts?: { waitUntil?: 'domcontentloaded'; timeout?: number }) => Promise<unknown>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  evaluate: (fn: any, ...args: any[]) => Promise<any>
}

export type DistroKidBankRead = {
  status: 'imported' | 'login' | 'too_large' | 'unavailable' | 'empty'
  note: string
  csv: string | null
}

export async function readDistroKidBankCsv(page: BankPage): Promise<DistroKidBankRead> {
  const first = await page.goto(DISTROKID_BANK_URL, { waitUntil: 'domcontentloaded', timeout: 45000 }).then(
    () => collect(page),
    () => null,
  )
  if (!first) return { status: 'unavailable', note: 'Could not open the DistroKid bank.', csv: null }

  let read = first
  let plan = planDistroKidBank(read, 1)
  if (plan.kind === 'open_detail') {
    await page.goto(plan.href, { waitUntil: 'domcontentloaded', timeout: 45000 })
    read = await collect(page)
    plan = planDistroKidBank(read, 0)
  }
  if (plan.kind === 'login') return { status: 'login', note: plan.note, csv: null }
  if (plan.kind === 'too_large') return { status: 'too_large', note: plan.note, csv: null }
  if (plan.kind === 'download') {
    const csv: string = await page.evaluate(((href: string) => {
      return fetch(href, { credentials: 'include' }).then(async (response) => {
        if (!response.ok) return ''
        const text = await response.text()
        return text.slice(0, 1_500_000)
      })
    }) as never, plan.href as never)
    if (csv && /,/.test(csv.split('\n')[0] || '') && !/<!doctype html/i.test(csv.slice(0, 200))) {
      if (csv.length >= CSV_CAP) {
        return {
          status: 'too_large',
          note: 'The bank CSV is larger than this pull allows. Download the CSV from DistroKid and ingest the file.',
          csv: null,
        }
      }
      return { status: 'imported', note: plan.note, csv }
    }
  }

  const table = await readBankTable(page, read)
  if (!table) return { status: 'unavailable', note: plan.note, csv: null }
  return table
}

async function readBankTable(page: BankPage, first: BankPageRead & { tableText: string }): Promise<DistroKidBankRead | null> {
  const seen = new Set<string>()
  let read = first
  let csv = ''
  let rows = 0
  let pages = 0
  while (pages < 12) {
    const fromPage = bankTableTextToCsv(read.tableText || '')
    if (!fromPage) break
    if (fromPage.truncated || fromPage.csv.length >= CSV_CAP) {
      return {
        status: 'too_large',
        note: 'The bank table is larger than this pull allows. Download the CSV from DistroKid and ingest the file.',
        csv: null,
      }
    }
    csv = csv ? mergeBankCsv(csv, fromPage.csv) : fromPage.csv
    rows += fromPage.rows
    pages += 1
    if (csv.length >= CSV_CAP) {
      return {
        status: 'too_large',
        note: 'The bank table is larger than this pull allows. Download the CSV from DistroKid and ingest the file.',
        csv: null,
      }
    }
    const next = nextBankPageHref(read)
    const here = page.url()
    if (!next || next === here || seen.has(next)) break
    seen.add(here)
    await page.goto(next, { waitUntil: 'domcontentloaded', timeout: 45000 })
    read = await collect(page)
  }
  if (!csv || rows < 1) return null
  const paged = pages > 1 ? ` across ${pages} pages` : ''
  return {
    status: 'imported',
    note: `Read ${rows} rows from the bank details table${paged}. DistroKid did not offer a CSV link on the page.`,
    csv,
  }
}

function mergeBankCsv(base: string, more: string): string {
  const extra = more.trim().split('\n').slice(1).filter(Boolean)
  if (!extra.length) return base
  return `${base.trim()}\n${extra.join('\n')}`
}

async function collect(page: BankPage): Promise<BankPageRead & { tableText: string }> {
  const read = await page.evaluate((() => {
    const links: { href: string; text: string }[] = []
    const seen = new Set<string>()
    for (const node of Array.from(document.querySelectorAll('a[href]'))) {
      const href = (node as HTMLAnchorElement).getAttribute('href') || ''
      const text = (node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160)
      const blob = `${href} ${text}`
      const interesting =
        /excruciating detail|download|export|\.csv/i.test(blob) ||
        /^(next|next page|older)\b/i.test(text)
      if (!interesting && links.length >= 40) continue
      const key = `${href}\n${text}`
      if (seen.has(key)) continue
      seen.add(key)
      links.push({ href, text: text || (/download|export|\.csv/i.test(href) ? 'Download' : '') })
      if (links.length >= 80) break
    }
    const html = document.documentElement?.innerHTML?.slice(0, 400000) || ''
    const hrefRe = /(?:href|action)\s*=\s*["']([^"']+)["']/gi
    let match: RegExpExecArray | null
    while ((match = hrefRe.exec(html))) {
      const href = match[1]
      if (!/\/bank\/[^"']*(download|export|\.csv)/i.test(href)) continue
      if (links.some((link) => link.href === href)) continue
      links.push({ href, text: 'Download' })
    }
    const raw = document.body?.innerText || ''
    let tableText = ''
    for (const table of Array.from(document.querySelectorAll('table'))) {
      const lines = Array.from(table.querySelectorAll('tr'))
        .map((row) =>
          Array.from(row.querySelectorAll('th,td'))
            .map((cell) => (cell.textContent || '').replace(/\s+/g, ' ').trim())
            .join('\t'),
        )
        .filter(Boolean)
      const text = lines.join('\n')
      if (/INSERTED\tREPORTED\tSALE MONTH\t/i.test(text) && text.length > tableText.length) tableText = text
    }
    return {
      url: location.href,
      text: raw.replace(/\s+/g, ' ').slice(0, 4000),
      tableText: (tableText || raw).slice(0, 1_500_000),
      links,
    }
  }) as never)
  return read as BankPageRead & { links: BankLink[]; tableText: string }
}
