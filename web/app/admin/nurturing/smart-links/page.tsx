'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useNotifications } from '@/contexts/NotificationContext'
import Link from 'next/link'
import {
  FaPlus,
  FaLink,
  FaEye,
  FaEdit,
  FaTrash,
  FaCopy,
  FaChevronLeft,
  FaSearch,
  FaSpinner,
  FaExclamationTriangle,
  FaCheckCircle,
} from 'react-icons/fa'

interface SmartLink {
  id: string
  slug: string
  title: string
  destination_url: string
  category: string
  total_clicks: number
  unique_clicks: number
  last_clicked_at: string | null
  created_at: string
}

export default function SmartLinksAdmin() {
  const { user, isAdmin, loading } = useAuth()
  const { showNotification } = useNotifications()
  const [links, setLinks] = useState<SmartLink[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingLink, setEditingLink] = useState<SmartLink | null>(null)
  const [formData, setFormData] = useState({
    slug: '',
    title: '',
    destination_url: '',
    description: '',
    category: 'general',
  })
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)

  // Load smart links
  const loadLinks = useCallback(async () => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams()
      if (searchQuery) params.append('search', searchQuery)
      if (selectedCategory) params.append('category', selectedCategory)

      const res = await fetch(`/api/nurturing/smart-links?${params}`)
      if (!res.ok) {
        const errorData = await res.json().catch(() => null)
        throw new Error(errorData?.error || `Failed to load smart links (${res.status})`)
      }

      const data = await res.json()
      setLinks(data.data || [])
    } catch (error) {
      console.error('Error loading smart links:', error)
      showNotification(
        error instanceof Error ? error.message : 'Failed to load smart links',
        'error'
      )
    } finally {
      setIsLoading(false)
    }
  }, [searchQuery, selectedCategory, showNotification])

  useEffect(() => {
    loadLinks()
  }, [loadLinks])

  const handleCreateLink = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isCreating) return

    // Validate form
    if (!formData.slug || !formData.destination_url) {
      showNotification('Slug and destination URL are required', 'error')
      return
    }

    try {
      setIsCreating(true)

      const method = editingLink ? 'PUT' : 'POST'
      const url = editingLink
        ? `/api/nurturing/smart-links/${editingLink.id}`
        : '/api/nurturing/smart-links'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: formData.slug,
          title: formData.title || formData.slug,
          destination_url: formData.destination_url,
          description: formData.description,
          category: formData.category,
        }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Failed to create/update link')
      }

      showNotification(
        editingLink ? 'Smart link updated' : 'Smart link created',
        'success'
      )

      // Reset form
      setFormData({
        slug: '',
        title: '',
        destination_url: '',
        description: '',
        category: 'general',
      })
      setEditingLink(null)
      setShowCreateModal(false)

      // Reload links
      await loadLinks()
    } catch (error) {
      console.error('Error creating/updating link:', error)
      showNotification(
        error instanceof Error ? error.message : 'Failed to create/update link',
        'error'
      )
    } finally {
      setIsCreating(false)
    }
  }

  const handleDeleteLink = async (id: string) => {
    if (!confirm('Are you sure you want to delete this link?')) {
      return
    }

    try {
      const res = await fetch(`/api/nurturing/smart-links/${id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        throw new Error('Failed to delete link')
      }

      showNotification('Smart link deleted', 'success')
      await loadLinks()
    } catch (error) {
      console.error('Error deleting link:', error)
      showNotification('Failed to delete link', 'error')
    }
  }

  const handleCopySlug = (slug: string) => {
    const url = `${window.location.origin}/api/go/${slug}`
    navigator.clipboard.writeText(url)
    setCopyFeedback(slug)
    showNotification('Link copied to clipboard', 'success')
    setTimeout(() => setCopyFeedback(null), 2000)
  }

  const handleEditLink = (link: SmartLink) => {
    setFormData({
      slug: link.slug,
      title: link.title,
      destination_url: link.destination_url,
      description: '',
      category: link.category,
    })
    setEditingLink(link)
    setShowCreateModal(true)
  }

  const handleCloseModal = () => {
    setShowCreateModal(false)
    setEditingLink(null)
    setFormData({
      slug: '',
      title: '',
      destination_url: '',
      description: '',
      category: 'general',
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <FaSpinner className="animate-spin text-4xl text-purple-500" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link
              href="/admin"
              className="text-gray-400 hover:text-white transition"
            >
              <FaChevronLeft className="inline mr-2" />
              Back to Admin
            </Link>
            <h1 className="text-4xl font-bold">Smart Links Manager</h1>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-purple-600 hover:bg-purple-700 px-6 py-3 rounded-lg font-medium flex items-center gap-2 transition"
          >
            <FaPlus /> New Link
          </button>
        </div>

        {/* Search & Filters */}
        <div className="mb-8 bg-gray-900 p-6 rounded-lg">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search by slug or title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
              />
            </div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-4 py-2 text-white focus:outline-none focus:border-purple-500"
            >
              <option value="">All Categories</option>
              <option value="release">Release</option>
              <option value="social">Social</option>
              <option value="campaign">Campaign</option>
              <option value="general">General</option>
            </select>
          </div>
        </div>

        {/* Smart Links Table */}
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <FaSpinner className="animate-spin text-4xl text-purple-500" />
          </div>
        ) : links.length === 0 ? (
          <div className="bg-gray-900 rounded-lg p-12 text-center">
            <FaLink className="mx-auto text-4xl text-gray-600 mb-4" />
            <p className="text-gray-400 text-lg">
              No smart links yet. Create your first one!
            </p>
          </div>
        ) : (
          <div className="bg-gray-900 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-800 border-b border-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold">Slug</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold">Title</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold">Category</th>
                    <th className="px-6 py-3 text-center text-sm font-semibold">Clicks</th>
                    <th className="px-6 py-3 text-center text-sm font-semibold">Unique</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {links.map((link) => (
                    <tr
                      key={link.id}
                      className="hover:bg-gray-800/50 transition"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <code className="text-purple-400 font-mono">
                            {link.slug}
                          </code>
                          <button
                            onClick={() => handleCopySlug(link.slug)}
                            className="text-gray-500 hover:text-white transition p-1"
                            title="Copy link"
                          >
                            <FaCopy className="text-sm" />
                          </button>
                          {copyFeedback === link.slug && (
                            <FaCheckCircle className="text-green-500 text-sm" />
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="truncate max-w-xs">{link.title}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="bg-gray-800 px-3 py-1 rounded-full text-xs font-medium">
                          {link.category}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="font-bold">{link.total_clicks}</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-gray-400">{link.unique_clicks}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleEditLink(link)}
                            className="text-blue-400 hover:text-blue-300 transition p-2"
                            title="Edit"
                          >
                            <FaEdit />
                          </button>
                          <button
                            onClick={() => handleDeleteLink(link.id)}
                            className="text-red-400 hover:text-red-300 transition p-2"
                            title="Delete"
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
          </div>
        )}

        {/* Create/Edit Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 rounded-lg max-w-2xl w-full p-8">
              <h2 className="text-2xl font-bold mb-6">
                {editingLink ? 'Edit Smart Link' : 'Create New Smart Link'}
              </h2>

              <form onSubmit={handleCreateLink} className="space-y-6">
                {/* Slug */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Slug *
                  </label>
                  <input
                    type="text"
                    value={formData.slug}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        slug: e.target.value.toLowerCase().replace(/\s+/g, '-'),
                      })
                    }
                    placeholder="e.g., new-ep-drop"
                    className="w-full bg-gray-800 border border-gray-700 rounded px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                    disabled={editingLink !== null}
                  />
                  <p className="text-gray-400 text-sm mt-2">
                    URL: <code className="text-purple-400">/{process.env.NEXT_PUBLIC_SITE_URL}/api/go/{formData.slug}</code>
                  </p>
                </div>

                {/* Title */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Title
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
                    placeholder="Display name for this link"
                    className="w-full bg-gray-800 border border-gray-700 rounded px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                  />
                </div>

                {/* Destination URL */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Destination URL *
                  </label>
                  <input
                    type="url"
                    value={formData.destination_url}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        destination_url: e.target.value,
                      })
                    }
                    placeholder="https://open.spotify.com/..."
                    className="w-full bg-gray-800 border border-gray-700 rounded px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                  />
                </div>

                {/* Category */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Category
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) =>
                      setFormData({ ...formData, category: e.target.value })
                    }
                    className="w-full bg-gray-800 border border-gray-700 rounded px-4 py-3 text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="general">General</option>
                    <option value="release">Release</option>
                    <option value="social">Social</option>
                    <option value="campaign">Campaign</option>
                    <option value="affiliate">Affiliate</option>
                  </select>
                </div>

                {/* Buttons */}
                <div className="flex gap-4 pt-6">
                  <button
                    type="submit"
                    disabled={isCreating}
                    className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 px-6 py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition"
                  >
                    {isCreating && <FaSpinner className="animate-spin" />}
                    {editingLink ? 'Update Link' : 'Create Link'}
                  </button>
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="flex-1 bg-gray-800 hover:bg-gray-700 px-6 py-3 rounded-lg font-medium transition"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
