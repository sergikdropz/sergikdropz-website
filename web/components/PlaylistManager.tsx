'use client'

import { useState } from 'react'
import { FaPlus, FaTrash, FaEdit, FaPlay, FaMusic } from 'react-icons/fa'
import Image from 'next/image'
import { shouldUnoptimizeImage } from '@/utils/imageOptimization'

interface Track {
  id: string
  title: string
  artist: string
  duration: number
  file: string
  artwork?: string
}

interface Playlist {
  id: string
  name: string
  description?: string
  artwork?: string
  trackIds: string[]
  createdAt: string
}

interface PlaylistManagerProps {
  playlists: Playlist[]
  allTracks: Track[]
  onCreatePlaylist: (name: string, description?: string) => void
  onDeletePlaylist: (id: string) => void
  onAddTrackToPlaylist: (playlistId: string, trackId: string) => void
  onRemoveTrackFromPlaylist: (playlistId: string, trackId: string) => void
  onPlayPlaylist: (playlist: Playlist) => void
}

export default function PlaylistManager({
  playlists,
  allTracks,
  onCreatePlaylist,
  onDeletePlaylist,
  onAddTrackToPlaylist,
  onRemoveTrackFromPlaylist,
  onPlayPlaylist
}: PlaylistManagerProps) {
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newPlaylistName, setNewPlaylistName] = useState('')
  const [newPlaylistDesc, setNewPlaylistDesc] = useState('')
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null)
  const [showAddTrack, setShowAddTrack] = useState<string | null>(null)

  const handleCreate = () => {
    if (newPlaylistName.trim()) {
      onCreatePlaylist(newPlaylistName, newPlaylistDesc)
      setNewPlaylistName('')
      setNewPlaylistDesc('')
      setShowCreateForm(false)
    }
  }

  const getPlaylistTracks = (playlist: Playlist) => {
    return playlist.trackIds
      .map(id => allTracks.find(t => t.id === id))
      .filter(Boolean) as Track[]
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const availableTracks = allTracks.filter(
    track => !selectedPlaylist?.trackIds.includes(track.id)
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <span className="text-pink-400">🎧</span>
          Playlists
        </h2>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-lg hover:from-pink-600 hover:to-purple-600 transition-all shadow-lg shadow-pink-500/30"
        >
          <FaPlus /> Create
        </button>
      </div>

      {showCreateForm && (
        <div className="mb-6 p-4 bg-gray-800 rounded">
          <input
            type="text"
            placeholder="Playlist name"
            value={newPlaylistName}
            onChange={(e) => setNewPlaylistName(e.target.value)}
            className="w-full mb-2 px-3 py-2 bg-gray-900 text-white rounded focus:outline-none focus:ring-2 focus:ring-white"
            onKeyPress={(e) => e.key === 'Enter' && handleCreate()}
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={newPlaylistDesc}
            onChange={(e) => setNewPlaylistDesc(e.target.value)}
            className="w-full mb-2 px-3 py-2 bg-gray-900 text-white rounded focus:outline-none focus:ring-2 focus:ring-white"
            onKeyPress={(e) => e.key === 'Enter' && handleCreate()}
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              className="px-4 py-2 bg-white text-black rounded hover:bg-gray-200 transition-colors"
            >
              Create
            </button>
            <button
              onClick={() => {
                setShowCreateForm(false)
                setNewPlaylistName('')
                setNewPlaylistDesc('')
              }}
              className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {playlists.length === 0 ? (
          <div className="text-center py-12 bg-gray-800/50 rounded-lg border border-dashed border-gray-700">
            <div className="text-4xl mb-3">🎵</div>
            <p className="text-gray-400 mb-2">No playlists yet</p>
            <p className="text-sm text-gray-500">Create one to get started!</p>
          </div>
        ) : (
          playlists.map(playlist => {
            const tracks = getPlaylistTracks(playlist)
            const totalDuration = tracks.reduce((sum, track) => sum + track.duration, 0)
            
            return (
              <div key={playlist.id} className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 rounded-xl p-4 border border-gray-700/50 hover:border-pink-500/50 transition-all hover:shadow-lg hover:shadow-pink-500/20">
                <div className="flex items-start gap-4 mb-3">
                  {playlist.artwork ? (
                    <div className="relative w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 shadow-lg">
                      <Image
                        src={playlist.artwork}
                        alt={playlist.name}
                        fill
                        className="object-cover"
                        unoptimized={shouldUnoptimizeImage(playlist.artwork)}
                        sizes="80px"
                      />
                    </div>
                  ) : (
                    <div className="w-20 h-20 rounded-lg bg-gradient-to-br from-pink-900/50 to-purple-900/50 flex items-center justify-center flex-shrink-0 border border-pink-500/30">
                      <FaMusic className="text-pink-400 text-3xl" />
                    </div>
                  )}
                  
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-bold mb-1 text-white">{playlist.name}</h3>
                    {playlist.description && (
                      <p className="text-sm text-gray-400 mb-2 line-clamp-2">{playlist.description}</p>
                    )}
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-pink-400 font-medium">
                        {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}
                      </span>
                      {totalDuration > 0 && (
                        <span className="text-gray-500">• {formatDuration(totalDuration)}</span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => onPlayPlaylist(playlist)}
                      className="p-2.5 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-lg hover:from-pink-600 hover:to-purple-600 transition-all shadow-md shadow-pink-500/30"
                      title="Play playlist"
                    >
                      <FaPlay className="text-sm" />
                    </button>
                    <button
                      onClick={() => {
                        setSelectedPlaylist(selectedPlaylist?.id === playlist.id ? null : playlist)
                        setShowAddTrack(null)
                      }}
                      className={`p-2.5 rounded-lg transition-all ${
                        selectedPlaylist?.id === playlist.id
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30'
                          : 'bg-gray-700 text-white hover:bg-gray-600'
                      }`}
                      title="Edit playlist"
                    >
                      <FaEdit className="text-sm" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete playlist "${playlist.name}"?`)) {
                          onDeletePlaylist(playlist.id)
                        }
                      }}
                      className="p-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all shadow-md shadow-red-500/30"
                      title="Delete playlist"
                    >
                      <FaTrash className="text-sm" />
                    </button>
                  </div>
                </div>

                {selectedPlaylist?.id === playlist.id && (
                  <div className="mt-4 space-y-2 border-t border-gray-700 pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-medium text-gray-300">Tracks</h4>
                      <button
                        onClick={() => setShowAddTrack(showAddTrack === playlist.id ? null : playlist.id)}
                        className="text-xs px-3 py-1 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors"
                      >
                        {showAddTrack === playlist.id ? 'Cancel' : 'Add Tracks'}
                      </button>
                    </div>

                    {showAddTrack === playlist.id && availableTracks.length > 0 && (
                      <div className="mb-4 p-3 bg-gray-900 rounded max-h-48 overflow-y-auto">
                        {availableTracks.map(track => (
                          <div
                            key={track.id}
                            className="flex items-center justify-between p-2 hover:bg-gray-800 rounded cursor-pointer"
                            onClick={() => {
                              onAddTrackToPlaylist(playlist.id, track.id)
                            }}
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              {track.artwork && (
                                <div className="relative w-8 h-8 rounded overflow-hidden flex-shrink-0">
                                  <Image
                                    src={track.artwork}
                                    alt={track.title}
                                    fill
                                    className="object-cover"
                                    unoptimized={shouldUnoptimizeImage(track.artwork)}
                                    sizes="32px"
                                  />
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="text-sm text-white truncate">{track.title}</p>
                                <p className="text-xs text-gray-400 truncate">{track.artist}</p>
                              </div>
                            </div>
                            <span className="text-xs text-gray-500 ml-2">
                              {formatDuration(track.duration)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {tracks.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-4">
                        No tracks in this playlist. Add tracks above.
                      </p>
                    ) : (
                      tracks.map(track => (
                        <div
                          key={track.id}
                          className="flex items-center justify-between p-2 bg-gray-900 rounded hover:bg-gray-800 transition-colors"
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            {track.artwork && (
                              <div className="relative w-10 h-10 rounded overflow-hidden flex-shrink-0">
                                <Image
                                  src={track.artwork}
                                  alt={track.title}
                                  fill
                                  className="object-cover"
                                  unoptimized={shouldUnoptimizeImage(track.artwork)}
                                  sizes="40px"
                                />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-white truncate">{track.title}</p>
                              <p className="text-xs text-gray-400 truncate">{track.artist}</p>
                            </div>
                            <span className="text-xs text-gray-500 ml-2">
                              {formatDuration(track.duration)}
                            </span>
                          </div>
                          <button
                            onClick={() => onRemoveTrackFromPlaylist(playlist.id, track.id)}
                            className="ml-2 p-1 text-red-400 hover:text-red-300 transition-colors"
                            title="Remove from playlist"
                          >
                            <FaTrash className="text-xs" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

