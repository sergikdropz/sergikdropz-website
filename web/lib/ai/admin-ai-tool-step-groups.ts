/**
 * Scan lines for a finished tool log.
 * Built at render time from the stored steps. The summaries themselves stay intact
 * so the ghost and the raw double-click text keep the original page dump.
 */

export type ToolStepLogInput = {
  id: string
  tool: string
  payload?: Record<string, unknown> | null
  status: 'running' | 'done' | 'error'
  summary: string
}

export type ToolStepKind = 'explored' | 'read' | 'scrolled' | 'checked' | 'blocked' | 'ran' | 'audited'

export type ToolStepBurst = {
  id: string
  kind: ToolStepKind
  label: string
  count: number
  tone: 'neutral' | 'blocked' | 'error' | 'running'
  running: boolean
  raw: string
}

export type ToolStepLog = {
  outcome: string
  live: string
  bursts: ToolStepBurst[]
}

const CHROME = new Set([
  'upload',
  'my music',
  'stats',
  'splits',
  'publishing',
  'publishing new',
  'upgrade',
  'bank',
  'refer a friend',
  'master a track',
  'upload video',
  'upload music',
  'help',
  'support center',
  'company',
  'product',
  'plans',
  'privacy policy',
  'cookie policy',
  'cookie settings',
  'terms of use',
  'sitemap',
  'distribution agreement',
  'show all releases',
  'track list',
  'enhance audio',
  'credits',
  'vizy',
  'download',
  'plain lyrics',
  'synced lyrics',
  'new',
])

type Fact = {
  kind: ToolStepKind
  tone: ToolStepBurst['tone']
  label: string
  mergeKey: string
  host: string
  running: boolean
  raw: string
  id: string
}

function actionOf(step: ToolStepLogInput): string {
  const fromPayload = String(step.payload?.action ?? '').trim().toLowerCase()
  if (fromPayload) return fromPayload
  const first = firstLine(step.summary)
  if (/^opened\s+https?:/i.test(first)) return 'navigate'
  if (/^scrolled\b/i.test(first)) return 'wheel'
  if (/^clicked\b/i.test(first)) return 'click'
  if (/^typed\b/i.test(first)) return 'type'
  if (step.tool === 'admin_browser') return 'read'
  return ''
}

function firstLine(text: string): string {
  return text.split(/\n/).map((line) => line.trim()).find(Boolean) ?? ''
}

function linesOf(text: string): string[] {
  return text.split(/\n/).map((line) => line.trim()).filter(Boolean)
}

function isChrome(line: string): boolean {
  const key = line.replace(/\s+/g, ' ').trim().toLowerCase()
  if (!key || CHROME.has(key)) return true
  if (/^\d+$/.test(key)) return true
  if (/^https?:/i.test(line)) return true
  if (/privacy policy|cookie policy|terms of use|all rights reserved|©/i.test(line)) return true
  if (/card ending/i.test(line)) return true
  return false
}

function pathname(url: string): string {
  try {
    return new URL(url).pathname.replace(/\/+$/, '') || '/'
  } catch {
    return ''
  }
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function hostLabel(url: string): string {
  const host = hostname(url)
  if (host.includes('distrokid')) return 'DistroKid'
  if (host.includes('soundexchange') || host.includes('sxdirect')) return 'SoundExchange'
  if (host.includes('spotify')) return 'Spotify'
  if (host.includes('youtube')) return 'YouTube'
  if (host.includes('instagram')) return 'Instagram'
  return host
}

function pagePhrase(url: string): string {
  const path = pathname(url)
  const host = hostname(url)
  if (path.includes('/admin/login')) return 'Admin Login'
  if (host.includes('distrokid')) {
    if (path.includes('/isrc')) return 'the ISRC page'
    if (path.includes('/mymusic')) return 'My Music'
    if (path.includes('/dashboard/album')) return 'the album page'
    if (path === '/new' || path.startsWith('/new/')) return 'the upload form'
  }
  if (host.includes('soundexchange') || host.includes('sxdirect')) return 'SoundExchange'
  if (path && path !== '/') return path
  return hostLabel(url) || 'the page'
}

function openedUrl(summary: string): string {
  const match = firstLine(summary).match(/^Opened\s+(https?:\/\/\S+)/i)
  if (!match?.[1]) return ''
  return match[1].replace(/[.)]+$/, '')
}

function requestedUrl(step: ToolStepLogInput): string {
  const raw = step.payload?.url
  return typeof raw === 'string' ? raw.trim() : ''
}

function isAdminLogin(summary: string, url: string): boolean {
  if (pathname(url).includes('/admin/login')) return true
  return /admin\/login/i.test(summary) || (/admin login/i.test(summary) && /sign in/i.test(summary))
}

function albumTitle(summary: string): string | null {
  for (const line of linesOf(summary)) {
    if (/^opened\s+https?:/i.test(line)) continue
    if (/^distrokid codes$/i.test(line)) continue
    if (/^\d+\.\s/.test(line)) continue
    if (isChrome(line)) continue
    if (line.length < 2 || line.length > 48) continue
    if (line.includes(':')) continue
    if (!/[a-z]/i.test(line) || !line.includes(' ')) continue
    return line
  }
  return null
}

