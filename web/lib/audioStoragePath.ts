/**
 * Canonical keys for `audio-files` bucket + `audio_files.file_path` lookups.
 * PostgREST `.or(\`file_path.eq.${path}\`)` breaks when path contains `/`, spaces, or `,` — use `.eq()` with these candidates instead.
 */

import { extractPathFromSupabaseUrl } from '@/utils/extractPathFromSupabaseUrl'

function safeDecodePath(s: string): string {
  try {
    if (/%[0-9A-Fa-f]{2}/.test(s)) return decodeURIComponent(s)
  } catch {
    // keep
  }
  return s
}

/**
 * Storage object key: no leading slash, `audio/` prefix stripped, slashes Unix-style.
 * Also unwraps local/media-server URLs such as `/audio/...` or `http://127.0.0.1:8088/audio/...`.
 */
export function extractAudioRelativePath(input: string): string {
  if (!input || typeof input !== 'string') return ''
  let s = input.trim()
  if (!s) return ''
  s = s.split('#')[0].split('?')[0]

  if (s.startsWith('http://') || s.startsWith('https://')) {
    const extracted = extractPathFromSupabaseUrl(s)
    if (extracted) {
      s = extracted
    } else {
      try {
        s = new URL(s).pathname
      } catch {
        /* keep */
      }
    }
  }

  s = s.replace(/\\/g, '/').replace(/\/+/g, '/')
  s = safeDecodePath(s)
  s = s.replace(/^\/audio\//i, '').replace(/^\//, '')
  return s.replace(/^\/+|\/+$/g, '')
}

export function normalizeAudioStorageKey(input: string): string {
  return extractAudioRelativePath(input)
}

/**
 * Unique `file_path` values to try (exact DB match) when resolving a client path.
 */
export function audioFilePathLookupCandidates(rawPath: string): string[] {
  const a = normalizeAudioStorageKey(rawPath)
  const b = normalizeAudioStorageKey(safeDecodePath(rawPath.trim()))
  const c = a.replace(/\.wav(?=$|[?#])/i, '.mp3')
  const d = b.replace(/\.wav(?=$|[?#])/i, '.mp3')
  const out: string[] = []
  const push = (x: string) => {
    if (x === undefined || x === null) return
    if (x !== '' && !out.includes(x)) out.push(x)
  }
  push(a)
  if (b !== a) push(b)
  if (c !== a) push(c)
  if (d !== b && d !== a && d !== c) push(d)
  const swapExt = (p: string) => {
    if (/\.mp3$/i.test(p)) push(p.replace(/\.mp3$/i, '.wav'))
    if (/\.wav$/i.test(p)) push(p.replace(/\.wav$/i, '.mp3'))
  }
  for (const existing of [...out]) swapExt(existing)
  return out.length > 0 ? out : a ? [a] : []
}

/** Basename variants so `/audio/foo.mp3` can match DB `foo.wav`. */
export function audioFileNameLookupCandidates(rawPath: string): string[] {
  const key = normalizeAudioStorageKey(rawPath)
  const name = (key.split('/').pop() || '').trim()
  if (!name) return []
  const stem = name.replace(/\.(mp3|wav|aiff|flac|m4a)$/i, '')
  const out: string[] = []
  const push = (x: string) => {
    if (x && !out.includes(x)) out.push(x)
  }
  push(name)
  push(`${stem}.wav`)
  push(`${stem}.mp3`)
  return out
}
