/**
 * Playlist rows get a companion root folder (id = playlist id without `playlist-` prefix).
 * Those belong in the playlist sidebar, not the vault folder grid.
 */
export function playlistCompanionFolderId(playlistId: string): string {
  return playlistId.startsWith('playlist-') ? playlistId.slice('playlist-'.length) : playlistId
}

export function isPlaylistCompanionFolderId(
  folderId: string,
  playlists: Array<{ id?: string | null }> | null | undefined
): boolean {
  if (!folderId || !playlists?.length) return false
  for (const playlist of playlists) {
    if (!playlist?.id) continue
    if (playlistCompanionFolderId(String(playlist.id)) === folderId) return true
  }
  return false
}

const COPY_SUFFIX = ' (copy)'

/**
 * Drop vault tiles that are playlist shadows, or `Name (copy)` when `Name` already exists.
 */
export function filterVaultFolderTiles<T extends { id: string; name: string }>(
  folders: T[],
  playlists: Array<{ id?: string | null; name?: string | null }> | null | undefined
): T[] {
  if (!folders.length) return folders

  const playlistNames = new Set(
    (playlists || [])
      .map((p) => (typeof p.name === 'string' ? p.name.trim().toLowerCase() : ''))
      .filter(Boolean)
  )
  const folderNames = new Set(folders.map((f) => f.name.trim().toLowerCase()))

  return folders.filter((folder) => {
    if (isPlaylistCompanionFolderId(folder.id, playlists)) return false

    const name = folder.name.trim()
    if (name.toLowerCase().endsWith(COPY_SUFFIX)) {
      const base = name.slice(0, -COPY_SUFFIX.length).trim()
      if (!base) return true
      const baseKey = base.toLowerCase()
      if (playlistNames.has(baseKey) || folderNames.has(baseKey)) return false
    }

    return true
  })
}
