'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
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

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

const EMPTY_FORM = {
  id: '',
  title: '',
  type: 'EP',
  release_date: '',
  presave_date: '',
  genre: '',
  description: '',
  status: 'pending',
  smart_link: '',
}

/** Parse YYYY-MM-DD without UTC day-shift. */
function parseScheduleDate(value: string): { year: number; month: number; day: number } | null {
  const m = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return null
    return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() }
  }
  return {
    year: Number(m[1]),
    month: Number(m[2]) - 1,
    day: Number(m[3]),
  }
}

function padDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function buildMonthCells(year: number, month: number) {
  const firstDow = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: Array<{ day: number | null; dateKey: string | null }> = []
  for (let i = 0; i < firstDow; i++) cells.push({ day: null, dateKey: null })
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ day, dateKey: padDate(year, month, day) })
  }
  while (cells.length % 7 !== 0) cells.push({ day: null, dateKey: null })
  return cells
}

export default function ReleaseCalendarPanel() {
  const { showNotification } = useNotifications()
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState<number | null>(() => new Date().getMonth())
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
    fetchSchedule()
  }, [fetchSchedule])

  const releases = useMemo(() => {
    return schedule
      .filter((r) => {
        const parsed = parseScheduleDate(r.release_date)
        return parsed != null && parsed.year === year
      })
      .sort((a, b) => {
        const pa = parseScheduleDate(a.release_date)
        const pb = parseScheduleDate(b.release_date)
        if (!pa || !pb) return 0
        return pa.month - pb.month || pa.day - pb.day
      })
  }, [schedule, year])

  const releasesByMonth = useMemo(() => {
    const map = new Map<number, typeof releases>()
    for (const r of releases) {
      const parsed = parseScheduleDate(r.release_date)
      if (!parsed) continue
      const existing = map.get(parsed.month) || []
      existing.push(r)
      map.set(parsed.month, existing)
    }
    return map
  }, [releases])

  const releasesByDay = useMemo(() => {
    const map = new Map<string, typeof releases>()
    for (const r of releases) {
      const parsed = parseScheduleDate(r.release_date)
      if (!parsed) continue
      const key = padDate(parsed.year, parsed.month, parsed.day)
      const existing = map.get(key) || []
      existing.push(r)
      map.set(key, existing)
    }
    return map
  }, [releases])

  const monthCells = useMemo(() => {
    if (selectedMonth == null) return []
    return buildMonthCells(year, selectedMonth)
  }, [year, selectedMonth])

  function openEditModal(release: any) {
    const parsed = parseScheduleDate(release.release_date)
    setModalForm({
      id: release.id,
      title: release.title || '',
      type: release.type || 'EP',
      release_date: parsed
        ? padDate(parsed.year, parsed.month, parsed.day)
        : release.release_date || '',
      presave_date: release.presave_date || '',
      genre: release.genre || '',
      description: release.description || '',
      status: release.status || 'pending',
      smart_link: release.smart_link || '',
    })
    setModalMode('edit')
    setModalOpen(true)
  }

  function openAddModal(prefillDate?: string) {
    setModalForm({
      ...EMPTY_FORM,
      release_date: prefillDate || '',
    })
    setModalMode('add')
    setModalOpen(true)
  }

  function changeYear(next: number) {
    setYear(next)
    // Keep month selection when browsing years; clear only if jumping away from overview intent
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
            status: modalForm.status || 'pending',
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
            status: modalForm.status || 'pending',
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

  if (loadingSchedule) {
    return (
      <div className="flex items-center justify-center py-20 text-zinc-500">
        Loading calendar…
      </div>
    )
  }

  const now = new Date()
  const inputClass = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500'

  const todayKey = padDate(now.getFullYear(), now.getMonth(), now.getDate())

  return (
    <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <p className="text-sm text-zinc-500">
            {selectedMonth == null
              ? 'Yearly slate — click a month to open the day grid.'
              : `${MONTHS[selectedMonth]} ${year} — click a day to schedule, or a release to edit.`}
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => openAddModal()}
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-semibold transition flex items-center gap-2 text-sm"
            >
              <FaPlus />
              Add Release
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => changeYear(year - 1)}
                className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition"
              >
                &larr;
              </button>
              <span className="px-4 py-2 bg-gray-900 rounded-lg text-lg font-bold tabular-nums">
                {year}
              </span>
              <button
                type="button"
                onClick={() => changeYear(year + 1)}
                className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition"
              >
                &rarr;
              </button>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 mb-6">
          {Object.entries(TYPE_COLORS).map(([type, color]) => (
            <div key={type} className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${color.split(' ')[0]}`} />
              <span className="text-gray-400 text-sm">{type}</span>
            </div>
          ))}
        </div>

        {selectedMonth != null ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedMonth(null)}
                  className="px-3 py-1.5 rounded-lg text-sm border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition"
                >
                  ← All months
                </button>
                <h3 className="text-lg font-semibold text-white">
                  {MONTHS[selectedMonth]} {year}
                </h3>
                {(releasesByMonth.get(selectedMonth) || []).length > 0 && (
                  <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
                    {(releasesByMonth.get(selectedMonth) || []).length} scheduled
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setSelectedMonth((m) => {
                      if (m == null) return 0
                      if (m === 0) {
                        changeYear(year - 1)
                        return 11
                      }
                      return m - 1
                    })
                  }
                  className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition"
                  aria-label="Previous month"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedMonth((m) => {
                      if (m == null) return 0
                      if (m === 11) {
                        changeYear(year + 1)
                        return 0
                      }
                      return m + 1
                    })
                  }
                  className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition"
                  aria-label="Next month"
                >
                  ›
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-[11px] uppercase tracking-wider text-zinc-500 mb-1">
              {WEEKDAYS.map((d) => (
                <div key={d} className="py-1">
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {monthCells.map((cell, idx) => {
                if (cell.day == null || !cell.dateKey) {
                  return (
                    <div
                      key={`empty-${idx}`}
                      className="min-h-[5.5rem] rounded-lg border border-transparent bg-transparent"
                    />
                  )
                }
                const dayReleases = releasesByDay.get(cell.dateKey) || []
                const isToday = cell.dateKey === todayKey
                const isPast = cell.dateKey < todayKey

                return (
                  <div
                    key={cell.dateKey}
                    className={`min-h-[5.5rem] rounded-lg border p-1.5 flex flex-col gap-1 transition ${
                      isToday
                        ? 'border-purple-500 bg-purple-900/20'
                        : isPast
                          ? 'border-zinc-800/80 bg-zinc-950/40'
                          : 'border-zinc-800 bg-zinc-900/60'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => openAddModal(cell.dateKey!)}
                      className={`self-start text-xs font-semibold tabular-nums rounded px-1.5 py-0.5 hover:bg-zinc-800 transition ${
                        isToday ? 'text-purple-200' : isPast ? 'text-zinc-500' : 'text-zinc-300'
                      }`}
                      title={`Schedule on ${cell.dateKey}`}
                    >
                      {cell.day}
                    </button>
                    <div className="flex-1 space-y-0.5 overflow-hidden">
                      {dayReleases.map((release) => {
                        const colorClass =
                          TYPE_COLORS[release.type] || 'bg-gray-600 border-gray-500'
                        return (
                          <button
                            key={release.id}
                            type="button"
                            onClick={() => openEditModal(release)}
                            className={`block w-full text-left rounded px-1 py-0.5 text-[10px] leading-tight truncate border-l-2 ${colorClass.split(' ')[1]} bg-black/40 hover:bg-black/70 text-white`}
                            title={`${release.title} (${release.type})`}
                          >
                            {release.title}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <>
            {/* Monthly overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {MONTHS.map((monthName, monthIndex) => {
                const monthReleases = releasesByMonth.get(monthIndex) || []
                const isCurrentMonth =
                  now.getFullYear() === year && now.getMonth() === monthIndex
                const isPast =
                  year < now.getFullYear() ||
                  (year === now.getFullYear() && monthIndex < now.getMonth())

                return (
                  <button
                    key={monthIndex}
                    type="button"
                    onClick={() => setSelectedMonth(monthIndex)}
                    className={`border rounded-lg p-4 text-left transition-all hover:border-violet-500/50 ${
                      isCurrentMonth
                        ? 'border-purple-500 bg-purple-900/10'
                        : isPast
                          ? 'border-gray-800 bg-gray-900/30 opacity-60'
                          : 'border-gray-800 bg-gray-900/50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h3
                        className={`font-semibold text-sm ${
                          isCurrentMonth ? 'text-purple-300' : 'text-gray-400'
                        }`}
                      >
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
                        {monthReleases.slice(0, 3).map((release) => {
                          const parsed = parseScheduleDate(release.release_date)
                          const day = parsed?.day
                          const colorClass =
                            TYPE_COLORS[release.type] || 'bg-gray-600 border-gray-500'

                          return (
                            <div
                              key={release.id}
                              className={`border-l-2 pl-3 py-1 ${colorClass.split(' ')[1]}`}
                            >
                              <p className="text-sm font-medium text-white truncate">
                                {release.title}
                              </p>
                              <p className="text-xs text-gray-500">
                                {monthName.slice(0, 3)} {day} · {release.type}
                              </p>
                            </div>
                          )
                        })}
                        {monthReleases.length > 3 && (
                          <p className="text-xs text-violet-400">
                            +{monthReleases.length - 3} more — open month
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-gray-600 text-xs italic">No releases · open days</p>
                    )}
                  </button>
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
                    const pa = parseScheduleDate(prev.release_date)
                    const pb = parseScheduleDate(release.release_date)
                    if (!pa || !pb) return null
                    const daysBetween = Math.round(
                      (Date.UTC(pb.year, pb.month, pb.day) -
                        Date.UTC(pa.year, pa.month, pa.day)) /
                        (1000 * 60 * 60 * 24),
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
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500 ml-3 mr-1" /> 2-4
                  weeks (optimal)
                  <span className="inline-block w-2 h-2 rounded-full bg-yellow-500 ml-3 mr-1" /> &gt;4
                  weeks
                </p>
              </div>
            )}
          </>
        )}

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
                      <option value="pending">Pending</option>
                      <option value="scheduled">Street date locked</option>
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
