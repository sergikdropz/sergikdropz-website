import type { SupabaseClient } from '@supabase/supabase-js'
import { releaseArtworkKey } from '@/lib/marketing/release-artwork'
import { vaultFolderIdFromMarketingCopy } from '@/lib/studio/vault-import'
import { folderIdFromPlaylistId, playlistIdForFolder } from './ids'
import { propagateFolderArtworkToTracks, type FolderArtworkPropagateResult } from './propagate-folder-artwork'

export type SystemicCoverResult = FolderArtworkPropagateResult & {
  folderId: string | null
  playlistId: string | null
  releasesUpdated: number
}

/**
 * One cover for the whole collection: folder tile, linked playlist, every
 * sibling track, linked audio_files, and matching distribution_releases.
 * Used by track uploads, folder uploads, and track PATCH/PUT artwork saves.
 */
export async function persistSystemicCover(
  supabase: SupabaseClient,
  folderId: string | null | undefined,
  artworkUrl: string | null,
): Promise<SystemicCoverResult> {
  if (!folderId) {
    return {
      folderId: null,
      playlistId: null,
      tracksUpdated: 0,
      audioFilesUpdated: 0,
      releasesUpdated: 0,
    }
  }

  const resolvedFolderId = folderIdFromPlaylistId(folderId)
  const playlistId = playlistIdForFolder(resolvedFolderId)

  const { data: folderRow, error: folderError } = await supabase
    .from('music_library_folders')
    .update({ artwork_url: artworkUrl })
    .eq('id', resolvedFolderId)
    .select('id, name')
    .maybeSingle()
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
  const releasesUpdated = await propagateCoverToDistributionReleases(
    supabase,
    resolvedFolderId,
    folderRow?.name || null,
    artworkUrl,
  )

  return {
    folderId: resolvedFolderId,
    playlistId,
    ...propagated,
    releasesUpdated,
  }
}

/**
 * Best-effort: stamp the same cover onto studio / public releases linked to
 * this vault folder (marketing_copy._vault.folderId) or matching title key.
 */
export async function propagateCoverToDistributionReleases(
  supabase: SupabaseClient,
  folderId: string,
  folderName: string | null,
  artworkUrl: string | null,
): Promise<number> {
  try {
    const { data: releases, error } = await supabase
      .from('distribution_releases')
      .select('id, title, artwork_url, marketing_copy')
      .limit(500)

    if (error) {
      if (error.code === 'PGRST205' || error.message?.includes('Could not find')) {
        return 0
      }
      console.error('[artwork] Failed to load distribution_releases for cover sync:', error)
      return 0
    }

    const folderKey = folderName ? releaseArtworkKey(folderName) : ''
    const folderIdKey = releaseArtworkKey(folderId)
    const ids: string[] = []

    for (const row of releases || []) {
      const vaultFolder = vaultFolderIdFromMarketingCopy(
        (row.marketing_copy as Record<string, unknown>) || null,
      )
      if (vaultFolder && vaultFolder === folderId) {
        ids.push(row.id)
        continue
      }
      const titleKey = releaseArtworkKey(String(row.title || ''))
      if (
        titleKey &&
        ((folderKey && titleKey === folderKey) || (folderIdKey && titleKey === folderIdKey))
      ) {
        ids.push(row.id)
      }
    }

    if (!ids.length) return 0

    const uniqueIds = Array.from(new Set(ids))
    const { error: updateError } = await supabase
      .from('distribution_releases')
      .update({ artwork_url: artworkUrl })
      .in('id', uniqueIds)

    if (updateError) {
      console.error('[artwork] Failed to persist release covers:', updateError)
      return 0
    }
    return uniqueIds.length
  } catch (err) {
    console.error('[artwork] Release cover sync failed:', err)
    return 0
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
