import type { SupabaseClient } from '@supabase/supabase-js'

export type FolderArtworkBackfillResult = {
  foldersUpdated: number
}

/**
 * Durable reverse fill: copy a track cover onto folders that have no artwork_url.
 * Complements propagateFolderArtworkToTracks (folder → tracks).
 */
export async function backfillFolderArtworkFromTracks(
  supabase: SupabaseClient,
  folderIds?: string[],
): Promise<FolderArtworkBackfillResult> {
  let folderQuery = supabase
    .from('music_library_folders')
    .select('id')
    .or('artwork_url.is.null,artwork_url.eq.')

  if (folderIds?.length) {
    folderQuery = folderQuery.in('id', folderIds)
  }

  const { data: folders, error: folderError } = await folderQuery
  if (folderError) {
    console.error('[catalog-sync] backfill folder list failed:', folderError)
    throw folderError
  }

  const ids = (folders || []).map((f) => f.id).filter(Boolean)
  if (!ids.length) return { foldersUpdated: 0 }

  const { data: tracks, error: trackError } = await supabase
    .from('music_library_tracks')
    .select('folder_id, artwork_url, updated_at')
    .in('folder_id', ids)
    .not('artwork_url', 'is', null)
    .neq('artwork_url', '')
    .order('updated_at', { ascending: false })

  if (trackError) {
    console.error('[catalog-sync] backfill track art failed:', trackError)
    throw trackError
  }

  const artByFolder = new Map<string, string>()
  for (const t of tracks || []) {
    if (!t.folder_id || !t.artwork_url) continue
    if (!artByFolder.has(t.folder_id)) {
      artByFolder.set(t.folder_id, t.artwork_url)
    }
  }

  let foldersUpdated = 0
  for (const [folderId, artworkUrl] of artByFolder) {
    const { error } = await supabase
      .from('music_library_folders')
      .update({ artwork_url: artworkUrl })
      .eq('id', folderId)
      .or('artwork_url.is.null,artwork_url.eq.')
    if (!error) foldersUpdated += 1
  }

  return { foldersUpdated }
}
