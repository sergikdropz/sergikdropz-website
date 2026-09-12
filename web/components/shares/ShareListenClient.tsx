'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import ShareMiniPlayer, { type ShareScrubApi } from '@/components/shares/ShareMiniPlayer'
import ShareVinylStage from '@/components/shares/ShareVinylStage'
import { useAlbumAccents } from '@/hooks/useAlbumAccents'
import { rgbToCss } from '@/lib/shares/album-accents'
import { pickShareArtwork, shareDisplayArtworkUrl, type ResolvedSharePayload } from '@/lib/shares/types'

function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return ''
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

type StageMode = 'cover' | 'vinyl' | 'sleeve'

const STAGE_MODES: { id: StageMode; label: string }[] = [
  { id: 'cover', label: 'Cover' },
  { id: 'vinyl', label: 'Disc' },
  { id: 'sleeve', label: 'Sleeve' },
]

export default function ShareListenClient({
  token,
  variant = 'page',
}: {
  token: string
  /** `embed` = same formula inside iframes (fills frame height). */
  variant?: 'page' | 'embed'
}) {
  const [data, setData] = useState<ResolvedSharePayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeIndex, setActiveIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [stageMode, setStageMode] = useState<StageMode>('vinyl')
  const scrubApiRef = useRef<ShareScrubApi | null>(null)
  const scrubWasPlayingRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/shares/${encodeURIComponent(token)}`)
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(json.error || 'Share not found')
        }
        if (!cancelled) setData(json as ResolvedSharePayload)
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Failed to load')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  const artworkRaw = data ? pickShareArtwork(data, activeIndex) : undefined
  const artwork = shareDisplayArtworkUrl(artworkRaw) || artworkRaw
  const accents = useAlbumAccents(artwork)

  // Kick cover download as soon as we know the URL (before paint of vinyl stage).
  useEffect(() => {
    if (!artwork || typeof document === 'undefined') return
    const link = document.createElement('link')
    link.rel = 'preload'
    link.as = 'image'
    link.href = artwork
    link.fetchPriority = 'high'
    document.head.appendChild(link)
    return () => {
      link.remove()
    }
  }, [artwork])

  const onPlayed = useCallback(() => {
    void fetch(`/api/shares/${encodeURIComponent(token)}?play=1`).catch(() => undefined)
  }, [token])

  const onPlayingChange = useCallback((next: boolean) => {
    setPlaying(next)
  }, [])

  const onVinylScrubStart = useCallback(() => {
    const api = scrubApiRef.current
    scrubWasPlayingRef.current = api?.getPosition().playing ?? playing
    api?.pause()
  }, [playing])

  const onVinylScrubDelta = useCallback((deltaSeconds: number) => {
    const api = scrubApiRef.current
    if (!api || !Number.isFinite(deltaSeconds) || deltaSeconds === 0) return
    const { currentTime, duration } = api.getPosition()
    const dur = duration > 0 ? duration : Number.POSITIVE_INFINITY
    api.seek(Math.max(0, Math.min(dur, currentTime + deltaSeconds)))
  }, [])

  const onVinylScrubEnd = useCallback(() => {
    if (scrubWasPlayingRef.current) scrubApiRef.current?.play()
    scrubWasPlayingRef.current = false
  }, [])

  if (loading) {
    return (
      <div
        className={`flex items-center justify-center bg-black text-zinc-500 ${
          variant === 'embed' ? 'h-full min-h-[560px]' : 'min-h-screen'
        }`}
      >
        Loading…
      </div>
    )
  }

  if (error || !data) {
    return (
      <div
        className={`flex items-center justify-center bg-black px-4 text-center ${
          variant === 'embed' ? 'h-full min-h-[560px]' : 'min-h-screen'
        }`}
      >
        <div>
          <h1 className="text-2xl font-semibold text-white">Link unavailable</h1>
          <p className="mt-2 text-zinc-400">{error || 'This share was revoked or expired.'}</p>
          {variant === 'page' && (
            <Link href="/music" className="mt-6 inline-block text-sm text-zinc-300 underline">
              Browse music
            </Link>
          )}
        </div>
      </div>
    )
  }

  const artist = data.tracks[0]?.artist || data.collection?.artist || 'SERGIK'
  const kindLabel =
    data.share.kind === 'folder'
      ? (data.collection?.type || 'ep').toUpperCase()
      : 'TRACK'
  const subtitle =
    data.share.kind === 'folder'
      ? `${kindLabel} · ${data.tracks.length} track${data.tracks.length === 1 ? '' : 's'}`
      : data.collection?.title
  const activeTrack = data.tracks[activeIndex] || data.tracks[0]

  const stageStyle = {
    ['--share-accent' as string]: accents.css.primary,
    ['--share-accent-2' as string]: accents.css.secondary,
    ['--share-accent-muted' as string]: accents.css.muted,
    ['--share-accent-glow' as string]: accents.css.glow,
    backgroundColor: '#050505',
  }

  return (
    <div
      className={`relative flex flex-col text-white ${
        variant === 'embed' ? 'h-full min-h-[560px]' : 'min-h-screen'
      }`}
      style={stageStyle}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {/* Soft album-color washes */}
        <div
          className="absolute -left-1/4 top-[-10%] h-[70%] w-[80%] rounded-full opacity-70 blur-3xl transition-colors duration-700"
          style={{
            background: `radial-gradient(circle, ${rgbToCss(accents.primary, 0.55)} 0%, transparent 70%)`,
          }}
        />
        <div
          className="absolute -right-1/4 top-[20%] h-[55%] w-[70%] rounded-full opacity-60 blur-3xl transition-colors duration-700"
          style={{
            background: `radial-gradient(circle, ${rgbToCss(accents.secondary, 0.4)} 0%, transparent 70%)`,
          }}
        />
        <div
          className="absolute bottom-[-10%] left-1/2 h-[45%] w-[90%] -translate-x-1/2 rounded-full opacity-50 blur-3xl transition-colors duration-700"
          style={{
            background: `radial-gradient(circle, ${rgbToCss(accents.muted, 0.8)} 0%, transparent 70%)`,
          }}
        />
        {artwork && (
          <div
            className="absolute inset-0 scale-110 bg-cover bg-center opacity-25 blur-3xl saturate-150"
            style={{ backgroundImage: `url(${artwork})` }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/50 to-black/90" />
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <header className="relative z-10 flex items-center justify-between gap-3 px-4 pt-3 sm:px-6 sm:pt-4">
          <Link
            href="/"
            target={variant === 'embed' ? '_blank' : undefined}
            rel={variant === 'embed' ? 'noopener noreferrer' : undefined}
            className="font-[family-name:var(--font-six-caps)] text-2xl tracking-wide text-white/90 hover:text-white sm:text-3xl"
          >
            SERGIK
          </Link>
          <span className="text-[10px] uppercase tracking-[0.22em] text-white/45">{kindLabel}</span>
        </header>

        <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-4 pb-4 pt-2 sm:px-8 sm:pb-6">
          <div
            className={`w-full ${
              stageMode === 'sleeve'
                ? 'max-w-[min(96vw,480px)]'
                : variant === 'embed'
                  ? 'max-w-[min(92vw,380px)]'
                  : 'max-w-[min(92vw,560px)]'
            }`}
          >
            {stageMode === 'cover' && (
              <div className="relative aspect-square w-full overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.65)] ring-1 ring-white/10">
                {artwork ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={artwork}
                    alt=""
                    className="h-full w-full object-cover"
                    decoding="async"
                    fetchPriority="high"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-zinc-900 font-[family-name:var(--font-six-caps)] text-5xl text-zinc-600">
                    SERGIK
                  </div>
                )}
              </div>
            )}
            {/* Keep disc mounted (hidden on cover) so the spin clock never remount-snaps */}
            <div className={stageMode === 'cover' ? 'hidden' : 'contents'}>
              <ShareVinylStage
                mode={stageMode === 'cover' ? 'vinyl' : stageMode}
                artwork={artwork}
                spinning={playing}
                scrubEnabled={stageMode === 'vinyl'}
                onScrubStart={onVinylScrubStart}
                onScrubDelta={onVinylScrubDelta}
                onScrubEnd={onVinylScrubEnd}
              />
            </div>

            <div className="mt-5 flex justify-center sm:mt-6">
              <div
                className="inline-flex rounded-full border border-white/15 bg-black/40 p-0.5 backdrop-blur-sm"
                role="tablist"
                aria-label="Artwork style"
              >
                {STAGE_MODES.map((mode) => {
                  const active = stageMode === mode.id
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setStageMode(mode.id)}
                      className={`rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] transition sm:px-3 ${
                        active
                          ? 'bg-white text-black'
                          : 'text-white/55 hover:text-white'
                      }`}
                    >
                      {mode.label}
                    </button>
                  )
                })}
              </div>
            </div>
            {stageMode === 'vinyl' && (
              <p className="mt-2 text-center text-[10px] uppercase tracking-[0.18em] text-white/35">
                Drag in a circle to scrub
              </p>
            )}

            <div className="mt-4 text-center sm:mt-5">
              <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
                {data.share.title}
              </h1>
              <p className="mt-1.5 text-sm text-zinc-300 sm:text-base">
                {artist}
                {subtitle ? <span className="text-zinc-500"> · {subtitle}</span> : null}
              </p>
              {data.share.kind === 'folder' && activeTrack && data.tracks.length > 1 && (
                <p className="mt-2 text-xs text-zinc-500">Now playing · {activeTrack.title}</p>
              )}
            </div>
          </div>

          {data.share.kind === 'folder' && data.tracks.length > 1 && (
            <ol className="mt-6 w-full max-w-[min(92vw,560px)] space-y-0.5 border-t border-white/10 pt-4">
              {data.tracks.map((t, i) => {
                const active = i === activeIndex
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setActiveIndex(i)}
                      className={`flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition ${
                        active
                          ? 'bg-white/10 text-white'
                          : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
                      }`}
                    >
                      <span className={`w-5 tabular-nums text-xs ${active ? 'text-white' : 'text-zinc-600'}`}>
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">{t.title}</span>
                      <span className="tabular-nums text-xs text-zinc-600">{formatDuration(t.duration)}</span>
                    </button>
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      </div>

      <div
        className="relative z-20 sticky bottom-0 border-t"
        style={{
          borderColor: rgbToCss(accents.primary, 0.25),
          background: `linear-gradient(180deg, ${rgbToCss(accents.muted, 0.72)} 0%, rgba(0,0,0,0.88) 100%)`,
        }}
      >
        <ShareMiniPlayer
          dock
          tracks={data.tracks}
          title={data.share.title}
          subtitle={kindLabel}
          artwork={artwork}
          activeIndex={activeIndex}
          onActiveIndexChange={setActiveIndex}
          onPlayed={onPlayed}
          onPlayingChange={onPlayingChange}
          scrubApiRef={scrubApiRef}
        />
      </div>
    </div>
  )
}
