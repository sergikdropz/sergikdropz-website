'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  FaCalendarAlt,
  FaCheck,
  FaCopy,
  FaDownload,
  FaExternalLinkAlt,
  FaEye,
  FaLink,
  FaSpinner,
  FaSync,
  FaTimes,
  FaVideo,
} from 'react-icons/fa'
import { useNotifications } from '@/contexts/NotificationContext'
import MetaPromoConnect from '@/components/studio/MetaPromoConnect'
import CopywritingStudio from '@/components/studio/CopywritingStudio'
import PromoCardsGallery from '@/components/studio/PromoCardsGallery'
import StoryStylePicker from '@/components/studio/StoryStylePicker'
import VinylSectionPlayer, { type VinylAudition } from '@/components/studio/VinylSectionPlayer'
import {
  resolveStoryClipDuration,
  storyClipLengthChoices,
  type StoryClipLengthChoice,
} from '@/lib/shares/story-snippet'
import { dispatchAdminAiBrowserHydrate } from '@/lib/admin-ai-client'
import { buildSocialPromoBrowserHydrate } from '@/lib/ai/social-promo-browser-hydrate'
import {
  badgeForPost,
  buildSocialFeedSquareBlob,
  buildSocialStoryStillBlob,
  buildSocialStoryVideoBlob,
  downloadSocialFeedSquare,
  downloadSocialStoryStill,
  downloadSocialStoryVideo,
} from '@/lib/studio/social-promo-assets'
import {
  formatPromoSlotLocal,
  PROMO_SHARE_OG_LABEL,
  socialPromoChannelLabel,
  SOCIAL_PROMO_STATUSES,
  type SocialPromoPlan,
  type SocialPromoPost,
  type SocialPromoSummary,
} from '@/lib/studio/social-promo'
import type { MarketingCopy } from '@/lib/studio/constants'
import { DEFAULT_STORY_LOOK, storyTapePeaksFromBody, type StoryLook } from '@/lib/studio/story-look'

type TrackRow = {
  id: string
  title: string
  wav_url: string | null
  preview_start_seconds: number | null
  artist?: string | null
  music_library_track_id?: string | null
  bpm?: number | null
  duration_seconds?: number | null
  track_number?: number | null
  contributors?: unknown
}

type Props = {
  releaseId?: string
  title: string
  artworkUrl?: string | null
  artist?: string | null
  streetDate?: string | null
  compact?: boolean
  onChanged?: () => void
  /** Public collaborator view. Hides Meta connect, publish, and schedule edits. */
  shareToken?: string
}

