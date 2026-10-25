/** Read-only plan for a DistroKid bank page. Never treats Continue, Submit, or Let's do it as a download. */

export type BankLink = { href: string; text: string }

export type BankPageRead = {
  url: string
  text: string
  links: BankLink[]
}

export type BankPlan =
  | { kind: 'login'; note: string }
  | { kind: 'download'; href: string; note: string }
  | { kind: 'open_detail'; href: string; note: string }
  | { kind: 'too_large'; note: string }
  | { kind: 'unavailable'; note: string }

const BLOCKED = /\b(submit|continue|let'?s do it|checkout|pay now|upload album)\b/i

export function planDistroKidBank(page: BankPageRead, hopsLeft = 1): BankPlan {
  const url = page.url || ''
  const text = page.text || ''
  if (!/distrokid\.com/i.test(url)) {
    return { kind: 'unavailable', note: 'The open page is not DistroKid.' }
  }
  if (/\/signin|\/login|\/register/i.test(url) || /enter your password|log in to distrokid|sign in to distrokid/i.test(text)) {
    return { kind: 'login', note: 'DistroKid is showing a login page. Sign in on this Chromium desk, then pull the bank again.' }
  }

  const download = page.links.find((link) => isDownloadLink(link))
  if (download) {
    return { kind: 'download', href: absoluteDistroKid(download.href, url), note: 'Direct bank CSV link. No submit button.' }
  }

  if (/50,?000|let'?s do it|priority report/i.test(text)) {
    return {
      kind: 'too_large',
      note: 'This bank export needs DistroKid’s emailed report. That button is not clicked from here. Download the CSV yourself and ingest it.',
    }
  }

  const detail = hopsLeft > 0 ? page.links.find((link) => isDetailLink(link)) : undefined
  if (detail) {
    return {
      kind: 'open_detail',
      href: absoluteDistroKid(detail.href, url),
      note: 'Opening the bank detail page. Still not submitting a report.',
    }
  }

  return {
    kind: 'unavailable',
    note: 'No CSV link on this bank page. Open Excruciating Detail while you are driving, or ingest a downloaded CSV.',
  }
}

function isSameSite(href: string): boolean {
  return /distrokid\.com/i.test(href) || href.startsWith('/')
}

function isDownloadLink(link: BankLink): boolean {
  if (BLOCKED.test(link.text)) return false
  const href = link.href.trim()
  if (!href || href.startsWith('javascript:') || href.startsWith('#')) return false
  if (!isSameSite(href)) return false
  if (/\.csv(\?|$)/i.test(href)) return true
  // App and marketing downloads also contain the word download. The bank export stays on /bank.
  if (!/\/bank\b/i.test(href)) return false
  return /download|export|\.csv|spreadsheet/i.test(`${href} ${link.text}`)
}

const BANK_DETAILS = 'https://distrokid.com/bank/details/'

/** Next page of the bank table. Filter dropdowns and submit controls are not followed. */
export function nextBankPageHref(page: BankPageRead): string | null {
  const link = page.links.find((item) => {
    if (BLOCKED.test(item.text) || BLOCKED.test(item.href)) return false
    const href = item.href.trim()
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return false
    if (!isSameSite(href)) return false
    return /^(next|next page|older)\b/i.test(item.text.trim())
  })
  if (!link) return null
  try {
    return absoluteDistroKid(link.href, page.url || BANK_DETAILS)
  } catch {
    return null
  }
}

function isDetailLink(link: BankLink): boolean {
  if (BLOCKED.test(link.text)) return false
  const href = link.href.trim()
  if (!href || href.startsWith('javascript:') || href.startsWith('#')) return false
  if (!isSameSite(href)) return false
  return /excruciating detail/i.test(link.text)
}

function csvCell(value: string): string {
  const cell = value.trim()
  if (/[",\n]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`
  return cell
}

/** The bank details page prints the statement as a tab-separated table. Wrapped lines are joined back to the header width. */
export function bankTableTextToCsv(text: string): { csv: string; rows: number; truncated: boolean } | null {
  const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const idx = src.search(/INSERTED\tREPORTED\tSALE MONTH\t/i)
  if (idx < 0) return null
  const rawLines = src
    .slice(idx)
    .split('\n')
    .map((line) => line.replace(/\s+$/g, ''))
    .filter((line) => line.length > 0)
  const header = rawLines[0]?.split('\t') || []
  const width = header.length
  if (width < 4) return null
  const rows = [header.map(csvCell).join(',')]
  let pending: string[] = []
  let truncated = false
  const flush = () => {
    if (pending.length < width) return
    rows.push(pending.slice(0, width).map(csvCell).join(','))
    pending = pending.slice(width)
  }
  for (const line of rawLines.slice(1)) {
    if (!line.includes('\t') && pending.length === 0) break
    pending.push(...(line.includes('\t') ? line.split('\t') : [line.trim()]))
    flush()
    if (rows.length >= 20000) {
      truncated = true
      break
    }
  }
  if (rows.length < 2) return null
  return { csv: rows.join('\n'), rows: rows.length - 1, truncated }
}

function absoluteDistroKid(href: string, base: string): string {
  const url = new URL(href, base)
  if (!/distrokid\.com$/i.test(url.hostname) && !url.hostname.endsWith('.distrokid.com')) {
    throw new Error('Bank link left DistroKid.')
  }
  return url.toString()
}
