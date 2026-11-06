'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MutableRefObject, type ReactNode } from 'react'
import { FaPause, FaPlay, FaStepBackward, FaStepForward } from 'react-icons/fa'
import SoundCloudEmbed from '@/components/SoundCloudEmbed'
import {
  formatTvDuration,
  type TvListenItem,
  type TvReleaseItem,
  type TvVideoItem,
} from '@/lib/tv/catalog'
import { isTvBackKey, moveTvFocus, type TvFocus } from '@/lib/tv/focus'
import {
  firstPlayableTrackIndex,
  releaseHasPlayableAudio,
  stepPlayableTrackIndex,
} from '@/lib/tv/playback'
import { isYouTubePlaceholderThumbnail } from '@/lib/videos/youtube'

export type TvScreenCatalog = {
  videos: TvVideoItem[]
  listen: TvListenItem[]
  releases: TvReleaseItem[]
}

type TvRow =
  | { id: 'videos'; title: string; kind: 'video'; items: TvVideoItem[] }
  | { id: 'listen'; title: string; kind: 'listen'; items: TvListenItem[] }
  | { id: 'releases'; title: string; kind: 'release'; items: TvReleaseItem[] }

type TvStage =
  | { kind: 'video'; item: TvVideoItem }
  | { kind: 'listen'; item: TvListenItem }
  | { kind: 'release'; item: TvReleaseItem; trackIndex: number }

type TvTransport = {
  toggle: () => void
  seek: (deltaSeconds: number) => void
}

