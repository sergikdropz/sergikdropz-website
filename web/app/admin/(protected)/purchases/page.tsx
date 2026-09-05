'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAdminAuth } from '@/contexts/AdminAuthContext'
import { useRouter } from 'next/navigation'

interface Purchase {
  id: string
  stripe_session_id: string
  track_id?: string
  track_title?: string
  format: string
  product_type?: string
  customer_email?: string
  customer_name?: string
  amount_paid?: number
  currency: string
  purchased_at: string
  download_count: number
  last_downloaded_at?: string
  license_tier?: string
  tip_message?: string
  bundle_items?: string[]
  file_url?: string
  notes?: string
}

interface PurchaseStats {
  summary: {
    totalRevenue: number
    totalPurchases: number
    totalDownloads: number
    averageOrderValue: number
  }
  revenueByDate: Record<string, number>
  topTracks: Array<{
    trackId: string
    title: string
    revenue: number
    count: number
  }>
}

interface PurchaseForm {
  track_id: string
  track_title: string
  format: string
  product_type: string
  customer_email: string
  customer_name: string
  amount_paid: string
  currency: string
  purchased_at: string
  stripe_session_id: string
  license_tier: string
  file_url: string
}

const EMPTY_FORM: PurchaseForm = {
  track_id: '',
  track_title: '',
  format: 'WAV',
  product_type: 'track',
  customer_email: '',
  customer_name: '',
  amount_paid: '',
  currency: 'usd',
  purchased_at: new Date().toISOString().slice(0, 16),
  stripe_session_id: '',
  license_tier: '',
  file_url: '',
}

const productTypeBadges: Record<string, string> = {
  track: 'bg-blue-600/20 text-blue-400',
  'ep-bundle': 'bg-indigo-600/20 text-indigo-400',
  license: 'bg-purple-600/20 text-purple-400',
  tip: 'bg-green-600/20 text-green-400',
  bundle: 'bg-yellow-600/20 text-yellow-400',
  'bundle-item': 'bg-yellow-600/10 text-yellow-500',
  merch: 'bg-pink-600/20 text-pink-400',
  membership: 'bg-orange-600/20 text-orange-400',
}

const PRODUCT_TYPES = [
  'track',
  'ep-bundle',
  'license',
  'tip',
  'bundle',
  'bundle-item',
  'merch',
  'membership',
]

const FORMATS = ['WAV', 'MP3', 'FLAC', 'BUNDLE', 'LICENSE', 'N/A']

export default function AdminPurchases() {
  const { user, isAdmin, loading } = useAdminAuth()
  const router = useRouter()
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [stats, setStats] = useState<PurchaseStats | null>(null)
  const [loadingPurchases, setLoadingPurchases] = useState(true)
  const [loadingStats, setLoadingStats] = useState(true)
  const [saving, setSaving] = useState(false)
  const [filters, setFilters] = useState({
    customer_email: '',
    track_id: '',
    product_type: '',
    start_date: '',
    end_date: '',
  })
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1, page: 1, limit: 50 })

  // Modal state
  const [modalMode, setModalMode] = useState<'closed' | 'view' | 'edit' | 'add'>('closed')
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null)
  const [form, setForm] = useState<PurchaseForm>(EMPTY_FORM)
  const [formError, setFormError] = useState('')
