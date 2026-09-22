'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNotifications } from '@/contexts/NotificationContext'
import Link from 'next/link'
import {
  FaRocket,
  FaSpinner,
  FaEnvelope,
  FaLink,
  FaCopy,
  FaCheckCircle,
  FaExternalLinkAlt,
} from 'react-icons/fa'
import SocialPromoPanel from './SocialPromoPanel'
import type { IntegrationTone } from '@/lib/studio/pipeline-integrations'
import type {
  MarketingPhase,
  MarketingPipelineAlerts,
  MarketingPipelineRow,
} from '@/lib/studio/marketing-pipeline'
import { studioCollabHref, studioReleaseHref } from '@/lib/studio/studio-ia'

const TONE_CLASS: Record<IntegrationTone, string> = {
  ok: 'bg-emerald-950/40 text-emerald-300 ring-1 ring-emerald-800/50',
  warn: 'bg-amber-950/35 text-amber-200 ring-1 ring-amber-800/50',
  bad: 'bg-red-950/40 text-red-300 ring-1 ring-red-800/50',
  muted: 'bg-zinc-900 text-zinc-500 ring-1 ring-zinc-800',
}

const PHASE_FILTERS: Array<{ id: 'all' | MarketingPhase; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'needs_launch', label: 'Needs launch' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'date_tbd', label: 'Date TBD' },
  { id: 'past_undelivered', label: 'Past undelivered' },
  { id: 'live', label: 'Live' },
]

const PHASE_BADGE: Record<MarketingPhase, string> = {
  needs_launch: 'bg-amber-950/40 text-amber-200 ring-1 ring-amber-800/50',
  upcoming: 'bg-sky-950/40 text-sky-200 ring-1 ring-sky-800/50',
  date_tbd: 'bg-zinc-900 text-zinc-300 ring-1 ring-zinc-700',
  past_undelivered: 'bg-red-950/40 text-red-200 ring-1 ring-red-800/50',
  live: 'bg-emerald-950/40 text-emerald-200 ring-1 ring-emerald-800/50',
}

function phaseLabel(phase: MarketingPhase): string {
  switch (phase) {
    case 'needs_launch':
      return 'Needs launch'
    case 'upcoming':
      return 'Upcoming'
    case 'date_tbd':
      return 'Date TBD'
    case 'past_undelivered':
      return 'Past undelivered'
    case 'live':
      return 'Live'
  }
}

