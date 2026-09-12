'use client'

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  type MutableRefObject,
  type RefObject,
} from 'react'
import {
  getVisibleTimeWindow,
  isFullTrackVisible,
  nearestBarZoomStep,
  playheadLeftPercent,
  scaleVisibleBars,
  splitWheelAxes,
  wheelDeltaToZoomFactor,
  WAVEFORM_BAR_ZOOM_STEPS,
  WAVEFORM_MAX_VISIBLE_BARS,
  type WaveformColorMode,
  type WaveformLayerLayout,
  type WaveformSample,
  type WaveformIntelligenceProfile,
} from '@/lib/audio/waveform-view'
import { waveformDrawBudget } from '@/lib/audio/waveform-draw-budget'
import { buildWaveformTapeCache, sliceTapeWindow, type WaveformTapeCache } from '@/lib/audio/waveform-tape-cache'
import { paintPlayheadOverlay, paintWaveformFrame } from '@/lib/audio/waveform-canvas-paint'
import { withLivePlaybackGrid } from '@/lib/audio/waveform-intelligence'
import { quantizePointerToVisibleGrid } from '@/lib/audio/sonic-dna-mix'
import {
  paintGhostLane,
  paintHotCues,
  paintMixAnnotations,
  paintOverviewStrip,
  paintPhaseAlignStrip,
  DEFAULT_PHASE_METER_OPTIONS,
  resolvePhaseMeterWindowBeats,
  type PhaseMeterOptions,
  type WaveformGhostTape,
  type WaveformHotCue,
  type WaveformMixOverlay,
} from '@/lib/audio/waveform-overlays'

/** Stable layout size — avoid getBoundingClientRect jitter flipping canvas buffer size. */
type StageSize = { width: number; height: number; dpr: number }

export type WaveformStageProps = {
  audioRef: RefObject<HTMLAudioElement | null>
  /**
   * When this changes (e.g. mixer deck handoff), re-bind media listeners and
   * re-arm the RAF clock so the playhead follows the live element.
   */
  mediaSyncKey?: string
  /**
   * Shared MixEngine / buffer clock. When set, the playhead follows this
   * instead of HTMLAudioElement.currentTime (paused MES after a buffer handoff).
   */
  readMediaTime?: () => number | null
  /** Seek the deck clock (buffer or element). Falls back to element.currentTime. */
  seekMediaTime?: (timeSec: number) => void
  isPlaying: boolean
  samples: WaveformSample[]
  durationSec: number
  visibleBars: number
  offsetIndex: number
  follow: boolean
  mirror: boolean
  colorMode: WaveformColorMode
  layerLayout?: WaveformLayerLayout
  intelligenceProfile?: WaveformIntelligenceProfile | null
  bpm: number | null
  beatGridEnabled: boolean
  beatGridOffsetSec: number
  beatsPerBar: number
  /** Snap clicks / scrub to the visible beat / phrase grid. */
  snapToGrid?: boolean
  /** Auto DJ / mix window annotations on the live tape */
  mixOverlay?: WaveformMixOverlay | null
  /** Incoming tape ghost while mixing */
  ghostTape?: WaveformGhostTape | null
  hotCues?: WaveformHotCue[]
  deckId?: 'A' | 'B'
  className?: string
  /** Hover root for wheel (e.g. Now Playing header). */
  hoverRoot?: HTMLElement | null
  onVisibleBarsChange: (bars: number, focalRatio?: number) => void
  onOffsetChange: (offset: number) => void
  onSeekSec: (timeSec: number) => void
  /** Single-click sets a cue at this time (double-click still seeks). */
  onCueSec?: (timeSec: number) => void
  /** After a double-click jump, start this deck if it is paused. */
  onJumpPlay?: () => void
  /** User zoom/pan leaves the tape on that area; Follow can be turned back on. */
  onFollowChange?: (follow: boolean) => void
  /** Context menu; `timeSec` is the media time under the pointer (no grid snap). */
  onContextMenu?: (e: React.MouseEvent, timeSec: number | null) => void
  /** Imperative: parent can mark gesture active to pause external follow writes. */
  gestureActiveRef?: MutableRefObject<boolean>
  /** Compact collapsed chrome hides the CDJ overview strip. */
  showOverview?: boolean
  /** CDJ ±1-beat phase / grid-align meter under the overview. */
  showPhaseMeter?: boolean
  /** Phase meter window / indicator preferences. */
  phaseMeterOptions?: Partial<PhaseMeterOptions>
  /** Optional dual-deck phase error (sec); local grid phase used when unset. */
  phaseErrorSec?: number | null
  /** Live dual-deck sync error each paint frame (avoids React thrash). */
  readPeerPhaseErrorSec?: () => number | null
  /** Drag / click the meter to nudge beat-grid phase (seconds). */
  onPhaseNudge?: (deltaSec: number) => void
  /** Double-click: lock grid to playhead (set downbeat here). */
  onPhaseLock?: () => void
}

/**
 * Isolated DAW waveform stage (Ableton/OlliN channel silhouette):
 * - Own RAF clock (no parent 60fps React updates); gated when paused / tab hidden
 * - High-res densified tape cache; paint columns capped to CSS width × DPR
 * - Follow mode: wide strip + GPU translate3d (React must not reset this layer’s style)
 * - Zoom / pan / seek gestures; beat grid locked to the same time window
 */
