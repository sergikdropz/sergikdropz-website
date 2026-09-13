import fs from 'node:fs'
import path from 'node:path'
import { parseSonicDna, wrapMeasuredAsDna, type SonicDnaMeasured } from '@/lib/audio/sonic-dna-quality'
import { audioFileNameLookupCandidates, extractAudioRelativePath } from '@/lib/audioStoragePath'

function knowledgeRoot(): string | null {
  const cwd = process.cwd()
  const candidates = [path.join(cwd, 'knowledge'), path.join(cwd, '..', 'knowledge')]
  return candidates.find((dir) => fs.existsSync(path.join(dir, 'library-analysis'))) || null
}

type CatalogRow = {
  id?: string
  slug?: string
  file?: string
  libraryTrackIds?: string[]
}

let catalogIndex: {
  byId: Map<string, string>
  byStem: Map<string, string>
  byIdToFile: Map<string, string>
} | null = null

function stemOf(value: string): string {
  const base = (value.split('/').pop() || value).trim().toLowerCase()
  return base.replace(/\.(mp3|wav|aiff|flac|m4a|json)$/i, '').replace(/\s+/g, ' ')
}

function loadCatalogIndex() {
  if (catalogIndex) return catalogIndex
  const byId = new Map<string, string>()
  const byStem = new Map<string, string>()
  const byIdToFile = new Map<string, string>()
  const root = knowledgeRoot()
  if (!root) {
    catalogIndex = { byId, byStem, byIdToFile }
    return catalogIndex
  }
  const catalogPath = path.join(root, 'library-analysis', 'catalog.json')
  if (fs.existsSync(catalogPath)) {
    const rows = JSON.parse(fs.readFileSync(catalogPath, 'utf8')) as CatalogRow[]
    for (const row of rows) {
      const audioId = String(row.id || '').trim()
      if (!audioId) continue
      byId.set(audioId, audioId)
      if (row.file) {
        byIdToFile.set(audioId, row.file)
        if (row.slug) byIdToFile.set(row.slug, row.file)
      }
      if (row.slug) {
        byId.set(row.slug, audioId)
        const stem = stemOf(row.slug)
        if (stem && !byStem.has(stem)) byStem.set(stem, audioId)
      }
      for (const libraryId of row.libraryTrackIds || []) {
        if (libraryId) {
          byId.set(libraryId, audioId)
          if (row.file) byIdToFile.set(libraryId, row.file)
        }
      }
    }
  }
  const measuredDir = path.join(root, 'library-analysis', 'measured')
  if (fs.existsSync(measuredDir)) {
    for (const name of fs.readdirSync(measuredDir)) {
      if (!name.endsWith('.json')) continue
      const id = name.replace(/\.json$/, '')
      byId.set(id, id)
      byId.set(id.slice(0, 8), id)
      try {
        const measured = JSON.parse(fs.readFileSync(path.join(measuredDir, name), 'utf8')) as {
          audioPath?: string
        }
        if (measured?.audioPath) {
          const stem = stemOf(measured.audioPath)
          if (stem && !byStem.has(stem)) byStem.set(stem, id)
        }
      } catch {
        // skip unreadable measured file
      }
    }
  }
  catalogIndex = { byId, byStem, byIdToFile }
  return catalogIndex
}

export function resolveMeasuredLookupIds(
  trackId?: string | null,
  filePath?: string | null,
): string[] {
  const index = loadCatalogIndex()
  const ids: string[] = []
  const push = (value?: string | null) => {
    const id = String(value || '').trim()
    if (id && !ids.includes(id)) ids.push(id)
  }
  push(trackId)
  if (trackId && index.byId.has(trackId)) push(index.byId.get(trackId))
  const short = String(trackId || '').match(/--([0-9a-f]{8})$/i)?.[1]
  if (short && index.byId.has(short.toLowerCase())) push(index.byId.get(short.toLowerCase()))
  if (short && index.byId.has(short)) push(index.byId.get(short))
  for (const name of filePath ? audioFileNameLookupCandidates(filePath) : []) {
    const stem = stemOf(name)
    if (stem && index.byStem.has(stem)) push(index.byStem.get(stem))
  }
  const relative = filePath ? extractAudioRelativePath(filePath) : ''
  if (relative) {
    const stem = stemOf(relative)
    if (stem && index.byStem.has(stem)) push(index.byStem.get(stem))
  }
  return ids
}