export default function MarketingPipelinePanel() {
  const { showNotification } = useNotifications()
  const [releases, setReleases] = useState<MarketingPipelineRow[]>([])
  const [alerts, setAlerts] = useState<MarketingPipelineAlerts | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<Record<string, string>>({})
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | MarketingPhase>('all')
  const [expandedPromoId, setExpandedPromoId] = useState<string | null>(null)

  const loadPipeline = useCallback(async () => {
    try {
      setIsLoading(true)
      const res = await fetch('/api/studio/release-pipeline')
      if (!res.ok) throw new Error('Failed to load pipeline')
      const data = await res.json()
      setReleases(data.releases || [])
      setAlerts(data.alerts || null)
    } catch (error) {
      console.error('Error loading pipeline:', error)
      showNotification('Failed to load release pipeline', 'error')
    } finally {
      setIsLoading(false)
    }
  }, [showNotification])

  useEffect(() => {
    loadPipeline()
  }, [loadPipeline])

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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to create campaign'
      showNotification(message, 'error')
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to create smart link'
      showNotification(message, 'error')
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Launch failed'
      showNotification(message, 'error')
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

  const filtered = useMemo(() => {
    if (filter === 'all') return releases
    return releases.filter((row) => row.phase === filter)
  }, [filter, releases])

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <FaSpinner className="animate-spin text-3xl text-violet-400" />
      </div>
    )
  }

  if (releases.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-12 text-center">
        <FaRocket className="mx-auto text-3xl text-zinc-600 mb-4" />
        <p className="text-zinc-400">No releases in the marketing pipeline yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {alerts && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-9 gap-3">
          <div className="rounded-lg border border-amber-900/50 bg-amber-950/20 p-3">
            <p className="text-xs text-amber-300">Needs launch</p>
            <p className="text-lg font-semibold">{alerts.needs_launch_count}</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
            <p className="text-xs text-zinc-400">Date TBD</p>
            <p className="text-lg font-semibold">{alerts.date_tbd_count}</p>
          </div>
          <div className="rounded-lg border border-sky-900/50 bg-sky-950/20 p-3">
            <p className="text-xs text-sky-300">Missing campaign</p>
            <p className="text-lg font-semibold">{alerts.missing_campaign_count}</p>
          </div>
          <div className="rounded-lg border border-violet-900/50 bg-violet-950/20 p-3">
            <p className="text-xs text-violet-300">Missing smart link</p>
            <p className="text-lg font-semibold">{alerts.missing_smart_link_count}</p>
          </div>
          <div className="rounded-lg border border-fuchsia-900/50 bg-fuchsia-950/20 p-3">
            <p className="text-xs text-fuchsia-300">Press gaps</p>
            <p className="text-lg font-semibold">{alerts.missing_press_count}</p>
          </div>
          <div className="rounded-lg border border-teal-900/50 bg-teal-950/20 p-3">
            <p className="text-xs text-teal-300">Stores empty</p>
            <p className="text-lg font-semibold">{alerts.stores_empty_count}</p>
          </div>
          <div className="rounded-lg border border-orange-900/50 bg-orange-950/20 p-3">
            <p className="text-xs text-orange-300">DSP ingest gaps</p>
            <p className="text-lg font-semibold">{alerts.dsp_gap_count}</p>
          </div>
          <div className="rounded-lg border border-pink-900/50 bg-pink-950/20 p-3">
            <p className="text-xs text-pink-300">No promo plan</p>
            <p className="text-lg font-semibold">{alerts.missing_promo_plan_count ?? 0}</p>
          </div>
          <div className="rounded-lg border border-emerald-900/50 bg-emerald-950/20 p-3">
            <p className="text-xs text-emerald-300">Collab pending</p>
            <p className="text-lg font-semibold">{alerts.collab_pending_count}</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Marketing phase filter">
        {PHASE_FILTERS.map((item) => {
          const active = filter === item.id
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(item.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                active
                  ? 'bg-violet-600/25 text-violet-100'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/80'
              }`}
            >
              {item.label}
            </button>
          )
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center text-zinc-500 text-sm">
          No releases in this filter.
        </div>
      ) : (
        filtered.map((release) => {
          const needsMarketing = !release.campaign || !release.smart_link_data
          const isLaunchLoading = !!actionLoading[`launch-${release.id}`]
          const isCampaignLoading = !!actionLoading[`campaign-${release.id}`]
          const isLinkLoading = !!actionLoading[`link-${release.id}`]

          return (
            <div
              key={release.id}
              className={`bg-gray-900 border rounded-lg p-5 transition ${
                release.phase === 'needs_launch'
                  ? 'border-amber-600/40'
                  : release.phase === 'past_undelivered'
                    ? 'border-red-800/50'
                    : 'border-gray-800'
              }`}
            >
              <div className="flex items-start gap-5 flex-wrap lg:flex-nowrap">
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
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={studioReleaseHref(release.id, 'launch')}
                        className="text-lg font-semibold truncate hover:text-violet-300"
                      >
                        {release.title}
                      </Link>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded ${PHASE_BADGE[release.phase]}`}
                      >
                        {phaseLabel(release.phase)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-400">
                      {release.type}
                      {release.genre ? ` · ${release.genre}` : ''}
                      {release.album_artist ? ` · ${release.album_artist}` : ''}
                      {release.track_count ? ` · ${release.track_count} tracks` : ''}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                      <span>{release.date_label}</span>
                      <span
                        className={
                          release.phase === 'live'
                            ? 'text-emerald-400 font-semibold'
                            : release.phase === 'past_undelivered'
                              ? 'text-red-300 font-semibold'
                              : 'text-violet-300 font-semibold'
                        }
                      >
                        {release.countdown_label}
                      </span>
                      {release.distributor_status ? (
                        <span className="uppercase tracking-wide">
                          {release.distributor_status}
                        </span>
                      ) : null}
                      {release.upc ? <span>UPC {release.upc}</span> : null}
                      {release.copyright ? (
                        <span>{release.copyright.readiness_score}% rights</span>
                      ) : null}
                      {release.slate_date &&
                      release.slate_date !== release.release_date ? (
                        <span title="Calendar slate date">Slate {release.slate_date}</span>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {release.integrations.map((chip) => (
                        <span
                          key={chip.id}
                          title={`${chip.label}: ${chip.detail}`}
                          className={`text-[10px] px-1.5 py-0.5 rounded ${TONE_CLASS[chip.tone]}`}
                        >
                          {chip.label}: {chip.detail}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-amber-200/90 pt-1">
                      Next:{' '}
                      <Link href={release.next_action.href} className="underline hover:text-amber-100">
                        {release.next_action.label}
                      </Link>
                    </p>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1 flex-shrink-0 text-xs">
                  <div className="flex items-center gap-2">
                    <FaEnvelope className="text-gray-500" />
                    {release.campaign ? (
                      <span className="px-2 py-1 rounded bg-green-900/40 text-green-300">
                        {release.campaign.status}
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded bg-gray-800 text-gray-400">No campaign</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <FaLink className="text-gray-500" />
                    {release.smart_link_data ? (
                      <span className="px-2 py-1 rounded bg-green-900/40 text-green-300">
                        {release.smart_link_data.total_clicks} clicks
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded bg-gray-800 text-gray-400">No link</span>
                    )}
                  </div>
                  <p className="text-zinc-500 pt-1">
                    Live {release.store_live_count ?? 0}
                    {release.store_link_count > (release.store_live_count ?? 0)
                      ? ` · ${release.store_link_count} linked`
                      : ''}
                    {release.target_store_count
                      ? ` / ${release.target_store_count} targeted`
                      : ''}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end max-w-md">
                  <Link
                    href={studioReleaseHref(release.id, 'copy')}
                    className="bg-gray-800 hover:bg-gray-700 text-white px-3 py-2 rounded-lg text-sm transition"
                  >
                    Press / copy
                  </Link>
                  <Link
                    href={studioReleaseHref(release.id, 'delivery')}
                    className="bg-gray-800 hover:bg-gray-700 text-white px-3 py-2 rounded-lg text-sm transition"
                  >
                    DSP connect
                  </Link>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedPromoId((prev) => (prev === release.id ? null : release.id))
                    }
                    className={`px-3 py-2 rounded-lg text-sm transition ${
                      expandedPromoId === release.id
                        ? 'bg-pink-600/30 text-pink-100 border border-pink-500/40'
                        : 'bg-gray-800 hover:bg-gray-700 text-white'
                    }`}
                  >
                    Social promo
                    {release.social_promo?.has_plan
                      ? ` (${release.social_promo.posted}/${release.social_promo.total})`
                      : ''}
                  </button>
                  {(release.collab.collaboratorCount || 0) > 0 ? (
                    <Link
                      href={studioCollabHref(release.id)}
                      className="bg-gray-800 hover:bg-gray-700 text-teal-200 px-3 py-2 rounded-lg text-sm transition"
                    >
                      Collab
                      {release.collab.pendingReviews
                        ? ` (${release.collab.pendingReviews})`
                        : ''}
                    </Link>
                  ) : null}

                  {needsMarketing && release.phase !== 'live' && (
                    <button
                      onClick={() => launchAll(release.id)}
                      disabled={isLaunchLoading}
                      className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2"
                    >
                      {isLaunchLoading ? <FaSpinner className="animate-spin" /> : <FaRocket />}
                      Launch All
                    </button>
                  )}

                  {!release.campaign && !needsMarketing && (
                    <button
                      onClick={() => createCampaign(release.id)}
                      disabled={isCampaignLoading}
                      className="bg-gray-800 hover:bg-gray-700 text-white px-3 py-2 rounded-lg text-sm transition flex items-center gap-2"
                    >
                      {isCampaignLoading ? <FaSpinner className="animate-spin" /> : <FaEnvelope />}
                      Campaign
                    </button>
                  )}

                  {!release.smart_link_data && release.campaign && (
                    <button
                      onClick={() => createSmartLink(release.id)}
                      disabled={isLinkLoading}
                      className="bg-gray-800 hover:bg-gray-700 text-white px-3 py-2 rounded-lg text-sm transition flex items-center gap-2"
                    >
                      {isLinkLoading ? <FaSpinner className="animate-spin" /> : <FaLink />}
                      Smart Link
                    </button>
                  )}

                  {release.campaign && (
                    <Link
                      href="/admin/nurturing/campaigns"
                      className="text-blue-400 hover:text-blue-300 p-2 transition"
                      title="View Campaign"
                    >
                      <FaExternalLinkAlt />
                    </Link>
                  )}

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

                  {release.campaign && release.smart_link_data ? (
                    <FaCheckCircle className="text-green-400 ml-1" title="Marketing ready" />
                  ) : null}
                </div>
              </div>

              {expandedPromoId === release.id ? (
                <div className="mt-4 pt-4 border-t border-zinc-800">
                  <SocialPromoPanel
                    releaseId={release.id}
                    title={release.title}
                    artworkUrl={release.artwork}
                    artist={release.album_artist}
                    streetDate={release.release_date}
                    compact
                    onChanged={loadPipeline}
                  />
                </div>
              ) : null}
            </div>
          )
        })
      )}
    </div>
  )
}
