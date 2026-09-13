'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAdminAuth } from '@/contexts/AdminAuthContext'
import { useNotifications } from '@/contexts/NotificationContext'
import Link from 'next/link'
import {
  FaPlus,
  FaUsers,
  FaChevronLeft,
  FaSearch,
  FaSpinner,
  FaEdit,
  FaTrash,
  FaDownload,
  FaTag,
  FaStar,
  FaFilter,
  FaTimes,
} from 'react-icons/fa'

interface Fan {
  id: string
  email: string
  name: string
  phone: string | null
  source: string
  tags: string[]
  is_superfan: boolean
  created_at: string
  last_engaged_at: string | null
  subscribed_at: string
  unsubscribed_at: string | null
}

export default function FansAdmin() {
  const { user, isAdmin, loading } = useAdminAuth()
  const { showNotification } = useNotifications()
  const [fans, setFans] = useState<Fan[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterSource, setFilterSource] = useState<string>('')
  const [filterSuperfan, setFilterSuperfan] = useState<string>('all')
  const [selectedFans, setSelectedFans] = useState<Set<string>>(new Set())
  const [editingFan, setEditingFan] = useState<Fan | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [newTag, setNewTag] = useState('')
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
  })
  const [offset, setOffset] = useState(0)
  const [total, setTotal] = useState(0)
  const limit = 50

  // Load fans
  const loadFans = useCallback(async () => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams()
      if (searchQuery) params.append('search', searchQuery)
      if (filterSource) params.append('source', filterSource)
      if (filterSuperfan === 'yes') params.append('superfan', 'true')
      if (filterSuperfan === 'no') params.append('superfan', 'false')
      params.append('limit', limit.toString())
      params.append('offset', offset.toString())

      const res = await fetch(`/api/nurturing/fans?${params}`)
      if (!res.ok) {
        const errorData = await res.json().catch(() => null)
        throw new Error(errorData?.error || `Failed to load fans (${res.status})`)
      }

      const data = await res.json()
      setFans(
        (data.data || []).map((fan: Fan) => ({
          ...fan,
          tags: Array.isArray(fan.tags) ? fan.tags : [],
        })),
      )
      setTotal(data.total || 0)
    } catch (error) {
      console.error('Error loading fans:', error)
      showNotification(error instanceof Error ? error.message : 'Failed to load fans', 'error')
    } finally {
      setIsLoading(false)
    }
  }, [searchQuery, filterSource, filterSuperfan, offset, limit, showNotification])

  useEffect(() => {
    setOffset(0)
  }, [searchQuery, filterSource, filterSuperfan])

  useEffect(() => {
    loadFans()
  }, [loadFans])

  const filteredFans = fans

  const handleEditFan = (fan: Fan) => {
    setEditingFan(fan)
    setFormData({
      name: fan.name,
      phone: fan.phone || '',
    })
    setShowEditModal(true)
  }

  const handleSaveFan = async () => {
    if (!editingFan) return

    try {
      const res = await fetch(`/api/nurturing/fans/${editingFan.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          phone: formData.phone || null,
        }),
      })

      if (!res.ok) throw new Error('Failed to save fan')

      showNotification('Fan updated', 'success')
      setShowEditModal(false)
      setEditingFan(null)
      await loadFans()
    } catch (error) {
      console.error('Error saving fan:', error)
      showNotification('Failed to save fan', 'error')
    }
  }

  const handleDeleteFan = async (id: string) => {
    if (!confirm('Delete this fan? This cannot be undone.')) return

    try {
      const res = await fetch(`/api/nurturing/fans/${id}`, {
        method: 'DELETE',
      })

      if (!res.ok) throw new Error('Failed to delete fan')

      showNotification('Fan deleted', 'success')
      await loadFans()
    } catch (error) {
      console.error('Error deleting fan:', error)
      showNotification('Failed to delete fan', 'error')
    }
  }

  const handleToggleSuperfan = async (fan: Fan) => {
    try {
      const res = await fetch(`/api/nurturing/fans/${fan.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_superfan: !fan.is_superfan,
        }),
      })

      if (!res.ok) throw new Error('Failed to update superfan status')

      showNotification(
        fan.is_superfan ? 'Removed from superfans' : 'Added to superfans',
        'success'
      )
      await loadFans()
    } catch (error) {
      console.error('Error:', error)
      showNotification('Failed to update superfan status', 'error')
    }
  }

  const handleAddTag = async (fan: Fan) => {
    if (!newTag.trim()) return

    try {
      const updatedTags = Array.from(new Set([...fan.tags, newTag]))
      const res = await fetch(`/api/nurturing/fans/${fan.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tags: updatedTags,
        }),
      })

      if (!res.ok) throw new Error('Failed to add tag')

      showNotification('Tag added', 'success')
      setNewTag('')
      await loadFans()
    } catch (error) {
      console.error('Error adding tag:', error)
      showNotification('Failed to add tag', 'error')
    }
  }

  const handleRemoveTag = async (fan: Fan, tagToRemove: string) => {
    try {
      const updatedTags = fan.tags.filter((t) => t !== tagToRemove)
      const res = await fetch(`/api/nurturing/fans/${fan.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tags: updatedTags,
        }),
      })

      if (!res.ok) throw new Error('Failed to remove tag')

      showNotification('Tag removed', 'success')
      await loadFans()
    } catch (error) {
      console.error('Error removing tag:', error)
      showNotification('Failed to remove tag', 'error')
    }
  }

  const handleExportCSV = () => {
    const csv = [
      ['Email', 'Name', 'Phone', 'Source', 'Tags', 'Superfan', 'Subscribed', 'Last Engaged'].join(','),
      ...filteredFans.map((fan) =>
        [
          fan.email,
          fan.name,
          fan.phone || '',
          fan.source,
          fan.tags.join(';'),
          fan.is_superfan ? 'Yes' : 'No',
          new Date(fan.subscribed_at).toLocaleDateString(),
          fan.last_engaged_at
            ? new Date(fan.last_engaged_at).toLocaleDateString()
            : 'Never',
        ]
          .map((field) => `"${field}"`)
          .join(',')
      ),
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `fans-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    window.URL.revokeObjectURL(url)

    showNotification('Exported to CSV', 'success')
  }

  const handleSelectAll = () => {
    if (selectedFans.size === filteredFans.length) {
      setSelectedFans(new Set())
    } else {
      setSelectedFans(new Set(filteredFans.map((f) => f.id)))
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <FaSpinner className="animate-spin text-4xl text-purple-500" />
      </div>
    )
  }

  const sources = Array.from(
    new Set(['vault_unlock', 'contact_form', 'smart_link', ...fans.map((f) => f.source).filter(Boolean)])
  )

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link
              href="/admin/nurturing/smart-links"
              className="text-gray-400 hover:text-white transition"
            >
              <FaChevronLeft className="inline mr-2" />
              Back
            </Link>
            <h1 className="text-4xl font-bold flex items-center gap-3">
              <FaUsers /> Fans ({total})
            </h1>
          </div>
          <button
            onClick={handleExportCSV}
            disabled={filteredFans.length === 0}
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-700 px-6 py-3 rounded-lg font-medium flex items-center gap-2 transition"
          >
            <FaDownload /> Export CSV
          </button>
        </div>

        {/* Search & Filters */}
        <div className="mb-8 bg-gray-900 p-6 rounded-lg space-y-4">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search by email or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
              />
            </div>

            {/* Filter by source */}
            <select
              value={filterSource}
              onChange={(e) => setFilterSource(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-4 py-2 text-white focus:outline-none focus:border-purple-500"
            >
              <option value="">All Sources</option>
              {sources.map((source) => (
                <option key={source} value={source}>
                  {source === 'vault_unlock'
                    ? 'Vault unlock'
                    : source === 'contact_form'
                      ? 'Contact form'
                      : source === 'smart_link'
                        ? 'Smart link'
                        : source}
                </option>
              ))}
            </select>

            {/* Filter by superfan */}
            <select
              value={filterSuperfan}
              onChange={(e) => setFilterSuperfan(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-4 py-2 text-white focus:outline-none focus:border-purple-500"
            >
              <option value="all">All Fans</option>
              <option value="yes">Superfans Only</option>
              <option value="no">Regular Fans</option>
            </select>
          </div>

          <div className="text-sm text-gray-400">
            Showing {filteredFans.length} of {total} fans
          </div>
        </div>

        {/* Fans Table */}
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <FaSpinner className="animate-spin text-4xl text-purple-500" />
          </div>
        ) : filteredFans.length === 0 ? (
          <div className="bg-gray-900 rounded-lg p-12 text-center">
            <FaUsers className="mx-auto text-4xl text-gray-600 mb-4" />
            <p className="text-gray-400 text-lg">
              {fans.length === 0
                ? 'No fans yet. Share your vault unlock page, contact form, or smart links!'
                : 'No fans match your filters'}
            </p>
          </div>
        ) : (
          <div className="bg-gray-900 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-800 border-b border-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedFans.size === filteredFans.length && filteredFans.length > 0}
                        onChange={handleSelectAll}
                        className="rounded"
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold">Email</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold">Name</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold">Source</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold">Tags</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold">Status</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold">Signed Up</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {filteredFans.map((fan) => (
                    <tr key={fan.id} className="hover:bg-gray-800/50 transition">
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={selectedFans.has(fan.id)}
                          onChange={(e) => {
                            const newSelected = new Set(selectedFans)
                            if (e.target.checked) {
                              newSelected.add(fan.id)
                            } else {
                              newSelected.delete(fan.id)
                            }
                            setSelectedFans(newSelected)
                          }}
                          className="rounded"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm">{fan.email}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm">{fan.name || '—'}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="bg-gray-800 px-2 py-1 rounded text-xs">
                          {fan.source}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {fan.tags.map((tag) => (
                            <span
                              key={tag}
                              className="bg-purple-900/50 text-purple-300 px-2 py-1 rounded text-xs flex items-center gap-1"
                            >
                              {tag}
                              <button
                                onClick={() => handleRemoveTag(fan, tag)}
                                className="hover:text-purple-100"
                              >
                                <FaTimes className="text-xs" />
                              </button>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleToggleSuperfan(fan)}
                          className={`flex items-center gap-1 px-3 py-1 rounded text-xs font-medium transition ${
                            fan.is_superfan
                              ? 'bg-yellow-900/50 text-yellow-300'
                              : 'bg-gray-800 text-gray-400 hover:text-yellow-300'
                          }`}
                        >
                          <FaStar className="text-xs" />
                          {fan.is_superfan ? 'Superfan' : 'Regular'}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-400">
                        {new Date(fan.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleEditFan(fan)}
                            className="text-blue-400 hover:text-blue-300 transition p-2"
                          >
                            <FaEdit />
                          </button>
                          <button
                            onClick={() => handleDeleteFan(fan.id)}
                            className="text-red-400 hover:text-red-300 transition p-2"
                          >
                            <FaTrash />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="bg-gray-800 px-6 py-4 flex justify-between items-center border-t border-gray-700">
              <button
                onClick={() => setOffset(Math.max(0, offset - limit))}
                disabled={offset === 0}
                className="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 px-4 py-2 rounded transition"
              >
                Previous
              </button>
              <span className="text-sm text-gray-400">
                Page {Math.floor(offset / limit) + 1} of{' '}
                {Math.ceil(total / limit) || 1}
              </span>
              <button
                onClick={() => setOffset(offset + limit)}
                disabled={offset + limit >= total}
                className="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 px-4 py-2 rounded transition"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {showEditModal && editingFan && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 rounded-lg max-w-2xl w-full p-8">
              <h2 className="text-2xl font-bold mb-6">Edit Fan</h2>

              <div className="space-y-6">
                {/* Name & Phone */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Name</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      className="w-full bg-gray-800 border border-gray-700 rounded px-4 py-2 text-white focus:outline-none focus:border-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Phone</label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) =>
                        setFormData({ ...formData, phone: e.target.value })
                      }
                      className="w-full bg-gray-800 border border-gray-700 rounded px-4 py-2 text-white focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>

                {/* Tags */}
                <div>
                  <label className="block text-sm font-medium mb-2">Add Tag</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      placeholder="e.g., engaged, vip"
                      className="flex-1 bg-gray-800 border border-gray-700 rounded px-4 py-2 text-white focus:outline-none focus:border-purple-500"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          handleAddTag(editingFan)
                        }
                      }}
                    />
                    <button
                      onClick={() => handleAddTag(editingFan)}
                      className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded font-medium transition"
                    >
                      <FaTag />
                    </button>
                  </div>
                </div>

                {/* Current Tags */}
                {editingFan.tags.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium mb-2">Current Tags</label>
                    <div className="flex flex-wrap gap-2">
                      {editingFan.tags.map((tag) => (
                        <span
                          key={tag}
                          className="bg-purple-900/50 text-purple-300 px-3 py-1 rounded text-sm flex items-center gap-2"
                        >
                          {tag}
                          <button
                            onClick={() => handleRemoveTag(editingFan, tag)}
                            className="hover:text-purple-100"
                          >
                            <FaTimes />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Buttons */}
                <div className="flex gap-4 pt-6 border-t border-gray-700">
                  <button
                    onClick={handleSaveFan}
                    className="flex-1 bg-purple-600 hover:bg-purple-700 px-6 py-3 rounded-lg font-medium transition"
                  >
                    Save Changes
                  </button>
                  <button
                    onClick={() => setShowEditModal(false)}
                    className="flex-1 bg-gray-800 hover:bg-gray-700 px-6 py-3 rounded-lg font-medium transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
