'use client'

import { useState, useEffect } from 'react'
import { useAdminAuth } from '@/contexts/AdminAuthContext'
import { useRouter } from 'next/navigation'

interface PurchasableTrack {
  id: string
  title: string
  description: string
  price: number
  formats: Array<{
    type: string
    file: string
    size: string
  }>
  previewUrl?: string
  artwork?: string
  duration?: number
  stripePriceId?: string
}

export default function AdminPurchasableTracks() {
  const { user, isAdmin, loading } = useAdminAuth()
  const router = useRouter()
  const [tracks, setTracks] = useState<PurchasableTrack[]>([])
  const [loadingTracks, setLoadingTracks] = useState(true)
  const [editing, setEditing] = useState<PurchasableTrack | null>(null)
  const [showForm, setShowForm] = useState(false)
useEffect(() => {
    if (isAdmin) {
      fetchTracks()
    }
  }, [isAdmin])

  async function fetchTracks() {
    try {
      setLoadingTracks(true)
      const response = await fetch('/api/admin/purchasable-tracks')
      const data = await response.json()
      setTracks(data.tracks || [])
    } catch (error) {
      console.error('Error fetching tracks:', error)
    } finally {
      setLoadingTracks(false)
    }
  }

  async function handleSave(track: PurchasableTrack) {
    try {
      const response = await fetch('/api/admin/purchasable-tracks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(track),
      })

      if (response.ok) {
        setShowForm(false)
        setEditing(null)
        fetchTracks()
        alert('Track saved successfully!')
      } else {
        alert('Save failed')
      }
    } catch (error) {
      alert('Save error')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this track?')) return

    try {
      const response = await fetch(`/api/admin/purchasable-tracks/${id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        fetchTracks()
        alert('Track deleted successfully')
      } else {
        alert('Delete failed')
      }
    } catch (error) {
      alert('Delete error')
    }
  }

  if (loading || loadingTracks) {
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
          <h1 className="text-4xl font-bold mb-2">Purchasable Tracks</h1>
          <p className="text-gray-400">Manage tracks available for purchase</p>
        </div>

        <div className="mb-6">
          <button
            onClick={() => {
              setEditing(null)
              setShowForm(true)
            }}
            className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold px-6 py-3 rounded-lg transition"
          >
            + Add Track
          </button>
        </div>

        {showForm && (
          <PurchasableTrackForm
            track={editing}
            onSave={handleSave}
            onCancel={() => {
              setShowForm(false)
              setEditing(null)
            }}
          />
        )}

        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
          <h2 className="text-2xl font-semibold mb-4">Tracks ({tracks.length})</h2>

          {tracks.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              No purchasable tracks found. Add your first track to get started.
            </div>
          ) : (
            <div className="space-y-4">
              {tracks.map((track) => (
                <div
                  key={track.id}
                  className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 hover:border-green-500 transition"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      {track.artwork && (
                        <img
                          src={track.artwork}
                          alt={track.title}
                          className="w-20 h-20 object-cover rounded"
                        />
                      )}
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold">{track.title}</h3>
                        <p className="text-gray-400 text-sm">{track.description}</p>
                        <p className="text-green-400 text-sm font-semibold mt-1">
                          ${track.price.toFixed(2)} • {track.formats.length} format(s)
                        </p>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => {
                          setEditing(track)
                          setShowForm(true)
                        }}
                        className="text-blue-400 hover:text-blue-300 px-3 py-1 rounded transition"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(track.id)}
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

function PurchasableTrackForm({
  track,
  onSave,
  onCancel,
}: {
  track: PurchasableTrack | null
  onSave: (track: PurchasableTrack) => void
  onCancel: () => void
}) {
  const [formData, setFormData] = useState<PurchasableTrack>({
    id: track?.id || '',
    title: track?.title || '',
    description: track?.description || '',
    price: track?.price || 2.99,
    formats: track?.formats || [],
    previewUrl: track?.previewUrl || '',
    artwork: track?.artwork || '',
    duration: track?.duration || 0,
    stripePriceId: track?.stripePriceId || '',
  })

  const [newFormat, setNewFormat] = useState({ type: 'WAV', file: '', size: '' })

  function addFormat() {
    if (newFormat.type && newFormat.file) {
      setFormData({
        ...formData,
        formats: [...formData.formats, { ...newFormat }],
      })
      setNewFormat({ type: 'WAV', file: '', size: '' })
    }
  }

  function removeFormat(index: number) {
    setFormData({
      ...formData,
      formats: formData.formats.filter((_, i) => i !== index),
    })
  }

  return (
    <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6 mb-6">
      <h2 className="text-2xl font-semibold mb-4">
        {track ? 'Edit Track' : 'Add Track'}
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
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Title</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={3}
            className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
          />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Price</label>
            <input
              type="number"
              step="0.01"
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) })}
              className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Duration (seconds)</label>
            <input
              type="number"
              value={formData.duration}
              onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })}
              className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Stripe Price ID</label>
            <input
              type="text"
              value={formData.stripePriceId}
              onChange={(e) => setFormData({ ...formData, stripePriceId: e.target.value })}
              className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
              placeholder="price_xxxxx"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Preview URL</label>
          <input
            type="url"
            value={formData.previewUrl}
            onChange={(e) => setFormData({ ...formData, previewUrl: e.target.value })}
            className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Artwork URL</label>
          <input
            type="url"
            value={formData.artwork}
            onChange={(e) => setFormData({ ...formData, artwork: e.target.value })}
            className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Formats</label>
          <div className="space-y-2 mb-2">
            {formData.formats.map((format, index) => (
              <div key={index} className="flex items-center gap-2 bg-gray-800/30 p-2 rounded">
                <span className="text-sm">{format.type}</span>
                <span className="text-xs text-gray-400">{format.file}</span>
                <span className="text-xs text-gray-500">({format.size})</span>
                <button
                  onClick={() => removeFormat(index)}
                  className="ml-auto text-red-400 hover:text-red-300 text-sm"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <select
              value={newFormat.type}
              onChange={(e) => setNewFormat({ ...newFormat, type: e.target.value })}
              className="px-3 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
            >
              <option>WAV</option>
              <option>FLAC</option>
              <option>MP3</option>
            </select>
            <input
              type="text"
              placeholder="File path"
              value={newFormat.file}
              onChange={(e) => setNewFormat({ ...newFormat, file: e.target.value })}
              className="flex-1 px-3 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
            />
            <input
              type="text"
              placeholder="Size"
              value={newFormat.size}
              onChange={(e) => setNewFormat({ ...newFormat, size: e.target.value })}
              className="w-24 px-3 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
            />
            <button
              onClick={addFormat}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg"
            >
              Add
            </button>
          </div>
        </div>
        <div className="flex space-x-4">
          <button
            onClick={() => onSave(formData)}
            className="bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-3 rounded-lg transition"
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