function upcCode(summary: string): string | null {
  return summary.match(/\bUPC:\s*(\d{12,13})\b/i)?.[1] ?? null
}

function releaseDate(summary: string): string | null {
  return summary.match(/\bRelease date:\s*([A-Za-z]+ \d{1,2}, \d{4})/i)?.[1] ?? null
}

function albumDetail(summary: string, url: string): string {
  if (!pathname(url).includes('/dashboard/album')) return ''
  const bits = [albumTitle(summary), upcCode(summary) ? `UPC ${upcCode(summary)}` : '', releaseDate(summary) ?? '']
  return bits.filter(Boolean).join(' · ')
}

function clipSentence(text: string): string {
  const sentence = text.replace(/\s+/g, ' ').trim()
  if (sentence.length <= 140) return sentence
  const cut = sentence.slice(0, 139)
  const space = cut.lastIndexOf(' ')
  return `${(space > 60 ? cut.slice(0, space) : cut).trim()}…`
}

function quoteTarget(summary: string): string {
  return firstLine(summary).match(/[“"]([^”"]+)[”"]/)?.[1]?.trim() ?? ''
}

function classify(step: ToolStepLogInput, inheritedUrl: string): Fact {
  const running = step.status === 'running'
  const raw = step.summary
  const summary = step.summary || ''
  const action = actionOf(step)
  const requested = requestedUrl(step)
  const landed = openedUrl(summary) || (action === 'navigate' || action === 'open' ? '' : inheritedUrl)
  const placeUrl = landed || requested || inheritedUrl
  const host = hostLabel(placeUrl)
  const tone: Fact['tone'] = running ? 'running' : step.status === 'error' ? 'error' : 'neutral'

  if (step.tool === 'admin_browser') {
    if (step.status === 'error') {
      return fact(step, 'blocked', 'error', clipSentence(firstLine(summary) || 'The browser step failed'), `blocked|error|${step.id}`, host, running, raw)
    }
    if (isAdminLogin(summary, landed || requested)) {
      return fact(step, 'blocked', 'blocked', 'Stopped on Admin Login', 'blocked|admin-login', 'Admin Login', running, raw)
    }
    if (action === 'wheel') {
      const page = pagePhrase(inheritedUrl || landed)
      const where = page === 'the page' ? 'the page' : page
      return fact(step, 'scrolled', tone, `Scrolled ${where}`, `scrolled|${pathname(inheritedUrl || landed) || 'page'}`, host, running, raw)
    }
    if (action === 'read') {
      if (isAdminLogin(summary, inheritedUrl)) {
        return fact(step, 'blocked', 'blocked', 'Stopped on Admin Login', 'blocked|admin-login', 'Admin Login', running, raw)
      }
      const page = pagePhrase(inheritedUrl || landed)
      const detail = albumDetail(summary, inheritedUrl || landed)
      const label = detail ? `Read ${page} · ${detail}` : `Read ${page}`
      return fact(step, 'read', tone, label, `read|${pathname(inheritedUrl || landed) || page}`, host, running, raw)
    }
    if (action === 'inspect' || action === 'probe_fields' || action === 'status') {
      const page = pagePhrase(placeUrl)
      return fact(step, 'checked', tone, `Checked ${page}`, `checked|${pathname(placeUrl) || page}`, host, running, raw)
    }
    if (action === 'click' || action === 'type' || action === 'press') {
      const target = quoteTarget(summary)
      const label =
        action === 'click'
          ? `Clicked${target ? ` ${target}` : ''}`
          : action === 'type'
            ? `Typed${target ? ` into ${target}` : ''}`
            : `Pressed${target ? ` ${target}` : ' a key'}`
      return fact(step, 'explored', tone, label, `acted|${action}|${target}`, host, running, raw)
    }
    if (action === 'navigate' || action === 'open' || action === 'back' || action === 'reload') {
      const landedPath = pathname(landed)
      const requestedPath = pathname(requested)
      if (requested && landed && requestedPath && landedPath && requestedPath !== landedPath) {
        const label = `Tried ${pagePhrase(requested)} · landed on ${pagePhrase(landed)}`
        return fact(step, 'blocked', 'blocked', label, `blocked|${requestedPath}|${landedPath}`, hostLabel(landed) || host, running, raw)
      }
      const page = pagePhrase(landed || requested)
      const detail = albumDetail(summary, landed || requested)
      const verb = action === 'back' ? 'Went back to' : action === 'reload' ? 'Reloaded' : 'Opened'
      const label = detail ? `${verb} ${page} · ${detail}` : `${verb} ${page}`
      return fact(step, 'explored', tone, label, `explored|${landedPath || requestedPath || page}`, hostLabel(landed || requested) || host, running, raw)
    }
  }

  if (step.status === 'error') {
    return fact(step, 'blocked', 'error', clipSentence(firstLine(summary) || `${step.tool} failed`), `blocked|error|${step.id}`, '', running, raw)
  }
  if (/^audit_/i.test(step.tool)) {
    return fact(step, 'audited', tone, clipSentence(firstLine(summary) || 'Audited the release'), `audited|${step.tool}|${firstLine(summary).slice(0, 80)}`, '', running, raw)
  }
  const sentence = firstLine(summary)
  if (/^would\s+/i.test(sentence)) {
    const rest = sentence.replace(/^would\s+/i, '')
    return fact(step, 'ran', tone, clipSentence(`Staged a preview to ${rest}`), `ran|preview|${step.tool}|${rest.slice(0, 80)}`, '', running, raw)
  }
  if (/^query_/i.test(step.tool)) {
    return fact(step, 'checked', tone, clipSentence(sentence || `Checked ${step.tool}`), `checked|${step.tool}|${sentence.slice(0, 80)}`, '', running, raw)
  }
  return fact(step, 'ran', tone, clipSentence(sentence || step.tool), `ran|${step.tool}|${sentence.slice(0, 80)}`, '', running, raw)
}

function fact(
  step: ToolStepLogInput,
  kind: ToolStepKind,
  tone: Fact['tone'],
  label: string,
  mergeKey: string,
  host: string,
  running: boolean,
  raw: string,
): Fact {
  return { kind, tone, label, mergeKey, host, running, raw, id: step.id }
}

function inheritUrl(step: ToolStepLogInput, previous: string): string {
  const landed = openedUrl(step.summary)
  if (landed) return landed
  const requested = requestedUrl(step)
  const action = actionOf(step)
  if ((action === 'navigate' || action === 'open') && requested) return requested
  return previous
}

function countLabel(label: string, count: number): string {
  if (count <= 1) return label
  return `${label} ${count}×`
}

function redirectClause(label: string): string {
  const tried = label.match(/^Tried (.+?) · landed on (.+)$/)
  if (tried) {
    const page = tried[1].replace(/^the /i, '')
    const pageLabel = page.charAt(0).toUpperCase() + page.slice(1)
    return `${pageLabel} redirected to ${tried[2]}`
  }
  if (/stopped on admin login/i.test(label)) return 'stopped on Admin Login'
  return label
}

function primaryHost(facts: Fact[]): string {
  const counts = new Map<string, number>()
  for (const factRow of facts) {
    if (!factRow.host || factRow.host === 'Admin Login') continue
    counts.set(factRow.host, (counts.get(factRow.host) ?? 0) + 1)
  }
  let best = ''
  let bestCount = 0
  for (const [host, count] of counts) {
    if (count > bestCount) {
      best = host
      bestCount = count
    }
  }
  return best
}

function outcomeFor(facts: Fact[], bursts: ToolStepBurst[]): string {
  if (!bursts.length) return ''
  const blocked = [...bursts].reverse().find((burst) => burst.tone === 'blocked' || burst.tone === 'error')
  const host = primaryHost(facts)
  if (blocked) {
    const clause = redirectClause(blocked.label.replace(/ \d+×$/, ''))
    if (host && !/admin login/i.test(clause)) return `Explored ${host} · ${clause}`
    return /stopped on/i.test(clause) ? `Blocked · ${clause}` : clause
  }
  if (host && bursts.some((burst) => burst.kind === 'explored' || burst.kind === 'read' || burst.kind === 'scrolled')) {
    return `Explored ${host}`
  }
  return bursts[bursts.length - 1]?.label ?? ''
}

export function toolStepLog(steps: ToolStepLogInput[]): ToolStepLog {
  const facts: Fact[] = []
  let inherited = ''
  for (const step of steps) {
    const factRow = classify(step, inherited)
    facts.push(factRow)
    inherited = inheritUrl(step, inherited)
  }

  const drafts: Array<ToolStepBurst & { mergeKey: string }> = []
  for (const factRow of facts) {
    const previous = drafts[drafts.length - 1]
    if (previous && !previous.running && !factRow.running && previous.mergeKey === factRow.mergeKey) {
      previous.count += 1
      const base =
        factRow.label.length > previous.label.replace(/ \d+×$/, '').length
          ? factRow.label
          : previous.label.replace(/ \d+×$/, '')
      previous.label = countLabel(base, previous.count)
      if (factRow.raw.length > previous.raw.length) previous.raw = factRow.raw
      continue
    }
    drafts.push({
      id: factRow.id,
      kind: factRow.kind,
      label: factRow.label,
      count: 1,
      tone: factRow.tone,
      running: factRow.running,
      raw: factRow.raw,
      mergeKey: factRow.mergeKey,
    })
  }
  const bursts: ToolStepBurst[] = drafts.map(({ mergeKey: _mergeKey, ...burst }) => burst)

  const liveBurst = bursts[bursts.length - 1]
  const live = liveBurst ? `${liveBurst.label} · in progress` : 'In progress'
  return { outcome: outcomeFor(facts, bursts), live, bursts }
}
