'use client'

import { useMusicPlayer } from '@/contexts/MusicPlayerContext'
import MusicPlayer from './MusicPlayer'
import { useEffect, useCallback } from 'react'
import { fetchMusicLibrary, fetchTracks, type FolderItem, type Track } from '@/utils/musicLibraryApi'

function findFolderById(items: FolderItem[] | undefined, id: string): FolderItem | null {
  if (!items) return null
  for (const item of items) {
    if (item.id === id) return item
    if (item.children) {
      const found = findFolderById(item.children, id)
      if (found) return found
    }
  }
  return null
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
    nextTrack: contextNextTrack,
    previousTrack,
    handleShuffle,
    handleQueueChange,
    removeFromQueue,
  } = useMusicPlayer()

  // Function to get tracks from a folder or "All Tracks"
  const getTracksFromSource = useCallback(async (source: { type: 'folder' | 'playlist' | null; id: string | null } | null): Promise<Track[]> => {
    if (!source || !source.id) {
      // No source specified, fetch "All Tracks" from discography
      try {
        const libraryData = await fetchMusicLibrary()
        const discographyFolder = findFolderById(libraryData.folders, 'folder-discography')
        if (discographyFolder) {
          const allTracksFolder = findFolderById(discographyFolder.children || [], 'folder-all-tracks')
          if (allTracksFolder && allTracksFolder.tracks) {
            return allTracksFolder.tracks
          }
        }
        // Fallback: fetch all tracks
        return await fetchTracks()
      } catch (error) {
        console.error('Error fetching All Tracks:', error)
        return []
      }
    }

    if (source.type === 'folder') {
      try {
        // Fetch tracks from the specific folder
        const tracks = await fetchTracks(source.id)
        return tracks
      } catch (error) {
        console.error('Error fetching folder tracks:', error)
        // Fallback to "All Tracks"
        const libraryData = await fetchMusicLibrary()
        const discographyFolder = findFolderById(libraryData.folders, 'folder-discography')
        if (discographyFolder) {
          const allTracksFolder = findFolderById(discographyFolder.children || [], 'folder-all-tracks')
          if (allTracksFolder && allTracksFolder.tracks) {
            return allTracksFolder.tracks
          }
        }
        return []
      }
    }

    // For playlists, we'd need to fetch playlist tracks
    // For now, fallback to "All Tracks"
    const libraryData = await fetchMusicLibrary()
    const discographyFolder = findFolderById(libraryData.folders, 'folder-discography')
    if (discographyFolder) {
      const allTracksFolder = findFolderById(discographyFolder.children || [], 'folder-all-tracks')
      if (allTracksFolder && allTracksFolder.tracks) {
        return allTracksFolder.tracks
      }
    }
    return []
  }, [])


  // Enhanced nextTrack that auto-queues when at the end
  const nextTrack = useCallback(async () => {
    // Check if we're at the end of the queue (last track)
    if (queue.length > 0 && currentIndex >= queue.length - 1) {
      // We're at the end, try to auto-queue more tracks
      try {
        const newTracks = await getTracksFromSource(currentSource)
        if (newTracks.length > 0) {
          // Filter out tracks that are already in the queue to avoid duplicates
          const existingIds = new Set(queue.map(t => t.id))
          const tracksToAdd = newTracks.filter(t => !existingIds.has(t.id))
          
          if (tracksToAdd.length > 0) {
            // Add new tracks to the queue
            const updatedQueue = [...queue, ...tracksToAdd]
            setQueue(updatedQueue)
            // Move to the next track (which is the first newly added track)
            const nextIndex = queue.length
            setCurrentIndex(nextIndex)
            setCurrentTrack(updatedQueue[nextIndex])
            return
          }
        }
      } catch (error) {
        console.error('Error auto-queueing tracks:', error)
      }
      
      // If we couldn't get more tracks, loop back to start (existing behavior)
      if (queue.length > 0) {
        setCurrentIndex(0)
        setCurrentTrack(queue[0])
      }
    } else {
      // Normal next track - not at the end yet
      contextNextTrack()
    }
  }, [currentIndex, queue, currentSource, getTracksFromSource, setQueue, setCurrentIndex, setCurrentTrack, contextNextTrack])

  const handleTrackEnd = useCallback(() => {
    nextTrack()
  }, [nextTrack])

  return (
    <MusicPlayer
      currentTrack={currentTrack}
      queue={queue}
      currentSource={currentSource}
      getTracksFromSource={getTracksFromSource}
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