export default function SocialPromoPanel({
  releaseId,
  title,
  artworkUrl,
  artist,
  streetDate,
  compact,
  onChanged,
  shareToken,
}: Props) {
  const shared = Boolean(shareToken)
  const { showNotification } = useNotifications()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busyAsset, setBusyAsset] = useState<string | null>(null)
  const [, setKitProgress] = useState<string | null>(null)
  const [plan, setPlan] = useState<SocialPromoPlan | null>(null)
  const [, setSummary] = useState<SocialPromoSummary | null>(null)
  const [tracks, setTracks] = useState<TrackRow[]>([])
  const [columnMissing, setColumnMissing] = useState(false)
  const [selectedTrackId, setSelectedTrackId] = useState<string>('')
  const [resolvedArtwork, setResolvedArtwork] = useState<string | null>(artworkUrl || null)
  const [albumArtist, setAlbumArtist] = useState<string | null>(artist || null)
  const [resolvedStreet, setResolvedStreet] = useState<string | null>(streetDate || null)
  const [resolvedTitle, setResolvedTitle] = useState(title)
  const [sharing, setSharing] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const [shareMissing, setShareMissing] = useState(false)
  const [clipStartSec, setClipStartSec] = useState(0)
  const [clipLength, setClipLength] = useState<StoryClipLengthChoice>(15)
  const [audioDurationSec, setAudioDurationSec] = useState(0)
  const [storyLook, setStoryLook] = useState<StoryLook>(DEFAULT_STORY_LOOK)
  const [marketingCopy, setMarketingCopy] = useState<MarketingCopy>({})
  const [savingCopy, setSavingCopy] = useState(false)
  const [copyRelease, setCopyRelease] = useState({
    type: '',
    genre: '',
    subgenre: '',
    description: '',
    labelName: '',
    language: '',
  })
  const [tapePeaks, setTapePeaks] = useState<number[] | null>(null)
  const auditionRef = useRef<VinylAudition | null>(null)
  const [assetPreview, setAssetPreview] = useState<{
    postLabel: string
    assetKind: SocialPromoPost['asset']
    kind: 'image' | 'video' | 'caption'
    objectUrl: string
    mimeType?: string
    caption?: string
  } | null>(null)

  const selectedTrack =
    tracks.find((t) => t.id === selectedTrackId) || tracks.find((t) => t.wav_url) || null
  const hasAudio = Boolean(selectedTrack?.wav_url)
  const lookArtist = selectedTrack?.artist?.trim() || albumArtist?.trim() || 'SERGIK'
  const tapeFields = {
    peaks: tapePeaks,
    trackDurationSec: selectedTrack?.duration_seconds ?? null,
    bpm: selectedTrack?.bpm ?? null,
    timeOriginSec: clipStartSec,
  }

  useEffect(() => {
    setClipStartSec(Math.max(0, Number(selectedTrack?.preview_start_seconds) || 0))
    setAudioDurationSec(0)
  }, [selectedTrack?.id, selectedTrack?.preview_start_seconds])

  const knownTrackSec =
    audioDurationSec > 0
      ? audioDurationSec
      : Number(selectedTrack?.duration_seconds) > 0
        ? Number(selectedTrack?.duration_seconds)
        : 0
  useEffect(() => {
    if (!knownTrackSec) return
    if (!storyClipLengthChoices(knownTrackSec).includes(clipLength)) setClipLength('full')
  }, [knownTrackSec, clipLength])
  const clipDurationSec = resolveStoryClipDuration(clipLength, knownTrackSec || null)

  useEffect(() => {
    const libraryId = selectedTrack?.music_library_track_id?.trim()
    if (!libraryId) {
      setTapePeaks(null)
      return
    }
    let cancelled = false
    fetch(`/api/audio/waveform?trackId=${encodeURIComponent(libraryId)}`)
      .then(async (response) => {
        if (!response.ok) return null
        const body = await response.json()
        return storyTapePeaksFromBody(body)
      })
      .then((peaks) => {
        if (!cancelled) setTapePeaks(peaks)
      })
      .catch(() => {
        if (!cancelled) setTapePeaks(null)
      })
    return () => {
      cancelled = true
    }
  }, [selectedTrack?.music_library_track_id])
  const opsBusy = Boolean(busyAsset)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setShareMissing(false)
      const res = await fetch(
        shareToken
          ? `/api/promo/${encodeURIComponent(shareToken)}`
          : `/api/studio/releases/${encodeURIComponent(releaseId || '')}/social-promo`
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (shareToken && res.status === 404) {
          setShareMissing(true)
          return
        }
        throw new Error(data.error || 'Failed to load social promo')
      }
      setPlan(data.plan || null)
      setSummary(data.summary || null)
      setTracks(data.tracks || [])
      setColumnMissing(Boolean(data.column_missing))
      setResolvedTitle(data.release?.title || title)
      setResolvedArtwork(
        data.release?.artwork_resolved || data.release?.artwork_url || artworkUrl || null
      )
      setAlbumArtist(data.release?.album_artist || artist || 'SERGIK')
      setResolvedStreet(data.release?.release_date || streetDate || null)
      setMarketingCopy(
        data.marketing_copy && typeof data.marketing_copy === 'object' ? data.marketing_copy : {}
      )
      setCopyRelease({
        type: typeof data.release?.type === 'string' ? data.release.type : '',
        genre: typeof data.release?.genre === 'string' ? data.release.genre : '',
        subgenre: typeof data.release?.subgenre === 'string' ? data.release.subgenre : '',
        description: typeof data.release?.description === 'string' ? data.release.description : '',
        labelName: typeof data.release?.label_name === 'string' ? data.release.label_name : '',
        language: typeof data.release?.language === 'string' ? data.release.language : '',
      })
      const firstWithAudio = (data.tracks || []).find((t: TrackRow) => t.wav_url)
      setSelectedTrackId(firstWithAudio?.id || data.tracks?.[0]?.id || '')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load social promo'
      showNotification(message, 'error')
    } finally {
      setLoading(false)
    }
  }, [artworkUrl, artist, releaseId, shareToken, showNotification, streetDate, title])

  useEffect(() => {
    load()
  }, [load])

  async function saveMarketingCopy() {
    if (!shareToken && !releaseId) return
    setSavingCopy(true)
    try {
      const res = await fetch(
        shareToken
          ? `/api/promo/${encodeURIComponent(shareToken)}`
          : `/api/studio/releases/${encodeURIComponent(releaseId || '')}/social-promo`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ marketing_copy: marketingCopy }),
        }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not save copy')
      if (data.marketing_copy && typeof data.marketing_copy === 'object') {
        setMarketingCopy(data.marketing_copy)
      }
      showNotification('Copy saved', 'success')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Could not save copy'
      showNotification(message, 'error')
    } finally {
      setSavingCopy(false)
    }
  }

  useEffect(() => {
    return () => {
      if (assetPreview?.objectUrl) URL.revokeObjectURL(assetPreview.objectUrl)
    }
  }, [assetPreview?.objectUrl])

  function closeAssetPreview() {
    setAssetPreview((prev) => {
      if (prev?.objectUrl) URL.revokeObjectURL(prev.objectUrl)
      return null
    })
  }

  async function previewForPost(post: SocialPromoPost) {
    const key = `${post.id}-preview`
    setBusyAsset(key)
    closeAssetPreview()
    try {
      const badge = badgeForPost(post)
      if (post.asset === 'caption_only') {
        setAssetPreview({
          postLabel: post.label,
          assetKind: post.asset,
          kind: 'caption',
          objectUrl: '',
          caption: post.caption,
        })
        return
      }
      if (post.asset === 'feed_square') {
        const { blob } = await buildSocialFeedSquareBlob({
          artworkUrl: resolvedArtwork,
          title: resolvedTitle,
          artist: lookArtist,
          badge,
          cta: 'Listen · link in bio',
          look: storyLook, ...tapeFields,
        })
        setAssetPreview({
          postLabel: post.label,
          assetKind: post.asset,
          kind: 'image',
          objectUrl: URL.createObjectURL(blob),
          mimeType: blob.type,
        })
        return
      }
      if (post.asset === 'story_static') {
        const { blob } = await buildSocialStoryStillBlob({
          artworkUrl: resolvedArtwork,
          title: resolvedTitle,
          artist: lookArtist,
          badge,
          cta: 'Add link sticker',
          look: storyLook, ...tapeFields,
        })
        setAssetPreview({
          postLabel: post.label,
          assetKind: post.asset,
          kind: 'image',
          objectUrl: URL.createObjectURL(blob),
          mimeType: blob.type,
        })
        return
      }
      if (post.asset === 'story_video') {
        if (!selectedTrack?.wav_url) {
          throw new Error('Add a WAV to Catalog before previewing story/reel video')
        }
        const { blob, mimeType } = await buildSocialStoryVideoBlob({
          artworkUrl: resolvedArtwork,
          title: selectedTrack.title || resolvedTitle,
          artist: lookArtist,
          audioUrl: selectedTrack.wav_url,
          startSec: clipStartSec,
          durationSec: clipDurationSec,
          look: storyLook, ...tapeFields,
          badge,
          cta:
            post.channel === 'instagram_reel'
              ? 'OUT NOW · link in bio'
              : 'Listen · link sticker',
          onProgress: (phase, ratio) => {
            setKitProgress(`${phase} ${Math.round((ratio || 0) * 100)}%`)
          },
        })
        setAssetPreview({
          postLabel: post.label,
          assetKind: post.asset,
          kind: 'video',
          objectUrl: URL.createObjectURL(blob),
          mimeType,
        })
        return
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Preview failed'
      showNotification(message, 'error')
    } finally {
      setBusyAsset(null)
      setKitProgress(null)
    }
  }

  async function generatePlan() {
    setSaving(true)
    try {
      const res = await fetch(`/api/studio/releases/${encodeURIComponent(releaseId || '')}/social-promo`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          generate: true,
          street_date: resolvedStreet || streetDate || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || data.hint || 'Failed to generate schedule')
      setPlan(data.plan)
      setSummary(data.summary)
      showNotification('Promo schedule generated (Meta / IG optimized)', 'success')
      onChanged?.()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Generate failed'
      showNotification(message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function patchPost(post: Partial<SocialPromoPost> & { id: string }) {
    setSaving(true)
    try {
      const res = await fetch(`/api/studio/releases/${encodeURIComponent(releaseId || '')}/social-promo`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to update post')
      setPlan(data.plan)
      setSummary(data.summary)
      onChanged?.()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Update failed'
      showNotification(message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function markPostsReady(ids: string[]) {
    if (!ids.length || !plan) return
    setSaving(true)
    try {
      let next = plan
      for (const id of ids) {
        const row = next.posts.find((p) => p.id === id)
        if (!row || row.status !== 'planned') continue
        const res = await fetch(`/api/studio/releases/${encodeURIComponent(releaseId || '')}/social-promo`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ post: { id, status: 'ready' } }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Failed to mark assets ready')
        next = data.plan
        setPlan(data.plan)
        setSummary(data.summary)
      }
      onChanged?.()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Could not mark ready'
      showNotification(message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function copyCaption(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      showNotification('Caption copied', 'success')
    } catch {
      showNotification('Could not copy caption', 'error')
    }
  }

  function hydrateDesk(post: SocialPromoPost) {
    const detail = buildSocialPromoBrowserHydrate({
      releaseId: releaseId || '',
      releaseTitle: resolvedTitle,
      post,
    })
    dispatchAdminAiBrowserHydrate(detail)
    showNotification(
      `Opened Admin browser on ${detail.deskLabel} with “${post.label}”. Paste caption when the compose box is focused.`,
      'success'
    )
  }

  async function publishNow(post: SocialPromoPost) {
    setSaving(true)
    try {
      const res = await fetch(
        `/api/studio/releases/${encodeURIComponent(releaseId || '')}/social-promo/publish`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'now', post_id: post.id }),
        }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Meta publish failed')
      if (data.plan) setPlan(data.plan)
      if (data.summary) setSummary(data.summary)
      const row = Array.isArray(data.results)
        ? data.results.find((item: { id?: string }) => item.id === post.id)
        : null
      if (row?.ok) {
        showNotification(row.permalink ? 'Published to Meta.' : 'Sent to Meta.', 'success')
      } else {
        showNotification(row?.reason || 'Meta did not publish this slot.', 'error')
      }
      onChanged?.()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Meta publish failed'
      showNotification(message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function downloadForPost(post: SocialPromoPost) {
    const key = `${post.id}-dl`
    setBusyAsset(key)
    try {
      const badge = badgeForPost(post)
      if (post.asset === 'feed_square') {
        await downloadSocialFeedSquare({
          artworkUrl: resolvedArtwork,
          title: resolvedTitle,
          artist: lookArtist,
          badge,
          cta: 'Listen · link in bio',
          look: storyLook, ...tapeFields,
        })
      } else if (post.asset === 'story_static') {
        await downloadSocialStoryStill({
          artworkUrl: resolvedArtwork,
          title: resolvedTitle,
          artist: lookArtist,
          badge,
          cta: 'Add link sticker',
          look: storyLook, ...tapeFields,
        })
      } else if (post.asset === 'story_video') {
        if (!selectedTrack?.wav_url) {
          throw new Error('Add a WAV to Catalog before exporting story/reel video')
        }
        await downloadSocialStoryVideo({
          artworkUrl: resolvedArtwork,
          title: selectedTrack.title || resolvedTitle,
          artist: lookArtist,
          audioUrl: selectedTrack.wav_url,
          startSec: clipStartSec,
          durationSec: clipDurationSec,
          look: storyLook, ...tapeFields,
          badge,
          cta:
            post.channel === 'instagram_reel'
              ? 'OUT NOW · link in bio'
              : 'Listen · link sticker',
        })
      } else {
        await copyCaption(post.caption)
        return
      }
      showNotification('Preview downloaded — upload in Meta Business Suite / IG', 'success')
      if (post.status === 'planned') {
        await patchPost({ id: post.id, status: 'ready' })
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Download failed'
      showNotification(message, 'error')
    } finally {
      setBusyAsset(null)
    }
  }

  async function copyText(url: string, okMessage: string) {
    const write = navigator.clipboard.writeText(url).catch(() => Promise.reject(new Error('clipboard')))
    const timeout = new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error('clipboard')), 800)
    })
    try {
      await Promise.race([write, timeout])
      showNotification(okMessage, 'success')
    } catch {
      showNotification(url, 'success')
    }
  }

  async function copyCollaboratorLink() {
    if (shared) {
      await copyText(window.location.href, 'Share link copied')
      return
    }
    if (!releaseId) return
    setSharing(true)
    try {
      const res = await fetch(
        `/api/studio/releases/${encodeURIComponent(releaseId || '')}/social-promo/share`,
        { method: 'POST' }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not create the collaborator link')
      const path = typeof data.path === 'string' ? data.path : ''
      if (!path) throw new Error('Could not create the collaborator link')
      const url = `${window.location.origin}${path}`
      if (data.plan) setPlan(data.plan)
      if (data.summary) setSummary(data.summary)
      await copyText(url, 'Collaborator link copied')
      setShareCopied(true)
      window.setTimeout(() => setShareCopied(false), 2000)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Could not copy the collaborator link'
      showNotification(message, 'error')
    } finally {
      setSharing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-zinc-500 text-sm py-4">
        <FaSpinner className="animate-spin" /> Loading social promo…
      </div>
    )
  }

  if (shareMissing) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-5 text-sm text-zinc-400">
        This promo link is no longer available.
      </div>
    )
  }

  const posts = plan?.posts || []

  return (
    <div
      className={`rounded-xl border border-zinc-800 bg-zinc-950/60 ${compact ? 'p-4' : 'p-5'}`}
      data-testid="social-promo-panel"
    >
      {shared ? null : (
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            disabled={sharing || !releaseId}
            onClick={() => void copyCollaboratorLink()}
            data-testid="social-promo-share"
            title="Copy a collaborator link. Meta publish stays in Studio."
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border border-violet-500/50 text-violet-100 hover:bg-violet-950/40 disabled:opacity-50"
          >
            {sharing ? <FaSpinner className="animate-spin" /> : <FaLink />}
            {shareCopied ? 'Link copied' : 'Share'}
          </button>
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center justify-center gap-3 text-center">
        <div>
          <h4 className="flex items-center justify-center gap-2 text-sm font-semibold text-white">
            <FaCalendarAlt className="text-violet-400" />
            {PROMO_SHARE_OG_LABEL}
          </h4>
        </div>
        <div className="flex flex-col items-stretch sm:items-end gap-2">
          <div className="flex flex-wrap justify-center gap-2">
            {shared ? null : (
            <button
              type="button"
              disabled={saving}
              onClick={generatePlan}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border border-zinc-700 text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
            >
              {saving && !opsBusy ? <FaSpinner className="animate-spin" /> : <FaSync />}
              {posts.length ? 'Regenerate schedule' : 'Generate schedule'}
            </button>
            )}
          </div>
        </div>
      </div>

      <PromoCardsGallery
        artworkUrl={resolvedArtwork}
        title={resolvedTitle}
        artist={lookArtist}
        streetDate={resolvedStreet}
      />

      {shared || !releaseId ? null : (
        <MetaPromoConnect
          releaseId={releaseId}
          saving={saving}
          onPublished={(nextPlan, nextSummary) => {
            setPlan(nextPlan)
            setSummary(nextSummary)
            onChanged?.()
          }}
        />
      )}

      {resolvedArtwork ? (
        <div className="flex items-center gap-3 mb-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resolvedArtwork}
            alt=""
            className="h-14 w-14 rounded-md object-cover border border-zinc-700"
          />
          <p className="text-[11px] text-zinc-500">
            Cover source for feed, story stills, the story look, and Spotify Canvas exports.
          </p>
        </div>
      ) : (
        <p className="text-xs text-amber-300 mb-4">
          No cover art resolved — add Metadata artwork (or DSP-ready cover) before downloading promo
          assets.
        </p>
      )}

      {columnMissing ? (
        <p className="text-xs text-amber-300 mb-3">
          Apply migration <code>add_social_promo_to_releases.sql</code> so schedules persist.
        </p>
      ) : null}

      {!resolvedStreet ? (
        <p className="text-xs text-amber-200/90 mb-3">
          No street date yet — slots generate without timestamps. Set Metadata → release date, then
          regenerate.
        </p>
      ) : null}

      <div className="mb-4 space-y-3">
        <StoryStylePicker
          artworkUrl={resolvedArtwork}
          title={selectedTrack?.title || resolvedTitle}
          artist={lookArtist}
          value={storyLook}
          onChange={setStoryLook}
          peaks={tapePeaks}
          trackDurationSec={selectedTrack?.duration_seconds}
          bpm={selectedTrack?.bpm}
          timeOriginSec={clipStartSec}
          audioUrl={selectedTrack?.wav_url}
          durationSec={clipDurationSec}
          auditionRef={auditionRef}
          streetDate={resolvedStreet}
          onShare={copyCollaboratorLink}
          previewAfter={(actions) =>
            hasAudio && selectedTrack?.wav_url ? (
              <VinylSectionPlayer
                audioUrl={selectedTrack.wav_url}
                auditionRef={auditionRef}
                startSec={clipStartSec}
                durationSec={clipDurationSec}
                clipLength={clipLength}
                onStartChange={setClipStartSec}
                onClipLengthChange={setClipLength}
                onTrackDuration={setAudioDurationSec}
                footer={actions}
                audioControl={
                  <label className="flex items-center gap-2 text-xs text-zinc-400">
                    Story / Reel audio
                    <select
                      title="Track for story / reel export"
                      value={selectedTrackId}
                      onChange={(e) => setSelectedTrackId(e.target.value)}
                      className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-200"
                    >
                      {tracks.map((t) => (
                        <option key={t.id} value={t.id} disabled={!t.wav_url}>
                          {t.title}
                          {!t.wav_url ? ' (no WAV)' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                }
              />
            ) : (
              <>
                {actions}
                <p className="text-center text-xs text-zinc-500">
                  Add Catalog WAVs to export the story and reel.
                </p>
              </>
            )
          }
        />
      </div>

      {posts.length === 0 ? (
        <p className="text-sm text-zinc-500 py-6 text-center">
          Generate a schedule, then download the assets zip — feed, stories, vinyl reels, Spotify
          Canvas, and captions in one folder.
        </p>
      ) : (
        <div className="overflow-x-auto border border-zinc-800 rounded-lg">
          <table className="min-w-full text-xs">
            <thead className="bg-zinc-900 text-zinc-400">
              <tr>
                <th className="text-left px-3 py-2">When</th>
                <th className="text-left px-3 py-2">Post</th>
                <th className="text-left px-3 py-2">Channel</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((post) => (
                <tr key={post.id} className="border-t border-zinc-800/80 align-top">
                  <td className="px-3 py-2 text-zinc-300 whitespace-nowrap">
                    {formatPromoSlotLocal(post.scheduled_at, plan?.timezone)}
                    <div className="text-[10px] text-zinc-600">
                      T{post.day_offset >= 0 ? '+' : ''}
                      {post.day_offset} · {post.local_time} PT
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <p className="text-white font-medium">{post.label}</p>
                    <p className="text-zinc-500 mt-0.5 max-w-xs">{post.hint}</p>
                    {post.meta_error ? (
                      <p className="text-amber-300/90 mt-1 max-w-xs">{post.meta_error}</p>
                    ) : null}
                    {post.meta_url ? (
                      <a
                        href={post.meta_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-violet-300 mt-1 inline-block"
                      >
                        View on Meta
                      </a>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-zinc-300">
                    {socialPromoChannelLabel(post.channel)}
                    <div className="text-[10px] text-zinc-600">{post.asset}</div>
                  </td>
                  <td className="px-3 py-2">
                    {shared ? (
                      <span className="text-zinc-300">
                        {SOCIAL_PROMO_STATUSES.find((s) => s.id === post.status)?.label || post.status}
                      </span>
                    ) : (
                      <select
                        title="Post status"
                        value={post.status}
                        disabled={saving}
                        onChange={(e) =>
                          patchPost({
                            id: post.id,
                            status: e.target.value as SocialPromoPost['status'],
                          })
                        }
                        className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1"
                      >
                        {SOCIAL_PROMO_STATUSES.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        disabled={
                          busyAsset === `${post.id}-preview` ||
                          (post.asset === 'story_video' && !hasAudio)
                        }
                        onClick={() => void previewForPost(post)}
                        data-testid={`social-asset-preview-${post.id}`}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded border border-violet-800/60 text-violet-200 hover:bg-violet-950/40 disabled:opacity-40"
                        title={
                          post.asset === 'story_video' && !hasAudio
                            ? 'Needs Catalog WAV'
                            : 'Preview generated asset in browser'
                        }
                      >
                        {busyAsset === `${post.id}-preview` ? (
                          <FaSpinner className="animate-spin" />
                        ) : (
                          <FaEye />
                        )}
                        Preview
                      </button>
                      <button
                        type="button"
                        disabled={busyAsset === `${post.id}-dl`}
                        onClick={() => downloadForPost(post)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded border border-zinc-700 hover:bg-zinc-800"
                        title="Download preview asset"
                      >
                        {busyAsset === `${post.id}-dl` ? (
                          <FaSpinner className="animate-spin" />
                        ) : post.asset === 'story_video' ? (
                          <FaVideo />
                        ) : (
                          <FaDownload />
                        )}
                        Asset
                      </button>
                      <button
                        type="button"
                        onClick={() => copyCaption(post.caption)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded border border-zinc-700 hover:bg-zinc-800"
                        title="Copy caption"
                      >
                        <FaCopy /> Caption
                      </button>
                      {shared ? null : (
                        <button
                          type="button"
                          onClick={() => hydrateDesk(post)}
                          data-testid={`social-hydrate-desk-${post.id}`}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-amber-800/70 text-amber-200 hover:bg-amber-950/40"
                          title="Open Admin AI browser on Instagram/Facebook and stage this caption — paste only when you click Paste caption"
                        >
                          <FaExternalLinkAlt /> Hydrate desk
                        </button>
                      )}
                      {!shared && post.asset !== 'story_video' &&
                      post.asset !== 'caption_only' &&
                      post.channel !== 'instagram_reel' &&
                      post.channel !== 'facebook_story' &&
                      post.status !== 'posted' ? (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void publishNow(post)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-blue-800/70 text-blue-200 hover:bg-blue-950/40 disabled:opacity-40"
                          title="Publish this image slot to Instagram or the Facebook Page now"
                        >
                          Post to Meta
                        </button>
                      ) : null}
                      {!shared && post.status !== 'posted' ? (
                        <button
                          type="button"
                          onClick={() => patchPost({ id: post.id, status: 'posted' })}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-emerald-800/60 text-emerald-300 hover:bg-emerald-950/40"
                        >
                          <FaCheck /> Posted
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {shared ? (
      <div className="mt-8">
        <CopywritingStudio
          title={resolvedTitle || 'New release'}
          type={copyRelease.type}
          genre={copyRelease.genre}
          subgenre={copyRelease.subgenre}
          description={copyRelease.description}
          releaseId={shared ? undefined : releaseId}
          albumArtist={lookArtist}
          labelName={copyRelease.labelName}
          language={copyRelease.language}
          streetDate={resolvedStreet}
          year={resolvedStreet ? Number(resolvedStreet.slice(0, 4)) : null}
          tracks={tracks.map((track) => ({
            title: track.title,
            track_number: track.track_number,
            duration: track.duration_seconds,
            contributors: track.contributors,
          }))}
          copy={marketingCopy}
          onChange={setMarketingCopy}
          onSave={() => void saveMarketingCopy()}
          saving={savingCopy}
          adminChrome={false}
        />
      </div>
      ) : null}

      {assetPreview ? (
        <div
          className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Asset preview: ${assetPreview.postLabel}`}
          onClick={closeAssetPreview}
        >
          <div
            className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-white">{assetPreview.postLabel}</p>
                <p className="text-[11px] text-zinc-500">{assetPreview.assetKind}</p>
              </div>
              <button
                type="button"
                onClick={closeAssetPreview}
                className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                aria-label="Close preview"
              >
                <FaTimes />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-black p-3">
              {assetPreview.kind === 'caption' ? (
                <pre className="max-h-[70vh] w-full whitespace-pre-wrap p-4 text-sm text-zinc-200">
                  {assetPreview.caption || '(empty caption)'}
                </pre>
              ) : assetPreview.kind === 'video' ? (
                <video
                  src={assetPreview.objectUrl}
                  controls
                  playsInline
                  className="max-h-[75vh] w-full rounded-lg object-contain"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={assetPreview.objectUrl}
                  alt={assetPreview.postLabel}
                  className="max-h-[75vh] w-full rounded-lg object-contain"
                />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
