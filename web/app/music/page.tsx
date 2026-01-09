'use client'

import { useState, useMemo } from 'react'
import releasesData from '@/data/releases.json'
import ReleaseCard from '@/components/ReleaseCard'

export default function Music() {
  const [filter, setFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'year' | 'type'>('year')

  const releases = useMemo(() => {
    let filtered = releasesData.releases

    // Filter by type
    if (filter !== 'all') {
      filtered = filtered.filter(release => release.type.toLowerCase() === filter.toLowerCase())
    }

    // Sort by year (newest first) or type
    filtered = [...filtered].sort((a, b) => {
      if (sortBy === 'year') {
        return b.year - a.year // Newest first
      } else {
        return a.type.localeCompare(b.type)
      }
    })

    return filtered
  }, [filter, sortBy])

  const releaseTypes = ['all', ...Array.from(new Set(releasesData.releases.map(r => r.type)))]

  return (
    <div className="pt-20 min-h-screen bg-black">
      <div className="container mx-auto px-4 py-16">
        <div className="mb-12">
          <h1 className="text-5xl md:text-6xl font-bold mb-4">Music</h1>
          <p className="text-gray-400 text-lg mb-8">
            All releases and discography
          </p>

          {/* Filters and Sort */}
          <div className="flex flex-wrap items-center gap-4 mb-8">
            <div className="flex items-center gap-2">
              <span className="text-gray-400 text-sm">Filter:</span>
              <div className="flex gap-2">
                {releaseTypes.map((type) => (
                  <button
                    key={type}
                    onClick={() => setFilter(type)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                      filter === type
                        ? 'bg-white text-black'
                        : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-gray-400 text-sm">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'year' | 'type')}
                className="bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-white"
              >
                <option value="year">Year (Newest First)</option>
                <option value="type">Type</option>
              </select>
            </div>

            <div className="ml-auto text-gray-400 text-sm">
              Showing {releases.length} of {releasesData.releases.length} releases
            </div>
          </div>
        </div>
        
        {releases.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {releases.map((release) => (
              <ReleaseCard key={release.id} release={release} />
            ))}
          </div>
        ) : (
          <div className="text-center py-20">
            <p className="text-gray-400 text-lg">No releases found.</p>
          </div>
        )}
      </div>
    </div>
  )
}