export default function TvScreen({ catalog }: { catalog: TvScreenCatalog }) {
  const rows = useMemo(() => buildRows(catalog), [catalog])
  const lengths = useMemo(() => rows.map((row) => row.items.length), [rows])
  const [focus, setFocus] = useState<TvFocus>({ row: 0, col: 0 })
  const [stage, setStage] = useState<TvStage | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [mediaDuration, setMediaDuration] = useState(0)
  const [paused, setPaused] = useState(true)
  const stageRef = useRef(stage)
  const transportRef = useRef<TvTransport | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const audioUrlRef = useRef('')
  stageRef.current = stage

  const playAudio = useCallback((url?: string | null) => {
    const audio = audioRef.current
    if (!audio) return
    const next = (url || '').trim()
    if (!next) {
      audio.pause()
      return
    }
    if (audioUrlRef.current !== next) {
      audioUrlRef.current = next
      audio.src = next
      setElapsed(0)
      setMediaDuration(0)
    }
    void audio.play().catch(() => setPaused(true))
  }, [])

  const toggleRelease = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      if (audio.ended) audio.currentTime = 0
      void audio.play().catch(() => setPaused(true))
    } else audio.pause()
  }, [])

  const seekRelease = useCallback((deltaSeconds: number) => {
    const audio = audioRef.current
    if (!audio) return
    const duration = Number.isFinite(audio.duration) ? audio.duration : Number.POSITIVE_INFINITY
    audio.currentTime = Math.min(duration, Math.max(0, audio.currentTime + deltaSeconds))
  }, [])

  const seekReleaseRatio = useCallback((ratio: number) => {
    const audio = audioRef.current
    const current = stageRef.current
    if (!audio || current?.kind !== 'release') return
    const fromFile = Number.isFinite(audio.duration) ? audio.duration : 0
    const fromCatalog = current.item.tracks[current.trackIndex]?.duration || 0
    const duration = fromFile > 0 ? fromFile : fromCatalog
    if (duration <= 0) return
    const next = Math.min(1, Math.max(0, ratio))
    audio.currentTime = next * duration
  }, [])

  const stepRelease = useCallback((delta: 1 | -1) => {
    const current = stageRef.current
    if (current?.kind !== 'release') return
    const trackIndex = stepPlayableTrackIndex(current.item.tracks, current.trackIndex, delta)
    const track = current.item.tracks[trackIndex]
    setStage({ kind: 'release', item: current.item, trackIndex })
    playAudio(track?.audioUrl)
  }, [playAudio])

  const selectReleaseTrack = useCallback((index: number) => {
    const current = stageRef.current
    if (current?.kind !== 'release') return
    const track = current.item.tracks[index]
    if (!track?.audioUrl?.trim()) return
    if (index === current.trackIndex) {
      toggleRelease()
      return
    }
    setStage({ kind: 'release', item: current.item, trackIndex: index })
    playAudio(track.audioUrl)
  }, [playAudio, toggleRelease])

  const beginStage = useCallback((next: TvStage) => {
    setStage(next)
    if (next.kind === 'release') {
      playAudio(next.item.tracks[next.trackIndex]?.audioUrl)
      return
    }
    audioRef.current?.pause()
  }, [playAudio])

  const openFocused = useCallback(() => {
    const next = stageFromRow(rows[focus.row], focus.col)
    if (next) beginStage(next)
  }, [beginStage, focus.col, focus.row, rows])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (isTvBackKey(event.key, event.keyCode)) {
        event.preventDefault()
        if (stageRef.current) {
          audioRef.current?.pause()
          setStage(null)
        }
        return
      }

      const target = event.target
      if (target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return

      const current = stageRef.current
      if (current?.kind === 'video') {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          transportRef.current?.toggle()
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault()
          transportRef.current?.seek(-10)
        } else if (event.key === 'ArrowRight') {
          event.preventDefault()
          transportRef.current?.seek(10)
        }
        return
      }

      if (current?.kind === 'release' && releaseHasPlayableAudio(current.item.tracks)) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          toggleRelease()
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault()
          seekRelease(event.key === 'ArrowLeft' ? -10 : 10)
        } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault()
          stepRelease(event.key === 'ArrowDown' ? 1 : -1)
        }
        return
      }

      if (current) return

      if (event.key === 'Enter') {
        event.preventDefault()
        openFocused()
        return
      }

      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault()
        setFocus((prev) => moveTvFocus(prev, event.key, lengths))
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lengths, openFocused, seekRelease, stepRelease, toggleRelease])

  useEffect(() => {
    if (stage) return
    const node = document.querySelector<HTMLButtonElement>('[data-tv-focus="true"]')
    node?.focus({ preventScroll: true })
    node?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [focus, stage, rows])

  const focusedTitle = rows[focus.row]?.items[focus.col]?.title || 'SERGIK'

  return (
    <main className="min-h-screen bg-black text-white" data-testid="tv-screen">
      <div className="mx-auto flex min-h-screen max-w-[1920px] flex-col px-[5vw] py-[4vh]">
        <header className="mb-8 flex items-end justify-between gap-8">
          <div>
            <p className="font-six-caps text-6xl leading-none tracking-[0.18em] text-white">SERGIK</p>
            <p className="mt-3 text-lg text-gray-400">Arrows move. Enter plays. Back closes.</p>
          </div>
          <p className="max-w-xl text-right text-2xl text-white">{focusedTitle}</p>
        </header>

        {rows.length === 0 ? (
          <p className="mt-16 text-2xl text-gray-400">Nothing is on the shelf yet.</p>
        ) : (
          <div className="flex flex-1 flex-col gap-8">
            {rows.map((row, rowIndex) => (
              <TvRowShelf
                key={row.id}
                row={row}
                rowIndex={rowIndex}
                focus={focus}
                stageOpen={Boolean(stage)}
                onOpen={(next, nextFocus) => {
                  setFocus(nextFocus)
                  beginStage(next)
                }}
              />
            ))}
          </div>
        )}
      </div>

      {stage ? (
        <TvStageView
          stage={stage}
          elapsed={elapsed}
          mediaDuration={mediaDuration}
          paused={paused}
          transportRef={transportRef}
          onToggle={toggleRelease}
          onSeek={seekRelease}
          onSeekRatio={seekReleaseRatio}
          onStep={stepRelease}
          onSelectTrack={selectReleaseTrack}
          onClose={() => {
            audioRef.current?.pause()
            setStage(null)
          }}
        />
      ) : null}
      <audio
        ref={audioRef}
        preload="none"
        onTimeUpdate={(event) => setElapsed(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => setMediaDuration(event.currentTarget.duration || 0)}
        onDurationChange={(event) => setMediaDuration(event.currentTarget.duration || 0)}
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        onEnded={() => {
          const current = stageRef.current
          if (current?.kind !== 'release') return
          const trackIndex = stepPlayableTrackIndex(current.item.tracks, current.trackIndex, 1)
          if (trackIndex === current.trackIndex) return
          setStage({ kind: 'release', item: current.item, trackIndex })
          playAudio(current.item.tracks[trackIndex]?.audioUrl)
        }}
      />
    </main>
  )
}

function buildRows(catalog: TvScreenCatalog): TvRow[] {
  const rows: TvRow[] = []
  if (catalog.videos.length > 0) rows.push({ id: 'videos', title: 'Videos', kind: 'video', items: catalog.videos })
  if (catalog.listen.length > 0) rows.push({ id: 'listen', title: 'Sets', kind: 'listen', items: catalog.listen })
  if (catalog.releases.length > 0) rows.push({ id: 'releases', title: 'Releases', kind: 'release', items: catalog.releases })
  return rows
}

function stageFromRow(row: TvRow | undefined, col: number): TvStage | null {
  if (!row) return null
  if (row.kind === 'video') {
    const item = row.items[col]
    return item ? { kind: 'video', item } : null
  }
  if (row.kind === 'listen') {
    const item = row.items[col]
    return item ? { kind: 'listen', item } : null
  }
  const item = row.items[col]
  return item ? { kind: 'release', item, trackIndex: firstPlayableTrackIndex(item.tracks) } : null
}

function TvRowShelf({
  row,
  rowIndex,
  focus,
  stageOpen,
  onOpen,
}: {
  row: TvRow
  rowIndex: number
  focus: TvFocus
  stageOpen: boolean
  onOpen: (stage: TvStage, focus: TvFocus) => void
}) {
  return (
    <section aria-label={row.title}>
      <h2 className="font-six-caps mb-3 text-4xl tracking-[0.14em] text-white">{row.title}</h2>
      <div className="flex gap-5 overflow-x-auto py-4">
        {row.kind === 'video'
          ? row.items.map((item, colIndex) => (
              <ShelfButton
                key={item.id}
                title={item.title}
                meta={item.category}
                wide
                selected={focus.row === rowIndex && focus.col === colIndex && !stageOpen}
                onSelect={() => onOpen({ kind: 'video', item }, { row: rowIndex, col: colIndex })}
                art={<VideoThumb thumbnails={item.thumbnails} />}
              />
            ))
          : null}
        {row.kind === 'listen'
          ? row.items.map((item, colIndex) => (
              <ShelfButton
                key={item.id}
                title={item.title}
                meta="SoundCloud"
                wide
                selected={focus.row === rowIndex && focus.col === colIndex && !stageOpen}
                onSelect={() => onOpen({ kind: 'listen', item }, { row: rowIndex, col: colIndex })}
                art={<TitlePlate title={item.title} />}
              />
            ))
          : null}
        {row.kind === 'release'
          ? row.items.map((item, colIndex) => (
              <ShelfButton
                key={item.id}
                title={item.title}
                meta={releaseCardMeta(item)}
                wide={false}
                selected={focus.row === rowIndex && focus.col === colIndex && !stageOpen}
                onSelect={() =>
                  onOpen(
                    { kind: 'release', item, trackIndex: firstPlayableTrackIndex(item.tracks) },
                    { row: rowIndex, col: colIndex },
                  )
                }
                art={item.image ? <img src={item.image} alt="" className="h-full w-full object-cover" /> : <TitlePlate title={item.title} />}
              />
            ))
          : null}
      </div>
    </section>
  )
}

function ShelfButton({
  title,
  meta,
  wide,
  selected,
  art,
  onSelect,
}: {
  title: string
  meta: string
  wide: boolean
  selected: boolean
  art: ReactNode
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      data-tv-focus={selected ? 'true' : 'false'}
      aria-label={title}
      onClick={onSelect}
      className={`shrink-0 rounded-2xl text-left outline-none transition ${
        wide ? 'w-[22rem]' : 'w-60'
      } ${selected ? 'scale-105 ring-4 ring-white' : 'ring-2 ring-white/15'}`}
    >
      <div className={`relative overflow-hidden rounded-2xl bg-neutral-900 ${wide ? 'aspect-video' : 'aspect-square'}`}>
        {art}
      </div>
      <span className="mt-3 block truncate px-1 text-xl text-white">{title}</span>
      <span className="block truncate px-1 text-base text-gray-400">{meta}</span>
    </button>
  )
}

function VideoThumb({ thumbnails }: { thumbnails: string[] }) {
  const [thumbIndex, setThumbIndex] = useState(0)
  const src = thumbnails[Math.min(thumbIndex, Math.max(thumbnails.length - 1, 0))]
  if (!src) return <TitlePlate title="" />
  return (
    <img
      src={src}
      alt=""
      className="h-full w-full object-cover"
      onLoad={(event) => {
        if (
          isYouTubePlaceholderThumbnail(event.currentTarget.naturalWidth) &&
          thumbIndex < thumbnails.length - 1
        ) {
          setThumbIndex((index) => index + 1)
        }
      }}
      onError={() => {
        if (thumbIndex < thumbnails.length - 1) setThumbIndex((index) => index + 1)
      }}
    />
  )
}

function TitlePlate({ title }: { title: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-neutral-900 px-6 text-center">
      <span className="font-six-caps text-5xl tracking-[0.12em] text-white">{title}</span>
    </div>
  )
}

function releaseCardMeta(item: TvReleaseItem): string {
  const bits = [
    releaseHasPlayableAudio(item.tracks) ? 'Play' : '',
    item.type,
    item.year ? String(item.year) : '',
  ]
  return bits.filter(Boolean).join(' · ')
}

function TvStageView({
  stage,
  elapsed,
  mediaDuration,
  paused,
  transportRef,
  onToggle,
  onSeek,
  onSeekRatio,
  onStep,
  onSelectTrack,
  onClose,
}: {
  stage: TvStage
  elapsed: number
  mediaDuration: number
  paused: boolean
  transportRef: MutableRefObject<TvTransport | null>
  onToggle: () => void
  onSeek: (deltaSeconds: number) => void
  onSeekRatio: (ratio: number) => void
  onStep: (delta: 1 | -1) => void
  onSelectTrack: (index: number) => void
  onClose: () => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)

  const stageKey = `${stage.kind}:${stage.item.id}`
  useEffect(() => {
    closeRef.current?.focus()
  }, [stageKey])

  const artwork = stage.kind === 'release' ? stage.item.image : ''
  const driftSeed = artwork ? coverDriftSeed(stage.item.title || artwork) : 0
  const driftVariant = driftSeed % 8

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-black" data-testid="tv-player" role="dialog" aria-modal="true" aria-label={stage.item.title}>
      {artwork ? <CoverBackdrop src={artwork} driftVariant={driftVariant} driftDelaySec={-((driftSeed >>> 3) % 28)} /> : null}
      <div className="relative z-10 grid grid-cols-[1fr_minmax(0,48rem)_1fr] items-center gap-6 px-[5vw] py-6 [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
        <div />
        <div className="min-w-0 text-center">
          <p className="truncate text-3xl text-white">{stage.item.title}</p>
          <p className="mt-1 text-lg text-gray-300">{stageHint(stage)}</p>
        </div>
        <div className="flex justify-end">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full bg-white px-6 py-3 text-lg font-semibold text-black outline-none ring-white focus:ring-4 [text-shadow:none]"
          >
            Close
          </button>
        </div>
      </div>
      <div className="relative z-10 min-h-0 flex-1 px-[5vw] pb-[4vh]">
        {stage.kind === 'video' ? <TvYouTubePlayer item={stage.item} transportRef={transportRef} /> : null}
        {stage.kind === 'listen' ? (
          <SoundCloudEmbed url={stage.item.url} autoPlay height={520} visual showComments={false} className="h-full" />
        ) : null}
        {stage.kind === 'release' ? (
          <ReleaseStage
            item={stage.item}
            trackIndex={stage.trackIndex}
            elapsed={elapsed}
            mediaDuration={mediaDuration}
            paused={paused}
            onToggle={onToggle}
            onSeek={onSeek}
            onSeekRatio={onSeekRatio}
            onStep={onStep}
            onSelectTrack={onSelectTrack}
          />
        ) : null}
      </div>
    </div>
  )
}

