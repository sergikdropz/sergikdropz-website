'use client'

import { useEffect, useState } from 'react'
import { useAdminAuth } from '@/contexts/AdminAuthContext'
import { useRouter } from 'next/navigation'

interface Subscriber {
  id: string
  email: string
  name: string | null
  source: string
  source_track_id: string | null
  is_active: boolean
  created_at: string
}

export default function AdminSubscribersPage() {
  const { user, isAdmin, loading } = useAdminAuth()
  const router = useRouter()
  const [subscribers, setSubscribers] = useState<Subscriber[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [toggling, setToggling] = useState<string | null>(null)
useEffect(() => {
    if (isAdmin) loadSubscribers()
  }, [isAdmin])

  async function loadSubscribers() {
    try {
      const res = await fetch('/api/admin/subscribers')
      if (res.ok) {
        const data = await res.json()
        setSubscribers(data.subscribers || [])
      }
    } catch (err) {
      console.error('Error loading subscribers:', err)
    } finally {
      setLoadingData(false)
    }
  }

  async function toggleActive(sub: Subscriber) {
    setToggling(sub.id)
    try {
      const res = await fetch(`/api/admin/subscribers/${sub.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !sub.is_active }),
      })
      if (res.ok) {
        setSubscribers((prev) =>
          prev.map((s) => (s.id === sub.id ? { ...s, is_active: !s.is_active } : s))
        )
      }
    } catch (err) {
      console.error('Error toggling subscriber:', err)
    } finally {
      setToggling(null)
    }
  }

  async function bulkDeactivate() {
    if (selectedIds.size === 0) return
    if (!confirm(`Deactivate ${selectedIds.size} subscribers?`)) return

    const ids = Array.from(selectedIds)
    for (const id of ids) {
      try {
        await fetch(`/api/admin/subscribers/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: false }),
        })
      } catch (err) {
        console.error(`Error deactivating ${id}:`, err)
      }
    }
    setSelectedIds(new Set())
    loadSubscribers()
  }

  const filtered = subscribers
    .filter((s) => {
      if (filter === 'active') return s.is_active
      if (filter === 'inactive') return !s.is_active
      return true
    })
    .filter((s) => {
      if (!search) return true
      const q = search.toLowerCase()
      return s.email.toLowerCase().includes(q) || s.name?.toLowerCase().includes(q)
    })

  const exportCsv = () => {
    const headers = ['Email', 'Name', 'Source', 'Active', 'Date']
    const rows = filtered.map((s) => [
      s.email,
      s.name || '',
      s.source,
      s.is_active ? 'Yes' : 'No',
      new Date(s.created_at).toLocaleDateString(),
    ])
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `subscribers-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function toggleSelection(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map((s) => s.id)))
    }
  }

  if (loading || !isAdmin) return null

  const activeCount = subscribers.filter((s) => s.is_active).length
  const inactiveCount = subscribers.length - activeCount

  // Source breakdown
  const sourceBreakdown: Record<string, number> = {}
  subscribers.forEach((s) => {
    sourceBreakdown[s.source] = (sourceBreakdown[s.source] || 0) + 1
  })

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Email Subscribers</h1>
          <p className="text-gray-400 text-sm mt-1">
            {activeCount} active / {subscribers.length} total
          </p>
        </div>
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
            <button
              onClick={bulkDeactivate}
              className="px-4 py-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 text-sm rounded-lg transition-all"
            >
              Deactivate ({selectedIds.size})
            </button>
          )}
          <button
            onClick={exportCsv}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg transition-all"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Total</p>
          <p className="text-2xl font-bold text-white">{subscribers.length}</p>
        </div>
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Active</p>
          <p className="text-2xl font-bold text-green-400">{activeCount}</p>
        </div>
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Inactive</p>
          <p className="text-2xl font-bold text-red-400">{inactiveCount}</p>
        </div>
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Source Breakdown</p>
          <div className="flex flex-wrap gap-1 mt-1">
            {Object.entries(sourceBreakdown).map(([source, count]) => (
              <span key={source} className="text-xs text-gray-300">
                {source}: <span className="font-bold">{count}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex gap-2">
          {(['all', 'active', 'inactive'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                filter === f
                  ? 'bg-white text-black'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by email or name..."
          className="flex-1 px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-gray-500"
        />
      </div>

      {/* Table */}
      {loadingData ? (
        <div className="text-gray-400 animate-pulse">Loading...</div>
      ) : (
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="p-3 w-8">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === filtered.length && filtered.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded"
                    />
                  </th>
                  <th className="text-left p-3 text-gray-400 font-medium">Email</th>
                  <th className="text-left p-3 text-gray-400 font-medium">Name</th>
                  <th className="text-left p-3 text-gray-400 font-medium">Source</th>
                  <th className="text-left p-3 text-gray-400 font-medium">Status</th>
                  <th className="text-left p-3 text-gray-400 font-medium">Date</th>
                  <th className="text-left p-3 text-gray-400 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((sub) => (
                  <tr
                    key={sub.id}
                    className="border-b border-gray-800/50 hover:bg-gray-800/30"
                  >
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(sub.id)}
                        onChange={() => toggleSelection(sub.id)}
                        className="rounded"
                      />
                    </td>
                    <td className="p-3 text-white">{sub.email}</td>
                    <td className="p-3 text-gray-300">{sub.name || '-'}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 bg-gray-800 text-gray-300 text-xs rounded">
                        {sub.source}
                      </span>
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 text-xs rounded ${
                          sub.is_active
                            ? 'bg-green-600/20 text-green-400'
                            : 'bg-red-600/20 text-red-400'
                        }`}
                      >
                        {sub.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="p-3 text-gray-400">
                      {new Date(sub.created_at).toLocaleDateString()}
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => toggleActive(sub)}
                        disabled={toggling === sub.id}
                        className={`px-3 py-1 text-xs rounded transition-all ${
                          sub.is_active
                            ? 'bg-red-900/30 hover:bg-red-900/50 text-red-400'
                            : 'bg-green-900/30 hover:bg-green-900/50 text-green-400'
                        } disabled:opacity-50`}
                      >
                        {toggling === sub.id
                          ? '...'
                          : sub.is_active
                          ? 'Deactivate'
                          : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <div className="p-8 text-center text-gray-500">No subscribers found.</div>
          )}
        </div>
      )}
    </div>
  )
}
