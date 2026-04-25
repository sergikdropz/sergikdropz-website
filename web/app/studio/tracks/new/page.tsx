'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useNotifications } from '@/contexts/NotificationContext'
import { FaUpload, FaCheckCircle, FaPaperPlane } from 'react-icons/fa'

export default function NewTrackPage() {
  const { user, isAdmin, loading } = useAuth()
  const { showNotification } = useNotifications()
  const router = useRouter()
  const [uploading, setUploading] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    version: '',
    duration: '',
    contributors: '',
    splits: '',
    explicit: false,
  })
  const [wavFile, setWavFile] = useState<File | null>(null)
  const [artworkFile, setArtworkFile] = useState<File | null>(null)
  const [wavUrl, setWavUrl] = useState<string>('')
  const [artworkUrl, setArtworkUrl] = useState<string>('')
  const [trackId, setTrackId] = useState<string>('')
  const [isrc, setIsrc] = useState<string>('')
  const [soundExchangeStatus, setSoundExchangeStatus] = useState<'idle' | 'submitting' | 'submitted' | 'error'>('idle')

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

  async function handleWavUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setWavFile(file)
    setUploading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/studio/upload/wav', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        throw new Error('Failed to upload WAV file')
      }

      const data = await res.json()
      setWavUrl(data.url)
      showNotification('WAV file uploaded successfully', 'success')
    } catch (error: any) {
      showNotification(`Upload failed: ${error.message}`, 'error')
    } finally {
      setUploading(false)
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!wavUrl) {
      showNotification('Please upload a WAV file', 'error')
      return
    }

    if (!formData.title) {
      showNotification('Title is required', 'error')
      return
    }

    try {
      // Parse contributors and splits
      const contributors = formData.contributors
        ? formData.contributors.split(',').map((c) => ({
            name: c.trim(),
            role: 'artist',
          }))
        : []

      const splits = formData.splits
        ? formData.splits.split(',').map((s) => {
            const [name, percentage] = s.trim().split(':')
            return {
              name: name.trim(),
              percentage: parseFloat(percentage || '0'),
            }
          })
        : []

      // Validate splits sum to 100
      const totalSplits = splits.reduce((sum, s) => sum + s.percentage, 0)
      if (splits.length > 0 && Math.abs(totalSplits - 100) > 0.01) {
        showNotification('Splits must sum to 100%', 'error')
        return
      }

      const newTrackId = `track-${Date.now()}`

      // Create track
      const res = await fetch('/api/studio/tracks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: newTrackId,
          title: formData.title,
          version: formData.version || null,
          duration: formData.duration ? parseInt(formData.duration) : null,
          wav_url: wavUrl,
          artwork_url: artworkUrl || null,
          contributors,
          splits,
          explicit: formData.explicit,
        }),
      })

      if (!res.ok) {
        throw new Error('Failed to create track')
      }

      setTrackId(newTrackId)
      showNotification('Track created successfully', 'success')
    } catch (error: any) {
      showNotification(`Failed to create track: ${error.message}`, 'error')
    }
  }

  async function handleAssignISRC() {
    if (!trackId) {
      showNotification('Please create the track first', 'error')
      return
    }

    try {
      const res = await fetch('/api/studio/isrc/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackId }),
      })

      if (!res.ok) {
        throw new Error('Failed to assign ISRC')
      }

      const data = await res.json()
      setIsrc(data.isrc)
      showNotification(`ISRC assigned: ${data.isrc}`, 'success')
    } catch (error: any) {
      showNotification(`Failed to assign ISRC: ${error.message}`, 'error')
    }
  }

  async function handleSubmitToSoundExchange() {
    if (!trackId || !isrc) {
      showNotification('Please assign an ISRC first', 'error')
      return
    }

    setSoundExchangeStatus('submitting')
    try {
      const res = await fetch('/api/studio/soundexchange/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackId }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (data.configured === false) {
          showNotification('SoundExchange API not configured. Set SOUNDEXCHANGE_API_KEY in environment variables.', 'warning')
        } else {
          throw new Error(data.error || 'Failed to submit to SoundExchange')
        }
        setSoundExchangeStatus('error')
        return
      }

      setSoundExchangeStatus('submitted')
      showNotification('ISRC submitted to SoundExchange successfully', 'success')
    } catch (error: any) {
      setSoundExchangeStatus('error')
      showNotification(`Failed to submit to SoundExchange: ${error.message}`, 'error')
    }
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Upload New Track</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* WAV Upload */}
          <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6">
            <label className="block text-sm font-medium mb-2">WAV File *</label>
            <input
              type="file"
              accept=".wav,.WAV"
              onChange={handleWavUpload}
              disabled={uploading}
              className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-700"
            />
            {wavUrl && (
              <div className="mt-2 flex items-center gap-2 text-green-400">
                <FaCheckCircle />
                <span className="text-sm">WAV file uploaded</span>
              </div>
            )}
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

          {/* Metadata */}
          <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6 space-y-4">
            <h2 className="text-xl font-semibold mb-4">Track Metadata</h2>

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
              <label className="block text-sm font-medium mb-2">Version (e.g., Original, Remix)</label>
              <input
                type="text"
                value={formData.version}
                onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Duration (seconds)</label>
              <input
                type="number"
                value={formData.duration}
                onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Contributors (comma-separated)</label>
              <input
                type="text"
                value={formData.contributors}
                onChange={(e) => setFormData({ ...formData, contributors: e.target.value })}
                placeholder="Artist 1, Artist 2"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Splits (format: Name:Percentage, e.g., Artist1:50, Artist2:50)</label>
              <input
                type="text"
                value={formData.splits}
                onChange={(e) => setFormData({ ...formData, splits: e.target.value })}
                placeholder="Artist1:50, Artist2:50"
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

          {/* Submit */}
          <div className="flex gap-4">
            <button
              type="submit"
              disabled={uploading || !wavUrl}
              className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create Track
            </button>
          </div>
        </form>

        {/* ISRC Assignment */}
        {trackId && (
          <div className="mt-8 bg-gray-900/50 border border-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">ISRC Assignment</h2>
            {isrc ? (
              <div className="space-y-4">
                <div>
                  <div className="text-green-400 font-mono text-lg mb-2">{isrc}</div>
                  <p className="text-sm text-gray-400">ISRC assigned successfully</p>
                </div>
                
                {/* SoundExchange Submission */}
                <div className="pt-4 border-t border-gray-700">
                  <h3 className="text-sm font-medium mb-2">Submit to SoundExchange</h3>
                  <p className="text-xs text-gray-500 mb-3">
                    Submit this ISRC to SoundExchange (US ISRC Agency) for registration and lookup service.
                  </p>
                  {soundExchangeStatus === 'submitted' ? (
                    <div className="flex items-center gap-2 text-green-400">
                      <FaCheckCircle />
                      <span className="text-sm">Submitted to SoundExchange</span>
                    </div>
                  ) : soundExchangeStatus === 'error' ? (
                    <div className="text-red-400 text-sm">
                      Submission failed. Check configuration.
                    </div>
                  ) : (
                    <button
                      onClick={handleSubmitToSoundExchange}
                      disabled={soundExchangeStatus === 'submitting'}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      <FaPaperPlane />
                      {soundExchangeStatus === 'submitting' ? 'Submitting...' : 'Submit to SoundExchange'}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <button
                  onClick={handleAssignISRC}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-semibold transition"
                >
                  Assign ISRC
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
