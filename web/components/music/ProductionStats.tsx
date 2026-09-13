'use client'

import { useMemo } from 'react'
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import ChartContainer from '@/components/ChartContainer'

// Import static data - this can be replaced with API call later
import artistDataJson from '@/data/sergik_artist_data.json'

interface ProductionStatsProps {
  showTimeline?: boolean
  showGenreDna?: boolean
  showCollaborators?: boolean
  showBpmProfile?: boolean
  compact?: boolean
}

export function ProductionStats({
  showTimeline = true,
  showGenreDna = true,
  showCollaborators = true,
  showBpmProfile = true,
  compact = false,
}: ProductionStatsProps) {
  const data = artistDataJson as any

  // Production timeline chart data
  const timelineData = useMemo(() => {
    return (data.productionTimeline || [])
      .sort((a: any, b: any) => a.year - b.year)
      .map((item: any) => ({
        year: item.year.toString(),
        projects: item.projects,
      }))
  }, [data])

  // Genre DNA pie chart data
  const genreData = useMemo(() => {
    return (data.musicalDna?.genreDna || []).map((item: any) => ({
      name: item.genre,
      value: item.percentage,
      color: item.color,
    }))
  }, [data])

  // BPM zones bar chart data
  const bpmData = useMemo(() => {
    return (data.musicalDna?.bpmProfile?.zones || []).map((zone: any) => ({
      name: zone.label.replace('/', '\n'),
      value: zone.percentage,
      color: zone.color,
    }))
  }, [data])

  // Top collaborators
  const topCollaborators = useMemo(() => {
    return (data.collaborators || []).slice(0, 5)
  }, [data])

  const stats = data.catalogStats || {}

  return (
    <div className="space-y-6">
      {/* Quick Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-4">
          <div className="text-gray-400 text-sm mb-1">Total Projects</div>
          <div className="text-2xl font-bold text-white">
            {(stats.totalAbletonProjects || 0).toLocaleString()}
          </div>
          <div className="text-xs text-gray-500 mt-1">Ableton Live</div>
        </div>
        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-4">
          <div className="text-gray-400 text-sm mb-1">Finished Tracks</div>
          <div className="text-2xl font-bold text-emerald-400">
            {(stats.finishedExports || 0).toLocaleString()}
          </div>
          <div className="text-xs text-gray-500 mt-1">Exported</div>
        </div>
        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-4">
          <div className="text-gray-400 text-sm mb-1">Collaborators</div>
          <div className="text-2xl font-bold text-violet-400">
            {(stats.uniqueCollaborators || 0).toLocaleString()}
          </div>
          <div className="text-xs text-gray-500 mt-1">Artists</div>
        </div>
        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-4">
          <div className="text-gray-400 text-sm mb-1">Average BPM</div>
          <div className="text-2xl font-bold text-blue-400">
            {Math.round(data.musicalDna?.bpmProfile?.averageBpm || 0)}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Sweet spot: {data.musicalDna?.bpmProfile?.sweetSpot?.min || 120}-
            {data.musicalDna?.bpmProfile?.sweetSpot?.max || 127}
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className={`grid ${compact ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'} gap-6`}>
        {/* Production Timeline */}
        {showTimeline && timelineData.length > 0 && (
          <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4 text-white">Production Timeline</h3>
            <ChartContainer
              className={compact ? 'h-48' : 'h-64'}
              minHeight={compact ? 192 : 256}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={timelineData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="year" stroke="#9ca3af" fontSize={12} />
                  <YAxis stroke="#9ca3af" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1f2937',
                      border: '1px solid #374151',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: '#fff' }}
                  />
                  <Bar 
                    dataKey="projects" 
                    fill="#8b5cf6" 
                    radius={[4, 4, 0, 0]}
                    name="Projects"
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>
        )}

        {/* Genre DNA */}
        {showGenreDna && genreData.length > 0 && (
          <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4 text-white">Genre DNA</h3>
            <ChartContainer
              className={compact ? 'h-48' : 'h-64'}
              minHeight={compact ? 192 : 256}
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={genreData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) =>
                      `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                    }
                    outerRadius={compact ? 60 : 80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {genreData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1f2937',
                      border: '1px solid #374151',
                      borderRadius: '8px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>
        )}
      </div>

      {/* BPM Profile & Collaborators Row */}
      <div className={`grid ${compact ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'} gap-6`}>
        {/* BPM Profile */}
        {showBpmProfile && bpmData.length > 0 && (
          <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4 text-white">BPM Distribution</h3>
            <ChartContainer
              className={compact ? 'h-48' : 'h-64'}
              minHeight={compact ? 192 : 256}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bpmData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis type="number" stroke="#9ca3af" fontSize={12} unit="%" />
                  <YAxis
                    dataKey="name"
                    type="category"
                    stroke="#9ca3af"
                    fontSize={10}
                    width={80}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1f2937',
                      border: '1px solid #374151',
                      borderRadius: '8px',
                    }}
                    formatter={(value) => [`${value ?? 0}%`, 'Percentage']}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {bpmData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>
        )}

        {/* Top Collaborators */}
        {showCollaborators && topCollaborators.length > 0 && (
          <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4 text-white">Top Collaborators</h3>
            <div className="space-y-3">
              {topCollaborators.map((collab: any, index: number) => (
                <div
                  key={collab.name}
                  className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-gray-500 w-6 text-sm">{index + 1}.</span>
                    <div>
                      <span className="font-medium text-white">{collab.name}</span>
                      {collab.influence && (
                        <p className="text-xs text-gray-500 mt-0.5">{collab.influence}</p>
                      )}
                    </div>
                  </div>
                  <span className="text-indigo-400 font-semibold">
                    {collab.projects.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Key Profile */}
      <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4 text-white">Key Preferences (Camelot)</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {(data.musicalDna?.keyProfile?.camelot || []).map((key: any) => (
            <div
              key={key.key}
              className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg"
            >
              <div>
                <span
                  className={`font-mono font-bold ${
                    key.key.includes('B') ? 'text-emerald-400' : 'text-violet-400'
                  }`}
                >
                  {key.key}
                </span>
                <p className="text-xs text-gray-400">{key.musicalKey}</p>
              </div>
              <span className="text-lg font-semibold text-white">{key.percentage}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * Compact version for dashboard cards
 */
export function ProductionStatsCompact() {
  const data = artistDataJson as any
  const stats = data.catalogStats || {}
  const timeline = data.productionTimeline || []
  const peakYear = timeline.reduce(
    (max: any, y: any) => (y.projects > max.projects ? y : max),
    { year: 0, projects: 0 }
  )

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="text-center p-3 bg-gray-800/30 rounded-lg">
        <div className="text-2xl font-bold text-white">
          {(stats.totalAbletonProjects || 0).toLocaleString()}
        </div>
        <div className="text-xs text-gray-400">Projects</div>
      </div>
      <div className="text-center p-3 bg-gray-800/30 rounded-lg">
        <div className="text-2xl font-bold text-emerald-400">
          {stats.finishedExports || 0}
        </div>
        <div className="text-xs text-gray-400">Tracks</div>
      </div>
      <div className="text-center p-3 bg-gray-800/30 rounded-lg">
        <div className="text-2xl font-bold text-violet-400">
          {stats.uniqueCollaborators || 0}
        </div>
        <div className="text-xs text-gray-400">Collabs</div>
      </div>
      <div className="text-center p-3 bg-gray-800/30 rounded-lg">
        <div className="text-2xl font-bold text-blue-400">{peakYear.year}</div>
        <div className="text-xs text-gray-400">Peak Year</div>
      </div>
    </div>
  )
}

export default ProductionStats
