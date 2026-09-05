'use client'

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import DeckChannelStrip, {
  formatEqGain,
  type DeckChannelConfig,
  type DeckChannelId,
  type EqBand,
} from '@/components/music/DeckChannelStrip'
import MixCrossfader from '@/components/music/MixCrossfader'
import MixSessionLog from '@/components/music/MixSessionLog'
import type { MixQualityHistoryEntry } from '@/lib/audio/mix-engine/mix-quality-history'
import { formatTapTempoButtonLabel } from '@/lib/audio/beat-count'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'

interface ExpandedPlayerControlsProps {
  decks: { a: DeckChannelConfig; b: DeckChannelConfig }
  deckWaveforms?: { a?: ReactNode; b?: ReactNode }
  audioContext?: AudioContext | null
  sourceNode?: MediaElementAudioSourceNode | null
  analyserNode?: AnalyserNode | null
  outputGain?: GainNode | null
  audioContextReady?: boolean
  onTapTempo: (deck: DeckChannelId) => void
  onTempoChange: (deck: DeckChannelId, tempoValue: number) => void
  onChangePlaybackRate: (deck: DeckChannelId, rate: number) => void
  getTempoPercentage: (rate: number) => number
  getAdjustedBPM: (originalBPM: number | null, rate: number) => number | null
  rateToTempoValue: (rate: number) => number
  onBPMUpdate?: (deck: DeckChannelId, bpm: number) => void
  /** Allow editing original BPM (persists to library on admin routes). */
  canEditOrigBpm?: boolean
  onDeckEqGains?: (deck: DeckChannelId, gains: { low: number; mid: number; high: number }) => void
  isPlaying?: boolean
  isLoading?: boolean
  error?: string | null
  canSkip?: boolean
  onPrevious?: () => void
  onNext?: () => void
  onTogglePlay?: () => void
  /** Auto DJ blend position 0→1 (null = idle). */
  mixProgress?: number | null
  mixCrossfadeActive?: boolean
  /** Countdown / blend line under deck chrome. */
  autoDjStatusLine?: string | null
  mixSessionEntries?: MixQualityHistoryEntry[]
  autoDjStatusMessage?: string | null
}

type ActiveDial = null | {
  deck: DeckChannelId
  dial: 'tempo' | 'eq'
  anchorRect?: DOMRect | null
}

function anchorTempoPopupStyle(rect: DOMRect) {
  const centerX = rect.left + rect.width / 2
  const clampedX = Math.max(88, Math.min(window.innerWidth - 88, centerX))
  return {
    left: clampedX,
    top: rect.top - 6,
    transform: 'translate(-50%, -100%)',
  } as const
}

/** CDJ-style vertical channel fader (drag up = increase). Double-tap/click resets to 0.
 *  When resetValue is in range, 0 sits at visual center (mixer EQ style) even if
 *  boost/cut spans are asymmetric (e.g. −40…+12).
 *  During drag, cap/fill paint via DOM so React state lag cannot delay the grip.
 */
