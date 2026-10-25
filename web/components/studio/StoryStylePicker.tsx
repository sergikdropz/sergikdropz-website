'use client'

import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react'
import { loadArtworkForCanvas } from '@/lib/media/canvas-artwork-load'
import { promoCardCopy, promoCardPixelSize, promoComingDateLabel, PROMO_CARD_FORMATS, PROMO_CARD_MODES, promoCardFormatLabel, promoCardModeLabel } from '@/lib/studio/promo-cards'
import type { VinylAudition } from '@/components/studio/VinylSectionPlayer'
import { downloadSocialStoryVideo } from '@/lib/studio/social-promo-assets'
import { paintStoryLookStill, renderStoryLookPreviewDataUrl, sampleArtworkAccent, sampleArtworkGradient } from '@/lib/studio/story-look-paint'
import { loadServiceIcons } from '@/lib/studio/promo-card-render'
import {
  STORY_ACCENTS,
  STORY_AESTHETICS,
  STORY_BACKGROUNDS,
  STORY_MOTIONS,
  STORY_MOTION_DEPTHS,
  STORY_STORES_INKS,
  STORY_STORES_PLATES,
  STORY_SUBJECTS,
  STORY_TAPE_PLATES,
  STORY_TAPE_VIEWS,
  normalizeStoryLook,
  storyAccentHex,
  storyAccentLabel,
  storyLookDetail,
  storyMotionDirectionOptions,
  storyMotionSelection,
  storyMotionSpeedOptions,
  storySelectedMotions,
  storyPulseClockLabel,
  storyPulsePreviewElapsed,
  storyTapeWindow,
  type StoryAccentId,
  type StoryAesthetic,
  type StoryBackground,
  type StoryLook,
  type StoryMotion,
  type StoryMotionDepth,
  type StoryMotionDirection,
  type StoryMotionSpeed,
  type StorySubject,
} from '@/lib/studio/story-look'

  type Props = {
  artworkUrl?: string | null
  title: string
  artist?: string | null
  value: StoryLook
  onChange: (next: StoryLook) => void
  peaks?: number[] | null
  trackDurationSec?: number | null
  bpm?: number | null
  timeOriginSec?: number
  audioUrl?: string | null
  durationSec?: number
  streetDate?: string | null
  onShare?: () => Promise<void> | void
  /** Clip-window player. When set, the preview uses that audio element. */
  auditionRef?: MutableRefObject<VinylAudition | null>
  /** Clip player under the preview. A function receives the download actions and the waveform controls. */
  previewAfter?: ReactNode | ((actions: ReactNode, waveform: ReactNode) => ReactNode)
}

type Previews = {
  subjects: Partial<Record<StorySubject, string>>
  aesthetics: Partial<Record<StoryAesthetic, string>>
  backgrounds: Partial<Record<StoryBackground, string>>
}

const EMPTY: Previews = { subjects: {}, aesthetics: {}, backgrounds: {} }

