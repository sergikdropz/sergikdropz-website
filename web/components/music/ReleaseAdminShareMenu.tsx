'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  FaChevronDown,
  FaCode,
  FaDownload,
  FaEnvelope,
  FaFacebook,
  FaFileArchive,
  FaInstagram,
  FaLinkedin,
  FaLink,
  FaShareAlt,
  FaTwitter,
  FaWhatsapp,
  FaYoutube,
} from 'react-icons/fa'
import ShareDownloadFloater from '@/components/shares/ShareDownloadFloater'
import ShareStoryClipPicker from '@/components/shares/ShareStoryClipPicker'
import type { FolderMusicVideo } from '@/lib/music-library/folder-music-videos'
import {
  copyShareEmbedHtml,
  copyShareListenLink,
  createMusicShare,
  exportShareStoryFromPayload,
  exportShareStorySnippet,
} from '@/lib/shares/client'
import { downloadReleasePromoterPack } from '@/lib/shares/release-promoter-pack'
import {
  pickReleaseShareTrack,
  type ReleaseShareTrack,
} from '@/lib/shares/release-share-tracks'
import { listenUrlWithUtm, type ShareUtmPlatform } from '@/lib/shares/share-utm'
import type { StorySnippetLayout } from '@/lib/shares/story-snippet'

type Props = {
  folderId: string
  releaseTitle?: string
  videos: FolderMusicVideo[]
  tracks?: ReleaseShareTrack[]
  disabled?: boolean
}

type ClipExportIntent = {
  layout: StorySnippetLayout
  platformLabel: string
  promoterPack?: boolean
}

function menuSection(title: string) {
  return (
    <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500">
      {title}
    </p>
  )
}

function menuButton(props: {
  icon: ReactNode
  label: string
  hint?: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      className="flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors hover:bg-gray-800/80 disabled:cursor-not-allowed disabled:opacity-50"
      onClick={props.onClick}
    >
      <span className="flex items-center gap-2 text-sm text-gray-100">
        {props.icon}
        {props.label}
      </span>
      {props.hint ? <span className="pl-5 text-[10px] leading-snug text-gray-500">{props.hint}</span> : null}
    </button>
  )
}

function releaseCaption(releaseTitle: string, listenUrl: string, leadTrack?: string): string {
  const name = releaseTitle.trim() || 'this release'
  const lead = leadTrack?.trim()
  return [
    lead ? `New from SERGIK — ${name} · ${lead}` : `New visualizer from SERGIK — ${name}`,
    `Listen & scrub on sergikdropz.com:`,
    listenUrl,
    '',
    '#SERGIK #DeepNFunky #FunkyHouse',
  ].join('\n')
}

