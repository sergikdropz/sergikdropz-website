'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  DSP_STORES,
  allDspStoreIds,
  dspStoreLabel,
  type DspStoreId,
} from '@/lib/studio/constants'
import { formatISRCDisplay } from '@/lib/studio/isrc-format'
import { generateInternalUpc } from '@/lib/studio/upc'
import { parseAppleMusicArtistId, parseFacebookPage, parseInstagramHandle, parseSpotifyArtistId, parseYoutubeChannelId } from '@/lib/studio/dsp-package'
import { artistAlreadyOnStoreCards, type ArtistMatchField } from '@/lib/artist-platforms'
import {
  buildDspCoverage,
  formatDspCoverageSummary,
  type DspCoverage,
  type DspCoverageKind,
} from '@/lib/studio/dsp-connect'
import {
  formatDspVerifySummary,
  isDspVerificationStatus,
  isReleaseLiveOnStore,
  verificationLabel,
  type DspVerificationStatus,
  type DspVerifySummary,
} from '@/lib/studio/dsp-verify'
import type { RightsActionFocus } from '@/lib/studio/rights-action-target'
import Link from 'next/link'
import { FaCheckCircle, FaExternalLinkAlt, FaLink, FaMagic, FaPlus, FaRocket, FaTrash, FaSync } from 'react-icons/fa'
import StreamContinuityPanel from './StreamContinuityPanel'

export type StoreLinkRow = {
  id: string
  store: string
  url: string
  verification_status?: string | null
  verification_detail?: string | null
  verified_at?: string | null
}

type ConnectProviders = {
  odesli: boolean
  spotify: boolean
  apple?: boolean
  deezer?: boolean
  youtube: boolean
  musicbrainz?: boolean
}

type Props = {
  releaseId: string
  title: string
  upc?: string | null
  spotifyArtistId?: string | null
  appleArtistId?: string | null
  youtubeArtistId?: string | null
  instagramHandle?: string | null
  facebookPageId?: string | null
  isrcs?: string[]
  targetStores: DspStoreId[]
  storeLinks: StoreLinkRow[]
  onTargetsChange: (stores: DspStoreId[]) => void
  onPackageChange?: (partial: {
    upc?: string
    spotify_artist_id?: string
    apple_artist_id?: string
    youtube_artist_id?: string
    instagram_handle?: string
    facebook_page_id?: string
  }) => void
  onAddLink: (store: string, url: string) => void
  onRemoveLink: (id: string) => void
  onConnected?: () => void
  previouslyReleased?: boolean | null
  focusRequest?: RightsActionFocus | null
  onFocusHandled?: () => void
  /** When true, release is already live on SERGIK (self distribute / go-live). */
  isLive?: boolean
}

