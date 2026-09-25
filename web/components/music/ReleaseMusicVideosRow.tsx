'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react'
import {
  FaChevronDown,
  FaChevronLeft,
  FaChevronRight,
  FaChevronUp,
  FaCompress,
  FaExpand,
  FaPlus,
  FaTrash,
  FaYoutube,
  FaPlay,
} from 'react-icons/fa'
import {
  FOLDER_MUSIC_VIDEOS_EXPANDED_PX,
  FOLDER_MUSIC_VIDEOS_MAX,
  folderMusicVideosMetadataPatch,
  type FolderMusicVideo,
} from '@/lib/music-library/folder-music-videos'
import {
  isYouTubePlaceholderThumbnail,
  parseYouTubeInput,
  youtubeEmbedUrl,
  youtubeThumbnailUrls,
} from '@/lib/videos/youtube'
import { getPromoContactConsent } from '@/lib/analytics'
import { pickSavedBrowserEmail, requestGoogleAccessToken } from '@/lib/auth/browser-account'
import { updateFolder } from '@/utils/musicLibraryApi'

type VideoSizeMode = 'compact' | 'theater'

/** Pause once less than half the frame is still inside the panel. */
const VIDEO_VISIBLE_RATIO = 0.5

type YouTubePlayer = {
  playVideo: () => void
  pauseVideo: () => void
  seekTo: (seconds: number, allowSeekAhead: boolean) => void
  getCurrentTime: () => number
  destroy: () => void
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement,
        options: {
          videoId: string
          host?: string
          playerVars?: Record<string, string | number>
          events?: {
            onReady?: (event: { target: YouTubePlayer }) => void
          }
        },
      ) => YouTubePlayer
    }
    onYouTubeIframeAPIReady?: () => void
  }
}

const descriptionByVideoId = new Map<string, string>()

let youtubeApiPromise: Promise<void> | null = null

const YOUTUBE_IFRAME_API_SRC = 'https://www.youtube.com/iframe_api'

function loadYouTubeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.YT?.Player) return Promise.resolve()
  if (!youtubeApiPromise) {
    youtubeApiPromise = new Promise<void>((resolve, reject) => {
      const finish = () => {
        if (window.YT?.Player) resolve(undefined)
      }
      finish()
      if (window.YT?.Player) return

      const previous = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => {
        previous?.()
        finish()
      }

      if (!document.querySelector(`script[src="${YOUTUBE_IFRAME_API_SRC}"]`)) {
        const script = document.createElement('script')
        script.src = YOUTUBE_IFRAME_API_SRC
        script.async = true
        document.head.appendChild(script)
      }

      const poll = window.setInterval(() => finish(), 100)
      window.setTimeout(() => {
        window.clearInterval(poll)
        if (window.YT?.Player) resolve(undefined)
        else reject(new Error('YouTube iframe API did not load'))
      }, 12_000)
    }).catch((err) => {
      youtubeApiPromise = null
      throw err
    })
  }
  return youtubeApiPromise
}

function rememberPlaybackTime(
  playbackTimeRef: MutableRefObject<Record<string, number>>,
  youtubeId: string,
  player: YouTubePlayer | null,
) {
  try {
    const seconds = player?.getCurrentTime?.()
    if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0) {
      playbackTimeRef.current[youtubeId] = seconds
    }
  } catch {
    /* player not ready */
  }
}

type ReleaseMusicVideosRowProps = {
  folderId: string
  folderName: string
  videos: FolderMusicVideo[]
  isAdmin: boolean
  onVideosChange?: (videos: FolderMusicVideo[]) => void
}