function coverDriftSeed(name: string): number {
  let hash = 2166136261
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function CoverBackdrop({
  src,
  driftVariant,
  driftDelaySec,
}: {
  src: string
  driftVariant: number
  driftDelaySec: number
}) {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <div className="absolute inset-0 overflow-hidden brightness-[0.58]">
        <div
          className={`ep-release-cover-drift ep-release-cover-drift-${driftVariant} absolute inset-0`}
          style={{ animationDelay: `${driftDelaySec}s` }}
        >
          <img src={src} alt="" className="h-full w-full object-cover" />
        </div>
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/55 to-black/72" />
    </div>
  )
}

function stageHint(stage: TvStage): string {
  if (stage.kind === 'video') return 'Enter pauses. Left and right seek 10 seconds. Back closes.'
  if (stage.kind === 'listen') return 'Playback starts because you pressed Enter. Back closes.'
  if (releaseHasPlayableAudio(stage.item.tracks)) {
    return 'Enter pauses. Up and down change tracks. Left and right seek. Back closes.'
  }
  return 'This release has no audio file on the shelf yet.'
}

function stopTransportKey(event: ReactKeyboardEvent) {
  if (event.key === 'Enter' || event.key === ' ') event.stopPropagation()
}

function PlaybackReadout({
  track,
  elapsed,
  mediaDuration,
  onSeekRatio,
}: {
  track: { title: string; duration: number | null; audioUrl: string } | undefined
  elapsed: number
  mediaDuration: number
  onSeekRatio: (ratio: number) => void
}) {
  if (!track?.audioUrl) return null
  const catalogDuration = track.duration && track.duration > 0 ? track.duration : 0
  const total = mediaDuration > 0 ? mediaDuration : catalogDuration
  const ratio = total > 0 ? Math.min(1, Math.max(0, elapsed / total)) : 0
  return (
    <div className="mt-6">
      <p className="text-xl text-gray-300">
        {formatTvDuration(elapsed) || '0:00'}
        {total ? ` / ${formatTvDuration(total)}` : ''}
      </p>
      <input
        type="range"
        min={0}
        max={1000}
        step={1}
        value={Math.round(ratio * 1000)}
        disabled={total <= 0}
        aria-label="Playback position"
        aria-valuetext={`${formatTvDuration(elapsed) || '0:00'}${total ? ` of ${formatTvDuration(total)}` : ''}`}
        onChange={(event) => onSeekRatio(Number(event.target.value) / 1000)}
        onKeyDown={stopTransportKey}
        className="mt-4 h-8 w-full cursor-pointer accent-white disabled:cursor-default disabled:opacity-40"
      />
    </div>
  )
}

