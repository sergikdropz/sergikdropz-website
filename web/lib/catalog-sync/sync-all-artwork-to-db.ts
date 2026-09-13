import { readdir, stat } from 'fs/promises'
import { join } from 'path'
import type { SupabaseClient } from '@supabase/supabase-js'
import { persistSystemicCover } from './persist-systemic-cover'
import { persistEpArtworkOntoCrateTracks } from './persist-crate-ep-artwork'
import { stripArtworkCacheBust } from './artwork'
import { isLocalHomeSupabase } from '@/lib/supabase'
import { uploadLocalArtworkFile } from './publish-artwork-to-storage'

const IMAGE_EXT = /\.(avif|gif|jpe?g|png|webp)$/i

/** Folder file stems and DB ids differ by a `folder-` prefix and trailing hyphens. */
export function normalizeFolderArtworkId(id: string): string {
  let next = String(id || '').trim()
  if (next.startsWith('folder-')) next = next.slice('folder-'.length)
  return next.replace(/-+$/g, '')
}

function artworkLookupKeys(id: string): string[] {
  const raw = String(id || '').trim()
  const normalized = normalizeFolderArtworkId(raw)
  return Array.from(new Set([raw, normalized, normalized ? `folder-${normalized}` : ''].filter(Boolean)))
}

export type ArtworkSyncResult = {
  foldersConsidered: number
  foldersWritten: number
  tracksUpdated: number
  audioFilesUpdated: number
  crateTracksMatched: number
  skipped: number
  localFiles: number
}

export async function listLocalFolderArtwork(
  artworkDir = join(process.cwd(), 'public', 'images', 'audio', 'artwork'),
): Promise<Map<string, string>> {
  const best = new Map<string, { url: string; mtime: number }>()
  let files: string[] = []
  try {
    files = await readdir(artworkDir)
  } catch {
    return new Map()
  }

  for (const file of files) {
    if (!IMAGE_EXT.test(file)) continue
    const stem = file.replace(/\.[^.]+$/, '')
    const url = `/images/audio/artwork/${file}`
    let mtime = 0
    try {
      mtime = (await stat(join(artworkDir, file))).mtimeMs
    } catch {
      /* keep 0 */
    }
    for (const id of artworkLookupKeys(stem)) {
      const prev = best.get(id)
      if (!prev || mtime >= prev.mtime) best.set(id, { url, mtime })
    }
  }

  return new Map(Array.from(best, ([id, row]) => [id, row.url]))
}

function pickCover(
  folderId: string,
  folderArtwork: string | null | undefined,
  trackArtwork: string | null | undefined,
  localByFolderId: Map<string, string>,
): string | null {
  let local: string | undefined
  for (const key of artworkLookupKeys(folderId)) {
    local = localByFolderId.get(key)
    if (local) break
  }
  const folder = folderArtwork ? stripArtworkCacheBust(folderArtwork) : ''
  const track = trackArtwork ? stripArtworkCacheBust(trackArtwork) : ''
  return local || folder || track || null
}

async function publishLocalFilesToStorage(
  supabase: SupabaseClient,
  localByFolderId: Map<string, string>,
): Promise<Map<string, string>> {
  if (isLocalHomeSupabase()) return localByFolderId
  const published = new Map(localByFolderId)
  const uniqueFiles = new Map<string, string>()
  for (const url of localByFolderId.values()) {
    const file = stripArtworkCacheBust(url).split('/').pop()
    if (file) uniqueFiles.set(file, url)
  }
  for (const [file, localUrl] of uniqueFiles) {
    try {
      const publicUrl = await uploadLocalArtworkFile(supabase, file)
      for (const [id, url] of localByFolderId) {
        if (stripArtworkCacheBust(url) === stripArtworkCacheBust(localUrl)) {
          published.set(id, publicUrl)
        }
      }
    } catch (err) {
      console.warn(`[artwork] Storage publish failed for ${file}:`, err)
    }
  }
  return published
}

/**
 * Write every known collection cover into the database: folder tile, linked
 * playlist, every sibling track, and linked audio_files.
 */
export async function syncAllArtworkToDatabase(
  supabase: SupabaseClient,
  opts?: { localByFolderId?: Map<string, string>; skipStorage?: boolean },
): Promise<ArtworkSyncResult> {
  const listed = opts?.localByFolderId ?? (await listLocalFolderArtwork())
  const localByFolderId =
    opts?.localByFolderId || opts?.skipStorage
      ? listed
      : await publishLocalFilesToStorage(supabase, listed)

  const { data: folders, error: folderError } = await supabase
    .from('music_library_folders')
    .select('id, artwork_url')
  if (folderError) throw new Error(folderError.message || 'Failed to load folders')

  const { data: tracks, error: trackError } = await supabase
    .from('music_library_tracks')
    .select('folder_id, artwork_url, updated_at')
    .not('artwork_url', 'is', null)
    .neq('artwork_url', '')
    .order('updated_at', { ascending: false })
  if (trackError) throw new Error(trackError.message || 'Failed to load track covers')

  const trackArtByFolder = new Map<string, string>()
  for (const row of tracks || []) {
    if (!row.folder_id || !row.artwork_url || trackArtByFolder.has(row.folder_id)) continue
    trackArtByFolder.set(row.folder_id, row.artwork_url)
  }

  const result: ArtworkSyncResult = {
    foldersConsidered: (folders || []).length,
    foldersWritten: 0,
    tracksUpdated: 0,
    audioFilesUpdated: 0,
    crateTracksMatched: 0,
    skipped: 0,
    localFiles: localByFolderId.size,
  }

  for (const folder of folders || []) {
    const artworkUrl = pickCover(
      folder.id,
      folder.artwork_url,
      trackArtByFolder.get(folder.id),
      localByFolderId,
    )
    if (!artworkUrl) {
      result.skipped += 1
      continue
    }
    const written = await persistSystemicCover(supabase, folder.id, artworkUrl)
    result.foldersWritten += 1
    result.tracksUpdated += written.tracksUpdated
    result.audioFilesUpdated += written.audioFilesUpdated
  }

  const crateMatch = await persistEpArtworkOntoCrateTracks(supabase)
  result.crateTracksMatched = crateMatch.tracksUpdated
  result.tracksUpdated += crateMatch.tracksUpdated
  result.audioFilesUpdated += crateMatch.audioFilesUpdated

  return result
}
