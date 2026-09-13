export function folderIdFromPlaylistId(playlistId: string): string {
  return playlistId.startsWith('playlist-') ? playlistId.slice('playlist-'.length) : playlistId
}

export function playlistIdForFolder(folderId: string): string {
  return folderId.startsWith('playlist-') ? folderId : `playlist-${folderId}`
}

export function isCollectionPlaylist(playlist: { id: string }): boolean {
  const folderId = folderIdFromPlaylistId(playlist.id)
  return playlist.id.startsWith('playlist-collection-') || folderId.startsWith('collection-')
}
