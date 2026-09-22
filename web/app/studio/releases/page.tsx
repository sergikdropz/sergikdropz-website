'use client'

import { useCallback, useState } from 'react'
import { useAuth } from '@/contexts/AdminAuthContext'
import { useNotifications } from '@/contexts/NotificationContext'
import Link from 'next/link'
import StudioPageShell from '@/components/studio/StudioPageShell'
import StudioReleaseCard from '@/components/studio/StudioReleaseCard'
import ReleaseCalendarPanel from '@/components/studio/ReleaseCalendarPanel'
import { useStudioReleases } from '@/lib/api/studio-hooks'
import { FaPlus, FaSync } from 'react-icons/fa'
import { studioCreateHref } from '@/lib/studio/studio-ia'

type ReleaseFilter = 'pending' | 'all' | 'live' | 'calendar'

export default function ReleasesPage() {
  const { user, isAdmin, loading } = useAuth()
  const { showNotification } = useNotifications()
  const [filter, setFilter] = useState<ReleaseFilter>('pending')
  const {
    data: queryReleases = [],
    isLoading: loadingReleases,
    refetch,
  } = useStudioReleases(
    filter === 'pending' ? 'pending' : null,
    Boolean(isAdmin) && filter !== 'calendar',
  )

  const [migrating, setMigrating] = useState(false)

  const releases =
    filter === 'live'
      ? queryReleases.filter((r) => r.distributor_status === 'live')
      : filter === 'pending'
        ? queryReleases
        : filter === 'calendar'
          ? []
          : queryReleases

  const migrateLegacy = useCallback(async () => {
    setMigrating(true)
    try {
      const res = await fetch('/api/studio/releases/migrate-scheduled', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Migration failed')
      const created = (data.results || []).filter((r: { action: string }) => r.action === 'created').length
      const linked = (data.results || []).filter((r: { action: string }) => r.action === 'linked').length
      showNotification(
        `Migrated ${created + linked} EP(s) to pending (${created} new, ${linked} refreshed)`,
        'success',
      )
      setFilter('pending')
      await refetch()
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'Migration failed', 'error')
    } finally {
      setMigrating(false)
    }
  }, [refetch, showNotification])

  if (loading || (loadingReleases && filter !== 'calendar')) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-white text-xl">Loading...</div>
      </div>
    )
  }

  if (!user || !isAdmin) {
    return null
  }

  const filters: { id: ReleaseFilter; label: string }[] = [
    { id: 'pending', label: 'Pending' },
    { id: 'all', label: 'All' },
    { id: 'live', label: 'Live' },
    { id: 'calendar', label: 'Calendar' },
  ]

  return (
    <StudioPageShell
      title="Releases"
      subtitle="Pending drafts through go-live — vault catalog, rights, copy, delivery"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void migrateLegacy()}
            disabled={migrating}
            className="inline-flex items-center gap-2 border border-zinc-700 hover:border-violet-500/50 text-zinc-200 px-4 py-2.5 rounded-full text-sm font-medium transition disabled:opacity-50"
            title="Import leftover schedule stubs into pending Release Studio packages"
          >
            <FaSync className={migrating ? 'animate-spin' : ''} />
            {migrating ? 'Migrating…' : 'Migrate schedule → pending'}
          </button>
          <Link
            href={studioCreateHref('release')}
            className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-5 py-2.5 rounded-full text-sm font-semibold transition"
          >
            <FaPlus />
            New release
          </Link>
        </div>
      }
    >
      <div className="flex gap-2 mb-6 flex-wrap">
        {filters.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              filter === item.id
                ? 'bg-purple-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {filter === 'calendar' ? (
        <ReleaseCalendarPanel />
      ) : releases.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {releases.map((release) => (
            <StudioReleaseCard key={release.id} release={release} />
          ))}
        </div>
      ) : (
        <div className="text-center py-16 text-gray-400">
          <p className="mb-4">
            {filter === 'pending'
              ? 'No pending releases — migrate the old schedule or create one from a vault EP'
              : 'No releases found'}
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <button
              type="button"
              onClick={() => void migrateLegacy()}
              disabled={migrating}
              className="text-violet-400 hover:text-violet-300 disabled:opacity-50"
            >
              {migrating ? 'Migrating…' : 'Migrate schedule → pending'}
            </button>
            <Link href={studioCreateHref('release')} className="text-purple-400 hover:text-purple-300">
              Create release
            </Link>
          </div>
        </div>
      )}
    </StudioPageShell>
  )
}
