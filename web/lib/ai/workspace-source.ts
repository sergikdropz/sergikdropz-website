/**
 * Read-only view of this repo for Admin AI.
 * Paths stay under web/ and knowledge/. Secrets and build output stay closed.
 */

import fs from 'node:fs'
import path from 'node:path'

const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.next-dev-3000',
  '.next-dev-3001',
  '.next-build',
  '.git',
  'dist',
  'coverage',
  '.dev',
])

const CLOSED =
  /(^|\/)\.env($|\.)|credentials|id_rsa|\.pem$|\.p12$|\.key$|service-account|secret/i

const SEARCH_ROOTS = ['app', 'components', 'lib', 'contexts'] as const

export type WorkspaceSourceMatch = {
  path: string
  line: number
  text: string
  kind?: 'definition' | 'import' | 'mention'
}

export type WorkspaceSourceResult = {
  generatedAt: string
  action: 'read' | 'search'
  path?: string
  startLine?: number
  endLine?: number
  text?: string
  query?: string
  matches?: WorkspaceSourceMatch[]
  /** Body of the highest-ranked definition, when the query names one. */
  definition?: { path: string; startLine: number; text: string }
  /** Files that import the query. */
  importers?: WorkspaceSourceMatch[]
  truncated?: boolean
}

function workspaceDirs(): { web: string; knowledge: string; repo: string } {
  const cwd = process.cwd()
  const web = fs.existsSync(path.join(cwd, 'lib', 'ai')) ? cwd : path.join(cwd, 'web')
  const repo = path.dirname(web)
  return { web, knowledge: path.join(repo, 'knowledge'), repo }
}

function realDir(dir: string): string | null {
  try {
    return fs.realpathSync(dir)
  } catch {
    return null
  }
}

function isClosed(filePath: string): boolean {
  const base = path.basename(filePath)
  if (base.startsWith('.env')) return true
  return CLOSED.test(filePath.replace(/\\/g, '/'))
}

/** Resolve a user path to a real file under web/ or knowledge/. */
export function resolveWorkspaceFile(raw: string): { absolute: string; display: string } | { error: string } {
  const trimmed = raw.trim().replace(/\\/g, '/')
  if (!trimmed) return { error: 'Path is required.' }
  if (trimmed.includes('\0') || trimmed.split('/').includes('..')) {
    return { error: 'Path cannot leave web/ or knowledge/.' }
  }
  const { web, knowledge, repo } = workspaceDirs()
  const absolute = trimmed.startsWith('knowledge/')
    ? path.resolve(repo, trimmed)
    : trimmed.startsWith('web/')
      ? path.resolve(repo, trimmed)
      : path.resolve(web, trimmed)
  let real: string
  try {
    real = fs.realpathSync(absolute)
  } catch {
    return { error: `File not found: ${trimmed}` }
  }
  const roots = [realDir(web), realDir(knowledge)].filter((dir): dir is string => Boolean(dir))
  const allowed = roots.some((root) => real === root || real.startsWith(root + path.sep))
  if (!allowed || isClosed(real)) return { error: 'That file is outside the readable workspace.' }
  const stat = fs.statSync(real)
  if (!stat.isFile()) return { error: 'Path is not a file.' }
  if (stat.size > 1_500_000) return { error: 'File is too large to read.' }
  return { absolute: real, display: path.relative(repo, real).replace(/\\/g, '/') }
}

export function readWorkspaceFile(rawPath: string, offset = 1, limit = 180): WorkspaceSourceResult {
  const resolved = resolveWorkspaceFile(rawPath)
  if ('error' in resolved) throw new Error(resolved.error)
  const start = Math.max(1, Math.floor(offset) || 1)
  const take = Math.min(400, Math.max(1, Math.floor(limit) || 180))
  const lines = fs.readFileSync(resolved.absolute, 'utf8').split(/\r?\n/)
  const slice = lines.slice(start - 1, start - 1 + take)
  const numbered = slice.map((line, index) => `${start + index}|${line}`).join('\n')
  return {
    generatedAt: new Date().toISOString(),
    action: 'read',
    path: resolved.display,
    startLine: start,
    endLine: start + slice.length - 1,
    text: numbered.slice(0, 14_000),
    truncated: start - 1 + take < lines.length || numbered.length > 14_000,
  }
}

