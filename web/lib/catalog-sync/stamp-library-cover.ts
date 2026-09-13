import { folderIdFromPlaylistId, playlistIdForFolder } from './ids'
import { catalogItemMatchesCoverEvent, playerTrackMatchesCoverEvent } from './artwork'

export type StampableTrack = {
  id?: string
  folderId?: string
  artwork?: string
}

export type StampableFolder = {
  id: string
  artwork?: string
  children?: StampableFolder[]
  tracks?: StampableTrack[]
}

export type StampablePlaylist = {
  id: string
  artwork?: string
}

/**
 * Walk a folder tree and stamp one cover onto the matching collection:
 * folder tile + every track in that folder (and any track whose folderId matches).
 */
export function stampLibraryCover<T extends StampableFolder>(
  folders: T[],
  folderId: string,
  artwork: string | undefined,
): T[] {
  if (!folderId || !folders.length) return folders

  let changed = false
  const next = folders.map((folder) => {
    const children = folder.children
      ? stampLibraryCover(folder.children as T[], folderId, artwork)
      : folder.children
    const childrenChanged = children !== folder.children

    let tracksChanged = false
    let nextTracks = folder.tracks
    if (folder.tracks?.length) {
      const folderMatch = catalogItemMatchesCoverEvent(folder, folderId)
      nextTracks = folder.tracks.map((track) => {
        const belongs =
          folderMatch || playerTrackMatchesCoverEvent(track, { folderId })
        if (!belongs || track.artwork === artwork) return track
        tracksChanged = true
        return { ...track, artwork }
      })
      if (!tracksChanged) nextTracks = folder.tracks
    }

    const artworkChanged =
      catalogItemMatchesCoverEvent(folder, folderId) && folder.artwork !== artwork
    if (!artworkChanged && !childrenChanged && !tracksChanged) return folder

    changed = true
    return {
      ...folder,
      ...(artworkChanged ? { artwork } : {}),
      ...(childrenChanged ? { children } : {}),
      ...(tracksChanged ? { tracks: nextTracks } : {}),
    }
  })

  return changed ? next : folders
}

export function stampPlaylistCovers<T extends StampablePlaylist>(
  playlists: T[],
  opts: { folderId?: string | null; playlistId?: string | null; artwork: string | undefined },
): T[] {
  const { folderId, playlistId, artwork } = opts
  if (!playlists.length || (!folderId && !playlistId)) return playlists

  let changed = false
  const next = playlists.map((playlist) => {
    const linked =
      (playlistId && playlist.id === playlistId) ||
      (folderId &&
        (playlist.id === playlistIdForFolder(folderId) ||
          playlist.id === folderId ||
          folderIdFromPlaylistId(playlist.id) === folderId))
    if (!linked || playlist.artwork === artwork) return playlist
    changed = true
    return { ...playlist, artwork }
  })

  return changed ? next : playlists
}
