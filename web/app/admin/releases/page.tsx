'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'

interface Release {
  id: string
  title: string
  type: string
  year: number
  platforms: string[]
  spotify_url?: string
  soundcloud_url?: string
  image?: string
  fetch_from_spotify?: boolean
}

export default function AdminReleases() {
  const { user, isAdmin, loading } = useAuth()
  const router = useRouter()
  const [releases, setReleases] = useState<Release[]>([])
  const [loadingReleases, setLoadingReleases] = useState(true)
  const [editing, setEditing] = useState<Release | null>(null)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      router.push('/admin/login')
    }
  }, [user, isAdmin, loading, router])

  useEffect(() => {
    if (isAdmin) {
      fetchReleases()
    }
  }, [isAdmin])

  async function fetchReleases() {
    try {
      setLoadingReleases(true)
      const response = await fetch('/api/admin/releases')
      const data = await response.json()
      setReleases(data.releases || [])
    } catch (error) {
      console.error('Error fetching releases:', error)
    } finally {
      setLoadingReleases(false)
    }
  }

  async function handleSave(release: Release) {
    try {
      const response = await fetch('/api/admin/releases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(release),
      })

      if (response.ok) {
        setShowForm(false)
        setEditing(null)
        fetchReleases()
        alert('Release saved successfully!')
      } else {
        alert('Save failed')
      }
    } catch (error) {
      alert('Save error')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this release?')) return

    try {
      const response = await fetch(`/api/admin/releases/${id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        fetchReleases()
        alert('Release deleted successfully')
      } else {
        alert('Delete failed')
      }
    } catch (error) {
      alert('Delete error')
    }
  }

  async function handleSyncSpotify(id: string) {
    try {
      const response = await fetch(`/api/admin/releases/${id}/sync-spotify`, {
        method: 'POST',
      })

      if (response.ok) {
        fetchReleases()
        alert('Spotify data synced!')
      } else {
        alert('Sync failed')
      }
    } catch (error) {
      alert('Sync error')
    }
  }

  if (loading || loadingReleases) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-white text-xl">Loading...</div>
      </div>
    )
  }

  if (!user || !isAdmin) {
    return null
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Releases Management</h1>
          <p className="text-gray-400">Manage your discography and streaming releases</p>
        </div>

        <div className="mb-6">
          <button
            onClick={() => {
              setEditing(null)
              setShowForm(true)
            }}
            className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold px-6 py-3 rounded-lg transition"
          >
            + Add Release
          </button>
        </div>

        {showForm && (
          <ReleaseForm
            release={editing}
            onSave={handleSave}
            onCancel={() => {
              setShowForm(false)
              setEditing(null)
            }}
          />
        )}

        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
          <h2 className="text-2xl font-semibold mb-4">Releases ({releases.length})</h2>

          {releases.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              No releases found. Add your first release to get started.
            </div>
          ) : (
            <div className="space-y-4">
              {releases.map((release) => (
                <div
                  key={release.id}
                  className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 hover:border-purple-500 transition"
                >
                  <div className="flex items-center gap-4">
                    {release.image && (
                      <img
                        src={release.image}
                        alt={release.title}
                        className="w-20 h-20 object-cover rounded"
                      />
                    )}
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold">{release.title}</h3>
                      <p className="text-gray-400 text-sm">
                        {release.type} • {release.year} • {release.platforms.join(', ')}
                      </p>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => {
                          setEditing(release)
                          setShowForm(true)
                        }}
                        className="text-blue-400 hover:text-blue-300 px-3 py-1 rounded transition"
                      >
                        Edit
                      </button>
                      {release.spotify_url && (
                        <button
                          onClick={() => handleSyncSpotify(release.id)}
                          className="text-green-400 hover:text-green-300 px-3 py-1 rounded transition"
                        >
                          Sync Spotify
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(release.id)}
                        className="text-red-400 hover:text-red-300 px-3 py-1 rounded transition"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ReleaseForm({
  release,
  onSave,
  onCancel,
}: {
  release: Release | null
  onSave: (release: Release) => void
  onCancel: () => void
}) {
  const [formData, setFormData] = useState<Release>({
    id: release?.id || '',
    title: release?.title || '',
    type: release?.type || 'Single',
    year: release?.year || new Date().getFullYear(),
    platforms: release?.platforms || [],
    spotify_url: release?.spotify_url || '',
    soundcloud_url: release?.soundcloud_url || '',
    image: release?.image || '',
    fetch_from_spotify: release?.fetch_from_spotify || false,
  })

  const platformOptions = ['Spotify', 'Apple Music', 'SoundCloud', 'YouTube Music', 'Bandcamp']

  return (
    <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6 mb-6">
      <h2 className="text-2xl font-semibold mb-4">
        {release ? 'Edit Release' : 'Add Release'}
      </h2>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">ID</label>
            <input
              type="text"
              value={formData.id}
              onChange={(e) => setFormData({ ...formData, id: e.target.value })}
              className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
              placeholder="unique-id"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Title</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
              placeholder="Release Title"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Type</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
            >
              <option>Single</option>
              <option>EP</option>
              <option>Album</option>
              <option>Remix</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Year</label>
            <input
              type="number"
              value={formData.year}
              onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) })}
              className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Platforms</label>
          <div className="flex flex-wrap gap-2">
            {platformOptions.map((platform) => (
              <label key={platform} className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={formData.platforms.includes(platform)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setFormData({
                        ...formData,
                        platforms: [...formData.platforms, platform],
                      })
                    } else {
                      setFormData({
                        ...formData,
                        platforms: formData.platforms.filter((p) => p !== platform),
                      })
                    }
                  }}
                  className="rounded"
                />
                <span className="text-sm">{platform}</span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Spotify URL</label>
          <input
            type="url"
            value={formData.spotify_url}
            onChange={(e) => setFormData({ ...formData, spotify_url: e.target.value })}
            className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
            placeholder="https://open.spotify.com/album/..."
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">SoundCloud URL</label>
          <input
            type="url"
            value={formData.soundcloud_url}
            onChange={(e) => setFormData({ ...formData, soundcloud_url: e.target.value })}
            className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
            placeholder="https://soundcloud.com/..."
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Image URL</label>
          <input
            type="url"
            value={formData.image}
            onChange={(e) => setFormData({ ...formData, image: e.target.value })}
            className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
            placeholder="https://..."
          />
        </div>
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="fetch_spotify"
            checked={formData.fetch_from_spotify}
            onChange={(e) => setFormData({ ...formData, fetch_from_spotify: e.target.checked })}
            className="rounded"
          />
          <label htmlFor="fetch_spotify" className="text-sm text-gray-300">
            Fetch metadata from Spotify
          </label>
        </div>
        <div className="flex space-x-4">
          <button
            onClick={() => onSave(formData)}
            className="bg-purple-600 hover:bg-purple-700 text-white font-semibold px-6 py-3 rounded-lg transition"
          >
            Save
          </button>
          <button
            onClick={onCancel}
            className="bg-gray-700 hover:bg-gray-600 text-white font-semibold px-6 py-3 rounded-lg transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