function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '—'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function ReleaseAdminShareMenu({
  folderId,
  releaseTitle = '',
  videos,
  tracks = [],
  disabled,
}: Props) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [selectedTrackId, setSelectedTrackId] = useState<string>('')
  const [clipPickerOpen, setClipPickerOpen] = useState(false)
  const [downloadOpen, setDownloadOpen] = useState(false)
  const [clipIntent, setClipIntent] = useState<ClipExportIntent | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!tracks.length) {
      setSelectedTrackId('')
      return
    }
    setSelectedTrackId((prev) => (prev && tracks.some((t) => t.id === prev) ? prev : tracks[0].id))
  }, [tracks])

  const selectedTrack = useMemo(
    () => pickReleaseShareTrack(tracks, selectedTrackId),
    [tracks, selectedTrackId],
  )

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !clipPickerOpen) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, clipPickerOpen])

  useEffect(() => {
    if (!notice) return
    const t = window.setTimeout(() => setNotice(null), 9000)
    return () => window.clearTimeout(t)
  }, [notice])

  const shareFolder = { kind: 'folder' as const, targetId: folderId, visibility: 'public' as const }
  const primaryVideo = videos[0]
  const youtubeWatchUrl = primaryVideo
    ? `https://www.youtube.com/watch?v=${encodeURIComponent(primaryVideo.youtubeId)}`
    : null
  const youtubeLinks = videos.map(
    (v) => `https://www.youtube.com/watch?v=${v.youtubeId}${v.title?.trim() ? ` (${v.title.trim()})` : ''}`,
  )

  const run = async (label: string, fn: () => Promise<void>) => {
    if (busy || disabled) return
    setBusy(true)
    setNotice(label)
    try {
      await fn()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Share action failed'
      setNotice(message)
    } finally {
      setBusy(false)
      setOpen(false)
    }
  }

  const copyListenWithUtm = async (platform: ShareUtmPlatform, label: string) => {
    await run(label, async () => {
      const payload = await createMusicShare(shareFolder)
      const url = listenUrlWithUtm(payload.urls.listen, platform, releaseTitle)
      await navigator.clipboard.writeText(url)
      setNotice(`${label} copied (${platform} UTM).`)
    })
  }

  const beginClipExport = (intent: ClipExportIntent) => {
    if (busy || disabled) return
    if (tracks.length > 0 && !selectedTrack?.file) {
      setNotice('Selected track has no playable audio — pick another track or add WAVs.')
      return
    }
    setClipIntent(intent)
    setClipPickerOpen(true)
    setOpen(false)
  }

  const finishClipExport = async (startSec: number) => {
    if (!clipIntent) return
    setBusy(true)
    setNotice(`Rendering ${clipIntent.platformLabel}…`)
    try {
      const payload = await createMusicShare(shareFolder)
      const result = await exportShareStoryFromPayload(payload, {
        trackId: selectedTrack?.id,
        layout: clipIntent.layout,
        startSec,
        onProgress: (phase, ratio) => {
          if (phase === 'recording' && typeof ratio === 'number') {
            setNotice(`${clipIntent.platformLabel}… ${Math.round(ratio * 100)}%`)
          }
        },
      })
      await navigator.clipboard.writeText(
        listenUrlWithUtm(result.payload.urls.listen, 'instagram', releaseTitle),
      )

      if (clipIntent.promoterPack) {
        setNotice('Packing promoter ZIP…')
        await downloadReleasePromoterPack({
          releaseTitle: releaseTitle || 'Release',
          leadTrackTitle: result.track.title || selectedTrack?.title || 'Track',
          payload: result.payload,
          storyMp4: result.snippet.blob,
          storyFilename: result.snippet.filename,
          youtubeLinks,
        })
        setNotice('Promoter pack downloaded (story MP4 + caption + links + embed).')
      } else {
        setNotice(
          result.delivery === 'shared'
            ? `${clipIntent.platformLabel} ready — UTM listen link copied.`
            : `${clipIntent.platformLabel} downloaded — UTM listen link copied.`,
        )
      }
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setBusy(false)
      setClipIntent(null)
      setClipPickerOpen(false)
    }
  }

  const quickStoryWithoutPicker = (layout: StorySnippetLayout, platformLabel: string) =>
    void run(`Rendering ${platformLabel}…`, async () => {
      const result = await exportShareStorySnippet({
        ...shareFolder,
        trackId: selectedTrack?.id,
        layout,
        startSec: 0,
      })
      await navigator.clipboard.writeText(
        listenUrlWithUtm(result.payload.urls.listen, 'instagram', releaseTitle),
      )
      setNotice(`${platformLabel} exported — UTM listen link copied.`)
    })

  return (
    <>
      <div ref={rootRef} className="relative shrink-0">
        <button
          type="button"
          disabled={disabled || busy}
          aria-haspopup="menu"
          aria-expanded={open}
          title="Share release — links, clips, promoter pack"
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-gray-600 bg-black/80 px-2.5 text-[11px] font-medium text-gray-200 shadow-lg backdrop-blur-sm transition-colors hover:border-gray-400 hover:bg-gray-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          onClick={() => setOpen((v) => !v)}
        >
          <FaShareAlt className="h-3 w-3" aria-hidden />
          <span className="hidden sm:inline">Share</span>
          <FaChevronDown
            className={`h-2.5 w-2.5 opacity-70 transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </button>

        {open ? (
          <div
            role="menu"
            aria-label="Release share options"
            className="absolute right-0 top-full z-40 mt-1 max-h-[min(70vh,28rem)] w-[min(100vw-2rem,22rem)] overflow-y-auto rounded-lg border border-gray-700 bg-gray-900 py-1 shadow-2xl"
          >
            {tracks.length > 0 ? (
              <div className="border-b border-gray-800 px-3 py-2">
                <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-500">
                  Story / clip track
                </label>
                {tracks.length === 1 ? (
                  <p className="mt-1 truncate text-xs text-gray-200">
                    {tracks[0].title}
                    <span className="text-gray-500"> · {formatDuration(tracks[0].duration)}</span>
                  </p>
                ) : (
                  <select
                    value={selectedTrackId}
                    disabled={busy}
                    onChange={(e) => setSelectedTrackId(e.target.value)}
                    className="mt-1 w-full rounded-md border border-gray-600 bg-gray-950 px-2 py-1.5 text-xs text-white outline-none focus:border-red-500"
                  >
                    {tracks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title} ({formatDuration(t.duration)})
                      </option>
                    ))}
                  </select>
                )}
                <p className="mt-1 text-[10px] leading-snug text-gray-600">
                  Short-form exports use this track&apos;s audio + release artwork.
                </p>
              </div>
            ) : null}

            {menuSection('Listen on SERGIK')}
            {menuButton({
              icon: <FaLink className="h-3 w-3 text-gray-400" aria-hidden />,
              label: 'Copy listen link',
              hint: 'Default share URL (no UTM).',
              disabled: busy,
              onClick: () =>
                void run('Listen link copied', async () => {
                  const payload = await copyShareListenLink(shareFolder)
                  setNotice(`Listen link copied: ${payload.urls.listen}`)
                }),
            })}
            {menuButton({
              icon: <FaLink className="h-3 w-3 text-pink-400" aria-hidden />,
              label: 'Copy link · Instagram UTM',
              disabled: busy,
              onClick: () => void copyListenWithUtm('instagram', 'Instagram listen link'),
            })}
            {menuButton({
              icon: <FaLink className="h-3 w-3 text-fuchsia-400" aria-hidden />,
              label: 'Copy link · TikTok UTM',
              disabled: busy,
              onClick: () => void copyListenWithUtm('tiktok', 'TikTok listen link'),
            })}
            {menuButton({
              icon: <FaCode className="h-3 w-3 text-gray-400" aria-hidden />,
              label: 'Copy embed HTML',
              disabled: busy,
              onClick: () =>
                void run('Embed copied', async () => {
                  await copyShareEmbedHtml(shareFolder)
                  setNotice('Embed HTML copied.')
                }),
            })}
            {menuButton({
              icon: <FaLink className="h-3 w-3 text-amber-400/90" aria-hidden />,
              label: 'Copy social caption',
              disabled: busy,
              onClick: () =>
                void run('Caption copied', async () => {
                  const payload = await createMusicShare(shareFolder)
                  const url = listenUrlWithUtm(payload.urls.listen, 'x', releaseTitle)
                  const text = releaseCaption(releaseTitle, url, selectedTrack?.title)
                  await navigator.clipboard.writeText(text)
                  setNotice('Caption + UTM link copied.')
                }),
            })}

            {menuSection('Download')}
            {menuButton({
              icon: <FaDownload className="h-3 w-3 text-emerald-400" aria-hidden />,
              label: 'Share download',
              hint: 'Restricted to emails you add. MP3 or WAV, this track or the whole EP.',
              disabled: busy || tracks.length === 0,
              onClick: () => {
                setOpen(false)
                setDownloadOpen(true)
              },
            })}

            {menuSection('Short-form video (pick 15s clip)')}
            {menuButton({
              icon: <FaInstagram className="h-3 w-3 text-pink-400" aria-hidden />,
              label: 'Instagram Story · vinyl',
              hint: 'Choose hook — waveform picker.',
              disabled: busy || tracks.length === 0,
              onClick: () => beginClipExport({ layout: 'vinyl', platformLabel: 'Instagram Story (vinyl)' }),
            })}
            {menuButton({
              icon: <FaInstagram className="h-3 w-3 text-pink-400" aria-hidden />,
              label: 'Instagram Story · cover',
              disabled: busy || tracks.length === 0,
              onClick: () => beginClipExport({ layout: 'cover', platformLabel: 'Instagram Story (cover)' }),
            })}
            {menuButton({
              icon: <FaInstagram className="h-3 w-3 text-fuchsia-400" aria-hidden />,
              label: 'Reels / TikTok · vinyl',
              disabled: busy || tracks.length === 0,
              onClick: () => beginClipExport({ layout: 'vinyl', platformLabel: 'Reels / TikTok clip' }),
            })}
            {menuButton({
              icon: <FaFileArchive className="h-3 w-3 text-yellow-500/90" aria-hidden />,
              label: 'Promoter pack (ZIP)',
              hint: 'Clip picker → MP4 + caption.txt + links.md + embed.',
              disabled: busy || tracks.length === 0,
              onClick: () =>
                beginClipExport({
                  layout: 'vinyl',
                  platformLabel: 'Promoter pack',
                  promoterPack: true,
                }),
            })}
            {tracks.length === 0
              ? menuButton({
                  icon: <FaInstagram className="h-3 w-3 text-gray-500" aria-hidden />,
                  label: 'Quick story (no track picker)',
                  hint: 'Uses first catalog track from share API.',
                  disabled: busy,
                  onClick: () => void quickStoryWithoutPicker('vinyl', 'Instagram Story'),
                })
              : null}

            {menuSection('YouTube')}
            {menuButton({
              icon: <FaYoutube className="h-3 w-3 text-red-500" aria-hidden />,
              label: 'Copy YouTube watch link',
              disabled: busy || !youtubeWatchUrl,
              onClick: () =>
                void run('YouTube link copied', async () => {
                  if (!youtubeWatchUrl) return
                  await navigator.clipboard.writeText(youtubeWatchUrl)
                }),
            })}
            {videos.length > 1
              ? menuButton({
                  icon: <FaYoutube className="h-3 w-3 text-red-500" aria-hidden />,
                  label: 'Copy all visualizer links',
                  disabled: busy,
                  onClick: () =>
                    void run('YouTube links copied', async () => {
                      await navigator.clipboard.writeText(youtubeLinks.join('\n'))
                    }),
                })
              : null}

            {menuSection('Open / send')}
            {menuButton({
              icon: <FaTwitter className="h-3 w-3 text-sky-400" aria-hidden />,
              label: 'Compose on X',
              disabled: busy,
              onClick: () =>
                void run('Opening X…', async () => {
                  const payload = await createMusicShare(shareFolder)
                  const url = listenUrlWithUtm(payload.urls.listen, 'x', releaseTitle)
                  const text = releaseCaption(releaseTitle, url, selectedTrack?.title).split('\n')[0]
                  window.open(
                    `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
                    '_blank',
                    'noopener,noreferrer',
                  )
                }),
            })}
            {menuButton({
              icon: <FaFacebook className="h-3 w-3 text-blue-500" aria-hidden />,
              label: 'Share on Facebook',
              disabled: busy,
              onClick: () =>
                void run('Opening Facebook…', async () => {
                  const payload = await createMusicShare(shareFolder)
                  const url = listenUrlWithUtm(payload.urls.listen, 'facebook', releaseTitle)
                  window.open(
                    `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
                    '_blank',
                    'noopener,noreferrer',
                  )
                }),
            })}
            {menuButton({
              icon: <FaWhatsapp className="h-3 w-3 text-green-500" aria-hidden />,
              label: 'Send via WhatsApp',
              disabled: busy,
              onClick: () =>
                void run('Opening WhatsApp…', async () => {
                  const payload = await createMusicShare(shareFolder)
                  const url = listenUrlWithUtm(payload.urls.listen, 'whatsapp', releaseTitle)
                  const body = releaseCaption(releaseTitle, url, selectedTrack?.title)
                  await navigator.clipboard.writeText(body)
                  window.open(
                    `https://wa.me/?text=${encodeURIComponent(body)}`,
                    '_blank',
                    'noopener,noreferrer',
                  )
                }),
            })}
            {menuButton({
              icon: <FaLinkedin className="h-3 w-3 text-sky-300" aria-hidden />,
              label: 'Share on LinkedIn',
              disabled: busy,
              onClick: () =>
                void run('Opening LinkedIn…', async () => {
                  const payload = await createMusicShare(shareFolder)
                  const url = listenUrlWithUtm(payload.urls.listen, 'linkedin', releaseTitle)
                  window.open(
                    `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
                    '_blank',
                    'noopener,noreferrer',
                  )
                }),
            })}
            {menuButton({
              icon: <FaEnvelope className="h-3 w-3 text-gray-400" aria-hidden />,
              label: 'Email draft (DJs / press)',
              disabled: busy,
              onClick: () =>
                void run('Opening email…', async () => {
                  const payload = await createMusicShare(shareFolder)
                  const url = listenUrlWithUtm(payload.urls.listen, 'email', releaseTitle)
                  const subject = `SERGIK — ${releaseTitle || 'New release'}`
                  const body = releaseCaption(releaseTitle, url, selectedTrack?.title)
                  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
                }),
            })}
          </div>
        ) : null}
      </div>

      {notice ? (
        <p
          className="pointer-events-none fixed bottom-[calc(var(--global-music-player-height,5rem)+1rem)] left-1/2 z-[220] max-w-md -translate-x-1/2 rounded-lg border border-gray-700 bg-gray-950/95 px-3 py-2 text-center text-[11px] leading-snug text-gray-300 shadow-xl"
          role="status"
        >
          {notice}
        </p>
      ) : null}

      <ShareDownloadFloater
        open={downloadOpen}
        folderId={folderId}
        releaseTitle={releaseTitle}
        tracks={tracks}
        initialTrackId={selectedTrack?.id}
        onClose={() => setDownloadOpen(false)}
      />

      <ShareStoryClipPicker
        open={clipPickerOpen}
        title={selectedTrack?.title || releaseTitle || 'Release'}
        artist={selectedTrack?.artist || 'SERGIK'}
        trackDurationSec={selectedTrack?.duration || 180}
        initialStartSec={0}
        file={selectedTrack?.file}
        trackId={selectedTrack?.id}
        audioFileId={selectedTrack?.audioFileId}
        busy={busy}
        busyLabel={busy ? notice : null}
        onCancel={() => {
          if (busy) return
          setClipPickerOpen(false)
          setClipIntent(null)
        }}
        onConfirm={(startSec) => void finishClipExport(startSec)}
      />
    </>
  )
}
