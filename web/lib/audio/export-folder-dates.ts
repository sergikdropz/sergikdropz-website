/**
 * Resolve original creation/export dates from the SERGIK Exports folder
 * (root of truth on the local drive — not vault import copies).
 */

import { readdir, stat } from 'fs/promises'
import { basename, extname, join } from 'path'

export const DEFAULT_EXPORTS_ROOT = '/Volumes/SERGIK/Exports SERGIK'

const AUDIO_EXT = new Set(['.wav', '.mp3', '.aiff', '.aif', '.flac', '.m4a', '.aac'])

export type ExportFolderDateSource = 'export_folder_birthtime' | 'export_folder_mtime'

export type ExportFolderHit = {
  isoDate: string
  year: number
  source: ExportFolderDateSource
  absPath: string
  score: number
}

type IndexedExport = {
  absPath: string
  stemKey: string
  ext: string
  birthMs: number
  mtimeMs: number
  folderScore: number
}

let cachedRoot: string | null = null
let cachedIndex: IndexedExport[] | null = null
let cachedByStem: Map<string, IndexedExport[]> | null = null

export function getExportsRoot(): string {
  return (
    process.env.SERGIK_EXPORTS_ROOT?.trim() ||
    process.env.EXPORTS_SERGIK_ROOT?.trim() ||
    DEFAULT_EXPORTS_ROOT
  )
}

/** Calendar date in local timezone (avoid UTC day-shift for Pacific). */
export function toLocalIsoDate(d: Date): string | null {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function normalizeAudioStem(value: string): string {
  let s = String(value || '')
  try {
    if (/%[0-9A-Fa-f]{2}/.test(s)) s = decodeURIComponent(s)
  } catch {
    /* keep */
  }
  s = s.replace(/\\/g, '/')
  s = basename(s)
  s = s.replace(/\.(mp3|wav|aiff?|flac|m4a|aac|ogg|opus|webm)$/i, '')
  s = s.toLowerCase()
  s = s.replace(/^sergik\s*[x×]\s*/i, 'sergik ')
  // Drop parentheticals / VIP tags for broader matching
  s = s.replace(/\([^)]*\)/g, ' ')
  s = s.replace(/\[[^\]]*\]/g, ' ')
  s = s.replace(/[_\-–—:]+/g, ' ')
  s = s.replace(/[^\w\s']/g, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  return s
}

function expandMatchKeys(key: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (k: string) => {
    const v = k.replace(/\s+/g, ' ').trim()
    if (!v || seen.has(v)) return
    seen.add(v)
    out.push(v)
  }
  push(key)
  push(key.replace(/^sergik\s+/, ''))
  // Artist x Artist - Title → Title
  const collab = key.match(/^.+?\s+[x×]\s+.+?\s+(.+)$/)
  if (collab?.[1]) push(collab[1])
  // Artist - Title when encoded without dash (already spaces)
  const words = key.split(' ')
  if (words.length >= 3 && words[0] === 'sergik') {
    push(words.slice(1).join(' '))
  }
  // Drop trailing filler words
  push(key.replace(/\s+(musik|music|song|track|edit|mix|vip|v\d+|instrumental)$/i, '').trim())
  // Plural/singular soft variants
  if (key.endsWith('s') && key.length > 5) push(key.slice(0, -1))
  else if (key.length > 5) push(`${key}s`)
  // Freedom / Freedm typo family
  push(key.replace(/\bfreedm\b/g, 'freedom').replace(/\bfreedom\b/g, 'freedm'))
  return out
}

function candidateKeysFromHints(hints: Array<string | null | undefined>): string[] {
  const keys: string[] = []
  const seen = new Set<string>()
  for (const h of hints) {
    if (!h) continue
    const base = normalizeAudioStem(h)
    if (!base) continue
    for (const key of expandMatchKeys(base)) {
      if (seen.has(key)) continue
      seen.add(key)
      keys.push(key)
    }
  }
  return keys
}

function folderPriority(absPath: string, root: string): number {
  const rel = absPath.slice(root.length).replace(/^\/+/, '').toLowerCase()
  if (rel.startsWith('release masters')) return 100
  if (rel.startsWith('full ep mix')) return 90
  if (rel.startsWith('sergik wavs')) return 80
  if (rel.startsWith('sergik mp3s')) return 70
  if (rel.startsWith('sergik stems')) return 15
  return 40
}

async function walkAudioFiles(root: string): Promise<IndexedExport[]> {
  const out: IndexedExport[] = []

  async function walk(dir: string) {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of entries) {
      const name = ent.name
      if (name.startsWith('._') || name === '.DS_Store') continue
      const abs = join(dir, name)
      if (ent.isDirectory()) {
        await walk(abs)
        continue
      }
      if (!ent.isFile()) continue
      const ext = extname(name).toLowerCase()
      if (!AUDIO_EXT.has(ext)) continue
      try {
        const st = await stat(abs)
        const birthMs =
          typeof (st as any).birthtimeMs === 'number' && (st as any).birthtimeMs > 0
            ? (st as any).birthtimeMs
            : st.birthtime?.getTime?.() || 0
        const mtimeMs = st.mtimeMs || st.mtime?.getTime?.() || 0
        const chosenBirth = birthMs > 24 * 60 * 60 * 1000 ? birthMs : mtimeMs
        out.push({
          absPath: abs,
          stemKey: normalizeAudioStem(name),
          ext,
          birthMs: chosenBirth,
          mtimeMs,
          folderScore: folderPriority(abs, root),
        })
      } catch {
        /* skip unreadable */
      }
    }
  }

  await walk(root)
  return out
}

