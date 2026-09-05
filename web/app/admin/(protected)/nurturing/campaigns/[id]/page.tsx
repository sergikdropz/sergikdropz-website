'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAdminAuth } from '@/contexts/AdminAuthContext'
import { useNotifications } from '@/contexts/NotificationContext'
import Link from 'next/link'
import SequenceBuilder from '@/components/SequenceBuilder'
import CampaignAnalyticsChart from '@/components/CampaignAnalyticsChart'
import {
  FaChevronLeft,
  FaCalendar,
  FaSpinner,
  FaCheck,
  FaClock,
  FaUsers,
  FaChartLine,
} from 'react-icons/fa'

interface Campaign {
  id: string
  name: string
  description: string
  status: 'draft' | 'scheduled' | 'sending' | 'sent'
  scheduled_send_at: string | null
  total_sent: number
  total_opened: number
  total_clicked: number
  created_at: string
  release_id: string | null
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
    id: string
    name: string
    subject: string
  }
}

interface Template {
  id: string
  name: string
  subject: string
  category: string
}

interface CampaignDetail extends Campaign {
  sequences: Sequence[]
}

export default function CampaignDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const { user, isAdmin, loading } = useAdminAuth()
  const { showNotification } = useNotifications()
  const campaignId = params.id

  const [campaign, setCampaign] = useState<CampaignDetail | null>(null)
  const [templates, setTemplates] = useState<Template[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'details' | 'sequences' | 'analytics'>('details')
  const [sequences, setSequences] = useState<Sequence[]>([])
  const [showScheduleForm, setShowScheduleForm] = useState(false)
  const [scheduleDate, setScheduleDate] = useState('')

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true)

      // Load campaign details
      const campaignRes = await fetch(
        `/api/nurturing/campaigns/${campaignId}`
      )
      if (!campaignRes.ok) throw new Error('Failed to load campaign')
      const campaignData = await campaignRes.json()
      setCampaign(campaignData)
      setSequences(campaignData.sequences || [])

      // Load templates
      const templatesRes = await fetch('/api/nurturing/campaign-templates?limit=100')
      if (!templatesRes.ok) throw new Error('Failed to load templates')
      const templatesData = await templatesRes.json()
      setTemplates(templatesData.data || [])

      // Set initial schedule date
      if (campaignData.scheduled_send_at) {
        const date = new Date(campaignData.scheduled_send_at)
        setScheduleDate(date.toISOString().split('T')[0])
      } else {
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)
        setScheduleDate(tomorrow.toISOString().split('T')[0])
      }
    } catch (error) {
      console.error('Error loading campaign:', error)
      showNotification('Failed to load campaign', 'error')
    } finally {
      setIsLoading(false)
    }
  }, [campaignId, showNotification])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleScheduleCampaign = async () => {
    if (!scheduleDate) {
      showNotification('Select a send date', 'error')
      return
    }

    if (sequences.length === 0) {
      showNotification('Add at least one email sequence', 'error')
      return
    }

    try {
      setIsSaving(true)

      const sendDate = new Date(scheduleDate)
      sendDate.setHours(9, 0, 0, 0) // 9 AM default

      const res = await fetch(`/api/nurturing/campaigns/${campaignId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'scheduled',
          scheduled_send_at: sendDate.toISOString(),
        }),
      })

      if (!res.ok) throw new Error('Failed to schedule campaign')

      showNotification('Campaign scheduled for send', 'success')
      setShowScheduleForm(false)
      await loadData()
    } catch (error) {
      console.error('Error scheduling campaign:', error)
      showNotification('Failed to schedule campaign', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  if (loading || isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <FaSpinner className="animate-spin text-4xl text-purple-500" />
      </div>
    )
  }

  if (!campaign) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400">Campaign not found</p>
          <Link href="/admin/nurturing/campaigns" className="text-purple-400 hover:text-purple-300 mt-4 inline-block">
            Back to campaigns
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/admin/nurturing/campaigns"
            className="text-gray-400 hover:text-white transition"
          >
            <FaChevronLeft />
          </Link>
          <div className="flex-1">
            <h1 className="text-4xl font-bold mb-2">{campaign.name}</h1>
            {campaign.description && (
              <p className="text-gray-400">{campaign.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 ${
              campaign.status === 'draft' ? 'bg-gray-600' :
              campaign.status === 'scheduled' ? 'bg-blue-600' :
              campaign.status === 'sending' ? 'bg-yellow-600' :
              'bg-green-600'
            }`}>
              {campaign.status === 'sending' ? (
                <FaSpinner className="animate-spin" />
              ) : campaign.status === 'sent' ? (
                <FaCheck />
              ) : (
                <FaClock />
              )}
              {campaign.status}
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <div className="text-gray-400 text-sm font-medium mb-1">Status</div>
            <div className="text-2xl font-bold capitalize">{campaign.status}</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <div className="text-gray-400 text-sm font-medium mb-1">Sent</div>
            <div className="text-2xl font-bold">{campaign.total_sent}</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <div className="text-gray-400 text-sm font-medium mb-1">Opens</div>
            <div className="text-2xl font-bold text-blue-400">{campaign.total_opened}</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <div className="text-gray-400 text-sm font-medium mb-1">Clicks</div>
            <div className="text-2xl font-bold text-green-400">{campaign.total_clicked}</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mb-8 border-b border-gray-800">
          {(['details', 'sequences', 'analytics'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 font-medium border-b-2 transition ${
                activeTab === tab
                  ? 'border-purple-500 text-white'
                  : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              {tab === 'details' && '📋 Details'}
              {tab === 'sequences' && '📧 Sequences'}
              {tab === 'analytics' && '📊 Analytics'}
            </button>
          ))}
        </div>

        {/* Details Tab */}
        {activeTab === 'details' && (
          <div className="space-y-8">
            {/* Campaign Info */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-bold mb-4">Campaign Information</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Name</label>
                  <p className="text-white font-medium">{campaign.name}</p>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Description</label>
                  <p className="text-white">{campaign.description || 'No description'}</p>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Created</label>
                  <p className="text-white">{new Date(campaign.created_at).toLocaleDateString()}</p>
                </div>
              </div>
            </div>

            {/* Schedule Section */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <FaCalendar /> Schedule Campaign
              </h2>

              {campaign.status === 'draft' ? (
                <>
                  {!showScheduleForm ? (
                    <button
                      onClick={() => setShowScheduleForm(true)}
                      className="bg-purple-600 hover:bg-purple-700 px-6 py-3 rounded-lg font-medium transition"
                    >
                      Schedule for Send
                    </button>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Send Date *
                        </label>
                        <input
                          type="date"
                          value={scheduleDate}
                          onChange={(e) => setScheduleDate(e.target.value)}
                          className="bg-gray-800 border border-gray-700 rounded px-4 py-2 text-white focus:outline-none focus:border-purple-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Emails will start sending on this date at 9 AM, with sequences offset based on T-timing
                        </p>
                      </div>

                      <div className="flex gap-4 pt-4 border-t border-gray-700">
                        <button
                          onClick={handleScheduleCampaign}
                          disabled={isSaving}
                          className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 px-6 py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition"
                        >
                          {isSaving && <FaSpinner className="animate-spin" />}
                          Confirm Schedule
                        </button>
                        <button
                          onClick={() => setShowScheduleForm(false)}
                          className="flex-1 bg-gray-800 hover:bg-gray-700 px-6 py-3 rounded-lg font-medium transition"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-blue-900/20 border border-blue-600/30 rounded px-4 py-3">
                  <p className="text-blue-200">
                    <FaCheck className="inline mr-2" />
                    Campaign scheduled for {new Date(campaign.scheduled_send_at || '').toLocaleDateString()}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Sequences Tab */}
        {activeTab === 'sequences' && (
          <SequenceBuilder
            sequences={sequences.map((s) => ({
              id: s.id,
              days_offset: s.days_offset,
              template_id: s.template_id,
              template_name: s.campaign_templates.name,
              subject: s.campaign_templates.subject,
              sequence_order: s.sequence_order,
            }))}
            onSequencesChange={(items) => {
              // Map SequenceItem back to Sequence structure
              setSequences(prev => items.map((item, index) => {
                const existing = prev.find(s => s.id === item.id)
                return {
                  id: item.id || `temp-${index}`,
                  campaign_id: existing?.campaign_id || campaignId,
                  template_id: item.template_id,
                  days_offset: item.days_offset,
                  sequence_order: item.sequence_order ?? index,
                  status: existing?.status || 'pending' as const,
                  sent_count: existing?.sent_count || 0,
                  opened_count: existing?.opened_count || 0,
                  clicked_count: existing?.clicked_count || 0,
                  campaign_templates: existing?.campaign_templates || { id: item.template_id, name: item.template_name || '', subject: item.subject || '' },
                }
              }))
            }}
            templates={templates}
            isLoading={isSaving}
          />
        )}

        {/* Analytics Tab */}
        {activeTab === 'analytics' && campaign.status !== 'draft' && (
          <CampaignAnalyticsChart campaignId={campaignId} />
        )}

        {activeTab === 'analytics' && campaign.status === 'draft' && (
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-12 text-center">
            <FaChartLine className="text-4xl text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400">
              Schedule the campaign to see analytics data
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
