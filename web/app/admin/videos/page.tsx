'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'

export default function AdminVideos() {
  const { user, isAdmin, loading } = useAuth()
  const router = useRouter()
  const [videos, setVideos] = useState<any[]>([])
  const [loadingVideos, setLoadingVideos] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      router.push('/admin/login')
    }
  }, [user, isAdmin, loading, router])

  useEffect(() => {
    if (isAdmin) {
      fetchVideos()
    }
  }, [isAdmin])

  async function fetchVideos() {
    try {
      setLoadingVideos(true)
      const response = await fetch('/api/youtube-videos')
      const data = await response.json()
      setVideos(data.videos || [])
    } catch (error) {
      console.error('Error fetching videos:', error)
    } finally {
      setLoadingVideos(false)
    }
  }

  async function handleUpload() {
    if (!selectedFile) return

    setUploading(true)
    setUploadProgress(0)

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('title', title)
      formData.append('description', description)

      const xhr = new XMLHttpRequest()

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = (e.loaded / e.total) * 100
          setUploadProgress(percentComplete)
        }
      })

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          setSelectedFile(null)
          setTitle('')
          setDescription('')
          setUploadProgress(0)
          fetchVideos()
          alert('Video uploaded successfully!')
        } else {
          alert('Upload failed: ' + xhr.responseText)
        }
        setUploading(false)
      })

      xhr.addEventListener('error', () => {
        alert('Upload failed')
        setUploading(false)
        setUploadProgress(0)
      })

      xhr.open('POST', '/api/videos/upload')
      xhr.send(formData)
    } catch (error: any) {
      alert('Upload error: ' + error.message)
      setUploading(false)
      setUploadProgress(0)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this video?')) return

    try {
      const response = await fetch(`/api/videos/${id}`, { method: 'DELETE' })
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
          <h1 className="text-4xl font-bold mb-2">Video Uploader</h1>
          <p className="text-gray-400">Upload and manage video content</p>
        </div>

        {/* Upload Section */}
        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-2xl font-semibold mb-4">Upload Video</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Video File
              </label>
              <input
                type="file"
                accept="video/*"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
                disabled={uploading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Video title"
                className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
                disabled={uploading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Video description"
                rows={4}
                className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
                disabled={uploading}
              />
            </div>
            {uploading && (
              <div>
                <div className="w-full bg-gray-700 rounded-full h-2 mb-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                </div>
                <p className="text-sm text-gray-400">Uploading... {Math.round(uploadProgress)}%</p>
              </div>
            )}
            <button
              onClick={handleUpload}
              disabled={!selectedFile || uploading}
              className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-semibold px-6 py-3 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? 'Uploading...' : 'Upload Video'}
            </button>
          </div>
        </div>

        {/* Videos List */}
        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-semibold">Videos ({videos.length})</h2>
            <button
              onClick={fetchVideos}
              className="text-gray-400 hover:text-white transition"
            >
              Refresh
            </button>
          </div>

          {videos.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              No videos found. Upload your first video to get started.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {videos.map((video) => (
                <div
                  key={video.id}
                  className="bg-gray-800/50 border border-gray-700 rounded-lg overflow-hidden hover:border-blue-500 transition"
                >
                  <div className="aspect-video bg-gray-700 relative">
                    {video.thumbnail && (
                      <img
                        src={video.thumbnail}
                        alt={video.title}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="text-lg font-semibold mb-2 truncate">{video.title || 'Untitled'}</h3>
                    <p className="text-gray-400 text-sm mb-4 line-clamp-2">{video.description}</p>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => window.open(video.url, '_blank')}
                        className="text-blue-400 hover:text-blue-300 text-sm transition"
                      >
                        View
                      </button>
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
