'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { useAdminAiPageContext } from '@/contexts/AdminAiPageContext'
import { useNotifications } from '@/contexts/NotificationContext'
import { dispatchAdminAiPrompt } from '@/lib/admin-ai-client'
import { getStudioStepAiPrompt } from '@/lib/studio/admin-ai-step-prompts'
import {
  STATUS_STYLES,
  type DspStoreId,
  type MarketingCopy,
  type WorkflowStepId,
} from '@/lib/studio/constants'
import type { CopyrightReadiness } from '@/lib/studio/copyright-pipeline'
import WorkflowStepper from './WorkflowStepper'
import CopyrightPanel from './CopyrightPanel'
import CopywritingStudio from './CopywritingStudio'
import DspDeliveryBoard, { type StoreLinkRow } from './DspDeliveryBoard'
import ReleaseReadinessRing from './ReleaseReadinessRing'
import AiField from '@/components/AiField'
import TrackCatalogEditor from './TrackCatalogEditor'
import { FaRocket, FaEdit, FaTrash, FaSave, FaTimes, FaBolt } from 'react-icons/fa'

type Release = {
  id: string
  title: string
  type: string
  release_date: string | null
  artwork_url: string | null
  description: string | null
  explicit: boolean
  genre: string | null
  subgenre: string | null
  label_name: string | null
  upc: string | null
  distributor_status: string
  distribution_mode?: string | null
  target_stores?: DspStoreId[] | null
  marketing_copy?: MarketingCopy | null
}

type Props = { releaseId: string }

