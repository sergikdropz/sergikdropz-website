'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { useAdminAiPageContext } from '@/contexts/AdminAiPageContext'
import { useNotifications } from '@/contexts/NotificationContext'
import { dispatchAdminAiPrompt } from '@/lib/admin-ai-client'
import { getStudioStepAiPrompt } from '@/lib/studio/admin-ai-step-prompts'
import {
  STATUS_STYLES,
  WORKFLOW_STEPS,
  DEFAULT_LABEL_NAME,
  type DspStoreId,
  type MarketingCopy,
  type WorkflowStepId,
} from '@/lib/studio/constants'
import type { CopyrightReadiness } from '@/lib/studio/copyright-pipeline'
import type { LaunchHandoffStatus } from '@/lib/studio/launch-handoff'
import { parseStudioWorkflowStep, studioReleaseHref } from '@/lib/studio/studio-ia'
import { mapSonicGenreToDsp, parseAttestations } from '@/lib/studio/dsp-ingest'
import { publisherApplyPatch, splitsFromCredits, tracksNeedingSplitSeed } from '@/lib/studio/rights-ops'
import type { RightsActionFocus } from '@/lib/studio/rights-action-target'
import { shouldUnoptimizeImage } from '@/utils/imageOptimization'
import WorkflowStepper from './WorkflowStepper'
import CopyrightPanel from './CopyrightPanel'
import CopywritingStudio from './CopywritingStudio'
import DspDeliveryBoard, { type StoreLinkRow } from './DspDeliveryBoard'
import ReleaseReadinessRing from './ReleaseReadinessRing'
import TrackCatalogEditor from './TrackCatalogEditor'
import MetadataPanel from './MetadataPanel'
import LaunchPanel from './LaunchPanel'
import StudioContextMenu, { type StudioContextMenuEntry } from './StudioContextMenu'
import VerifiedStoreIcons from './VerifiedStoreIcons'
import {
  FaRocket,
  FaTrash,
  FaBolt,
  FaPen,
  FaCopy,
  FaLink,
  FaBrain,
} from 'react-icons/fa'

type Release = {
  id: string
  title: string
  type: string
  release_date: string | null
  original_release_date?: string | null
  artwork_url: string | null
  description: string | null
  explicit: boolean
  genre: string | null
  subgenre: string | null
  album_artist?: string | null
  label_name: string | null
  catalog_number?: string | null
  p_line_year?: number | null
  c_line_year?: number | null
  upc: string | null
  spotify_artist_id?: string | null
  apple_artist_id?: string | null
  youtube_artist_id?: string | null
  instagram_handle?: string | null
  facebook_page_id?: string | null
  previously_released?: boolean | null
  previous_isrc?: string | null
  previous_upc?: string | null
  language?: string | null
  ingest_attestations?: unknown
  artwork_owned?: boolean | null
  artwork_designer?: string | null
  artwork_photographer?: string | null
  artwork_illustrator?: string | null
  distributor_status: string
  distribution_mode?: string | null
  target_stores?: DspStoreId[] | null
  marketing_copy?: MarketingCopy | null
}

type Props = { releaseId: string }

