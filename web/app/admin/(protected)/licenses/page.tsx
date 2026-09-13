'use client'

import { useState, useEffect } from 'react'
import { useAdminAuth } from '@/contexts/AdminAuthContext'
import { useRouter } from 'next/navigation'

interface License {
  id: string
  track_id: string
  track_title?: string
  tier: string
  customer_email: string
  customer_name?: string
  amount_paid: number
  status: string
  stream_limit?: number
  stripe_session_id?: string
  terms?: any
  created_at: string
}

interface LicenseStats {
  summary: {
    totalLicenses: number
    totalRevenue: number
    activeLicenses: number
    expiredLicenses: number
    topTier: { tier: string; revenue: number }
  }
  revenueByTier: Record<string, { count: number; revenue: number }>
}

const tierColors: Record<string, string> = {
  lease: 'bg-blue-600/20 text-blue-400',
  premium: 'bg-purple-600/20 text-purple-400',
  stems: 'bg-cyan-600/20 text-cyan-400',
  exclusive: 'bg-yellow-600/20 text-yellow-400',
}

export default function AdminLicensesPage() {
  const { user, isAdmin, loading } = useAdminAuth()
  const router = useRouter()
  const [licenses, setLicenses] = useState<License[]>([])
  const [stats, setStats] = useState<LicenseStats | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [loadingStats, setLoadingStats] = useState(true)
  const [filters, setFilters] = useState({
    tier: '',
    customer_email: '',
    track_id: '',
    status: '',
    start_date: '',
    end_date: '',
  })
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({
    total: 0,
    totalPages: 1,
    page: 1,
    limit: 50,
  })
  const [selectedLicense, setSelectedLicense] = useState<License | null>(null)
useEffect(() => {
    if (isAdmin) {
      fetchLicenses()
      fetchStats()
    }
  }, [isAdmin, page, filters])

  async function fetchLicenses() {
    try {
      setLoadingData(true)
      const params = new URLSearchParams({ page: page.toString(), limit: '50' })

      if (filters.tier) params.append('tier', filters.tier)
      if (filters.customer_email) params.append('customer_email', filters.customer_email)
      if (filters.track_id) params.append('track_id', filters.track_id)
      if (filters.status) params.append('status', filters.status)
      if (filters.start_date) params.append('start_date', filters.start_date)
      if (filters.end_date) params.append('end_date', filters.end_date)

      const res = await fetch(`/api/admin/licenses?${params}`)
      const data = await res.json()
      setLicenses(data.licenses || [])
      setPagination(data.pagination || pagination)
    } catch (err) {
      console.error('Error fetching licenses:', err)
    } finally {
      setLoadingData(false)
    }
  }

  async function fetchStats() {
    try {
      setLoadingStats(true)
      const res = await fetch('/api/admin/licenses/stats')
      const data = await res.json()
      setStats(data)
    } catch (err) {
      console.error('Error fetching license stats:', err)
    } finally {
      setLoadingStats(false)
    }
  }

  function handleFilterChange(key: string, value: string) {
    setFilters({ ...filters, [key]: value })
    setPage(1)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-white text-xl">Loading...</div>
      </div>
    )
  }

  if (!user || !isAdmin) return null

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">License Management</h1>
        <p className="text-gray-400 text-sm mt-1">Track and manage beat licenses</p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
            <p className="text-gray-400 text-sm">Total Licenses</p>
            <p className="text-2xl font-bold text-white">
              {stats.summary.totalLicenses}
            </p>
          </div>
          <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
            <p className="text-gray-400 text-sm">License Revenue</p>
            <p className="text-2xl font-bold text-green-400">
              ${stats.summary.totalRevenue.toFixed(2)}
            </p>
          </div>
          <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
            <p className="text-gray-400 text-sm">Active</p>
            <p className="text-2xl font-bold text-blue-400">
              {stats.summary.activeLicenses}
            </p>
          </div>
          <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
            <p className="text-gray-400 text-sm">Top Tier Revenue</p>
            <p className="text-2xl font-bold text-purple-400">
              {stats.summary.topTier.tier}
            </p>
            <p className="text-xs text-gray-400">
              ${stats.summary.topTier.revenue.toFixed(2)}
            </p>
          </div>
        </div>
      )}

      {/* Tier Breakdown */}
      {stats && Object.keys(stats.revenueByTier).length > 0 && (
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4 mb-6">
          <h2 className="text-lg font-semibold text-white mb-3">Tier Breakdown</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(stats.revenueByTier).map(([tier, data]) => (
              <div key={tier} className="text-center">
                <span
                  className={`inline-block px-3 py-1 text-xs rounded font-medium mb-2 ${
                    tierColors[tier] || 'bg-gray-600/20 text-gray-400'
                  }`}
                >
                  {tier}
                </span>
                <p className="text-white font-bold">{data.count} licenses</p>
                <p className="text-green-400 text-sm">${data.revenue.toFixed(2)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4 mb-6">
        <h2 className="text-lg font-semibold text-white mb-3">Filters</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Tier</label>
            <select
              value={filters.tier}
              onChange={(e) => handleFilterChange('tier', e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:border-purple-500"
            >
              <option value="">All Tiers</option>
              <option value="lease">Lease</option>
              <option value="premium">Premium</option>
              <option value="stems">Stems</option>
              <option value="exclusive">Exclusive</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Customer Email</label>
            <input
              type="text"
              value={filters.customer_email}
              onChange={(e) => handleFilterChange('customer_email', e.target.value)}
              placeholder="Search email..."
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:border-purple-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Track ID</label>
            <input
              type="text"
              value={filters.track_id}
              onChange={(e) => handleFilterChange('track_id', e.target.value)}
              placeholder="Track ID..."
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:border-purple-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Status</label>
            <select
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:border-purple-500"
            >
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="expired">Expired</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Start Date</label>
            <input
              type="date"
              value={filters.start_date}
              onChange={(e) => handleFilterChange('start_date', e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:border-purple-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">End Date</label>
            <input
              type="date"
              value={filters.end_date}
              onChange={(e) => handleFilterChange('end_date', e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:border-purple-500"
            />
          </div>
        </div>
        <button
          onClick={() => {
            setFilters({
              tier: '',
              customer_email: '',
              track_id: '',
              status: '',
              start_date: '',
              end_date: '',
            })
            setPage(1)
          }}
          className="mt-3 px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded transition"
        >
          Clear Filters
        </button>
      </div>

      {/* Licenses Table */}
      {loadingData ? (
        <div className="text-gray-400 animate-pulse">Loading...</div>
      ) : (
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg overflow-hidden">
          <div className="p-4 border-b border-gray-800">
            <h2 className="text-lg font-semibold text-white">
              Licenses ({pagination.total})
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left p-3 text-gray-400 font-medium">Date</th>
                  <th className="text-left p-3 text-gray-400 font-medium">Customer</th>
                  <th className="text-left p-3 text-gray-400 font-medium">Track</th>
                  <th className="text-left p-3 text-gray-400 font-medium">Tier</th>
                  <th className="text-left p-3 text-gray-400 font-medium">Amount</th>
                  <th className="text-left p-3 text-gray-400 font-medium">Stream Limit</th>
                  <th className="text-left p-3 text-gray-400 font-medium">Status</th>
                  <th className="text-left p-3 text-gray-400 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {licenses.map((license) => (
                  <tr
                    key={license.id}
                    className="border-b border-gray-800/50 hover:bg-gray-800/30"
                  >
                    <td className="p-3 text-gray-400">
                      {new Date(license.created_at).toLocaleDateString()}
                    </td>
                    <td className="p-3">
                      <div className="text-white text-sm">{license.customer_email}</div>
                      {license.customer_name && (
                        <div className="text-gray-400 text-xs">{license.customer_name}</div>
                      )}
                    </td>
                    <td className="p-3 text-white">
                      {license.track_title || license.track_id}
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 text-xs rounded font-medium ${
                          tierColors[license.tier] || 'bg-gray-600/20 text-gray-400'
                        }`}
                      >
                        {license.tier}
                      </span>
                    </td>
                    <td className="p-3 text-green-400">
                      ${((license.amount_paid || 0) / 100).toFixed(2)}
                    </td>
                    <td className="p-3 text-gray-300">
                      {license.stream_limit
                        ? license.stream_limit.toLocaleString()
                        : 'Unlimited'}
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 text-xs rounded ${
                          license.status === 'active'
                            ? 'bg-green-600/20 text-green-400'
                            : 'bg-red-600/20 text-red-400'
                        }`}
                      >
                        {license.status}
                      </span>
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => setSelectedLicense(license)}
                        className="text-purple-400 hover:text-purple-300 text-xs transition"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {licenses.length === 0 && (
            <div className="p-8 text-center text-gray-500">No licenses found.</div>
          )}

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="p-4 border-t border-gray-800 flex justify-between items-center">
              <div className="text-gray-400 text-sm">
                Page {pagination.page} of {pagination.totalPages}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded transition disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(Math.min(pagination.totalPages, page + 1))}
                  disabled={page >= pagination.totalPages}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded transition disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* License Detail Modal */}
      {selectedLicense && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-white">License Details</h2>
                <button
                  onClick={() => setSelectedLicense(null)}
                  className="text-gray-400 hover:text-white transition"
                >
                  X
                </button>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-gray-400 text-sm mb-1">Customer</div>
                    <div className="text-white">{selectedLicense.customer_email}</div>
                    {selectedLicense.customer_name && (
                      <div className="text-gray-300 text-sm">
                        {selectedLicense.customer_name}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-gray-400 text-sm mb-1">Date</div>
                    <div className="text-white">
                      {new Date(selectedLicense.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-gray-400 text-sm mb-1">Track</div>
                    <div className="text-white">
                      {selectedLicense.track_title || selectedLicense.track_id}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-sm mb-1">Tier</div>
                    <span
                      className={`px-2 py-0.5 text-xs rounded font-medium ${
                        tierColors[selectedLicense.tier] || 'bg-gray-600/20 text-gray-400'
                      }`}
                    >
                      {selectedLicense.tier}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-gray-400 text-sm mb-1">Amount</div>
                    <div className="text-green-400 font-bold">
                      ${((selectedLicense.amount_paid || 0) / 100).toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-sm mb-1">Status</div>
                    <span
                      className={`px-2 py-0.5 text-xs rounded ${
                        selectedLicense.status === 'active'
                          ? 'bg-green-600/20 text-green-400'
                          : 'bg-red-600/20 text-red-400'
                      }`}
                    >
                      {selectedLicense.status}
                    </span>
                  </div>
                </div>

                <div>
                  <div className="text-gray-400 text-sm mb-1">Stream Limit</div>
                  <div className="text-white">
                    {selectedLicense.stream_limit
                      ? selectedLicense.stream_limit.toLocaleString()
                      : 'Unlimited'}
                  </div>
                </div>

                {selectedLicense.stripe_session_id && (
                  <div>
                    <div className="text-gray-400 text-sm mb-1">Stripe Session ID</div>
                    <div className="text-white font-mono text-sm">
                      {selectedLicense.stripe_session_id}
                    </div>
                  </div>
                )}

                {/* Terms Snapshot */}
                {selectedLicense.terms && (
                  <div className="border-t border-gray-800 pt-4">
                    <div className="text-gray-400 text-sm mb-2">License Terms</div>
                    <div className="bg-gray-800/50 rounded p-3 space-y-1 text-sm">
                      {selectedLicense.terms.exclusivity && (
                        <div>
                          <span className="text-gray-400">Exclusivity:</span>{' '}
                          <span className="text-white">{selectedLicense.terms.exclusivity}</span>
                        </div>
                      )}
                      {selectedLicense.terms.duration && (
                        <div>
                          <span className="text-gray-400">Duration:</span>{' '}
                          <span className="text-white">{selectedLicense.terms.duration}</span>
                        </div>
                      )}
                      {selectedLicense.terms.allowCommercial !== undefined && (
                        <div>
                          <span className="text-gray-400">Commercial Use:</span>{' '}
                          <span className="text-white">
                            {selectedLicense.terms.allowCommercial ? 'Yes' : 'No'}
                          </span>
                        </div>
                      )}
                      {selectedLicense.terms.allowRadio !== undefined && (
                        <div>
                          <span className="text-gray-400">Radio/TV:</span>{' '}
                          <span className="text-white">
                            {selectedLicense.terms.allowRadio ? 'Yes' : 'No'}
                          </span>
                        </div>
                      )}
                      {selectedLicense.terms.creditRequired !== undefined && (
                        <div>
                          <span className="text-gray-400">Credit Required:</span>{' '}
                          <span className="text-white">
                            {selectedLicense.terms.creditRequired ? 'Yes' : 'No'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