function VideoThumb({
  video,
  playbackTimeRef,
  holdOffscreenPauseRef,
  onDescriptionOpenChange,
}: {
  video: FolderMusicVideo
  playbackTimeRef: MutableRefObject<Record<string, number>>
  holdOffscreenPauseRef: MutableRefObject<boolean>
  onDescriptionOpenChange?: (open: boolean) => void
}) {
  const [playing, setPlaying] = useState(false)
  const [useSimpleEmbed, setUseSimpleEmbed] = useState(false)
  const [thumbIndex, setThumbIndex] = useState(0)
  const [descriptionOpen, setDescriptionOpen] = useState(false)
  const [description, setDescription] = useState<string | null>(null)
  const [descriptionStatus, setDescriptionStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const descriptionPanelId = useId()
  const frameRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YouTubePlayer | null>(null)
  const thumbs = youtubeThumbnailUrls(video.youtubeId)
  const thumb = thumbs[Math.min(thumbIndex, thumbs.length - 1)]
  const label = video.title?.trim() || 'Music video'

  useEffect(() => {
    if (!playing || useSimpleEmbed) return
    const frame = frameRef.current
    const host = hostRef.current
    if (!frame || !host) return

    let cancelled = false
    let observer: IntersectionObserver | null = null
    const youtubeId = video.youtubeId

    void loadYouTubeApi()
      .then(() => {
        if (cancelled || !hostRef.current || !window.YT?.Player) return
        const startAt = playbackTimeRef.current[youtubeId] || 0
        let ready = false
        const player = new window.YT.Player(hostRef.current, {
          videoId: youtubeId,
          host: 'https://www.youtube-nocookie.com',
          playerVars: {
            autoplay: 1,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            origin: window.location.origin,
            ...(startAt >= 1 ? { start: Math.floor(startAt) } : {}),
          },
          events: {
            onReady: (event) => {
              ready = true
              if (startAt >= 1) event.target.seekTo(startAt, true)
              try {
                event.target.playVideo()
              } catch {
                /* autoplay blocked */
              }
            },
          },
        })
        playerRef.current = player

        const pauseOffscreen = () => {
          rememberPlaybackTime(playbackTimeRef, youtubeId, player)
          try {
            player.pauseVideo()
          } catch {
            /* not ready */
          }
        }

        observer = new IntersectionObserver(
          (entries) => {
            const latestRatio = entries[0]?.intersectionRatio ?? 0
            if (ready && !holdOffscreenPauseRef.current && latestRatio < VIDEO_VISIBLE_RATIO) pauseOffscreen()
          },
          { threshold: [0, 0.25, 0.5, 0.75, 1] },
        )
        observer.observe(frame)
      })
      .catch(() => {
        if (!cancelled) setUseSimpleEmbed(true)
      })

    return () => {
      cancelled = true
      observer?.disconnect()
      rememberPlaybackTime(playbackTimeRef, youtubeId, playerRef.current)
      try {
        playerRef.current?.destroy()
      } catch {
        /* already gone */
      }
      playerRef.current = null
    }
  }, [playing, useSimpleEmbed, playbackTimeRef, holdOffscreenPauseRef, video.youtubeId])

  useEffect(() => {
    if (!playing) setUseSimpleEmbed(false)
  }, [playing, video.youtubeId])

  const toggleDescription = () => {
    setDescriptionOpen((open) => {
      const next = !open
      onDescriptionOpenChange?.(next)
      return next
    })
    if (descriptionStatus === 'ready' || descriptionStatus === 'loading') return
    const cached = descriptionByVideoId.get(video.youtubeId)
    if (cached !== undefined) {
      setDescription(cached)
      setDescriptionStatus('ready')
      return
    }
    setDescriptionStatus('loading')
    void fetch(`/api/videos/youtube-description?id=${encodeURIComponent(video.youtubeId)}`, {
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('description failed')
        const data = await response.json()
        const text = typeof data?.description === 'string' ? data.description : ''
        descriptionByVideoId.set(video.youtubeId, text)
        setDescription(text)
        setDescriptionStatus('ready')
      })
      .catch(() => {
        setDescriptionStatus('error')
      })
  }

  return (
    <div
      className={`flex w-full flex-col overflow-hidden rounded-lg border border-gray-800 bg-black ${
        descriptionOpen ? '' : 'h-full min-h-0'
      }`}
    >
      <div
        ref={frameRef}
        className={`relative z-[2] bg-gray-950 [&_iframe]:absolute [&_iframe]:inset-0 [&_iframe]:h-full [&_iframe]:w-full ${
          descriptionOpen ? 'aspect-video w-full shrink-0' : 'min-h-0 flex-1'
        }`}
      >
        {playing ? (
          useSimpleEmbed ? (
            <iframe
              src={youtubeEmbedUrl(video.youtubeId, true)}
              title={label}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="absolute inset-0 h-full w-full border-0"
            />
          ) : (
            <div ref={hostRef} className="absolute inset-0 h-full w-full min-h-[6rem] bg-black" />
          )
        ) : (
          <button
            type="button"
            className="group absolute inset-0 z-[1] cursor-pointer bg-gray-900"
            onClick={() => setPlaying(true)}
            aria-label={`Play ${label}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumb}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              onLoad={(e) => {
                if (
                  isYouTubePlaceholderThumbnail(e.currentTarget.naturalWidth) &&
                  thumbIndex < thumbs.length - 1
                ) {
                  setThumbIndex((i) => i + 1)
                }
              }}
              onError={() => {
                if (thumbIndex < thumbs.length - 1) setThumbIndex((i) => i + 1)
              }}
            />
            <span className="absolute inset-0 bg-black/25 transition-colors group-hover:bg-black/40" />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-red-600 text-white shadow-lg shadow-red-900/40 transition-transform group-hover:scale-110">
                <FaPlay className="ml-0.5 h-3.5 w-3.5" aria-hidden />
              </span>
            </span>
          </button>
        )}
      </div>
      {video.title ? (
        <div className="shrink-0 border-t border-gray-800/80">
          <div className="group/desc relative">
            <p className="truncate px-2 py-1 text-center text-[11px] text-gray-300" title={video.title}>
              {video.title}
            </p>
            <button
              type="button"
              onClick={toggleDescription}
              aria-expanded={descriptionOpen}
              aria-controls={descriptionPanelId}
              className={`absolute left-1/2 top-1/2 z-[2] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-md border border-gray-600 bg-black/90 px-2 py-0.5 text-[10px] font-medium text-gray-100 shadow-lg backdrop-blur-sm transition-opacity hover:border-gray-400 hover:text-white ${
                descriptionOpen
                  ? 'opacity-100'
                  : 'pointer-events-none opacity-0 group-hover/desc:pointer-events-auto group-hover/desc:opacity-100 group-focus-within/desc:pointer-events-auto group-focus-within/desc:opacity-100'
              }`}
            >
              {descriptionOpen ? 'Hide description' : 'Show description'}
            </button>
          </div>
          {descriptionOpen ? (
            <div
              id={descriptionPanelId}
              className="border-t border-gray-800/80 px-3 py-2 text-[11px] leading-relaxed text-gray-300 whitespace-pre-wrap"
            >
              {descriptionStatus === 'loading'
                ? 'Loading description…'
                : descriptionStatus === 'error'
                  ? 'Couldn’t load the YouTube description.'
                  : description?.trim()
                    ? description
                    : 'This video has no description.'}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function theaterStorageKey(folderId: string) {
  return `sergik.release-music-videos.theater.${folderId}`
}

/** Theater shows one video at a time. Compact fits every video in the row. Same children stay mounted so playback survives the switch. */
function TheaterVideoStrip({
  children,
  slideCount,
  layout,
  descriptionExpanded,
}: {
  children: ReactNode
  slideCount: number
  layout: VideoSizeMode
  descriptionExpanded: boolean
}) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  const [edge, setEdge] = useState<'left' | 'right' | null>(null)
  const [finePointer, setFinePointer] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)')
    const sync = () => setFinePointer(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const sync = () => {
      const width = el.clientWidth || 1
      setIndex(Math.round(el.scrollLeft / width))
    }
    sync()
    el.addEventListener('scroll', sync, { passive: true })
    window.addEventListener('resize', sync)
    return () => {
      el.removeEventListener('scroll', sync)
      window.removeEventListener('resize', sync)
    }
  }, [slideCount])

  const go = (direction: -1 | 1) => {
    const el = scrollerRef.current
    if (!el) return
    const width = el.clientWidth
    if (width <= 0) return
    const current = Math.round(el.scrollLeft / width)
    const next = Math.min(slideCount - 1, Math.max(0, current + direction))
    el.scrollTo({ left: next * width, behavior: 'smooth' })
  }

  const showLeft = layout === 'theater' && slideCount > 1 && index > 0
  const showRight = layout === 'theater' && slideCount > 1 && index < slideCount - 1

  useLayoutEffect(() => {
    if (layout === 'theater') return
    const el = scrollerRef.current
    if (el) el.scrollLeft = 0
  }, [layout])

  return (
    <div
      className={`relative min-w-0 ${layout === 'theater' ? 'w-full' : 'h-full w-full'}`}
      onMouseLeave={() => setEdge(null)}
    >
      <div
        ref={scrollerRef}
        className={
          layout === 'theater'
            ? `flex w-full min-w-0 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain ${
                descriptionExpanded ? 'items-start' : ''
              }`
            : `flex max-w-full items-center justify-center gap-2 ${
                descriptionExpanded ? 'h-auto items-start overflow-visible' : 'h-full overflow-hidden'
              }`
        }
        aria-label="Release videos"
      >
        {children}
      </div>
      {finePointer && showLeft ? (
        <div
          className="absolute bottom-10 left-0 top-12 z-[3] w-20"
          onMouseEnter={() => setEdge('left')}
        >
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Previous video"
            className={`absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-gray-600 bg-black/80 text-white shadow-lg backdrop-blur-sm transition-opacity hover:bg-gray-900 ${
              edge === 'left' ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
          >
            <FaChevronLeft className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ) : null}
      {finePointer && showRight ? (
        <div
          className="absolute bottom-10 right-0 top-12 z-[3] w-20"
          onMouseEnter={() => setEdge('right')}
        >
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Next video"
            className={`absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-gray-600 bg-black/80 text-white shadow-lg backdrop-blur-sm transition-opacity hover:bg-gray-900 ${
              edge === 'right' ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
          >
            <FaChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ) : null}
    </div>
  )
}

export default function ReleaseMusicVideosRow({
  folderId,
  folderName: _folderName,
  videos,
  isAdmin,
  onVideosChange,
}: ReleaseMusicVideosRowProps) {
  const panelId = useId()
  const [expanded, setExpanded] = useState(false)
  const [sizeMode, setSizeMode] = useState<VideoSizeMode>('compact')
  const [draftUrl, setDraftUrl] = useState('')
  const [draftTitle, setDraftTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resolvedTitles, setResolvedTitles] = useState<Record<string, string>>({})
  const playbackTimeRef = useRef<Record<string, number>>({})
  const holdOffscreenPauseRef = useRef(false)
  const [descriptionOpenIds, setDescriptionOpenIds] = useState<Record<string, boolean>>({})
  const descriptionExpanded = Object.values(descriptionOpenIds).some(Boolean)
  const [subUnlocked, setSubUnlocked] = useState(isAdmin)
  const [gateOpen, setGateOpen] = useState(false)
  const [gateNote, setGateNote] = useState<string | null>(null)
  const [gateChannel, setGateChannel] = useState('sergikdropz')

  useEffect(() => {
    setDraftUrl('')
    setDraftTitle('')
    setError(null)
    setExpanded(false)
    setGateOpen(false)
    setResolvedTitles({})
    setSizeMode('compact')
  }, [folderId])

  const expandVideos = () => {
    setSizeMode('compact')
    setExpanded(true)
  }

  const toggleVideosExpanded = () => {
    setExpanded((wasOpen) => {
      if (!wasOpen) setSizeMode('compact')
      return !wasOpen
    })
  }

  useEffect(() => {
    if (isAdmin) {
      setSubUnlocked(true)
      return
    }
    setSubUnlocked(false)
    let cancelled = false
    const params = new URLSearchParams(window.location.search)
    const flag = params.get('ytgate')
    if (flag) {
      params.delete('ytgate')
      const qs = params.toString()
      window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`)
    }
    void fetch('/api/youtube/subscribe-gate/status', { credentials: 'same-origin', cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { unlocked?: boolean; configured?: boolean; channel?: string } | null) => {
        if (cancelled || !data) return
        const ok = Boolean(data.unlocked)
        const channel = (data.channel || 'sergikdropz').replace(/^@/, '')
        setSubUnlocked(ok)
        setGateChannel(channel)
        if (ok) {
          setGateOpen(false)
          setGateNote(null)
          if (flag === 'ok') {
            setSizeMode('compact')
            setExpanded(true)
          }
          return
        }
        if (flag) {
          setGateOpen(true)
          setGateNote(subscribeGateNote(flag))
        }
      })
      .catch(() => {
        if (!cancelled) setSubUnlocked(false)
      })
    return () => {
      cancelled = true
    }
  }, [isAdmin, folderId])

  useEffect(() => {
    const missing = videos.filter((v) => !v.title?.trim()).map((v) => v.youtubeId)
    if (missing.length === 0) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/videos')
        if (!res.ok) return
        const data = await res.json()
        const catalog = Array.isArray(data?.videos) ? data.videos : []
        const next: Record<string, string> = {}
        for (const id of missing) {
          const match = catalog.find(
            (v: { youtube_id?: string; title?: string }) => v?.youtube_id === id && typeof v.title === 'string',
          )
          if (match?.title?.trim()) next[id] = match.title.trim()
        }
        if (!cancelled && Object.keys(next).length) {
          setResolvedTitles((prev) => ({ ...prev, ...next }))
        }
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [videos])

  // Public: hide entirely until at least one video is saved.
  if (!isAdmin && videos.length === 0) return null

  const canWatch = isAdmin || subUnlocked
  const canAdd = isAdmin && videos.length < FOLDER_MUSIC_VIDEOS_MAX
  const theater = sizeMode === 'theater'
  const count = Math.min(Math.max(videos.length, 1), 4)
  const watchLabel = videos.length === 1 ? 'Watch Video' : 'Watch Videos'
  const watchVideoName =
    videos
      .map((v) => v.title?.trim() || resolvedTitles[v.youtubeId] || '')
      .filter(Boolean)
      .join(' · ') || ''

  const setTheaterMode = (next: VideoSizeMode) => {
    holdOffscreenPauseRef.current = true
    setSizeMode(next)
    window.setTimeout(() => {
      holdOffscreenPauseRef.current = false
    }, 500)
    try {
      sessionStorage.setItem(theaterStorageKey(folderId), next)
    } catch {
      /* ignore */
    }
  }

  const sizeToggle =
    expanded && canWatch && videos.length > 0 ? (
      <button
        type="button"
        onClick={() => setTheaterMode(theater ? 'compact' : 'theater')}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-gray-600 bg-black/80 px-2.5 text-[11px] font-medium text-gray-200 shadow-lg backdrop-blur-sm transition-colors hover:border-gray-400 hover:bg-gray-900 hover:text-white"
        title={theater ? 'Compact video size' : 'Theater mode — fill row width'}
        aria-label={theater ? 'Switch to compact video size' : 'Switch to theater mode'}
        aria-pressed={theater}
      >
        {theater ? <FaCompress className="h-3 w-3" aria-hidden /> : <FaExpand className="h-3 w-3" aria-hidden />}
        <span className="hidden sm:inline">{theater ? 'Compact' : 'Theater'}</span>
      </button>
    ) : null

  const persist = async (next: FolderMusicVideo[]) => {
    setBusy(true)
    setError(null)
    try {
      await updateFolder(folderId, { metadata: folderMusicVideosMetadataPatch(next) })
      onVideosChange?.(next)
    } catch (err: any) {
      setError(err?.message || 'Failed to save music videos')
      throw err
    } finally {
      setBusy(false)
    }
  }

  const addVideo = async () => {
    const parsed = parseYouTubeInput(draftUrl)
    if ('error' in parsed) {
      setError(parsed.error)
      return
    }
    if (videos.some((v) => v.youtubeId === parsed.youtubeId)) {
      setError('That video is already on this release')
      return
    }
    if (videos.length >= FOLDER_MUSIC_VIDEOS_MAX) {
      setError(`Up to ${FOLDER_MUSIC_VIDEOS_MAX} videos per release`)
      return
    }

    let title = draftTitle.trim()
    if (!title) {
      try {
        const lookup = await fetch(
          `/api/admin/videos/lookup?id=${encodeURIComponent(parsed.youtubeId)}`,
        )
        if (lookup.ok) {
          const data = await lookup.json()
          if (typeof data?.title === 'string' && data.title.trim()) {
            title = data.title.trim()
          }
        }
      } catch {
        /* optional enrichment */
      }
    }

    const next: FolderMusicVideo[] = [
      ...videos,
      {
        id: parsed.youtubeId,
        youtubeId: parsed.youtubeId,
        ...(title ? { title } : {}),
      },
    ]
    try {
      await persist(next)
      setDraftUrl('')
      setDraftTitle('')
      expandVideos()
    } catch {
      /* error already set */
    }
  }

  const removeVideo = async (youtubeId: string) => {
    const next = videos.filter((v) => v.youtubeId !== youtubeId)
    try {
      await persist(next)
    } catch {
      /* error already set */
    }
  }

  return (
    <div
      className="border-b border-gray-700 bg-transparent"
      data-release-music-videos-row=""
      data-folder-id={folderId}
      data-size-mode={sizeMode}
    >
      {!isAdmin && gateOpen && !subUnlocked ? (
        <YouTubeSubscribeGate
          panelId={panelId}
          channel={gateChannel}
          note={gateNote}
          onUnlocked={() => {
            setSubUnlocked(true)
            setGateOpen(false)
            setGateNote(null)
            expandVideos()
          }}
        />
      ) : null}

      {expanded && canWatch ? (
        <div
          id={panelId}
          className={`relative border-b border-gray-700/80 bg-transparent px-3 py-2 sm:px-5 ${
            theater ? 'w-full' : ''
          }`}
          style={theater || descriptionExpanded ? undefined : { height: FOLDER_MUSIC_VIDEOS_EXPANDED_PX }}
        >
          <div
            className={`flex min-h-0 min-w-0 ${
              theater
                ? 'w-full'
                : descriptionExpanded
                  ? 'w-full items-start'
                  : 'h-full items-center justify-center overflow-hidden'
            }`}
          >
            {videos.length > 0 ? (
              <TheaterVideoStrip
                slideCount={videos.length}
                layout={theater ? 'theater' : 'compact'}
                descriptionExpanded={descriptionExpanded}
              >
                {videos.map((video) => {
                  const descriptionOpen = Boolean(descriptionOpenIds[video.youtubeId])
                  return (
                  <div
                    key={video.youtubeId}
                    className={
                      theater
                        ? `relative w-full shrink-0 snap-center ${descriptionOpen ? '' : 'aspect-video'}`
                        : `relative min-w-0 shrink ${descriptionOpen ? 'h-auto' : 'h-full aspect-video'}`
                    }
                    style={
                      theater
                        ? undefined
                        : { maxWidth: `calc((100% - ${(count - 1) * 0.5}rem) / ${count})` }
                    }
                  >
                    <VideoThumb
                      video={video}
                      playbackTimeRef={playbackTimeRef}
                      holdOffscreenPauseRef={holdOffscreenPauseRef}
                      onDescriptionOpenChange={(open) =>
                        setDescriptionOpenIds((prev) =>
                          Boolean(prev[video.youtubeId]) === open ? prev : { ...prev, [video.youtubeId]: open },
                        )
                      }
                    />
                    {isAdmin ? (
                      <button
                        type="button"
                        onClick={() => void removeVideo(video.youtubeId)}
                        disabled={busy}
                        className="absolute right-1.5 top-1.5 z-[1] inline-flex h-7 w-7 items-center justify-center rounded-md bg-black/75 text-gray-300 transition-colors hover:bg-red-700 hover:text-white disabled:opacity-40"
                        aria-label={`Remove ${video.title || 'video'}`}
                        title="Remove video"
                      >
                        <FaTrash className="h-3 w-3" aria-hidden />
                      </button>
                    ) : null}
                  </div>
                  )
                })}
              </TheaterVideoStrip>
            ) : isAdmin ? (
              <div className="flex h-full min-h-[8rem] w-full items-center justify-center rounded-lg border border-dashed border-gray-700 bg-gray-900/30 px-4 text-center text-xs text-gray-400">
                Paste a YouTube link below. Public only sees this row after you add at least one video.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Admin URL strip sits under the video panel, above EpReleaseStage when placed in content */}
      {isAdmin ? (
        <div className="flex flex-col gap-1.5 px-3 py-2 sm:flex-row sm:items-center sm:px-5">
          <button
            type="button"
            onClick={toggleVideosExpanded}
            className="inline-flex min-h-[36px] shrink-0 items-center justify-center gap-1.5 self-start rounded-md border border-gray-700 px-2.5 py-2 text-xs font-medium text-gray-300 transition-colors hover:bg-gray-800 hover:text-white sm:self-auto"
            aria-expanded={expanded}
            aria-controls={panelId}
            title={expanded ? 'Collapse video previews' : 'Expand video previews'}
          >
            {expanded ? <FaChevronUp className="h-3 w-3" aria-hidden /> : <FaChevronDown className="h-3 w-3" aria-hidden />}
            <span className="hidden sm:inline">{expanded ? 'Collapse' : 'Expand'}</span>
          </button>
          <div className="flex shrink-0 items-center gap-2 text-xs font-medium text-gray-200">
            <FaYoutube className="h-4 w-4 text-red-500" aria-hidden />
            <span>YouTube</span>
            {videos.length > 0 ? (
              <span className="text-gray-500">
                · {videos.length}/{FOLDER_MUSIC_VIDEOS_MAX}
              </span>
            ) : null}
          </div>
          <input
            type="text"
            inputMode="url"
            value={draftUrl}
            onChange={(e) => {
              setDraftUrl(e.target.value)
              if (error) setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void addVideo()
              }
            }}
            placeholder="Paste YouTube URL or video ID"
            disabled={busy || !canAdd}
            className="min-w-0 flex-1 rounded-md border border-gray-600 bg-gray-900 px-2.5 py-2 text-sm text-white outline-none placeholder:text-gray-500 focus:border-red-500 focus:ring-1 focus:ring-red-500 disabled:opacity-50"
            aria-label="YouTube URL"
          />
          <input
            type="text"
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void addVideo()
              }
            }}
            placeholder="Title (optional)"
            disabled={busy || !canAdd}
            className="w-full rounded-md border border-gray-700 bg-gray-900/80 px-2.5 py-2 text-sm text-white outline-none placeholder:text-gray-500 focus:border-red-500 focus:ring-1 focus:ring-red-500 disabled:opacity-50 sm:w-44"
            aria-label="Video title"
          />
          <button
            type="button"
            onClick={() => void addVideo()}
            disabled={busy || !canAdd || !draftUrl.trim()}
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <FaPlus className="h-3 w-3" aria-hidden />
            Add video
          </button>
          {sizeToggle}
        </div>
      ) : (
        <div className="relative flex items-center justify-center px-3 py-1.5 sm:px-5">
          <button
            type="button"
            onClick={() => {
              if (canWatch) {
                setGateOpen(false)
                toggleVideosExpanded()
                return
              }
              setGateOpen((v) => !v)
            }}
            className={`inline-flex min-h-[32px] items-center justify-center gap-2 rounded-md px-2 py-1 text-xs font-medium text-gray-300 transition-colors hover:bg-gray-800 hover:text-white ${
              sizeToggle ? 'max-w-[calc(100%-7.5rem)]' : 'max-w-full'
            }`}
            aria-expanded={canWatch ? expanded : gateOpen}
            aria-controls={panelId}
          >
            {expanded ? <FaChevronUp className="h-3 w-3 shrink-0" aria-hidden /> : <FaChevronDown className="h-3 w-3 shrink-0" aria-hidden />}
            <FaYoutube className="h-3.5 w-3.5 shrink-0 text-red-500" aria-hidden />
            <span className="min-w-0 truncate text-center">
              <span className="font-medium text-gray-200">{watchLabel}</span>
              {watchVideoName ? <span className="text-gray-400"> — {watchVideoName}</span> : null}
            </span>
          </button>
          {sizeToggle ? (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 sm:right-5">{sizeToggle}</div>
          ) : null}
        </div>
      )}

      {error ? <p className="px-3 pb-2 text-[11px] text-red-400 sm:px-5">{error}</p> : null}
    </div>
  )
}

const SUBSCRIBE_GATE_NOTES: Record<string, string> = {
  denied: 'Sign-in was cancelled. Use the Google account on your YouTube profile.',
  unsubscribed: 'YouTube did not confirm the subscription. Try the link again.',
  unconfigured: 'Subscribe on YouTube, then return here to watch.',
  channel: 'The SERGIK channel could not be confirmed.',
  state: 'That sign-in expired. Use the link again.',
  error: 'YouTube could not confirm the subscription. Try again.',
}

function subscribeGateNote(flag: string): string {
  return SUBSCRIBE_GATE_NOTES[flag] || SUBSCRIBE_GATE_NOTES.error
}

function YouTubeSubscribeGate({
  panelId,
  channel: _channel,
  note,
  onUnlocked,
}: {
  panelId: string
  channel: string
  note: string | null
  onUnlocked: () => void
}) {
  const [email, setEmail] = useState('')
  const [pending, setPending] = useState(false)
  const [askEmail, setAskEmail] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [googleClientId, setGoogleClientId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetch('/api/youtube/subscribe-gate/status', { credentials: 'same-origin', cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { googleClientId?: string | null } | null) => {
        if (!cancelled && data?.googleClientId) setGoogleClientId(data.googleClientId)
      })
      .catch(() => {
        /* the button still tries contacts already on this browser */
      })
    return () => {
      cancelled = true
    }
  }, [])

  const unlockWith = async (body: { email?: string; accessToken?: string }) => {
    const res = await fetch('/api/youtube/subscribe-gate/ack', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, promoConsent: getPromoContactConsent() }),
    })
    const data = (await res.json().catch(() => null)) as { unlocked?: boolean; needsAccount?: boolean; error?: string } | null
    if (res.ok && data?.unlocked) {
      onUnlocked()
      return 'unlocked' as const
    }
    if (data?.needsAccount) return 'needs' as const
    setFormError(data?.error || 'Could not confirm the subscription. Try again.')
    return 'error' as const
  }

  const unlockHere = async (typedEmail?: string) => {
    if (pending) return
    setFormError(null)
    setPending(true)
    try {
      const manual = typedEmail?.trim()
      if (manual) {
        if (!manual.includes('@')) {
          setFormError('Enter the email on your Google account.')
          return
        }
        await unlockWith({ email: manual })
        return
      }

      const known = await unlockWith({})
      if (known !== 'needs') return

      const saved = await pickSavedBrowserEmail('silent')
      if (saved) {
        const fromBrowser = await unlockWith({ email: saved })
        if (fromBrowser !== 'needs') return
      }

      if (googleClientId) {
        const accessToken = await requestGoogleAccessToken(googleClientId)
        if (accessToken) {
          const fromGoogle = await unlockWith({ accessToken })
          if (fromGoogle !== 'needs') return
        }
      }

      setAskEmail(true)
    } catch {
      setFormError('Could not confirm the subscription. Try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div id={panelId} className="border-b border-gray-700/80 px-3 py-3 sm:px-5">
      <form
        className="mx-auto flex max-w-lg flex-col items-center gap-2 text-center"
        onSubmit={(event) => {
          event.preventDefault()
          void unlockHere(askEmail ? email : undefined)
        }}
      >
        {askEmail ? (
          <>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email"
              autoComplete="email"
              aria-label="Email"
              disabled={pending}
              className="w-full max-w-xs rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none placeholder:text-gray-500 focus:border-red-500"
            />
            <p className="text-[11px] text-gray-500">Use the email on your Google account.</p>
          </>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-[36px] items-center justify-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-60"
        >
          <FaYoutube className="h-3.5 w-3.5" aria-hidden />
          Subscribe & unlock
        </button>
        {formError ? <p className="text-[11px] text-amber-200">{formError}</p> : null}
        {note ? <p className="text-[11px] text-amber-200">{note}</p> : null}
      </form>
    </div>
  )
}