function WaveformStage({
  audioRef,
  mediaSyncKey = '',
  readMediaTime,
  seekMediaTime,
  isPlaying,
  samples,
  durationSec,
  visibleBars,
  offsetIndex,
  follow,
  mirror,
  colorMode,
  layerLayout = 'overlay',
  intelligenceProfile,
  bpm,
  beatGridEnabled,
  beatGridOffsetSec,
  beatsPerBar,
  snapToGrid = true,
  mixOverlay = null,
  ghostTape = null,
  hotCues = [],
  deckId = 'A',
  className,
  hoverRoot,
  onVisibleBarsChange,
  onOffsetChange,
  onSeekSec,
  onCueSec,
  onJumpPlay,
  onFollowChange,
  onContextMenu,
  gestureActiveRef,
  showOverview = true,
  showPhaseMeter = true,
  phaseMeterOptions,
  phaseErrorSec = null,
  readPeerPhaseErrorSec,
  onPhaseNudge,
  onPhaseLock,
}: WaveformStageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const scrollLayerRef = useRef<HTMLDivElement | null>(null)
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const overviewCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const overviewWrapRef = useRef<HTMLDivElement | null>(null)
  const phaseCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const phaseWrapRef = useRef<HTMLDivElement | null>(null)
  const phaseErrorSecRef = useRef(phaseErrorSec)
  phaseErrorSecRef.current = phaseErrorSec
  const phaseMeterOptionsRef = useRef({ ...DEFAULT_PHASE_METER_OPTIONS, ...phaseMeterOptions })
  phaseMeterOptionsRef.current = { ...DEFAULT_PHASE_METER_OPTIONS, ...phaseMeterOptions }
  const readPeerPhaseErrorSecRef = useRef(readPeerPhaseErrorSec)
  readPeerPhaseErrorSecRef.current = readPeerPhaseErrorSec
  const onPhaseNudgeRef = useRef(onPhaseNudge)
  onPhaseNudgeRef.current = onPhaseNudge
  const onPhaseLockRef = useRef(onPhaseLock)
  onPhaseLockRef.current = onPhaseLock
  const phaseDragRef = useRef<{
    lastX: number
    width: number
    bpm: number
    windowBeats: number
  } | null>(null)
  const rafRef = useRef<number | null>(null)
  const smoothTimeRef = useRef(0)
  const tapeCacheRef = useRef<WaveformTapeCache | null>(null)
  const lastBaseKeyRef = useRef('')
  const forceBasePaintRef = useRef(true)
  const lastViewWindowRef = useRef({ start: 0, end: 0 })
  const sizeRef = useRef<StageSize>({ width: 0, height: 0, dpr: 1 })
  /** Follow-mode strip: keep a wide painted window and GPU-scroll inside it. */
  const followScrollRef = useRef({
    paintStart: 0,
    paintEnd: 0,
    width: 0,
    overscan: 0,
    bars: -1,
    armed: false,
    dirty: true,
  })
  /** Media clock: extrapolate between coarse HTMLMediaElement.currentTime updates. */
  const clockRef = useRef({ mediaAnchor: 0, wallAnchor: 0, armed: false })
  const readMediaTimeRef = useRef(readMediaTime)
  readMediaTimeRef.current = readMediaTime
  const seekMediaTimeRef = useRef(seekMediaTime)
  seekMediaTimeRef.current = seekMediaTime
  const onFollowChangeRef = useRef(onFollowChange)
  onFollowChangeRef.current = onFollowChange
  const onCueSecRef = useRef(onCueSec)
  onCueSecRef.current = onCueSec
  const onJumpPlayRef = useRef(onJumpPlay)
  onJumpPlayRef.current = onJumpPlay
  /** Media time under pointer (no snap) — kept for context-menu open. */
  const pointerTimeAtClientXRef = useRef<(clientX: number) => number | null>(() => null)
  /** Gesture zoom/pan: keep the focal window; do not recenter on the playhead. */
  const followHoldRef = useRef(false)
  const followPropRef = useRef(follow)
  if (follow && !followPropRef.current) followHoldRef.current = false
  followPropRef.current = follow
  const followActive = follow && !followHoldRef.current

  const readClockTime = () => {
    const fromEngine = readMediaTimeRef.current?.()
    if (typeof fromEngine === 'number' && Number.isFinite(fromEngine)) return fromEngine
    const a = audioRef.current
    return a && Number.isFinite(a.currentTime) ? a.currentTime : null
  }
  const profileRef = useRef(intelligenceProfile)
  profileRef.current = intelligenceProfile

  const viewRef = useRef({
    visibleBars,
    offsetIndex,
    follow,
    mirror,
    colorMode,
    layerLayout,
    intelligenceProfile,
    durationSec,
    bpm,
    beatGridEnabled,
    beatGridOffsetSec,
    beatsPerBar,
    sampleCount: samples.length,
    mixOverlay,
    hotCues,
    ghostTape,
    deckId,
  })
  const barsRef = useRef(visibleBars)
  const offsetRef = useRef(offsetIndex)
  const sampleCountRef = useRef(samples.length)

  sampleCountRef.current = samples.length

  // During gestures, refs are authoritative so parent React state can't fight the wheel.
  const gesturing = Boolean(gestureActiveRef?.current)
  if (!gesturing) {
    barsRef.current = visibleBars
    offsetRef.current = offsetIndex
  }
  viewRef.current = {
    visibleBars: barsRef.current,
    offsetIndex: offsetRef.current,
    follow: followActive,
    mirror,
    colorMode,
    layerLayout,
    intelligenceProfile,
    durationSec,
    bpm,
    beatGridEnabled,
    beatGridOffsetSec,
    beatsPerBar,
    sampleCount: samples.length,
    mixOverlay,
    hotCues,
    ghostTape,
    deckId,
  }

  // Rebuild tape when samples / mode / DNA / live grid change (not every frame)
  useEffect(() => {
    tapeCacheRef.current = buildWaveformTapeCache({
      samples,
      durationSec,
      colorMode,
      intelligenceProfile: withLivePlaybackGrid(intelligenceProfile, beatGridOffsetSec, bpm),
    })
    forceBasePaintRef.current = true
    followScrollRef.current.armed = false
    followScrollRef.current.dirty = true
  }, [samples, durationSec, colorMode, intelligenceProfile, beatGridOffsetSec, bpm])

  const paint = useCallback((timeSec: number, opts?: { forceBase?: boolean }) => {
    const baseCanvas = baseCanvasRef.current
    const overlayCanvas = overlayCanvasRef.current
    const viewport = viewportRef.current
    const scrollLayer = scrollLayerRef.current
    if (!baseCanvas || !overlayCanvas || !viewport || !scrollLayer) return

    let { width, height, dpr } = sizeRef.current
    if (width < 2 || height < 2) {
      const rect = viewport.getBoundingClientRect()
      dpr =
        typeof globalThis !== 'undefined' && 'devicePixelRatio' in globalThis
          ? Math.min(2, (globalThis as { devicePixelRatio?: number }).devicePixelRatio || 1)
          : 1
      width = Math.max(1, Math.round(rect.width))
      height = Math.max(1, Math.round(rect.height))
      sizeRef.current = { width, height, dpr }
    }

    const baseCtx = baseCanvas.getContext('2d')
    const overlayCtx = overlayCanvas.getContext('2d')
    if (!baseCtx || !overlayCtx) return

    const view = viewRef.current
    const beatDurationSec = view.bpm && view.bpm > 0 ? 60 / view.bpm : null
    const timeWindow = getVisibleTimeWindow({
      durationSec: view.durationSec,
      sampleCount: Math.max(1, view.sampleCount),
      visibleBars: view.visibleBars,
      beatsPerBar: view.beatsPerBar,
      offsetIndex: view.offsetIndex,
      follow: view.follow && !followHoldRef.current && view.visibleBars > 0,
      currentTimeSec: timeSec,
      beatDurationSec,
    })

    const playheadX = playheadLeftPercent({
      currentTimeSec: timeSec,
      durationSec: view.durationSec,
      visibleBars: view.visibleBars,
      follow: view.follow,
      startSec: timeWindow.startSec,
      endSec: timeWindow.endSec,
    })

    /**
     * Follow + zoom: paint a wide overscanned strip once, then scroll it with
     * translate3d on a layer React never writes width/transform into (parent
     * MusicPlayer re-renders on currentTime and was stomping canvas styles).
     */
    const following = view.follow && !followHoldRef.current && view.visibleBars > 0
    const span = Math.max(1e-6, timeWindow.endSec - timeWindow.startSec)
    const secPerPx = span / width
    // Wide cushion so most frames are pure GPU translate (no canvas redraw)
    const overscanPx = following ? Math.max(96, Math.round(width * 0.15)) : 0
    const paintWidth = width + overscanPx * 2

    let paintStart = timeWindow.startSec
    let paintEnd = timeWindow.endSec
    let scrollTranslatePx = 0

    const followScroll = followScrollRef.current

    if (following) {
      const idealStart = timeWindow.startSec - overscanPx * secPerPx
      const idealEnd = timeWindow.endSec + overscanPx * secPerPx
      const edgePadPx = 16
      const leftPx = followScroll.armed
        ? (followScroll.paintStart - timeWindow.startSec) / secPerPx
        : -overscanPx
      const rightSlackPx = followScroll.armed
        ? (followScroll.paintEnd - timeWindow.endSec) / secPerPx
        : overscanPx

      const nearEdge =
        !followScroll.armed ||
        followScroll.width !== width ||
        followScroll.overscan !== overscanPx ||
        followScroll.bars !== view.visibleBars ||
        leftPx > -edgePadPx ||
        rightSlackPx < edgePadPx ||
        opts?.forceBase ||
        forceBasePaintRef.current

      if (nearEdge) {
        paintStart = idealStart
        paintEnd = idealEnd
        followScroll.paintStart = paintStart
        followScroll.paintEnd = paintEnd
        followScroll.width = width
        followScroll.overscan = overscanPx
        followScroll.bars = view.visibleBars
        followScroll.armed = true
        followScroll.dirty = true
      } else {
        paintStart = followScroll.paintStart
        paintEnd = followScroll.paintEnd
        followScroll.dirty = false
      }

      // Layer origin is paintStart; shift so timeWindow.startSec lands at viewport x=0
      scrollTranslatePx = (paintStart - timeWindow.startSec) / secPerPx
    } else {
      followScroll.armed = false
      followScroll.dirty = true
    }

    const budget = waveformDrawBudget(view.visibleBars, {
      cssWidth: paintWidth,
      dpr,
    })

    const baseKey = [
      following ? paintStart.toFixed(6) : paintStart.toFixed(5),
      following ? paintEnd.toFixed(6) : paintEnd.toFixed(5),
      width,
      height,
      dpr.toFixed(2),
      view.visibleBars,
      Math.round(view.offsetIndex),
      view.mirror ? 1 : 0,
      view.colorMode,
      view.layerLayout,
      view.beatGridEnabled ? 1 : 0,
      view.beatGridOffsetSec.toFixed(3),
      view.bpm ?? 0,
      view.beatsPerBar,
      budget.columns,
    ].join('|')

    const needsBase =
      opts?.forceBase ||
      forceBasePaintRef.current ||
      (following ? followScroll.dirty || baseKey !== lastBaseKeyRef.current : baseKey !== lastBaseKeyRef.current)

    if (needsBase) {
      const tape = tapeCacheRef.current
      const slice = tape
        ? sliceTapeWindow(tape.timed, paintStart, paintEnd, budget.columns)
        : []

      paintWaveformFrame({
        ctx: baseCtx,
        width: paintWidth,
        height,
        dpr,
        samples: slice,
        startSec: paintStart,
        endSec: paintEnd,
        currentTimeSec: timeSec,
        playheadXPercent: 100,
        mirror: view.mirror,
        colorMode: view.colorMode,
        layerLayout: view.layerLayout,
        intelligenceProfile: profileRef.current,
        budget,
        showGrid: Boolean(beatDurationSec && view.beatGridEnabled),
        beatDurationSec,
        beatGridOffsetSec: view.beatGridOffsetSec,
        beatsPerBar: view.beatsPerBar,
        beatGridEmphasis: view.beatGridEnabled,
        drawPlayheadStroke: false,
      })
      lastBaseKeyRef.current = baseKey
      forceBasePaintRef.current = false
      followScroll.dirty = false
    }

    // Imperative only — never put transform/width in React style (parent re-renders stomp it)
    if (following) {
      scrollLayer.style.width = `${paintWidth}px`
      scrollLayer.style.height = '100%'
      scrollLayer.style.transform = `translate3d(${scrollTranslatePx}px, 0, 0)`
      scrollLayer.style.willChange = 'transform'
    } else {
      scrollLayer.style.width = '100%'
      scrollLayer.style.height = '100%'
      scrollLayer.style.transform = 'none'
      scrollLayer.style.willChange = 'auto'
    }

    paintPlayheadOverlay({
      ctx: overlayCtx,
      width,
      height,
      dpr,
      playheadXPercent: playheadX < 0 ? -10 : playheadX,
      dimFuture: true,
    })

    // Annotations on the same t→x window as the main tape
    paintMixAnnotations(overlayCtx, {
      width,
      height,
      startSec: timeWindow.startSec,
      endSec: timeWindow.endSec,
      overlay: view.mixOverlay,
    })
    paintHotCues(overlayCtx, {
      width,
      height,
      startSec: timeWindow.startSec,
      endSec: timeWindow.endSec,
      cues: view.hotCues || [],
    })
    if (view.ghostTape?.timed?.length) {
      paintGhostLane(overlayCtx, {
        width,
        height,
        ghost: view.ghostTape,
        columns: Math.floor(width),
      })
    }

    // Drift cue: soft playhead tint when media clock disagrees (debug sync)
    const media = readClockTime()
    if (
      typeof media === 'number' &&
      Number.isFinite(media) &&
      Math.abs(media - timeSec) > 0.04
    ) {
      const playXpx = Math.max(0, Math.min(width, (playheadX / 100) * width))
      overlayCtx.strokeStyle = 'rgba(251, 113, 133, 0.55)'
      overlayCtx.lineWidth = 3
      overlayCtx.beginPath()
      overlayCtx.moveTo(playXpx, 0)
      overlayCtx.lineTo(playXpx, height)
      overlayCtx.stroke()
    }

    lastViewWindowRef.current = { start: timeWindow.startSec, end: timeWindow.endSec }

    // CDJ overview strip
    const overview = overviewCanvasRef.current
    const overviewWrap = overviewWrapRef.current
    if (overview && overviewWrap && tapeCacheRef.current) {
      const oRect = overviewWrap.getBoundingClientRect()
      const ow = Math.max(1, Math.round(oRect.width))
      const oh = Math.max(1, Math.round(oRect.height))
      paintOverviewStrip(overview.getContext('2d')!, {
        width: ow,
        height: oh,
        dpr,
        timed: tapeCacheRef.current.timed,
        durationSec: view.durationSec,
        currentTimeSec: timeSec,
        viewStartSec: timeWindow.startSec,
        viewEndSec: timeWindow.endSec,
        mixOverlay: view.mixOverlay,
      })
    }

    // CDJ phase / grid-align meter
    const phase = phaseCanvasRef.current
    const phaseWrap = phaseWrapRef.current
    const stageBpm = view.bpm
    if (phase && phaseWrap && stageBpm && stageBpm > 0) {
      const pRect = phaseWrap.getBoundingClientRect()
      const pw = Math.max(1, Math.round(pRect.width))
      const ph = Math.max(1, Math.round(pRect.height))
      const peer =
        typeof readPeerPhaseErrorSecRef.current === 'function'
          ? readPeerPhaseErrorSecRef.current()
          : null
      const painted = paintPhaseAlignStrip(phase.getContext('2d')!, {
        width: pw,
        height: ph,
        dpr,
        currentTimeSec: timeSec,
        bpm: stageBpm,
        offsetSec: view.beatGridOffsetSec,
        beatsPerBar: view.beatsPerBar,
        options: phaseMeterOptionsRef.current,
        phaseErrorSec:
          typeof peer === 'number' && Number.isFinite(peer)
            ? peer
            : phaseErrorSecRef.current,
      })
      if (phaseWrap.dataset.phaseMs !== String(Math.round(painted.errSec * 1000))) {
        phaseWrap.dataset.phaseMs = String(Math.round(painted.errSec * 1000))
        phaseWrap.dataset.phaseMode = painted.mode
        phaseWrap.dataset.phaseLocked = painted.locked ? '1' : '0'
        const ms = painted.errSec * 1000
        phaseWrap.title = painted.locked
          ? `${painted.mode === 'sync' ? 'Sync' : 'Grid'} locked`
          : `${painted.mode === 'sync' ? 'Sync' : 'Grid'} ${ms >= 0 ? '+' : ''}${ms.toFixed(0)} ms — drag to nudge · double-click to lock`
      }
    }
  }, [audioRef])

  // Cache CSS size from the clipped viewport (not the padded outer shell)
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const measure = () => {
      const rect = el.getBoundingClientRect()
      const dpr =
        typeof globalThis !== 'undefined' && 'devicePixelRatio' in globalThis
          ? Math.min(2, (globalThis as { devicePixelRatio?: number }).devicePixelRatio || 1)
          : 1
      const next: StageSize = {
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
        dpr,
      }
      const prev = sizeRef.current
      if (prev.width === next.width && prev.height === next.height && prev.dpr === next.dpr) return
      sizeRef.current = next
      forceBasePaintRef.current = true
      followScrollRef.current.armed = false
      paint(smoothTimeRef.current, { forceBase: true })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [paint])

  // RAF clock — extrapolate media time so playhead doesn't stair-step with currentTime
  useEffect(() => {
    const stop = () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }

    const armClock = (media: number, wall: number) => {
      clockRef.current.mediaAnchor = media
      clockRef.current.wallAnchor = wall
      clockRef.current.armed = true
      smoothTimeRef.current = media
    }

    let boundAudio: HTMLAudioElement | null = null

    const onSeekOrPlay = () => {
      const media = readClockTime()
      if (media == null) return
      armClock(media, performance.now())
      followScrollRef.current.armed = false
      if (!isPlaying) paint(media, { forceBase: true })
    }

    const onTimeUpdate = () => {
      const media = readClockTime()
      if (media == null || !isPlaying) return
      const now = performance.now()
      const a = audioRef.current
      const rate = a && Number.isFinite(a.playbackRate) ? a.playbackRate : 1
      const clock = clockRef.current
      const extrapolated = clock.armed
        ? clock.mediaAnchor + ((now - clock.wallAnchor) / 1000) * rate
        : media
      // Ignore stair-step noise; only re-anchor when extrapolation drifted
      if (!clock.armed || Math.abs(media - extrapolated) > 0.05) {
        armClock(media, now)
      }
    }

    const unbindAudio = () => {
      if (!boundAudio) return
      boundAudio.removeEventListener('seeked', onSeekOrPlay)
      boundAudio.removeEventListener('play', onSeekOrPlay)
      boundAudio.removeEventListener('timeupdate', onTimeUpdate)
      boundAudio = null
    }

    const bindAudio = () => {
      const a = audioRef.current
      if (a === boundAudio) return
      unbindAudio()
      boundAudio = a
      if (!a) return
      a.addEventListener('seeked', onSeekOrPlay)
      a.addEventListener('play', onSeekOrPlay)
      a.addEventListener('timeupdate', onTimeUpdate)
      // Deck handoff / new media: hard re-arm + drop follow strip so playhead snaps cleanly
      followScrollRef.current.armed = false
      followScrollRef.current.dirty = true
      forceBasePaintRef.current = true
      const media = readClockTime()
      if (media != null) armClock(media, performance.now())
    }

    bindAudio()

    const advanceClock = (now: number) => {
      bindAudio()
      const a = audioRef.current
      const media = readClockTime()
      const rate = a && Number.isFinite(a.playbackRate) ? a.playbackRate : 1
      const clock = clockRef.current

      if (readMediaTimeRef.current && media != null) {
        armClock(media, now)
        smoothTimeRef.current = media
        return media
      }

      if (!isPlaying || media == null) {
        if (media != null) armClock(media, now)
        return smoothTimeRef.current
      }

      if (!clock.armed) armClock(media, now)

      let display = clock.mediaAnchor + ((now - clock.wallAnchor) / 1000) * rate

      // Seek / stall recovery — hard snap only on large desync
      if (Math.abs(media - display) > 0.35) {
        armClock(media, now)
        display = media
      }

      // Prefer prop duration (incoming track) — element.duration can briefly be the parked deck's
      const dur =
        durationSec > 0
          ? durationSec
          : a && Number.isFinite(a.duration) && a.duration > 0
            ? a.duration
            : 0
      if (dur > 0) display = Math.max(0, Math.min(dur, display))

      smoothTimeRef.current = display
      return display
    }

    const tick = (now: number) => {
      rafRef.current = null
      paint(advanceClock(now))

      const shouldRun =
        isPlaying &&
        typeof document !== 'undefined' &&
        document.visibilityState === 'visible'
      if (shouldRun) {
        rafRef.current = requestAnimationFrame(tick)
      }
    }

    const start = () => {
      if (rafRef.current != null) return
      bindAudio()
      const media = readClockTime()
      if (media != null) armClock(media, performance.now())
      rafRef.current = requestAnimationFrame(tick)
    }

    start()

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stop()
        return
      }
      if (isPlaying) start()
      else paint(smoothTimeRef.current)
    }

    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      unbindAudio()
      stop()
    }
  }, [audioRef, isPlaying, paint, durationSec, mediaSyncKey])

  // Repaint immediately when view props change (zoom/pan/mode)
  useEffect(() => {
    forceBasePaintRef.current = true
    followScrollRef.current.armed = false
    followScrollRef.current.dirty = true
    paint(smoothTimeRef.current, { forceBase: true })
  }, [
    paint,
    visibleBars,
    offsetIndex,
    follow,
    mirror,
    colorMode,
    layerLayout,
    intelligenceProfile,
    durationSec,
    bpm,
    beatGridEnabled,
    beatGridOffsetSec,
    beatsPerBar,
    samples,
    showOverview,
    showPhaseMeter,
    phaseMeterOptions,
  ])

  // Gestures: wheel zoom/pan, drag pan/scrub, pinch zoom
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const DRAG_THRESHOLD = 8
    const ZOOM_COMMIT_MS = 140
    let zoomCommitTimer: ReturnType<typeof setTimeout> | null = null
    let drag: {
      pointerId: number
      startX: number
      lastX: number
      didDrag: boolean
      mode: 'pan' | 'scrub' | null
    } | null = null
    let pinch: { startDistance: number; startBars: number } | null = null

    const markGesture = (active: boolean) => {
      if (gestureActiveRef) gestureActiveRef.current = active
    }

    const suspendFollowForGesture = () => {
      followHoldRef.current = true
      viewRef.current.follow = false
      followScrollRef.current.armed = false
      if (followPropRef.current) onFollowChangeRef.current?.(false)
    }

    const containerWidth = () => {
      const w = (viewportRef.current ?? container).getBoundingClientRect().width
      return w > 0 ? w : container.clientWidth
    }

    const focalFromClientX = (clientX: number) => {
      const el = viewportRef.current ?? container
      const rect = el.getBoundingClientRect()
      if (rect.width <= 0) return 0.5
      return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    }

    /** Follow paints a time-centered window and never writes offsetRef. Seed from that. */
    const syncOffsetFromFollowWindow = () => {
      if (!viewRef.current.follow || followHoldRef.current) return
      const length = sampleCountRef.current
      const bars = barsRef.current
      if (bars <= 0 || length <= 0) return
      const beatSec = bpm && bpm > 0 ? 60 / bpm : null
      const win = getVisibleTimeWindow({
        durationSec,
        sampleCount: length,
        visibleBars: bars,
        beatsPerBar,
        offsetIndex: offsetRef.current,
        follow: true,
        currentTimeSec: smoothTimeRef.current,
        beatDurationSec: beatSec,
      })
      offsetRef.current = win.startIndex
      viewRef.current.offsetIndex = win.startIndex
    }

    const samplesForBars = (bars: number, length: number) => {
      if (length <= 0) return length
      if (bars <= 0) return length
      const beatSec = bpm && bpm > 0 ? 60 / bpm : null
      if (durationSec > 0 && beatSec) {
        const spanSec = Math.min(durationSec, bars * beatsPerBar * beatSec)
        return Math.max(8, Math.round((spanSec / durationSec) * length))
      }
      return Math.max(8, Math.round(length * (bars / WAVEFORM_MAX_VISIBLE_BARS)))
    }

    /** Continuous zoom — update refs + paint this frame; parent sync is debounced. */
    const applyBarsLive = (nextBars: number, focalRatio = 0.5, opts?: { snap?: boolean }) => {
      syncOffsetFromFollowWindow()
      const length = sampleCountRef.current
      let newBars = nextBars <= 0 ? 0 : nextBars
      if (opts?.snap && newBars > 0) newBars = nearestBarZoomStep(newBars)
      if (newBars > 0 && newBars < WAVEFORM_BAR_ZOOM_STEPS[0]) newBars = WAVEFORM_BAR_ZOOM_STEPS[0]
      if (newBars > WAVEFORM_MAX_VISIBLE_BARS) newBars = 0

      const beatSec = bpm && bpm > 0 ? 60 / bpm : null
      if (
        newBars > 0 &&
        durationSec > 0 &&
        isFullTrackVisible(newBars, durationSec, beatSec, beatsPerBar)
      ) {
        newBars = 0
      }

      if (newBars <= 0 || length <= 0) {
        if (barsRef.current <= 0 && offsetRef.current === 0) {
          onVisibleBarsChange(0, focalRatio)
          return
        }
        barsRef.current = 0
        offsetRef.current = 0
        viewRef.current.visibleBars = 0
        viewRef.current.offsetIndex = 0
        suspendFollowForGesture()
        paint(smoothTimeRef.current, { forceBase: true })
        onVisibleBarsChange(0, focalRatio)
        onOffsetChange(0)
        return
      }

      const prevBars = barsRef.current
      const prevVisible = samplesForBars(prevBars <= 0 ? 0 : prevBars, length)
      const newVisible = samplesForBars(newBars, length)
      const start = prevBars <= 0 ? 0 : offsetRef.current
      const focal = Math.max(0, Math.min(1, focalRatio))
      const focalIndex = start + focal * Math.min(prevBars <= 0 ? length : prevVisible, length)
      const newStart = focalIndex - focal * newVisible
      const maxOffset = Math.max(0, length - newVisible)
      const newOffset = Math.max(0, Math.min(maxOffset, newStart))

      barsRef.current = newBars
      offsetRef.current = newOffset
      viewRef.current.visibleBars = newBars
      viewRef.current.offsetIndex = newOffset
      suspendFollowForGesture()
      paint(smoothTimeRef.current, { forceBase: true })
      onVisibleBarsChange(newBars, focalRatio)
      onOffsetChange(newOffset)
    }

    const scheduleZoomCommit = (focalRatio: number) => {
      if (zoomCommitTimer) clearTimeout(zoomCommitTimer)
      zoomCommitTimer = setTimeout(() => {
        zoomCommitTimer = null
        const current = barsRef.current
        if (current > 0) {
          const snapped = nearestBarZoomStep(current)
          if (Math.abs(snapped - current) > 0.35) {
            applyBarsLive(snapped, focalRatio, { snap: true })
          }
        }
        if (!drag && !pinch) markGesture(false)
      }, ZOOM_COMMIT_MS)
    }

    const panPixels = (dxPx: number) => {
      syncOffsetFromFollowWindow()
      const bars = barsRef.current
      const length = sampleCountRef.current
      const width = containerWidth()
      if (bars <= 0 || length <= 0 || width <= 0 || dxPx === 0) return
      const visibleCount = samplesForBars(bars, length)
      const next = offsetRef.current - dxPx * (visibleCount / width)
      const maxOffset = Math.max(0, length - visibleCount)
      const clamped = Math.max(0, Math.min(maxOffset, next))
      offsetRef.current = clamped
      viewRef.current.offsetIndex = clamped
      suspendFollowForGesture()
      paint(smoothTimeRef.current)
      onOffsetChange(clamped)
    }

    const applySeekTime = (t: number) => {
      const audio = audioRef.current
      const seeker = seekMediaTimeRef.current
      if (seeker) seeker(t)
      else if (audio) audio.currentTime = t
      else return
      clockRef.current = { mediaAnchor: t, wallAnchor: performance.now(), armed: true }
      smoothTimeRef.current = t
      followScrollRef.current.armed = false
      onSeekSec(t)
      paint(t, { forceBase: true })
    }

    const timeAtClientX = (clientX: number, opts?: { snap?: boolean }): number | null => {
      const length = sampleCountRef.current
      const propDur = durationSec > 0 ? durationSec : 0
      const audio = audioRef.current
      const mediaDur =
        audio && Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0
      const dur = propDur || mediaDur
      if (!dur || length <= 0) return null
      syncOffsetFromFollowWindow()
      const bars = barsRef.current
      const beatSec = bpm && bpm > 0 ? 60 / bpm : null
      const win = getVisibleTimeWindow({
        durationSec: dur,
        sampleCount: length,
        visibleBars: bars,
        beatsPerBar,
        offsetIndex: bars <= 0 ? 0 : offsetRef.current,
        follow: viewRef.current.follow,
        currentTimeSec: smoothTimeRef.current,
        beatDurationSec: beatSec,
      })
      // Prefer the last painted viewport window so pointer ↔ tape stay pixel-aligned
      // (follow overscan / fractional offset can otherwise drift a few ms).
      const painted = lastViewWindowRef.current
      const startSec =
        painted.end > painted.start + 1e-6 &&
        Math.abs(painted.start - win.startSec) < Math.max(0.05, (win.endSec - win.startSec) * 0.15) &&
        Math.abs(painted.end - win.endSec) < Math.max(0.05, (win.endSec - win.startSec) * 0.15)
          ? painted.start
          : win.startSec
      const endSec =
        painted.end > painted.start + 1e-6 &&
        Math.abs(painted.start - win.startSec) < Math.max(0.05, (win.endSec - win.startSec) * 0.15) &&
        Math.abs(painted.end - win.endSec) < Math.max(0.05, (win.endSec - win.startSec) * 0.15)
          ? painted.end
          : win.endSec
      const span = Math.max(1e-9, endSec - startSec)
      const el = viewportRef.current ?? container
      const rect = el.getBoundingClientRect()
      if (rect.width <= 0) return null
      // Sub-pixel ratio — do not round width (round CSS width was shifting seek vs grid).
      const focal = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      let t = startSec + focal * span
      t = Math.max(0, Math.min(dur, t))
      const shouldSnap = opts?.snap ?? snapToGrid
      if (shouldSnap && bpm && bpm > 0) {
        t = quantizePointerToVisibleGrid({
          timeSec: t,
          bpm,
          offsetSec: beatGridOffsetSec,
          visibleBars: bars,
          beatsPerBar,
          durationSec: dur,
        })
      }
      return t
    }

    pointerTimeAtClientXRef.current = (clientX: number) => timeAtClientX(clientX, { snap: false })

    const seekAt = (clientX: number) => {
      const t = timeAtClientX(clientX)
      if (t == null) return
      applySeekTime(t)
    }

    const cueAt = (clientX: number) => {
      const t = timeAtClientX(clientX)
      if (t == null) return
      onCueSecRef.current?.(t)
    }

    let lastTap: { at: number; x: number } | null = null
    const TAP_DOUBLE_MS = 320
    const TAP_DOUBLE_PX = 12

    const applyWheelZoom = (dy: number, focal: number) => {
      const factor = wheelDeltaToZoomFactor(dy)
      const atFull = barsRef.current <= 0
      if (atFull && factor >= 1) return
      const next = scaleVisibleBars(barsRef.current, factor, {
        durationSec,
        beatDurationSec: bpm && bpm > 0 ? 60 / bpm : null,
        beatsPerBar,
      })
      if (next <= 0 && atFull) return
      const applied = atFull && next > 0 ? Math.min(next, 48) : next
      applyBarsLive(applied, focal)
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
      markGesture(true)
      let dx = e.deltaX
      let dy = e.deltaY
      if (e.deltaMode === 1) {
        dx *= 16
        dy *= 16
      } else if (e.deltaMode === 2) {
        dx *= 400
        dy *= 400
      }

      const { zoomDelta, panDelta } = splitWheelAxes(dx, dy, {
        shift: e.shiftKey,
        pinch: e.ctrlKey || e.metaKey,
      })
      const focal = focalFromClientX(e.clientX)
      if (zoomDelta) applyWheelZoom(zoomDelta, focal)
      if (panDelta) {
        if (barsRef.current <= 0 && !zoomDelta) applyBarsLive(32, focal)
        panPixels(-panDelta)
      }
      scheduleZoomCommit(focal)
    }

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 || !e.isPrimary || pinch) return
      markGesture(true)
      drag = {
        pointerId: e.pointerId,
        startX: e.clientX,
        lastX: e.clientX,
        didDrag: false,
        mode: null,
      }
      container.setPointerCapture(e.pointerId)
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!drag || drag.pointerId !== e.pointerId || pinch) return
      const totalDx = e.clientX - drag.startX
      if (!drag.didDrag && Math.abs(totalDx) > DRAG_THRESHOLD) {
        drag.didDrag = true
        drag.mode = barsRef.current > 0 ? 'pan' : 'scrub'
      }
      if (!drag.didDrag || !drag.mode) return
      const dx = e.clientX - drag.lastX
      drag.lastX = e.clientX
      e.preventDefault()
      if (drag.mode === 'pan') panPixels(dx)
      else seekAt(e.clientX)
    }

    const endDrag = (e: PointerEvent) => {
      if (!drag || drag.pointerId !== e.pointerId) return
      if (container.hasPointerCapture(e.pointerId)) container.releasePointerCapture(e.pointerId)
      if (!drag.didDrag) {
        const now = performance.now()
        const isDouble =
          lastTap != null &&
          now - lastTap.at <= TAP_DOUBLE_MS &&
          Math.abs(e.clientX - lastTap.x) <= TAP_DOUBLE_PX
        lastTap = { at: now, x: e.clientX }
        if (isDouble || !onCueSecRef.current) {
          seekAt(e.clientX)
          if (isDouble) onJumpPlayRef.current?.()
        } else cueAt(e.clientX)
      }
      drag = null
      if (!pinch) markGesture(false)
    }

    const touchDistance = (touches: TouchList) => {
      if (touches.length < 2) return 0
      const a = touches[0]
      const b = touches[1]
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
    }

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault()
        markGesture(true)
        drag = null
        pinch = {
          startDistance: Math.max(touchDistance(e.touches), 1),
          startBars: barsRef.current || 32,
        }
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length < 2) return
      e.preventDefault()
      const dist = Math.max(touchDistance(e.touches), 1)
      const scale = dist / pinch.startDistance
      const approx = pinch.startBars / Math.max(0.2, scale)
      const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2
      const focal = focalFromClientX(centerX)
      const beatSec = bpm && bpm > 0 ? 60 / bpm : null
      if (
        (scale < 0.5 && pinch.startBars >= 64) ||
        (approx > pinch.startBars &&
          durationSec > 0 &&
          isFullTrackVisible(approx, durationSec, beatSec, beatsPerBar))
      ) {
        applyBarsLive(0, focal)
      } else {
        applyBarsLive(approx, focal)
      }
    }

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        if (pinch) {
          const current = barsRef.current
          if (current > 0) applyBarsLive(nearestBarZoomStep(current), 0.5, { snap: true })
        }
        pinch = null
        if (!drag) markGesture(false)
      }
    }

    const root =
      (hoverRoot?.closest?.('[data-waveform-hover-root]') as HTMLElement | null) ||
      hoverRoot ||
      container

    root.addEventListener('wheel', onWheel, { passive: false })
    container.addEventListener('pointerdown', onPointerDown)
    container.addEventListener('pointermove', onPointerMove)
    container.addEventListener('pointerup', endDrag)
    container.addEventListener('pointercancel', endDrag)
    container.addEventListener('touchstart', onTouchStart, { passive: false })
    container.addEventListener('touchmove', onTouchMove, { passive: false })
    container.addEventListener('touchend', onTouchEnd)
    container.addEventListener('touchcancel', onTouchEnd)

    return () => {
      if (zoomCommitTimer) clearTimeout(zoomCommitTimer)
      root.removeEventListener('wheel', onWheel)
      container.removeEventListener('pointerdown', onPointerDown)
      container.removeEventListener('pointermove', onPointerMove)
      container.removeEventListener('pointerup', endDrag)
      container.removeEventListener('pointercancel', endDrag)
      container.removeEventListener('touchstart', onTouchStart)
      container.removeEventListener('touchmove', onTouchMove)
      container.removeEventListener('touchend', onTouchEnd)
      container.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [
    audioRef,
    bpm,
    beatsPerBar,
    beatGridEnabled,
    beatGridOffsetSec,
    snapToGrid,
    durationSec,
    gestureActiveRef,
    hoverRoot,
    onOffsetChange,
    onSeekSec,
    onVisibleBarsChange,
    paint,
  ])

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!onContextMenu) return
      const timeSec = pointerTimeAtClientXRef.current(e.clientX)
      onContextMenu(e, timeSec)
    },
    [onContextMenu],
  )

  return (
    <div
      ref={containerRef}
      data-waveform-stage=""
      data-waveform-click-mode={onCueSec ? 'cue' : 'seek'}
      className={`${className || ''} flex flex-col`}
      onContextMenu={handleContextMenu}
      title={
        onCueSec
          ? showOverview
            ? 'Scroll to zoom · drag to pan · click to set cue · double-click to play · overview to jump · 1–4 hot cues (⌘/Ctrl+1–4 set)'
            : 'Scroll to zoom · drag to pan · click to set cue · double-click to play · 1–4 hot cues (⌘/Ctrl+1–4 set)'
          : showOverview
            ? 'Scroll to zoom · drag to pan · click to seek · overview to jump · 1–4 hot cues (⌘/Ctrl+1–4 set)'
            : 'Scroll to zoom · drag to pan · click to seek · 1–4 hot cues (⌘/Ctrl+1–4 set)'
      }
    >
      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0 flex items-center justify-center px-2">
          {samples.length > 0 ? (
            <div ref={viewportRef} className="relative h-full w-full overflow-hidden">
              <div
                ref={scrollLayerRef}
                className="absolute top-0 left-0 h-full"
                style={{ backfaceVisibility: 'hidden' }}
              >
                <canvas
                  ref={baseCanvasRef}
                  className="block h-full w-full"
                  style={{ background: '#000' }}
                  aria-hidden
                />
              </div>
              <canvas
                ref={overlayCanvasRef}
                className="pointer-events-none absolute inset-0 h-full w-full"
                style={{ background: 'transparent' }}
                aria-hidden
              />
              <div className="pointer-events-none absolute left-1.5 top-1 z-10 rounded bg-black/55 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-emerald-300/90">
                Deck {deckId}
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-500">Loading waveform...</div>
          )}
        </div>
      </div>
      {showOverview && samples.length > 0 && durationSec > 0 && (
        <div
          ref={overviewWrapRef}
          className={`relative mx-2 h-5 shrink-0 cursor-pointer overflow-hidden rounded-sm border border-gray-800/80 bg-black ${
            showPhaseMeter && bpm && bpm > 0 ? 'mb-0.5' : 'mb-1'
          }`}
          title="Overview — click to seek"
          onPointerDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            const el = overviewWrapRef.current
            if (!el || durationSec <= 0) return
            const rect = el.getBoundingClientRect()
            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
            let t = ratio * durationSec
            if (snapToGrid && bpm && bpm > 0) {
              t = quantizePointerToVisibleGrid({
                timeSec: t,
                bpm,
                offsetSec: beatGridOffsetSec,
                visibleBars: 0,
                beatsPerBar,
                durationSec,
              })
            }
            const seeker = seekMediaTimeRef.current
            if (seeker) seeker(t)
            else {
              const audio = audioRef.current
              if (audio) {
                try {
                  audio.currentTime = t
                } catch {
                  /* ignore */
                }
              }
            }
            clockRef.current = { mediaAnchor: t, wallAnchor: performance.now(), armed: true }
            smoothTimeRef.current = t
            followScrollRef.current.armed = false
            onSeekSec(t)
            paint(t, { forceBase: true })
          }}
        >
          <canvas ref={overviewCanvasRef} className="pointer-events-none block h-full w-full" aria-hidden />
        </div>
      )}
      {showPhaseMeter && samples.length > 0 && durationSec > 0 && bpm != null && bpm > 0 && (
        <div
          ref={phaseWrapRef}
          className={`relative mx-2 mb-1 h-5 shrink-0 overflow-hidden rounded-sm border border-gray-800/80 bg-black ${
            onPhaseNudge ? 'cursor-ew-resize touch-none' : ''
          }`}
          title="Phase / grid align — drag to nudge · double-click to lock"
          role="slider"
          aria-label={`Deck ${deckId} beat phase alignment`}
          aria-valuemin={-50}
          aria-valuemax={50}
          aria-valuenow={0}
          onPointerDown={(e) => {
            if (!onPhaseNudgeRef.current || !bpm || bpm <= 0) return
            e.preventDefault()
            e.stopPropagation()
            const el = phaseWrapRef.current
            if (!el) return
            el.setPointerCapture(e.pointerId)
            phaseDragRef.current = {
              lastX: e.clientX,
              width: Math.max(1, el.getBoundingClientRect().width),
              bpm,
              windowBeats: resolvePhaseMeterWindowBeats(
                phaseMeterOptionsRef.current.windowId,
                beatsPerBar,
                phaseMeterOptionsRef.current.phraseBars,
              ),
            }
          }}
          onPointerMove={(e) => {
            const drag = phaseDragRef.current
            const nudge = onPhaseNudgeRef.current
            if (!drag || !nudge) return
            const dx = e.clientX - drag.lastX
            if (Math.abs(dx) < 0.5) return
            drag.lastX = e.clientX
            // Full strip width = windowBeats of phase
            const beatSec = 60 / drag.bpm
            const deltaSec = (dx / drag.width) * drag.windowBeats * beatSec
            nudge(deltaSec)
            paint(smoothTimeRef.current)
          }}
          onPointerUp={(e) => {
            const el = phaseWrapRef.current
            try {
              el?.releasePointerCapture(e.pointerId)
            } catch {
              /* ignore */
            }
            phaseDragRef.current = null
          }}
          onPointerCancel={() => {
            phaseDragRef.current = null
          }}
          onDoubleClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onPhaseLockRef.current?.()
            paint(smoothTimeRef.current, { forceBase: true })
          }}
        >
          <canvas ref={phaseCanvasRef} className="pointer-events-none block h-full w-full" aria-hidden />
        </div>
      )}
    </div>
  )
}

export default memo(WaveformStage)
