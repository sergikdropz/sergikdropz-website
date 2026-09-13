'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAdminAuth } from '@/contexts/AdminAuthContext'
import { useNotifications } from '@/contexts/NotificationContext'
import Link from 'next/link'
import {
  FaPlus,
  FaEnvelope,
  FaChevronLeft,
  FaSearch,
  FaSpinner,
  FaEdit,
  FaTrash,
  FaPlay,
  FaPause,
  FaCheckCircle,
  FaClock,
  FaTimes,
  FaArrowRight,
} from 'react-icons/fa'

interface Campaign {
  id: string
  name: string
  description: string
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused' | 'cancelled'
  scheduled_send_at: string | null
  total_sent: number
  total_opened: number
  total_clicked: number
  created_at: string
  release_id: string | null
}

interface CampaignDetail extends Campaign {
  sequences: Sequence[]
}

interface Sequence {
  id: string
  campaign_id: string
  template_id: string
  days_offset: number
  sequence_order: number
  status: string
  sent_count: number
  opened_count: number
  clicked_count: number
  campaign_templates: {
    name: string
    subject: string
  }
}

export default function CampaignsAdmin() {
  const { user, isAdmin, loading } = useAdminAuth()
  const { showNotification } = useNotifications()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingCampaign, setEditingCampaign] = useState<CampaignDetail | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    release_id: '',
  })
  const [scheduledReleases, setScheduledReleases] = useState<any[]>([])
  const [loadingReleases, setLoadingReleases] = useState(false)

  const loadCampaigns = useCallback(async () => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams()
      if (searchQuery) params.append('search', searchQuery)
      if (filterStatus) params.append('status', filterStatus)

      const res = await fetch(`/api/nurturing/campaigns?${params}`)
      if (!res.ok) {
        const errorData = await res.json().catch(() => null)
        throw new Error(errorData?.error || `Failed to load campaigns (${res.status})`)
      }

      const data = await res.json()
      setCampaigns(data.data || [])
    } catch (error) {
      console.error('Error loading campaigns:', error)
      showNotification(
        error instanceof Error ? error.message : 'Failed to load campaigns',
        'error'
      )
    } finally {
      setIsLoading(false)
    }
  }, [searchQuery, filterStatus, showNotification])

  useEffect(() => {
    loadCampaigns()
  }, [loadCampaigns])

  useEffect(() => {
    if (showCreateModal && scheduledReleases.length === 0) {
      setLoadingReleases(true)
      fetch('/api/studio/release-schedule')
        .then((res) => (res.ok ? res.json() : { schedule: [] }))
        .then((data) => setScheduledReleases(data.schedule || []))
        .catch(() => {})
        .finally(() => setLoadingReleases(false))
    }
  }, [showCreateModal, scheduledReleases.length])

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isCreating) return

    if (!formData.name) {
      showNotification('Campaign name is required', 'error')
      return
    }

    try {
      setIsCreating(true)

      const res = await fetch('/api/nurturing/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (!res.ok) throw new Error('Failed to create campaign')

      showNotification('Campaign created', 'success')
      setShowCreateModal(false)
      setFormData({ name: '', description: '', release_id: '' })
      await loadCampaigns()
    } catch (error) {
      console.error('Error creating campaign:', error)
      showNotification('Failed to create campaign', 'error')
    } finally {
      setIsCreating(false)
    }
  }

  const handleViewDetails = async (campaignId: string) => {
    try {
      const res = await fetch(`/api/nurturing/campaigns/${campaignId}`)
      if (!res.ok) throw new Error('Failed to load campaign details')

      const data = await res.json()
      setEditingCampaign(data)
      setShowDetailModal(true)
    } catch (error) {
      console.error('Error loading campaign:', error)
      showNotification('Failed to load campaign details', 'error')
    }
  }

  const handleDeleteCampaign = async (id: string) => {
    if (!confirm('Delete this campaign?')) return

    try {
      const res = await fetch(`/api/nurturing/campaigns/${id}`, {
        method: 'DELETE',
      })

      if (!res.ok) throw new Error('Failed to delete campaign')

      showNotification('Campaign deleted', 'success')
      await loadCampaigns()
    } catch (error) {
      console.error('Error deleting campaign:', error)
      showNotification('Failed to delete campaign', 'error')
    }
  }

  const statusColor = (status: string) => {
    switch (status) {
      case 'draft':
        return 'bg-gray-600'
      case 'scheduled':
        return 'bg-blue-600'
      case 'sending':
        return 'bg-yellow-600'
      case 'sent':
        return 'bg-green-600'
      case 'paused':
        return 'bg-orange-600'
      case 'cancelled':
        return 'bg-red-600'
      default:
        return 'bg-gray-600'
    }
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case 'draft':
        return <FaClock />
      case 'scheduled':
        return <FaClock />
      case 'sending':
        return <FaSpinner className="animate-spin" />
      case 'sent':
        return <FaCheckCircle />
      default:
        return null
    }
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
              href="/admin/nurturing/fans"
              className="text-gray-400 hover:text-white transition"
            >
              <FaChevronLeft className="inline mr-2" />
              Back
            </Link>
            <h1 className="text-4xl font-bold flex items-center gap-3">
              <FaEnvelope /> Campaigns
            </h1>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-purple-600 hover:bg-purple-700 px-6 py-3 rounded-lg font-medium flex items-center gap-2 transition"
          >
            <FaPlus /> New Campaign
          </button>
        </div>

        {/* Search & Filters */}
        <div className="mb-8 bg-gray-900 p-6 rounded-lg">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search campaigns..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-4 py-2 text-white focus:outline-none focus:border-purple-500"
            >
              <option value="">All Status</option>
              <option value="draft">Draft</option>
              <option value="scheduled">Scheduled</option>
              <option value="sending">Sending</option>
              <option value="sent">Sent</option>
              <option value="paused">Paused</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        {/* Campaigns Grid */}
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <FaSpinner className="animate-spin text-4xl text-purple-500" />
          </div>
        ) : campaigns.length === 0 ? (
          <div className="bg-gray-900 rounded-lg p-12 text-center">
            <FaEnvelope className="mx-auto text-4xl text-gray-600 mb-4" />
            <p className="text-gray-400 text-lg">
              No campaigns yet. Create your first release campaign!
            </p>
          </div>
        ) : (
          <div className="grid gap-6">
            {campaigns.map((campaign) => (
              <div
                key={campaign.id}
                className="bg-gray-900 rounded-lg p-6 border border-gray-800 hover:border-purple-500/50 transition"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                      {campaign.name}
                      <span
                        className={`text-xs font-medium px-3 py-1 rounded ${statusColor(
                          campaign.status
                        )} flex items-center gap-1`}
                      >
                        {statusIcon(campaign.status)}
                        {campaign.status}
                      </span>
                    </h3>
                    {campaign.description && (
                      <p className="text-gray-400 text-sm mt-1">{campaign.description}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleViewDetails(campaign.id)}
                      className="text-blue-400 hover:text-blue-300 transition p-2"
                      title="View details"
                    >
                      <FaEdit />
                    </button>
                    <button
                      onClick={() => handleDeleteCampaign(campaign.id)}
                      className="text-red-400 hover:text-red-300 transition p-2"
                      title="Delete"
                    >
                      <FaTrash />
                    </button>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="bg-gray-800 px-4 py-3 rounded">
                    <div className="text-gray-400 text-xs font-medium mb-1">Sent</div>
                    <div className="text-2xl font-bold text-white">
                      {campaign.total_sent}
                    </div>
                  </div>
                  <div className="bg-gray-800 px-4 py-3 rounded">
                    <div className="text-gray-400 text-xs font-medium mb-1">Opened</div>
                    <div className="text-2xl font-bold text-blue-400">
                      {campaign.total_opened}
                      {campaign.total_sent > 0 && (
                        <span className="text-xs text-gray-400 ml-1">
                          ({Math.round((campaign.total_opened / campaign.total_sent) * 100)}%)
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="bg-gray-800 px-4 py-3 rounded">
                    <div className="text-gray-400 text-xs font-medium mb-1">Clicked</div>
                    <div className="text-2xl font-bold text-green-400">
                      {campaign.total_clicked}
                      {campaign.total_sent > 0 && (
                        <span className="text-xs text-gray-400 ml-1">
                          ({Math.round((campaign.total_clicked / campaign.total_sent) * 100)}%)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between text-sm text-gray-400">
                  <div>Created {new Date(campaign.created_at).toLocaleDateString()}</div>
                  {campaign.scheduled_send_at && (
                    <div>
                      Scheduled for{' '}
                      {new Date(campaign.scheduled_send_at).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 rounded-lg max-w-2xl w-full p-8">
              <h2 className="text-2xl font-bold mb-6">Create New Campaign</h2>

              <form onSubmit={handleCreateCampaign} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Campaign Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="e.g., New EP Release - January"
                    className="w-full bg-gray-800 border border-gray-700 rounded px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder="e.g., Release week email sequence"
                    rows={3}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Link to Release (Optional)
                  </label>
                  <select
                    value={formData.release_id}
                    onChange={(e) => {
                      const releaseId = e.target.value
                      const release = scheduledReleases.find((r) => r.id === releaseId)
                      setFormData({
                        ...formData,
                        release_id: releaseId,
                        name: release
                          ? `${release.title} - Release Campaign`
                          : formData.name,
                      })
                    }}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-4 py-3 text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="">No release linked</option>
                    {loadingReleases ? (
                      <option disabled>Loading releases...</option>
                    ) : (
                      scheduledReleases
                        .sort(
                          (a, b) =>
                            new Date(a.release_date).getTime() -
                            new Date(b.release_date).getTime()
                        )
                        .map((release) => (
                          <option key={release.id} value={release.id}>
                            {release.title} &mdash;{' '}
                            {new Date(release.release_date).toLocaleDateString()}
                          </option>
                        ))
                    )}
                  </select>
                </div>

                <div className="flex gap-4 pt-6 border-t border-gray-700">
                  <button
                    type="submit"
                    disabled={isCreating}
                    className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 px-6 py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition"
                  >
                    {isCreating && <FaSpinner className="animate-spin" />}
                    Create Campaign
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 bg-gray-800 hover:bg-gray-700 px-6 py-3 rounded-lg font-medium transition"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Detail Modal */}
        {showDetailModal && editingCampaign && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 rounded-lg max-w-3xl w-full p-8 max-h-[90vh] overflow-y-auto">
              <h2 className="text-2xl font-bold mb-6">{editingCampaign.name}</h2>

              {/* Sequences */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-4">Email Sequences</h3>
                {editingCampaign.sequences && editingCampaign.sequences.length > 0 ? (
                  <div className="space-y-3">
                    {editingCampaign.sequences.map((seq, idx) => (
                      <div
                        key={seq.id}
                        className="bg-gray-800 p-4 rounded flex items-center justify-between"
                      >
                        <div className="flex-1">
                          <p className="font-medium">
                            T{seq.days_offset >= 0 ? '+' : ''}{seq.days_offset}:{' '}
                            {seq.campaign_templates.name}
                          </p>
                          <p className="text-sm text-gray-400">
                            {seq.campaign_templates.subject}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            Sent: {seq.sent_count} | Opened: {seq.opened_count} |
                            Clicked: {seq.clicked_count}
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            /* handle delete sequence */
                          }}
                          className="text-red-400 hover:text-red-300 p-2"
                        >
                          <FaTimes />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-400 text-sm">No sequences yet</p>
                )}
              </div>

              {/* Close */}
              <button
                onClick={() => setShowDetailModal(false)}
                className="w-full bg-gray-800 hover:bg-gray-700 px-6 py-3 rounded-lg font-medium transition"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
