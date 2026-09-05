'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAdminAuth } from '@/contexts/AdminAuthContext'
import { useNotifications } from '@/contexts/NotificationContext'
import Link from 'next/link'
import {
  FaPlus,
  FaChevronLeft,
  FaSearch,
  FaSpinner,
  FaEdit,
  FaTrash,
  FaEye,
  FaCode,
  FaTimes,
} from 'react-icons/fa'

interface Template {
  id: string
  name: string
  subject: string
  body_html: string
  category: string
  preview_text?: string
  variables?: { name: string; type: string }[]
  created_at: string
}

const TEMPLATE_CATEGORIES = ['release', 'announcement', 'engagement', 'mission', 'vip']

export default function TemplatesAdmin() {
  const { user, isAdmin, loading } = useAdminAuth()
  const { showNotification } = useNotifications()
  const [templates, setTemplates] = useState<Template[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCategory, setFilterCategory] = useState<string>('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    subject: '',
    body_html: '',
    category: 'engagement',
    preview_text: '',
    variables: [] as { name: string; type: string }[],
  })

  const loadTemplates = useCallback(async () => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams()
      if (filterCategory) params.append('category', filterCategory)

      const res = await fetch(`/api/nurturing/campaign-templates?${params}`)
      if (!res.ok) throw new Error('Failed to load templates')

      const data = await res.json()
      setTemplates(data.data || [])
    } catch (error) {
      console.error('Error loading templates:', error)
      showNotification('Failed to load templates', 'error')
    } finally {
      setIsLoading(false)
    }
  }, [filterCategory, showNotification])

  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSaving) return

    if (!formData.name || !formData.subject || !formData.body_html) {
      showNotification('Name, subject, and body are required', 'error')
      return
    }

    try {
      setIsSaving(true)

      const res = await fetch('/api/nurturing/campaign-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (!res.ok) throw new Error('Failed to create template')

      showNotification('Template created', 'success')
      setShowCreateModal(false)
      resetForm()
      await loadTemplates()
    } catch (error) {
      console.error('Error creating template:', error)
      showNotification('Failed to create template', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleUpdateTemplate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSaving || !editingTemplate) return

    try {
      setIsSaving(true)

      const res = await fetch(
        `/api/nurturing/campaign-templates/${editingTemplate.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        }
      )

      if (!res.ok) throw new Error('Failed to update template')

      showNotification('Template updated', 'success')
      setShowEditModal(false)
      resetForm()
      await loadTemplates()
    } catch (error) {
      console.error('Error updating template:', error)
      showNotification('Failed to update template', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('Delete this template?')) return

    try {
      const res = await fetch(`/api/nurturing/campaign-templates/${id}`, {
        method: 'DELETE',
      })

      if (!res.ok) throw new Error('Failed to delete template')

      showNotification('Template deleted', 'success')
      await loadTemplates()
    } catch (error) {
      console.error('Error deleting template:', error)
      showNotification('Failed to delete template', 'error')
    }
  }

  const handleEditClick = (template: Template) => {
    setEditingTemplate(template)
    setFormData({
      name: template.name,
      subject: template.subject,
      body_html: template.body_html,
      category: template.category,
      preview_text: template.preview_text || '',
      variables: template.variables || [],
    })
    setShowEditModal(true)
  }

  const handlePreviewClick = (template: Template) => {
    setEditingTemplate(template)
    setShowPreviewModal(true)
  }

  const resetForm = () => {
    setFormData({
      name: '',
      subject: '',
      body_html: '',
      category: 'engagement',
      preview_text: '',
      variables: [],
    })
    setEditingTemplate(null)
  }

  const filteredTemplates = templates.filter((t) =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

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
              href="/admin/nurturing/campaigns"
              className="text-gray-400 hover:text-white transition"
            >
              <FaChevronLeft className="inline mr-2" />
              Back
            </Link>
            <h1 className="text-4xl font-bold flex items-center gap-3">
              <FaCode /> Email Templates
            </h1>
          </div>
          <button
            onClick={() => {
              resetForm()
              setShowCreateModal(true)
            }}
            className="bg-purple-600 hover:bg-purple-700 px-6 py-3 rounded-lg font-medium flex items-center gap-2 transition"
          >
            <FaPlus /> New Template
          </button>
        </div>

        {/* Search & Filters */}
        <div className="mb-8 bg-gray-900 p-6 rounded-lg">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
              />
            </div>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-4 py-2 text-white focus:outline-none focus:border-purple-500"
            >
              <option value="">All Categories</option>
              {TEMPLATE_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Templates Grid */}
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <FaSpinner className="animate-spin text-4xl text-purple-500" />
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="bg-gray-900 rounded-lg p-12 text-center">
            <FaCode className="mx-auto text-4xl text-gray-600 mb-4" />
            <p className="text-gray-400 text-lg">
              No templates yet. Create your first email template!
            </p>
          </div>
        ) : (
          <div className="grid gap-6">
            {filteredTemplates.map((template) => (
              <div
                key={template.id}
                className="bg-gray-900 rounded-lg p-6 border border-gray-800 hover:border-purple-500/50 transition"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-xl font-bold">{template.name}</h3>
                    <p className="text-gray-400 text-sm mt-1">
                      {template.subject}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs bg-gray-800 px-2 py-1 rounded">
                        {template.category}
                      </span>
                      {template.variables && template.variables.length > 0 && (
                        <span className="text-xs bg-purple-900 text-purple-200 px-2 py-1 rounded">
                          {template.variables.length} variable{template.variables.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handlePreviewClick(template)}
                      className="text-blue-400 hover:text-blue-300 transition p-2"
                      title="Preview"
                    >
                      <FaEye />
                    </button>
                    <button
                      onClick={() => handleEditClick(template)}
                      className="text-yellow-400 hover:text-yellow-300 transition p-2"
                      title="Edit"
                    >
                      <FaEdit />
                    </button>
                    <button
                      onClick={() => handleDeleteTemplate(template.id)}
                      className="text-red-400 hover:text-red-300 transition p-2"
                      title="Delete"
                    >
                      <FaTrash />
                    </button>
                  </div>
                </div>

                {/* Preview snippet */}
                <div className="bg-gray-800 rounded px-4 py-3 text-sm text-gray-300 line-clamp-2">
                  {template.body_html.replace(/<[^>]*>/g, '').substring(0, 150)}...
                </div>

                <div className="text-xs text-gray-500 mt-3">
                  Created {new Date(template.created_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Modal */}
        {showCreateModal && (
          <TemplateModal
            title="Create New Template"
            formData={formData}
            setFormData={setFormData}
            onSubmit={handleCreateTemplate}
            isSaving={isSaving}
            onClose={() => setShowCreateModal(false)}
          />
        )}

        {/* Edit Modal */}
        {showEditModal && (
          <TemplateModal
            title="Edit Template"
            formData={formData}
            setFormData={setFormData}
            onSubmit={handleUpdateTemplate}
            isSaving={isSaving}
            onClose={() => setShowEditModal(false)}
          />
        )}

        {/* Preview Modal */}
        {showPreviewModal && editingTemplate && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-gray-900 border-b border-gray-800 p-6 flex items-center justify-between">
                <h2 className="text-2xl font-bold">Preview: {editingTemplate.name}</h2>
                <button
                  onClick={() => setShowPreviewModal(false)}
                  className="text-gray-400 hover:text-white"
                >
                  <FaTimes />
                </button>
              </div>

              <div className="p-6">
                <div className="bg-gray-800 rounded-lg p-4 mb-4">
                  <p className="text-gray-400 text-xs mb-1">Subject</p>
                  <p className="text-white font-medium">{editingTemplate.subject}</p>
                </div>

                <div className="bg-gray-800 rounded-lg p-4">
                  <p className="text-gray-400 text-xs mb-2">Body</p>
                  <div
                    className="text-white prose prose-invert max-w-none"
                    dangerouslySetInnerHTML={{ __html: editingTemplate.body_html }}
                  />
                </div>

                {editingTemplate.variables && editingTemplate.variables.length > 0 && (
                  <div className="bg-blue-900 rounded-lg p-4 mt-4">
                    <p className="text-blue-200 font-medium mb-2">Variables</p>
                    <div className="space-y-1 text-sm text-blue-100">
                      {editingTemplate.variables.map((v, idx) => (
                        <div key={idx}>
                          <code className="bg-blue-800 px-2 py-1 rounded">
                            ${'{' + v.name + '}'}
                          </code>
                          {' '}– {v.type}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function TemplateModal({
  title,
  formData,
  setFormData,
  onSubmit,
  isSaving,
  onClose,
}: {
  title: string
  formData: any
  setFormData: (data: any) => void
  onSubmit: (e: React.FormEvent) => void
  isSaving: boolean
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-gray-900 border-b border-gray-800 p-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            <FaTimes />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium mb-2">
                Template Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="e.g., Release Announcement"
                className="w-full bg-gray-800 border border-gray-700 rounded px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Category</label>
              <select
                value={formData.category}
                onChange={(e) =>
                  setFormData({ ...formData, category: e.target.value })
                }
                className="w-full bg-gray-800 border border-gray-700 rounded px-4 py-2 text-white focus:outline-none focus:border-purple-500"
              >
                {TEMPLATE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Email Subject *
            </label>
            <input
              type="text"
              value={formData.subject}
              onChange={(e) =>
                setFormData({ ...formData, subject: e.target.value })
              }
              placeholder="e.g., ${fanName}, new music from ${artistName}"
              className="w-full bg-gray-800 border border-gray-700 rounded px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Use ${'${variable}'} syntax for personalization
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Email Body (HTML) *
            </label>
            <textarea
              value={formData.body_html}
              onChange={(e) =>
                setFormData({ ...formData, body_html: e.target.value })
              }
              placeholder="<h1>Hello ${fanName}</h1><p>Your HTML email content here...</p>"
              rows={10}
              className="w-full bg-gray-800 border border-gray-700 rounded px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 font-mono text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">
              Paste HTML directly. Include CSS inline for email compatibility.
            </p>
          </div>

          <div className="flex gap-4 pt-4 border-t border-gray-700">
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 px-6 py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition"
            >
              {isSaving && <FaSpinner className="animate-spin" />}
              {formData.id ? 'Update Template' : 'Create Template'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-800 hover:bg-gray-700 px-6 py-3 rounded-lg font-medium transition"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