function ReleaseTransport({
  paused,
  canStep,
  onToggle,
  onSeek,
  onStep,
}: {
  paused: boolean
  canStep: boolean
  onToggle: () => void
  onSeek: (deltaSeconds: number) => void
  onStep: (delta: 1 | -1) => void
}) {
  return (
    <div className="mt-8 flex items-center gap-4" role="group" aria-label="Playback controls" data-testid="tv-transport">
      <TransportButton label="Previous track" disabled={!canStep} onClick={() => onStep(-1)}>
        <FaStepBackward className="h-6 w-6" />
      </TransportButton>
      <TransportButton label="Back 10 seconds" onClick={() => onSeek(-10)}>
        <span className="text-xl font-semibold">−10</span>
      </TransportButton>
      <TransportButton label={paused ? 'Play' : 'Pause'} primary onClick={onToggle}>
        {paused ? <FaPlay className="ml-1 h-7 w-7" /> : <FaPause className="h-7 w-7" />}
      </TransportButton>
      <TransportButton label="Forward 10 seconds" onClick={() => onSeek(10)}>
        <span className="text-xl font-semibold">+10</span>
      </TransportButton>
      <TransportButton label="Next track" disabled={!canStep} onClick={() => onStep(1)}>
        <FaStepForward className="h-6 w-6" />
      </TransportButton>
    </div>
  )
}

