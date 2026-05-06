'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useNotifications } from '@/contexts/NotificationContext'
import Link from 'next/link'
import { 
  FaUpload, 
  FaCompactDisc, 
  FaSync, 
  FaCheckCircle, 
  FaExclamationTriangle,
  FaClock,
  FaRocket,
  FaSearch,
  FaBolt,
  FaDatabase
} from 'react-icons/fa'
import CommandPalette from '@/components/CommandPalette'
import { ProductionStatsCompact } from '@/components/music/ProductionStats'

export default function AdminDashboard() {
  const { user, isAdmin, loading } = useAuth()
  const { showNotification } = useNotifications()
  const router = useRouter()
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [quickActions, setQuickActions] = useState<any[]>([])
  const [healthStatus, setHealthStatus] = useState({
    database: 'healthy',
    storage: 'healthy',
    apis: 'healthy',
  })
  const [pendingTasks, setPendingTasks] = useState({
    tracksNeedingAnalysis: 0,
    releasesPendingDistribution: 0,
    failedUploads: 0,
  })
  const [recentActivity, setRecentActivity] = useState<any[]>([])
  const [stats, setStats] = useState({
    // Audio Files
    totalTracks: 0,
    purchasableTracks: 0,
    analyzedTracks: 0,
    sonicDNATracks: 0,
    pendingAnalysis: 0,
    processingAnalysis: 0,
    // Purchases
    totalPurchases: 0,
    totalRevenue: 0,
    // Instagram
    instagramPosts: 0,
    instagramActive: 0,
    instagramImages: 0,
    instagramVideos: 0,
    // Music Library
    libraryFolders: 0,
    libraryFoldersVisible: 0,
    libraryFoldersHidden: 0,
    libraryTracks: 0,  // Unique tracks (deduplicated by audio_file_id)
    libraryTracksEntries: 0,  // Total entries (includes duplicates in playlists)
    // Gallery (legacy)
    galleryImages: 0,
    // Analytics
    analyticsTotal: 0,
    analyticsToday: 0,
    // Activity Logs
    activityLogsTotal: 0,
    activityLogsToday: 0,
    // Shop
    activeMembers: 0,
    monthlyRecurringRevenue: 0,
    totalSubscribers: 0,
    activeSubscribers: 0,
    merchOrders: 0,
    merchRevenue: 0,
    totalTips: 0,
    tipRevenue: 0,
    totalLicenses: 0,
    licenseRevenue: 0,
    // Legacy
    totalEvents: 0,
    lastUpdated: null as string | null,
    // Sonic DNA Coverage
    sonicDnaCoverage: 0,
    tracksWithSonicDna: 0,
    tracksWithBpm: 0,
    tracksWithKey: 0,
    tracksWithWaveform: 0,
    uniqueArtists: 0,
    trackPlays: 0,
  })
  const [loadingStats, setLoadingStats] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [lastSyncResult, setLastSyncResult] = useState<any>(null)

  useEffect(() => {
    // Only redirect after loading is complete to avoid race conditions
    if (loading) return
    
    if (!user || !isAdmin) {
      router.push('/admin/login')
    }
  }, [user, isAdmin, loading, router])

  useEffect(() => {
    if (isAdmin) {
      fetchStats()
      fetchQuickActions()
      fetchPendingTasks()
      fetchRecentActivity()
      checkHealthStatus()
    }
  }, [isAdmin])

  // Keyboard shortcut for command palette
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setShowCommandPalette(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  async function fetchQuickActions() {
    const actions = []
    
    if (pendingTasks.tracksNeedingAnalysis > 0) {
      actions.push({
        label: `Analyze ${pendingTasks.tracksNeedingAnalysis} Pending Tracks`,
        icon: FaBolt,
        action: () => router.push('/admin/sonic-dna?filter=pending'),
        color: 'from-yellow-600 to-orange-600',
        urgent: true,
      })
    }

    if (pendingTasks.releasesPendingDistribution > 0) {
      actions.push({
        label: `Distribute ${pendingTasks.releasesPendingDistribution} Releases`,
        icon: FaRocket,
        action: () => router.push('/studio/releases?filter=pending'),
        color: 'from-purple-600 to-pink-600',
        urgent: true,
      })
    }

    actions.push(
      {
        label: 'Upload New Track',
        icon: FaUpload,
        action: () => router.push('/admin/music?action=upload'),
        color: 'from-blue-600 to-cyan-600',
      },
      {
        label: 'Create Release',
        icon: FaCompactDisc,
        action: () => router.push('/admin/releases?action=new'),
        color: 'from-purple-600 to-indigo-600',
      },
      {
        label: 'Sync All Stats',
        icon: FaDatabase,
        action: handleSyncAllStats,
        color: 'from-cyan-600 to-teal-600',
      },
      {
        label: 'Sync to Production',
        icon: FaSync,
        action: handleSyncToProduction,
        color: 'from-green-600 to-emerald-600',
      }
    )

    setQuickActions(actions)
  }

  async function fetchPendingTasks() {
    try {
      const res = await fetch('/api/admin/pending-tasks')
      if (res.ok) {
        const data = await res.json()
        setPendingTasks(data)
      }
    } catch (error) {
      console.error('Error fetching pending tasks:', error)
    }
  }

  async function fetchRecentActivity() {
    try {
      const res = await fetch('/api/admin/recent-activity?limit=10')
      if (res.ok) {
        const data = await res.json()
        setRecentActivity(data.activities || [])
      }
    } catch (error) {
      console.error('Error fetching recent activity:', error)
    }
  }

  async function checkHealthStatus() {
    try {
      const res = await fetch('/api/admin/health')
      if (res.ok) {
        const data = await res.json()
        setHealthStatus(data)
      }
    } catch (error) {
      console.error('Error checking health:', error)
    }
  }

  async function handleSyncToProduction() {
    if (!confirm('Sync all changes to production?')) return
    
    try {
      const res = await fetch('/api/admin/sync-production', { method: 'POST' })
      if (res.ok) {
        showNotification('Sync started! Check status in logs.', 'success')
      } else {
        showNotification('Sync failed. Please try again.', 'error')
      }
    } catch (error) {
      showNotification('Sync error. Please try again.', 'error')
    }
  }

  async function handleSyncAllStats() {
    if (syncing) return
    
    try {
      setSyncing(true)
      showNotification('Syncing all system statistics...', 'info')
      
      const res = await fetch('/api/admin/sync-all-stats', { method: 'POST' })
      const data = await res.json()
      
      if (res.ok && data.success) {
        setLastSyncResult(data)
        showNotification(`Sync complete! Updated ${data.sync.sonicDna.updated} sonic DNA, ${data.sync.trackFields.updated} track fields, ${data.sync.folderCounts.updated} folders.`, 'success')
        // Refresh stats after sync
        fetchStats()
      } else {
        showNotification(data.error || 'Sync failed. Please try again.', 'error')
      }
    } catch (error) {
      showNotification('Sync error. Please try again.', 'error')
    } finally {
      setSyncing(false)
    }
  }

  // Update quick actions when pending tasks change
  useEffect(() => {
    if (isAdmin) {
      fetchQuickActions()
    }
  }, [pendingTasks, isAdmin])

  async function fetchStats() {
    try {
      setLoadingStats(true)
      
      // Fetch comprehensive stats from Supabase
      const statsRes = await fetch('/api/admin/stats').catch(() => null)
      
      if (statsRes && statsRes.ok) {
        const statsData = await statsRes.json()
        const s = statsData.stats || {}
        
        setStats({
          // Audio Files
          totalTracks: s.audioFiles?.total || 0,
          purchasableTracks: s.audioFiles?.purchasable || 0,
          analyzedTracks: s.audioFiles?.analyzed || 0,
          sonicDNATracks: s.audioFiles?.sonicDNACompleted || 0,
          pendingAnalysis: s.audioFiles?.pending || 0,
          processingAnalysis: s.audioFiles?.processing || 0,
          // Purchases
          totalPurchases: s.purchases?.total || 0,
          totalRevenue: s.purchases?.totalRevenue || 0,
          // Instagram
          instagramPosts: s.instagram?.total || 0,
          instagramActive: s.instagram?.active || 0,
          instagramImages: s.instagram?.images || 0,
          instagramVideos: s.instagram?.videos || 0,
          // Music Library
          libraryFolders: s.musicLibrary?.folders?.total || 0,
          libraryFoldersVisible: s.musicLibrary?.folders?.visible || 0,
          libraryFoldersHidden: s.musicLibrary?.folders?.hidden || 0,
          libraryTracks: s.musicLibrary?.tracks || 0,  // Unique (deduplicated)
          libraryTracksEntries: s.musicLibrary?.totalEntries || s.musicLibrary?.tracks || 0,
          // Analytics
          analyticsTotal: s.analytics?.totalEvents || 0,
          analyticsToday: s.analytics?.eventsToday || 0,
          // Activity Logs
          activityLogsTotal: s.activityLogs?.total || 0,
          activityLogsToday: s.activityLogs?.today || 0,
          // Legacy (fallback)
          galleryImages: 0,
          totalEvents: s.analytics?.totalEvents || 0,
          lastUpdated: statsData.timestamp || new Date().toISOString(),
          // Sonic DNA Coverage
          sonicDnaCoverage: s.sonicDnaCoverage?.percent || 0,
          tracksWithSonicDna: s.musicLibrary?.tracksWithSonicDna || 0,
          tracksWithBpm: s.musicLibrary?.tracksWithBpm || 0,
          tracksWithKey: s.musicLibrary?.tracksWithKey || 0,
          tracksWithWaveform: s.musicLibrary?.tracksWithWaveform || 0,
          uniqueArtists: s.musicLibrary?.uniqueArtists || 0,
          trackPlays: s.analytics?.trackPlays || 0,
          // Shop & Monetization (populated by separate fetch below, except tips & licenses)
          activeMembers: 0,
          monthlyRecurringRevenue: 0,
          totalSubscribers: 0,
          activeSubscribers: 0,
          merchOrders: 0,
          merchRevenue: 0,
          totalTips: s.tips?.total || 0,
          tipRevenue: s.tips?.totalRevenue || 0,
          totalLicenses: s.licenses?.total || 0,
          licenseRevenue: s.licenses?.totalRevenue || 0,
        })
      } else {
        // Fallback to legacy endpoints if new API fails
        const [tracksRes, galleryRes, purchasesRes, analyticsRes] = await Promise.all([
          fetch('/api/audio/list?limit=1&include_count=true').catch(() => null),
          fetch('/api/gallery/list').catch(() => null),
          fetch('/api/admin/purchases/stats').catch(() => null),
          fetch('/api/analytics/stats').catch(() => null),
        ])

        if (tracksRes) {
          const tracksData = await tracksRes.json()
          setStats((prev) => ({ ...prev, totalTracks: tracksData.total || tracksData.files?.length || 0 }))
        }

        if (galleryRes) {
          const galleryData = await galleryRes.json()
          setStats((prev) => ({ ...prev, galleryImages: galleryData.images?.length || 0 }))
        }

        if (purchasesRes) {
          const purchasesData = await purchasesRes.json()
          setStats((prev) => ({
            ...prev,
            totalPurchases: purchasesData.summary?.totalPurchases || 0,
            totalRevenue: purchasesData.summary?.totalRevenue || 0,
          }))
        }

        if (analyticsRes) {
          const analyticsData = await analyticsRes.json()
          setStats((prev) => ({
            ...prev,
            totalEvents: analyticsData.summary?.totalEvents || 0,
          }))
        }

        setStats((prev) => ({ ...prev, lastUpdated: new Date().toISOString() }))
      }

      // Fetch shop stats in parallel
      try {
        const [membershipsRes, subscribersRes, merchRes] = await Promise.allSettled([
          fetch('/api/admin/memberships'),
          fetch('/api/admin/subscribers'),
          fetch('/api/admin/merch/orders'),
        ])

        if (membershipsRes.status === 'fulfilled' && membershipsRes.value.ok) {
          const data = await membershipsRes.value.json()
          const memberships = data.memberships || []
          const active = memberships.filter((m: any) => m.status === 'active')
          const planPrices: Record<string, number> = { supporter: 499, 'inner-circle': 1499 }
          const mrr = active.reduce((sum: number, m: any) => sum + (planPrices[m.plan_id] || 0), 0)
          setStats((prev) => ({
            ...prev,
            activeMembers: active.length,
            monthlyRecurringRevenue: mrr / 100,
          }))
        }

        if (subscribersRes.status === 'fulfilled' && subscribersRes.value.ok) {
          const data = await subscribersRes.value.json()
          const subs = data.subscribers || []
          setStats((prev) => ({
            ...prev,
            totalSubscribers: subs.length,
            activeSubscribers: subs.filter((s: any) => s.is_active).length,
          }))
        }

        if (merchRes.status === 'fulfilled' && merchRes.value.ok) {
          const data = await merchRes.value.json()
          const orders = data.orders || []
          setStats((prev) => ({
            ...prev,
            merchOrders: orders.length,
            merchRevenue: orders.reduce((s: number, o: any) => s + (o.total || 0), 0) / 100,
          }))
        }
      } catch (shopError) {
        console.error('Error fetching shop stats:', shopError)
      }
    } catch (error) {
      console.error('Error fetching stats:', error)
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

  const adminSections = [
    {
      title: 'Music',
      description: 'Unified music management: upload, structure, and organize tracks',
      href: '/admin/music',
      icon: '🎵',
      color: 'from-purple-600 to-pink-600',
    },
    {
      title: 'Releases',
      description: 'Manage discography and streaming releases',
      href: '/admin/releases',
      icon: '💿',
      color: 'from-purple-600 to-indigo-600',
    },
    {
      title: 'Studio',
      description: 'Distribution workflow: upload tracks, assign ISRCs, and distribute to DSPs',
      href: '/studio',
      icon: '🚀',
      color: 'from-purple-600 to-pink-600',
      featured: true,
    },
    {
      title: 'Sonic DNA',
      description: 'Audio analysis and Sonic DNA management',
      href: '/admin/sonic-dna',
      icon: '🧬',
      color: 'from-cyan-600 to-blue-600',
    },
    {
      title: 'Video Uploader',
      description: 'Upload and manage video content',
      href: '/admin/videos',
      icon: '🎬',
      color: 'from-blue-600 to-cyan-600',
    },
    {
      title: 'Videos Manager',
      description: 'Manage YouTube videos and video metadata',
      href: '/admin/videos-manager',
      icon: '📹',
      color: 'from-red-600 to-orange-600',
    },
    {
      title: 'Instagram',
      description: 'Homepage feed toggle, Instagram Helper tools, and post URLs',
      href: '/admin/instagram',
      icon: '📸',
      color: 'from-pink-600 to-rose-600',
    },
    {
      title: 'Gallery Uploader',
      description: 'Upload and manage gallery images',
      href: '/admin/gallery',
      icon: '🖼️',
      color: 'from-green-600 to-emerald-600',
    },
    {
      title: 'Events & Performances',
      description: 'Manage events, festivals, and venues',
      href: '/admin/events',
      icon: '🎤',
      color: 'from-orange-600 to-red-600',
    },
    {
      title: 'Artist Info',
      description: 'Edit artist bio, contact, and metadata',
      href: '/admin/artist',
      icon: '👤',
      color: 'from-teal-600 to-cyan-600',
    },
    {
      title: 'Purchasable Tracks',
      description: 'Manage tracks available for purchase',
      href: '/admin/purchasable-tracks',
      icon: '💰',
      color: 'from-green-600 to-lime-600',
    },
    {
      title: 'Bundles',
      description: 'Bundle deals and discounted product packages',
      href: '/admin/bundles',
      icon: '📦',
      color: 'from-green-600 to-emerald-600',
    },
    {
      title: 'Memberships',
      description: 'Fan subscriptions, MRR tracking, and member management',
      href: '/admin/memberships',
      icon: '⭐',
      color: 'from-yellow-600 to-amber-600',
    },
    {
      title: 'Merch Store',
      description: 'Printful print-on-demand merch, product sync, and order fulfillment',
      href: '/admin/merch',
      icon: '👕',
      color: 'from-pink-600 to-rose-600',
    },
    {
      title: 'Licenses',
      description: 'Beat license management, tier analytics, and revenue tracking',
      href: '/admin/licenses',
      icon: '📜',
      color: 'from-purple-600 to-violet-600',
    },
    {
      title: 'Email Subscribers',
      description: 'Manage mailing list subscribers from free downloads and tips',
      href: '/admin/subscribers',
      icon: '📧',
      color: 'from-blue-600 to-indigo-600',
    },
    {
      title: 'Analytics',
      description: 'View site analytics and statistics',
      href: '/admin/analytics',
      icon: '📊',
      color: 'from-yellow-600 to-orange-600',
    },
    {
      title: 'Settings',
      description: 'Configure site settings',
      href: '/admin/settings',
      icon: '⚙️',
      color: 'from-indigo-600 to-purple-600',
    },
  ]

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header with Command Palette */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2">Admin Dashboard</h1>
            <p className="text-gray-400">Welcome back, {user.email}</p>
          </div>
          <button
            onClick={() => setShowCommandPalette(true)}
            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg border border-gray-700 text-sm transition"
          >
            <FaSearch />
            <span>Quick Actions</span>
            <kbd className="px-2 py-1 bg-gray-900 rounded text-xs">⌘K</kbd>
          </button>
        </div>

        {/* Health Status Bar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className={`p-4 rounded-lg border ${
            healthStatus.database === 'healthy' 
              ? 'bg-green-900/20 border-green-700' 
              : 'bg-red-900/20 border-red-700'
          }`}>
            <div className="flex items-center gap-2">
              {healthStatus.database === 'healthy' ? (
                <FaCheckCircle className="text-green-400" />
              ) : (
                <FaExclamationTriangle className="text-red-400" />
              )}
              <span className="font-medium">Database</span>
            </div>
            <div className="text-sm text-gray-400 mt-1">
              {healthStatus.database === 'healthy' ? 'Connected' : 'Disconnected'}
            </div>
          </div>
          <div className={`p-4 rounded-lg border ${
            healthStatus.storage === 'healthy' 
              ? 'bg-green-900/20 border-green-700' 
              : 'bg-red-900/20 border-red-700'
          }`}>
            <div className="flex items-center gap-2">
              {healthStatus.storage === 'healthy' ? (
                <FaCheckCircle className="text-green-400" />
              ) : (
                <FaExclamationTriangle className="text-red-400" />
              )}
              <span className="font-medium">Storage</span>
            </div>
            <div className="text-sm text-gray-400 mt-1">
              {healthStatus.storage === 'healthy' ? 'Operational' : 'Issues'}
            </div>
          </div>
          <div className={`p-4 rounded-lg border ${
            healthStatus.apis === 'healthy' 
              ? 'bg-green-900/20 border-green-700' 
              : 'bg-red-900/20 border-red-700'
          }`}>
            <div className="flex items-center gap-2">
              {healthStatus.apis === 'healthy' ? (
                <FaCheckCircle className="text-green-400" />
              ) : (
                <FaExclamationTriangle className="text-red-400" />
              )}
              <span className="font-medium">APIs</span>
            </div>
            <div className="text-sm text-gray-400 mt-1">
              {healthStatus.apis === 'healthy' ? 'All Connected' : 'Some Down'}
            </div>
          </div>
        </div>

        {/* Pending Tasks Alert */}
        {(pendingTasks.tracksNeedingAnalysis > 0 || 
          pendingTasks.releasesPendingDistribution > 0 || 
          pendingTasks.failedUploads > 0) && (
          <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <FaClock className="text-yellow-400" />
              <h3 className="font-semibold">Pending Tasks</h3>
            </div>
            <div className="grid grid-cols-3 gap-4 text-sm">
              {pendingTasks.tracksNeedingAnalysis > 0 && (
                <div>
                  <span className="text-gray-400">Tracks needing analysis:</span>
                  <span className="ml-2 font-bold text-yellow-400">
                    {pendingTasks.tracksNeedingAnalysis}
                  </span>
                </div>
              )}
              {pendingTasks.releasesPendingDistribution > 0 && (
                <div>
                  <span className="text-gray-400">Releases pending:</span>
                  <span className="ml-2 font-bold text-yellow-400">
                    {pendingTasks.releasesPendingDistribution}
                  </span>
                </div>
              )}
              {pendingTasks.failedUploads > 0 && (
                <div>
                  <span className="text-gray-400">Failed uploads:</span>
                  <span className="ml-2 font-bold text-red-400">
                    {pendingTasks.failedUploads}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Quick Actions */}
        {quickActions.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-4">Quick Actions</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {quickActions.map((action, idx) => {
                const Icon = action.icon
                return (
                  <button
                    key={idx}
                    onClick={action.action}
                    className={`bg-gradient-to-br ${action.color} p-6 rounded-lg hover:scale-105 transition-transform text-left ${
                      action.urgent ? 'ring-2 ring-yellow-400' : ''
                    }`}
                  >
                    <Icon className="text-3xl mb-3" />
                    <div className="font-semibold text-lg">{action.label}</div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* SERGIK Production DNA Stats */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-4">🧬 SERGIK Production DNA</h2>
          <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
            <ProductionStatsCompact />
            <p className="text-xs text-gray-500 mt-4 text-center">
              Production statistics from SERGIK catalog • 2015-present
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {adminSections.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className={`bg-gray-900/50 backdrop-blur-sm border rounded-lg p-6 hover:border-purple-500 transition-all duration-200 transform hover:scale-[1.02] group relative overflow-hidden ${
                section.featured 
                  ? 'border-purple-500 ring-2 ring-purple-500/20' 
                  : 'border-gray-800'
              }`}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${section.color} opacity-0 group-hover:opacity-10 transition-opacity duration-200`}></div>
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-4">
                  <div className="text-4xl">{section.icon}</div>
                  {section.featured && (
                    <span className="text-xs bg-purple-600 text-white px-2 py-1 rounded">NEW</span>
                  )}
                </div>
                <h2 className="text-xl font-semibold mb-2 group-hover:text-purple-400 transition">
                  {section.title}
                </h2>
                <p className="text-gray-400 text-sm">{section.description}</p>
              </div>
            </Link>
          ))}
        </div>

        {/* Comprehensive Stats from Supabase */}
        <div className="mt-8 space-y-6">
          {/* Audio Files Stats */}
          <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">🎵 Audio Files</h2>
              <button
                onClick={fetchStats}
                className="text-gray-400 hover:text-white text-sm transition"
              >
                Refresh
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div>
                <div className="text-gray-400 text-sm">Total Tracks</div>
                <div className="text-2xl font-bold">{stats.totalTracks.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-gray-400 text-sm">Purchasable</div>
                <div className="text-2xl font-bold text-green-400">{stats.purchasableTracks.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-gray-400 text-sm">Analyzed</div>
                <div className="text-2xl font-bold text-blue-400">{stats.analyzedTracks.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-gray-400 text-sm">Sonic DNA</div>
                <div className="text-2xl font-bold text-purple-400">{stats.sonicDNATracks.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-gray-400 text-sm">Pending</div>
                <div className="text-2xl font-bold text-yellow-400">{stats.pendingAnalysis.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-gray-400 text-sm">Processing</div>
                <div className="text-2xl font-bold text-orange-400">{stats.processingAnalysis.toLocaleString()}</div>
              </div>
            </div>
          </div>

          {/* Sonic DNA Coverage */}
          <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">🧬 Sonic DNA Coverage</h2>
              <button
                onClick={handleSyncAllStats}
                disabled={syncing}
                className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm transition ${
                  syncing 
                    ? 'bg-gray-700 text-gray-400 cursor-wait' 
                    : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                }`}
              >
                <FaSync className={syncing ? 'animate-spin' : ''} />
                {syncing ? 'Syncing...' : 'Sync All'}
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div>
                <div className="text-gray-400 text-sm">Coverage</div>
                <div className={`text-2xl font-bold ${
                  stats.sonicDnaCoverage >= 80 ? 'text-green-400' :
                  stats.sonicDnaCoverage >= 50 ? 'text-yellow-400' : 'text-red-400'
                }`}>{stats.sonicDnaCoverage}%</div>
              </div>
              <div>
                <div className="text-gray-400 text-sm">With Sonic DNA</div>
                <div className="text-2xl font-bold text-purple-400">{stats.tracksWithSonicDna.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-gray-400 text-sm">With BPM</div>
                <div className="text-2xl font-bold text-blue-400">{stats.tracksWithBpm.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-gray-400 text-sm">With Key</div>
                <div className="text-2xl font-bold text-green-400">{stats.tracksWithKey.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-gray-400 text-sm">With Waveform</div>
                <div className="text-2xl font-bold text-cyan-400">{stats.tracksWithWaveform.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-gray-400 text-sm">Unique Artists</div>
                <div className="text-2xl font-bold text-orange-400">{stats.uniqueArtists.toLocaleString()}</div>
              </div>
            </div>
            {/* Progress Bar */}
            <div className="mt-4">
              <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-purple-500 to-cyan-500 transition-all duration-500"
                  style={{ width: `${stats.sonicDnaCoverage}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>{stats.tracksWithSonicDna} / {stats.libraryTracks} unique tracks</span>
                <span>{Math.max(0, stats.libraryTracks - stats.tracksWithSonicDna)} remaining</span>
              </div>
            </div>
          </div>

          {/* Music Library Stats */}
          <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">📂 Music Library Structure</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-gray-400 text-sm">Total Folders</div>
                <div className="text-2xl font-bold">{stats.libraryFolders.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-gray-400 text-sm">Visible Folders</div>
                <div className="text-2xl font-bold text-blue-400">{stats.libraryFoldersVisible.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-gray-400 text-sm">Hidden Folders</div>
                <div className="text-2xl font-bold text-yellow-400">{stats.libraryFoldersHidden.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-gray-400 text-sm">Unique Tracks</div>
                <div className="text-2xl font-bold text-green-400">{stats.libraryTracks.toLocaleString()}</div>
                {stats.libraryTracksEntries > stats.libraryTracks && (
                  <div className="text-xs text-gray-500">{stats.libraryTracksEntries} entries</div>
                )}
              </div>
            </div>
          </div>

          {/* Purchases & Revenue */}
          <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">💰 Purchases</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-gray-400 text-sm">Total Purchases</div>
                <div className="text-2xl font-bold">{stats.totalPurchases.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-gray-400 text-sm">Total Revenue</div>
                <div className="text-2xl font-bold text-green-400">${stats.totalRevenue.toFixed(2)}</div>
              </div>
            </div>
          </div>

          {/* Shop Stats */}
          <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">🛒 Shop & Monetization</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
              <div>
                <div className="text-gray-400 text-sm">Active Members</div>
                <div className="text-2xl font-bold text-purple-400">{stats.activeMembers.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-gray-400 text-sm">MRR</div>
                <div className="text-2xl font-bold text-green-400">${stats.monthlyRecurringRevenue.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-gray-400 text-sm">Email Subscribers</div>
                <div className="text-2xl font-bold text-blue-400">{stats.activeSubscribers.toLocaleString()}</div>
                {stats.totalSubscribers > stats.activeSubscribers && (
                  <div className="text-xs text-gray-500">{stats.totalSubscribers} total</div>
                )}
              </div>
              <div>
                <div className="text-gray-400 text-sm">Merch Orders</div>
                <div className="text-2xl font-bold text-pink-400">{stats.merchOrders.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-gray-400 text-sm">Merch Revenue</div>
                <div className="text-2xl font-bold text-pink-400">${stats.merchRevenue.toFixed(2)}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 mt-4 pt-4 border-t border-gray-800">
              <div>
                <div className="text-gray-400 text-sm">Total Tips</div>
                <div className="text-2xl font-bold text-green-400">{stats.totalTips.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-gray-400 text-sm">Tip Revenue</div>
                <div className="text-2xl font-bold text-green-400">${stats.tipRevenue.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-gray-400 text-sm">Total Licenses</div>
                <div className="text-2xl font-bold text-purple-400">{stats.totalLicenses.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-gray-400 text-sm">License Revenue</div>
                <div className="text-2xl font-bold text-purple-400">${stats.licenseRevenue.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-gray-400 text-sm">Total Revenue</div>
                <div className="text-2xl font-bold text-green-400">${(stats.totalRevenue + stats.merchRevenue + stats.monthlyRecurringRevenue + stats.tipRevenue + stats.licenseRevenue).toFixed(2)}</div>
              </div>
            </div>
          </div>

          {/* Instagram Stats */}
          <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">📸 Instagram Media</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-gray-400 text-sm">Total Posts</div>
                <div className="text-2xl font-bold">{stats.instagramPosts.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-gray-400 text-sm">Active Posts</div>
                <div className="text-2xl font-bold text-green-400">{stats.instagramActive.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-gray-400 text-sm">Images</div>
                <div className="text-2xl font-bold text-blue-400">{stats.instagramImages.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-gray-400 text-sm">Videos</div>
                <div className="text-2xl font-bold text-red-400">{stats.instagramVideos.toLocaleString()}</div>
              </div>
            </div>
          </div>

          {/* Analytics & Activity Logs */}
          <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">📊 Analytics & Activity</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div>
                <div className="text-gray-400 text-sm">Analytics Events</div>
                <div className="text-2xl font-bold">{stats.analyticsTotal.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-gray-400 text-sm">Events Today</div>
                <div className="text-2xl font-bold text-blue-400">{stats.analyticsToday.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-gray-400 text-sm">Track Plays</div>
                <div className="text-2xl font-bold text-purple-400">{stats.trackPlays.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-gray-400 text-sm">Activity Logs</div>
                <div className="text-2xl font-bold">{stats.activityLogsTotal.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-gray-400 text-sm">Logs Today</div>
                <div className="text-2xl font-bold text-green-400">{stats.activityLogsToday.toLocaleString()}</div>
              </div>
            </div>
          </div>

          {/* Last Updated */}
          <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-4">
            <div className="flex justify-between items-center">
              <div className="text-gray-400 text-sm">Last Updated</div>
              <div className="text-sm font-medium">
                {stats.lastUpdated
                  ? new Date(stats.lastUpdated).toLocaleString()
                  : 'Never'}
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="mt-8">
          <h2 className="text-2xl font-bold mb-4">Recent Activity</h2>
          <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
            {recentActivity.length > 0 ? (
              <div className="space-y-3">
                {recentActivity.map((activity: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-3 text-sm">
                    <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                    <span className="text-gray-400">{activity.timestamp}</span>
                    <span>{activity.description}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-gray-400 text-center py-8">No recent activity</div>
            )}
          </div>
        </div>

        {/* Command Palette Modal */}
        {showCommandPalette && (
          <CommandPalette 
            onClose={() => setShowCommandPalette(false)}
            onAction={(action) => {
              action()
              setShowCommandPalette(false)
            }}
          />
        )}
      </div>
    </div>
  )
}
