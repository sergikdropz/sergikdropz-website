'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AdminAuthContext'
import { useNotifications } from '@/contexts/NotificationContext'
import Link from 'next/link'
import StudioPageShell from '@/components/studio/StudioPageShell'
import ReleaseReadinessRing from '@/components/studio/ReleaseReadinessRing'
import { STATUS_STYLES } from '@/lib/studio/constants'
import { useStudioReleases } from '@/lib/api/studio-hooks'
import {
  FaPlus,
  FaRocket,
  FaCalendarAlt,
  FaEdit,
  FaSave,
  FaTimes,
  FaTrash,
  FaSatellite,
} from 'react-icons/fa'

export default function ReleasesPage() {
  const { user, isAdmin, loading } = useAuth()
  const { showNotification } = useNotifications()
  const router = useRouter()
  const [filter, setFilter] = useState<string>('all')
  const apiFilter = filter === 'pending' ? 'pending' : null
  const {
    data: queryReleases = [],
    isLoading: loadingReleases,
  } = useStudioReleases(
    filter === 'scheduled' ? null : apiFilter,
    Boolean(isAdmin) && filter !== 'scheduled'
  )
  const releases = filter === 'scheduled' ? [] : queryReleases

  // Scheduled releases from API
  const [scheduledReleases, setScheduledReleases] = useState<any[]>([])
  const [loadingScheduled, setLoadingScheduled] = useState(false)

  // Edit modal state for scheduled releases
  const [editingScheduled, setEditingScheduled] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    title: '',
    type: 'EP',
    release_date: '',
    presave_date: '',
    genre: '',
    description: '',
    status: 'scheduled',
    smart_link: '',
  })
  const [savingScheduled, setSavingScheduled] = useState(false)
  const [deletingScheduled, setDeletingScheduled] = useState(false)

  const fetchScheduledReleases = useCallback(async () => {
    try {
      setLoadingScheduled(true)
      const res = await fetch('/api/studio/release-schedule')
      if (res.ok) {
        const data = await res.json()
        setScheduledReleases(data.schedule || [])
      }
    } catch (error) {
      console.error('Error fetching scheduled releases:', error)
    } finally {
      setLoadingScheduled(false)
    }
  }, [])

  useEffect(() => {
    if (isAdmin && filter === 'scheduled') {
      fetchScheduledReleases()
    }
  }, [isAdmin, filter, fetchScheduledReleases])

  function startEditScheduled(release: any) {
    setEditForm({
      title: release.title || '',
      type: release.type || 'EP',
      release_date: release.release_date || '',
      presave_date: release.presave_date || '',
      genre: release.genre || '',
      description: release.description || '',
      status: release.status || 'scheduled',
      smart_link: release.smart_link || '',
    })
    setEditingScheduled(release.id)
  }

  async function handleSaveScheduled() {
    if (!editingScheduled) return

    setSavingScheduled(true)
    try {
      const res = await fetch('/api/studio/release-schedule', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingScheduled,
          title: editForm.title,
          type: editForm.type,
          release_date: editForm.release_date,
          presave_date: editForm.presave_date || null,
          genre: editForm.genre || null,
          description: editForm.description || null,
          status: editForm.status || 'scheduled',
          smart_link: editForm.smart_link || null,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to update')
      }

      showNotification('Release updated', 'success')
      setEditingScheduled(null)
      await fetchScheduledReleases()
    } catch (error: any) {
      showNotification(`Update failed: ${error.message}`, 'error')
    } finally {
      setSavingScheduled(false)
    }
  }

  async function handleDeleteScheduled(id: string) {
    if (!confirm('Delete this scheduled release?')) return

    setDeletingScheduled(true)
    try {
      const res = await fetch('/api/studio/release-schedule', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to delete')
      }

      showNotification('Release removed', 'success')
      setEditingScheduled(null)
      await fetchScheduledReleases()
    } catch (error: any) {
      showNotification(`Delete failed: ${error.message}`, 'error')
    } finally {
      setDeletingScheduled(false)
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

  const statusColors: Record<string, string> = {
    draft: 'text-gray-400',
    submitted: 'text-yellow-400',
    delivered: 'text-blue-400',
    live: 'text-green-400',
    error: 'text-red-400',
  }

  const inputClass = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500'

  return (
    <StudioPageShell
      title="Releases"
      subtitle="Draft, rights-check, and go-live — your internal distributor pipeline"
      actions={
        <Link
          href="/studio/releases/new"
          className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-5 py-2.5 rounded-full text-sm font-semibold transition"
        >
          <FaPlus />
          New release
        </Link>
      }
    >
        {/* Filters */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              filter === 'all'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('pending')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              filter === 'pending'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            Pending
          </button>
          <button
            onClick={() => setFilter('scheduled')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              filter === 'scheduled'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            Scheduled
          </button>
          <Link
            href="/studio/releases/command-center"
            className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-800 text-gray-300 hover:bg-gray-700 transition flex items-center gap-2 ml-auto"
          >
            <FaSatellite />
            Command
          </Link>
          <Link
            href="/studio/releases/pipeline"
            className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-800 text-gray-300 hover:bg-gray-700 transition flex items-center gap-2"
          >
            <FaRocket />
            Pipeline
          </Link>
          <Link
            href="/studio/releases/calendar"
            className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-800 text-gray-300 hover:bg-gray-700 transition flex items-center gap-2"
          >
            <FaCalendarAlt />
            Calendar
          </Link>
        </div>

        {/* Scheduled Releases from API */}
        {filter === 'scheduled' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {loadingScheduled ? (
              <div className="col-span-full text-center py-8 text-gray-400">Loading scheduled releases...</div>
            ) : (
              scheduledReleases
                .sort((a, b) => new Date(a.release_date).getTime() - new Date(b.release_date).getTime())
                .map((release) => {
                  const releaseDate = new Date(release.release_date)
                  const isReleased = releaseDate <= new Date()
                  const formattedDate = releaseDate.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })
                  const isEditing = editingScheduled === release.id

                  if (isEditing) {
                    return (
                      <div
                        key={release.id}
                        className="bg-gray-900/50 border border-purple-500 rounded-lg p-6"
                      >
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1">Title</label>
                            <input
                              type="text"
                              value={editForm.title}
                              onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                              className={inputClass}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-400 mb-1">Type</label>
                              <select
                                value={editForm.type}
                                onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                                className={inputClass}
                              >
                                <option value="Single">Single</option>
                                <option value="EP">EP</option>
                                <option value="Album">Album</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-400 mb-1">Status</label>
                              <select
                                value={editForm.status}
                                onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                                className={inputClass}
                              >
                                <option value="scheduled">Scheduled</option>
                                <option value="in_progress">In Progress</option>
                                <option value="mastered">Mastered</option>
                                <option value="released">Released</option>
                              </select>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-400 mb-1">Release Date</label>
                              <input
                                type="date"
                                value={editForm.release_date}
                                onChange={(e) => setEditForm({ ...editForm, release_date: e.target.value })}
                                className={inputClass}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-400 mb-1">Presave Date</label>
                              <input
                                type="date"
                                value={editForm.presave_date}
                                onChange={(e) => setEditForm({ ...editForm, presave_date: e.target.value })}
                                className={inputClass}
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1">Genre</label>
                            <input
                              type="text"
                              value={editForm.genre}
                              onChange={(e) => setEditForm({ ...editForm, genre: e.target.value })}
                              className={inputClass}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1">Description</label>
                            <textarea
                              value={editForm.description}
                              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                              rows={2}
                              className={inputClass}
                            />
                          </div>
                          <div className="flex items-center justify-between pt-2">
                            <button
                              onClick={() => handleDeleteScheduled(release.id)}
                              disabled={deletingScheduled}
                              className="text-red-400 hover:text-red-300 text-sm flex items-center gap-1 transition disabled:opacity-50"
                            >
                              <FaTrash className="text-xs" />
                              {deletingScheduled ? 'Deleting...' : 'Delete'}
                            </button>
                            <div className="flex gap-2">
                              <button
                                onClick={() => setEditingScheduled(null)}
                                className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg text-sm transition flex items-center gap-1"
                              >
                                <FaTimes className="text-xs" />
                                Cancel
                              </button>
                              <button
                                onClick={handleSaveScheduled}
                                disabled={savingScheduled}
                                className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg text-sm transition disabled:opacity-50 flex items-center gap-1"
                              >
                                <FaSave className="text-xs" />
                                {savingScheduled ? 'Saving...' : 'Save'}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  }

                  return (
                    <div
                      key={release.id}
                      className="bg-gray-900/50 border border-gray-800 rounded-lg p-6 hover:border-purple-500 transition-all duration-200 relative group"
                    >
                      <button
                        onClick={() => startEditScheduled(release)}
                        className="absolute top-4 right-4 p-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg transition opacity-0 group-hover:opacity-100 text-gray-400 hover:text-white"
                        title="Edit"
                      >
                        <FaEdit className="text-sm" />
                      </button>
                      {release.artwork && (
                        <img
                          src={release.artwork}
                          alt={release.title}
                          className="w-full aspect-square object-cover rounded-lg mb-4"
                        />
                      )}
                      <h3 className="text-xl font-semibold mb-1">{release.title}</h3>
                      <p className="text-sm text-gray-400 mb-2">{release.type} &middot; {release.genre}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">{formattedDate}</span>
                        <span className={`text-xs font-medium ${isReleased ? 'text-green-400' : 'text-purple-400'}`}>
                          {isReleased ? 'Released' : release.status}
                        </span>
                      </div>
                    </div>
                  )
                })
            )}
          </div>
        )}

        {/* Releases List */}
        {filter !== 'scheduled' && releases.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {releases.map((release) => {
              const statusKey = release.distributor_status || 'draft'
              const st = STATUS_STYLES[statusKey] || STATUS_STYLES.draft
              const score = release.copyright?.readiness_score ?? 0
              return (
                <Link
                  key={release.id}
                  href={`/studio/releases/${release.id}`}
                  className="group bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5 hover:border-violet-500/50 transition-all"
                >
                  <div className="flex gap-4 mb-2">
                    {release.artwork_url ? (
                      <img
                        src={release.artwork_url}
                        alt=""
                        className="w-20 h-20 rounded-xl object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-xl bg-zinc-800 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-semibold truncate">{release.title}</h3>
                      <p className="text-sm text-zinc-500 capitalize">{release.type}</p>
                      <span
                        className={`inline-block mt-2 px-2 py-0.5 rounded-full text-[10px] font-medium ${st.bg} ${st.text}`}
                      >
                        {st.label}
                      </span>
                    </div>
                    <ReleaseReadinessRing score={score} size={48} />
                  </div>
                  {release.copyright?.blockers?.[0] && (
                    <p className="text-xs text-amber-400/90 line-clamp-1">
                      {release.copyright.blockers[0]}
                    </p>
                  )}
                </Link>
              )
            })}
          </div>
        ) : filter !== 'scheduled' ? (
          <div className="text-center py-16 text-gray-400">
            <p className="mb-4">No releases found</p>
            <Link
              href="/studio/releases/new"
              className="text-purple-400 hover:text-purple-300 inline-block"
            >
              Create your first release
            </Link>
          </div>
        ) : null}
    </StudioPageShell>
  )
}