function TransportButton({
  label,
  primary,
  disabled,
  onClick,
  children,
}: {
  label: string
  primary?: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      onKeyDown={stopTransportKey}
      className={
        primary
          ? 'flex h-20 w-20 items-center justify-center rounded-full bg-white text-black outline-none ring-white transition hover:bg-white/90 focus:ring-4 disabled:opacity-40'
          : 'flex h-16 min-w-16 items-center justify-center rounded-full px-4 text-white outline-none ring-white transition hover:bg-white/10 focus:ring-4 disabled:opacity-40'
      }
    >
      {children}
    </button>
  )
}

function ReleaseStage({
  item,
  trackIndex,
  elapsed,
  mediaDuration,
  paused,
  onToggle,
  onSeek,
  onSeekRatio,
  onStep,
  onSelectTrack,
}: {
  item: TvReleaseItem
  trackIndex: number
  elapsed: number
  mediaDuration: number
  paused: boolean
  onToggle: () => void
  onSeek: (deltaSeconds: number) => void
  onSeekRatio: (ratio: number) => void
  onStep: (delta: 1 | -1) => void
  onSelectTrack: (index: number) => void
}) {
  const playableCount = item.tracks.filter((track) => Boolean(track.audioUrl?.trim())).length
  return (
    <div className="flex h-full w-full gap-12 [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
      <div className="w-[28rem] shrink-0">
        <div className="aspect-square overflow-hidden rounded-3xl bg-neutral-900">
          {item.image ? (
            <img src={item.image} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center px-8 text-center">
              <span className="font-six-caps text-7xl tracking-[0.12em]">{item.title}</span>
            </div>
          )}
        </div>
      </div>
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 bg-gradient-to-b from-black/55 via-black/35 to-transparent pb-6">
          <p className="text-2xl text-gray-300">
            {[item.type, item.year ? String(item.year) : ''].filter(Boolean).join(' · ')}
          </p>
          {playableCount > 0 ? (
            <>
              <ReleaseTransport
                paused={paused}
                canStep={playableCount > 1}
                onToggle={onToggle}
                onSeek={onSeek}
                onStep={onStep}
              />
              <PlaybackReadout
                track={item.tracks[trackIndex]}
                elapsed={elapsed}
                mediaDuration={mediaDuration}
                onSeekRatio={onSeekRatio}
              />
            </>
          ) : null}
        </div>
        {item.tracks.length > 0 ? (
          <ol className="w-full space-y-2">
            {item.tracks.map((track, index) => {
              const active = index === trackIndex && Boolean(track.audioUrl)
              return (
                <li key={`${track.title}-${index}`}>
                  <button
                    type="button"
                    disabled={!track.audioUrl}
                    aria-current={active ? 'true' : undefined}
                    onClick={() => onSelectTrack(index)}
                    onKeyDown={stopTransportKey}
                    className={`flex w-full items-baseline justify-between gap-8 border-b border-white/10 py-3 text-left text-2xl outline-none ring-white focus:ring-4 disabled:cursor-default ${
                      active ? 'text-white' : 'text-gray-400'
                    }`}
                  >
                    <span className="truncate">
                      {index + 1}. {track.title}
                      {active ? (paused ? ' · Paused' : ' · Playing') : ''}
                    </span>
                    <span className="shrink-0 text-gray-400">{formatTvDuration(track.duration)}</span>
                  </button>
                </li>
              )
            })}
          </ol>
        ) : (
          <p className="mt-8 text-2xl text-gray-400">Track list arrives with the live release.</p>
        )}
      </div>
    </div>
  )
}

