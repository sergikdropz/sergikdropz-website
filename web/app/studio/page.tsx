'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Link from 'next/link'
import { FaUpload, FaCompactDisc, FaRocket, FaCheckCircle, FaClock, FaDatabase } from 'react-icons/fa'

export default function StudioDashboard() {
  const { user, isAdmin, loading } = useAuth()
  const router = useRouter()
  const [stats, setStats] = useState({
    totalTracks: 0,
    totalReleases: 0,
    pendingDistributions: 0,
    liveReleases: 0,
  })
  const [loadingStats, setLoadingStats] = useState(true)

  useEffect(() => {
    if (isAdmin) {
      fetchStats()
    }
  }, [isAdmin])

  async function fetchStats() {
    try {
      setLoadingStats(true)
      
      // Fetch stats from Studio API
      const [tracksRes, releasesRes] = await Promise.all([
        fetch('/api/studio/tracks').catch(() => null),
        fetch('/api/studio/releases').catch(() => null),
      ])

      if (tracksRes?.ok) {
        const tracksData = await tracksRes.json()
        setStats((prev) => ({ ...prev, totalTracks: tracksData.tracks?.length || 0 }))
      }

      if (releasesRes?.ok) {
        const releasesData = await releasesRes.json()
        const releases = releasesData.releases || []
        setStats((prev) => ({
          ...prev,
          totalReleases: releases.length,
          pendingDistributions: releases.filter((r: any) => r.distributor_status === 'draft').length,
          liveReleases: releases.filter((r: any) => r.distributor_status === 'live').length,
        }))
      }
    } catch (error) {
      console.error('Error fetching Studio stats:', error)
    } finally {
      setLoadingStats(false)
    }
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

  const studioSections = [
    {
      title: 'Upload Track',
      description: 'Upload WAV file, add metadata, and assign ISRC',
      href: '/studio/tracks/new',
      icon: FaUpload,
      color: 'from-blue-600 to-cyan-600',
    },
    {
      title: 'Create Release',
      description: 'Package tracks into a release for distribution',
      href: '/studio/releases/new',
      icon: FaCompactDisc,
      color: 'from-purple-600 to-indigo-600',
    },
    {
      title: 'View Releases',
      description: 'Manage releases and distribution status',
      href: '/studio/releases',
      icon: FaRocket,
      color: 'from-pink-600 to-rose-600',
    },
    {
      title: 'SoundExchange',
      description: 'Submit ISRCs to SoundExchange (US ISRC Agency) and view submission history',
      href: '/studio/soundexchange',
      icon: FaDatabase,
      color: 'from-green-600 to-emerald-600',
    },
  ]

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-7xl mx-auto">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
            <div className="text-gray-400 text-sm mb-1">Total Tracks</div>
            <div className="text-3xl font-bold">{stats.totalTracks}</div>
          </div>
          <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
            <div className="text-gray-400 text-sm mb-1">Total Releases</div>
            <div className="text-3xl font-bold text-blue-400">{stats.totalReleases}</div>
          </div>
          <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
            <div className="text-gray-400 text-sm mb-1">Pending Distribution</div>
            <div className="text-3xl font-bold text-yellow-400">{stats.pendingDistributions}</div>
          </div>
          <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
            <div className="text-gray-400 text-sm mb-1">Live Releases</div>
            <div className="text-3xl font-bold text-green-400">{stats.liveReleases}</div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {studioSections.map((section) => {
              const Icon = section.icon
              return (
                <Link
                  key={section.href}
                  href={section.href}
                  className="bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-700 rounded-lg p-6 hover:border-purple-500 transition-all duration-200 transform hover:scale-[1.02] group relative overflow-hidden"
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${section.color} opacity-0 group-hover:opacity-10 transition-opacity duration-200`}></div>
                  <div className="relative z-10">
                    <Icon className="text-4xl mb-4 text-gray-400 group-hover:text-purple-400 transition" />
                    <h3 className="text-xl font-semibold mb-2 group-hover:text-purple-400 transition">
                      {section.title}
                    </h3>
                    <p className="text-gray-400 text-sm">{section.description}</p>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>

        {/* Distribution Pipeline Status */}
        {stats.pendingDistributions > 0 && (
          <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-6 mb-8">
            <div className="flex items-center gap-2 mb-2">
              <FaClock className="text-yellow-400" />
              <h3 className="font-semibold">Pending Distributions</h3>
            </div>
            <p className="text-gray-400 text-sm">
              You have {stats.pendingDistributions} release{stats.pendingDistributions !== 1 ? 's' : ''} ready for distribution.
            </p>
            <Link
              href="/studio/releases?filter=pending"
              className="mt-4 inline-block bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg text-sm transition"
            >
              View Pending Releases
            </Link>
          </div>
        )}

        {/* Recent Activity Placeholder */}
        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
          <h3 className="text-xl font-semibold mb-4">Distribution Pipeline</h3>
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-sm">
              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              <span className="text-gray-400">Upload Track</span>
              <span className="text-gray-600">→</span>
              <span className="text-gray-400">Assign ISRC</span>
              <span className="text-gray-600">→</span>
              <span className="text-gray-400">Create Release</span>
              <span className="text-gray-600">→</span>
              <span className="text-gray-400">Distribute</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
