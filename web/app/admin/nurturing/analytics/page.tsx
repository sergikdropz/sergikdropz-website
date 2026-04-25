'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useNotifications } from '@/contexts/NotificationContext'
import Link from 'next/link'
import {
  FaChartLine,
  FaChevronLeft,
  FaArrowUp,
  FaEnvelope,
  FaEye,
  FaMousePointer,
  FaUsers,
  FaLink,
  FaSpinner,
} from 'react-icons/fa'

interface DashboardStats {
  totalFans: number
  totalSuperFans: number
  totalSmartLinks: number
  totalCampaigns: number
  campaignsSent: number
  totalEmailsSent: number
  totalOpens: number
  totalClicks: number
  avgOpenRate: number
  avgClickRate: number
  topCampaigns: TopCampaign[]
  topSmartLinks: TopSmartLink[]
  recentFans: Fan[]
}

interface TopCampaign {
  id: string
  name: string
  total_sent: number
  total_opened: number
  total_clicked: number
}

interface TopSmartLink {
  id: string
  slug: string
  title: string
  total_clicks: number
  unique_clicks: number
}

interface Fan {
  id: string
  email: string
  name: string
  source: string
  is_superfan: boolean
  created_at: string
}

export default function NurturingAnalytics() {
  const { user, isAdmin, loading } = useAuth()
  const { showNotification } = useNotifications()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'all'>('month')

  const loadAnalytics = useCallback(async () => {
    try {
      setIsLoading(true)

      const params = new URLSearchParams()
      params.append('timeRange', timeRange)

      const res = await fetch(`/api/nurturing/analytics?${params}`)
      if (!res.ok) throw new Error('Failed to load analytics')

      const data = await res.json()
      setStats(data)
    } catch (error) {
      console.error('Error loading analytics:', error)
      showNotification('Failed to load analytics', 'error')
    } finally {
      setIsLoading(false)
    }
  }, [timeRange, showNotification])

  useEffect(() => {
    loadAnalytics()
  }, [loadAnalytics])

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
              <FaChartLine /> Nurturing Analytics
            </h1>
          </div>

          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as any)}
            className="bg-gray-800 border border-gray-700 rounded px-4 py-2 text-white focus:outline-none focus:border-purple-500"
          >
            <option value="week">Last 7 days</option>
            <option value="month">Last 30 days</option>
            <option value="all">All time</option>
          </select>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <FaSpinner className="animate-spin text-4xl text-purple-500" />
          </div>
        ) : stats ? (
          <>
            {/* Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <MetricCard
                icon={<FaUsers className="text-blue-400" />}
                label="Total Fans"
                value={stats.totalFans}
                subtext={`${stats.totalSuperFans} superfans`}
              />
              <MetricCard
                icon={<FaLink className="text-green-400" />}
                label="Smart Links"
                value={stats.totalSmartLinks}
                subtext="Active"
              />
              <MetricCard
                icon={<FaEnvelope className="text-purple-400" />}
                label="Campaigns Sent"
                value={stats.campaignsSent}
                subtext={`${stats.totalCampaigns} total`}
              />
              <MetricCard
                icon={<FaMousePointer className="text-yellow-400" />}
                label="Total Clicks"
                value={stats.totalClicks}
                subtext={`${stats.totalSmartLinks > 0 ? Math.round(stats.totalClicks / stats.totalSmartLinks) : 0} avg/link`}
              />
            </div>

            {/* Email Metrics */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              <MetricCard
                icon={<FaEnvelope className="text-purple-400" />}
                label="Emails Sent"
                value={stats.totalEmailsSent}
                subtext="Campaign sends"
              />
              <MetricCard
                icon={<FaEye className="text-blue-400" />}
                label="Open Rate"
                value={`${stats.avgOpenRate.toFixed(1)}%`}
                subtext={`${stats.totalOpens} total opens`}
              />
              <MetricCard
                icon={<FaMousePointer className="text-green-400" />}
                label="Click Rate"
                value={`${stats.avgClickRate.toFixed(1)}%`}
                subtext={`${stats.totalClicks} total clicks`}
              />
            </div>

            {/* Top Performers */}
            <div className="grid grid-cols-2 gap-8 mb-8">
              {/* Top Campaigns */}
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <FaArrowUp /> Top Campaigns
                </h2>

                {stats.topCampaigns.length > 0 ? (
                  <div className="space-y-3">
                    {stats.topCampaigns.slice(0, 5).map((campaign) => (
                      <Link
                        key={campaign.id}
                        href={`/admin/nurturing/campaigns/${campaign.id}`}
                        className="block p-3 bg-gray-800 rounded hover:bg-gray-700 transition"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <p className="font-medium truncate flex-1">{campaign.name}</p>
                          <span className="text-xs bg-purple-900 px-2 py-1 rounded ml-2">
                            {campaign.total_sent} sent
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-400">
                          <span className="text-blue-400">
                            Opens: {campaign.total_opened} ({campaign.total_sent > 0 ? Math.round((campaign.total_opened / campaign.total_sent) * 100) : 0}%)
                          </span>
                          <span className="text-green-400">
                            Clicks: {campaign.total_clicked} ({campaign.total_sent > 0 ? Math.round((campaign.total_clicked / campaign.total_sent) * 100) : 0}%)
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-400 text-center py-8">No campaigns sent yet</p>
                )}
              </div>

              {/* Top Smart Links */}
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <FaArrowUp /> Top Smart Links
                </h2>

                {stats.topSmartLinks.length > 0 ? (
                  <div className="space-y-3">
                    {stats.topSmartLinks.slice(0, 5).map((link) => (
                      <Link
                        key={link.id}
                        href={`/admin/nurturing/smart-links`}
                        className="block p-3 bg-gray-800 rounded hover:bg-gray-700 transition"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex-1">
                            <p className="font-medium">{link.title || link.slug}</p>
                            <code className="text-xs text-gray-500">/{link.slug}</code>
                          </div>
                          <span className="text-xs bg-green-900 px-2 py-1 rounded">
                            {link.total_clicks} clicks
                          </span>
                        </div>
                        <div className="text-sm text-gray-400">
                          {link.unique_clicks} unique visitors
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-400 text-center py-8">No smart links created yet</p>
                )}
              </div>
            </div>

            {/* Recent Fans */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <FaUsers /> Recent Fans
              </h2>

              {stats.recentFans.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-gray-700">
                      <tr>
                        <th className="text-left py-2 px-3 text-gray-400 font-medium">Email</th>
                        <th className="text-left py-2 px-3 text-gray-400 font-medium">Name</th>
                        <th className="text-left py-2 px-3 text-gray-400 font-medium">Source</th>
                        <th className="text-left py-2 px-3 text-gray-400 font-medium">Status</th>
                        <th className="text-left py-2 px-3 text-gray-400 font-medium">Joined</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {stats.recentFans.map((fan) => (
                        <tr key={fan.id} className="hover:bg-gray-800 transition">
                          <td className="py-3 px-3">{fan.email}</td>
                          <td className="py-3 px-3">{fan.name || '–'}</td>
                          <td className="py-3 px-3 text-xs">
                            <span className="bg-gray-800 px-2 py-1 rounded">
                              {fan.source}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            {fan.is_superfan && (
                              <span className="bg-yellow-900 text-yellow-200 px-2 py-1 rounded text-xs font-medium">
                                ⭐ Superfan
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-gray-500 text-xs">
                            {new Date(fan.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-400 text-center py-8">No fans yet</p>
              )}
            </div>
          </>
        ) : (
          <div className="bg-gray-900 rounded-lg p-12 text-center">
            <p className="text-gray-400">No data available</p>
          </div>
        )}
      </div>
    </div>
  )
}

function MetricCard({
  icon,
  label,
  value,
  subtext,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  subtext?: string
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-gray-400 text-sm font-medium">{label}</span>
      </div>
      <div className="text-3xl font-bold mb-1">{value}</div>
      {subtext && <p className="text-xs text-gray-500">{subtext}</p>}
    </div>
  )
}