type YtPlayer = {
  playVideo: () => void
  pauseVideo: () => void
  seekTo: (seconds: number, allowSeekAhead: boolean) => void
  getCurrentTime: () => number
  getPlayerState: () => number
  destroy: () => void
}

function TvYouTubePlayer({
  item,
  transportRef,
}: {
  item: TvVideoItem
  transportRef: MutableRefObject<TvTransport | null>
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YtPlayer | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'fallback'>('loading')

  useEffect(() => {
    let cancelled = false
    let fallbackTimer = 0

    const transport: TvTransport = {
      toggle: () => {
        const player = playerRef.current
        if (!player) return
        if (player.getPlayerState() === 1) player.pauseVideo()
        else player.playVideo()
      },
      seek: (deltaSeconds) => {
        const player = playerRef.current
        if (!player) return
        const next = Math.max(0, (player.getCurrentTime() || 0) + deltaSeconds)
        player.seekTo(next, true)
      },
    }
    transportRef.current = transport

    function mount() {
      const YT = (window as Window & { YT?: { Player: new (el: HTMLElement, options: unknown) => YtPlayer } }).YT
      if (cancelled || !hostRef.current || !YT?.Player) return
      playerRef.current = new YT.Player(hostRef.current, {
        videoId: item.youtubeId,
        playerVars: {
          autoplay: 1,
          rel: 0,
          modestbranding: 1,
          controls: 0,
          disablekb: 1,
          playsinline: 1,
        },
        events: {
          onReady: (event: { target: YtPlayer }) => {
            if (cancelled) return
            setStatus('ready')
            event.target.playVideo()
          },
        },
      })
    }

    function ensureApi() {
      const win = window as Window & { YT?: { Player?: unknown }; onYouTubeIframeAPIReady?: () => void }
      if (win.YT?.Player) {
        mount()
        return
      }
      const previous = win.onYouTubeIframeAPIReady
      win.onYouTubeIframeAPIReady = () => {
        previous?.()
        mount()
      }
      if (!document.querySelector('script[data-tv-youtube-api="true"]')) {
        const script = document.createElement('script')
        script.src = 'https://www.youtube.com/iframe_api'
        script.async = true
        script.dataset.tvYoutubeApi = 'true'
        document.body.appendChild(script)
      }
    }

    ensureApi()
    fallbackTimer = window.setTimeout(() => {
      if (!cancelled && !playerRef.current) setStatus('fallback')
    }, 8000)

    return () => {
      cancelled = true
      window.clearTimeout(fallbackTimer)
      transportRef.current = null
      try {
        playerRef.current?.destroy()
      } catch {
        /* The player node may already be gone. */
      }
      playerRef.current = null
    }
  }, [item.youtubeId, transportRef])

  if (status === 'fallback') {
    return (
      <iframe
        title={item.title}
        src={`https://www.youtube-nocookie.com/embed/${item.youtubeId}?autoplay=1&rel=0&modestbranding=1`}
        className="h-full w-full rounded-3xl bg-black"
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
      />
    )
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-3xl bg-black">
      <div ref={hostRef} className="h-full w-full" />
      {status === 'loading' ? (
        <p className="absolute inset-0 flex items-center justify-center text-2xl text-gray-400">Starting playback…</p>
      ) : null}
    </div>
  )
}
