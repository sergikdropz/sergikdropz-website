import { extractAudioRelativePath } from '@/lib/audioStoragePath'
import { extractVaultRelativePath } from '@/utils/normalizeVaultAudioUrl'

/** Canonical storage key for Sonic DNA / audio_files lookups (handles /api/audio/media/ proxy URLs). */
export function sonicDnaLookupPath(file?: string | null): string {
  if (!file) return ''
  const trimmed = String(file).trim()
  if (!trimmed) return ''
  return (
    extractVaultRelativePath(trimmed) ||
    extractAudioRelativePath(trimmed) ||
    trimmed
  )
}

export function appendSonicDnaLookupParams(
  params: URLSearchParams,
  opts: {
    libraryTrackId?: string | null
    audioFileId?: string | null
    file?: string | null
    title?: string | null
  },
) {
  const libraryId = String(opts.libraryTrackId || '').trim()
  const audioId = String(opts.audioFileId || '').trim()
  if (libraryId) params.set('trackId', libraryId)
  else if (audioId) params.set('trackId', audioId)
  if (audioId) params.set('audioFileId', audioId)
  const path = sonicDnaLookupPath(opts.file)
  if (path) params.set('path', path)
  const title = String(opts.title || '').trim()
  if (title) params.set('title', title)
  return params
}