const fetchPurchases = useCallback(async () => {
    try {
      setLoadingPurchases(true)
      const params = new URLSearchParams({ page: page.toString(), limit: '50' })

      if (filters.customer_email) params.append('customer_email', filters.customer_email)
      if (filters.track_id) params.append('track_id', filters.track_id)
      if (filters.product_type) params.append('product_type', filters.product_type)
      if (filters.start_date) params.append('start_date', filters.start_date)
      if (filters.end_date) params.append('end_date', filters.end_date)

      const response = await fetch(`/api/admin/purchases?${params}`)
      const data = await response.json()
      setPurchases(data.purchases || [])
      setPagination(data.pagination || pagination)
    } catch (error) {
      console.error('Error fetching purchases:', error)
    } finally {
      setLoadingPurchases(false)
    }
  }, [page, filters])

  const fetchStats = useCallback(async () => {
    try {
      setLoadingStats(true)
      const params = new URLSearchParams()
      if (filters.start_date) params.append('start_date', filters.start_date)
      if (filters.end_date) params.append('end_date', filters.end_date)

      const response = await fetch(`/api/admin/purchases/stats?${params}`)
      const data = await response.json()
      setStats(data)
    } catch (error) {
      console.error('Error fetching stats:', error)
    } finally {
      setLoadingStats(false)
    }
  }, [filters.start_date, filters.end_date])

  useEffect(() => {
    if (isAdmin) {
      fetchPurchases()
      fetchStats()
    }
  }, [isAdmin, fetchPurchases, fetchStats])

  function handleFilterChange(key: string, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setPage(1)
  }

  function openAddModal() {
    setForm({ ...EMPTY_FORM, purchased_at: new Date().toISOString().slice(0, 16) })
    setFormError('')
    setSelectedPurchase(null)
    setModalMode('add')
  }

  function openViewModal(purchase: Purchase) {
    setSelectedPurchase(purchase)
    setModalMode('view')
  }

  function openEditModal(purchase: Purchase) {
    setSelectedPurchase(purchase)
    setForm({
      track_id: purchase.track_id || '',
      track_title: purchase.track_title || '',
      format: purchase.format || 'WAV',
      product_type: purchase.product_type || 'track',
      customer_email: purchase.customer_email || '',
      customer_name: purchase.customer_name || '',
      amount_paid: purchase.amount_paid != null ? ((purchase.amount_paid) / 100).toFixed(2) : '',
      currency: purchase.currency || 'usd',
      purchased_at: purchase.purchased_at ? new Date(purchase.purchased_at).toISOString().slice(0, 16) : '',
      stripe_session_id: purchase.stripe_session_id || '',
      license_tier: purchase.license_tier || '',
      file_url: purchase.file_url || '',
    })
    setFormError('')
    setModalMode('edit')
  }

  function closeModal() {
    setModalMode('closed')
    setSelectedPurchase(null)
    setForm(EMPTY_FORM)
    setFormError('')
  }

  function updateForm(key: keyof PurchaseForm, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    setFormError('')
    if (!form.product_type) {
      setFormError('Product type is required.')
      return
    }

    setSaving(true)
    try {
      if (modalMode === 'add') {
        const res = await fetch('/api/admin/purchases', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...form,
            amount_paid: form.amount_paid ? parseFloat(form.amount_paid) : 0,
            purchased_at: form.purchased_at ? new Date(form.purchased_at).toISOString() : undefined,
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          setFormError(data.error || 'Failed to create purchase')
          return
        }
      } else if (modalMode === 'edit' && selectedPurchase) {
        const res = await fetch('/api/admin/purchases', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: selectedPurchase.id,
            ...form,
            amount_paid: form.amount_paid ? parseFloat(form.amount_paid) : 0,
            purchased_at: form.purchased_at ? new Date(form.purchased_at).toISOString() : undefined,
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          setFormError(data.error || 'Failed to update purchase')
          return
        }
      }
      closeModal()
      fetchPurchases()
      fetchStats()
    } catch (error) {
      setFormError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!selectedPurchase) return
    if (!confirm(`Delete this purchase record? This cannot be undone.`)) return

    setSaving(true)
    try {
      const res = await fetch(`/api/admin/purchases?id=${selectedPurchase.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        setFormError(data.error || 'Failed to delete purchase')
        return
      }
      closeModal()
      fetchPurchases()
      fetchStats()
    } catch (error) {
      setFormError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  function handleExportCSV() {
    const headers = [
      'Date', 'Customer Email', 'Customer Name', 'Track', 'Format',
      'Product Type', 'Amount', 'Currency', 'Downloads',
    ]
    const rows = purchases.map((p) => [
      new Date(p.purchased_at).toLocaleString(),
      p.customer_email || '',
      p.customer_name || '',
      p.track_title || p.track_id || '',
      p.format,
      p.product_type || 'track',
      ((p.amount_paid || 0) / 100).toFixed(2),
      p.currency.toUpperCase(),
      p.download_count.toString(),
    ])

    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `purchases-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading || loadingPurchases) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-white text-xl">Loading...</div>
      </div>
    )
  }

  if (!user || !isAdmin) return null

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-4xl font-bold mb-2">Purchase Management</h1>
            <p className="text-gray-400">View, add, edit, and manage all purchases</p>
          </div>
          <button
            onClick={openAddModal}
            className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-lg transition font-medium flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Purchase
          </button>
        </div>

        {/* Revenue Summary Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
              <div className="text-gray-400 text-sm mb-1">Total Revenue</div>
              <div className="text-2xl font-bold text-green-400">
                ${stats.summary.totalRevenue.toFixed(2)}
              </div>
            </div>
            <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
              <div className="text-gray-400 text-sm mb-1">Total Purchases</div>
              <div className="text-2xl font-bold">{stats.summary.totalPurchases}</div>
            </div>
            <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
              <div className="text-gray-400 text-sm mb-1">Total Downloads</div>
              <div className="text-2xl font-bold">{stats.summary.totalDownloads}</div>
            </div>
            <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
              <div className="text-gray-400 text-sm mb-1">Average Order Value</div>
              <div className="text-2xl font-bold">
                ${stats.summary.averageOrderValue.toFixed(2)}
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Filters</h2>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Customer Email
              </label>
              <input
                type="text"
                value={filters.customer_email}
                onChange={(e) => handleFilterChange('customer_email', e.target.value)}
                className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
                placeholder="Filter by email..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Track ID</label>
              <input
                type="text"
                value={filters.track_id}
                onChange={(e) => handleFilterChange('track_id', e.target.value)}
                className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
                placeholder="Filter by track..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Product Type
              </label>
              <select
                value={filters.product_type}
                onChange={(e) => handleFilterChange('product_type', e.target.value)}
                title="Filter by product type"
                className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
              >
                <option value="">All Types</option>
                {PRODUCT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Start Date</label>
              <input
                type="date"
                title="Filter start date"
                value={filters.start_date}
                onChange={(e) => handleFilterChange('start_date', e.target.value)}
                className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">End Date</label>
              <input
                type="date"
                title="Filter end date"
                value={filters.end_date}
                onChange={(e) => handleFilterChange('end_date', e.target.value)}
                className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
              />
            </div>
          </div>
          <div className="mt-4 flex space-x-2">
            <button
              onClick={() => {
                setFilters({ customer_email: '', track_id: '', product_type: '', start_date: '', end_date: '' })
                setPage(1)
              }}
              className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition"
            >
              Clear Filters
            </button>
            <button
              onClick={handleExportCSV}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition"
            >
              Export CSV
            </button>
          </div>
        </div>

        {/* Purchases Table */}
        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-semibold">Purchases ({pagination.total})</h2>
          </div>

          {purchases.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              No purchases found.
              <button onClick={openAddModal} className="ml-2 text-purple-400 hover:text-purple-300 underline">
                Add one manually
              </button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left py-3 px-4 text-gray-400 font-semibold">Date</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-semibold">Customer</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-semibold">Track</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-semibold">Type</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-semibold">Format</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-semibold">Amount</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-semibold">Downloads</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchases.map((purchase) => {
                      const pType = purchase.product_type || 'track'
                      const isManual = purchase.stripe_session_id?.startsWith('manual_')
                      return (
                        <tr
                          key={purchase.id}
                          className="border-b border-gray-800 hover:bg-gray-800/30 transition"
                        >
                          <td className="py-3 px-4 text-sm">
                            {new Date(purchase.purchased_at).toLocaleString()}
                          </td>
                          <td className="py-3 px-4">
                            <div>
                              {purchase.customer_name && (
                                <div className="font-medium">{purchase.customer_name}</div>
                              )}
                              <div className="text-sm text-gray-400">
                                {purchase.customer_email || 'N/A'}
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-sm">
                            {purchase.track_title || purchase.track_id || 'N/A'}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 text-xs rounded font-medium ${productTypeBadges[pType] || 'bg-gray-600/20 text-gray-400'}`}>
                              {pType}
                            </span>
                            {isManual && (
                              <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded bg-gray-700 text-gray-400">
                                manual
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-sm">{purchase.format}</td>
                          <td className="py-3 px-4 text-sm">
                            ${((purchase.amount_paid || 0) / 100).toFixed(2)}{' '}
                            {purchase.currency.toUpperCase()}
                          </td>
                          <td className="py-3 px-4 text-sm">{purchase.download_count}</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => openViewModal(purchase)}
                                className="text-purple-400 hover:text-purple-300 transition text-sm"
                              >
                                View
                              </button>
                              <span className="text-gray-700">|</span>
                              <button
                                onClick={() => openEditModal(purchase)}
                                className="text-blue-400 hover:text-blue-300 transition text-sm"
                              >
                                Edit
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {pagination.totalPages > 1 && (
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

      {/* View Details Modal */}
      {modalMode === 'view' && selectedPurchase && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Purchase Details</h2>
                <button onClick={closeModal} className="text-gray-400 hover:text-white transition text-xl" aria-label="Close modal">
                  &times;
                </button>
              </div>
              <div className="space-y-4">
                <DetailRow label="Purchase Date" value={new Date(selectedPurchase.purchased_at).toLocaleString()} />
                <DetailRow label="Stripe Session ID" value={selectedPurchase.stripe_session_id} mono />
                <div>
                  <div className="text-gray-400 text-sm mb-1">Customer</div>
                  <div>
                    {selectedPurchase.customer_name && <div className="font-medium">{selectedPurchase.customer_name}</div>}
                    <div className="text-gray-400">{selectedPurchase.customer_email || 'N/A'}</div>
                  </div>
                </div>
                <div>
                  <div className="text-gray-400 text-sm mb-1">Product Type</div>
                  <span className={`px-2 py-0.5 text-xs rounded font-medium ${productTypeBadges[selectedPurchase.product_type || 'track'] || 'bg-gray-600/20 text-gray-400'}`}>
                    {selectedPurchase.product_type || 'track'}
                  </span>
                </div>
                <DetailRow label="Track" value={selectedPurchase.track_title || selectedPurchase.track_id || 'N/A'} />
                <DetailRow label="Track ID" value={selectedPurchase.track_id || 'N/A'} mono />
                <DetailRow label="Format" value={selectedPurchase.format} />
                <div>
                  <div className="text-gray-400 text-sm mb-1">Amount</div>
                  <div className="text-green-400 font-semibold">
                    ${((selectedPurchase.amount_paid || 0) / 100).toFixed(2)} {selectedPurchase.currency.toUpperCase()}
                  </div>
                </div>
                <div>
                  <div className="text-gray-400 text-sm mb-1">Downloads</div>
                  <div>{selectedPurchase.download_count}</div>
                  {selectedPurchase.last_downloaded_at && (
                    <div className="text-gray-400 text-sm mt-1">
                      Last: {new Date(selectedPurchase.last_downloaded_at).toLocaleString()}
                    </div>
                  )}
                </div>
                {selectedPurchase.file_url && (
                  <DetailRow label="File URL" value={selectedPurchase.file_url} mono />
                )}
                {selectedPurchase.license_tier && (
                  <div className="border-t border-gray-800 pt-4">
                    <div className="text-gray-400 text-sm mb-1">License Tier</div>
                    <div className="text-purple-400 font-medium">{selectedPurchase.license_tier}</div>
                  </div>
                )}
                {selectedPurchase.tip_message && (
                  <div className="border-t border-gray-800 pt-4">
                    <div className="text-gray-400 text-sm mb-1">Tip Message</div>
                    <div className="bg-gray-800/50 rounded p-3 text-sm italic">
                      &quot;{selectedPurchase.tip_message}&quot;
                    </div>
                  </div>
                )}
                {selectedPurchase.bundle_items && selectedPurchase.bundle_items.length > 0 && (
                  <div className="border-t border-gray-800 pt-4">
                    <div className="text-gray-400 text-sm mb-1">Bundle Items</div>
                    <div className="flex flex-wrap gap-1">
                      {selectedPurchase.bundle_items.map((item, i) => (
                        <span key={i} className="px-2 py-0.5 bg-gray-800 text-gray-300 text-xs rounded">{item}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-6 pt-4 border-t border-gray-800">
                <button
                  onClick={() => openEditModal(selectedPurchase)}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg transition font-medium"
                >
                  Edit Purchase
                </button>
                <button
                  onClick={handleDelete}
                  disabled={saving}
                  className="bg-red-600/80 hover:bg-red-700 text-white px-5 py-2.5 rounded-lg transition font-medium disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Modal */}
      {(modalMode === 'add' || modalMode === 'edit') && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">
                  {modalMode === 'add' ? 'Add Purchase' : 'Edit Purchase'}
                </h2>
                <button onClick={closeModal} className="text-gray-400 hover:text-white transition text-xl" aria-label="Close modal">
                  &times;
                </button>
              </div>

              {formError && (
                <div className="mb-4 p-3 bg-red-600/20 border border-red-600/30 rounded-lg text-red-400 text-sm">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Customer Name" value={form.customer_name} onChange={(v) => updateForm('customer_name', v)} placeholder="John Doe" />
                <FormField label="Customer Email" value={form.customer_email} onChange={(v) => updateForm('customer_email', v)} placeholder="john@example.com" type="email" />
                <FormField label="Track Title" value={form.track_title} onChange={(v) => updateForm('track_title', v)} placeholder="Track or product name" />
                <FormField label="Track / Product ID" value={form.track_id} onChange={(v) => updateForm('track_id', v)} placeholder="ep-soul-candy" />

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Product Type *</label>
                  <select
                    value={form.product_type}
                    onChange={(e) => updateForm('product_type', e.target.value)}
                    title="Product type"
                    className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
                  >
                    {PRODUCT_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Format</label>
                  <select
                    value={form.format}
                    onChange={(e) => updateForm('format', e.target.value)}
                    title="Format"
                    className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
                  >
                    {FORMATS.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>

                <FormField
                  label="Amount (USD)"
                  value={form.amount_paid}
                  onChange={(v) => updateForm('amount_paid', v)}
                  placeholder="9.99"
                  type="number"
                  step="0.01"
                />

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Currency</label>
                  <select
                    value={form.currency}
                    onChange={(e) => updateForm('currency', e.target.value)}
                    title="Currency"
                    className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
                  >
                    <option value="usd">USD</option>
                    <option value="eur">EUR</option>
                    <option value="gbp">GBP</option>
                  </select>
                </div>

                <FormField
                  label="Purchase Date"
                  value={form.purchased_at}
                  onChange={(v) => updateForm('purchased_at', v)}
                  type="datetime-local"
                />

                <FormField
                  label="Stripe Session ID"
                  value={form.stripe_session_id}
                  onChange={(v) => updateForm('stripe_session_id', v)}
                  placeholder="Auto-generated if empty"
                />

                <FormField
                  label="License Tier"
                  value={form.license_tier}
                  onChange={(v) => updateForm('license_tier', v)}
                  placeholder="lease, premium, stems..."
                />

                <div className="md:col-span-2">
                  <FormField
                    label="File URL"
                    value={form.file_url}
                    onChange={(v) => updateForm('file_url', v)}
                    placeholder="https://..."
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6 pt-4 border-t border-gray-800">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2.5 rounded-lg transition font-medium disabled:opacity-50"
                >
                  {saving ? 'Saving...' : modalMode === 'add' ? 'Create Purchase' : 'Save Changes'}
                </button>
                {modalMode === 'edit' && selectedPurchase && (
                  <button
                    onClick={handleDelete}
                    disabled={saving}
                    className="bg-red-600/80 hover:bg-red-700 text-white px-5 py-2.5 rounded-lg transition font-medium disabled:opacity-50"
                  >
                    Delete
                  </button>
                )}
                <button
                  onClick={closeModal}
                  className="bg-gray-700 hover:bg-gray-600 text-white px-5 py-2.5 rounded-lg transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-gray-400 text-sm mb-1">{label}</div>
      <div className={mono ? 'font-mono text-sm break-all' : ''}>{value}</div>
    </div>
  )
}

function FormField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  step,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  step?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-2">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        step={step}
        className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white placeholder-gray-500"
      />
    </div>
  )
}
