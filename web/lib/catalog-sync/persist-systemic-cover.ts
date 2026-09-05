import type { SupabaseClient } from '@supabase/supabase-js'
import { folderIdFromPlaylistId, playlistIdForFolder } from './ids'
import { propagateFolderArtworkToTracks, type FolderArtworkPropagateResult } from './propagate-folder-artwork'

export type SystemicCoverResult = FolderArtworkPropagateResult & {
  folderId: string | null
  playlistId: string | null
}

/**
 * One cover for the whole collection: folder tile, linked playlist, every
 * sibling track, and linked audio_files. Used by track uploads, folder
 * uploads, and track PATCH/PUT artwork saves.
 */
export async function persistSystemicCover(
  supabase: SupabaseClient,
  folderId: string | null | undefined,
  artworkUrl: string | null,
): Promise<SystemicCoverResult> {
  if (!folderId) {
    return { folderId: null, playlistId: null, tracksUpdated: 0, audioFilesUpdated: 0 }
  }

  const resolvedFolderId = folderIdFromPlaylistId(folderId)
  const playlistId = playlistIdForFolder(resolvedFolderId)

  const { error: folderError } = await supabase
    .from('music_library_folders')
    .update({ artwork_url: artworkUrl })
    .eq('id', resolvedFolderId)
  if (folderError) {
    throw new Error(folderError.message || 'Failed to save folder cover')
  }

  const { error: playlistError } = await supabase
    .from('music_library_playlists')
    .update({ artwork_url: artworkUrl })
    .eq('id', playlistId)
  if (playlistError) {
    console.error('[artwork] Failed to persist playlist cover:', playlistError)
  }

  const propagated = await propagateFolderArtworkToTracks(supabase, resolvedFolderId, artworkUrl)
  return {
    folderId: resolvedFolderId,
    playlistId,
    ...propagated,
  }
}

export async function resolveTrackCollection(
  supabase: SupabaseClient,
  opts: { trackId?: string | null; audioFileId?: string | null },
): Promise<{ folderId: string | null; audioFileId: string | null; trackId: string | null }> {
  if (opts.trackId) {
    const { data } = await supabase
      .from('music_library_tracks')
      .select('id, folder_id, audio_file_id')
      .eq('id', opts.trackId)
      .maybeSingle()
    return {
      folderId: data?.folder_id || null,
      audioFileId: data?.audio_file_id || opts.audioFileId || null,
      trackId: data?.id || opts.trackId,
    }
  }
  if (opts.audioFileId) {
    const { data } = await supabase
      .from('music_library_tracks')
      .select('id, folder_id, audio_file_id')
      .eq('audio_file_id', opts.audioFileId)
      .limit(1)
      .maybeSingle()
    return {
      folderId: data?.folder_id || null,
      audioFileId: opts.audioFileId,
      trackId: data?.id || null,
    }
  }
  return { folderId: null, audioFileId: opts.audioFileId || null, trackId: null }
}