function VerticalFader({
  min,
  max,
  step,
  value,
  onChange,
  ariaLabel,
  accent = 'blue',
  resetValue = 0,
  size = 'default',
}: {
  min: number
  max: number
  step: number
  value: number
  onChange: (next: number) => void
  ariaLabel: string
  accent?: 'blue' | 'red' | 'amber' | 'sky'
  /** Value used on double-tap / double-click (default 0). */
  resetValue?: number
  size?: 'default' | 'compact'
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const capRef = useRef<HTMLDivElement>(null)
  const fillRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const liveValueRef = useRef(value)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const lastTapRef = useRef<{ t: number; x: number; y: number }>({ t: 0, x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)

  const zeroInRange = min <= resetValue && max >= resetValue

  /** Visual position 0 = bottom, 1 = top; resetValue maps to 0.5 when in range. */
  const valueToVisual = useCallback(
    (v: number) => {
      const c = Math.min(max, Math.max(min, v))
      if (!zeroInRange) {
        const span = max - min
        return span === 0 ? 0.5 : (c - min) / span
      }
      if (c >= resetValue) {
        const span = max - resetValue
        return span <= 0 ? 0.5 : 0.5 + 0.5 * ((c - resetValue) / span)
      }
      const span = resetValue - min
      return span <= 0 ? 0.5 : 0.5 * ((c - min) / span)
    },
    [max, min, resetValue, zeroInRange],
  )

  const visualToValue = useCallback(
    (t: number) => {
      const u = Math.min(1, Math.max(0, t))
      let raw: number
      if (!zeroInRange) {
        raw = min + u * (max - min)
      } else if (u >= 0.5) {
        raw = resetValue + ((u - 0.5) * 2) * (max - resetValue)
      } else {
        raw = min + (u * 2) * (resetValue - min)
      }
      const stepped = Math.round(raw / step) * step
      return Math.min(max, Math.max(min, Number(stepped.toFixed(4))))
    },
    [max, min, resetValue, step, zeroInRange],
  )

  const paint = useCallback(
    (v: number) => {
      const visual = valueToVisual(v)
      const capTopPct = 7 + (1 - visual) * 86
      const fillIsBoost = visual >= 0.5
      const fillExtentPct = Math.abs(visual - 0.5) * 100
      if (capRef.current) {
        capRef.current.style.top = `${capTopPct}%`
      }
      const fill = fillRef.current
      if (fill) {
        if (fillExtentPct > 0.25) {
          fill.style.display = 'block'
          if (fillIsBoost) {
            fill.style.bottom = '50%'
            fill.style.top = 'auto'
            fill.style.height = `${fillExtentPct}%`
          } else {
            fill.style.top = '50%'
            fill.style.bottom = 'auto'
            fill.style.height = `${fillExtentPct}%`
          }
        } else {
          fill.style.display = 'none'
        }
      }
    },
    [valueToVisual],
  )

  useEffect(() => {
    if (draggingRef.current) return
    liveValueRef.current = value
    paint(value)
  }, [value, paint])

  const clamped = Math.min(max, Math.max(min, dragging ? liveValueRef.current : value))

  const accentFill = {
    blue: 'bg-blue-500/70',
    red: 'bg-orange-500/70',
    amber: 'bg-amber-500/70',
    sky: 'bg-sky-500/70',
  }[accent]

  const accentCap = {
    blue: 'ring-blue-400/50',
    red: 'ring-orange-400/50',
    amber: 'ring-amber-400/50',
    sky: 'ring-sky-400/50',
  }[accent]

  const emit = useCallback(
    (next: number) => {
      liveValueRef.current = next
      paint(next)
      onChangeRef.current(next)
    },
    [paint],
  )

  const resetToZero = useCallback(() => {
    emit(Math.min(max, Math.max(min, resetValue)))
  }, [emit, max, min, resetValue])

  const valueFromClientY = useCallback(
    (clientY: number) => {
      const el = trackRef.current
      if (!el) return liveValueRef.current
      const rect = el.getBoundingClientRect()
      const padY = rect.height * 0.07
      const usable = Math.max(1, rect.height - padY * 2)
      const y = clientY - rect.top - padY
      const t = 1 - Math.min(1, Math.max(0, y / usable))
      return visualToValue(t)
    },
    [visualToValue],
  )

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const now = performance.now()
    const prev = lastTapRef.current
    const dx = e.clientX - prev.x
    const dy = e.clientY - prev.y
    const isDoubleTap = now - prev.t < 350 && dx * dx + dy * dy < 900

    if (isDoubleTap) {
      lastTapRef.current = { t: 0, x: 0, y: 0 }
      draggingRef.current = false
      setDragging(false)
      resetToZero()
      return
    }

    lastTapRef.current = { t: now, x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId)
    draggingRef.current = true
    setDragging(true)
    emit(valueFromClientY(e.clientY))
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return
    emit(valueFromClientY(e.clientY))
  }

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false
    setDragging(false)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }
  }

  const ticks = [0, 0.25, 0.5, 0.75, 1]
  const visual = valueToVisual(clamped)
  const capTopPct = 7 + (1 - visual) * 86
  const fillIsBoost = visual >= 0.5
  const fillExtentPct = Math.abs(visual - 0.5) * 100

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label={`${ariaLabel}. Double-tap to reset.`}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(clamped * 10) / 10}
      aria-orientation="vertical"
      title="Drag to adjust · Double-tap to reset"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={(e) => {
        e.preventDefault()
        resetToZero()
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
          e.preventDefault()
          emit(Math.min(max, clamped + step))
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
          e.preventDefault()
          emit(Math.max(min, clamped - step))
        } else if (e.key === 'Home') {
          e.preventDefault()
          emit(max)
        } else if (e.key === 'End') {
          e.preventDefault()
          emit(min)
        } else if (e.key === '0' || e.key === 'Delete') {
          e.preventDefault()
          resetToZero()
        }
      }}
      className={`relative ${size === 'compact' ? 'h-44 w-14' : 'h-52 w-16'} shrink-0 touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
        dragging ? 'cursor-grabbing' : 'cursor-ns-resize'
      }`}
    >
      {/* Side tick marks — center tick is 0 */}
      <div className="pointer-events-none absolute inset-y-3 left-1 flex w-2 flex-col justify-between">
        {ticks.map((t) => (
          <span
            key={t}
            className={`h-px w-full ${t === 0.5 ? 'bg-gray-200' : 'bg-gray-600'}`}
          />
        ))}
      </div>
      <div className="pointer-events-none absolute inset-y-3 right-1 flex w-2 flex-col justify-between">
        {ticks.map((t) => (
          <span
            key={t}
            className={`h-px w-full ${t === 0.5 ? 'bg-gray-200' : 'bg-gray-600'}`}
          />
        ))}
      </div>

      {/* Recessed slot */}
      <div className="absolute inset-y-2 left-1/2 w-3.5 -translate-x-1/2 rounded-sm border border-gray-800 bg-gradient-to-b from-black via-gray-950 to-black shadow-[inset_0_2px_6px_rgba(0,0,0,0.9)]">
        <div
          ref={fillRef}
          className={`absolute left-0.5 right-0.5 ${accentFill}`}
          style={
            fillExtentPct > 0.25
              ? fillIsBoost
                ? { bottom: '50%', height: `${fillExtentPct}%` }
                : { top: '50%', height: `${fillExtentPct}%` }
              : { display: 'none' }
          }
        />
        {zeroInRange && (
          <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-gray-200" />
        )}
      </div>

      {/* Fader cap — sits at center when value === resetValue */}
      <div
        ref={capRef}
        className="pointer-events-none absolute left-1/2 z-10 w-12 -translate-x-1/2 -translate-y-1/2"
        style={{ top: `${capTopPct}%` }}
      >
        <div
          className={`relative mx-auto h-7 w-11 rounded-[3px] border border-gray-500/80 bg-gradient-to-b from-gray-100 via-gray-300 to-gray-500 shadow-[0_2px_4px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.7)] ring-1 ${accentCap}`}
        >
          <div className="absolute inset-x-1.5 top-1/2 flex -translate-y-1/2 flex-col gap-[3px]">
            <span className="h-px w-full bg-gray-600/50" />
            <span className="h-px w-full bg-gray-600/50" />
            <span className="h-px w-full bg-gray-600/50" />
            <span className="h-px w-full bg-gray-600/50" />
          </div>
          <div className="absolute left-1/2 top-0.5 bottom-0.5 w-0.5 -translate-x-1/2 rounded-full bg-red-600/90 shadow-sm" />
        </div>
      </div>
    </div>
  )
}

