'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import ShareMiniPlayer, { type ShareScrubApi } from '@/components/shares/ShareMiniPlayer'
import ShareVinylStage from '@/components/shares/ShareVinylStage'
import { useAlbumAccents } from '@/hooks/useAlbumAccents'
import { useVisualViewportBottomOffset } from '@/hooks/useVisualViewportBottomOffset'
import { rgbToCss } from '@/lib/shares/album-accents'
import type { ShareTrackPayload } from '@/lib/shares/types'

type StageMode = 'cover' | 'vinyl' | 'sleeve'

const STAGE_MODES: { id: StageMode; label: string }[] = [
  { id: 'cover', label: 'Cover' },
  { id: 'vinyl', label: 'Disc' },
  { id: 'sleeve', label: 'Sleeve' },
]

function coverDriftSeed(name: string): number {
  let h = 2166136261
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export default function OrderDownloadStage({
  title,
  artist,
  artwork,
  kindLabel,
  formatLabel,
  tracks,
  packHref,
  packLabel,
  aside,
}: {
  title: string
  artist: string
  artwork: string | null
  kindLabel: string
  formatLabel: string
  tracks: Array<{ id: string; title: string; artist: string; href: string; filename: string; playback: string }>
  packHref?: string | null
  packLabel?: string
  /** Shown under the title when the file list is locked or empty. */
  aside?: React.ReactNode
}) {
  const [stageMode, setStageMode] = useState<StageMode>('vinyl')
  const [activeIndex, setActiveIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const scrubApiRef = useRef<ShareScrubApi | null>(null)
  const pendingPlay = useRef(false)
  const visualBottomOffset = useVisualViewportBottomOffset()
  const accents = useAlbumAccents(artwork)
  const seed = coverDriftSeed(title || artwork || 'download')
  const coverDriftVariant = seed % 8
  const coverDriftDelaySec = -((seed >>> 3) % 28)
  const subtitle = `${kindLabel} · ${tracks.length} track${tracks.length === 1 ? '' : 's'}${formatLabel ? ` · ${formatLabel}` : ''}`
  const playable: ShareTrackPayload[] = tracks.map((track) => ({
    id: track.id,
    title: track.title,
    artist: track.artist,
    duration: 0,
    file: track.playback,
    playbackUrl: track.playback,
    artwork: artwork || undefined,
  }))

  useEffect(() => {
    if (!pendingPlay.current) return
    pendingPlay.current = false
    scrubApiRef.current?.play()
  }, [activeIndex])

  function playTrack(index: number) {
    if (!tracks[index]?.playback) return
    if (index === activeIndex) {
      const api = scrubApiRef.current
      if (!api) return
      if (api.getPosition().playing) api.pause()
      else api.play()
      return
    }
    pendingPlay.current = true
    setActiveIndex(index)
  }

  return (
    <div
      className="relative flex min-h-screen flex-col text-white"
      style={{
        backgroundColor: '#050505',
        ['--share-accent' as string]: accents.css.primary,
        ['--share-accent-2' as string]: accents.css.secondary,
      }}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {artwork ? (
          <>
            <div className="absolute inset-0 overflow-hidden brightness-[0.58]">
              <div
                className={`ep-release-cover-drift ep-release-cover-drift-${coverDriftVariant} absolute inset-0`}
                style={{ animationDelay: `${coverDriftDelaySec}s` }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={artwork} alt="" className="h-full w-full object-cover" decoding="async" />
              </div>
            </div>
            <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/58 to-black/72" />
          </>
        ) : (
          <div
            className="absolute -left-1/4 top-[-10%] h-[70%] w-[80%] rounded-full opacity-70 blur-3xl"
            style={{ background: `radial-gradient(circle, ${rgbToCss(accents.primary, 0.55)} 0%, transparent 70%)` }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/85" />
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <header className="relative z-10 flex items-center justify-between gap-3 px-4 pt-3 sm:px-6 sm:pt-4">
          <Link href="/" className="font-[family-name:var(--font-six-caps)] text-2xl tracking-wide text-white/90 hover:text-white sm:text-3xl">
            SERGIK
          </Link>
          <span className="text-[10px] uppercase tracking-[0.22em] text-white/45">Download</span>
        </header>

        <div
          className={`relative z-10 flex flex-1 flex-col items-center px-4 pt-2 sm:px-8 ${
            tracks.length
              ? 'pb-[calc(12rem+env(safe-area-inset-bottom,0px))]'
              : 'pb-16'
          }`}
        >
          <div className={`w-full ${stageMode === 'sleeve' ? 'max-w-[min(96vw,480px)]' : 'max-w-[min(92vw,560px)]'}`}>
            {stageMode === 'cover' && (
              <div className="relative aspect-square w-full overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.65)] ring-1 ring-white/10">
                {artwork ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={artwork} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-zinc-900 font-[family-name:var(--font-six-caps)] text-5xl text-zinc-600">
                    SERGIK
                  </div>
                )}
              </div>
            )}
            <div className={stageMode === 'cover' ? 'hidden' : 'block w-full'}>
              <ShareVinylStage mode={stageMode === 'cover' ? 'vinyl' : stageMode} artwork={artwork || undefined} spinning={playing} />
            </div>

            <div className="mt-5 flex justify-center sm:mt-6">
              <div className="inline-flex rounded-full border border-white/15 bg-black/40 p-0.5 backdrop-blur-sm" role="tablist" aria-label="Artwork style">
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
                        active ? 'bg-white text-black' : 'text-white/55 hover:text-white'
                      }`}
                    >
                      {mode.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="mt-4 text-center sm:mt-5">
              <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">{title}</h1>
              <p className="mt-1.5 text-sm text-zinc-300 sm:text-base">
                {artist}
                <span className="text-zinc-500"> · {subtitle}</span>
              </p>
            </div>
          </div>

          {tracks.length ? (
            <ol className="mt-6 w-full max-w-[min(92vw,560px)] space-y-0.5 rounded-2xl border border-white/10 bg-black/75 px-2 py-3 shadow-2xl backdrop-blur-md">
              {packHref ? (
                <li className="px-2 pb-2">
                  <a
                    href={packHref}
                    className="flex w-full items-center justify-center rounded-md bg-white py-2.5 text-[11px] font-medium uppercase tracking-[0.16em] text-black hover:bg-white/90"
                  >
                    {packLabel || 'Download all'}
                  </a>
                </li>
              ) : null}
              {tracks.map((track, index) => {
                const active = index === activeIndex
                return (
                  <li key={track.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => playTrack(index)}
                      className={`flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-2.5 text-left text-sm transition ${
                        active ? 'bg-white/10 text-white' : 'text-zinc-200 hover:bg-white/5 hover:text-white'
                      }`}
                      aria-label={`Play ${track.title}`}
                    >
                      <span className={`w-5 tabular-nums text-xs ${active ? 'text-white' : 'text-zinc-500'}`}>{index + 1}</span>
                      <span className="min-w-0 flex-1 truncate font-medium">{track.title}</span>
                    </button>
                    {track.href ? (
                      <a
                        href={track.href}
                        download={track.filename}
                        className="shrink-0 rounded-md px-2 py-2.5 text-[10px] uppercase tracking-[0.14em] text-white/80 hover:bg-white/10 hover:text-white"
                        aria-label={`Download ${track.title}`}
                      >
                        Download
                      </a>
                    ) : (
                      <span className="shrink-0 px-2 text-[10px] uppercase tracking-[0.14em] text-white/35">Unavailable</span>
                    )}
                  </li>
                )
              })}
            </ol>
          ) : aside ? (
            <div className="mt-6 w-full max-w-[min(92vw,560px)]">{aside}</div>
          ) : null}
        </div>
      </div>

      {tracks.length ? (
      <div
        className="fixed inset-x-0 z-20 border-t border-white/15 backdrop-blur-md"
        style={{
          bottom: visualBottomOffset,
          background: `linear-gradient(180deg, ${rgbToCss(accents.muted, 0.72)} 0%, rgba(0,0,0,0.92) 100%)`,
        }}
      >
        <ShareMiniPlayer
          dock
          tracks={playable}
          title={title}
          subtitle={kindLabel}
          artwork={artwork || undefined}
          activeIndex={activeIndex}
          onActiveIndexChange={(index) => {
            pendingPlay.current = true
            setActiveIndex(index)
          }}
          onPlayingChange={setPlaying}
          scrubApiRef={scrubApiRef}
        />
      </div>
      ) : null}
    </div>
  )
}
