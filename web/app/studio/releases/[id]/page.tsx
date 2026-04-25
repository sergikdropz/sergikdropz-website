'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useNotifications } from '@/contexts/NotificationContext'
import { FaRocket, FaCheckCircle, FaClock, FaExternalLinkAlt, FaPaperPlane, FaEdit, FaTrash, FaSave, FaTimes } from 'react-icons/fa'

export default function ReleaseDetailPage() {
  const { user, isAdmin, loading } = useAuth()
  const { showNotification } = useNotifications()
  const router = useRouter()
  const params = useParams()
  const releaseId = params.id as string

  const [release, setRelease] = useState<any>(null)
  const [tracks, setTracks] = useState<any[]>([])
  const [storeLinks, setStoreLinks] = useState<any[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [distributing, setDistributing] = useState(false)
  const [checkingStatus, setCheckingStatus] = useState(false)
  const [submittingToSoundExchange, setSubmittingToSoundExchange] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [editForm, setEditForm] = useState({
    title: '',
    type: '',
    release_date: '',
    genre: '',
    subgenre: '',
    description: '',
    explicit: false,
  })

  useEffect(() => {
    if (isAdmin && releaseId) {
      fetchReleaseData()
    }
  }, [isAdmin, releaseId])

  async function fetchReleaseData() {
    try {
      setLoadingData(true)
      const res = await fetch(`/api/studio/releases/${releaseId}`)
      if (res.ok) {
        const data = await res.json()
        setRelease(data.release)
        setTracks(data.tracks || [])
        setStoreLinks(data.storeLinks || [])
      }
    } catch (error) {
      console.error('Error fetching release:', error)
    } finally {
      setLoadingData(false)
    }
  }

  function startEditing() {
    setEditForm({
      title: release.title || '',
      type: release.type || 'single',
      release_date: release.release_date || '',
      genre: release.genre || '',
      subgenre: release.subgenre || '',
      description: release.description || '',
      explicit: release.explicit || false,
    })
    setEditing(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/studio/releases/${releaseId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editForm.title,
          type: editForm.type,
          release_date: editForm.release_date || null,
          genre: editForm.genre || null,
          subgenre: editForm.subgenre || null,
          description: editForm.description || null,
          explicit: editForm.explicit,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to update release')
      }

      showNotification('Release updated', 'success')
      setEditing(false)
      await fetchReleaseData()
    } catch (error: any) {
      showNotification(`Update failed: ${error.message}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Are you sure you want to delete this release? This cannot be undone.')) return

    setDeleting(true)
    try {
      const res = await fetch(`/api/studio/releases/${releaseId}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to delete release')
      }

      showNotification('Release deleted', 'success')
      router.push('/studio/releases')
    } catch (error: any) {
      showNotification(`Delete failed: ${error.message}`, 'error')
      setDeleting(false)
    }
  }

  async function handleDistribute() {
    if (!confirm('Submit this release for distribution?')) return

    setDistributing(true)
    try {
      const res = await fetch(`/api/studio/releases/${releaseId}/distribute`, {
        method: 'POST',
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to distribute')
      }

      showNotification('Release submitted for distribution', 'success')
      await fetchReleaseData()
    } catch (error: any) {
      showNotification(`Distribution failed: ${error.message}`, 'error')
    } finally {
      setDistributing(false)
    }
  }

  async function handleCheckStatus() {
    setCheckingStatus(true)
    try {
      const res = await fetch(`/api/studio/releases/${releaseId}/status`)
      if (res.ok) {
        const data = await res.json()
        showNotification(`Status: ${data.status}`, 'info')
        await fetchReleaseData()
      }
    } catch (error: any) {
      showNotification(`Failed to check status: ${error.message}`, 'error')
    } finally {
      setCheckingStatus(false)
    }
  }

  async function handleSubmitAllToSoundExchange() {
    if (!tracks || tracks.length === 0) {
      showNotification('No tracks to submit', 'error')
      return
    }

    const tracksWithISRC = tracks.filter((t) => t.isrc_full)
    if (tracksWithISRC.length === 0) {
      showNotification('No tracks with ISRCs to submit', 'error')
      return
    }

    setSubmittingToSoundExchange(true)
    try {
      const res = await fetch('/api/studio/soundexchange/batch-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackIds: tracksWithISRC.map((t) => t.id),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (data.configured === false) {
          showNotification('SoundExchange API not configured. Set SOUNDEXCHANGE_API_KEY in environment variables.', 'warning')
        } else {
          throw new Error(data.error || 'Failed to submit to SoundExchange')
        }
        return
      }

      showNotification(
        `Submitted ${data.successful} of ${data.total} ISRCs to SoundExchange`,
        data.successful === data.total ? 'success' : 'warning'
      )
    } catch (error: any) {
      showNotification(`Failed to submit to SoundExchange: ${error.message}`, 'error')
    } finally {
      setSubmittingToSoundExchange(false)
    }
  }

  if (loading || loadingData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-white text-xl">Loading...</div>
      </div>
    )
  }

  if (!user || !isAdmin) {
    return null
  }

  if (!release) {
    return (
      <div className="min-h-screen bg-black text-white p-8">
        <div className="max-w-4xl mx-auto">
          <p>Release not found</p>
        </div>
      </div>
    )
  }

  const statusColors: Record<string, string> = {
    draft: 'text-gray-400',
    submitted: 'text-yellow-400',
    delivered: 'text-blue-400',
    live: 'text-green-400',
    error: 'text-red-400',
  }

  const canDistribute = release.distributor_status === 'draft' && tracks.length > 0 && tracks.every((t) => t.isrc_full)

  const inputClass = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500'

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <button
            onClick={() => router.push('/studio/releases')}
            className="text-gray-400 hover:text-white text-sm mb-4"
          >
            &larr; Back to Releases
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">{release.title}</h1>
              <p className="text-gray-400 mt-2">
                Status: <span className={statusColors[release.distributor_status] || 'text-gray-400'}>
                  {release.distributor_status}
                </span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              {!editing && (
                <button
                  onClick={startEditing}
                  className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition text-gray-300 hover:text-white"
                  title="Edit Release"
                >
                  <FaEdit />
                </button>
              )}
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="p-2 bg-gray-800 hover:bg-red-600 rounded-lg transition text-gray-300 hover:text-white disabled:opacity-50"
                title="Delete Release"
              >
                <FaTrash />
              </button>
            </div>
          </div>
        </div>

        {/* Release Info */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6 mb-6">
          {editing ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Title</label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Type</label>
                  <select
                    value={editForm.type}
                    onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                    className={inputClass}
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
                    value={editForm.release_date}
                    onChange={(e) => setEditForm({ ...editForm, release_date: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Genre</label>
                  <input
                    type="text"
                    value={editForm.genre}
                    onChange={(e) => setEditForm({ ...editForm, genre: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Subgenre</label>
                  <input
                    type="text"
                    value={editForm.subgenre}
                    onChange={(e) => setEditForm({ ...editForm, subgenre: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Description</label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  rows={3}
                  className={inputClass}
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="edit-explicit"
                  checked={editForm.explicit}
                  onChange={(e) => setEditForm({ ...editForm, explicit: e.target.checked })}
                  className="w-4 h-4 rounded bg-gray-800 border-gray-700"
                />
                <label htmlFor="edit-explicit" className="text-sm">Explicit content</label>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-semibold transition disabled:opacity-50 flex items-center gap-2"
                >
                  <FaSave />
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg font-semibold transition flex items-center gap-2"
                >
                  <FaTimes />
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-gray-400">Type</div>
                <div className="font-medium">{release.type}</div>
              </div>
              {release.release_date && (
                <div>
                  <div className="text-sm text-gray-400">Release Date</div>
                  <div className="font-medium">{release.release_date}</div>
                </div>
              )}
              {release.genre && (
                <div>
                  <div className="text-sm text-gray-400">Genre</div>
                  <div className="font-medium">{release.genre}</div>
                </div>
              )}
              {release.subgenre && (
                <div>
                  <div className="text-sm text-gray-400">Subgenre</div>
                  <div className="font-medium">{release.subgenre}</div>
                </div>
              )}
              {release.description && (
                <div className="col-span-2">
                  <div className="text-sm text-gray-400">Description</div>
                  <div className="font-medium">{release.description}</div>
                </div>
              )}
              {release.explicit && (
                <div>
                  <div className="text-sm text-gray-400">Explicit</div>
                  <div className="font-medium">Yes</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tracks */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Tracks ({tracks.length})</h2>
          <div className="space-y-2">
            {tracks.map((track) => (
              <div key={track.id} className="p-3 bg-gray-800 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{track.title}</div>
                    {track.isrc_full ? (
                      <div className="text-xs text-green-400 font-mono">ISRC: {track.isrc_full}</div>
                    ) : (
                      <div className="text-xs text-yellow-400">No ISRC assigned</div>
                    )}
                  </div>
                  {track.version && (
                    <div className="text-sm text-gray-400">{track.version}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Store Links */}
        {storeLinks.length > 0 && (
          <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Store Links</h2>
            <div className="space-y-2">
              {storeLinks.map((link) => (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 p-3 bg-gray-800 rounded-lg hover:bg-gray-700 transition"
                >
                  <FaExternalLinkAlt className="text-gray-400" />
                  <span className="font-medium capitalize">{link.store}</span>
                  <span className="text-sm text-gray-400 ml-auto">View &rarr;</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-4">
          {canDistribute && (
            <button
              onClick={handleDistribute}
              disabled={distributing}
              className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-semibold transition disabled:opacity-50 flex items-center gap-2"
            >
              <FaRocket />
              {distributing ? 'Distributing...' : 'Distribute Release'}
            </button>
          )}

          {release.distributor_status !== 'draft' && (
            <button
              onClick={handleCheckStatus}
              disabled={checkingStatus}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition disabled:opacity-50 flex items-center gap-2"
            >
              <FaClock />
              {checkingStatus ? 'Checking...' : 'Check Status'}
            </button>
          )}

          {/* SoundExchange Submission */}
          {tracks.some((t) => t.isrc_full) && (
            <button
              onClick={handleSubmitAllToSoundExchange}
              disabled={submittingToSoundExchange}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold transition disabled:opacity-50 flex items-center gap-2"
            >
              <FaPaperPlane />
              {submittingToSoundExchange ? 'Submitting...' : 'Submit ISRCs to SoundExchange'}
            </button>
          )}

          {!canDistribute && release.distributor_status === 'draft' && (
            <div className="text-yellow-400 text-sm">
              {tracks.length === 0
                ? 'Add tracks to release first'
                : 'All tracks must have ISRCs assigned'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
