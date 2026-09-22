'use client'

import { useState } from 'react'
import { useNotifications } from '@/contexts/NotificationContext'
import { studioPipelineHref } from '@/lib/studio/studio-ia'
import { FaCheckCircle, FaPaperPlane } from 'react-icons/fa'

export default function TrackUploadPanel() {
  const { showNotification } = useNotifications()
  const [uploading, setUploading] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    version: '',
    duration: '',
    contributors: '',
    splits: '',
    explicit: false,
    origin: 'original' as 'original' | 'cover',
    writerLegal: '',
    aiGenerated: '' as '' | 'no' | 'yes',
  })
  const [wavUrl, setWavUrl] = useState<string>('')
  const [artworkUrl, setArtworkUrl] = useState<string>('')
  const [trackId, setTrackId] = useState<string>('')
  const [isrc, setIsrc] = useState<string>('')
  const [soundExchangeStatus, setSoundExchangeStatus] = useState<'idle' | 'submitting' | 'submitted' | 'error'>('idle')

  async function handleWavUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

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
          origin: formData.origin,
          writer_legal_names: formData.writerLegal.trim() || null,
          ai_generated: formData.aiGenerated === '' ? null : formData.aiGenerated === 'yes',
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
    <div className="max-w-3xl">
      <p className="text-sm text-zinc-500 mb-6">
        Add a WAV to the catalog, then mint an ISRC. Lookup and submission history live on{' '}
        <a href={studioPipelineHref('isrcs')} className="text-violet-400 hover:text-violet-300">
          Pipeline → ISRCs
        </a>
        .
      </p>
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
            <fieldset className="text-sm space-y-1">
              <legend className="font-medium mb-1">Original or cover</legend>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={formData.origin === 'original'}
                  onChange={() => setFormData({ ...formData, origin: 'original' })}
                />
                Original
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={formData.origin === 'cover'}
                  onChange={() => setFormData({ ...formData, origin: 'cover' })}
                />
                Cover song
              </label>
            </fieldset>
            <div>
              <label className="block text-sm font-medium mb-2">Songwriter legal name(s)</label>
              <input
                type="text"
                value={formData.writerLegal}
                onChange={(e) => setFormData({ ...formData, writerLegal: e.target.value })}
                placeholder="Jordan Caboga"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
              />
            </div>
            <fieldset className="text-sm space-y-1">
              <legend className="font-medium mb-1">AI-generated music / vocals / lyrics?</legend>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={formData.aiGenerated === 'no'}
                  onChange={() => setFormData({ ...formData, aiGenerated: 'no' })}
                />
                No
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={formData.aiGenerated === 'yes'}
                  onChange={() => setFormData({ ...formData, aiGenerated: 'yes' })}
                />
                Yes
              </label>
            </fieldset>
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
  )
}
