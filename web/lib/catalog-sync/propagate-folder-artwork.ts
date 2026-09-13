import type { SupabaseClient } from '@supabase/supabase-js'

export type FolderArtworkPropagateResult = {
  tracksUpdated: number
  audioFilesUpdated: number
}

/**
 * Stamp folder/EP cover onto every track (and linked audio_files) in that folder.
 * Keeps catalog tiles, song rows, and embeds on one systemic cover.
 */
export async function propagateFolderArtworkToTracks(
  supabase: SupabaseClient,
  folderId: string,
  artworkUrl: string | null,
): Promise<FolderArtworkPropagateResult> {
  if (!folderId) return { tracksUpdated: 0, audioFilesUpdated: 0 }

  const { data: tracks, error } = await supabase
    .from('music_library_tracks')
    .update({ artwork_url: artworkUrl })
    .eq('folder_id', folderId)
    .select('id, audio_file_id')

  if (error) {
    console.error('[catalog-sync] Failed to propagate folder artwork to tracks:', error)
    throw error
  }

  const rows = tracks || []
  const audioIds = Array.from(
    new Set(rows.map((row) => row.audio_file_id).filter((id): id is string => Boolean(id))),
  )

  let audioFilesUpdated = 0
  const chunkSize = 80
  for (let i = 0; i < audioIds.length; i += chunkSize) {
    const slice = audioIds.slice(i, i + chunkSize)
    const { error: audioError, count } = await supabase
      .from('audio_files')
      .update({ artwork_url: artworkUrl })
      .in('id', slice)
    if (audioError) {
      console.error('[catalog-sync] Failed to propagate artwork to audio_files:', audioError)
      continue
    }
    audioFilesUpdated += typeof count === 'number' ? count : slice.length
  }

  return {
    tracksUpdated: rows.length,
    audioFilesUpdated,
  }
}
