'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  FaCalendarAlt,
  FaCheck,
  FaCopy,
  FaDownload,
  FaFileArchive,
  FaSpinner,
  FaSync,
  FaVideo,
} from 'react-icons/fa'
import { useNotifications } from '@/contexts/NotificationContext'
import {
  badgeForPost,
  downloadSocialFeedSquare,
  downloadSocialPromoAssetZip,
  downloadSocialStoryStill,
  downloadSocialStoryVideo,
  downloadSpotifyCanvas,
} from '@/lib/studio/social-promo-assets'
import {
  formatPromoSlotLocal,
  socialPromoChannelLabel,
  SOCIAL_PROMO_STATUSES,
  type SocialPromoPlan,
  type SocialPromoPost,
  type SocialPromoSummary,
} from '@/lib/studio/social-promo'

type TrackRow = {
  id: string
  title: string
  wav_url: string | null
  preview_start_seconds: number | null
}

type Props = {
  releaseId: string
  title: string
  artworkUrl?: string | null
  artist?: string | null
  streetDate?: string | null
  compact?: boolean
  onChanged?: () => void
}

export default function SocialPromoPanel({
  releaseId,
  title,
  artworkUrl,
  artist,
  streetDate,
  compact,
  onChanged,
}: Props) {
  const { showNotification } = useNotifications()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busyAsset, setBusyAsset] = useState<string | null>(null)
  const [kitProgress, setKitProgress] = useState<string | null>(null)
  const [plan, setPlan] = useState<SocialPromoPlan | null>(null)
  const [summary, setSummary] = useState<SocialPromoSummary | null>(null)
  const [tracks, setTracks] = useState<TrackRow[]>([])
  const [columnMissing, setColumnMissing] = useState(false)
  const [selectedTrackId, setSelectedTrackId] = useState<string>('')
  const [resolvedArtwork, setResolvedArtwork] = useState<string | null>(artworkUrl || null)
  const [resolvedArtist, setResolvedArtist] = useState<string | null>(artist || null)
  const [resolvedStreet, setResolvedStreet] = useState<string | null>(streetDate || null)

  const selectedTrack =
    tracks.find((t) => t.id === selectedTrackId) || tracks.find((t) => t.wav_url) || null
  const hasAudio = Boolean(selectedTrack?.wav_url)
  const opsBusy = Boolean(busyAsset)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/studio/releases/${encodeURIComponent(releaseId)}/social-promo`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to load social promo')
      setPlan(data.plan || null)
      setSummary(data.summary || null)
      setTracks(data.tracks || [])
      setColumnMissing(Boolean(data.column_missing))
      setResolvedArtwork(data.release?.artwork_url || artworkUrl || null)
      setResolvedArtist(data.release?.album_artist || artist || 'SERGIK')
      setResolvedStreet(data.release?.release_date || streetDate || null)
      const firstWithAudio = (data.tracks || []).find((t: TrackRow) => t.wav_url)
      setSelectedTrackId(firstWithAudio?.id || data.tracks?.[0]?.id || '')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load social promo'
      showNotification(message, 'error')
    } finally {
      setLoading(false)
    }
  }, [artworkUrl, artist, releaseId, showNotification, streetDate])

  useEffect(() => {
    load()
  }, [load])

  async function generatePlan() {
    setSaving(true)
    try {
      const res = await fetch(`/api/studio/releases/${encodeURIComponent(releaseId)}/social-promo`, {
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
      const res = await fetch(`/api/studio/releases/${encodeURIComponent(releaseId)}/social-promo`, {
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
        const res = await fetch(`/api/studio/releases/${encodeURIComponent(releaseId)}/social-promo`, {
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

  async function downloadKit() {
    setBusyAsset('kit')
    setKitProgress('Starting…')
    try {
      const result = await downloadSocialPromoAssetZip({
        title,
        artist: resolvedArtist,
        artworkUrl: resolvedArtwork,
        streetDate: resolvedStreet,
        plan,
        audioUrl: selectedTrack?.wav_url || null,
        audioTitle: selectedTrack?.title || title,
        startSec: selectedTrack?.preview_start_seconds ?? 0,
        onProgress: ({ phase, ratio }) => {
          setKitProgress(`${phase} ${Math.round(ratio * 100)}%`)
        },
      })
      showNotification(
        [
          'Social kit downloaded',
          result.hasVinyl ? 'vinyl' : null,
          result.hasSpotifyCanvas ? 'Spotify Canvas' : null,
          'captions',
        ]
          .filter(Boolean)
          .join(' · '),
        'success'
      )
      await markPostsReady(result.readyPostIds)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Kit download failed'
      showNotification(message, 'error')
    } finally {
      setBusyAsset(null)
      setKitProgress(null)
    }
  }

  async function downloadVinyl(kind: 'story' | 'reel') {
    const key = `vinyl-${kind}`
    setBusyAsset(key)
    try {
      if (!selectedTrack?.wav_url) {
        throw new Error('Add a Catalog WAV before exporting vinyl story / reel video')
      }
      await downloadSocialStoryVideo({
        artworkUrl: resolvedArtwork,
        title: selectedTrack.title || title,
        artist: resolvedArtist,
        audioUrl: selectedTrack.wav_url,
        startSec: selectedTrack.preview_start_seconds ?? 0,
        layout: 'vinyl',
        cta: kind === 'reel' ? 'OUT NOW · link in bio' : 'Listen · link sticker',
      })
      showNotification(
        kind === 'reel'
          ? 'Vinyl Reel video downloaded — upload in IG Reels'
          : 'Vinyl Story video downloaded — add link sticker in IG',
        'success'
      )
      const videoPosts = (plan?.posts || []).filter(
        (p) =>
          p.asset === 'story_video' &&
          p.status === 'planned' &&
          (kind === 'reel' ? p.channel === 'instagram_reel' : p.channel !== 'instagram_reel')
      )
      await markPostsReady(videoPosts.map((p) => p.id))
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Vinyl export failed'
      showNotification(message, 'error')
    } finally {
      setBusyAsset(null)
    }
  }

  async function downloadCanvas() {
    setBusyAsset('spotify-canvas')
    setKitProgress('Spotify Canvas…')
    try {
      if (!resolvedArtwork) {
        throw new Error('Add release artwork before exporting Spotify Canvas')
      }
      await downloadSpotifyCanvas({
        artworkUrl: resolvedArtwork,
        title,
        onProgress: (phase, ratio) => {
          setKitProgress(`${phase} ${Math.round((ratio || 0) * 100)}%`)
        },
      })
      showNotification(
        'Spotify Canvas downloaded — convert to MP4 if needed, upload in Spotify for Artists',
        'success'
      )
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Canvas export failed'
      showNotification(message, 'error')
    } finally {
      setBusyAsset(null)
      setKitProgress(null)
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
          title,
          artist: resolvedArtist,
          badge,
          cta: 'Listen · link in bio',
        })
      } else if (post.asset === 'story_static') {
        await downloadSocialStoryStill({
          artworkUrl: resolvedArtwork,
          title,
          artist: resolvedArtist,
          badge,
          cta: 'Add link sticker',
        })
      } else if (post.asset === 'story_video') {
        if (!selectedTrack?.wav_url) {
          throw new Error('Add a WAV to Catalog before exporting story/reel video')
        }
        await downloadSocialStoryVideo({
          artworkUrl: resolvedArtwork,
          title: selectedTrack.title || title,
          artist: resolvedArtist,
          audioUrl: selectedTrack.wav_url,
          startSec: selectedTrack.preview_start_seconds ?? 0,
          layout: 'vinyl',
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

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-zinc-500 text-sm py-4">
        <FaSpinner className="animate-spin" /> Loading social promo…
      </div>
    )
  }

  const posts = plan?.posts || []

  return (
    <div
      className={`rounded-xl border border-zinc-800 bg-zinc-950/60 ${compact ? 'p-4' : 'p-5'}`}
      data-testid="social-promo-panel"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h4 className="text-sm font-semibold text-white flex items-center gap-2">
            <FaCalendarAlt className="text-violet-400" />
            Social / Meta promo schedule
          </h4>
          <p className="text-xs text-zinc-500 mt-1 max-w-xl">
            One kit for Meta + Spotify: feed square, story stills, spinning-vinyl Story/Reel,
            Spotify Canvas cover drift, and timed captions. Upload, then mark posted here.
          </p>
          {summary?.has_plan ? (
            <p className="text-xs text-zinc-400 mt-2">
              {summary.posted}/{summary.total} posted · {summary.ready} ready
              {summary.next_label
                ? ` · next: ${summary.next_label} (${formatPromoSlotLocal(summary.next_at)})`
                : ''}
            </p>
          ) : null}
          {kitProgress ? (
            <p className="text-xs text-violet-300 mt-2" data-testid="social-kit-progress">
              {kitProgress}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col items-stretch sm:items-end gap-2">
          <div className="flex flex-wrap gap-2 justify-end">
            <button
              type="button"
              disabled={saving}
              onClick={generatePlan}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border border-zinc-700 text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
            >
              {saving && !opsBusy ? <FaSpinner className="animate-spin" /> : <FaSync />}
              {posts.length ? 'Regenerate schedule' : 'Generate schedule'}
            </button>
            <button
              type="button"
              disabled={opsBusy}
              onClick={downloadKit}
              data-testid="social-download-kit"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-violet-600/90 hover:bg-violet-500 text-white disabled:opacity-50"
            >
              {busyAsset === 'kit' ? <FaSpinner className="animate-spin" /> : <FaFileArchive />}
              Download assets zip
            </button>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <button
              type="button"
              disabled={opsBusy || !hasAudio}
              onClick={() => downloadVinyl('story')}
              title={hasAudio ? '15s spinning vinyl for IG Stories' : 'Needs Catalog WAV'}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs border border-zinc-700 text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
            >
              {busyAsset === 'vinyl-story' ? <FaSpinner className="animate-spin" /> : <FaVideo />}
              Vinyl story
            </button>
            <button
              type="button"
              disabled={opsBusy || !hasAudio}
              onClick={() => downloadVinyl('reel')}
              title={hasAudio ? '15s spinning vinyl for IG Reels' : 'Needs Catalog WAV'}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs border border-zinc-700 text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
            >
              {busyAsset === 'vinyl-reel' ? <FaSpinner className="animate-spin" /> : <FaVideo />}
              Vinyl reel
            </button>
            <button
              type="button"
              disabled={opsBusy || !resolvedArtwork}
              onClick={downloadCanvas}
              data-testid="social-spotify-canvas"
              title={
                resolvedArtwork
                  ? '8s silent Spotify Canvas — cover drift like site backgrounds'
                  : 'Needs release artwork'
              }
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs border border-zinc-700 text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
            >
              {busyAsset === 'spotify-canvas' ? (
                <FaSpinner className="animate-spin" />
              ) : (
                <FaVideo />
              )}
              Spotify Canvas
            </button>
            <button
              type="button"
              disabled={opsBusy}
              onClick={() =>
                downloadSocialFeedSquare({
                  artworkUrl: resolvedArtwork,
                  title,
                  artist: resolvedArtist,
                  badge: resolvedStreet ? 'New release' : 'Coming soon',
                }).then(() => showNotification('IG feed preview downloaded', 'success'))
              }
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs border border-zinc-700 text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
            >
              <FaDownload /> Feed 1080
            </button>
            <button
              type="button"
              disabled={opsBusy}
              onClick={() =>
                downloadSocialStoryStill({
                  artworkUrl: resolvedArtwork,
                  title,
                  artist: resolvedArtist,
                }).then(() => showNotification('IG/Meta story still downloaded', 'success'))
              }
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs border border-zinc-700 text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
            >
              <FaDownload /> Story still
            </button>
          </div>
        </div>
      </div>

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

      {hasAudio ? (
        <label className="flex items-center gap-2 text-xs text-zinc-400 mb-3">
          Vinyl Story / Reel audio
          <select
            title="Track for vinyl story / reel export"
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
      ) : (
        <p className="text-xs text-zinc-500 mb-3">
          Add Catalog WAVs to unlock 15s spinning-vinyl Story / Reel exports (included in the zip).
        </p>
      )}

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
                  </td>
                  <td className="px-3 py-2 text-zinc-300">
                    {socialPromoChannelLabel(post.channel)}
                    <div className="text-[10px] text-zinc-600">{post.asset}</div>
                  </td>
                  <td className="px-3 py-2">
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
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1.5">
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
                      {post.status !== 'posted' ? (
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
    </div>
  )
}