export default function StoryStylePicker({
  artworkUrl,
  title,
  artist,
  value,
  onChange,
  peaks,
  trackDurationSec,
  bpm,
  timeOriginSec,
  audioUrl,
  durationSec = 15,
  streetDate,
  onShare,
  auditionRef,
  previewAfter,
}: Props) {
  const look = normalizeStoryLook(value)
  const { subject, aesthetic, background, accent, accentHex, accentHex2, mode, frame, motion, motion2, motionSpeed, motionDirection, motionDepth, motion2Speed, motion2Direction, motion2Depth, tape, tapeOn, storesOn, storesPlate, storesInk, storesSite, tapeGrid, tapeGlow, tapePlate } = look
  const [artwork, setArtwork] = useState<HTMLImageElement | null>(null)
  const [artworkAccent, setArtworkAccent] = useState<string | null>(null)
  const [artworkGradient, setArtworkGradient] = useState<{ start: string; end: string } | null>(null)
  const [previews, setPreviews] = useState<Previews>(EMPTY)
  const [playing, setPlaying] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadLabel, setDownloadLabel] = useState('Download')
  const [downloadNote, setDownloadNote] = useState('')
  const [shareCopied, setShareCopied] = useState(false)
  const [storesReady, setStoresReady] = useState(false)
  const [comingDate, setComingDate] = useState('')
  const comingDateTouched = useRef(false)
  const comingDateInputRef = useRef<HTMLInputElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const playingRef = useRef(false)
  const name = title.trim() || 'New release'
  const credit = artist?.trim() || 'SERGIK'

  useEffect(() => {
    if (comingDateTouched.current) return
    const next = String(streetDate || '').trim().slice(0, 10)
    if (/^\d{4}-\d{2}-\d{2}$/.test(next)) setComingDate(next)
  }, [streetDate])

  useEffect(() => {
    let cancelled = false
    setArtwork(null)
    void loadArtworkForCanvas(artworkUrl).then((img) => {
      if (cancelled) return
      setArtwork(img)
      setArtworkAccent(img ? sampleArtworkAccent(img) : null)
      setArtworkGradient(img ? sampleArtworkGradient(img) : null)
    })
    return () => {
      cancelled = true
    }
  }, [artworkUrl])

  useEffect(() => {
    if (!storesOn) return
    let cancelled = false
    void Promise.all([loadServiceIcons('#fafafa'), loadServiceIcons('#18181b')]).then(() => {
      if (!cancelled) setStoresReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [storesOn])

  useEffect(() => {
    const current: StoryLook = {
      subject,
      aesthetic,
      background,
      accent,
      accentHex,
      accentHex2,
      mode,
      frame,
      motion,
      ...(motion2 ? { motion2, motion2Speed, motion2Direction, motion2Depth } : {}),
      motionSpeed,
      motionDirection,
      motionDepth,
      tape,
      tapeOn,
      storesOn,
      storesPlate,
      storesInk,
      storesSite,
      tapeGrid,
      tapeGlow,
      tapePlate,
    }
    const next: Previews = { subjects: {}, aesthetics: {}, backgrounds: {} }
    for (const item of STORY_SUBJECTS) {
      next.subjects[item.id] = renderStoryLookPreviewDataUrl({
        look: { ...current, subject: item.id },
        artwork,
        title: name,
        artist: credit,
        peaks,
        trackDurationSec,
        bpm,
        timeOriginSec,
      })
    }
    for (const item of STORY_AESTHETICS) {
      next.aesthetics[item.id] = renderStoryLookPreviewDataUrl({
        look: { ...current, aesthetic: item.id },
        artwork,
        title: name,
        artist: credit,
        peaks,
        trackDurationSec,
        bpm,
        timeOriginSec,
      })
    }
    for (const item of STORY_BACKGROUNDS) {
      next.backgrounds[item.id] = renderStoryLookPreviewDataUrl({
        look: { ...current, background: item.id },
        artwork,
        title: name,
        artist: credit,
        peaks,
        trackDurationSec,
        bpm,
        timeOriginSec,
      })
    }
    setPreviews(next)
  }, [accent, accentHex, accentHex2, aesthetic, artwork, background, bpm, credit, frame, mode, motion, motion2, motion2Depth, motion2Direction, motion2Speed, motionDepth, motionDirection, motionSpeed, name, peaks, storesInk, storesOn, storesPlate, storesReady, storesSite, subject, tape, tapeOn, tapeGlow, tapeGrid, tapePlate, timeOriginSec, trackDurationSec])

  const liveRef = useRef({
    look,
    artwork,
    name,
    credit,
    peaks,
    trackDurationSec,
    bpm,
    timeOriginSec: timeOriginSec || 0,
    durationSec,
    audioUrl: audioUrl?.trim() || '',
    comingDate,
  })
  liveRef.current = {
    look,
    artwork,
    name,
    credit,
    peaks,
    trackDurationSec,
    bpm,
    timeOriginSec: timeOriginSec || 0,
    durationSec,
    audioUrl: audioUrl?.trim() || '',
    comingDate,
  }

  function posterElapsed() {
    const snap = liveRef.current
    if (snap.look.background === 'album' && snap.look.motion === 'pulse' && !snap.look.motion2) {
      return storyPulsePreviewElapsed(snap.bpm, snap.look.motionSpeed, snap.timeOriginSec)
    }
    if (snap.look.background === 'album' && snap.look.motion !== 'still') return 7.5
    return storyTapeWindow(snap.timeOriginSec, snap.bpm, snap.trackDurationSec).spanSec / 2
  }

  function paintElapsed(elapsed: number) {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const snap = liveRef.current
    const size = promoCardPixelSize(snap.look.frame, snap.look.frame === 'story' ? 360 : 480)
    if (canvas.width !== size.width || canvas.height !== size.height) {
      canvas.width = size.width
      canvas.height = size.height
    }
    paintStoryLookStill(ctx, {
      width: size.width,
      height: size.height,
      artwork: snap.artwork,
      title: snap.name,
      artist: snap.credit,
      look: snap.look,
      badge: promoCardCopy(snap.look.mode, snap.comingDate).badge,
      peaks: snap.peaks,
      trackDurationSec: snap.trackDurationSec,
      bpm: snap.bpm,
      timeOriginSec: snap.timeOriginSec,
      motionDurationSec: snap.durationSec,
      elapsedSec: elapsed,
    })
  }

  useEffect(() => {
    if (playingRef.current) return
    paintElapsed(posterElapsed())
  }, [accent, accentHex, accentHex2, aesthetic, artwork, background, bpm, comingDate, credit, durationSec, frame, mode, motion, motion2, motion2Depth, motion2Direction, motion2Speed, motionDepth, motionDirection, motionSpeed, name, peaks, storesInk, storesOn, storesPlate, storesReady, storesSite, subject, tape, tapeOn, tapeGlow, tapeGrid, tapePlate, timeOriginSec, trackDurationSec])

  useEffect(() => {
    const audition = auditionRef?.current
    if (audition) return
    if (!playing) return
    let raf = 0
    const tick = () => {
      const snap = liveRef.current
      const audio = audioRef.current
      const elapsed = audio ? audio.currentTime - snap.timeOriginSec : 0
      if (!audio || audio.paused || elapsed >= snap.durationSec) {
        audio?.pause()
        playingRef.current = false
        setPlaying(false)
        paintElapsed(posterElapsed())
        return
      }
      paintElapsed(Math.max(0, elapsed))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [auditionRef, playing])

  useEffect(() => {
    const audition = auditionRef?.current
    if (!audition) return
    let raf = 0
    const paintFromAudition = () => {
      const snap = liveRef.current
      const elapsed = audition.currentTime() - snap.timeOriginSec
      if (!audition.playing() || elapsed >= snap.durationSec) {
        if (playingRef.current) {
          playingRef.current = false
          setPlaying(false)
          paintElapsed(posterElapsed())
        }
        return
      }
      if (!playingRef.current) {
        playingRef.current = true
        setPlaying(true)
      }
      paintElapsed(Math.max(0, elapsed))
      raf = requestAnimationFrame(paintFromAudition)
    }
    const unsub = audition.subscribe(() => {
      cancelAnimationFrame(raf)
      if (audition.playing()) raf = requestAnimationFrame(paintFromAudition)
      else {
        playingRef.current = false
        setPlaying(false)
        paintElapsed(posterElapsed())
      }
    })
    return () => {
      cancelAnimationFrame(raf)
      unsub()
    }
  }, [auditionRef, audioUrl])

  useEffect(() => {
    return () => {
      audioRef.current?.pause()
    }
  }, [])

  async function togglePlay() {
    const audition = auditionRef?.current
    if (audition) {
      await audition.toggle()
      const active = audition.playing()
      playingRef.current = active
      setPlaying(active)
      if (!active) paintElapsed(posterElapsed())
      return
    }
    const url = liveRef.current.audioUrl
    if (!url) return
    let audio = audioRef.current
    if (!audio) {
      audio = new Audio()
      audio.crossOrigin = 'anonymous'
      audio.preload = 'auto'
      audioRef.current = audio
    }
    if (playingRef.current) {
      audio.pause()
      playingRef.current = false
      setPlaying(false)
      paintElapsed(posterElapsed())
      return
    }
    document.querySelectorAll('audio').forEach((element) => {
      if (element !== audio) element.pause()
    })
    const absolute = new URL(url, window.location.href).href
    if (audio.src !== absolute) audio.src = url
    const start = liveRef.current.timeOriginSec
    try {
      if (audio.readyState < 1) {
        await new Promise<void>((resolve, reject) => {
          const ready = () => {
            cleanup()
            resolve()
          }
          const failed = () => {
            cleanup()
            reject(new Error('audio'))
          }
          const cleanup = () => {
            audio?.removeEventListener('loadedmetadata', ready)
            audio?.removeEventListener('error', failed)
          }
          audio?.addEventListener('loadedmetadata', ready)
          audio?.addEventListener('error', failed)
        })
      }
      audio.currentTime = start
      await audio.play()
      playingRef.current = true
      setPlaying(true)
    } catch {
      playingRef.current = false
      setPlaying(false)
    }
  }

  async function sharePreview() {
    if (!onShare) return
    try {
      await onShare()
      setShareCopied(true)
      window.setTimeout(() => setShareCopied(false), 2000)
    } catch {
      setShareCopied(false)
    }
  }

  function patch(partial: Partial<StoryLook>) {
    onChange(normalizeStoryLook({ ...look, ...partial }))
  }

  const activeHex = storyAccentHex(look, artworkAccent)

  async function downloadPreview() {
    const snap = liveRef.current
    if (!snap.audioUrl) {
      setDownloadNote('Add audio before downloading the preview video.')
      return
    }
    audioRef.current?.pause()
    playingRef.current = false
    setPlaying(false)
    setDownloading(true)
    setDownloadNote('')
    setDownloadLabel('Preparing…')
    try {
      const copy = promoCardCopy(snap.look.mode, snap.comingDate)
      const size = promoCardPixelSize(snap.look.frame, 1080)
      await downloadSocialStoryVideo({
        artworkUrl,
        title: snap.name,
        artist: snap.credit,
        audioUrl: snap.audioUrl,
        startSec: snap.timeOriginSec,
        durationSec: snap.durationSec,
        look: snap.look,
        badge: copy.badge,
        cta: copy.cta,
        peaks: snap.peaks,
        trackDurationSec: snap.trackDurationSec,
        bpm: snap.bpm,
        width: size.width,
        height: size.height,
        onProgress: (phase, ratio) => {
          if (phase === 'recording') setDownloadLabel(`Recording ${Math.round((ratio || 0) * 100)}%`)
          else if (phase === 'encoding') setDownloadLabel('Encoding…')
          else if (phase === 'loading') setDownloadLabel('Preparing…')
          else setDownloadLabel('Downloading…')
        },
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Video download failed'
      setDownloadNote(message)
    } finally {
      setDownloading(false)
      setDownloadLabel('Download')
    }
  }

  const previewActions = (
    <>
      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          data-testid="story-look-preview-download"
          disabled={downloading}
          onClick={() => void downloadPreview()}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
        >
          {downloading ? downloadLabel : 'Download'}
        </button>
        {onShare ? (
          <button
            type="button"
            data-testid="story-look-preview-share"
            onClick={() => void sharePreview()}
            className="inline-flex items-center gap-2 rounded-lg border border-violet-500/50 px-3 py-2 text-xs font-medium text-violet-100 hover:bg-violet-950/40"
          >
            {shareCopied ? 'Link copied' : 'Share link'}
          </button>
        ) : null}
      </div>
      {downloadNote ? (
        <p className="text-center text-[11px] text-amber-200/90" data-testid="story-look-preview-download-note">
          {downloadNote}
        </p>
      ) : null}
    </>
  )

  const waveformControls = (
    <div className="mt-3 text-center" data-testid="story-style-tape-row">
      <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">Waveform</p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <div className="inline-flex rounded-lg border border-zinc-700 p-0.5" data-testid="story-style-tape-toggle">
          <button
            type="button"
            aria-pressed={look.tapeOn}
            data-testid="story-style-tape-on"
            onClick={() => patch({ tapeOn: true })}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium ${
              look.tapeOn ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-400 hover:text-white'
            }`}
          >
            On
          </button>
          <button
            type="button"
            aria-pressed={!look.tapeOn}
            data-testid="story-style-tape-off"
            onClick={() => patch({ tapeOn: false })}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium ${
              look.tapeOn ? 'text-zinc-400 hover:text-white' : 'bg-zinc-100 text-zinc-950'
            }`}
          >
            Off
          </button>
        </div>
        <Segment
          value={look.tape}
          options={STORY_TAPE_VIEWS.map((item) => ({ id: item.id, label: item.label }))}
          onChange={(next) => patch({ tape: next })}
          testId="story-style-tape"
        />
        <button
          type="button"
          aria-pressed={look.tapeGrid}
          data-testid="story-style-tape-grid"
          onClick={() => patch({ tapeGrid: !look.tapeGrid })}
          className={`rounded-md border px-2.5 py-1 text-[11px] font-medium ${
            look.tapeGrid ? 'border-white bg-zinc-100 text-zinc-950' : 'border-zinc-700 text-zinc-400'
          }`}
        >
          Beat grid
        </button>
        <button
          type="button"
          aria-pressed={look.tapeGlow}
          data-testid="story-style-tape-glow"
          onClick={() => patch({ tapeGlow: !look.tapeGlow })}
          className={`rounded-md border px-2.5 py-1 text-[11px] font-medium ${
            look.tapeGlow ? 'border-white bg-zinc-100 text-zinc-950' : 'border-zinc-700 text-zinc-400'
          }`}
        >
          Glow
        </button>
        <Segment
          value={look.tapePlate}
          options={STORY_TAPE_PLATES.map((item) => ({ id: item.id, label: item.label }))}
          onChange={(next) => patch({ tapePlate: next })}
          testId="story-style-tape-plate"
        />
      </div>
    </div>
  )

  return (
    <section className="rounded-xl border border-zinc-800 bg-black/40 p-4" data-testid="story-style-picker">
      <div className="mb-4 text-center">
        <h5 className="text-sm font-semibold text-white">Promo Video</h5>
        <p className="mx-auto mt-1 max-w-xl text-xs text-zinc-500">
          Pick a format, then the finish. Story video, reel, feed, and story stills all use this look.
        </p>
        <p className="mt-2 text-[11px] text-zinc-300" data-testid="story-look-detail">
          {storyLookDetail(look)}
        </p>
      </div>

      <div className="mb-4 flex flex-col">
        <div className="order-2 mt-3">
        <p className="mb-2 text-center text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">Accent</p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            title="Album artwork"
            aria-label="Album artwork accent"
            aria-pressed={look.accent === 'artwork'}
            data-testid="story-style-accent-artwork"
            onClick={() => patch({ accent: 'artwork', accentHex: artworkAccent || undefined })}
            className={`inline-flex items-center gap-2 rounded-full border px-2 py-1 text-[11px] ${
              look.accent === 'artwork' ? 'border-white text-white' : 'border-zinc-700 text-zinc-400'
            }`}
          >
            <span
              className="h-6 w-6 rounded-full border border-white/20"
              style={{
                background: artworkAccent
                  ? artworkAccent
                  : 'conic-gradient(#fbbf24, #fb7185, #22d3ee, #a78bfa, #fbbf24)',
              }}
            />
            Artwork
          </button>
          <button
            type="button"
            title="Artwork gradient"
            aria-label="Artwork gradient"
            aria-pressed={look.accent === 'gradient'}
            data-testid="story-style-accent-gradient"
            onClick={() =>
              patch({
                accent: 'gradient',
                accentHex: artworkGradient?.start,
                accentHex2: artworkGradient?.end,
              })
            }
            className={`inline-flex items-center gap-2 rounded-full border px-2 py-1 text-[11px] ${
              look.accent === 'gradient' ? 'border-white text-white' : 'border-zinc-700 text-zinc-400'
            }`}
          >
            <span
              className="h-6 w-6 rounded-full border border-white/20"
              style={{
                background: artworkGradient
                  ? `linear-gradient(90deg, ${artworkGradient.start}, ${artworkGradient.end})`
                  : 'linear-gradient(90deg, #fbbf24, #22d3ee)',
              }}
            />
            Artwork gradient
          </button>
          {STORY_ACCENTS.map((item) => {
            const selected = look.accent === item.id
            return (
              <button
                key={item.id}
                type="button"
                title={item.label}
                aria-label={item.label}
                aria-pressed={selected}
                data-testid={`story-style-accent-${item.id}`}
                onClick={() => patch({ accent: item.id, accentHex: undefined })}
                className={`h-8 w-8 rounded-full border ${
                  selected ? 'border-white ring-2 ring-white ring-offset-2 ring-offset-black' : 'border-zinc-600'
                }`}
                style={{ backgroundColor: item.hex }}
              />
            )
          })}
          <label
            className={`inline-flex items-center gap-2 rounded-full border px-2 py-1 text-[11px] ${
              look.accent === 'custom' ? 'border-white text-white' : 'border-zinc-700 text-zinc-400'
            }`}
          >
            <input
              type="color"
              aria-label="Custom accent"
              data-testid="story-style-accent-custom"
              value={activeHex}
              onChange={(event) => {
                const hex = event.target.value
                const match = STORY_ACCENTS.find((item) => item.hex.toLowerCase() === hex.toLowerCase())
                if (match) patch({ accent: match.id, accentHex: undefined })
                else patch({ accent: 'custom' as StoryAccentId, accentHex: hex })
              }}
              className="h-6 w-6 cursor-pointer rounded-full border-0 bg-transparent p-0"
            />
            {storyAccentLabel(look) === 'Custom' ? 'Custom' : 'Custom color'}
          </label>
          <div
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] ${
              look.accent === 'dual' ? 'border-white text-white' : 'border-zinc-700 text-zinc-400'
            }`}
          >
            <input
              type="color"
              aria-label="Dual tone start"
              data-testid="story-style-accent-dual-start"
              value={look.accent === 'dual' ? look.accentHex || '#a78bfa' : '#a78bfa'}
              onChange={(event) =>
                patch({
                  accent: 'dual',
                  accentHex: event.target.value,
                  accentHex2: look.accentHex2 || '#22d3ee',
                })
              }
              className="h-6 w-6 cursor-pointer rounded-full border-0 bg-transparent p-0"
            />
            <button
              type="button"
              aria-label="Dual tone"
              aria-pressed={look.accent === 'dual'}
              data-testid="story-style-accent-dual"
              title="Dual tone"
              onClick={() =>
                patch({
                  accent: 'dual',
                  accentHex: look.accent === 'dual' ? look.accentHex || '#a78bfa' : '#a78bfa',
                  accentHex2: look.accentHex2 || '#22d3ee',
                })
              }
              className="h-6 w-10 rounded-full border border-white/20"
              style={{
                background: `linear-gradient(90deg, ${look.accent === 'dual' ? look.accentHex || '#a78bfa' : '#a78bfa'}, ${look.accentHex2 || '#22d3ee'})`,
              }}
            />
            <input
              type="color"
              aria-label="Dual tone end"
              data-testid="story-style-accent-dual-end"
              value={look.accentHex2 || '#22d3ee'}
              onChange={(event) =>
                patch({
                  accent: 'dual',
                  accentHex: look.accent === 'dual' ? look.accentHex || '#a78bfa' : '#a78bfa',
                  accentHex2: event.target.value,
                })
              }
              className="h-6 w-6 cursor-pointer rounded-full border-0 bg-transparent p-0"
            />
            Dual tone
          </div>
          </div>
        {look.background === 'album' ? (
          <div className="mt-3 text-center" data-testid="story-style-motion-row">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
              Background animation
            </p>
            <p className="mb-2 text-[10px] text-zinc-600">Up to two</p>
            <Segment
              value={look.motion}
              values={storySelectedMotions(look)}
              options={STORY_MOTIONS.map((item) => ({ id: item.id, label: item.label }))}
              onChange={(next) => {
                const selected = storyMotionSelection(look, next)
                const promoted = Boolean(look.motion2) && selected.motion === look.motion2 && !selected.motion2
                patch({
                  ...selected,
                  ...(promoted
                    ? {
                        motionSpeed: look.motion2Speed ?? look.motionSpeed,
                        motionDirection: look.motion2Direction ?? look.motionDirection,
                        motionDepth: look.motion2Depth ?? look.motionDepth,
                      }
                    : {}),
                  ...(!selected.motion2
                    ? { motion2Speed: undefined, motion2Direction: undefined, motion2Depth: undefined }
                    : {}),
                })
              }}
              testId="story-style-motion"
              wrap
              center
            />
            {look.motion !== 'still' ? (
              <div className="mt-2 flex flex-col items-center gap-3" data-testid="story-style-motion-tune">
                <MotionTune
                  motion={look.motion}
                  speed={look.motionSpeed}
                  direction={look.motionDirection}
                  depth={look.motionDepth}
                  bpm={bpm}
                  titled={Boolean(look.motion2)}
                  onSpeed={(next) => patch({ motionSpeed: next })}
                  onDirection={(next) => patch({ motionDirection: next })}
                  onDepth={(next) => patch({ motionDepth: next })}
                />
                {look.motion2 ? (
                  <MotionTune
                    motion={look.motion2}
                    speed={look.motion2Speed ?? look.motionSpeed}
                    direction={look.motion2Direction ?? look.motionDirection}
                    depth={look.motion2Depth ?? look.motionDepth}
                    bpm={bpm}
                    idSuffix="2"
                    titled
                    onSpeed={(next) => patch({ motion2Speed: next })}
                    onDirection={(next) => patch({ motion2Direction: next })}
                    onDepth={(next) => patch({ motion2Depth: next })}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        </div>
        <div className="mt-3 flex flex-col items-center gap-2" data-testid="story-style-campaign">
              <Segment
                value={look.frame}
                options={PROMO_CARD_FORMATS.map((id) => ({ id, label: promoCardFormatLabel(id) }))}
                onChange={(next) => patch({ frame: next })}
                testId="story-style-frame"
              />
              <div className="inline-flex rounded-lg border border-zinc-700 p-0.5" data-testid="story-style-mode">
                {PROMO_CARD_MODES.map((id) => {
                  const active = look.mode === id
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => patch({ mode: id })}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium ${
                        active ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-400 hover:text-white'
                      }`}
                      aria-pressed={active}
                      data-testid={`story-style-mode-${id}`}
                    >
                      {promoCardModeLabel(id)}
                    </button>
                  )
                })}
                <button
                  type="button"
                  onClick={() => patch({ mode: 'coming' })}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium ${
                    look.mode === 'coming' ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-400 hover:text-white'
                  }`}
                  aria-pressed={look.mode === 'coming'}
                  data-testid="story-style-mode-coming"
                >
                  Coming soon
                </button>
                <button
                  type="button"
                  aria-label="Coming soon date"
                  data-testid="story-style-coming-date"
                  onClick={() => {
                    patch({ mode: 'coming' })
                    const input = comingDateInputRef.current
                    if (!input) return
                    if (typeof input.showPicker === 'function') input.showPicker()
                    else input.click()
                  }}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium ${
                    look.mode === 'coming' ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {promoComingDateLabel(comingDate) || 'Date'}
                </button>
                <input
                  ref={comingDateInputRef}
                  type="date"
                  tabIndex={-1}
                  aria-hidden
                  value={comingDate}
                  onChange={(event) => {
                    comingDateTouched.current = true
                    setComingDate(event.target.value)
                    patch({ mode: 'coming' })
                  }}
                  className="sr-only"
                />
              </div>
            </div>
      </div>

      <div className="mb-4" data-testid="story-look-preview">
        <p className="mb-3 text-center text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
          Preview
        </p>
        <div className="flex flex-col items-center gap-3">
          <div
            className={`relative overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 ${
              look.frame === 'story' ? 'w-[220px]' : 'w-[280px]'
            }`}
          >
            <canvas ref={canvasRef} className="block h-auto w-full" data-testid="story-look-preview-image" />
            {audioUrl ? (
              <button
                type="button"
                aria-label={playing ? 'Pause preview' : 'Play preview'}
                data-testid="story-look-preview-play"
                onClick={() => void togglePlay()}
                className="group absolute inset-0 flex items-center justify-center"
              >
                <span
                  className={`flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-lg text-white ${
                    playing ? 'opacity-0 transition-opacity group-hover:opacity-100' : ''
                  }`}
                >
                  {playing ? '❚❚' : '▶'}
                </span>
              </button>
            ) : null}
          </div>
        </div>
        {waveformControls}
        <div className="mt-4 text-center" data-testid="story-style-stores">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">Available on</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <div className="inline-flex rounded-lg border border-zinc-700 p-0.5">
              <button
                type="button"
                aria-pressed={look.storesOn}
                data-testid="story-style-stores-on"
                onClick={() => patch({ storesOn: true })}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium ${
                  look.storesOn ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-400 hover:text-white'
                }`}
              >
                On
              </button>
              <button
                type="button"
                aria-pressed={!look.storesOn}
                data-testid="story-style-stores-off"
                onClick={() => patch({ storesOn: false })}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium ${
                  look.storesOn ? 'text-zinc-400 hover:text-white' : 'bg-zinc-100 text-zinc-950'
                }`}
              >
                Off
              </button>
            </div>
            {look.storesOn ? (
              <>
                <Segment
                  value={look.storesPlate}
                  options={STORY_STORES_PLATES.map((item) => ({ id: item.id, label: item.label }))}
                  onChange={(next) => patch({ storesPlate: next })}
                  testId="story-style-stores-plate"
                />
                <Segment
                  value={look.storesInk}
                  options={STORY_STORES_INKS.map((item) => ({ id: item.id, label: item.label }))}
                  onChange={(next) => patch({ storesInk: next })}
                  testId="story-style-stores-ink"
                />
                <button
                  type="button"
                  aria-pressed={look.storesSite}
                  title="sergikdropz.com under the icons"
                  data-testid="story-style-stores-site"
                  onClick={() => patch({ storesSite: !look.storesSite })}
                  className={`rounded-md border px-2.5 py-1 text-[11px] font-medium ${
                    look.storesSite ? 'border-white bg-zinc-100 text-zinc-950' : 'border-zinc-700 text-zinc-400'
                  }`}
                >
                  Site
                </button>
              </>
            ) : null}
          </div>
        </div>
        {previewAfter ? (
          <div className="mt-4 w-full">
            {typeof previewAfter === 'function' ? previewAfter(previewActions, waveformControls) : (
              <>
                {previewActions}
                {previewAfter}
              </>
            )}
          </div>
        ) : (
          previewActions
        )}
      </div>

      <StyleRow label="Format" center>
        <div className="flex snap-x gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-5 sm:overflow-visible sm:pb-0">
          {STORY_SUBJECTS.map((item) => (
            <StyleTile
              key={item.id}
              label={item.label}
              hint={item.hint}
              src={previews.subjects[item.id]}
              selected={look.subject === item.id}
              testId={`story-style-subject-${item.id}`}
              onSelect={() => patch({ subject: item.id })}
              className="w-32 shrink-0 snap-start sm:w-auto"
            />
          ))}
        </div>
      </StyleRow>

      <StyleRow label="Background" center>
        <div className="flex snap-x gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-5 sm:overflow-visible sm:pb-0">
          {STORY_BACKGROUNDS.map((item) => (
            <StyleTile
              key={item.id}
              label={item.label}
              src={previews.backgrounds[item.id]}
              selected={look.background === item.id}
              testId={`story-style-background-${item.id}`}
              onSelect={() => patch({ background: item.id })}
              className="w-32 shrink-0 snap-start sm:w-auto"
            />
          ))}
        </div>
      </StyleRow>

      <StyleRow label="Aesthetic" center>
        <div className="flex snap-x gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-6 sm:overflow-visible sm:pb-0">
          {STORY_AESTHETICS.map((item) => (
            <StyleTile
              key={item.id}
              label={item.label}
              src={previews.aesthetics[item.id]}
              selected={look.aesthetic === item.id}
              testId={`story-style-aesthetic-${item.id}`}
              onSelect={() => patch({ aesthetic: item.id })}
              className="w-32 shrink-0 snap-start sm:w-auto"
            />
          ))}
        </div>
      </StyleRow>
    </section>
  )
}

function MotionTune({
  motion,
  speed,
  direction,
  depth,
  bpm,
  idSuffix = '',
  titled = false,
  onSpeed,
  onDirection,
  onDepth,
}: {
  motion: StoryMotion
  speed: StoryMotionSpeed
  direction: StoryMotionDirection
  depth: StoryMotionDepth
  bpm?: number | null
  idSuffix?: string
  titled?: boolean
  onSpeed: (next: StoryMotionSpeed) => void
  onDirection: (next: StoryMotionDirection) => void
  onDepth: (next: StoryMotionDepth) => void
}) {
  const label = STORY_MOTIONS.find((item) => item.id === motion)?.label || 'Motion'
  const suffix = idSuffix ? `-${idSuffix}` : ''
  return (
    <div className="text-center" data-testid={`story-style-motion-controls${suffix}`}>
      {titled ? (
        <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-400">{label}</p>
      ) : null}
      <div className="flex flex-wrap items-start justify-center gap-4">
        <div className="text-center">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
            {motion === 'pulse' ? 'Grid' : 'Speed'}
          </p>
          <Segment
            value={speed}
            options={storyMotionSpeedOptions(motion)}
            onChange={onSpeed}
            testId={`story-style-motion-speed${suffix}`}
          />
        </div>
        <div className="text-center">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">Direction</p>
          <Segment
            value={direction}
            options={storyMotionDirectionOptions(motion)}
            onChange={onDirection}
            testId={`story-style-motion-direction${suffix}`}
          />
        </div>
        <div className="text-center">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">Travel</p>
          <Segment
            value={depth}
            options={STORY_MOTION_DEPTHS.map((item) => ({ id: item.id, label: item.label }))}
            onChange={onDepth}
            testId={`story-style-motion-depth${suffix}`}
          />
        </div>
        {motion === 'pulse' ? (
          <span className="self-end pb-1 text-[10px] text-zinc-500" data-testid="story-style-pulse-clock">
            {storyPulseClockLabel(bpm)}
          </span>
        ) : null}
      </div>
    </div>
  )
}

function Segment<T extends string>({
  value,
  values,
  options,
  onChange,
  testId,
  wrap = false,
  center = false,
}: {
  value: T
  values?: readonly T[]
  options: Array<{ id: T; label: string }>
  onChange: (next: T) => void
  testId: string
  wrap?: boolean
  center?: boolean
}) {
  return (
    <div
      className={`${wrap ? 'flex flex-wrap' : 'inline-flex'} ${center ? 'justify-center' : ''} rounded-lg border border-zinc-700 p-0.5`}
      data-testid={testId}
    >
      {options.map((option) => {
        const active = values ? values.includes(option.id) : option.id === value
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium ${
              active ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-400 hover:text-white'
            }`}
            aria-pressed={active}
            data-testid={`${testId}-${option.id}`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

function StyleRow({ label, children, center = false }: { label: string; children: ReactNode; center?: boolean }) {
  return (
    <div className="mb-4 last:mb-0">
      <p className={`mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500 ${center ? 'text-center' : ''}`}>
        {label}
      </p>
      {children}
    </div>
  )
}

function StyleTile({
  label,
  hint,
  src,
  selected,
  testId,
  onSelect,
  className = '',
}: {
  label: string
  hint?: string
  src?: string
  selected: boolean
  testId: string
  onSelect: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={hint ? `${label}. ${hint}` : label}
      title={hint || label}
      data-testid={testId}
      className={`text-center ${className}`}
    >
      <div
        className={`relative overflow-hidden rounded-lg border bg-zinc-900 ${
          selected ? 'border-white ring-2 ring-white' : 'border-zinc-800 hover:border-zinc-600'
        }`}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="block h-auto w-full" />
        ) : (
          <div className="aspect-[9/16] animate-pulse bg-zinc-800" />
        )}
      </div>
      <span className={`mt-1.5 block text-[11px] ${selected ? 'text-white' : 'text-zinc-400'}`}>{label}</span>
    </button>
  )
}
