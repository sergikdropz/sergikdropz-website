'use client'

import { useEffect, useState } from 'react'
import { FaChartLine, FaEnvelope, FaEye, FaMousePointer, FaSpinner } from 'react-icons/fa'

interface CampaignAnalytics {
  id: string
  name: string
  total_sent: number
  total_opened: number
  total_clicked: number
  total_unsubscribed: number
  sequences: SequenceAnalytics[]
}

interface SequenceAnalytics {
  id: string
  days_offset: number
  sent_count: number
  opened_count: number
  clicked_count: number
  campaign_templates: {
    name: string
  }
}

interface Props {
  campaignId: string
}

export default function CampaignAnalyticsChart({ campaignId }: Props) {
  const [analytics, setAnalytics] = useState<CampaignAnalytics | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadAnalytics = async () => {
      try {
        setIsLoading(true)
        const res = await fetch(`/api/nurturing/campaigns/${campaignId}`)
        if (!res.ok) throw new Error('Failed to load analytics')

        const data = await res.json()
        setAnalytics(data)
      } catch (error) {
        console.error('Error loading analytics:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadAnalytics()
  }, [campaignId])

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <FaSpinner className="animate-spin text-3xl text-purple-500" />
      </div>
    )
  }

  if (!analytics) {
    return <div className="text-gray-400">No analytics available</div>
  }

  const openRate =
    analytics.total_sent > 0
      ? Math.round((analytics.total_opened / analytics.total_sent) * 100)
      : 0
  const clickRate =
    analytics.total_sent > 0
      ? Math.round((analytics.total_clicked / analytics.total_sent) * 100)
      : 0

  return (
    <div className="space-y-6">
      {/* Top Metrics */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <FaEnvelope className="text-blue-400" />
            <span className="text-gray-400 text-sm font-medium">Sent</span>
          </div>
          <div className="text-3xl font-bold">{analytics.total_sent}</div>
        </div>

        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <FaEye className="text-green-400" />
            <span className="text-gray-400 text-sm font-medium">Opens</span>
          </div>
          <div className="text-3xl font-bold text-green-400">{analytics.total_opened}</div>
          <div className="text-xs text-gray-500 mt-1">{openRate}% open rate</div>
        </div>

        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <FaMousePointer className="text-yellow-400" />
            <span className="text-gray-400 text-sm font-medium">Clicks</span>
          </div>
          <div className="text-3xl font-bold text-yellow-400">{analytics.total_clicked}</div>
          <div className="text-xs text-gray-500 mt-1">{clickRate}% click rate</div>
        </div>

        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <FaChartLine className="text-red-400" />
            <span className="text-gray-400 text-sm font-medium">Unsubscribed</span>
          </div>
          <div className="text-3xl font-bold text-red-400">{analytics.total_unsubscribed}</div>
        </div>
      </div>

      {/* Sequence Performance */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Sequence Performance</h3>
        <div className="bg-gray-900 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-800 border-b border-gray-700">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-300">
                  Sequence
                </th>
                <th className="px-4 py-3 text-right font-medium text-gray-300">
                  Sent
                </th>
                <th className="px-4 py-3 text-right font-medium text-gray-300">
                  Opened
                </th>
                <th className="px-4 py-3 text-right font-medium text-gray-300">
                  Clicked
                </th>
                <th className="px-4 py-3 text-right font-medium text-gray-300">
                  Open Rate
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {analytics.sequences.map((seq) => {
                const seqOpenRate =
                  seq.sent_count > 0
                    ? Math.round((seq.opened_count / seq.sent_count) * 100)
                    : 0

                return (
                  <tr key={seq.id} className="hover:bg-gray-800 transition">
                    <td className="px-4 py-3">
                      <div>
                        <div className="font-medium">
                          T{seq.days_offset >= 0 ? '+' : ''}{seq.days_offset}
                        </div>
                        <div className="text-xs text-gray-500">
                          {seq.campaign_templates.name}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {seq.sent_count}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-green-400 font-medium">
                        {seq.opened_count}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-yellow-400 font-medium">
                        {seq.clicked_count}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="w-16 bg-gray-800 rounded-full h-2">
                        <div
                          className="bg-purple-500 h-2 rounded-full"
                          style={{ width: `${seqOpenRate}%` }}
                        />
                      </div>
                      <div className="text-xs text-gray-400 mt-1">{seqOpenRate}%</div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