export default function ExpandedPlayerControls({
  decks,
  deckWaveforms,
  onTapTempo,
  onTempoChange,
  onChangePlaybackRate,
  getTempoPercentage,
  getAdjustedBPM,
  rateToTempoValue,
  onBPMUpdate,
  canEditOrigBpm = false,
  onDeckEqGains,
  isPlaying = false,
  isLoading = false,
  error = null,
  canSkip = false,
  onPrevious,
  onNext,
  onTogglePlay,
  mixProgress = null,
  mixCrossfadeActive = false,
  autoDjStatusLine = null,
  mixSessionEntries = [],
  autoDjStatusMessage = null,
}: ExpandedPlayerControlsProps) {
  const [editingDeck, setEditingDeck] = useState<DeckChannelId | null>(null)
  const [editingBPM, setEditingBPM] = useState<string>('')
  const [isSavingBPM, setIsSavingBPM] = useState(false)
  const [activeDial, setActiveDial] = useState<ActiveDial>(null)
  const [focusedEqBand, setFocusedEqBand] = useState<EqBand>('mid')
  const [portalReady, setPortalReady] = useState(false)
  const tempoTitleId = useId()
  const eqTitleId = useId()

  const activeDeckConfig = activeDial ? decks[activeDial.deck] : null
  const activeTempoPct = activeDeckConfig
    ? getTempoPercentage(activeDeckConfig.playbackRate)
    : 0
  const activeAdjustedBpm = activeDeckConfig
    ? getAdjustedBPM(activeDeckConfig.detectedBPM, activeDeckConfig.playbackRate)
    : null
  const activeTempoSliderValue = activeDeckConfig
    ? rateToTempoValue(activeDeckConfig.playbackRate)
    : 0
  const activeEqGains = activeDeckConfig?.eqGains ?? { low: 0, mid: 0, high: 0 }

  useEffect(() => {
    setPortalReady(true)
  }, [])

  useEffect(() => {
    if (!activeDial) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveDial(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeDial])

  useLockBodyScroll(Boolean(activeDial))

  const deckChromeRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = deckChromeRef.current
    if (!el) return

    const onWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.closest('[data-waveform-stage]')) return
      e.preventDefault()
      e.stopPropagation()
      const scrollParent = el.closest('[data-scroll-lock-root]') as HTMLElement | null
      if (!scrollParent) return
      const max = scrollParent.scrollHeight - scrollParent.clientHeight
      if (max <= 0) return
      scrollParent.scrollTop = Math.max(0, Math.min(max, scrollParent.scrollTop + e.deltaY))
    }

    const onTouchMove = (e: TouchEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.closest('[data-waveform-stage]')) return
      if (target?.closest('[data-allow-scroll-when-locked]')) return
      e.preventDefault()
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchmove', onTouchMove)
    }
  }, [])

  const handleBPMEdit = (deck: DeckChannelId) => {
    setEditingDeck(deck)
    setEditingBPM(decks[deck].detectedBPM?.toString() || '')
  }

  const handleBPMCancel = () => {
    setEditingDeck(null)
    setEditingBPM('')
  }

  const handleBPMSave = async () => {
    if (!editingDeck) return
    const bpmValue = parseInt(editingBPM, 10)
    if (isNaN(bpmValue) || bpmValue < 30 || bpmValue > 300) {
      alert('BPM must be between 30 and 300')
      return
    }

    setIsSavingBPM(true)
    try {
      if (onBPMUpdate) {
        await onBPMUpdate(editingDeck, bpmValue)
        setEditingDeck(null)
        setEditingBPM('')
      }
    } catch (error: unknown) {
      console.error('Error updating BPM:', error)
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to update BPM. Please try again.'
      alert(errorMessage)
    } finally {
      setIsSavingBPM(false)
    }
  }

  const handleBPMKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      void handleBPMSave()
    } else if (e.key === 'Escape') {
      handleBPMCancel()
    }
  }

  const openTempoDial = useCallback((deck: DeckChannelId, anchorEl?: HTMLElement | null) => {
    const anchorRect = anchorEl?.getBoundingClientRect() ?? null
    setActiveDial({ deck, dial: 'tempo', anchorRect })
  }, [])

  const openEqDial = useCallback((deck: DeckChannelId, band: EqBand = 'mid') => {
    setFocusedEqBand(band)
    setActiveDial({ deck, dial: 'eq' })
  }, [])

  const setEqBandGain = useCallback(
    (deck: DeckChannelId, band: EqBand, value: number) => {
      const base = decks[deck].eqGains
      const next = { ...base, [band]: value }
      onDeckEqGains?.(deck, next)
    },
    [decks, onDeckEqGains],
  )

  const resetEq = useCallback(
    (deck: DeckChannelId) => {
      onDeckEqGains?.(deck, { low: 0, mid: 0, high: 0 })
    },
    [onDeckEqGains],
  )

  const dialDeck = activeDial?.deck ?? 'a'
  const dialTapTaps = activeDeckConfig?.tapTempoTaps ?? []
  const dialTapBpm = activeDeckConfig?.tapTempoBPM ?? null
  const dialTapSections = activeDeckConfig?.tapTempoSectionsCompleted ?? 0
  const dialDetectedBpm = activeDeckConfig?.detectedBPM ?? null
  const dialIsDetecting = activeDeckConfig?.isDetectingBPM ?? false
  const anchoredTempo =
    activeDial?.dial === 'tempo' &&
    activeDial.anchorRect != null &&
    activeDial.anchorRect.width > 0

  const dialPopup =
    portalReady &&
    activeDial &&
    activeDeckConfig &&
    createPortal(
      <div className="fixed inset-0 z-[10050]" role="presentation">
        <button
          type="button"
          className="absolute inset-0 bg-black/55"
          aria-label="Close dial"
          onClick={() => setActiveDial(null)}
        />
        {anchoredTempo ? (
          <div
            className="fixed z-10 flex w-[5.5rem] flex-col items-center rounded-xl border border-gray-700 bg-gray-950 px-2 pb-2 pt-2 shadow-2xl touch-manipulation"
            role="dialog"
            aria-modal="true"
            aria-labelledby={tempoTitleId}
            data-allow-scroll-when-locked=""
            style={anchorTempoPopupStyle(activeDial.anchorRect!)}
          >
            <div className="mb-1 flex w-full items-center justify-between gap-1">
              <span id={tempoTitleId} className="text-[9px] font-semibold uppercase tracking-wide text-gray-400">
                Deck {activeDeckConfig.deckLabel}
              </span>
              <button
                type="button"
                onClick={() => setActiveDial(null)}
                className="rounded px-1 py-0.5 text-[10px] text-gray-400 hover:bg-gray-800 hover:text-white"
              >
                ✕
              </button>
            </div>
            <button
              type="button"
              title="Double-tap to reset tempo to 0%"
              onDoubleClick={(e) => {
                e.preventDefault()
                onChangePlaybackRate(dialDeck, 1)
              }}
              className={`font-mono text-lg font-bold leading-none touch-manipulation ${
                Math.abs(activeTempoPct) > 0.1 ? 'text-yellow-400' : 'text-white'
              }`}
            >
              {activeTempoPct >= 0 ? '+' : ''}
              {activeTempoPct.toFixed(1)}%
            </button>
            <div className="text-[8px] uppercase tracking-wide text-gray-500">Adj BPM</div>
            <div
              className={`mb-1 font-mono text-sm font-bold leading-none ${
                Math.abs(activeTempoPct) > 0.1 ? 'text-yellow-400' : 'text-gray-200'
              }`}
            >
              {activeAdjustedBpm?.toFixed(0) || '---'}
            </div>
            <div className="flex flex-col items-center gap-1 text-[8px] text-gray-500">
              <span>+50%</span>
              <VerticalFader
                min={-50}
                max={50}
                step={0.1}
                value={activeTempoSliderValue}
                onChange={(v) => onTempoChange(dialDeck, v)}
                ariaLabel={`Adjust tempo deck ${activeDeckConfig.deckLabel}`}
                accent="blue"
                size="compact"
              />
              <span>−50%</span>
            </div>
          </div>
        ) : (
        <div
          className="absolute inset-x-0 bottom-0 z-10 mx-auto flex max-h-[min(85vh,calc(100vh-var(--global-music-player-height,7rem)))] w-full max-w-lg flex-col justify-end"
          style={{
            marginBottom: 'var(--global-music-player-height, 7rem)',
          }}
        >
        <div
          className="rounded-t-2xl border border-gray-700 border-b-0 bg-gray-950 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl overscroll-y-contain"
          role="dialog"
          aria-modal="true"
          aria-labelledby={activeDial.dial === 'tempo' ? tempoTitleId : eqTitleId}
          data-allow-scroll-when-locked=""
        >
          {activeDial.dial === 'tempo' ? (
            <>
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <h3 id={tempoTitleId} className="text-sm font-semibold text-white">
                    Deck {activeDeckConfig.deckLabel} · Tempo
                  </h3>
                  <p className="text-[10px] text-emerald-300/90 uppercase tracking-wide">Key lock</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onChangePlaybackRate(dialDeck, 1)}
                    className="rounded-lg bg-gray-800 px-2.5 py-1.5 text-[11px] text-gray-200 hover:bg-gray-700 touch-manipulation"
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveDial(null)}
                    className="rounded-lg px-2.5 py-1.5 text-[11px] text-gray-400 hover:bg-gray-800 hover:text-white touch-manipulation"
                  >
                    Done
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 items-center gap-2 pb-2">
                <div className="min-w-0 justify-self-end space-y-1 pr-1 text-center">
                  <button
                    type="button"
                    title="Double-tap to reset tempo to 0%"
                    onDoubleClick={(e) => {
                      e.preventDefault()
                      onChangePlaybackRate(dialDeck, 1)
                    }}
                    className={`mx-auto block font-mono text-3xl font-bold touch-manipulation ${
                      Math.abs(activeTempoPct) > 0.1 ? 'text-yellow-400' : 'text-white'
                    }`}
                  >
                    {activeTempoPct >= 0 ? '+' : ''}
                    {activeTempoPct.toFixed(1)}%
                  </button>
                  <div className="text-[10px] uppercase tracking-wide text-gray-500">Adj BPM</div>
                  <div
                    className={`font-mono text-xl font-bold ${
                      Math.abs(activeTempoPct) > 0.1 ? 'text-yellow-400' : 'text-gray-200'
                    }`}
                  >
                    {activeAdjustedBpm?.toFixed(0) || '---'}
                  </div>
                  {Math.abs(activeTempoPct) > 0.5 && (
                    <p className="pt-1 text-[10px] text-gray-500">Formant EQ active</p>
                  )}
                </div>
                <div className="flex flex-col items-center gap-2 justify-self-center text-[10px] text-gray-500">
                  <span>+50%</span>
                  <VerticalFader
                    min={-50}
                    max={50}
                    step={0.1}
                    value={activeTempoSliderValue}
                    onChange={(v) => onTempoChange(dialDeck, v)}
                    ariaLabel={`Adjust tempo deck ${activeDeckConfig.deckLabel}`}
                    accent="blue"
                  />
                  <span>−50%</span>
                </div>
                <div className="flex flex-col items-center gap-3 justify-self-start pl-1">
                  <div className="flex shrink-0 items-center gap-2.5 rounded-lg bg-gray-800/80 px-2.5 py-1.5">
                    <div className="text-center">
                      <div className="text-[9px] uppercase tracking-wide text-gray-500">Orig</div>
                      {canEditOrigBpm && editingDeck === dialDeck ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="30"
                            max="300"
                            value={editingBPM}
                            onChange={(e) => setEditingBPM(e.target.value)}
                            onKeyDown={handleBPMKeyPress}
                            className="w-14 rounded border border-gray-600 bg-gray-700 px-1 py-0.5 text-center font-mono text-sm font-bold text-white focus:border-blue-500 focus:outline-none"
                            autoFocus
                            disabled={isSavingBPM}
                            aria-label="Edit BPM"
                          />
                          <button
                            type="button"
                            onClick={() => void handleBPMSave()}
                            disabled={isSavingBPM}
                            className="rounded bg-blue-600 px-1.5 py-0.5 text-[10px] text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            {isSavingBPM ? '…' : '✓'}
                          </button>
                          <button
                            type="button"
                            onClick={handleBPMCancel}
                            disabled={isSavingBPM}
                            className="rounded bg-gray-700 px-1.5 py-0.5 text-[10px] text-gray-300 hover:bg-gray-600 disabled:opacity-50"
                          >
                            ✕
                          </button>
                        </div>
                      ) : canEditOrigBpm ? (
                        <button
                          type="button"
                          className="group font-mono text-sm font-bold text-white transition-colors hover:text-blue-400"
                          onClick={() => handleBPMEdit(dialDeck)}
                          title="Click to edit BPM"
                        >
                          {dialIsDetecting ? (
                            <span className="text-xs text-gray-400">…</span>
                          ) : (
                            <>
                              {dialDetectedBpm?.toFixed(0) || '---'}
                              <span className="ml-0.5 text-[10px] text-gray-500 opacity-0 group-hover:opacity-100">
                                ✎
                              </span>
                            </>
                          )}
                        </button>
                      ) : (
                        <div className="font-mono text-sm font-bold text-white">
                          {dialIsDetecting ? (
                            <span className="text-xs text-gray-400">…</span>
                          ) : (
                            dialDetectedBpm?.toFixed(0) || '---'
                          )}
                        </div>
                      )}
                    </div>
                    <div className="h-7 w-px bg-gray-700" aria-hidden />
                    <div className="text-center">
                      <div className="text-[9px] uppercase tracking-wide text-gray-500">Adj</div>
                      <div
                        className={`font-mono text-sm font-bold ${
                          Math.abs(activeTempoPct) > 0.1 ? 'text-yellow-400' : 'text-white'
                        }`}
                      >
                        {activeAdjustedBpm?.toFixed(0) || '---'}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onTapTempo(dialDeck)}
                    className={`flex h-16 min-w-[3.5rem] items-center justify-center rounded-xl px-4 text-sm font-semibold transition-all active:scale-95 touch-manipulation ${
                      dialTapTaps.length > 0 || dialTapSections > 0
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    }`}
                    title="Tap 16 beats to measure BPM (does not change playback)"
                  >
                    {formatTapTempoButtonLabel({
                      taps: dialTapTaps,
                      bpm: dialTapBpm,
                      sectionsCompleted: dialTapSections,
                    })}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 id={eqTitleId} className="text-sm font-semibold text-white">
                  Deck {activeDeckConfig.deckLabel} · EQ
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => resetEq(dialDeck)}
                    className="rounded-lg bg-gray-800 px-2.5 py-1.5 text-[11px] text-gray-200 hover:bg-gray-700 touch-manipulation"
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveDial(null)}
                    className="rounded-lg px-2.5 py-1.5 text-[11px] text-gray-400 hover:bg-gray-800 hover:text-white touch-manipulation"
                  >
                    Done
                  </button>
                </div>
              </div>
              <div className="flex items-end justify-center gap-4 pb-2">
                {([
                  ['low', 'Low', 'red'],
                  ['mid', 'Mid', 'amber'],
                  ['high', 'High', 'sky'],
                ] as const).map(([id, label, accent]) => {
                  const focused = focusedEqBand === id
                  return (
                    <div
                      key={id}
                      role="group"
                      className={`flex flex-col items-center gap-1 rounded-xl px-1 py-1 transition ${
                        focused ? 'bg-gray-800/80 ring-1 ring-gray-600' : 'opacity-70'
                      }`}
                      onPointerDown={() => setFocusedEqBand(id)}
                    >
                      <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                        {label}
                      </span>
                      <span className="text-[9px] text-gray-500">+12</span>
                      <VerticalFader
                        min={-40}
                        max={12}
                        step={0.1}
                        value={activeEqGains[id]}
                        onChange={(v) => {
                          setFocusedEqBand(id)
                          setEqBandGain(dialDeck, id, v)
                        }}
                        ariaLabel={`${label} EQ deck ${activeDeckConfig.deckLabel}`}
                        accent={accent}
                      />
                      <span className="text-[9px] text-gray-500">−∞</span>
                      <button
                        type="button"
                        title={`Double-tap to reset ${label}`}
                        onDoubleClick={(e) => {
                          e.preventDefault()
                          setFocusedEqBand(id)
                          setEqBandGain(dialDeck, id, 0)
                        }}
                        className="font-mono text-sm font-bold text-white touch-manipulation"
                      >
                        {formatEqGain(activeEqGains[id])}
                        {activeEqGains[id] > -39.5 ? 'dB' : ''}
                      </button>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
        </div>
        )}
      </div>,
      document.body,
    )

  const renderDeckStrip = (deck: DeckChannelId) => {
    const config = decks[deck]
    const tempoPct = getTempoPercentage(config.playbackRate)
    const adjustedBpm = getAdjustedBPM(config.detectedBPM, config.playbackRate)
    return (
      <DeckChannelStrip
        key={deck}
        deck={deck}
        config={config}
        tempoPct={tempoPct}
        adjustedBpm={adjustedBpm}
        tempoDialOpen={activeDial?.deck === deck && activeDial.dial === 'tempo'}
        eqDialOpen={activeDial?.deck === deck && activeDial.dial === 'eq'}
        focusedEqBand={focusedEqBand}
        onOpenTempoDial={(opts) => openTempoDial(deck, opts?.anchorEl)}
        onOpenEqDial={(band) => openEqDial(deck, band)}
        onTapTempo={() => onTapTempo(deck)}
        onBPMUpdate={canEditOrigBpm && onBPMUpdate ? (bpm) => onBPMUpdate(deck, bpm) : undefined}
        canEditOrigBpm={canEditOrigBpm}
        isPlaying={config.isLive ? isPlaying : Boolean(config.isArmed)}
        isLoading={config.isLive ? isLoading : false}
        error={config.isLive ? error : null}
        canSkip={canSkip}
        onPrevious={onPrevious}
        onNext={onNext}
        onTogglePlay={onTogglePlay}
        waveform={deckWaveforms?.[deck]}
      />
    )
  }

  return (
    <div
      ref={deckChromeRef}
      className="w-full max-w-none border-t border-gray-800 px-3 py-2 sm:px-4 sm:py-2.5 overscroll-none"
    >
      <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        {renderDeckStrip('a')}
        <div className="hidden md:flex flex-col items-center justify-center pt-6">
          <MixCrossfader
            progress={mixProgress ?? 0}
            active={mixCrossfadeActive && mixProgress != null}
          />
        </div>
        {renderDeckStrip('b')}
      </div>

      {autoDjStatusLine && (
        <p
          className="mt-2 text-center text-[10px] leading-snug text-emerald-300/90 tabular-nums"
          role="status"
          aria-live="polite"
        >
          {autoDjStatusLine}
        </p>
      )}

      {(mixSessionEntries.length > 0 || autoDjStatusMessage) && (
        <MixSessionLog entries={mixSessionEntries} liveStatus={autoDjStatusMessage} />
      )}

      {dialPopup}
    </div>
  )
}
