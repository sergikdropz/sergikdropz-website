/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
'use client'

import { useMusicPlayer } from '@/contexts/MusicPlayerContext'
import MusicPlayer from './MusicPlayer'
import { useCallback } from 'react'
import {
  fetchAllTracksSummaryForHydration,
  fetchFolders,
  fetchPlaylists,
  fetchTracks,
  fetchTracksByIds,
  peekCachedMusicLibrary,
  resolveSmartPlaylist,
  type FolderItem,
  type Track,
} from '@/utils/musicLibraryApi'
import {
  collectReleaseFoldersFromTree,
  getRecentPlayedReleaseIds,
  getRecentPlayedTrackIds,
  isOrderedReleaseRandomScope,
  pickNextOrderedTracks,
  pickRandomReleaseFolder,
  pickRandomUnusedTracks,
  readCatalogRandomSetting,
  rememberPlayedReleaseId,
  rememberPlayedTrackId,
  sortTracksInReleaseOrder,
} from '@/lib/audio/catalog-random'

function collectTracksFromCachedLibrary(): Track[] {
  const data = peekCachedMusicLibrary()
  if (!data?.folders?.length) return []
  const out: Track[] = []
  const seen = new Set<string>()
  const walk = (items: FolderItem[]) => {
    for (const folder of items) {
      for (const track of folder.tracks || []) {
        if (!track?.id || seen.has(track.id)) continue
        seen.add(track.id)
        out.push({ ...track, folderId: track.folderId || folder.id })
      }
      if (folder.children?.length) walk(folder.children)
    }
  }
  walk(data.folders)
  return out
}

async function resolveAllTracksFallback(): Promise<Track[]> {
  const cached = collectTracksFromCachedLibrary()
  if (cached.length) return cached
  return fetchAllTracksSummaryForHydration({ includeArchived: false })
}

async function listReleaseFolders(): Promise<ReturnType<typeof collectReleaseFoldersFromTree>> {
  const cached = peekCachedMusicLibrary()?.folders
  if (cached?.length) {
    const fromCache = collectReleaseFoldersFromTree(cached)
    if (fromCache.length) return fromCache
  }
  try {
    const flat = await fetchFolders(false)
    return collectReleaseFoldersFromTree(
      (flat || []).map((folder) => ({
        id: folder.id,
        type: folder.type,
        name: folder.name,
        parentId: folder.parentId ?? null,
        hidden: !!(folder.hidden || folder.is_archived),
        children: folder.children,
      })),
    )
  } catch {
    return []
  }
}

