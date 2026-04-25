'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useNotifications } from '@/contexts/NotificationContext'
import { FaCheckCircle, FaUpload } from 'react-icons/fa'

export default function NewReleasePage() {
  const { user, isAdmin, loading } = useAuth()
  const { showNotification } = useNotifications()
  const router = useRouter()
  const [tracks, setTracks] = useState<any[]>([])
  const [selectedTracks, setSelectedTracks] = useState<Set<string>>(new Set())
  const [formData, setFormData] = useState({
    title: '',
    type: 'single' as 'single' | 'ep' | 'album',
    release_date: '',
    genre: '',
    subgenre: '',
    description: '',
    explicit: false,
  })
  const [artworkFile, setArtworkFile] = useState<File | null>(null)
  const [artworkUrl, setArtworkUrl] = useState<string>('')
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (isAdmin) {
      fetchTracks()
    }
  }, [isAdmin])

  async function fetchTracks() {
    try {
      const res = await fetch('/api/studio/tracks')
      if (res.ok) {
        const data = await res.json()
        setTracks(data.tracks || [])
      }
    } catch (error) {
      console.error('Error fetching tracks:', error)
    }
  }

  async function handleArtworkUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setArtworkFile(file)
    setUploading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/studio/upload/artwork', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        throw new Error('Failed to upload artwork')
      }

      const data = await res.json()
      setArtworkUrl(data.url)
      showNotification('Artwork uploaded successfully', 'success')
    } catch (error: any) {
      showNotification(`Upload failed: ${error.message}`, 'error')
    } finally {
      setUploading(false)
    }
  }

  function toggleTrack(trackId: string) {
    const newSelected = new Set(selectedTracks)
    if (newSelected.has(trackId)) {
      newSelected.delete(trackId)
    } else {
      newSelected.add(trackId)
    }
    setSelectedTracks(newSelected)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (selectedTracks.size === 0) {
      showNotification('Please select at least one track', 'error')
      return
    }

    if (!formData.title) {
      showNotification('Title is required', 'error')
      return
    }

    try {
      const releaseId = `release-${Date.now()}`

      // Create release
      const releaseRes = await fetch('/api/studio/releases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: releaseId,
          title: formData.title,
          type: formData.type,
          release_date: formData.release_date || null,
          artwork_url: artworkUrl || null,
          genre: formData.genre || null,
          subgenre: formData.subgenre || null,
          description: formData.description || null,
          explicit: formData.explicit,
        }),
      })

      if (!releaseRes.ok) {
        throw new Error('Failed to create release')
      }

      // Link tracks to release
      for (const trackId of Array.from(selectedTracks)) {
        await fetch(`/api/studio/tracks/${trackId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ release_id: releaseId }),
        })
      }

      showNotification('Release created successfully', 'success')
      router.push(`/studio/releases/${releaseId}`)
    } catch (error: any) {
      showNotification(`Failed to create release: ${error.message}`, 'error')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-white text-xl">Loading...</div>
      </div>
    )
  }

  if (!user || !isAdmin) {
    return null
  }

  const tracksWithISRC = tracks.filter((t) => t.isrc_full)
  const tracksWithoutISRC = tracks.filter((t) => !t.isrc_full)

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Create New Release</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Release Metadata */}
          <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6 space-y-4">
            <h2 className="text-xl font-semibold mb-4">Release Information</h2>

            <div>
              <label className="block text-sm font-medium mb-2">Title *</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Type *</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
                required
              >
                <option value="single">Single</option>
                <option value="ep">EP</option>
                <option value="album">Album</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Release Date</label>
              <input
                type="date"
                value={formData.release_date}
                onChange={(e) => setFormData({ ...formData, release_date: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Genre</label>
                <input
                  type="text"
                  value={formData.genre}
                  onChange={(e) => setFormData({ ...formData, genre: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Subgenre</label>
                <input
                  type="text"
                  value={formData.subgenre}
                  onChange={(e) => setFormData({ ...formData, subgenre: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={4}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="explicit"
                checked={formData.explicit}
                onChange={(e) => setFormData({ ...formData, explicit: e.target.checked })}
                className="w-4 h-4 rounded bg-gray-800 border-gray-700"
              />
              <label htmlFor="explicit" className="text-sm">Explicit content</label>
            </div>
          </div>

          {/* Artwork Upload */}
          <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6">
            <label className="block text-sm font-medium mb-2">Artwork (Optional)</label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleArtworkUpload}
              disabled={uploading}
              className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-700"
            />
            {artworkUrl && (
              <div className="mt-2 flex items-center gap-2 text-green-400">
                <FaCheckCircle />
                <span className="text-sm">Artwork uploaded</span>
              </div>
            )}
          </div>

          {/* Track Selection */}
          <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Select Tracks *</h2>
            <p className="text-sm text-gray-400 mb-4">
              Selected: {selectedTracks.size} track{selectedTracks.size !== 1 ? 's' : ''}
            </p>

            {tracksWithISRC.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-medium text-green-400 mb-2">Tracks with ISRC</h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {tracksWithISRC.map((track) => (
                    <label
                      key={track.id}
                      className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg hover:bg-gray-700 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedTracks.has(track.id)}
                        onChange={() => toggleTrack(track.id)}
                        className="w-4 h-4 rounded bg-gray-800"
                      />
                      <div className="flex-1">
                        <div className="font-medium">{track.title}</div>
                        <div className="text-xs text-gray-400">ISRC: {track.isrc_full}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {tracksWithoutISRC.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-yellow-400 mb-2">
                  Tracks without ISRC (assign ISRC first)
                </h3>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {tracksWithoutISRC.map((track) => (
                    <div
                      key={track.id}
                      className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg opacity-50"
                    >
                      <input type="checkbox" disabled className="w-4 h-4" />
                      <div className="flex-1">
                        <div className="font-medium">{track.title}</div>
                        <div className="text-xs text-gray-400">No ISRC assigned</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tracks.length === 0 && (
              <div className="text-center py-8 text-gray-400">
                <p>No tracks available. Upload tracks first.</p>
                <a href="/studio/tracks/new" className="text-purple-400 hover:text-purple-300 mt-2 inline-block">
                  Upload Track
                </a>
              </div>
            )}
          </div>

          {/* Submit */}
          <div className="flex gap-4">
            <button
              type="submit"
              disabled={uploading || selectedTracks.size === 0}
              className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create Release
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
