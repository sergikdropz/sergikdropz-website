'use client'

import { useState, useEffect, useRef } from 'react'
import { useAdminAuth } from '@/contexts/AdminAuthContext'
import { useRouter } from 'next/navigation'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { ProductionStats } from '@/components/music/ProductionStats'
import ChartContainer from '@/components/ChartContainer'

interface AnalyticsStats {
  summary: {
    totalEvents: number
    pageViews: number
    trackPlays: number
    downloads: number
    purchases: number
    totalRevenue: number
  }
  engagement?: {
    totalSessions: number
    avgSessionDuration: number
    avgPagesPerSession: number
    bounceRate: number
    avgTimeOnPage: number
    returnVisitors: number
    newVisitors: number
    returnVisitorRate: number
    engagedSessions: number
    engagementRate: number
  }
  eventsByDate: Record<string, Record<string, number>>
  topTracks: Array<{ trackId: string; count: number }>
  topPages: Array<{ path: string; count: number }>
  traffic?: {
    sources: Array<{ source: string; count: number }>
    topReferrers: Array<{ domain: string; count: number }>
  }
  locations?: {
    topCountries: Array<{ country: string; count: number }>
    topCities: Array<{ city: string; count: number }>
    topRegions: Array<{ region: string; count: number }>
  }
  technology?: {
    deviceTypes: Array<{ deviceType: string; count: number }>
    browsers: Array<{ browser: string; count: number }>
    operatingSystems: Array<{ os: string; count: number }>
  }
}

interface AnalyticsEvent {
  id: string
  event_type: string
  event_data: any
  created_at: string
  user_id?: string
  session_id?: string
}

