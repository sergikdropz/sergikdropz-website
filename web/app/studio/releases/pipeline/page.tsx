'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AdminAuthContext'
import { useNotifications } from '@/contexts/NotificationContext'
import Link from 'next/link'
import {
  FaRocket,
  FaSpinner,
  FaChevronLeft,
  FaEnvelope,
  FaLink,
  FaCopy,
  FaCheckCircle,
  FaExternalLinkAlt,
} from 'react-icons/fa'

interface PipelineRelease {
  id: string
  title: string
  type: string
  release_date: string
  presave_date: string | null
  genre: string | null
  status: string
  artwork: string | null
  smart_link: string | null
  description: string | null
  campaign: {
    id: string
    name: string
    status: string
  } | null
  smart_link_data: {
    id: string
    slug: string
    total_clicks: number
  } | null
}

export default function PipelinePage() {
  const { user, isAdmin, loading } = useAuth()
  const { showNotification } = useNotifications()
  const [releases, setReleases] = useState<PipelineRelease[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<Record<string, string>>({})
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null)

  const loadPipeline = useCallback(async () => {
    try {
      setIsLoading(true)
      const res = await fetch('/api/studio/release-pipeline')
      if (!res.ok) throw new Error('Failed to load pipeline')
      const data = await res.json()
      setReleases(data.releases || [])
    } catch (error) {
      console.error('Error loading pipeline:', error)
      showNotification('Failed to load release pipeline', 'error')
    } finally {
      setIsLoading(false)
    }
  }, [showNotification])

  useEffect(() => {
    if (isAdmin) loadPipeline()
  }, [isAdmin, loadPipeline])

  async function createCampaign(releaseId: string) {
    setActionLoading((prev) => ({ ...prev, [`campaign-${releaseId}`]: 'loading' }))
    try {
      const res = await fetch('/api/studio/release-pipeline/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ release_id: releaseId }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create campaign')
      }
      showNotification('Campaign created', 'success')
      await loadPipeline()
    } catch (error: any) {
      showNotification(error.message, 'error')
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev }
        delete next[`campaign-${releaseId}`]
        return next
      })
    }
  }

  async function createSmartLink(releaseId: string) {
    setActionLoading((prev) => ({ ...prev, [`link-${releaseId}`]: 'loading' }))
    try {
      const res = await fetch('/api/studio/release-pipeline/smart-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ release_id: releaseId }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create smart link')
      }
      showNotification('Smart link created', 'success')
      await loadPipeline()
    } catch (error: any) {
      showNotification(error.message, 'error')
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev }
        delete next[`link-${releaseId}`]
        return next
      })
    }
  }

  async function launchAll(releaseId: string) {
    setActionLoading((prev) => ({ ...prev, [`launch-${releaseId}`]: 'loading' }))
    try {
      const release = releases.find((r) => r.id === releaseId)
      if (!release) return

      const res = await fetch('/api/studio/release-pipeline/launch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': `launch-${releaseId}-${Date.now().toString(36)}`,
        },
        body: JSON.stringify({
          release_id: releaseId,
          create_campaign: !release.campaign,
          create_smart_link: !release.smart_link_data,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok && res.status !== 207) {
        throw new Error(data.error || 'Launch failed')
      }
      if (data.partial || res.status === 207) {
        showNotification(
          `Partial launch: ${(data.errors || ['some steps failed']).join('; ')}`,
          'error'
        )
      } else {
        showNotification('Marketing launched for release', 'success')
      }
      await loadPipeline()
    } catch (error: any) {
      showNotification(error.message || 'Launch failed', 'error')
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev }
        delete next[`launch-${releaseId}`]
        return next
      })
    }
  }

  function copySmartLinkUrl(slug: string) {
    const url = `${window.location.origin}/l/${slug}`
    navigator.clipboard.writeText(url)
    setCopiedSlug(slug)
    setTimeout(() => setCopiedSlug(null), 2000)
  }

  function getCountdown(dateStr: string) {
    const now = new Date()
    const release = new Date(dateStr)
    const diff = release.getTime() - now.getTime()
    if (diff <= 0) return 'Released'
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
    return `${days}d`
  }

  function campaignStatusBadge(campaign: PipelineRelease['campaign']) {
    if (!campaign) {
      return <span className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-400">No campaign</span>
    }
    const colors: Record<string, string> = {
      draft: 'bg-yellow-900/50 text-yellow-400',
      scheduled: 'bg-blue-900/50 text-blue-400',
      sending: 'bg-blue-900/50 text-blue-400',
      sent: 'bg-green-900/50 text-green-400',
      paused: 'bg-orange-900/50 text-orange-400',
    }
    return (
      <span className={`text-xs px-2 py-1 rounded ${colors[campaign.status] || 'bg-gray-800 text-gray-400'}`}>
        {campaign.status}
      </span>
    )
  }

  function smartLinkStatusBadge(link: PipelineRelease['smart_link_data']) {
    if (!link) {
      return <span className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-400">No link</span>
    }
    return (
      <span className="text-xs px-2 py-1 rounded bg-green-900/50 text-green-400">
        Active ({link.total_clicks} clicks)
      </span>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <FaSpinner className="animate-spin text-4xl text-purple-500" />
      </div>
    )
  }

  if (!user || !isAdmin) return null

  const sortedReleases = [...releases].sort(
    (a, b) => new Date(a.release_date).getTime() - new Date(b.release_date).getTime()
  )

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link
              href="/studio/releases"
              className="text-gray-400 hover:text-white transition"
            >
              <FaChevronLeft className="inline mr-2" />
              Releases
            </Link>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <FaRocket className="text-purple-400" /> Release Pipeline
            </h1>
          </div>
        </div>

        {/* Pipeline Table */}
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <FaSpinner className="animate-spin text-4xl text-purple-500" />
          </div>
        ) : sortedReleases.length === 0 ? (
          <div className="bg-gray-900 rounded-lg p-12 text-center">
            <FaRocket className="mx-auto text-4xl text-gray-600 mb-4" />
            <p className="text-gray-400 text-lg">No scheduled releases found.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {sortedReleases.map((release) => {
              const countdown = getCountdown(release.release_date)
              const isReleased = countdown === 'Released'
              const needsMarketing = !release.campaign && !release.smart_link_data
              const isLaunchLoading = !!actionLoading[`launch-${release.id}`]
              const isCampaignLoading = !!actionLoading[`campaign-${release.id}`]
              const isLinkLoading = !!actionLoading[`link-${release.id}`]

              return (
                <div
                  key={release.id}
                  className={`bg-gray-900 border rounded-lg p-6 transition ${
                    needsMarketing && !isReleased
                      ? 'border-yellow-600/50'
                      : 'border-gray-800'
                  }`}
                >
                  <div className="flex items-start gap-6">
                    {/* Artwork + Info */}
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      {release.artwork ? (
                        <img
                          src={release.artwork}
                          alt={release.title}
                          className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
                        />
                      ) : (
                        <div className="w-16 h-16 bg-gray-800 rounded-lg flex items-center justify-center flex-shrink-0">
                          <FaRocket className="text-gray-600" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <h3 className="text-lg font-semibold truncate">{release.title}</h3>
                        <p className="text-sm text-gray-400">
                          {release.type} &middot; {release.genre}
                        </p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-gray-500">
                            {new Date(release.release_date).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </span>
                          <span
                            className={`text-xs font-bold ${
                              isReleased ? 'text-green-400' : 'text-purple-400'
                            }`}
                          >
                            {countdown}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Status Badges */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-2">
                          <FaEnvelope className="text-gray-500 text-xs" />
                          {campaignStatusBadge(release.campaign)}
                        </div>
                        <div className="flex items-center gap-2">
                          <FaLink className="text-gray-500 text-xs" />
                          {smartLinkStatusBadge(release.smart_link_data)}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* Launch All */}
                      {needsMarketing && !isReleased && (
                        <button
                          onClick={() => launchAll(release.id)}
                          disabled={isLaunchLoading}
                          className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2"
                        >
                          {isLaunchLoading ? (
                            <FaSpinner className="animate-spin" />
                          ) : (
                            <FaRocket />
                          )}
                          Launch All
                        </button>
                      )}

                      {/* Create Campaign */}
                      {!release.campaign && !needsMarketing && (
                        <button
                          onClick={() => createCampaign(release.id)}
                          disabled={isCampaignLoading}
                          className="bg-gray-800 hover:bg-gray-700 disabled:bg-gray-800 text-white px-3 py-2 rounded-lg text-sm transition flex items-center gap-2"
                        >
                          {isCampaignLoading ? (
                            <FaSpinner className="animate-spin" />
                          ) : (
                            <FaEnvelope />
                          )}
                          Campaign
                        </button>
                      )}

                      {/* Create Smart Link */}
                      {!release.smart_link_data && !needsMarketing && (
                        <button
                          onClick={() => createSmartLink(release.id)}
                          disabled={isLinkLoading}
                          className="bg-gray-800 hover:bg-gray-700 disabled:bg-gray-800 text-white px-3 py-2 rounded-lg text-sm transition flex items-center gap-2"
                        >
                          {isLinkLoading ? (
                            <FaSpinner className="animate-spin" />
                          ) : (
                            <FaLink />
                          )}
                          Smart Link
                        </button>
                      )}

                      {/* View Campaign */}
                      {release.campaign && (
                        <Link
                          href={`/admin/nurturing/campaigns`}
                          className="text-blue-400 hover:text-blue-300 p-2 transition"
                          title="View Campaign"
                        >
                          <FaExternalLinkAlt />
                        </Link>
                      )}

                      {/* Copy Smart Link URL */}
                      {release.smart_link_data && (
                        <button
                          onClick={() => copySmartLinkUrl(release.smart_link_data!.slug)}
                          className="text-green-400 hover:text-green-300 p-2 transition"
                          title="Copy smart link URL"
                        >
                          {copiedSlug === release.smart_link_data.slug ? (
                            <FaCheckCircle />
                          ) : (
                            <FaCopy />
                          )}
                        </button>
                      )}

                      {/* Both exist - show checkmark */}
                      {release.campaign && release.smart_link_data && (
                        <FaCheckCircle className="text-green-400 ml-1" title="Marketing ready" />
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