export default function ReleaseStudioWorkspace({ releaseId }: Props) {
  const router = useRouter()
  const { showNotification } = useNotifications()
  const { setStudioRelease } = useAdminAiPageContext()
  const [release, setRelease] = useState<Release | null>(null)
  const [tracks, setTracks] = useState<any[]>([])
  const [storeLinks, setStoreLinks] = useState<StoreLinkRow[]>([])
  const [copyright, setCopyright] = useState<CopyrightReadiness | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeStep, setActiveStep] = useState<WorkflowStepId>('catalog')
  const [marketingCopy, setMarketingCopy] = useState<MarketingCopy>({})
  const [targetStores, setTargetStores] = useState<DspStoreId[]>([])
  const [saving, setSaving] = useState(false)
  const [goingLive, setGoingLive] = useState(false)
  const [editingMeta, setEditingMeta] = useState(false)
  const [editForm, setEditForm] = useState({
    title: '',
    type: 'single',
    release_date: '',
    genre: '',
    subgenre: '',
    description: '',
    explicit: false,
    upc: '',
  })

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
      setMarketingCopy((data.release.marketing_copy as MarketingCopy) || {})
      setTargetStores((data.release.target_stores as DspStoreId[]) || [])
      setEditForm({
        title: data.release.title || '',
        type: data.release.type || 'single',
        release_date: data.release.release_date || '',
        genre: data.release.genre || '',
        subgenre: data.release.subgenre || '',
        description: data.release.description || '',
        explicit: data.release.explicit || false,
        upc: data.release.upc || '',
      })
    } catch (e: unknown) {
      showNotification(e instanceof Error ? e.message : 'Load failed', 'error')
    } finally {
      setLoading(false)
    }
  }, [releaseId, showNotification])

  useEffect(() => {
    load()
  }, [load])

  const completedSteps = useMemo((): WorkflowStepId[] => {
    if (!copyright) return []
    const done: WorkflowStepId[] = []
    if (copyright.checks.has_tracks && copyright.checks.tracks_have_isrc) done.push('catalog')
    if (release?.artwork_url && release.genre) done.push('metadata')
    if (copyright.checks.ready_to_distribute) done.push('rights')
    const copyFilled = Object.values(marketingCopy).some((v) => v && String(v).length > 10)
    if (copyFilled) done.push('copy')
    if (storeLinks.length > 0 || targetStores.length > 0) done.push('delivery')
    if (release?.distributor_status === 'live') done.push('launch')
    return done
  }, [copyright, release, marketingCopy, storeLinks, targetStores])

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

  async function patchRelease(partial: Record<string, unknown>) {
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
      showNotification('Saved', 'success')
    } catch (e: unknown) {
      showNotification(e instanceof Error ? e.message : 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function updateCopyright(field: string, value: boolean | string) {
    setSaving(true)
    try {
      const res = await fetch(`/api/studio/releases/${releaseId}/copyright`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      if (!res.ok) throw new Error('Copyright update failed')
      const data = await res.json()
      setCopyright(data.readiness)
    } catch (e: unknown) {
      showNotification(e instanceof Error ? e.message : 'Update failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleGoLive(force = false) {
    if (!confirm(force ? 'Force go-live? Bypasses strict rights checks.' : 'Publish this release on SERGIK?')) return
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
      showNotification('Release is live on SERGIK', 'success')
      await load()
      setActiveStep('launch')
    } catch (e: unknown) {
      showNotification(e instanceof Error ? e.message : 'Go-live failed', 'error')
    } finally {
      setGoingLive(false)
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
  const inputClass =
    'w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-violet-500'

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
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{release.title}</h1>
              <p className="text-zinc-500 mt-1 capitalize">
                {release.type}
                {release.release_date ? ` · ${release.release_date}` : ''}
              </p>
              <span
                className={`inline-block mt-3 px-3 py-1 rounded-full text-xs font-medium ring-1 ${statusStyle.bg} ${statusStyle.text} ${statusStyle.ring}`}
              >
                {statusStyle.label}
                {release.distribution_mode === 'self' ? ' · Self' : ''}
              </span>
            </div>
            <ReleaseReadinessRing score={copyright?.readiness_score ?? 0} size={72} />
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <button
              type="button"
              onClick={() => setEditingMeta((v) => !v)}
              className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
              title="Edit metadata"
            >
              <FaEdit />
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
        onStepClick={setActiveStep}
        onCompleteWithAi={(step) => {
          setActiveStep(step)
          const prompt = getStudioStepAiPrompt(step, releaseId, release.title)
          dispatchAdminAiPrompt({
            message: prompt.message,
            agentMode: prompt.agentMode,
          })
        }}
      />

      {editingMeta && (
        <div
          className="rounded-xl border border-violet-500/40 bg-zinc-900/60 p-6 space-y-4"
          data-ai-scope={JSON.stringify({
            entityType: 'distribution_release',
            entityId: releaseId,
            entityLabel: release.title,
            formId: 'release_metadata',
          })}
        >
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-zinc-500">Title</label>
              <AiField
                fieldKey="release.title"
                label="Release title"
                entityType="distribution_release"
                entityId={releaseId}
                entityLabel={release.title}
                formId="release_metadata"
                className={inputClass}
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500">UPC</label>
              <AiField
                fieldKey="release.upc"
                label="UPC"
                entityType="distribution_release"
                entityId={releaseId}
                hint="Auto-generated on launch if empty"
                formId="release_metadata"
                className={inputClass}
                value={editForm.upc}
                onChange={(e) => setEditForm({ ...editForm, upc: e.target.value })}
                placeholder="Auto-generated on launch if empty"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={async () => {
                await patchRelease(editForm)
                setEditingMeta(false)
              }}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm"
            >
              <FaSave /> Save
            </button>
            <button
              type="button"
              onClick={() => setEditingMeta(false)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-700 text-sm"
            >
              <FaTimes /> Cancel
            </button>
          </div>
        </div>
      )}

      {activeStep === 'catalog' && (
        <TrackCatalogEditor
          tracks={tracks}
          releaseId={releaseId}
          releaseTitle={release.title}
          onUpdated={load}
        />
      )}

      {activeStep === 'rights' && (
        <CopyrightPanel
          readiness={copyright}
          releaseId={releaseId}
          releaseTitle={release.title}
          saving={saving}
          onToggle={(field, value) => updateCopyright(field, value)}
          onOpsChange={(field, value) => updateCopyright(field, value)}
        />
      )}

      {activeStep === 'copy' && (
        <CopywritingStudio
          title={release.title}
          genre={release.genre}
          releaseId={releaseId}
          copy={marketingCopy}
          onChange={setMarketingCopy}
          onSave={() => patchRelease({ marketing_copy: marketingCopy })}
          saving={saving}
        />
      )}

      {activeStep === 'delivery' && (
        <DspDeliveryBoard
          targetStores={targetStores}
          storeLinks={storeLinks}
          onTargetsChange={(stores) => {
            setTargetStores(stores)
            patchRelease({ target_stores: stores })
          }}
          onAddLink={addStoreLink}
          onRemoveLink={removeStoreLink}
        />
      )}

      {(activeStep === 'metadata' || activeStep === 'launch') && (
        <div className="rounded-xl border border-zinc-800 p-6 text-zinc-400 text-sm">
          {activeStep === 'metadata' && (
            <p>
              Use the edit button above for title, dates, genre, and UPC. Upload artwork via
              Create Release flow or music library.
            </p>
          )}
          {activeStep === 'launch' && release.distributor_status === 'live' && (
            <p className="text-emerald-400">
              This release is live on your public music page. Add store links in Delivery.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
