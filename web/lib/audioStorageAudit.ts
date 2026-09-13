import type { SupabaseClient } from '@supabase/supabase-js'
import { extractPathFromSupabaseUrl } from '@/utils/extractPathFromSupabaseUrl'
import { audioFilePathLookupCandidates, normalizeAudioStorageKey } from '@/lib/audioStoragePath'

export const AUDIO_FILES_BUCKET = 'audio-files' as const

/**
 * Best storage key to check for a row in `audio_files` (file_path, else derived from file_url).
 */
export function primaryStorageKeyForAudioFile(row: {
  file_path?: string | null
  file_url?: string | null
}): string {
  const fp = row.file_path?.trim()
  if (fp) return normalizeAudioStorageKey(fp)
  const url = row.file_url?.trim()
  if (url) {
    const fromUrl = extractPathFromSupabaseUrl(url)
    return normalizeAudioStorageKey(fromUrl || url)
  }
  return ''
}

/**
 * True if any candidate path exists as an object in `audio-files` (list + exact filename match).
 */
export async function objectExistsInAudioFilesBucket(
  supabase: SupabaseClient,
  pathOrKey: string,
): Promise<{
  exists: boolean
  matchedKey?: string
  /** Set when at least one `list` call failed (not when the object is simply absent). */
  storageListError?: string
}> {
  const candidates = audioFilePathLookupCandidates(pathOrKey)
  if (candidates.length === 0) {
    return { exists: false }
  }

  let storageListError: string | undefined

  for (const k of candidates) {
    const parts = k.split('/').filter(Boolean)
    const fileName = parts.pop() || ''
    if (!fileName) continue
    const folder = parts.join('/')
    const { data, error } = await supabase.storage
      .from(AUDIO_FILES_BUCKET)
      .list(folder || '', { search: fileName, limit: 50 })

    if (error) {
      storageListError = error.message
      continue
    }
    if ((data || []).some((f) => f.name === fileName)) {
      return { exists: true, matchedKey: k }
    }
  }

  return { exists: false, matchedKey: candidates[0], storageListError }
}

export type AudioRowForAudit = {
  id: string
  file_path: string | null
  file_name: string | null
  file_url: string | null
  title: string | null
  artist: string | null
}