function walkFiles(dir: string, out: string[], budget: { left: number }) {
  if (budget.left <= 0) return
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (budget.left <= 0) return
    if (entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      walkFiles(full, out, budget)
      continue
    }
    if (!entry.isFile()) continue
    if (isClosed(full)) continue
    if (!/\.(tsx?|jsx?|mjs|cjs|css|md|json|sql)$/i.test(entry.name)) continue
    out.push(full)
    budget.left -= 1
  }
}

export function searchWorkspace(query: string): WorkspaceSourceResult {
  const needle = query.trim()
  if (needle.length < 2 || needle.length > 80) {
    throw new Error('Search query must be 2–80 characters.')
  }
  const { web, knowledge, repo } = workspaceDirs()
  const files: string[] = []
  const budget = { left: 2500 }
  for (const rel of SEARCH_ROOTS) walkFiles(path.join(web, rel), files, budget)
  walkFiles(knowledge, files, budget)

  const matches: Array<WorkspaceSourceMatch & { score: number }> = []
  const lower = needle.toLowerCase()
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const definitionRe = new RegExp(
    `\\b(?:function|class|const|let|type|interface|export)\\b[^\\n]{0,48}\\b${escaped}\\b`,
    'i',
  )
  let scannedPastCap = false
  for (const file of files) {
    let stat: fs.Stats
    try {
      stat = fs.statSync(file)
    } catch {
      continue
    }
    if (stat.size > 1_000_000) continue
    let text: string
    try {
      text = fs.readFileSync(file, 'utf8')
    } catch {
      continue
    }
    const display = path.relative(repo, file).replace(/\\/g, '/')
    const lines = text.split(/\r?\n/)
    let keptInFile = 0
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]!
      if (!line.toLowerCase().includes(lower)) continue
      const trimmed = line.trim()
      const kind: WorkspaceSourceMatch['kind'] = definitionRe.test(trimmed)
        ? 'definition'
        : /\bimport\b/.test(trimmed)
          ? 'import'
          : 'mention'
      const score = kind === 'definition' ? 5 : kind === 'import' ? 3 : 1
      matches.push({
        path: display,
        line: i + 1,
        text: trimmed.slice(0, 220),
        kind,
        score,
      })
      keptInFile += 1
      if (keptInFile >= 4) {
        scannedPastCap = true
        break
      }
    }
    if (matches.length > 400) scannedPastCap = true
  }

  matches.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path) || a.line - b.line)
  const ranked = matches.slice(0, 12).map(({ score: _score, ...match }) => match)
  const definitionHit = ranked.find((match) => match.kind === 'definition')
  const definition = definitionHit
    ? (() => {
        const body = readWorkspaceFile(definitionHit.path, definitionHit.line, 40)
        return { path: definitionHit.path, startLine: definitionHit.line, text: body.text || '' }
      })()
    : undefined
  const importers = ranked.filter((match) => match.kind === 'import').slice(0, 5)

  return {
    generatedAt: new Date().toISOString(),
    action: 'search',
    query: needle,
    matches: ranked,
    ...(definition ? { definition } : {}),
    ...(importers.length ? { importers } : {}),
    truncated: scannedPastCap || matches.length > 12,
  }
}

export function runWorkspaceSource(payload: Record<string, unknown>): WorkspaceSourceResult {
  const action = String(payload.action || 'search').toLowerCase()
  if (action === 'read') {
    const filePath = String(payload.path || '')
    const offset = typeof payload.offset === 'number' ? payload.offset : 1
    const limit = typeof payload.limit === 'number' ? payload.limit : 180
    return readWorkspaceFile(filePath, offset, limit)
  }
  if (action === 'search') {
    return searchWorkspace(String(payload.query || payload.q || ''))
  }
  throw new Error('read_workspace action must be search or read.')
}