function resolveCatalogTrackRelativePath(ids: Array<string | null | undefined>): string | null {
  const index = loadCatalogIndex()
  for (const raw of ids) {
    const id = String(raw || '').trim()
    if (!id) continue
    const file = index.byIdToFile.get(id)
    if (file) return file
    const audioId = index.byId.get(id)
    if (audioId) {
      const byAudio = index.byIdToFile.get(audioId)
      if (byAudio) return byAudio
    }
  }
  return null
}

function loadLocalUnifiedTrackDna(ids: Array<string | null | undefined>): Record<string, any> | null {
  const root = knowledgeRoot()
  if (!root) return null
  const rel = resolveCatalogTrackRelativePath(ids)
  if (!rel) return null
  const abs = path.join(root, 'library-analysis', rel)
  if (!fs.existsSync(abs)) return null
  try {
    const doc = JSON.parse(fs.readFileSync(abs, 'utf8')) as { analysis?: { sonicDna?: unknown } }
    const sonicDna = parseSonicDna(doc?.analysis?.sonicDna)
    return sonicDna || null
  } catch {
    return null
  }
}

function loadLocalMeasuredOnly(ids: Array<string | null | undefined>): Record<string, any> | null {
  const root = knowledgeRoot()
  if (!root) return null
  const measuredDir = path.join(root, 'library-analysis', 'measured')
  if (!fs.existsSync(measuredDir)) return null

  for (const raw of ids) {
    const id = String(raw || '').trim()
    if (!id) continue
    const exact = path.join(measuredDir, `${id}.json`)
    if (fs.existsSync(exact)) {
      const measured = JSON.parse(fs.readFileSync(exact, 'utf8')) as SonicDnaMeasured
      if (measured && typeof measured === 'object') return wrapMeasuredAsDna(measured)
    }
  }
  return null
}

/** Compiled unified intelligence + encyclopedia card from knowledge/library-analysis/tracks/*.json */
export function loadLocalUnifiedSonicDna(ids: Array<string | null | undefined>): Record<string, any> | null {
  return loadLocalUnifiedTrackDna(ids)
}

/** Primary loader: intelligence + encyclopedia knowledge card (tracks/*.json), then measured/*.json. */
export function loadSonicDnaIntelligenceCard(opts: {
  trackId?: string | null
  audioFileId?: string | null
  filePath?: string | null
}): Record<string, any> | null {
  return loadSonicDnaFromKnowledge(opts)
}

/** Resolve Sonic DNA: unified track analysis first, then measured/*.json fallback. */
export function loadSonicDnaFromKnowledge(opts: {
  trackId?: string | null
  audioFileId?: string | null
  filePath?: string | null
}): Record<string, any> | null {
  const ids = [
    opts.audioFileId,
    opts.trackId,
    ...resolveMeasuredLookupIds(opts.trackId, opts.filePath),
    ...resolveMeasuredLookupIds(opts.audioFileId, opts.filePath),
  ]
  return loadLocalUnifiedSonicDna(ids) || loadLocalMeasuredOnly(ids)
}

/** @deprecated Prefer loadSonicDnaFromKnowledge — same behavior, kept for callers. */
export function loadLocalMeasuredDna(ids: Array<string | null | undefined>): Record<string, any> | null {
  return loadLocalUnifiedTrackDna(ids) || loadLocalMeasuredOnly(ids)
}
