/**
 * Private download links for a selected track or a whole release.
 * Client-safe: no Node fs, cookies, or database.
 */

import { isValidPartyEmail } from '@/lib/studio/rights-contract-send'

export type ShareDownloadFormat = 'mp3' | 'wav'
export type ShareDownloadScope = 'track' | 'release'

export type ShareDownloadSelection = {
  format: ShareDownloadFormat
  scope: ShareDownloadScope
  /** Library track id when scope is `track`. Empty for a whole release. */
  trackId: string
}

const DSP_LIBRARY_WAV_PREFIX = 'dsp-masters/library'
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|flac|aiff?)$/i

export function isShareDownloadFormat(value: unknown): value is ShareDownloadFormat {
  return value === 'mp3' || value === 'wav'
}

export function isShareDownloadScope(value: unknown): value is ShareDownloadScope {
  return value === 'track' || value === 'release'
}

/** Whole-release grants store an empty track id so the unique key is stable. */
export function grantTrackKey(selection: Pick<ShareDownloadSelection, 'scope' | 'trackId'>): string {
  return selection.scope === 'track' ? selection.trackId.trim() : ''
}

export function normalizeDownloadEmails(raw: unknown): { emails: string[]; rejected: string[] } {
  const parts = Array.isArray(raw) ? raw : String(raw ?? '').split(/[\s,;]+/)
  const emails: string[] = []
  const rejected: string[] = []
  const seen = new Set<string>()
  for (const part of parts) {
    const email = String(part || '').trim().toLowerCase()
    if (!email) continue
    if (!isValidPartyEmail(email)) {
      rejected.push(email)
      continue
    }
    if (seen.has(email)) continue
    seen.add(email)
    emails.push(email)
  }
  return { emails, rejected }
}

export function parseDownloadSelection(
  input: { format?: unknown; scope?: unknown; trackId?: unknown },
  knownTrackIds?: string[],
): { ok: true; selection: ShareDownloadSelection } | { ok: false; error: string } {
  if (!isShareDownloadFormat(input.format)) {
    return { ok: false, error: 'format must be mp3 or wav' }
  }
  if (!isShareDownloadScope(input.scope)) {
    return { ok: false, error: 'scope must be track or release' }
  }
  const trackId = String(input.trackId || '').trim()
  if (input.scope === 'track') {
    if (!trackId) return { ok: false, error: 'Pick a track to share' }
    if (knownTrackIds && !knownTrackIds.includes(trackId)) {
      return { ok: false, error: 'That track is not on this release' }
    }
  }
  return {
    ok: true,
    selection: {
      format: input.format,
      scope: input.scope,
      trackId: input.scope === 'track' ? trackId : '',
    },
  }
}

export function shareDownloadPath(token: string, selection: ShareDownloadSelection): string {
  const params = new URLSearchParams()
  params.set('format', selection.format)
  params.set('scope', selection.scope)
  if (selection.scope === 'track' && selection.trackId) params.set('track', selection.trackId)
  return `/d/${encodeURIComponent(token)}?${params.toString()}`
}

export function shareDownloadUrl(
  origin: string,
  token: string,
  selection: ShareDownloadSelection,
): string {
  const base = origin.replace(/\/$/, '')
  return `${base}${shareDownloadPath(token, selection)}`
}

function safeNamePart(value: string, fallback: string): string {
  const cleaned = value
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
  return cleaned || fallback
}

export function downloadFileName(artist: string, title: string, ext: 'mp3' | 'wav' | 'zip'): string {
  const name = `${safeNamePart(artist, 'SERGIK')} - ${safeNamePart(title, 'Download')}`
  return `${name}.${ext}`
}

/** Unique zip entry names when two tracks share a title. */
export function uniqueDownloadFileName(
  artist: string,
  title: string,
  ext: 'mp3' | 'wav',
  used: Set<string>,
): string {
  const base = downloadFileName(artist, title, ext)
  if (!used.has(base.toLowerCase())) {
    used.add(base.toLowerCase())
    return base
  }
  const stem = base.slice(0, -(ext.length + 1))
  let n = 2
  let next = `${stem} (${n}).${ext}`
  while (used.has(next.toLowerCase())) {
    n += 1
    next = `${stem} (${n}).${ext}`
  }
  used.add(next.toLowerCase())
  return next
}

function vaultRelative(input: string | null | undefined): string | null {
  if (!input) return null
  let value = String(input).trim()
  if (!value) return null
  value = value.split('?')[0]?.split('#')[0] || ''
  const storage = '/object/public/audio-files/'
  const storageAt = value.indexOf(storage)
  if (storageAt >= 0) value = value.slice(storageAt + storage.length)
  else {
    const proxy = '/api/audio/media/'
    const proxyAt = value.toLowerCase().indexOf(proxy)
    if (proxyAt >= 0) value = value.slice(proxyAt + proxy.length)
    else {
      const audioAt = value.toLowerCase().indexOf('/audio/')
      if (audioAt >= 0) value = value.slice(audioAt + '/audio/'.length)
    }
  }
  try {
    if (/%[0-9A-Fa-f]{2}/.test(value)) value = decodeURIComponent(value)
  } catch {
    /* keep */
  }
  value = value.replace(/^\/+/, '').replace(/^audio\//i, '')
  if (!AUDIO_EXT.test(value)) return null
  return value
}

function uniquePaths(paths: Array<string | null>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const path of paths) {
    if (!path) continue
    const key = path.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(path)
  }
  return out
}

function wavHintsFromMeta(meta: unknown): string[] {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return []
  const row = meta as Record<string, unknown>
  const hints: string[] = []
  if (typeof row.distribution_wav_url === 'string') hints.push(row.distribution_wav_url)
  if (typeof row.dspMastersPath === 'string') hints.push(row.dspMastersPath)
  if (typeof row.file_path === 'string' && /\.wav$/i.test(row.file_path)) hints.push(row.file_path)
  return hints
}

export function mp3RelativeCandidates(sources: Array<string | null | undefined>): string[] {
  return uniquePaths(
    sources.map((src) => {
      const rel = vaultRelative(src)
      if (!rel) return null
      const mp3 = rel.replace(/\.wav$/i, '.mp3')
      return /\.mp3$/i.test(mp3) ? mp3 : null
    }),
  )
}

export function wavRelativeCandidates(opts: {
  stream?: string | null
  hints?: Array<string | null | undefined>
}): string[] {
  const hinted = (opts.hints || []).map((hint) => {
    const rel = vaultRelative(hint)
    return rel && /\.wav$/i.test(rel) ? rel : null
  })
  const stream = vaultRelative(opts.stream)
  const sibling = stream ? stream.replace(/\.(mp3|m4a|aac|flac)$/i, '.wav') : null
  const siblingWav = sibling && /\.wav$/i.test(sibling) ? sibling : null
  const base = siblingWav?.split('/').pop() || null
  const library = base && /\.wav$/i.test(base) ? `${DSP_LIBRARY_WAV_PREFIX}/${base}` : null
  return uniquePaths([...hinted, siblingWav, library])
}

export { wavHintsFromMeta }
