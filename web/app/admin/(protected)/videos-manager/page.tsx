'use client'

import { useState, useEffect } from 'react'
import { useAdminAuth } from '@/contexts/AdminAuthContext'
import { useRouter } from 'next/navigation'

interface Video {
  id: string
  title: string
  description: string
  youtube_id?: string
  category: string
  date: string
}

export default function AdminVideosManager() {
  const { user, isAdmin, loading } = useAdminAuth()
  const router = useRouter()
  const [videos, setVideos] = useState<Video[]>([])
  const [loadingVideos, setLoadingVideos] = useState(true)
  const [editing, setEditing] = useState<Video | null>(null)
  const [showForm, setShowForm] = useState(false)
useEffect(() => {
    if (isAdmin) {
      fetchVideos()
    }
  }, [isAdmin])

  async function fetchVideos() {
    try {
      setLoadingVideos(true)
      const response = await fetch('/api/admin/videos')
      const data = await response.json()
      setVideos(data.videos || [])
    } catch (error) {
      console.error('Error fetching videos:', error)
    } finally {
      setLoadingVideos(false)
    }
  }

  async function handleSave(video: Video) {
    try {
      const response = await fetch('/api/admin/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(video),
      })

      if (response.ok) {
        setShowForm(false)
        setEditing(null)
        fetchVideos()
        alert('Video saved successfully!')
      } else {
        alert('Save failed')
      }
    } catch (error) {
      alert('Save error')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this video?')) return

    try {
      const response = await fetch(`/api/admin/videos/${id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        fetchVideos()
        alert('Video deleted successfully')
      } else {
        alert('Delete failed')
      }
    } catch (error) {
      alert('Delete error')
    }
  }

  if (loading || loadingVideos) {
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
          <h1 className="text-4xl font-bold mb-2">Videos Management</h1>
          <p className="text-gray-400">Manage your video content and YouTube videos</p>
        </div>

        <div className="mb-6">
          <button
            onClick={() => {
              setEditing(null)
              setShowForm(true)
            }}
            className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-semibold px-6 py-3 rounded-lg transition"
          >
            + Add Video
          </button>
        </div>

        {showForm && (
          <VideoForm
            video={editing}
            onSave={handleSave}
            onCancel={() => {
              setShowForm(false)
              setEditing(null)
            }}
          />
        )}

        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
          <h2 className="text-2xl font-semibold mb-4">Videos ({videos.length})</h2>

          {videos.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              No videos found. Add your first video to get started.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {videos.map((video) => (
                <div
                  key={video.id}
                  className="bg-gray-800/50 border border-gray-700 rounded-lg overflow-hidden hover:border-blue-500 transition"
                >
                  {video.youtube_id && (
                    <div className="aspect-video bg-gray-700 relative">
                      <img
                        src={`https://img.youtube.com/vi/${video.youtube_id}/maxresdefault.jpg`}
                        alt={video.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <div className="p-4">
                    <h3 className="text-lg font-semibold mb-2 truncate">{video.title}</h3>
                    <p className="text-gray-400 text-sm mb-2 line-clamp-2">{video.description}</p>
                    <p className="text-gray-500 text-xs mb-4">
                      {video.category} • {video.date}
                    </p>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => {
                          setEditing(video)
                          setShowForm(true)
                        }}
                        className="text-blue-400 hover:text-blue-300 text-sm transition"
                      >
                        Edit
                      </button>
                      {video.youtube_id && (
                        <a
                          href={`https://youtube.com/watch?v=${video.youtube_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-green-400 hover:text-green-300 text-sm transition"
                        >
                          View
                        </a>
                      )}
                      <button
                        onClick={() => handleDelete(video.id)}
                        className="text-red-400 hover:text-red-300 text-sm transition"
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

function VideoForm({
  video,
  onSave,
  onCancel,
}: {
  video: Video | null
  onSave: (video: Video) => void
  onCancel: () => void
}) {
  const [formData, setFormData] = useState<Video>({
    id: video?.id || '',
    title: video?.title || '',
    description: video?.description || '',
    youtube_id: video?.youtube_id || '',
    category: video?.category || 'music-video',
    date: video?.date || new Date().getFullYear().toString(),
  })

  const categories = [
    'music-video',
    'visualizer',
    'collaboration',
    'live-performance',
    'behind-the-scenes',
  ]

  return (
    <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6 mb-6">
      <h2 className="text-2xl font-semibold mb-4">{video ? 'Edit Video' : 'Add Video'}</h2>
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
              placeholder="Video Title"
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
            placeholder="Video description"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              YouTube ID
            </label>
            <input
              type="text"
              value={formData.youtube_id}
              onChange={(e) => setFormData({ ...formData, youtube_id: e.target.value })}
              className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
              placeholder="OML1I_V4Dy4"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Category</label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat.replace('-', ' ')}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Date</label>
          <input
            type="text"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
            placeholder="2025"
          />
        </div>
        <div className="flex space-x-4">
          <button
            onClick={() => onSave(formData)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg transition"
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
