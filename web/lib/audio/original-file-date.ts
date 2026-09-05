import { access, stat } from 'fs/promises'
import { basename, join } from 'path'
import { parseBuffer } from 'music-metadata'
import {
  lookupExportFolderDate,
  toLocalIsoDate,
} from '@/lib/audio/export-folder-dates'

export type OriginalFileDateSource =
  | 'export_folder_birthtime'
  | 'export_folder_mtime'
  | 'embedded_tag'
  | 'file_birthtime'
  | 'file_mtime'
  | 'client_last_modified'
  | 'unknown'

export type OriginalFileDate = {
  isoDate: string // YYYY-MM-DD
  year: number
  source: OriginalFileDateSource
  raw?: string
  exportPath?: string
}

function toIsoDate(d: Date): string | null {
  return toLocalIsoDate(d)
}

function yearFromIso(iso: string): number | null {
  const y = Number(iso.slice(0, 4))
  return Number.isFinite(y) && y >= 1900 && y <= 2100 ? y : null
}

/** Parse music-metadata / ID3-style date strings into YYYY-MM-DD. */
export function parseTagDateToIso(value: unknown): string | null {
  if (value == null) return null
  if (value instanceof Date) return toIsoDate(value)
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Seconds vs ms heuristic
    const ms = value > 1e12 ? value : value > 1e9 ? value * 1000 : NaN
    if (!Number.isFinite(ms)) return null
    return toIsoDate(new Date(ms))
  }
  const s = String(value).trim()
  if (!s) return null
  // YYYY or YYYY-MM or YYYY-MM-DD
  const m = s.match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?/)
  if (m) {
    const y = m[1]
    const mo = m[2] || '01'
    const d = m[3] || '01'
    return `${y}-${mo}-${d}`
  }
  const parsed = new Date(s)
  return toIsoDate(parsed)
}

export function originalDateFromClientLastModified(lastModifiedMs?: number | null): OriginalFileDate | null {
  if (lastModifiedMs == null || !Number.isFinite(lastModifiedMs) || lastModifiedMs <= 0) return null
  const iso = toIsoDate(new Date(lastModifiedMs))
  if (!iso) return null
  const year = yearFromIso(iso)
  if (year == null) return null
  return { isoDate: iso, year, source: 'client_last_modified' }
}

export function originalDateFromEmbeddedTags(common: {
  date?: unknown
  year?: unknown
  originaldate?: unknown
  originalyear?: unknown
}): OriginalFileDate | null {
  const candidates = [common.originaldate, common.date, common.originalyear, common.year]
  for (const c of candidates) {
    const iso = parseTagDateToIso(c)
    if (!iso) continue
    const year = yearFromIso(iso)
    if (year == null) continue
    return {
      isoDate: iso,
      year,
      source: 'embedded_tag',
      raw: c instanceof Date ? c.toISOString() : String(c),
    }
  }
  return null
}

/** Map public `/audio/...` or absolute vault URLs to a local public/audio path. */
export function vaultRelativePathFromFileUrl(fileUrl: string | null | undefined): string | null {
  if (!fileUrl) return null
  try {
    const raw = fileUrl.includes('://') ? new URL(fileUrl).pathname : fileUrl
    const decoded = decodeURIComponent(raw)
    const marker = '/audio/'
    const idx = decoded.toLowerCase().indexOf(marker)
    if (idx < 0) return null
    const rel = decoded.slice(idx + marker.length).replace(/^\/+/, '')
    if (!rel || rel.includes('..')) return null
    return rel
  } catch {
    return null
  }
}

export async function originalDateFromLocalVaultFile(
  relativeOrAbsPath: string,
): Promise<OriginalFileDate | null> {
  const abs = relativeOrAbsPath.startsWith('/')
    ? relativeOrAbsPath
    : join(process.cwd(), 'public', 'audio', relativeOrAbsPath)
  try {
    await access(abs)
    const st = await stat(abs)
    const birth = st.birthtime?.getTime?.() || 0
    const mtime = st.mtime?.getTime?.() || 0
    // Prefer birthtime when the OS reports a real one (not epoch / equal to mtime-only copies)
    const useBirth = birth > 0 && birth < mtime + 1000 * 60 * 60 * 24 * 365 * 50
    const chosen = useBirth && birth > 24 * 60 * 60 * 1000 ? st.birthtime : st.mtime
    const iso = toIsoDate(chosen)
    if (!iso) return null
    const year = yearFromIso(iso)
    if (year == null) return null
    return {
      isoDate: iso,
      year,
      source: useBirth && birth > 24 * 60 * 60 * 1000 ? 'file_birthtime' : 'file_mtime',
    }
  } catch {
    return null
  }
}

/**
 * Resolve best original creation/export date.
 * Priority: Exports SERGIK folder birthtime → embedded tags → client lastModified → vault fs
 * (Vault copies usually carry import-day birthtimes — export drive is root of truth.)
 */
export async function resolveOriginalFileDate(opts: {
  buffer?: Buffer
  fileName?: string
  title?: string | null
  artist?: string | null
  lastModifiedMs?: number | null
  vaultRelativePath?: string | null
  fileUrl?: string | null
  /** Skip export-folder lookup (tests / offline). */
  skipExportFolder?: boolean
}): Promise<OriginalFileDate | null> {
  const fileName =
    opts.fileName ||
    (opts.vaultRelativePath ? basename(opts.vaultRelativePath) : undefined) ||
    (opts.fileUrl ? basename(opts.fileUrl.split('?')[0] || '') : undefined)

  if (!opts.skipExportFolder) {
    try {
      const fromExports = await lookupExportFolderDate({
        fileName,
        fileUrl: opts.fileUrl,
        title: opts.title,
        artist: opts.artist,
      })
      if (fromExports) {
        return {
          isoDate: fromExports.isoDate,
          year: fromExports.year,
          source: fromExports.source,
          exportPath: fromExports.absPath,
        }
      }
    } catch {
      /* export volume may be unmounted */
    }
  }

  if (opts.buffer?.length) {
    try {
      const meta = await parseBuffer(opts.buffer, undefined, { duration: false })
      const fromTags = originalDateFromEmbeddedTags(meta.common as any)
      if (fromTags) return fromTags
    } catch {
      /* ignore */
    }
  }

  const fromClient = originalDateFromClientLastModified(opts.lastModifiedMs)
  if (fromClient) return fromClient

  const rel =
    opts.vaultRelativePath ||
    vaultRelativePathFromFileUrl(opts.fileUrl) ||
    null
  if (rel) {
    const fromFs = await originalDateFromLocalVaultFile(rel)
    if (fromFs) return fromFs
  }

  return null
}