export default function GlobalMusicPlayer() {
  const {
    currentTrack,
    queue,
    currentIndex,
    currentSource,
    isPlaying,
    setIsPlaying,
    setQueue,
    setCurrentIndex,
    setCurrentTrack,
    setCurrentSource,
    nextTrack: contextNextTrack,
    previousTrack,
    handleShuffle,
    handleQueueChange,
    removeFromQueue,
  } = useMusicPlayer()

  const getTracksFromSource = useCallback(
    async (source: { type: 'folder' | 'playlist' | null; id: string | null } | null): Promise<Track[]> => {
      if (!source || !source.id) {
        try {
          return await resolveAllTracksFallback()
        } catch (error) {
          console.error('Error fetching All Tracks:', error)
          return []
        }
      }

      if (source.type === 'folder') {
        try {
          return await fetchTracks(source.id)
        } catch (error) {
          console.error('Error fetching folder tracks:', error)
          try {
            return await resolveAllTracksFallback()
          } catch {
            return []
          }
        }
      }

      if (source.type === 'playlist') {
        try {
          const playlists = await fetchPlaylists({ includeHidden: true })
          const playlist = playlists.find((item) => item.id === source.id)
          if (playlist?.trackIds?.length) {
            const ordered = await fetchTracksByIds(playlist.trackIds)
            if (ordered.length) return ordered
          }
        } catch (error) {
          console.error('Error fetching playlist tracks:', error)
        }
        try {
          const smart = await resolveSmartPlaylist(source.id)
          if (smart.tracks?.length) return smart.tracks
        } catch {
          /* not a smart playlist */
        }
      }

      try {
        return await resolveAllTracksFallback()
      } catch {
        return []
      }
    },
    [],
  )

  const jumpToRandomRelease = useCallback(async (): Promise<boolean> => {
    const releases = await listReleaseFolders()
    if (!releases.length) return false
    const currentId = currentSource?.type === 'folder' ? currentSource.id : null
    if (currentId) rememberPlayedReleaseId(currentId)
    const nextRelease = pickRandomReleaseFolder(releases, {
      keepExcluded: currentId ? [currentId] : [],
      recentIds: getRecentPlayedReleaseIds(),
    })
    if (!nextRelease?.id) return false

    const releaseTracks = sortTracksInReleaseOrder(await fetchTracks(nextRelease.id))
    if (!releaseTracks.length) return false

    rememberPlayedReleaseId(nextRelease.id)
    const source = { type: 'folder' as const, id: nextRelease.id }
    setCurrentSource(source)
    setQueue(releaseTracks)
    setCurrentIndex(0)
    setCurrentTrack(releaseTracks[0])
    return true
  }, [
    currentSource,
    setCurrentSource,
    setQueue,
    setCurrentIndex,
    setCurrentTrack,
  ])

  const nextTrack = useCallback(async () => {
    if (queue.length > 0 && currentIndex >= queue.length - 1) {
      try {
        const catalogRandom = readCatalogRandomSetting()
        const newTracks = await getTracksFromSource(currentSource)
        if (newTracks.length > 0) {
          const existingIds = new Set(queue.map((t) => t.id))
          if (currentTrack?.id) rememberPlayedTrackId(currentTrack.id)

          let tracksToAdd: Track[] = []
          if (catalogRandom && isOrderedReleaseRandomScope(currentSource)) {
            tracksToAdd = pickNextOrderedTracks(newTracks, existingIds, 1, {
              preferAfterId: currentTrack?.id ?? null,
            })
            if (tracksToAdd.length === 0) {
              if (await jumpToRandomRelease()) return
            }
          } else if (catalogRandom) {
            tracksToAdd = pickRandomUnusedTracks(
              unusedPool(newTracks, existingIds),
              existingIds,
              1,
              {
                allowReshuffle: true,
                keepExcluded: currentTrack ? [currentTrack.id] : [],
                recentIds: getRecentPlayedTrackIds(),
              },
            )
          } else {
            tracksToAdd = newTracks.filter((t) => !existingIds.has(t.id))
          }

          if (tracksToAdd.length > 0) {
            const updatedQueue = [...queue, ...tracksToAdd]
            setQueue(updatedQueue)
            const nextIndex = queue.length
            setCurrentIndex(nextIndex)
            setCurrentTrack(updatedQueue[nextIndex])
            return
          }
        } else if (catalogRandom && isOrderedReleaseRandomScope(currentSource)) {
          if (await jumpToRandomRelease()) return
        }
      } catch (error) {
        console.error('Error auto-queueing tracks:', error)
      }

      if (queue.length > 0) {
        setCurrentIndex(0)
        setCurrentTrack(queue[0])
      }
    } else {
      contextNextTrack()
    }
  }, [
    currentIndex,
    currentTrack,
    queue,
    currentSource,
    getTracksFromSource,
    jumpToRandomRelease,
    setQueue,
    setCurrentIndex,
    setCurrentTrack,
    contextNextTrack,
  ])

  const handleTrackEnd = useCallback(() => {
    nextTrack()
  }, [nextTrack])

  return (
    <MusicPlayer
      currentTrack={currentTrack}
      queue={queue}
      currentSource={currentSource}
      getTracksFromSource={getTracksFromSource}
      onRequestRandomRelease={jumpToRandomRelease}
      onTrackEnd={handleTrackEnd}
      onNext={nextTrack}
      onPrevious={previousTrack}
      isPlaying={isPlaying}
      onPlayStateChange={setIsPlaying}
      onShuffle={handleShuffle}
      onQueueChange={handleQueueChange}
      onRemoveFromQueue={removeFromQueue}
    />
  )
}

function unusedPool(newTracks: Track[], existingIds: Set<string>): Track[] {
  const unused = newTracks.filter((t) => !existingIds.has(t.id))
  return unused.length > 0 ? unused : newTracks
}
