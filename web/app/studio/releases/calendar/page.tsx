'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth } from '@/contexts/AdminAuthContext'
import { useNotifications } from '@/contexts/NotificationContext'
import { FaPlus, FaSave, FaTimes, FaTrash } from 'react-icons/fa'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const TYPE_COLORS: Record<string, string> = {
  EP: 'bg-purple-600 border-purple-500',
  Single: 'bg-blue-600 border-blue-500',
  Album: 'bg-amber-600 border-amber-500',
}

const EMPTY_FORM = {
  id: '',
  title: '',
  type: 'EP',
  release_date: '',
  presave_date: '',
  genre: '',
  description: '',
  status: 'scheduled',
  smart_link: '',
}

export default function ReleaseCalendarPage() {
  const { user, isAdmin, loading } = useAuth()
  const { showNotification } = useNotifications()
  const [year, setYear] = useState(2026)
  const [schedule, setSchedule] = useState<any[]>([])
  const [loadingSchedule, setLoadingSchedule] = useState(true)

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'edit' | 'add'>('add')
  const [modalForm, setModalForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchSchedule = useCallback(async () => {
    try {
      setLoadingSchedule(true)
      const res = await fetch('/api/studio/release-schedule')
      if (res.ok) {
        const data = await res.json()
        setSchedule(data.schedule || [])
      }
    } catch (error) {
      console.error('Error fetching schedule:', error)
    } finally {
      setLoadingSchedule(false)
    }
  }, [])

  useEffect(() => {
    if (isAdmin) {
      fetchSchedule()
    }
  }, [isAdmin, fetchSchedule])

  const releases = useMemo(() => {
    return schedule
      .filter((r) => new Date(r.release_date).getFullYear() === year)
      .sort((a, b) => new Date(a.release_date).getTime() - new Date(b.release_date).getTime())
  }, [schedule, year])

  const releasesByMonth = useMemo(() => {
    const map = new Map<number, typeof releases>()
    for (const r of releases) {
      const month = new Date(r.release_date).getMonth()
      const existing = map.get(month) || []
      existing.push(r)
      map.set(month, existing)
    }
    return map
  }, [releases])

  function openEditModal(release: any) {
    setModalForm({
      id: release.id,
      title: release.title || '',
      type: release.type || 'EP',
      release_date: release.release_date || '',
      presave_date: release.presave_date || '',
      genre: release.genre || '',
      description: release.description || '',
      status: release.status || 'scheduled',
      smart_link: release.smart_link || '',
    })
    setModalMode('edit')
    setModalOpen(true)
  }

  function openAddModal() {
    setModalForm({ ...EMPTY_FORM })
    setModalMode('add')
    setModalOpen(true)
  }

  async function handleModalSave() {
    if (!modalForm.title || !modalForm.release_date) {
      showNotification('Title and release date are required', 'error')
      return
    }

    setSaving(true)
    try {
      if (modalMode === 'add') {
        const res = await fetch('/api/studio/release-schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: modalForm.title,
            type: modalForm.type,
            release_date: modalForm.release_date,
            presave_date: modalForm.presave_date || null,
            genre: modalForm.genre || null,
            description: modalForm.description || null,
            status: modalForm.status || 'scheduled',
            smart_link: modalForm.smart_link || null,
          }),
        })

        if (!res.ok) {
          const error = await res.json()
          throw new Error(error.error || 'Failed to add release')
        }

        showNotification('Release added to schedule', 'success')
      } else {
        const res = await fetch('/api/studio/release-schedule', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: modalForm.id,
            title: modalForm.title,
            type: modalForm.type,
            release_date: modalForm.release_date,
            presave_date: modalForm.presave_date || null,
            genre: modalForm.genre || null,
            description: modalForm.description || null,
            status: modalForm.status || 'scheduled',
            smart_link: modalForm.smart_link || null,
          }),
        })

        if (!res.ok) {
          const error = await res.json()
          throw new Error(error.error || 'Failed to update release')
        }

        showNotification('Release updated', 'success')
      }

      setModalOpen(false)
      await fetchSchedule()
    } catch (error: any) {
      showNotification(`Save failed: ${error.message}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleModalDelete() {
    if (!modalForm.id) return
    if (!confirm('Delete this scheduled release?')) return

    setDeletingId(modalForm.id)
    try {
      const res = await fetch('/api/studio/release-schedule', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: modalForm.id }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to delete release')
      }

      showNotification('Release removed from schedule', 'success')
      setModalOpen(false)
      await fetchSchedule()
    } catch (error: any) {
      showNotification(`Delete failed: ${error.message}`, 'error')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading || loadingSchedule) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-white text-xl">Loading...</div>
      </div>
    )
  }

  if (!user || !isAdmin) return null

  const now = new Date()
  const inputClass = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500'

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link
              href="/studio/releases"
              className="text-gray-400 hover:text-white text-sm mb-2 inline-block transition-colors"
            >
              &larr; Back to Releases
            </Link>
            <h1 className="text-3xl font-bold">Release Calendar</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={openAddModal}
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-semibold transition flex items-center gap-2 text-sm"
            >
              <FaPlus />
              Add Release
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setYear(year - 1)}
                className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition"
              >
                &larr;
              </button>
              <span className="px-4 py-2 bg-gray-900 rounded-lg text-lg font-bold tabular-nums">
                {year}
              </span>
              <button
                onClick={() => setYear(year + 1)}
                className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition"
              >
                &rarr;
              </button>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex gap-4 mb-6">
          {Object.entries(TYPE_COLORS).map(([type, color]) => (
            <div key={type} className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${color.split(' ')[0]}`} />
              <span className="text-gray-400 text-sm">{type}</span>
            </div>
          ))}
        </div>

        {/* Monthly Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {MONTHS.map((monthName, monthIndex) => {
            const monthReleases = releasesByMonth.get(monthIndex) || []
            const isCurrentMonth =
              now.getFullYear() === year && now.getMonth() === monthIndex
            const isPast =
              year < now.getFullYear() ||
              (year === now.getFullYear() && monthIndex < now.getMonth())

            return (
              <div
                key={monthIndex}
                className={`border rounded-lg p-4 transition-all ${
                  isCurrentMonth
                    ? 'border-purple-500 bg-purple-900/10'
                    : isPast
                    ? 'border-gray-800 bg-gray-900/30 opacity-60'
                    : 'border-gray-800 bg-gray-900/50'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className={`font-semibold text-sm ${isCurrentMonth ? 'text-purple-300' : 'text-gray-400'}`}>
                    {monthName}
                  </h3>
                  {monthReleases.length > 0 && (
                    <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
                      {monthReleases.length}
                    </span>
                  )}
                </div>

                {monthReleases.length > 0 ? (
                  <div className="space-y-2">
                    {monthReleases.map((release) => {
                      const day = new Date(release.release_date).getDate()
                      const colorClass = TYPE_COLORS[release.type] || 'bg-gray-600 border-gray-500'
                      const isReleased = new Date(release.release_date) <= now

                      return (
                        <button
                          key={release.id}
                          onClick={() => openEditModal(release)}
                          className={`block w-full text-left border-l-2 pl-3 py-1.5 hover:bg-gray-800/50 rounded-r-lg transition-all ${colorClass.split(' ')[1]}`}
                        >
                          <div className="flex items-center gap-2">
                            {release.artwork && (
                              <div className="w-8 h-8 rounded overflow-hidden flex-shrink-0 relative">
                                <Image
                                  src={release.artwork}
                                  alt={release.title}
                                  fill
                                  className="object-cover"
                                  sizes="32px"
                                />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-white truncate">
                                {release.title}
                              </p>
                              <p className="text-xs text-gray-500">
                                {monthName.slice(0, 3)} {day} &middot; {release.type}
                                {isReleased && (
                                  <span className="text-green-400 ml-1">Released</span>
                                )}
                              </p>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-gray-600 text-xs italic">No releases</p>
                )}
              </div>
            )
          })}
        </div>

        {/* Timeline spacing visualization */}
        {releases.length >= 2 && (
          <div className="mt-8 p-6 bg-gray-900/50 border border-gray-800 rounded-lg">
            <h3 className="text-sm font-semibold text-gray-400 mb-4">Release Spacing</h3>
            <div className="space-y-2">
              {releases.map((release, i) => {
                if (i === 0) return null
                const prev = releases[i - 1]
                const daysBetween = Math.round(
                  (new Date(release.release_date).getTime() - new Date(prev.release_date).getTime()) /
                    (1000 * 60 * 60 * 24)
                )
                const weeksBetween = Math.round(daysBetween / 7)
                const barWidth = Math.min(100, (daysBetween / 42) * 100)

                return (
                  <div key={release.id} className="flex items-center gap-3 text-sm">
                    <span className="text-gray-500 w-40 truncate text-right text-xs">
                      {prev.title}
                    </span>
                    <div className="flex-1 bg-gray-800 rounded-full h-2 max-w-xs">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          daysBetween < 14
                            ? 'bg-red-500'
                            : daysBetween <= 28
                            ? 'bg-green-500'
                            : 'bg-yellow-500'
                        }`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                    <span className="text-gray-400 text-xs w-20">
                      {weeksBetween}w ({daysBetween}d)
                    </span>
                    <span className="text-gray-500 w-40 truncate text-xs">
                      {release.title}
                    </span>
                  </div>
                )
              })}
            </div>
            <p className="text-gray-600 text-xs mt-3">
              <span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" /> &lt;2 weeks
              <span className="inline-block w-2 h-2 rounded-full bg-green-500 ml-3 mr-1" /> 2-4 weeks (optimal)
              <span className="inline-block w-2 h-2 rounded-full bg-yellow-500 ml-3 mr-1" /> &gt;4 weeks
            </p>
          </div>
        )}
      </div>

      {/* Edit/Add Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold">
                  {modalMode === 'add' ? 'Add Scheduled Release' : 'Edit Scheduled Release'}
                </h2>
                <button
                  onClick={() => setModalOpen(false)}
                  className="text-gray-400 hover:text-white transition"
                >
                  <FaTimes />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Title *</label>
                  <input
                    type="text"
                    value={modalForm.title}
                    onChange={(e) => setModalForm({ ...modalForm, title: e.target.value })}
                    className={inputClass}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Type</label>
                    <select
                      value={modalForm.type}
                      onChange={(e) => setModalForm({ ...modalForm, type: e.target.value })}
                      className={inputClass}
                    >
                      <option value="Single">Single</option>
                      <option value="EP">EP</option>
                      <option value="Album">Album</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Status</label>
                    <select
                      value={modalForm.status}
                      onChange={(e) => setModalForm({ ...modalForm, status: e.target.value })}
                      className={inputClass}
                    >
                      <option value="scheduled">Scheduled</option>
                      <option value="in_progress">In Progress</option>
                      <option value="mastered">Mastered</option>
                      <option value="released">Released</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Release Date *</label>
                    <input
                      type="date"
                      value={modalForm.release_date}
                      onChange={(e) => setModalForm({ ...modalForm, release_date: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Presave Date</label>
                    <input
                      type="date"
                      value={modalForm.presave_date}
                      onChange={(e) => setModalForm({ ...modalForm, presave_date: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Genre</label>
                  <input
                    type="text"
                    value={modalForm.genre}
                    onChange={(e) => setModalForm({ ...modalForm, genre: e.target.value })}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Description</label>
                  <textarea
                    value={modalForm.description}
                    onChange={(e) => setModalForm({ ...modalForm, description: e.target.value })}
                    rows={3}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Smart Link</label>
                  <input
                    type="text"
                    value={modalForm.smart_link}
                    onChange={(e) => setModalForm({ ...modalForm, smart_link: e.target.value })}
                    placeholder="https://..."
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-800">
                <div>
                  {modalMode === 'edit' && (
                    <button
                      onClick={handleModalDelete}
                      disabled={!!deletingId}
                      className="text-red-400 hover:text-red-300 text-sm font-medium transition disabled:opacity-50 flex items-center gap-2"
                    >
                      <FaTrash />
                      {deletingId ? 'Deleting...' : 'Delete'}
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setModalOpen(false)}
                    className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg font-semibold transition flex items-center gap-2"
                  >
                    <FaTimes />
                    Cancel
                  </button>
                  <button
                    onClick={handleModalSave}
                    disabled={saving}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-semibold transition disabled:opacity-50 flex items-center gap-2"
                  >
                    <FaSave />
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