export async function loadExportFolderIndex(
  root = getExportsRoot(),
  opts?: { forceReload?: boolean },
): Promise<{ root: string; count: number; byStem: Map<string, IndexedExport[]> }> {
  if (!opts?.forceReload && cachedIndex && cachedByStem && cachedRoot === root) {
    return { root, count: cachedIndex.length, byStem: cachedByStem }
  }

  const index = await walkAudioFiles(root)
  const byStem = new Map<string, IndexedExport[]>()
  for (const row of index) {
    if (!row.stemKey) continue
    for (const key of expandMatchKeys(row.stemKey)) {
      const list = byStem.get(key) || []
      list.push(row)
      byStem.set(key, list)
    }
  }

  cachedRoot = root
  cachedIndex = index
  cachedByStem = byStem
  return { root, count: index.length, byStem }
}

function extBonus(ext: string): number {
  if (ext === '.wav' || ext === '.aiff' || ext === '.aif' || ext === '.flac') return 10
  if (ext === '.mp3') return 5
  return 0
}

function pickBest(candidates: IndexedExport[]): IndexedExport | null {
  if (!candidates.length) return null
  return [...candidates].sort((a, b) => {
    // Prefer masters / full mixes over stems
    if (b.folderScore !== a.folderScore) return b.folderScore - a.folderScore
    // Prefer earlier creation (root export day)
    if (a.birthMs !== b.birthMs) return a.birthMs - b.birthMs
    // Prefer WAV masters
    return extBonus(b.ext) - extBonus(a.ext)
  })[0]
}

/**
 * Find the best Export-folder creation date for a vault track / file name.
 */
export async function lookupExportFolderDate(opts: {
  fileName?: string | null
  fileUrl?: string | null
  title?: string | null
  artist?: string | null
  root?: string
}): Promise<ExportFolderHit | null> {
  const root = opts.root || getExportsRoot()
  const { byStem } = await loadExportFolderIndex(root)

  const titleHint =
    opts.artist && opts.title
      ? `${opts.artist} - ${opts.title}`
      : opts.title || null

  const keys = candidateKeysFromHints([
    opts.fileName,
    opts.fileUrl,
    titleHint,
    opts.title,
  ])

  let best: IndexedExport | null = null
  let bestScore = 0

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    const exact = byStem.get(key)
    if (exact?.length) {
      const picked = pickBest(exact)
      if (picked) {
        const score = 1000 - i * 10 + picked.folderScore
        if (!best || score > bestScore) {
          best = picked
          bestScore = score
        }
      }
      continue
    }

    // Word-boundary contains for shorter titles (e.g. "Giddup" in "sergik giddup 125bpm…")
    if (key.length >= 5 && key.length < 8) {
      for (const [stem, list] of byStem) {
        const asWord =
          stem === key ||
          stem.startsWith(`${key} `) ||
          stem.endsWith(` ${key}`) ||
          stem.includes(` ${key} `)
        if (!asWord) continue
        const picked = pickBest(list)
        if (!picked) continue
        const score = 700 - i * 10 + picked.folderScore
        if (!best || score > bestScore) {
          best = picked
          bestScore = score
        }
      }
      continue
    }

    // Fuzzy: stem contains key or key contains stem (min length 8)
    if (key.length < 8) continue
    for (const [stem, list] of byStem) {
      if (stem.length < 8) continue
      if (!stem.includes(key) && !key.includes(stem)) continue
      const picked = pickBest(list)
      if (!picked) continue
      const overlap = Math.min(stem.length, key.length) / Math.max(stem.length, key.length)
      if (overlap < 0.55 && !stem.includes(key) && !key.includes(stem)) continue
      // Prefer inclusion matches even when length ratio is low
      const inclusionBonus = stem.includes(key) || key.includes(stem) ? 80 : 0
      if (overlap < 0.55 && !inclusionBonus) continue
      const score = 400 + Math.round(overlap * 100) + inclusionBonus - i * 10 + picked.folderScore
      if (!best || score > bestScore) {
        best = picked
        bestScore = score
      }
    }
  }

  if (!best) return null
  const useBirth = best.birthMs > 24 * 60 * 60 * 1000
  const when = new Date(useBirth ? best.birthMs : best.mtimeMs)
  const isoDate = toLocalIsoDate(when)
  if (!isoDate) return null
  const year = Number(isoDate.slice(0, 4))
  if (!Number.isFinite(year) || year < 1900 || year > 2100) return null

  return {
    isoDate,
    year,
    source: useBirth ? 'export_folder_birthtime' : 'export_folder_mtime',
    absPath: best.absPath,
    score: bestScore,
  }
}
