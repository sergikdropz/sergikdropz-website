'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'

interface ActivityLog {
  id: string
  admin_id: string
  action_type: string
  resource_type?: string
  resource_id?: string
  details?: any
  ip_address?: string
  created_at: string
  admin?: {
    email: string
  }
}

export default function AdminLogs() {
  const { user, isAdmin, loading } = useAuth()
  const router = useRouter()
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [loadingLogs, setLoadingLogs] = useState(true)
  const [filters, setFilters] = useState({
    admin_id: '',
    action_type: '',
    resource_type: '',
    start_date: '',
    end_date: '',
  })
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1, page: 1, limit: 50 })
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      router.push('/admin/login')
    }
  }, [user, isAdmin, loading, router])

  useEffect(() => {
    if (isAdmin) {
      fetchLogs()
    }
  }, [isAdmin, filters, page])

  async function fetchLogs() {
    try {
      setLoadingLogs(true)
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '50',
      })

      if (filters.admin_id) {
        params.append('admin_id', filters.admin_id)
      }
      if (filters.action_type) {
        params.append('action_type', filters.action_type)
      }
      if (filters.resource_type) {
        params.append('resource_type', filters.resource_type)
      }
      if (filters.start_date) {
        params.append('start_date', filters.start_date)
      }
      if (filters.end_date) {
        params.append('end_date', filters.end_date)
      }

      const response = await fetch(`/api/admin/logs?${params}`)
      const data = await response.json()
      setLogs(data.logs || [])
      setPagination(data.pagination || pagination)
    } catch (error) {
      console.error('Error fetching logs:', error)
    } finally {
      setLoadingLogs(false)
    }
  }

  function handleFilterChange(key: string, value: string) {
    setFilters({ ...filters, [key]: value })
    setPage(1)
  }

  function handleExport() {
    // Convert logs to CSV
    const headers = ['Date', 'Admin', 'Action', 'Resource Type', 'Resource ID', 'Details', 'IP Address']
    const rows = logs.map((log) => [
      new Date(log.created_at).toLocaleString(),
      log.admin?.email || log.admin_id,
      log.action_type,
      log.resource_type || '',
      log.resource_id || '',
      JSON.stringify(log.details || {}),
      log.ip_address || '',
    ])

    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `activity-logs-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Filter logs by search query
  const filteredLogs = searchQuery
    ? logs.filter((log) => {
        const searchLower = searchQuery.toLowerCase()
        return (
          log.action_type.toLowerCase().includes(searchLower) ||
          log.resource_type?.toLowerCase().includes(searchLower) ||
          log.resource_id?.toLowerCase().includes(searchLower) ||
          log.admin?.email?.toLowerCase().includes(searchLower) ||
          JSON.stringify(log.details || {}).toLowerCase().includes(searchLower)
        )
      })
    : logs

  if (loading || loadingLogs) {
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
          <h1 className="text-4xl font-bold mb-2">Activity Logs</h1>
          <p className="text-gray-400">View all admin activity and actions</p>
        </div>

        {/* Filters */}
        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Filters</h2>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Action Type</label>
              <select
                value={filters.action_type}
                onChange={(e) => handleFilterChange('action_type', e.target.value)}
                className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
              >
                <option value="">All Actions</option>
                <option value="create">Create</option>
                <option value="update">Update</option>
                <option value="delete">Delete</option>
                <option value="login">Login</option>
                <option value="logout">Logout</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Resource Type</label>
              <select
                value={filters.resource_type}
                onChange={(e) => handleFilterChange('resource_type', e.target.value)}
                className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
              >
                <option value="">All Resources</option>
                <option value="track">Track</option>
                <option value="gallery">Gallery</option>
                <option value="purchase">Purchase</option>
                <option value="user">User</option>
                <option value="setting">Setting</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Start Date</label>
              <input
                type="date"
                value={filters.start_date}
                onChange={(e) => handleFilterChange('start_date', e.target.value)}
                className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">End Date</label>
              <input
                type="date"
                value={filters.end_date}
                onChange={(e) => handleFilterChange('end_date', e.target.value)}
                className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={() => {
                  setFilters({ admin_id: '', action_type: '', resource_type: '', start_date: '', end_date: '' })
                  setPage(1)
                }}
                className="w-full bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="flex space-x-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search logs..."
              className="flex-1 px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
            />
            <button
              onClick={handleExport}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition"
            >
              Export CSV
            </button>
          </div>
        </div>

        {/* Logs Table */}
        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-semibold">
              Activity Logs ({searchQuery ? filteredLogs.length : pagination.total})
            </h2>
          </div>

          {loadingLogs ? (
            <div className="text-center py-12 text-gray-400">Loading logs...</div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-12 text-gray-400">No activity logs found.</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left py-3 px-4 text-gray-400 font-semibold">Date</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-semibold">Admin</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-semibold">Action</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-semibold">Resource</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-semibold">Details</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-semibold">IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.map((log) => (
                      <tr
                        key={log.id}
                        className="border-b border-gray-800 hover:bg-gray-800/30 transition"
                      >
                        <td className="py-3 px-4 text-sm">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-sm">{log.admin?.email || log.admin_id.substring(0, 8)}...</div>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-1 rounded text-xs font-semibold ${
                              log.action_type === 'create'
                                ? 'bg-green-900/50 text-green-400'
                                : log.action_type === 'update'
                                ? 'bg-blue-900/50 text-blue-400'
                                : log.action_type === 'delete'
                                ? 'bg-red-900/50 text-red-400'
                                : 'bg-gray-900/50 text-gray-400'
                            }`}
                          >
                            {log.action_type}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div>
                            {log.resource_type && (
                              <div className="text-sm font-medium">{log.resource_type}</div>
                            )}
                            {log.resource_id && (
                              <div className="text-xs text-gray-400 font-mono">
                                {log.resource_id.substring(0, 16)}...
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          {log.details && (
                            <pre className="text-xs text-gray-400 max-w-md overflow-x-auto">
                              {JSON.stringify(log.details, null, 2)}
                            </pre>
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs text-gray-400 font-mono">
                          {log.ip_address || 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {!searchQuery && pagination.totalPages > 1 && (
                <div className="mt-4 flex justify-between items-center">
                  <div className="text-gray-400 text-sm">
                    Page {pagination.page} of {pagination.totalPages}
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setPage(Math.max(1, page - 1))}
                      disabled={page === 1}
                      className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setPage(Math.min(pagination.totalPages, page + 1))}
                      disabled={page >= pagination.totalPages}
                      className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