export default function DspDeliveryBoard({
  releaseId,
  title,
  upc,
  spotifyArtistId,
  appleArtistId,
  youtubeArtistId,
  instagramHandle,
  facebookPageId,
  isrcs = [],
  targetStores,
  storeLinks,
  onTargetsChange,
  onPackageChange,
  onAddLink,
  onRemoveLink,
  onConnected,
  previouslyReleased,
  focusRequest = null,
  onFocusHandled,
  isLive = false,
}: Props) {
  useEffect(() => {
    if (!focusRequest || focusRequest.step !== 'delivery') return
    if (focusRequest.section !== 'artist_profiles') {
      onFocusHandled?.()
      return
    }
    const el = document.querySelector('[data-delivery-section="artist-profiles"]') as HTMLElement | null
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const input = el?.querySelector('input') as HTMLElement | null
    input?.focus?.({ preventScroll: true })
    onFocusHandled?.()
  }, [focusRequest, onFocusHandled])

  const [newStore, setNewStore] = useState<DspStoreId>(DSP_STORES[0].id)
  const [newUrl, setNewUrl] = useState('')
  const [pasteFocus, setPasteFocus] = useState(0)
  const [seedUrl, setSeedUrl] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [distributing, setDistributing] = useState(false)
  const [checkingStatus, setCheckingStatus] = useState(false)
  const [generatingDspArt, setGeneratingDspArt] = useState(false)
  const [dspArtInfo, setDspArtInfo] = useState<{
    artwork_dsp_url?: string | null
    site?: { width?: number; height?: number; ok?: boolean; issues?: string[]; error?: string } | null
    dsp?: { width?: number; height?: number; ok?: boolean; issues?: string[]; error?: string } | null
  } | null>(null)
  const [storeMatrix, setStoreMatrix] = useState<
    Array<{
      store: string
      name: string
      targeted: boolean
      queueable: boolean
      honesty: string
      note?: string
      deliveryStatus?: string | null
    }>
  >([])
  const [readiness, setReadiness] = useState<{
    mastersOk?: boolean
    isrcOk?: boolean
    upcOk?: boolean
    dspCoverOk?: boolean
    siteArtOk?: boolean
    curatedQueueable?: number
    targetedUnsupported?: number
    dryRunOnly?: boolean
  } | null>(null)
  const [masters, setMasters] = useState<{
    trackCount: number
    withIsrc: number
    withMaster: number
    missingMaster: string[]
    nonLossless: string[]
  } | null>(null)
  const [aggregatorHealth, setAggregatorHealth] = useState<{
    label: string
    dryRun: boolean
    available: boolean
  } | null>(null)
  const [preflightBlockers, setPreflightBlockers] = useState<string[]>([])
  const [preflightWarnings, setPreflightWarnings] = useState<string[]>([])
  const [preflightChecklist, setPreflightChecklist] = useState<
    Array<{ id: string; label: string; href?: string; done?: boolean }>
  >([])
  const [deliveryRights, setDeliveryRights] = useState({
    streaming: true,
    download: true,
    ugc: true,
    beatport_enabled: false,
    track_origin_original: false,
    linking_fields_acknowledged: false,
  })
  const [liveOnSergik, setLiveOnSergik] = useState(isLive)
  const [verifySummary, setVerifySummary] = useState<DspVerifySummary | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [distMessage, setDistMessage] = useState<string | null>(null)
  const [distError, setDistError] = useState<string | null>(null)

  useEffect(() => {
    setLiveOnSergik(isLive)
  }, [isLive, releaseId])

  function applyAggregatorPayload(data: Record<string, unknown>) {
    const health = data.health as { label?: string; dryRun?: boolean; available?: boolean } | undefined
    if (health) {
      setAggregatorHealth({
        label: String(health.label || 'unavailable'),
        dryRun: Boolean(health.dryRun),
        available: Boolean(health.available),
      })
    }
    const preflight = data.preflight as {
      blockers?: string[]
      warnings?: string[]
      checklist?: Array<{ id: string; label: string; href?: string; done?: boolean }>
      rights?: typeof deliveryRights
    } | undefined
    if (preflight) {
      setPreflightBlockers(preflight.blockers || [])
      setPreflightWarnings(preflight.warnings || [])
      setPreflightChecklist(preflight.checklist || [])
    }
    const rights = (data.rights || preflight?.rights) as Partial<typeof deliveryRights> | undefined
    if (rights) {
      setDeliveryRights((prev) => ({ ...prev, ...rights }))
    }
    if (Array.isArray(data.storeMatrix)) {
      setStoreMatrix(data.storeMatrix as typeof storeMatrix)
    }
    if (data.readiness && typeof data.readiness === 'object') {
      setReadiness(data.readiness as NonNullable<typeof readiness>)
    }
    if (data.masters && typeof data.masters === 'object') {
      setMasters(data.masters as NonNullable<typeof masters>)
    }
    const preflightArt = data.preflight as
      | {
          artworkProbe?: {
            site?: {
              width?: number
              height?: number
              ok?: boolean
              issues?: string[]
              error?: string
            } | null
            dsp?: {
              width?: number
              height?: number
              ok?: boolean
              issues?: string[]
              error?: string
            } | null
          }
        }
      | undefined
    const artProbe = preflightArt?.artworkProbe
    if (typeof data.artwork_dsp_url === 'string' || data.artwork_dsp_url === null || artProbe) {
      setDspArtInfo((prev) => ({
        ...(prev || {}),
        artwork_dsp_url:
          typeof data.artwork_dsp_url === 'string' || data.artwork_dsp_url === null
            ? (data.artwork_dsp_url as string | null)
            : prev?.artwork_dsp_url ?? null,
        site: artProbe?.site ?? prev?.site ?? null,
        dsp: artProbe?.dsp ?? prev?.dsp ?? null,
      }))
    }
  }

  async function refreshDspArtwork() {
    const res = await fetch(`/api/studio/releases/${releaseId}/dsp-artwork`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return
    setDspArtInfo({
      artwork_dsp_url: data.artwork_dsp_url || null,
      site: data.site || null,
      dsp: data.dsp || null,
    })
  }

  async function generateDspCover(force = false) {
    setGeneratingDspArt(true)
    setDistError(null)
    setDistMessage(null)
    try {
      const res = await fetch(`/api/studio/releases/${releaseId}/dsp-artwork`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'DSP cover failed')
      setDspArtInfo({
        artwork_dsp_url: data.dsp?.url || null,
        site: data.source || null,
        dsp: {
          width: data.dsp?.width,
          height: data.dsp?.height,
          ok: true,
          issues: [],
        },
      })
      setDistMessage(
        `DSP cover ${data.dsp?.reusedExisting ? 'reused' : 'written'} · ${data.dsp?.width}×${data.dsp?.height} · site artwork unchanged`
      )
      await refreshAggregator()
    } catch (err) {
      setDistError(err instanceof Error ? err.message : 'DSP cover failed')
    } finally {
      setGeneratingDspArt(false)
    }
  }

  async function refreshAggregator() {
    const res = await fetch(`/api/studio/releases/${releaseId}/distribute`)
    const data = await res.json().catch(() => ({}))
    if (res.ok) applyAggregatorPayload(data)
  }

  useEffect(() => {
    let cancelled = false
    fetch(`/api/studio/releases/${releaseId}/distribute`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok || cancelled) return
        applyAggregatorPayload(data)
      })
      .catch(() => undefined)
    void refreshDspArtwork().catch(() => undefined)
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [releaseId])
  const [providers, setProviders] = useState<ConnectProviders>({
    odesli: false,
    spotify: false,
    apple: true,
    deezer: true,
    youtube: false,
  })
  const [hint, setHint] = useState<string | null>(null)
  const [coverage, setCoverage] = useState<DspCoverage | null>(null)
  const matchCards = useMemo(() => artistAlreadyOnStoreCards(), [])
  const currentArtistIds: Record<ArtistMatchField, string> = {
    spotify_artist_id: spotifyArtistId || '',
    apple_artist_id: appleArtistId || '',
    youtube_artist_id: youtubeArtistId || '',
    instagram_handle: instagramHandle || '',
    facebook_page_id: facebookPageId || '',
  }

  const linksByStore = useMemo(() => {
    const map = new Map<string, StoreLinkRow>()
    for (const link of storeLinks) {
      if (!map.has(link.store)) map.set(link.store, link)
    }
    return map
  }, [storeLinks])

  const localCoverage = useMemo(
    () =>
      coverage ||
      buildDspCoverage(
        storeLinks.map((l) => ({
          store: l.store,
          url: l.url,
          source: l.verification_status === 'artist_only' ? 'artist' : 'seed',
          verification_status: l.verification_status,
        }))
      ),
    [coverage, storeLinks]
  )

  const coverageByStore = useMemo(() => {
    const map = new Map<DspStoreId, DspCoverageKind>()
    for (const row of localCoverage.rows) map.set(row.id, row.kind)
    return map
  }, [localCoverage])

  const verificationByStore = useMemo(() => {
    const map = new Map<string, DspVerificationStatus>()
    for (const link of storeLinks) {
      const status = link.verification_status
      if (isDspVerificationStatus(status)) map.set(link.store, status)
      else map.set(link.store, 'unverified')
    }
    return map
  }, [storeLinks])

  const liveVerifiedCount = useMemo(
    () => storeLinks.filter((l) => isReleaseLiveOnStore(l.verification_status as DspVerificationStatus)).length,
    [storeLinks]
  )
  useEffect(() => {
    if (targetStores.length === 0) onTargetsChange(allDspStoreIds())
    // One-time fill when a release has no targets yet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [releaseId])

  useEffect(() => {
    let cancelled = false
    fetch(`/api/studio/releases/${releaseId}/dsp-connect`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok || cancelled) return
        if (data.providers) setProviders(data.providers)
        if (typeof data.hint === 'string') setHint(data.hint)
        if (data.coverage) setCoverage(data.coverage)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [releaseId])

  function toggleTarget(id: DspStoreId) {
    if (targetStores.includes(id)) {
      onTargetsChange(targetStores.filter((store) => store !== id))
    } else {
      onTargetsChange([...targetStores, id])
    }
  }

  function beginPasteForStore(id: DspStoreId) {
    setNewStore(id)
    setPasteFocus((n) => n + 1)
    if (!targetStores.includes(id)) {
      onTargetsChange([...targetStores, id])
    }
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLInputElement>('[data-testid="dsp-paste-url"]')
      el?.focus()
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newUrl.trim()) return
    onAddLink(newStore, newUrl.trim())
    setNewUrl('')
  }

  async function connectStores(e: React.FormEvent) {
    e.preventDefault()
    setConnecting(true)
    setError(null)
    setMessage(null)
    try {
      const res = await fetch(`/api/studio/releases/${releaseId}/dsp-connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seedUrl: seedUrl.trim() || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Could not find live DSP pages yet')
      }
      const added = data.persisted?.added?.length || 0
      const updated = data.persisted?.updated?.length || 0
      const found = data.links?.length || 0
      if (data.coverage) setCoverage(data.coverage)
      if (Array.isArray(data.targetStores) && data.targetStores.length) {
        onTargetsChange(data.targetStores)
      }
      const summary =
        data.coverage && typeof data.coverage.total === 'number'
          ? formatDspCoverageSummary(data.coverage)
          : `Connected ${found} store${found === 1 ? '' : 's'}`
      setMessage(
        `${summary}${added || updated ? ` · ${added} new, ${updated} updated` : ''}.`
      )
      if (Array.isArray(data.notes) && data.notes.length) {
        setHint(data.notes.find((n: string) => n.includes('Still need') || n.includes('B2B')) || data.notes[0])
      }
      onConnected?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connect failed')
    } finally {
      setConnecting(false)
    }
  }

  async function fillMissingStores() {
    setConnecting(true)
    setError(null)
    setMessage(null)
    try {
      const res = await fetch(`/api/studio/releases/${releaseId}/dsp-connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seedUrl: seedUrl.trim() || undefined,
          fillMissing: true,
          updateTargets: true,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Could not fill missing stores')
      }
      const filled = data.fillLinks?.length || 0
      const added = data.persisted?.added?.length || 0
      if (data.coverage) setCoverage(data.coverage)
      if (Array.isArray(data.targetStores) && data.targetStores.length) {
        onTargetsChange(data.targetStores)
      }
      setMessage(
        filled || added
          ? `Added ${added || filled} missing store link${(added || filled) === 1 ? '' : 's'} from SERGIK catalog.`
          : data.error || 'All targeted stores already have links.'
      )
      onConnected?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fill missing failed')
    } finally {
      setConnecting(false)
    }
  }

  async function verifyLiveStores() {
    setVerifying(true)
    setError(null)
    setMessage(null)
    try {
      const res = await fetch(`/api/studio/releases/${releaseId}/dsp-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Verification failed')
      setVerifySummary(data as DspVerifySummary)
      setMessage(formatDspVerifySummary(data as DspVerifySummary))
      onConnected?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verify failed')
    } finally {
      setVerifying(false)
    }
  }

  async function publishOnSergik(force = false) {
    setPublishing(true)
    setError(null)
    setMessage(null)
    try {
      if (targetStores.length === 0) {
        onTargetsChange(allDspStoreIds())
      }
      const distRes = await fetch(`/api/studio/releases/${releaseId}/distribute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'self', force: true }),
      })
      const distData = await distRes.json().catch(() => ({}))
      if (!distRes.ok) {
        throw new Error(distData.error || distData.blockers?.join(' ') || 'Self-distribute failed')
      }
      const liveRes = await fetch(`/api/studio/releases/${releaseId}/go-live`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force, create_campaign: true, create_smart_link: true }),
      })
      const liveData = await liveRes.json().catch(() => ({}))
      if (!liveRes.ok) {
        throw new Error(
          liveData.blockers?.join(' ') || liveData.error || 'Go-live failed — check Launch for blockers'
        )
      }
      setLiveOnSergik(true)
      const upcNote = liveData.upc || distData.upc ? ` · UPC ${liveData.upc || distData.upc}` : ''
      // Fill any DSP gaps from SERGIK catalog so Delivery icons cover the full matrix.
      try {
        await fetch(`/api/studio/releases/${releaseId}/dsp-connect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fillMissing: true, updateTargets: true }),
        })
      } catch {
        // Non-fatal — publish already succeeded.
      }
      setMessage(`Published on SERGIK${upcNote}. Connect & verify store pages below.`)
      onConnected?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publish failed')
    } finally {
      setPublishing(false)
    }
  }

  async function distributeToStores(force = false) {
    setDistributing(true)
    setDistError(null)
    setDistMessage(null)
    try {
      if (targetStores.length === 0) onTargetsChange(allDspStoreIds())
      const res = await fetch(`/api/studio/releases/${releaseId}/distribute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'aggregator', force, rights: deliveryRights }),
      })
      const data = await res.json().catch(() => ({}))
      applyAggregatorPayload(data)
      if (!res.ok) {
        const blockers = Array.isArray(data.blockers) ? data.blockers.join(' · ') : ''
        throw new Error(blockers || data.error || 'Aggregator distribute failed')
      }
      const queued = data.queuedStores?.length || data.queuedStoreIds?.length || 0
      const unsupported = data.unsupported?.length || 0
      setDistMessage(
        [
          data.dryRun ? 'Dry-run' : 'Queued',
          queued ? `${queued} Revelator store(s)` : 'no curated stores',
          unsupported ? `· ${unsupported} need lookup after partner access` : '',
          data.message ? `· ${data.message}` : '',
        ]
          .filter(Boolean)
          .join(' ')
      )
      onConnected?.()
      await refreshAggregator()
    } catch (err) {
      setDistError(err instanceof Error ? err.message : 'Distribute failed')
    } finally {
      setDistributing(false)
    }
  }

  async function saveDeliveryRights(next: typeof deliveryRights) {
    setDeliveryRights(next)
    setDistError(null)
    try {
      const res = await fetch(`/api/studio/releases/${releaseId}/distribute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'aggregator', rightsOnly: true, rights: next }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not save rights')
      await refreshAggregator()
    } catch (err) {
      setDistError(err instanceof Error ? err.message : 'Save rights failed')
    }
  }

  async function checkDeliveryStatus() {
    setCheckingStatus(true)
    setDistError(null)
    setDistMessage(null)
    try {
      const res = await fetch(`/api/studio/releases/${releaseId}/status`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Status check failed')
      applyAggregatorPayload(data)
      const storeCount = Array.isArray(data.stores) ? data.stores.length : 0
      setDistMessage(
        [
          `Status: ${data.status || 'unknown'}`,
          data.dryRun ? '(dry-run)' : '',
          storeCount ? `· ${storeCount} store row(s)` : '',
          data.upserted?.length ? `· upserted ${data.upserted.length}` : '',
          data.message || '',
        ]
          .filter(Boolean)
          .join(' ')
      )
      onConnected?.()
    } catch (err) {
      setDistError(err instanceof Error ? err.message : 'Status check failed')
    } finally {
      setCheckingStatus(false)
    }
  }

  const firstIsrc = isrcs.find(Boolean)

  const healthBadge =
    aggregatorHealth?.label === 'live'
      ? { text: 'Aggregator · Live', className: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30' }
      : aggregatorHealth?.label === 'dry_run'
        ? { text: 'Aggregator · Dry-run', className: 'bg-amber-500/15 text-amber-200 ring-amber-500/30' }
        : { text: 'Aggregator · Offline', className: 'bg-zinc-700/40 text-zinc-400 ring-zinc-600/40' }

  return (
    <div className="space-y-6">
      {previouslyReleased ? (
        <StreamContinuityPanel
          releaseId={releaseId}
          previouslyReleased={previouslyReleased}
          onUpdated={onConnected}
        />
      ) : null}

      <section
        data-testid="dsp-publish-sergik"
        className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-medium text-white">Publish on SERGIK</h3>
            <p className="text-sm text-zinc-500 mt-1 max-w-2xl">
              Release Studio self-publish — goes live on your site, campaign, and smart link.
              Connecting store URLs below discovers existing DSP pages; it does not upload audio
              to an external aggregator.
            </p>
          </div>
          {liveOnSergik ? (
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30">
              <FaCheckCircle /> Live · Self
            </span>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {liveOnSergik ? (
            <Link
              href={`/music/${encodeURIComponent(releaseId)}`}
              data-testid="dsp-open-public-music"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-emerald-700/50 text-emerald-200 text-sm hover:bg-emerald-950/40"
            >
              Open public music page <FaExternalLinkAlt className="text-xs" />
            </Link>
          ) : (
            <>
              <button
                type="button"
                data-testid="dsp-publish-sergik-btn"
                disabled={publishing}
                onClick={() => void publishOnSergik(false)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium disabled:opacity-50"
              >
                <FaRocket className="text-xs" />
                {publishing ? 'Publishing…' : 'Publish on SERGIK'}
              </button>
              <button
                type="button"
                data-testid="dsp-publish-sergik-force"
                disabled={publishing}
                onClick={() => void publishOnSergik(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-zinc-600 text-zinc-400 text-sm hover:border-zinc-500 disabled:opacity-50"
              >
                Force publish
              </button>
            </>
          )}
        </div>
        {message ? <p className="text-xs text-emerald-300 mt-3">{message}</p> : null}
        {error ? <p className="text-xs text-red-300 mt-3">{error}</p> : null}
      </section>

      <section
        data-testid="dsp-distribute-stores"
        className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-medium text-white">Distribute to stores</h3>
            <p className="text-sm text-zinc-500 mt-1 max-w-2xl">
              Revelator aggregator delivery — masters to targeted DSPs. SERGIK publish is separate.
              Preflight enforces WAV/FLAC, artwork, rights, and migration locks. Without partner
              credentials this dry-runs only.
            </p>
          </div>
          <span
            data-testid="dsp-aggregator-health"
            className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ring-1 ${healthBadge.className}`}
          >
            {healthBadge.text}
          </span>
        </div>

        <div
          data-testid="dsp-aggregator-readiness"
          className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-2 text-[11px]"
        >
          {(
            [
              [
                'Masters',
                masters
                  ? `${masters.withMaster}/${masters.trackCount} WAV/FLAC`
                  : '—',
                readiness?.mastersOk,
              ],
              [
                'ISRCs',
                masters ? `${masters.withIsrc}/${masters.trackCount}` : '—',
                readiness?.isrcOk,
              ],
              ['UPC', readiness?.upcOk ? 'set' : 'missing', readiness?.upcOk],
              [
                'Site art',
                dspArtInfo?.site && !dspArtInfo.site.error
                  ? `${dspArtInfo.site.width}×${dspArtInfo.site.height}`
                  : '—',
                readiness?.siteArtOk,
              ],
              [
                'DSP cover',
                readiness?.dspCoverOk
                  ? `${dspArtInfo?.dsp?.width || '?'}×${dspArtInfo?.dsp?.height || '?'}`
                  : 'generate',
                readiness?.dspCoverOk,
              ],
              [
                'Queue map',
                readiness
                  ? `${readiness.curatedQueueable ?? 0} queueable · ${readiness.targetedUnsupported ?? 0} need lookup`
                  : '—',
                (readiness?.curatedQueueable || 0) > 0,
              ],
            ] as const
          ).map(([label, value, ok]) => (
            <div
              key={label}
              className={`rounded-lg border px-3 py-2 ${
                ok
                  ? 'border-emerald-800/40 bg-emerald-950/20 text-emerald-200/90'
                  : 'border-zinc-800 bg-zinc-950/50 text-zinc-400'
              }`}
            >
              <p className="text-zinc-500 uppercase tracking-wide text-[10px]">{label}</p>
              <p className="mt-0.5 font-medium text-zinc-200">{value}</p>
            </div>
          ))}
        </div>
        {readiness?.dryRunOnly ? (
          <p className="mt-2 text-[11px] text-amber-200/80" data-testid="dsp-dry-run-honesty">
            Aggregator is dry-run until Revelator partner keys + Deals Worksheet — Distribute
            validates the packet but does not upload to DSPs.
          </p>
        ) : null}
        {masters?.missingMaster?.length ? (
          <p className="mt-1 text-[11px] text-amber-300/90">
            Missing masters: {masters.missingMaster.slice(0, 4).join(', ')}
            {masters.missingMaster.length > 4 ? '…' : ''}
          </p>
        ) : null}
        {masters?.nonLossless?.length ? (
          <p className="mt-1 text-[11px] text-amber-300/90">
            Non-WAV/FLAC: {masters.nonLossless.slice(0, 4).join(', ')}
          </p>
        ) : null}

        <div
          data-testid="dsp-cover-panel"
          className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/50 p-3"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-zinc-200">DSP-ready cover</p>
              <p className="text-[11px] text-zinc-500 mt-1 max-w-xl">
                Probes site art (≥1400²) and writes a separate JPEG under{' '}
                <span className="font-mono text-zinc-400">release-covers/</span> — website{' '}
                <span className="font-mono text-zinc-400">artwork_url</span> is never downscaled.
              </p>
              {dspArtInfo?.site &&
              !(dspArtInfo.site as { error?: string }).error ? (
                <p className="text-[11px] text-zinc-500 mt-1" data-testid="dsp-cover-site-probe">
                  Site: {dspArtInfo.site.width}×{dspArtInfo.site.height}
                  {dspArtInfo.site.ok === false ? ' · below DSP min' : ''}
                </p>
              ) : null}
              {dspArtInfo?.artwork_dsp_url ? (
                <p className="text-[11px] text-emerald-400/90 mt-1 truncate" data-testid="dsp-cover-url">
                  DSP: {dspArtInfo.dsp?.width || '?'}×{dspArtInfo.dsp?.height || '?'} · ready
                </p>
              ) : (
                <p className="text-[11px] text-amber-300/90 mt-1" data-testid="dsp-cover-missing">
                  No DSP cover yet — generate before live queue (auto-runs on Distribute).
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                data-testid="dsp-cover-generate"
                disabled={generatingDspArt}
                onClick={() => void generateDspCover(false)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-violet-600/50 text-violet-200 text-xs hover:border-violet-400 disabled:opacity-50"
              >
                {generatingDspArt ? 'Working…' : 'Generate DSP cover'}
              </button>
              <button
                type="button"
                data-testid="dsp-cover-regenerate"
                disabled={generatingDspArt}
                onClick={() => void generateDspCover(true)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 text-xs hover:border-zinc-500 disabled:opacity-50"
              >
                Force regenerate
              </button>
            </div>
          </div>
        </div>

        <div
          data-testid="dsp-revelator-rights"
          className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs text-zinc-300"
        >
          {(
            [
              ['streaming', 'Streaming rights'],
              ['download', 'Download rights'],
              ['ugc', 'UGC rights (YT CID / TikTok / Meta)'],
              ['track_origin_original', 'Original/exclusive for UGC'],
              ['beatport_enabled', 'Beatport enabled by Revelator Support'],
              ['linking_fields_acknowledged', 'Linking field lock acknowledged'],
            ] as const
          ).map(([key, label]) => (
            <label
              key={key}
              className="flex items-start gap-2 rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2 cursor-pointer"
            >
              <input
                type="checkbox"
                className="mt-0.5"
                checked={Boolean(deliveryRights[key])}
                onChange={(e) =>
                  void saveDeliveryRights({ ...deliveryRights, [key]: e.target.checked })
                }
              />
              <span>{label}</span>
            </label>
          ))}
        </div>

        {preflightBlockers.length > 0 ? (
          <ul
            data-testid="dsp-preflight-blockers"
            className="mt-3 space-y-1 text-xs text-amber-200/90 list-disc pl-5"
          >
            {preflightBlockers.slice(0, 8).map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-emerald-400/90" data-testid="dsp-preflight-ok">
            Preflight clear for aggregator queue (or dry-run).
          </p>
        )}
        {preflightWarnings.length > 0 ? (
          <ul className="mt-2 space-y-1 text-[11px] text-zinc-500 list-disc pl-5">
            {preflightWarnings.slice(0, 6).map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}

        {preflightChecklist.length > 0 ? (
          <ul className="mt-3 space-y-1 text-[11px] text-zinc-400" data-testid="dsp-ops-checklist">
            {preflightChecklist.map((item) => (
              <li key={item.id} className="flex gap-2">
                <span className={item.done ? 'text-emerald-400' : 'text-zinc-600'}>
                  {item.done ? '✓' : '○'}
                </span>
                {item.href ? (
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-violet-300 hover:text-violet-200"
                  >
                    {item.label}
                  </a>
                ) : (
                  <span>{item.label}</span>
                )}
              </li>
            ))}
          </ul>
        ) : null}

        {storeMatrix.length > 0 ? (
          <div className="mt-4" data-testid="dsp-aggregator-store-matrix">
            <p className="text-xs font-medium text-zinc-300 mb-2">
              Aggregator queue map (curated IDs only until partner lookup)
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto">
              {storeMatrix
                .filter((row) => row.targeted)
                .map((row) => (
                  <div
                    key={row.store}
                    data-testid={`dsp-agg-row-${row.store}`}
                    data-honesty={row.honesty}
                    className="flex items-center justify-between gap-2 rounded border border-zinc-800/80 px-2 py-1.5 text-[11px]"
                  >
                    <span className="text-zinc-300 truncate">{row.name}</span>
                    <span
                      className={
                        row.queueable
                          ? 'text-emerald-400 shrink-0'
                          : row.honesty === 'unsupported'
                            ? 'text-amber-400/90 shrink-0'
                            : 'text-zinc-600 shrink-0'
                      }
                    >
                      {row.deliveryStatus ||
                        (row.queueable ? 'queueable' : 'needs lookup')}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="dsp-distribute-stores-btn"
            disabled={distributing || aggregatorHealth?.available === false}
            onClick={() => void distributeToStores(false)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium disabled:opacity-50"
          >
            <FaRocket className="text-xs" />
            {distributing ? 'Distributing…' : 'Distribute to stores'}
          </button>
          <button
            type="button"
            data-testid="dsp-distribute-force"
            disabled={distributing}
            onClick={() => void distributeToStores(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-zinc-600 text-zinc-400 text-sm hover:border-zinc-500 disabled:opacity-50"
          >
            Force / redeliver
          </button>
          <button
            type="button"
            data-testid="dsp-check-delivery-status"
            disabled={checkingStatus}
            onClick={() => void checkDeliveryStatus()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-emerald-700/60 bg-emerald-950/40 hover:bg-emerald-900/40 text-emerald-200 text-sm font-medium disabled:opacity-50"
          >
            <FaSync className={checkingStatus ? 'animate-spin text-xs' : 'text-xs'} />
            {checkingStatus ? 'Checking…' : 'Check delivery status'}
          </button>
          <button
            type="button"
            data-testid="dsp-refresh-preflight"
            disabled={distributing}
            onClick={() => void refreshAggregator()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-zinc-700 text-zinc-400 text-sm hover:border-zinc-500 disabled:opacity-50"
          >
            Refresh preflight
          </button>
        </div>
        {distMessage ? <p className="text-xs text-emerald-300 mt-3">{distMessage}</p> : null}
        {distError ? <p className="text-xs text-red-300 mt-3">{distError}</p> : null}
      </section>

      <section
        data-testid="dsp-package-identity"
        className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5"
      >
        <h3 className="text-sm font-medium text-white">DSP package identity</h3>
        <p className="text-sm text-zinc-500 mt-1 mb-4">
          UPC and artist IDs travel with the delivery packet. Paste a profile URL or the raw ID.
        </p>
        {matchCards.length ? (
          <div
            data-testid="dsp-already-on-cards"
            className="mb-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-3"
          >
            {matchCards.map((card) => {
              const current = currentArtistIds[card.field]
              const matched = Boolean(current)
              return (
                <div
                  key={card.id}
                  data-testid={`dsp-match-card-${card.id}`}
                  className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3 space-y-2"
                >
                  <p className="text-xs font-medium text-zinc-200">{card.question}</p>
                  <a
                    href={card.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-violet-300 hover:text-violet-200"
                  >
                    SERGIK on {card.label}
                    <FaExternalLinkAlt className="text-[9px] opacity-70" aria-hidden />
                  </a>
                  {matched ? (
                    <p
                      data-testid={`dsp-match-ready-${card.id}`}
                      className="text-[11px] text-emerald-400 inline-flex items-center gap-1"
                    >
                      <FaCheckCircle /> You&apos;re all set
                    </p>
                  ) : (
                    <button
                      type="button"
                      data-testid={`dsp-match-use-${card.id}`}
                      onClick={() => onPackageChange?.({ [card.field]: card.value })}
                      className="text-[11px] px-2 py-1 rounded-md border border-violet-500/40 text-violet-200 hover:border-violet-400"
                    >
                      Use this artist
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        ) : null}
        <div className="grid sm:grid-cols-3 gap-3" data-delivery-section="artist-profiles">
          <label className="text-xs text-zinc-500">
            UPC
            <div className="mt-1 flex gap-2">
              <input
                data-testid="dsp-package-upc"
                defaultValue={upc || ''}
                key={`upc-${upc || 'empty'}`}
                onBlur={(e) => {
                  const next = e.target.value.trim()
                  if (next !== (upc || '')) onPackageChange?.({ upc: next })
                }}
                placeholder="Internal or GS1 UPC"
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
              />
              <button
                type="button"
                data-testid="dsp-package-upc-generate"
                title="Generate internal UPC"
                onClick={() => onPackageChange?.({ upc: generateInternalUpc() })}
                className="shrink-0 px-3 rounded-lg border border-zinc-700 text-zinc-300 hover:border-violet-500 hover:text-white"
              >
                <FaMagic />
              </button>
            </div>
          </label>
          <label className="text-xs text-zinc-500">
            Spotify artist ID
            <input
              data-testid="dsp-package-spotify"
              defaultValue={spotifyArtistId || ''}
              key={`sp-${spotifyArtistId || 'empty'}`}
              onBlur={(e) => {
                const next = parseSpotifyArtistId(e.target.value) || e.target.value.trim()
                if (next !== (spotifyArtistId || '')) onPackageChange?.({ spotify_artist_id: next })
              }}
              placeholder="7MnvMhWoSe4wYXuiI6iQ8H"
              className="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
            />
          </label>
          <label className="text-xs text-zinc-500">
            Apple Music artist ID
            <input
              data-testid="dsp-package-apple"
              defaultValue={appleArtistId || ''}
              key={`am-${appleArtistId || 'empty'}`}
              onBlur={(e) => {
                const next = parseAppleMusicArtistId(e.target.value) || e.target.value.trim()
                if (next !== (appleArtistId || '')) onPackageChange?.({ apple_artist_id: next })
              }}
              placeholder="1577778284"
              className="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
            />
            {appleArtistId ? (
              <span className="block text-[11px] text-emerald-400 mt-1">
                You&apos;re all set — this release will appear with your other SERGIK Apple Music titles.
              </span>
            ) : null}
          </label>
          <label className="text-xs text-zinc-500">
            YouTube channel
            <input
              data-testid="dsp-package-youtube"
              defaultValue={youtubeArtistId || ''}
              key={`yt-${youtubeArtistId || 'empty'}`}
              onBlur={(e) => {
                const next = parseYoutubeChannelId(e.target.value) || e.target.value.trim()
                if (next !== (youtubeArtistId || '')) onPackageChange?.({ youtube_artist_id: next })
              }}
              placeholder="UC… or @handle"
              className="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
            />
            {youtubeArtistId ? (
              <span className="block text-[11px] text-emerald-400 mt-1">
                You&apos;re all set — YouTube Music will attach this to the existing SERGIK channel.
              </span>
            ) : null}
          </label>
          <label className="text-xs text-zinc-500">
            Instagram
            <input
              data-testid="dsp-package-instagram"
              defaultValue={instagramHandle || ''}
              key={`ig-${instagramHandle || 'empty'}`}
              onBlur={(e) => {
                const next = parseInstagramHandle(e.target.value) || e.target.value.trim()
                if (next !== (instagramHandle || '')) onPackageChange?.({ instagram_handle: next })
              }}
              placeholder="sergikdropz"
              className="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
            />
            {instagramHandle ? (
              <span className="block text-[11px] text-emerald-400 mt-1">
                You&apos;re all set — Instagram will show this with your other SERGIK music.
              </span>
            ) : null}
          </label>
          <label className="text-xs text-zinc-500">
            Facebook page
            <input
              data-testid="dsp-package-facebook"
              defaultValue={facebookPageId || ''}
              key={`fb-${facebookPageId || 'empty'}`}
              onBlur={(e) => {
                const next = parseFacebookPage(e.target.value) || e.target.value.trim()
                if (next !== (facebookPageId || '')) onPackageChange?.({ facebook_page_id: next })
              }}
              placeholder="sergikdropz"
              className="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
            />
            {facebookPageId ? (
              <span className="block text-[11px] text-emerald-400 mt-1">
                You&apos;re all set — Facebook will attach this to the existing SERGIK page.
              </span>
            ) : null}
          </label>
        </div>
        {spotifyArtistId ? (
          <p className="text-[11px] text-emerald-400 mt-3">
            Spotify artist ID is set — this release will appear alongside your other SERGIK titles.
          </p>
        ) : null}
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-medium text-white">Connect streaming stores</h3>
            <p className="text-sm text-zinc-500 mt-1 max-w-2xl">
              Pull live pages for <span className="text-zinc-300">{title}</span> across Studio DSPs
              (Spotify, Apple, YouTube, song.link, MusicBrainz). Looks up existing store pages —
              does not upload audio to an external distributor.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <ProviderPill label="Apple Music" ready={providers.apple !== false} />
            <ProviderPill label="Deezer" ready={providers.deezer !== false} />
            <ProviderPill label="Spotify ISRC" ready={providers.spotify} />
            <ProviderPill label="YouTube" ready={providers.youtube} />
            <ProviderPill label="song.link" ready={providers.odesli} />
            <ProviderPill label="MusicBrainz" ready={providers.musicbrainz !== false} />
          </div>
        </div>

        <form onSubmit={connectStores} className="flex flex-wrap gap-2">
          <input
            type="url"
            value={seedUrl}
            onChange={(e) => setSeedUrl(e.target.value)}
            placeholder="Optional seed: https://open.spotify.com/album/…"
            className="flex-1 min-w-[240px] bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
          <button
            type="submit"
            disabled={connecting}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium disabled:opacity-50"
          >
            <FaSync className={connecting ? 'animate-spin text-xs' : 'text-xs'} />
            {connecting ? 'Connecting…' : 'Connect stores'}
          </button>
          <button
            type="button"
            disabled={connecting}
            onClick={() => void fillMissingStores()}
            data-testid="dsp-fill-missing"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-violet-500/50 bg-violet-950/30 hover:bg-violet-900/40 text-violet-100 text-sm font-medium disabled:opacity-50"
          >
            <FaPlus className="text-xs" />
            Add missing stores
          </button>
          <button
            type="button"
            disabled={verifying || storeLinks.length === 0}
            onClick={verifyLiveStores}
            data-testid="dsp-verify-live"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-emerald-700/60 bg-emerald-950/40 hover:bg-emerald-900/40 text-emerald-200 text-sm font-medium disabled:opacity-50"
          >
            <FaCheckCircle className={verifying ? 'animate-pulse text-xs' : 'text-xs'} />
            {verifying ? 'Verifying…' : 'Verify live stores'}
          </button>
        </form>

        <p className="text-xs text-zinc-500 mt-3">
          {hint ||
            (firstIsrc
              ? `Using ISRC ${formatISRCDisplay(firstIsrc)}${upc ? ` · UPC ${upc}` : ''}`
              : upc
                ? `Using UPC ${upc}`
                : 'Add an ISRC, UPC, or paste a Spotify / Apple URL.')}
        </p>
        {message ? <p className="text-xs text-emerald-300 mt-2">{message}</p> : null}
        {error ? <p className="text-xs text-red-300 mt-2">{error}</p> : null}
      </section>

      <section data-testid="dsp-target-matrix">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="text-sm font-medium text-zinc-400">Target DSPs</h3>
            <p className="text-xs text-zinc-500 mt-1" data-testid="dsp-coverage-summary">
              {formatDspCoverageSummary(localCoverage)}
              {targetStores.length !== localCoverage.total
                ? ` · ${targetStores.length}/${localCoverage.total} selected`
                : ' · all selected'}
              {storeLinks.length
                ? ` · ${liveVerifiedCount} verified live`
                : ''}
            </p>
            {verifySummary ? (
              <p className="text-xs text-emerald-400/90 mt-1" data-testid="dsp-verify-summary">
                {formatDspVerifySummary(verifySummary)}
              </p>
            ) : null}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onTargetsChange(allDspStoreIds())}
              data-testid="dsp-select-all-targets"
              className="text-xs text-violet-300 hover:text-violet-200"
            >
              Select all ({allDspStoreIds().length})
            </button>
            <button
              type="button"
              onClick={() => onTargetsChange([])}
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              Clear
            </button>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {DSP_STORES.map((dsp) => {
            const selected = targetStores.includes(dsp.id)
            const link = linksByStore.get(dsp.id)
            const kind = coverageByStore.get(dsp.id) || (link ? 'live' : 'needs_paste')
            const vStatus = verificationByStore.get(dsp.id)
            const statusLabel = link
              ? verificationLabel(vStatus)
              : kind === 'b2b'
                ? 'B2B / submitted'
                : selected
                  ? 'Targeted — paste URL'
                  : 'Not targeted'
            const verifiedLive = isReleaseLiveOnStore(vStatus)
            return (
              <div
                key={dsp.id}
                data-testid={`dsp-target-${dsp.id}`}
                data-coverage={kind}
                data-verification={vStatus || (kind === 'b2b' ? 'b2b' : 'none')}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
                  verifiedLive
                    ? 'border-emerald-800/50 bg-zinc-900'
                    : link || kind === 'b2b'
                      ? 'border-white/15 bg-zinc-900'
                      : selected
                        ? 'border-zinc-600 bg-zinc-900/70'
                        : 'border-zinc-800 bg-zinc-950/40'
                }`}
                style={
                  link || kind === 'b2b' ? { boxShadow: `inset 3px 0 0 ${dsp.color}` } : undefined
                }
              >
                <button
                  type="button"
                  onClick={() => toggleTarget(dsp.id)}
                  className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                    selected || link || kind === 'b2b' ? 'ring-2 ring-offset-2 ring-offset-zinc-950' : ''
                  }`}
                  style={{
                    backgroundColor: dsp.color,
                    outlineColor: dsp.color,
                  }}
                  title={selected ? `Remove ${dsp.name} from targets` : `Target ${dsp.name}`}
                  aria-pressed={selected}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white leading-tight">{dsp.name}</p>
                  <p
                    className={`text-[11px] ${
                      verifiedLive
                        ? 'text-emerald-400'
                        : vStatus === 'failed'
                          ? 'text-red-400'
                          : vStatus === 'artist_only'
                            ? 'text-amber-400/90'
                            : 'text-zinc-500'
                    }`}
                  >
                    {statusLabel}
                    {link?.verification_detail && vStatus && vStatus !== 'unverified'
                      ? ` · ${link.verification_detail}`
                      : ''}
                  </p>
                </div>
                {link ? (
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-violet-300 hover:text-violet-200"
                    title={`Open ${dsp.name}`}
                  >
                    <FaExternalLinkAlt className="text-[10px]" />
                  </a>
                ) : kind === 'needs_paste' ? (
                  <button
                    type="button"
                    onClick={() => beginPasteForStore(dsp.id)}
                    className="text-[10px] text-violet-300 hover:text-violet-200 underline-offset-2 hover:underline"
                    title={`Paste ${dsp.name} URL`}
                  >
                    Paste
                  </button>
                ) : (
                  <FaLink className="text-[10px] text-zinc-700" />
                )}
              </div>
            )
          })}
        </div>
        <p className="text-xs text-zinc-600 mt-3">
          Connect stores fans out Spotify / Apple / Deezer / YouTube / Odesli / MusicBrainz, then
          fills artist profiles from Follow. DistroKid regionals (iHeart, Qobuz, Anghami, Saavn,
          Boomplay, Claro, NetEase, Tencent, Joox, Flo) accept pasted album URLs. Optional DistroKid
          extras: Audiomack, Snapchat, MassiveMusic, Roblox (and Beatport when opted in). Kuack,
          Adaptr, and MediaNet are DistroKid-submitted B2B — usually no public album link. Bandcamp,
          Traxsource, and Mixcloud still need a pasted artist URL. TikTok / Instagram are profile
          pages; UGC fingerprinting lives under Rights → SERGIK UGC pack.
        </p>
      </section>

      <section>
        <h3 className="text-sm font-medium text-zinc-400 mb-3">Live store links</h3>
        <form onSubmit={handleAdd} className="flex flex-wrap gap-2 mb-4">
          <select
            value={newStore}
            onChange={(e) => setNewStore(e.target.value as DspStoreId)}
            className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            {DSP_STORES.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
          <input
            type="url"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder={`Paste ${dspStoreLabel(newStore)} URL…`}
            data-testid="dsp-paste-url"
            key={pasteFocus}
            className="flex-1 min-w-[200px] bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium"
          >
            <FaPlus className="text-xs" />
            Add link
          </button>
        </form>
        <div className="space-y-2">
          {storeLinks.length === 0 ? (
            <p className="text-sm text-zinc-600">
              Connect stores above, or paste a URL as each platform goes live. The public music
              page and smart link pull from here.
            </p>
          ) : (
            storeLinks.map((link) => (
              <div
                key={link.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-zinc-900 border border-zinc-800 group"
              >
                <span className="text-xs font-medium text-zinc-400 w-28 shrink-0">
                  {dspStoreLabel(link.store)}
                </span>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 text-sm text-violet-300 hover:text-violet-200 truncate flex items-center gap-1"
                >
                  {link.url}
                  <FaExternalLinkAlt className="text-[10px] shrink-0" />
                </a>
                <button
                  type="button"
                  onClick={() => onRemoveLink(link.id)}
                  className="p-2 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition"
                  title="Remove link"
                >
                  <FaTrash className="text-xs" />
                </button>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}

function ProviderPill({ label, ready }: { label: string; ready: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] uppercase tracking-wide ${
        ready
          ? 'bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/30'
          : 'bg-zinc-800 text-zinc-500 ring-1 ring-zinc-700'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ready ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
      {label}
    </span>
  )
}