export default function AdminAnalytics() {
  const { user, isAdmin, loading } = useAdminAuth()
  const router = useRouter()
  const [stats, setStats] = useState<AnalyticsStats | null>(null)
  const [events, setEvents] = useState<AnalyticsEvent[]>([])
  const [loadingStats, setLoadingStats] = useState(true)
  const [loadingEvents, setLoadingEvents] = useState(true)
  const [filters, setFilters] = useState({
    event_type: '',
    start_date: '',
    end_date: '',
  })
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1, page: 1, limit: 50 })
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null)
useEffect(() => {
    if (isAdmin) {
      fetchStats()
      fetchEvents()
      setLastUpdated(new Date())
    }
  }, [isAdmin, filters, page])

  // Auto-refresh functionality
  useEffect(() => {
    if (isAdmin && autoRefresh) {
      refreshIntervalRef.current = setInterval(() => {
        fetchStats()
        fetchEvents()
        setLastUpdated(new Date())
      }, 30000) // Refresh every 30 seconds

      return () => {
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current)
        }
      }
    } else if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current)
    }
  }, [isAdmin, autoRefresh])

  async function fetchStats() {
    try {
      setLoadingStats(true)
      const params = new URLSearchParams()
      if (filters.start_date) {
        params.append('start_date', filters.start_date)
      }
      if (filters.end_date) {
        params.append('end_date', filters.end_date)
      }

      const response = await fetch(`/api/analytics/stats?${params}`)
      const data = await response.json()
      setStats(data)
    } catch (error) {
      console.error('Error fetching stats:', error)
    } finally {
      setLoadingStats(false)
    }
  }

  async function fetchEvents() {
    try {
      setLoadingEvents(true)
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '50',
      })

      if (filters.event_type) {
        params.append('event_type', filters.event_type)
      }
      if (filters.start_date) {
        params.append('start_date', filters.start_date)
      }
      if (filters.end_date) {
        params.append('end_date', filters.end_date)
      }

      const response = await fetch(`/api/analytics/events?${params}`)
      const data = await response.json()
      setEvents(data.events || [])
      setPagination(data.pagination || pagination)
    } catch (error) {
      console.error('Error fetching events:', error)
    } finally {
      setLoadingEvents(false)
    }
  }

  function handleFilterChange(key: string, value: string) {
    setFilters({ ...filters, [key]: value })
    setPage(1)
  }

  function formatDuration(seconds: number): string {
    if (seconds < 60) {
      return `${Math.round(seconds)}s`
    }
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = Math.round(seconds % 60)
    if (minutes < 60) {
      return `${minutes}m ${remainingSeconds}s`
    }
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    return `${hours}h ${remainingMinutes}m`
  }

  function handleExport() {
    // Convert events to CSV
    const headers = ['Date', 'Event Type', 'Event Data', 'User ID', 'Session ID']
    const rows = events.map((e) => [
      new Date(e.created_at).toLocaleString(),
      e.event_type,
      JSON.stringify(e.event_data || {}),
      e.user_id || '',
      e.session_id || '',
    ])

    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `analytics-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading || loadingStats) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-white text-xl">Loading...</div>
      </div>
    )
  }

  if (!user || !isAdmin) {
    return null
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold mb-2">Analytics Dashboard</h1>
            <p className="text-gray-400">View site analytics and statistics</p>
          </div>
          <div className="flex items-center gap-4">
            {lastUpdated && (
              <div className="text-sm text-gray-400">
                Last updated: {lastUpdated.toLocaleTimeString()}
              </div>
            )}
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="w-4 h-4"
              />
              Auto-refresh (30s)
            </label>
          </div>
        </div>

        {/* Overview Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
            <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
              <div className="text-gray-400 text-sm mb-1">Total Events</div>
              <div className="text-2xl font-bold">{stats.summary.totalEvents.toLocaleString()}</div>
            </div>
            <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
              <div className="text-gray-400 text-sm mb-1">Page Views</div>
              <div className="text-2xl font-bold text-blue-400">{stats.summary.pageViews.toLocaleString()}</div>
            </div>
            <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
              <div className="text-gray-400 text-sm mb-1">Track Plays</div>
              <div className="text-2xl font-bold text-purple-400">{stats.summary.trackPlays.toLocaleString()}</div>
            </div>
            <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
              <div className="text-gray-400 text-sm mb-1">Downloads</div>
              <div className="text-2xl font-bold text-green-400">{stats.summary.downloads.toLocaleString()}</div>
            </div>
            <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
              <div className="text-gray-400 text-sm mb-1">Purchases</div>
              <div className="text-2xl font-bold text-yellow-400">{stats.summary.purchases.toLocaleString()}</div>
            </div>
            <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
              <div className="text-gray-400 text-sm mb-1">Revenue</div>
              <div className="text-2xl font-bold text-green-400">
                ${stats.summary.totalRevenue.toFixed(2)}
              </div>
            </div>
          </div>
        )}

        {/* Engagement Analytics */}
        {stats && stats.engagement && (
          <div className="mb-6">
            <h2 className="text-2xl font-bold mb-4">Engagement Analytics</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
              <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
                <div className="text-gray-400 text-sm mb-1">Total Sessions</div>
                <div className="text-2xl font-bold text-cyan-400">{stats.engagement.totalSessions.toLocaleString()}</div>
              </div>
              <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
                <div className="text-gray-400 text-sm mb-1">Avg Session Duration</div>
                <div className="text-2xl font-bold text-indigo-400">
                  {formatDuration(stats.engagement.avgSessionDuration)}
                </div>
              </div>
              <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
                <div className="text-gray-400 text-sm mb-1">Pages per Session</div>
                <div className="text-2xl font-bold text-pink-400">
                  {stats.engagement.avgPagesPerSession.toFixed(2)}
                </div>
              </div>
              <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
                <div className="text-gray-400 text-sm mb-1">Bounce Rate</div>
                <div className="text-2xl font-bold text-orange-400">
                  {stats.engagement.bounceRate.toFixed(1)}%
                </div>
              </div>
              <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
                <div className="text-gray-400 text-sm mb-1">Avg Time on Page</div>
                <div className="text-2xl font-bold text-teal-400">
                  {formatDuration(stats.engagement.avgTimeOnPage)}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
                <div className="text-gray-400 text-sm mb-1">Return Visitors</div>
                <div className="text-2xl font-bold text-blue-400">{stats.engagement.returnVisitors.toLocaleString()}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {stats.engagement.returnVisitorRate.toFixed(1)}% of total
                </div>
              </div>
              <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
                <div className="text-gray-400 text-sm mb-1">New Visitors</div>
                <div className="text-2xl font-bold text-green-400">{stats.engagement.newVisitors.toLocaleString()}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {(100 - stats.engagement.returnVisitorRate).toFixed(1)}% of total
                </div>
              </div>
              <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
                <div className="text-gray-400 text-sm mb-1">Engaged Sessions</div>
                <div className="text-2xl font-bold text-purple-400">{stats.engagement.engagedSessions.toLocaleString()}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {stats.engagement.engagementRate.toFixed(1)}% engagement rate
                </div>
              </div>
              <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
                <div className="text-gray-400 text-sm mb-1">Engagement Rate</div>
                <div className="text-2xl font-bold text-yellow-400">
                  {stats.engagement.engagementRate.toFixed(1)}%
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Sessions with interactions
                </div>
              </div>
              <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
                <div className="text-gray-400 text-sm mb-1">Total Visitors</div>
                <div className="text-2xl font-bold text-cyan-400">
                  {(stats.engagement.returnVisitors + stats.engagement.newVisitors).toLocaleString()}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Unique sessions
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Filters</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Event Type</label>
              <select
                value={filters.event_type}
                onChange={(e) => handleFilterChange('event_type', e.target.value)}
                className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
              >
                <option value="">All Events</option>
                <option value="page_view">Page Views</option>
                <option value="track_play">Track Plays</option>
                <option value="download">Downloads</option>
                <option value="purchase">Purchases</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Start Date</label>
              <input
                type="date"
                value={filters.start_date}
                onChange={(e) => handleFilterChange('start_date', e.target.value)}
                className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">End Date</label>
              <input
                type="date"
                value={filters.end_date}
                onChange={(e) => handleFilterChange('end_date', e.target.value)}
                className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={() => {
                  setFilters({ event_type: '', start_date: '', end_date: '' })
                  setPage(1)
                }}
                className="w-full bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>

        {/* Top Tracks and Pages */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Top Tracks</h2>
              {stats.topTracks.length === 0 ? (
                <div className="text-gray-400 text-center py-4">No track plays yet</div>
              ) : (
                <div className="space-y-2">
                  {stats.topTracks.map((track, index) => (
                    <div key={track.trackId} className="flex justify-between items-center py-2 border-b border-gray-800">
                      <div className="flex items-center space-x-3">
                        <span className="text-gray-500 w-6">{index + 1}.</span>
                        <span className="font-mono text-sm">{track.trackId}</span>
                      </div>
                      <span className="text-purple-400 font-semibold">{track.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Top Pages</h2>
              {stats.topPages.length === 0 ? (
                <div className="text-gray-400 text-center py-4">No page views yet</div>
              ) : (
                <div className="space-y-2">
                  {stats.topPages.map((page, index) => (
                    <div key={page.path} className="flex justify-between items-center py-2 border-b border-gray-800">
                      <div className="flex items-center space-x-3">
                        <span className="text-gray-500 w-6">{index + 1}.</span>
                        <span className="text-sm">{page.path}</span>
                      </div>
                      <span className="text-blue-400 font-semibold">{page.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Traffic Sources */}
        {stats && stats.traffic && (
          <div className="mb-6">
            <h2 className="text-2xl font-bold mb-4">Traffic Sources</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
                <h3 className="text-xl font-semibold mb-4">Traffic Sources</h3>
                {stats.traffic.sources.length === 0 ? (
                  <div className="text-gray-400 text-center py-4">No traffic source data yet</div>
                ) : (
                  <div className="space-y-2">
                    {stats.traffic.sources.map((source, index) => (
                      <div key={source.source} className="flex justify-between items-center py-2 border-b border-gray-800">
                        <div className="flex items-center space-x-3">
                          <span className="text-gray-500 w-6">{index + 1}.</span>
                          <span className="text-sm capitalize">{source.source}</span>
                        </div>
                        <span className="text-green-400 font-semibold">{source.count.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
                <h3 className="text-xl font-semibold mb-4">Top Referrers</h3>
                {stats.traffic.topReferrers.length === 0 ? (
                  <div className="text-gray-400 text-center py-4">No referrer data yet</div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {stats.traffic.topReferrers.map((referrer, index) => (
                      <div key={referrer.domain} className="flex justify-between items-center py-2 border-b border-gray-800">
                        <div className="flex items-center space-x-3">
                          <span className="text-gray-500 w-6">{index + 1}.</span>
                          <span className="text-sm">{referrer.domain}</span>
                        </div>
                        <span className="text-blue-400 font-semibold">{referrer.count.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Visitor Locations */}
        {stats && stats.locations && (
          <div className="mb-6">
            <h2 className="text-2xl font-bold mb-4">Visitor Locations</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
                <h3 className="text-xl font-semibold mb-4">Top Countries</h3>
                {stats.locations.topCountries.length === 0 ? (
                  <div className="text-gray-400 text-center py-4">No location data yet</div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {stats.locations.topCountries.map((country, index) => (
                      <div key={country.country} className="flex justify-between items-center py-2 border-b border-gray-800">
                        <div className="flex items-center space-x-3">
                          <span className="text-gray-500 w-6">{index + 1}.</span>
                          <span className="text-sm">{country.country}</span>
                        </div>
                        <span className="text-cyan-400 font-semibold">{country.count.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
                <h3 className="text-xl font-semibold mb-4">Top Cities</h3>
                {stats.locations.topCities.length === 0 ? (
                  <div className="text-gray-400 text-center py-4">No city data yet</div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {stats.locations.topCities.map((city, index) => (
                      <div key={city.city} className="flex justify-between items-center py-2 border-b border-gray-800">
                        <div className="flex items-center space-x-3">
                          <span className="text-gray-500 w-6">{index + 1}.</span>
                          <span className="text-sm">{city.city}</span>
                        </div>
                        <span className="text-pink-400 font-semibold">{city.count.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
                <h3 className="text-xl font-semibold mb-4">Top Regions</h3>
                {stats.locations.topRegions.length === 0 ? (
                  <div className="text-gray-400 text-center py-4">No region data yet</div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {stats.locations.topRegions.map((region, index) => (
                      <div key={region.region} className="flex justify-between items-center py-2 border-b border-gray-800">
                        <div className="flex items-center space-x-3">
                          <span className="text-gray-500 w-6">{index + 1}.</span>
                          <span className="text-sm">{region.region}</span>
                        </div>
                        <span className="text-indigo-400 font-semibold">{region.count.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Technology Analytics */}
        {stats && stats.technology && (
          <div className="mb-6">
            <h2 className="text-2xl font-bold mb-4">Technology</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
                <h3 className="text-xl font-semibold mb-4">Device Types</h3>
                {stats.technology.deviceTypes.length === 0 ? (
                  <div className="text-gray-400 text-center py-4">No device data yet</div>
                ) : (
                  <>
                    <div className="space-y-2 mb-4">
                      {stats.technology.deviceTypes.map((device, index) => {
                        const total = stats.technology!.deviceTypes.reduce((sum, d) => sum + d.count, 0)
                        const percentage = total > 0 ? ((device.count / total) * 100).toFixed(1) : 0
                        return (
                          <div key={device.deviceType} className="flex justify-between items-center py-2 border-b border-gray-800">
                            <div className="flex items-center space-x-3">
                              <span className="text-gray-500 w-6">{index + 1}.</span>
                              <span className="text-sm capitalize">{device.deviceType}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-cyan-400 font-semibold">{device.count.toLocaleString()}</span>
                              <span className="text-gray-500 text-xs">({percentage}%)</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    {stats.technology.deviceTypes.length > 0 && (
                      <ChartContainer className="h-64" minHeight={256}>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={stats.technology.deviceTypes.map(d => ({ name: d.deviceType, value: d.count }))}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                              outerRadius={80}
                              fill="#8884d8"
                              dataKey="value"
                            >
                              {stats.technology.deviceTypes.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b'][index % 4]} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </ChartContainer>
                    )}
                  </>
                )}
              </div>
              <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
                <h3 className="text-xl font-semibold mb-4">Browsers</h3>
                {stats.technology.browsers.length === 0 ? (
                  <div className="text-gray-400 text-center py-4">No browser data yet</div>
                ) : (
                  <>
                    <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
                      {stats.technology.browsers.map((browser, index) => (
                        <div key={browser.browser} className="flex justify-between items-center py-2 border-b border-gray-800">
                          <div className="flex items-center space-x-3">
                            <span className="text-gray-500 w-6">{index + 1}.</span>
                            <span className="text-sm">{browser.browser}</span>
                          </div>
                          <span className="text-green-400 font-semibold">{browser.count.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                    {stats.technology.browsers.length > 0 && (
                      <ChartContainer className="h-64" minHeight={256}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={stats.technology.browsers.slice(0, 5).map(b => ({ name: b.browser, value: b.count }))}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis dataKey="name" stroke="#9ca3af" fontSize={12} />
                            <YAxis stroke="#9ca3af" fontSize={12} />
                            <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }} />
                            <Bar dataKey="value" fill="#10b981" />
                          </BarChart>
                        </ResponsiveContainer>
                      </ChartContainer>
                    )}
                  </>
                )}
              </div>
              <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
                <h3 className="text-xl font-semibold mb-4">Operating Systems</h3>
                {stats.technology.operatingSystems.length === 0 ? (
                  <div className="text-gray-400 text-center py-4">No OS data yet</div>
                ) : (
                  <>
                    <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
                      {stats.technology.operatingSystems.map((os, index) => (
                        <div key={os.os} className="flex justify-between items-center py-2 border-b border-gray-800">
                          <div className="flex items-center space-x-3">
                            <span className="text-gray-500 w-6">{index + 1}.</span>
                            <span className="text-sm">{os.os}</span>
                          </div>
                          <span className="text-yellow-400 font-semibold">{os.count.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                    {stats.technology.operatingSystems.length > 0 && (
                      <ChartContainer className="h-64" minHeight={256}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={stats.technology.operatingSystems.slice(0, 5).map(o => ({ name: o.os, value: o.count }))}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis dataKey="name" stroke="#9ca3af" fontSize={12} angle={-45} textAnchor="end" height={80} />
                            <YAxis stroke="#9ca3af" fontSize={12} />
                            <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }} />
                            <Bar dataKey="value" fill="#eab308" />
                          </BarChart>
                        </ResponsiveContainer>
                      </ChartContainer>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Data Visualizations */}
        {stats && stats.eventsByDate && Object.keys(stats.eventsByDate).length > 0 && (
          <div className="mb-6">
            <h2 className="text-2xl font-bold mb-4">Trends Over Time</h2>
            <div className="grid grid-cols-1 gap-6">
              <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
                <h3 className="text-xl font-semibold mb-4">Page Views & Track Plays Over Time</h3>
                <ChartContainer className="h-80" minHeight={320}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={Object.entries(stats.eventsByDate)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([date, events]) => ({
                          date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                          pageViews: events.page_view || 0,
                          trackPlays: events.track_play || 0,
                        }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} />
                      <YAxis stroke="#9ca3af" fontSize={12} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="pageViews" stroke="#3b82f6" strokeWidth={2} name="Page Views" />
                      <Line type="monotone" dataKey="trackPlays" stroke="#8b5cf6" strokeWidth={2} name="Track Plays" />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </div>
            </div>
          </div>
        )}

        {/* Traffic Sources Chart */}
        {stats && stats.traffic && stats.traffic.sources.length > 0 && (
          <div className="mb-6">
            <h2 className="text-2xl font-bold mb-4">Traffic Sources Visualization</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
                <h3 className="text-xl font-semibold mb-4">Traffic Source Distribution</h3>
                <ChartContainer className="h-80" minHeight={320}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={stats.traffic.sources.map(s => ({ name: s.source, value: s.count }))}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {stats.traffic.sources.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][index % 5]}
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </div>
              {stats.locations && stats.locations.topCountries.length > 0 && (
                <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
                  <h3 className="text-xl font-semibold mb-4">Top Countries</h3>
                  <ChartContainer className="h-80" minHeight={320}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={stats.locations.topCountries.slice(0, 10).map(c => ({ name: c.country, value: c.count }))}
                        layout="vertical"
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis type="number" stroke="#9ca3af" fontSize={12} />
                        <YAxis dataKey="name" type="category" stroke="#9ca3af" fontSize={12} width={120} />
                        <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }} />
                        <Bar dataKey="value" fill="#06b6d4" />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </div>
              )}
            </div>
          </div>
        )}

        {/* SERGIK Production Analytics */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-4">🧬 Production Analytics</h2>
          <ProductionStats compact />
        </div>

        {/* Events Table */}
        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-semibold">Recent Events ({pagination.total})</h2>
            <button
              onClick={handleExport}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition"
            >
              Export CSV
            </button>
          </div>

          {loadingEvents ? (
            <div className="text-center py-12 text-gray-400">Loading events...</div>
          ) : events.length === 0 ? (
            <div className="text-center py-12 text-gray-400">No events found.</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left py-3 px-4 text-gray-400 font-semibold">Date</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-semibold">Event Type</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-semibold">Data</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-semibold">Session</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((event) => (
                      <tr
                        key={event.id}
                        className="border-b border-gray-800 hover:bg-gray-800/30 transition"
                      >
                        <td className="py-3 px-4 text-sm">
                          {new Date(event.created_at).toLocaleString()}
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-1 bg-purple-900/50 text-purple-400 rounded text-xs font-semibold">
                            {event.event_type}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <pre className="text-xs text-gray-400 max-w-md overflow-x-auto">
                            {JSON.stringify(event.event_data || {}, null, 2)}
                          </pre>
                        </td>
                        <td className="py-3 px-4 text-xs text-gray-400 font-mono">
                          {event.session_id?.substring(0, 16)}...
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
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
    </div>
  )
}
