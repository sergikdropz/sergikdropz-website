'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'

interface Collaborator {
  id: string
  name: string
  email: string | null
  paymentMethod: string | null
  totalOwed: number
  totalPaid: number
  totalTransactions: number
}

interface Split {
  id: string
  purchase_id: string | null
  stripe_session_id: string
  product_id: string
  product_type: string
  collaborator_id: string
  collaborator_name: string
  track_title: string
  total_sale_amount: number
  collaborator_amount: number
  split_percent: number
  currency: string
  status: 'owed' | 'paid' | 'voided'
  paid_at: string | null
  paid_via: string | null
  notes: string | null
  created_at: string
}

interface EpSplitConfig {
  epTitle: string
  totalTracks: number
  collabTracks: Array<{
    trackId: string
    title: string
    collaboratorId: string
    collaboratorName: string
    splitPercent: number
  }>
}

const statusColors: Record<string, string> = {
  owed: 'bg-yellow-600/20 text-yellow-400',
  paid: 'bg-green-600/20 text-green-400',
  voided: 'bg-gray-600/20 text-gray-500',
}

export default function AdminSplits() {
  const { user, isAdmin, loading } = useAuth()
  const router = useRouter()
  const [collaborators, setCollaborators] = useState<Collaborator[]>([])
  const [splits, setSplits] = useState<Split[]>([])
  const [config, setConfig] = useState<Record<string, EpSplitConfig>>({})
  const [loadingData, setLoadingData] = useState(true)
  const [filterCollaborator, setFilterCollaborator] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [selectedSplits, setSelectedSplits] = useState<Set<string>>(new Set())
  const [showPayModal, setShowPayModal] = useState(false)
  const [payVia, setPayVia] = useState('')
  const [payNotes, setPayNotes] = useState('')
  const [activeTab, setActiveTab] = useState<'overview' | 'transactions' | 'config'>('overview')

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      router.push('/admin/login')
    }
  }, [user, isAdmin, loading, router])

  const fetchSplits = useCallback(async () => {
    try {
      setLoadingData(true)
      const params = new URLSearchParams()
      if (filterCollaborator) params.append('collaborator_id', filterCollaborator)
      if (filterStatus) params.append('status', filterStatus)

      const res = await fetch(`/api/admin/splits?${params}`)
      const data = await res.json()
      setCollaborators(data.collaborators || [])
      setSplits(data.splits || [])
      setConfig(data.config || {})
    } catch (error) {
      console.error('Error fetching splits:', error)
    } finally {
      setLoadingData(false)
    }
  }, [filterCollaborator, filterStatus])

  useEffect(() => {
    if (isAdmin) fetchSplits()
  }, [isAdmin, fetchSplits])

  function toggleSplitSelection(id: string) {
    setSelectedSplits((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAllOwed() {
    const owedIds = splits.filter((s) => s.status === 'owed').map((s) => s.id)
    setSelectedSplits(new Set(owedIds))
  }

  async function markSelectedPaid() {
    if (selectedSplits.size === 0) return
    try {
      await fetch('/api/admin/splits', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          splitIds: Array.from(selectedSplits),
          action: 'mark_paid',
          paidVia: payVia || 'manual',
          notes: payNotes || null,
        }),
      })
      setSelectedSplits(new Set())
      setShowPayModal(false)
      setPayVia('')
      setPayNotes('')
      fetchSplits()
    } catch (error) {
      console.error('Error marking paid:', error)
    }
  }

  async function voidSelected() {
    if (selectedSplits.size === 0) return
    if (!confirm('Void selected splits? This cannot be undone.')) return
    try {
      await fetch('/api/admin/splits', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          splitIds: Array.from(selectedSplits),
          action: 'void',
        }),
      })
      setSelectedSplits(new Set())
      fetchSplits()
    } catch (error) {
      console.error('Error voiding splits:', error)
    }
  }

  function formatCents(cents: number) {
    return `$${(cents / 100).toFixed(2)}`
  }

  function handleExportCSV() {
    const headers = [
      'Date',
      'Collaborator',
      'Track',
      'Product',
      'Sale Amount',
      'Collaborator Amount',
      'Split %',
      'Status',
      'Paid Via',
      'Paid At',
    ]
    const rows = splits.map((s) => [
      new Date(s.created_at).toLocaleDateString(),
      s.collaborator_name,
      s.track_title,
      s.product_id,
      (s.total_sale_amount / 100).toFixed(2),
      (s.collaborator_amount / 100).toFixed(2),
      `${s.split_percent}%`,
      s.status,
      s.paid_via || '',
      s.paid_at ? new Date(s.paid_at).toLocaleDateString() : '',
    ])

    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `revenue-splits-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading || loadingData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-white text-xl">Loading...</div>
      </div>
    )
  }

  if (!user || !isAdmin) return null

  const totalOwedAll = collaborators.reduce((sum, c) => sum + c.totalOwed, 0)
  const totalPaidAll = collaborators.reduce((sum, c) => sum + c.totalPaid, 0)

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Revenue Splits</h1>
          <p className="text-gray-400">
            Track and manage collaborator percentage splits from EP and bundle sales
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
            <div className="text-gray-400 text-sm mb-1">Total Owed</div>
            <div className="text-2xl font-bold text-yellow-400">{formatCents(totalOwedAll)}</div>
          </div>
          <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
            <div className="text-gray-400 text-sm mb-1">Total Paid Out</div>
            <div className="text-2xl font-bold text-green-400">{formatCents(totalPaidAll)}</div>
          </div>
          <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
            <div className="text-gray-400 text-sm mb-1">Collaborators</div>
            <div className="text-2xl font-bold">{collaborators.length}</div>
          </div>
          <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
            <div className="text-gray-400 text-sm mb-1">Total Transactions</div>
            <div className="text-2xl font-bold">{splits.length}</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex space-x-1 mb-6 bg-gray-900/50 border border-gray-800 rounded-lg p-1 w-fit">
          {(['overview', 'transactions', 'config'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                activeTab === tab
                  ? 'bg-purple-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              {tab === 'overview'
                ? 'Collaborator Overview'
                : tab === 'transactions'
                  ? 'Transactions'
                  : 'Split Config'}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
            <h2 className="text-2xl font-semibold mb-4">Collaborator Balances</h2>
            {collaborators.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                No collaborators configured yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {collaborators.map((collab) => (
                  <div
                    key={collab.id}
                    className="bg-gray-800/50 border border-gray-700 rounded-lg p-5"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="text-lg font-semibold">{collab.name}</h3>
                        <p className="text-sm text-gray-400">
                          {collab.email || 'No email on file'}
                        </p>
                      </div>
                      {collab.totalOwed > 0 && (
                        <span className="px-2 py-0.5 text-xs rounded font-medium bg-yellow-600/20 text-yellow-400">
                          Balance due
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Owed</div>
                        <div className="text-yellow-400 font-semibold">
                          {formatCents(collab.totalOwed)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Paid</div>
                        <div className="text-green-400 font-semibold">
                          {formatCents(collab.totalPaid)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Sales</div>
                        <div className="font-semibold">{collab.totalTransactions}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setFilterCollaborator(collab.id)
                        setActiveTab('transactions')
                      }}
                      className="mt-3 w-full text-center text-sm text-purple-400 hover:text-purple-300 transition"
                    >
                      View Transactions
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Transactions Tab */}
        {activeTab === 'transactions' && (
          <div className="space-y-4">
            {/* Filters & Actions */}
            <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
              <div className="flex flex-wrap gap-4 items-end">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Collaborator
                  </label>
                  <select
                    value={filterCollaborator}
                    onChange={(e) => setFilterCollaborator(e.target.value)}
                    title="Filter by collaborator"
                    className="px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
                  >
                    <option value="">All</option>
                    {collaborators.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Status</label>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    title="Filter by status"
                    className="px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
                  >
                    <option value="">All</option>
                    <option value="owed">Owed</option>
                    <option value="paid">Paid</option>
                    <option value="voided">Voided</option>
                  </select>
                </div>
                <div className="flex gap-2 ml-auto">
                  {selectedSplits.size > 0 && (
                    <>
                      <button
                        onClick={() => setShowPayModal(true)}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm transition"
                      >
                        Mark Paid ({selectedSplits.size})
                      </button>
                      <button
                        onClick={voidSelected}
                        className="bg-red-600/80 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm transition"
                      >
                        Void ({selectedSplits.size})
                      </button>
                    </>
                  )}
                  <button
                    onClick={selectAllOwed}
                    className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm transition"
                  >
                    Select All Owed
                  </button>
                  <button
                    onClick={handleExportCSV}
                    className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm transition"
                  >
                    Export CSV
                  </button>
                </div>
              </div>
            </div>

            {/* Transactions Table */}
            <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
              {splits.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  No split transactions yet. Splits are recorded automatically when EPs with collab
                  tracks are purchased.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-700">
                        <th className="text-left py-3 px-3 text-gray-400 font-semibold w-8">
                          <input
                            type="checkbox"
                            title="Select all owed splits"
                            onChange={(e) => {
                              if (e.target.checked) selectAllOwed()
                              else setSelectedSplits(new Set())
                            }}
                            className="rounded bg-gray-800 border-gray-600"
                          />
                        </th>
                        <th className="text-left py-3 px-3 text-gray-400 font-semibold">Date</th>
                        <th className="text-left py-3 px-3 text-gray-400 font-semibold">
                          Collaborator
                        </th>
                        <th className="text-left py-3 px-3 text-gray-400 font-semibold">Track</th>
                        <th className="text-left py-3 px-3 text-gray-400 font-semibold">
                          Product
                        </th>
                        <th className="text-left py-3 px-3 text-gray-400 font-semibold">
                          Sale Total
                        </th>
                        <th className="text-left py-3 px-3 text-gray-400 font-semibold">
                          Their Cut
                        </th>
                        <th className="text-left py-3 px-3 text-gray-400 font-semibold">Split</th>
                        <th className="text-left py-3 px-3 text-gray-400 font-semibold">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {splits.map((split) => (
                        <tr
                          key={split.id}
                          className="border-b border-gray-800 hover:bg-gray-800/30 transition"
                        >
                          <td className="py-3 px-3">
                            {split.status === 'owed' && (
                              <input
                                type="checkbox"
                                title={`Select split for ${split.collaborator_name}`}
                                checked={selectedSplits.has(split.id)}
                                onChange={() => toggleSplitSelection(split.id)}
                                className="rounded bg-gray-800 border-gray-600"
                              />
                            )}
                          </td>
                          <td className="py-3 px-3 text-sm">
                            {new Date(split.created_at).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-3 font-medium">{split.collaborator_name}</td>
                          <td className="py-3 px-3 text-sm">{split.track_title}</td>
                          <td className="py-3 px-3 text-sm text-gray-400">{split.product_id}</td>
                          <td className="py-3 px-3 text-sm">
                            {formatCents(split.total_sale_amount)}
                          </td>
                          <td className="py-3 px-3 font-semibold text-yellow-400">
                            {formatCents(split.collaborator_amount)}
                          </td>
                          <td className="py-3 px-3 text-sm">{split.split_percent}%</td>
                          <td className="py-3 px-3">
                            <span
                              className={`px-2 py-0.5 text-xs rounded font-medium ${statusColors[split.status]}`}
                            >
                              {split.status}
                            </span>
                            {split.paid_via && (
                              <span className="block text-xs text-gray-500 mt-1">
                                via {split.paid_via}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Config Tab */}
        {activeTab === 'config' && (
          <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
            <h2 className="text-2xl font-semibold mb-2">Split Configuration</h2>
            <p className="text-gray-400 text-sm mb-6">
              Current percentage splits per EP. Edit{' '}
              <code className="text-purple-400">data/revenue-splits.json</code> to update.
            </p>

            {Object.keys(config).length === 0 ? (
              <div className="text-center py-12 text-gray-400">No split config found.</div>
            ) : (
              <div className="space-y-6">
                {Object.entries(config).map(([epId, ep]) => (
                  <div
                    key={epId}
                    className="bg-gray-800/50 border border-gray-700 rounded-lg p-5"
                  >
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="text-lg font-semibold">{ep.epTitle}</h3>
                      <span className="text-sm text-gray-400">
                        {ep.collabTracks.length} collab track
                        {ep.collabTracks.length !== 1 ? 's' : ''} / {ep.totalTracks} total
                      </span>
                    </div>
                    <div className="space-y-2">
                      {ep.collabTracks.map((track) => (
                        <div
                          key={track.trackId}
                          className="flex items-center justify-between bg-gray-900/50 rounded-md px-4 py-3"
                        >
                          <div>
                            <span className="font-medium">{track.title}</span>
                            <span className="text-gray-400 mx-2">with</span>
                            <span className="text-purple-400 font-medium">
                              {track.collaboratorName}
                            </span>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-sm">
                              <span className="text-gray-400">SERGIK:</span>{' '}
                              <span className="text-white font-medium">
                                {100 - track.splitPercent}%
                              </span>
                            </div>
                            <div className="text-sm">
                              <span className="text-gray-400">{track.collaboratorName}:</span>{' '}
                              <span className="text-purple-400 font-medium">
                                {track.splitPercent}%
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 text-xs text-gray-500">
                      Per-track share: $9.99 / {ep.totalTracks} tracks = $
                      {(9.99 / ep.totalTracks).toFixed(2)} per track
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mark Paid Modal */}
      {showPayModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-lg max-w-md w-full">
            <div className="p-6">
              <h2 className="text-xl font-bold mb-4">
                Mark {selectedSplits.size} Split{selectedSplits.size !== 1 ? 's' : ''} as Paid
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Payment Method
                  </label>
                  <select
                    value={payVia}
                    onChange={(e) => setPayVia(e.target.value)}
                    title="Payment method"
                    className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
                  >
                    <option value="">Select method...</option>
                    <option value="venmo">Venmo</option>
                    <option value="zelle">Zelle</option>
                    <option value="paypal">PayPal</option>
                    <option value="cash">Cash</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Notes (optional)
                  </label>
                  <textarea
                    value={payNotes}
                    onChange={(e) => setPayNotes(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
                    rows={3}
                    placeholder="e.g. Venmo confirmation #123"
                  />
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3 text-sm">
                  <div className="text-gray-400">Total to pay out:</div>
                  <div className="text-xl font-bold text-green-400">
                    {formatCents(
                      splits
                        .filter((s) => selectedSplits.has(s.id))
                        .reduce((sum, s) => sum + s.collaborator_amount, 0)
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={markSelectedPaid}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg transition font-medium"
                >
                  Confirm Payment
                </button>
                <button
                  onClick={() => {
                    setShowPayModal(false)
                    setPayVia('')
                    setPayNotes('')
                  }}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg transition"
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