export default function ReleaseStudioWorkspace({ releaseId }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { showNotification } = useNotifications()
  const { setStudioRelease } = useAdminAiPageContext()
  const [release, setRelease] = useState<Release | null>(null)
  const [tracks, setTracks] = useState<any[]>([])
  const [storeLinks, setStoreLinks] = useState<StoreLinkRow[]>([])
  const [copyright, setCopyright] = useState<CopyrightReadiness | null>(null)
  const [handoff, setHandoff] = useState<LaunchHandoffStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeStep, setActiveStep] = useState<WorkflowStepId>(
    () => parseStudioWorkflowStep(searchParams.get('step')) ?? 'catalog'
  )
  const [actionFocus, setActionFocus] = useState<RightsActionFocus | null>(null)
  const [headerMenu, setHeaderMenu] = useState<{ x: number; y: number } | null>(null)
  const [marketingCopy, setMarketingCopy] = useState<MarketingCopy>({})
  const [targetStores, setTargetStores] = useState<DspStoreId[]>([])
  const [saving, setSaving] = useState(false)
  const [goingLive, setGoingLive] = useState(false)
  const [handoffLoading, setHandoffLoading] = useState(false)
  const [editForm, setEditForm] = useState({
    title: '',
    type: 'single',
    release_date: '',
    original_release_date: '',
    genre: '',
    subgenre: '',
    description: '',
    explicit: false,
    upc: '',
    album_artist: 'SERGIK',
    label_name: DEFAULT_LABEL_NAME,
    catalog_number: '',
    p_line_year: '',
    c_line_year: '',
    language: 'en',
    previously_released: '' as '' | 'no' | 'yes',
    previous_isrc: '',
    previous_upc: '',
    artwork_owned: false,
    artwork_designer: '',
    artwork_photographer: '',
    artwork_illustrator: '',
  })
  const genreMappedRef = useRef<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/studio/releases/${releaseId}`)
      if (!res.ok) throw new Error('Release not found')
      const data = await res.json()
      setRelease(data.release)
      setTracks(data.tracks || [])
      setStoreLinks(data.storeLinks || [])
      setCopyright(data.copyright || null)
      setHandoff(data.handoff || null)
      setMarketingCopy((data.release.marketing_copy as MarketingCopy) || {})
      setTargetStores((data.release.target_stores as DspStoreId[]) || [])
      const mapped = mapSonicGenreToDsp(data.release.genre, data.release.subgenre)
      setEditForm({
        title: data.release.title || '',
        type: data.release.type || 'single',
        release_date: data.release.release_date || '',
        original_release_date: data.release.original_release_date || data.release.release_date || '',
        genre: mapped.primary || '',
        subgenre: mapped.secondary || '',
        description: data.release.description || '',
        explicit: data.release.explicit || false,
        upc: data.release.upc || '',
        album_artist: data.release.album_artist || data.release.label_name || 'SERGIK',
        label_name: data.release.label_name || DEFAULT_LABEL_NAME,
        catalog_number: data.release.catalog_number || '',
        p_line_year: data.release.p_line_year ? String(data.release.p_line_year) : '',
        c_line_year: data.release.c_line_year ? String(data.release.c_line_year) : '',
        language: data.release.language || 'en',
        previously_released:
          data.release.previously_released == null
            ? ''
            : data.release.previously_released
              ? 'yes'
              : 'no',
        previous_isrc: data.release.previous_isrc || '',
        previous_upc: data.release.previous_upc || '',
        artwork_owned: Boolean(data.release.artwork_owned),
        artwork_designer: data.release.artwork_designer || '',
        artwork_photographer: data.release.artwork_photographer || '',
        artwork_illustrator: data.release.artwork_illustrator || '',
      })
      if (mapped.mapped && mapped.primary && genreMappedRef.current !== releaseId) {
        genreMappedRef.current = releaseId
        const persist = await fetch(`/api/studio/releases/${releaseId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            genre: mapped.primary,
            subgenre: mapped.secondary || null,
          }),
        })
        if (persist.ok) {
          const saved = await persist.json().catch(() => ({}))
          if (saved.release) {
            setRelease(saved.release)
            data.release.genre = saved.release.genre
            data.release.subgenre = saved.release.subgenre
          }
        } else {
          genreMappedRef.current = null
        }
      }
    } catch (e: unknown) {
      showNotification(e instanceof Error ? e.message : 'Load failed', 'error')
    } finally {
      setLoading(false)
    }
  }, [releaseId, showNotification])

  useEffect(() => {
    load()
  }, [load])

  const goToStep = useCallback(
    (step: WorkflowStepId, focus?: RightsActionFocus) => {
      setActiveStep(step)
      setActionFocus(focus || null)
      router.replace(studioReleaseHref(releaseId, step), { scroll: false })
    },
    [releaseId, router]
  )

  const clearActionFocus = useCallback(() => setActionFocus(null), [])

  useEffect(() => {
    const fromUrl = parseStudioWorkflowStep(searchParams.get('step'))
    if (fromUrl) setActiveStep(fromUrl)
  }, [searchParams])

  const copyFilled = useMemo(
    () => Object.values(marketingCopy).some((v) => v && String(v).length > 10),
    [marketingCopy]
  )

  const completedSteps = useMemo((): WorkflowStepId[] => {
    if (!copyright) return []
    const done: WorkflowStepId[] = []
    if (copyright.checks.has_tracks && copyright.checks.tracks_have_isrc) done.push('catalog')
    if (release?.artwork_url && release.genre) done.push('metadata')
    if (copyright.checks.ready_to_distribute) done.push('rights')
    if (copyFilled) done.push('copy')
    if (storeLinks.length > 0 || targetStores.length > 0) done.push('delivery')
    if (release?.distributor_status === 'live') done.push('launch')
    return done
  }, [copyright, release, copyFilled, storeLinks, targetStores])

  useEffect(() => {
    if (!release || !copyright) {
      setStudioRelease(null)
      return
    }
    setStudioRelease({
      releaseId,
      title: release.title,
      type: release.type,
      distributorStatus: release.distributor_status,
      releaseDate: release.release_date,
      readinessScore: copyright.readiness_score,
      nextAction: copyright.next_best_action?.label,
      blockers: copyright.blockers,
      activeStep,
      completedSteps,
      trackCount: tracks.length,
      hasArtwork: Boolean(release.artwork_url),
      hasGenre: Boolean(release.genre),
    })
    return () => setStudioRelease(null)
  }, [
    release,
    copyright,
    releaseId,
    activeStep,
    completedSteps,
    tracks.length,
    setStudioRelease,
  ])

  async function patchRelease(partial: Record<string, unknown>, opts?: { silent?: boolean }) {
    setSaving(true)
    try {
      const res = await fetch(`/api/studio/releases/${releaseId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partial),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Save failed')
      }
      await load()
      if (!opts?.silent) showNotification('Saved', 'success')
    } catch (e: unknown) {
      showNotification(e instanceof Error ? e.message : 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function updateCopyright(payload: Record<string, boolean | string | object>) {
    setSaving(true)
    try {
      const res = await fetch(`/api/studio/releases/${releaseId}/copyright`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Copyright update failed')
      setCopyright(data.readiness)
    } catch (e: unknown) {
      showNotification(e instanceof Error ? e.message : 'Update failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function updateTrackRights(trackId: string, patch: Record<string, string | boolean | null>) {
    setSaving(true)
    try {
      const res = await fetch(`/api/studio/tracks/${trackId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Track rights update failed')
      await load()
    } catch (e: unknown) {
      showNotification(e instanceof Error ? e.message : 'Update failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function assignMissingIsrcs() {
    const missing = tracks.filter((track) => track?.id && !track.isrc_full)
    if (!missing.length) {
      showNotification('Every track already has an ISRC', 'success')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/studio/isrc/bulk-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackIds: missing.map((track) => track.id) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Bulk ISRC failed')
      showNotification(
        `Assigned ${data.successful || 0} ISRC${data.successful === 1 ? '' : 's'}`,
        data.failed ? 'warning' : 'success',
      )
      await load()
    } catch (e: unknown) {
      showNotification(e instanceof Error ? e.message : 'Bulk ISRC failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function seedSplitsFromCredits() {
    const rows = tracksNeedingSplitSeed(tracks).map((track) => ({
      track_id: track.id,
      splits: splitsFromCredits(track.contributors, track.writer_legal_names),
    }))
    if (!rows.length) {
      showNotification('Splits already total 100%', 'success')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/studio/tracks/bulk-splits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Split seed failed')
      showNotification(
        `Seeded ${data.successful || 0} split sheet${data.successful === 1 ? '' : 's'} from Catalog credits`,
        data.failed ? 'warning' : 'success',
      )
      await load()
    } catch (e: unknown) {
      showNotification(e instanceof Error ? e.message : 'Split seed failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function applyPublisherToTracks(patch: { publisher_name: string; publisher_ipi: string | null }) {
    setSaving(true)
    try {
      await Promise.all(
        tracks
          .filter((track) => track?.id)
          .map(async (track) => {
            const next = publisherApplyPatch(track, { name: patch.publisher_name, ipi: patch.publisher_ipi })
            if (!next) return
            const res = await fetch(`/api/studio/tracks/${track.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(next),
            })
            if (!res.ok) {
              const data = await res.json().catch(() => ({}))
              throw new Error(data.error || 'Track publisher update failed')
            }
          }),
      )
      await load()
    } catch (e: unknown) {
      showNotification(e instanceof Error ? e.message : 'Update failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleGoLive(force = false) {
    if (
      !confirm(
        force
          ? 'Force go-live? Bypasses strict rights checks. Also creates campaign + smart link.'
          : 'Publish this release on SERGIK and create marketing handoff (campaign + smart link)?'
      )
    ) {
      return
    }
    setGoingLive(true)
    try {
      const res = await fetch(`/api/studio/releases/${releaseId}/go-live`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      })
      const data = await res.json()
      if (!res.ok) {
        const blockers = data.blockers?.join(' ') || data.error
        throw new Error(blockers)
      }
      const handoffNote = data.handoff?.partial
        ? ` Live — marketing handoff partial: ${(data.handoff.errors || []).join('; ')}`
        : data.handoff?.smartLink
          ? ' Live with campaign + smart link.'
          : ' Live on SERGIK.'
      showNotification(`Release is live.${handoffNote}`, 'success')
      await load()
      setActiveStep('launch')
    } catch (e: unknown) {
      showNotification(e instanceof Error ? e.message : 'Go-live failed', 'error')
    } finally {
      setGoingLive(false)
    }
  }

  async function ensureHandoff() {
    setHandoffLoading(true)
    try {
      const res = await fetch('/api/studio/release-pipeline/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ release_id: releaseId }),
      })
      const data = await res.json()
      if (!res.ok && res.status !== 207) {
        throw new Error(data.error || 'Handoff failed')
      }
      if (data.partial) {
        showNotification(
          `Partial handoff: ${(data.errors || []).join('; ') || 'check campaigns/links'}`,
          'error'
        )
      } else {
        showNotification('Campaign + smart link ready', 'success')
      }
      await load()
    } catch (e: unknown) {
      showNotification(e instanceof Error ? e.message : 'Handoff failed', 'error')
    } finally {
      setHandoffLoading(false)
    }
  }

  async function addStoreLink(store: string, url: string) {
    const res = await fetch(`/api/studio/releases/${releaseId}/store-links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store, url }),
    })
    if (!res.ok) {
      showNotification('Failed to add link', 'error')
      return
    }
    await load()
  }

  async function removeStoreLink(linkId: string) {
    const res = await fetch(
      `/api/studio/releases/${releaseId}/store-links?linkId=${encodeURIComponent(linkId)}`,
      { method: 'DELETE' }
    )
    if (!res.ok) {
      showNotification('Failed to remove link', 'error')
      return
    }
    await load()
  }

  if (loading || !release) {
    return (
      <div className="flex items-center justify-center py-24 text-zinc-500">
        Loading release studio…
      </div>
    )
  }

  const statusStyle = STATUS_STYLES[release.distributor_status] || STATUS_STYLES.draft

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-16">
      <div className="flex flex-col lg:flex-row gap-8">
        <div className="shrink-0">
          {release.artwork_url ? (
            <Image
              src={release.artwork_url}
              alt=""
              width={200}
              height={200}
              unoptimized={shouldUnoptimizeImage(release.artwork_url)}
              className="rounded-2xl shadow-2xl shadow-violet-900/30 object-cover w-[200px] h-[200px]"
            />
          ) : (
            <div className="w-[200px] h-[200px] rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-600 text-sm">
              No artwork
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <button
            type="button"
            onClick={() => router.push('/studio/releases')}
            className="text-zinc-500 hover:text-white text-sm mb-3"
          >
            ← All releases
          </button>
          <div
            className="flex flex-wrap items-start justify-between gap-4 cursor-context-menu"
            onContextMenu={(event) => {
              event.preventDefault()
              setHeaderMenu({ x: event.clientX, y: event.clientY })
            }}
          >
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{release.title}</h1>
              <p className="text-zinc-500 mt-1 capitalize">
                {release.type}
                {release.release_date ? ` · ${release.release_date}` : ''}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span
                  className={`inline-block px-3 py-1 rounded-full text-xs font-medium ring-1 ${statusStyle.bg} ${statusStyle.text} ${statusStyle.ring}`}
                >
                  {statusStyle.label}
                  {release.distribution_mode === 'self'
                    ? ' · Self'
                    : release.distribution_mode === 'distrokid'
                      ? ' · DistroKid'
                      : ''}
                </span>
                <VerifiedStoreIcons
                  storeLinks={storeLinks}
                  onOpenDelivery={() => goToStep('delivery')}
                />
              </div>
            </div>
            <ReleaseReadinessRing score={copyright?.readiness_score ?? 0} size={72} />
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <button
              type="button"
              onClick={() => goToStep('metadata')}
              className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm"
              title="Edit metadata"
            >
              Edit metadata
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!confirm('Delete release?')) return
                await fetch(`/api/studio/releases/${releaseId}`, { method: 'DELETE' })
                router.push('/studio/releases')
              }}
              className="p-2 rounded-lg bg-zinc-800 hover:bg-red-900/50 text-zinc-300"
            >
              <FaTrash />
            </button>
            {release.distributor_status !== 'live' && (
              <>
                <button
                  type="button"
                  onClick={() => handleGoLive(false)}
                  disabled={goingLive}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-violet-600 hover:bg-violet-500 font-semibold text-sm disabled:opacity-50"
                >
                  <FaRocket />
                  {goingLive ? 'Publishing…' : 'Go live on SERGIK'}
                </button>
                <button
                  type="button"
                  onClick={() => handleGoLive(true)}
                  disabled={goingLive}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-zinc-600 text-zinc-400 text-sm hover:border-zinc-500"
                >
                  <FaBolt />
                  Force launch
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <WorkflowStepper
        activeStep={activeStep}
        completedSteps={completedSteps}
        onStepClick={goToStep}
        onCompleteWithAi={(step) => {
          goToStep(step)
          const prompt = getStudioStepAiPrompt(step, releaseId, release.title)
          dispatchAdminAiPrompt({
            message: prompt.message,
            agentMode: prompt.agentMode,
          })
        }}
      />

      {activeStep === 'catalog' && (
        <TrackCatalogEditor
          tracks={tracks}
          releaseId={releaseId}
          releaseTitle={release.title}
          releaseDate={release.release_date}
          releaseExplicit={release.explicit}
          albumArtist={release.album_artist || release.label_name}
          onUpdated={load}
          focusRequest={actionFocus?.step === 'catalog' ? actionFocus : null}
          onFocusHandled={clearActionFocus}
        />
      )}

      {activeStep === 'metadata' && (
        <MetadataPanel
          releaseId={releaseId}
          artworkUrl={release.artwork_url}
          tracks={tracks}
          form={editForm}
          onFormChange={setEditForm}
          saving={saving}
          focusRequest={actionFocus?.step === 'metadata' ? actionFocus : null}
          onFocusHandled={clearActionFocus}
          onSave={() =>
            patchRelease({
              ...editForm,
              p_line_year: editForm.p_line_year ? Number(editForm.p_line_year) : null,
              c_line_year: editForm.c_line_year ? Number(editForm.c_line_year) : null,
              original_release_date: editForm.original_release_date || null,
              previously_released:
                editForm.previously_released === '' ? null : editForm.previously_released === 'yes',
              previous_isrc: editForm.previous_isrc || null,
              previous_upc: editForm.previous_upc || null,
              language: editForm.language || 'en',
              artwork_owned: editForm.artwork_owned,
              artwork_designer: editForm.artwork_designer.trim() || null,
              artwork_photographer: editForm.artwork_photographer.trim() || null,
              artwork_illustrator: editForm.artwork_illustrator.trim() || null,
            })
          }
          onArtworkUploaded={async (url) => {
            await patchRelease({ artwork_url: url })
          }}
          onVaultImported={() => {
            showNotification('Filled from Music Vault + Sonic DNA', 'success')
            void load()
          }}
        />
      )}

      {activeStep === 'rights' && (
        <CopyrightPanel
          readiness={copyright}
          releaseId={releaseId}
          releaseTitle={release.title}
          albumArtist={release.album_artist || release.label_name}
          tracks={tracks}
          saving={saving}
          onToggle={(field, value) => updateCopyright({ [field]: value })}
          onOpsChange={(field, value) => updateCopyright({ [field]: value })}
          onUpdate={(payload) => updateCopyright(payload)}
          onUgcChange={(pack) => updateCopyright({ ugc_pack: pack })}
          onTrackRightsChange={(trackId, patch) => void updateTrackRights(trackId, patch)}
          onApplyPublisherToTracks={(patch) => void applyPublisherToTracks(patch)}
          onAssignMissingIsrcs={() => void assignMissingIsrcs()}
          onSeedSplits={() => void seedSplitsFromCredits()}
          onNavigate={goToStep}
          focusRequest={actionFocus?.step === 'rights' ? actionFocus : null}
          onFocusHandled={clearActionFocus}
          attestations={parseAttestations(release.ingest_attestations)}
          onAttestationsChange={(next) => void patchRelease({ ingest_attestations: next, artwork_owned: next.artwork_owned })}
        />
      )}

      {activeStep === 'copy' && (
        <CopywritingStudio
          title={release.title}
          type={release.type}
          genre={editForm.genre || release.genre}
          subgenre={editForm.subgenre || release.subgenre}
          description={editForm.description || release.description}
          releaseId={releaseId}
          albumArtist={editForm.album_artist || release.album_artist || release.label_name}
          labelName={editForm.label_name || release.label_name}
          language={editForm.language || release.language}
          streetDate={editForm.release_date || release.release_date}
          year={
            (editForm.release_date || release.release_date)
              ? Number(String(editForm.release_date || release.release_date).slice(0, 4))
              : null
          }
          artworkDesigner={editForm.artwork_designer || release.artwork_designer}
          artworkPhotographer={editForm.artwork_photographer || release.artwork_photographer}
          artworkIllustrator={editForm.artwork_illustrator || release.artwork_illustrator}
          tracks={tracks}
          copy={marketingCopy}
          onChange={setMarketingCopy}
          onDescriptionDraft={(blurb) => {
            if (!editForm.description.trim()) {
              setEditForm((form) => ({ ...form, description: blurb }))
            }
          }}
          onSave={() => patchRelease({ marketing_copy: marketingCopy })}
          saving={saving}
        />
      )}

      {activeStep === 'delivery' && (
        <DspDeliveryBoard
          releaseId={releaseId}
          title={release.title}
          upc={release.upc}
          spotifyArtistId={release.spotify_artist_id}
          appleArtistId={release.apple_artist_id}
          youtubeArtistId={release.youtube_artist_id}
          instagramHandle={release.instagram_handle}
          facebookPageId={release.facebook_page_id}
          isrcs={tracks.map((track) => String(track.isrc_full || '')).filter(Boolean)}
          targetStores={targetStores}
          storeLinks={storeLinks}
          onTargetsChange={(stores) => {
            setTargetStores(stores)
            patchRelease({ target_stores: stores })
          }}
          onPackageChange={(partial) => void patchRelease(partial)}
          onAddLink={addStoreLink}
          onRemoveLink={removeStoreLink}
          onConnected={() => void load()}
          previouslyReleased={release.previously_released}
          focusRequest={actionFocus?.step === 'delivery' ? actionFocus : null}
          onFocusHandled={clearActionFocus}
          isLive={release.distributor_status === 'live'}
        />
      )}

      {activeStep === 'launch' && (
        <LaunchPanel
          releaseId={releaseId}
          title={release.title}
          isLive={release.distributor_status === 'live'}
          goingLive={goingLive}
          copyright={copyright}
          hasArtwork={Boolean(release.artwork_url)}
          hasGenre={Boolean(release.genre)}
          hasReleaseDate={Boolean(release.release_date)}
          trackCount={tracks.length}
          tracks={tracks}
          storeLinkCount={storeLinks.length}
          targetStoreCount={targetStores.length}
          copyFilled={copyFilled}
          handoff={handoff}
          onGoLive={handleGoLive}
          onEnsureHandoff={ensureHandoff}
          handoffLoading={handoffLoading}
          attestations={parseAttestations(release.ingest_attestations)}
          onAttestationsChange={(next) =>
            void patchRelease({ ingest_attestations: next, artwork_owned: next.artwork_owned })
          }
          previouslyReleased={release.previously_released}
          onContinuityUpdated={() => void load()}
          distributorMeta={{
            title: release.title,
            album_artist: release.album_artist,
            label_name: release.label_name,
            upc: release.upc,
            catalog_number: release.catalog_number,
            genre: release.genre,
            release_date: release.release_date,
            artwork_url: release.artwork_url,
            p_line_year: release.p_line_year,
            c_line_year: release.c_line_year,
            spotify_artist_id: release.spotify_artist_id,
            apple_artist_id: release.apple_artist_id,
            youtube_artist_id: release.youtube_artist_id,
          }}
        />
      )}

      {headerMenu ? (
        <StudioContextMenu
          open
          x={headerMenu.x}
          y={headerMenu.y}
          title={release.title}
          onClose={() => setHeaderMenu(null)}
          items={
            [
              {
                type: 'command',
                command: {
                  id: 'edit-metadata',
                  label: 'Edit metadata',
                  icon: <FaPen className="h-3 w-3" />,
                  onSelect: () => goToStep('metadata'),
                },
              },
              {
                type: 'command',
                command: {
                  id: 'catalog',
                  label: 'Add / edit tracks',
                  onSelect: () => goToStep('catalog'),
                },
              },
              { type: 'separator' },
              { type: 'heading', label: 'Workflow' },
              ...WORKFLOW_STEPS.map((step) => ({
                type: 'command' as const,
                command: {
                  id: `step-${step.id}`,
                  label: step.label,
                  onSelect: () => goToStep(step.id),
                },
              })),
              { type: 'separator' },
              { type: 'heading', label: 'Commands' },
              {
                type: 'command',
                command: {
                  id: 'copy-link',
                  label: 'Copy studio link',
                  icon: <FaLink className="h-3 w-3" />,
                  onSelect: () => {
                    void navigator.clipboard.writeText(
                      `${window.location.origin}${studioReleaseHref(releaseId, activeStep)}`
                    )
                    showNotification('Studio link copied', 'success')
                  },
                },
              },
              {
                type: 'command',
                command: {
                  id: 'copy-id',
                  label: 'Copy release ID',
                  icon: <FaCopy className="h-3 w-3" />,
                  onSelect: () => {
                    void navigator.clipboard.writeText(releaseId)
                    showNotification('Release ID copied', 'success')
                  },
                },
              },
              {
                type: 'command',
                command: {
                  id: 'ask-ai',
                  label: 'Ask AI about this step',
                  icon: <FaBrain className="h-3 w-3 text-violet-400" />,
                  onSelect: () => {
                    const prompt = getStudioStepAiPrompt(activeStep, releaseId, release.title)
                    dispatchAdminAiPrompt({
                      message: prompt.message,
                      agentMode: prompt.agentMode,
                    })
                  },
                },
              },
              ...(release.distributor_status !== 'live'
                ? [
                    {
                      type: 'command' as const,
                      command: {
                        id: 'go-live',
                        label: 'Go live on SERGIK',
                        icon: <FaRocket className="h-3 w-3" />,
                        onSelect: () => void handleGoLive(false),
                      },
                    },
                  ]
                : []),
              { type: 'separator' },
              {
                type: 'command',
                command: {
                  id: 'delete',
                  label: 'Delete release',
                  icon: <FaTrash className="h-3 w-3" />,
                  danger: true,
                  onSelect: () => {
                    void (async () => {
                      if (!confirm('Delete release?')) return
                      await fetch(`/api/studio/releases/${releaseId}`, { method: 'DELETE' })
                      router.push('/studio/releases')
                    })()
                  },
                },
              },
            ] satisfies StudioContextMenuEntry[]
          }
        />
      ) : null}
    </div>
  )
}
