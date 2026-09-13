'use client'

import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { FaPause, FaPlay, FaStepBackward, FaStepForward } from 'react-icons/fa'
import { formatClock, formatTapTempoButtonLabel } from '@/lib/audio/beat-count'
import {
  HOT_CUE_SLOTS,
  hasAnyHotCue,
  type HotCueSlot,
  type HotCueSlots,
} from '@/lib/audio/hot-cues'
import {
  idjActiveCueKey,
  resolveIDJActiveCue,
  sameIDJActiveCue,
  type IDJActiveCue,
} from '@/lib/audio/idj-preferences'
import type { DeckJumpCue } from '@/lib/audio/mix-engine/cues'
import { eqGainFromDrag, isEqDialDrag, nudgeEqGain } from '@/lib/ui/eq-dial-drag'
import {
  isTempoDialDrag,
  nudgeTempoPct,
  tempoPctFromDrag,
} from '@/lib/ui/tempo-dial-drag'
import { BpmBadge, GenreBadge, KeyBadge } from '@/components/music/MusicBadges'
import { useClampedFixedMenuPosition } from '@/hooks/useClampedFixedMenuPosition'
import {
  libraryDragHasTracks,
  parseLibraryDragTracks,
  readLibraryDragTrackIds,
} from '@/lib/audio/library-drag'
import { CrateCoverMosaic } from '@/components/music/CrateCoverMosaic'

export type DeckChannelId = 'a' | 'b'

export type DeckChannelConfig = {
  deckLabel: 'A' | 'B'
  trackTitle?: string
  trackArtist?: string
  trackAlbum?: string
  coverSrc?: string
  coverAlt?: string
  coverUnoptimized?: boolean
  /** Crate-style 3×3 mosaic when the track has no own cover art. */
  mosaicCovers?: string[]
  detectedBPM: number | null
  isDetectingBPM: boolean
  playbackRate: number
  catalogBpm?: number | null
  trackGenre?: string | null
  trackKey?: string | null
  tapTempoTaps: number[]
  tapTempoBPM: number | null
  tapTempoSectionsCompleted?: number
  eqGains: { low: number; mid: number; high: number }
  isLive: boolean
  /** Incoming deck is cued / blending (Auto DJ dual-deck). */
  isArmed?: boolean
  /** Dual-deck overlap in progress — show live tempo/EQ automation. */
  isMixing?: boolean
  /** Role during an active blend (outgoing = live master, incoming = cued deck). */
  mixRole?: 'outgoing' | 'incoming' | null
  /** Overlap progress 0→1 from MixEngine (bar-accurate media clock). */
  mixProgress?: number
  /** Filter openness 0–1 (1 = open). Shown when < 0.92 during a mix. */
  filterOpenness?: number
  /** Pair hint for incoming deck (ΔBPM, key). */
  pairHint?: string | null
  /** Last blend quality grade (brief flash after mix). */
  mixQualityGrade?: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown' | null
}

type EqBand = 'low' | 'mid' | 'high'

function formatEqGain(gain: number) {
  if (gain <= -39.5) return '-∞'
  if (Math.abs(gain) < 0.05) return '0'
  return gain > 0 ? `+${gain.toFixed(0)}` : gain.toFixed(0)
}

function eqKnobRotation(gain: number) {
  const maxRotation = 150
  if (gain >= 0) return (gain / 12) * maxRotation
  return (gain / 40) * maxRotation
}

function eqKnobGradient(band: EqBand) {
  if (band === 'low') return 'from-orange-500 to-red-600'
  if (band === 'mid') return 'from-yellow-500 to-amber-600'
  return 'from-blue-500 to-cyan-600'
}

function eqBandLabel(band: EqBand) {
  if (band === 'low') return 'LOW'
  if (band === 'mid') return 'MID'
  return 'HIGH'
}

export function DeckEqDials({
  deckLabel,
  eqGains,
  openEqBands = [],
  eqDialOpen = false,
  focusedEqBand,
  isMixing = false,
  mixRole = null,
  onOpenEqDial,
  onSetEqGain,
  onEqDragStart,
  onEqDragEnd,
  className = '',
  size = 'default',
}: {
  deckLabel: 'A' | 'B'
  eqGains: { low: number; mid: number; high: number }
  openEqBands?: EqBand[]
  eqDialOpen?: boolean
  focusedEqBand?: EqBand
  isMixing?: boolean
  mixRole?: 'outgoing' | 'incoming' | null
  onOpenEqDial: (band: EqBand, opts?: { anchorEl?: HTMLElement | null }) => void
  onSetEqGain?: (band: EqBand, gain: number) => void
  onEqDragStart?: (band: EqBand, anchorEl: HTMLElement) => void
  onEqDragEnd?: (band: EqBand) => void
  className?: string
  /** Compact knobs for narrow mixer strips (phones / stacked layout). */
  size?: 'default' | 'compact'
}) {
  return (
    <div
      className={`flex items-center ${size === 'compact' ? 'gap-0.5' : 'gap-0.5'} ${className}`}
      data-eq-dials={deckLabel.toLowerCase()}
      data-eq-size={size}
    >
      {(['low', 'mid', 'high'] as const).map((band) => (
        <MiniEqDial
          key={band}
          deckLabel={deckLabel}
          band={band}
          gain={eqGains[band]}
          active={openEqBands.includes(band) || (eqDialOpen && focusedEqBand === band)}
          isMixing={isMixing}
          mixRole={mixRole}
          size={size}
          onSelect={(el) => onOpenEqDial(band, { anchorEl: el })}
          onSetGain={onSetEqGain ? (gain) => onSetEqGain(band, gain) : undefined}
          onDragStart={onEqDragStart ? (el) => onEqDragStart(band, el) : undefined}
          onDragEnd={onEqDragEnd ? () => onEqDragEnd(band) : undefined}
        />
      ))}
    </div>
  )
}

/** Tap opens the fader popup, press-and-drag trims live, double-click resets to 0 dB. */
function MiniEqDial({
  deckLabel,
  band,
  gain,
  active,
  isMixing = false,
  mixRole = null,
  size = 'default',
  onSelect,
  onSetGain,
  onDragStart,
  onDragEnd,
}: {
  deckLabel: 'A' | 'B'
  band: EqBand
  gain: number
  active?: boolean
  isMixing?: boolean
  mixRole?: 'outgoing' | 'incoming' | null
  size?: 'default' | 'compact'
  onSelect: (anchorEl: HTMLElement) => void
  onSetGain?: (gain: number) => void
  onDragStart?: (anchorEl: HTMLElement) => void
  onDragEnd?: () => void
}) {
  const compact = size === 'compact'
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    startGain: number
    moved: boolean
  } | null>(null)
  const suppressClickRef = useRef(false)
  const draggable = Boolean(onSetGain)

  const endDrag = (pointerId: number, el: HTMLElement) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== pointerId) return
    dragRef.current = null
    if (el.hasPointerCapture?.(pointerId)) el.releasePointerCapture(pointerId)
    if (!drag.moved) return
    suppressClickRef.current = true
    onDragEnd?.()
  }

  return (
    <button
      type="button"
      onPointerDown={(e) => {
        if (!draggable || e.button !== 0) return
        dragRef.current = {
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          startGain: gain,
          moved: false,
        }
        e.currentTarget.setPointerCapture?.(e.pointerId)
      }}
      onPointerMove={(e) => {
        const drag = dragRef.current
        if (!drag || drag.pointerId !== e.pointerId) return
        const deltaY = e.clientY - drag.startY
        if (!drag.moved) {
          if (!isEqDialDrag(e.clientX - drag.startX, deltaY)) return
          drag.moved = true
          onDragStart?.(e.currentTarget)
        }
        e.preventDefault()
        onSetGain?.(eqGainFromDrag({ startGain: drag.startGain, deltaY, fine: e.shiftKey }))
      }}
      onPointerUp={(e) => endDrag(e.pointerId, e.currentTarget)}
      onPointerCancel={(e) => endDrag(e.pointerId, e.currentTarget)}
      onClick={(e) => {
        // A drag already changed the gain — do not also toggle the popup.
        if (suppressClickRef.current) {
          suppressClickRef.current = false
          return
        }
        // Both clicks of a double-click land here, so the toggle cancels itself out
        // and a reset leaves the popup exactly as it was.
        onSelect(e.currentTarget)
      }}
      onDoubleClick={(e) => {
        if (!onSetGain) return
        e.preventDefault()
        onSetGain(0)
      }}
      onKeyDown={(e) => {
        if (!onSetGain) return
        const step = e.key === 'ArrowUp' ? 1 : e.key === 'ArrowDown' ? -1 : 0
        if (!step) return
        e.preventDefault()
        onSetGain(nudgeEqGain(gain, e.shiftKey ? step * 0.25 : step))
      }}
      style={draggable ? { touchAction: 'none' } : undefined}
      className={`flex flex-col items-center rounded-md transition touch-manipulation ${
        compact ? 'gap-0.5 px-0.5 py-0.5' : 'gap-0.5 px-0.5 py-0.5'
      } ${
        active
          ? 'ring-1 ring-amber-500/50 bg-gray-800/60'
          : isMixing
            ? mixRole === 'outgoing'
              ? 'ring-1 ring-amber-500/35 bg-amber-950/30'
              : 'ring-1 ring-sky-500/35 bg-sky-950/30'
            : ''
      }`}
      aria-label={`Deck ${deckLabel} ${eqBandLabel(band)} EQ ${formatEqGain(gain)}${
        gain > -39.5 ? ' dB' : ''
      }`}
      title={
        draggable
          ? `${eqBandLabel(band)} EQ — tap to open, drag to trim, double-click to reset`
          : `${eqBandLabel(band)} EQ`
      }
      data-eq-dial={band}
    >
      <div
        className={`relative flex-shrink-0 select-none ${compact ? 'h-8 w-8' : 'h-9 w-9'}`}
      >
        <div
          className={`absolute inset-0 rounded-full border-gray-700 bg-gray-800 shadow-inner ${
            compact ? 'border' : 'border-2'
          }`}
        >
          <div
            className={`absolute rounded-full bg-gradient-to-br ${eqKnobGradient(band)} shadow-lg ${
              compact ? 'inset-0.5' : 'inset-1'
            }`}
            style={{ transform: `rotate(${eqKnobRotation(gain)}deg)` }}
          >
            <div
              className={`absolute left-1/2 -translate-x-1/2 rounded-full bg-white shadow-sm ${
                compact ? 'top-0.5 h-0.5 w-0.5' : 'top-1 h-1 w-1'
              }`}
            />
            <div
              className={`absolute left-1/2 -translate-x-1/2 rounded-full bg-white/80 ${
                compact ? 'top-0 h-1.5 w-px' : 'top-0 h-2 w-0.5'
              }`}
            />
          </div>
          <div className="absolute inset-0 pointer-events-none">
            <div
              className={`absolute left-1/2 top-0 -translate-x-1/2 bg-gray-400 ${
                compact ? 'h-0.5 w-px' : 'h-1 w-0.5'
              }`}
            />
          </div>
        </div>
      </div>
      <span
        className={`font-medium leading-none text-gray-400 ${
          compact ? 'text-[8px]' : 'text-[8px]'
        }`}
      >
        {eqBandLabel(band)}
      </span>
    </button>
  )
}

export function DeckTempoControls({
  deckLabel,
  tempoPct,
  adjustedBpm,
  origBpm,
  isDetectingBPM,
  tempoDialOpen,
  isMixing = false,
  mixRole = null,
  tapTempoTaps,
  tapTempoBPM,
  tapTempoSectionsCompleted = 0,
  canEditOrigBpm = false,
  onBPMUpdate,
  onOpenTempoDial,
  onTapTempo,
  onTempoChange,
  onTempoDragStart,
  onTempoDragEnd,
  peerDeckLabel,
  peerMatchBpm = null,
  onMatchPeerTempo,
  className = '',
  forceDetails = false,
  reverse = false,
}: {
  deckLabel: 'A' | 'B'
  tempoPct: number
  adjustedBpm: number | null
  origBpm: number | null
  isDetectingBPM: boolean
  tempoDialOpen: boolean
  isMixing?: boolean
  mixRole?: 'outgoing' | 'incoming' | null
  tapTempoTaps: number[]
  tapTempoBPM: number | null
  tapTempoSectionsCompleted?: number
  canEditOrigBpm?: boolean
  onBPMUpdate?: (bpm: number) => Promise<void> | void
  onOpenTempoDial: (opts?: { anchorEl?: HTMLElement | null }) => void
  onTapTempo: () => void
  /** Live tempo % trim (same range as the vertical fader). */
  onTempoChange?: (tempoPct: number) => void
  onTempoDragStart?: (anchorEl: HTMLElement) => void
  onTempoDragEnd?: () => void
  peerDeckLabel?: 'A' | 'B'
  /** BPM this deck lands on when matched to the other deck (half/double aware). */
  peerMatchBpm?: number | null
  onMatchPeerTempo?: () => void
  className?: string
  forceDetails?: boolean
  reverse?: boolean
}) {
  const [editingBpm, setEditingBpm] = useState(false)
  const [bpmDraft, setBpmDraft] = useState('')
  const [savingBpm, setSavingBpm] = useState(false)
  const tempoDragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    startPct: number
    moved: boolean
  } | null>(null)
  const suppressTempoClickRef = useRef(false)
  const tempoDraggable = Boolean(onTempoChange)

  const startBpmEdit = () => {
    setEditingBpm(true)
    setBpmDraft(origBpm?.toString() || '')
  }

  const cancelBpmEdit = () => {
    setEditingBpm(false)
    setBpmDraft('')
  }

  const saveBpmEdit = async () => {
    const bpmValue = parseInt(bpmDraft, 10)
    if (isNaN(bpmValue) || bpmValue < 30 || bpmValue > 300) {
      alert('BPM must be between 30 and 300')
      return
    }
    if (!onBPMUpdate) {
      cancelBpmEdit()
      return
    }
    setSavingBpm(true)
    try {
      await onBPMUpdate(bpmValue)
      setEditingBpm(false)
      setBpmDraft('')
    } catch (error: unknown) {
      console.error('Error updating BPM:', error)
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to update BPM. Please try again.'
      alert(errorMessage)
    } finally {
      setSavingBpm(false)
    }
  }

  const matchBpm = onMatchPeerTempo && peerMatchBpm != null && peerMatchBpm > 0 ? peerMatchBpm : null
  const canMatchPeer = matchBpm != null
  const otherDeckLabel = peerDeckLabel ?? (deckLabel === 'A' ? 'B' : 'A')
  const adjTitle = [
    'Tap to open tempo fader',
    tempoDraggable ? 'drag to trim' : null,
    canMatchPeer ? `double-click to match deck ${otherDeckLabel} (${matchBpm.toFixed(0)} BPM)` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const endTempoDrag = (pointerId: number, el: HTMLElement) => {
    const drag = tempoDragRef.current
    if (!drag || drag.pointerId !== pointerId) return
    tempoDragRef.current = null
    if (el.hasPointerCapture?.(pointerId)) el.releasePointerCapture(pointerId)
    if (!drag.moved) return
    suppressTempoClickRef.current = true
    onTempoDragEnd?.()
  }

  const onBpmKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      void saveBpmEdit()
    } else if (e.key === 'Escape') {
      cancelBpmEdit()
    }
  }

  return (
    <div
      className={`flex min-w-0 flex-wrap items-stretch gap-1.5 sm:gap-2 ${reverse ? 'flex-row-reverse' : ''} ${className}`}
    >
      {/* Compact BPM chip — tablet strip only when forceDetails; phones use deck-header chip. */}
      <button
        type="button"
        onClick={(e) => onOpenTempoDial({ anchorEl: e.currentTarget })}
        className={`flex shrink-0 flex-col justify-center rounded-lg text-left transition touch-manipulation ${
          forceDetails
            ? 'hidden px-1.5 py-1 md:flex xl:hidden'
            : 'px-2.5 py-1.5 md:hidden'
        } ${
          isMixing
            ? mixRole === 'outgoing'
              ? 'bg-amber-500/15 ring-1 ring-amber-400/45'
              : 'bg-sky-500/15 ring-1 ring-sky-400/45'
            : tempoDialOpen || Math.abs(tempoPct) > 0.1
              ? 'bg-yellow-500/15 ring-1 ring-yellow-500/40'
              : 'bg-gray-800/80'
        }`}
        aria-expanded={tempoDialOpen}
        aria-haspopup="dialog"
        aria-label={`Deck ${deckLabel} tempo`}
      >
        <div className="text-[8px] uppercase tracking-wide text-gray-500 sm:text-[9px]">BPM</div>
        <div
          className={`font-mono font-bold leading-tight ${
            forceDetails ? 'text-xs' : 'text-sm'
          } ${Math.abs(tempoPct) > 0.1 ? 'text-yellow-400' : 'text-white'}`}
        >
          {isDetectingBPM ? (
            <span className="text-[10px] text-gray-400">…</span>
          ) : (
            adjustedBpm?.toFixed(0) || origBpm?.toFixed(0) || '---'
          )}
        </div>
      </button>

      <div
        className={`${
          forceDetails ? 'hidden xl:flex' : 'hidden md:flex'
        } ${reverse ? 'flex-row-reverse' : ''} shrink-0 items-center gap-2`}
      >
        <div className="flex shrink-0 items-center gap-2.5 rounded-lg bg-gray-800/80 px-2.5 py-1.5">
          <div className="text-center">
            <div className="text-[9px] uppercase tracking-wide text-gray-500">Orig</div>
            {canEditOrigBpm && editingBpm ? (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="30"
                  max="300"
                  value={bpmDraft}
                  onChange={(e) => setBpmDraft(e.target.value)}
                  onKeyDown={onBpmKeyDown}
                  className="w-14 rounded border border-gray-600 bg-gray-700 px-1 py-0.5 text-center font-mono text-sm font-bold text-white focus:border-blue-500 focus:outline-none"
                  autoFocus
                  disabled={savingBpm}
                  aria-label={`Edit deck ${deckLabel} BPM`}
                />
                <button
                  type="button"
                  onClick={() => void saveBpmEdit()}
                  disabled={savingBpm}
                  className="rounded bg-blue-600 px-1.5 py-0.5 text-[10px] text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingBpm ? '…' : '✓'}
                </button>
                <button
                  type="button"
                  onClick={cancelBpmEdit}
                  disabled={savingBpm}
                  className="rounded bg-gray-700 px-1.5 py-0.5 text-[10px] text-gray-300 hover:bg-gray-600 disabled:opacity-50"
                >
                  ✕
                </button>
              </div>
            ) : canEditOrigBpm ? (
              <button
                type="button"
                className="group relative z-10 font-mono text-sm font-bold text-white transition-colors hover:text-blue-400"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  startBpmEdit()
                }}
                title="Click to edit BPM"
              >
                {isDetectingBPM ? (
                  <span className="text-xs text-gray-400">…</span>
                ) : (
                  <>
                    {origBpm?.toFixed(0) || '---'}
                    <span className="ml-0.5 text-[10px] text-gray-500 opacity-0 group-hover:opacity-100">
                      ✎
                    </span>
                  </>
                )}
              </button>
            ) : (
              <div className="font-mono text-sm font-bold text-white">
                {isDetectingBPM ? (
                  <span className="text-xs text-gray-400">…</span>
                ) : (
                  origBpm?.toFixed(0) || '---'
                )}
              </div>
            )}
          </div>
          <div className="h-7 w-px bg-gray-700" aria-hidden />
          <button
            type="button"
            onPointerDown={(e) => {
              if (!tempoDraggable || e.button !== 0) return
              tempoDragRef.current = {
                pointerId: e.pointerId,
                startX: e.clientX,
                startY: e.clientY,
                startPct: tempoPct,
                moved: false,
              }
              e.currentTarget.setPointerCapture?.(e.pointerId)
            }}
            onPointerMove={(e) => {
              const drag = tempoDragRef.current
              if (!drag || drag.pointerId !== e.pointerId) return
              const deltaY = e.clientY - drag.startY
              if (!drag.moved) {
                if (!isTempoDialDrag(e.clientX - drag.startX, deltaY)) return
                drag.moved = true
                onTempoDragStart?.(e.currentTarget)
              }
              e.preventDefault()
              onTempoChange?.(
                tempoPctFromDrag({ startPct: drag.startPct, deltaY, fine: e.shiftKey }),
              )
            }}
            onPointerUp={(e) => endTempoDrag(e.pointerId, e.currentTarget)}
            onPointerCancel={(e) => endTempoDrag(e.pointerId, e.currentTarget)}
            onClick={(e) => {
              if (suppressTempoClickRef.current) {
                suppressTempoClickRef.current = false
                return
              }
              onOpenTempoDial({ anchorEl: e.currentTarget })
            }}
            onDoubleClick={(e) => {
              if (!canMatchPeer) return
              e.preventDefault()
              e.stopPropagation()
              onMatchPeerTempo?.()
            }}
            onKeyDown={(e) => {
              if (!onTempoChange) return
              const step = e.key === 'ArrowUp' ? 1 : e.key === 'ArrowDown' ? -1 : 0
              if (!step) return
              e.preventDefault()
              onTempoChange(nudgeTempoPct(tempoPct, e.shiftKey ? step * 0.25 : step))
            }}
            style={tempoDraggable ? { touchAction: 'none' } : undefined}
            className={`text-center transition touch-manipulation rounded-md px-0.5 -mx-0.5 ${
              isMixing
                ? mixRole === 'outgoing'
                  ? 'bg-amber-500/15 ring-1 ring-amber-400/45'
                  : 'bg-sky-500/15 ring-1 ring-sky-400/45'
                : tempoDialOpen
                  ? 'bg-yellow-500/15 ring-1 ring-yellow-500/40'
                  : 'hover:bg-gray-700/50'
            }`}
            aria-expanded={tempoDialOpen}
            aria-haspopup="dialog"
            aria-label={
              canMatchPeer
                ? `Deck ${deckLabel} adjusted BPM — tap to open, drag to trim, double-click to match deck ${otherDeckLabel}`
                : `Deck ${deckLabel} adjusted BPM — tap to open${tempoDraggable ? ', drag to trim' : ''}`
            }
            title={adjTitle}
          >
            <div className="text-[9px] uppercase tracking-wide text-gray-500">Adj</div>
            <div
              className={`font-mono text-sm font-bold ${
                Math.abs(tempoPct) > 0.1 ? 'text-yellow-400' : 'text-white'
              }`}
            >
              {adjustedBpm?.toFixed(0) || '---'}
            </div>
          </button>
        </div>
        {!forceDetails && (
        <button
          type="button"
          onClick={onTapTempo}
          className={`flex h-[43px] min-w-[2.75rem] items-center justify-center rounded-xl px-3 text-xs font-semibold transition-all active:scale-95 touch-manipulation ${
            tapTempoTaps.length > 0 || tapTempoSectionsCompleted > 0
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
          }`}
          title="Tap 16 beats to measure BPM (does not change playback)"
        >
          {formatTapTempoButtonLabel({
            taps: tapTempoTaps,
            bpm: tapTempoBPM,
            sectionsCompleted: tapTempoSectionsCompleted,
          })}
        </button>
        )}
      </div>
    </div>
  )
}

function CueMenuRow({
  label,
  labelClass,
  timeSec,
  emptyLabel = 'Empty · set here',
  selected = false,
  onSelect,
  onDelete,
  deleteLabel,
  deleteAttr,
}: {
  label: string
  labelClass: string
  timeSec?: number
  emptyLabel?: string
  selected?: boolean
  onSelect: () => void
  onDelete?: () => void
  deleteLabel?: string
  deleteAttr?: Record<string, string>
}) {
  const set = typeof timeSec === 'number'
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        role="menuitem"
        aria-current={selected ? 'true' : undefined}
        onClick={onSelect}
        className={`flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[11px] text-gray-200 hover:bg-gray-800 ${
          selected ? 'bg-gray-800 ring-1 ring-white/20' : ''
        }`}
      >
        <span className={labelClass}>{label}</span>
        <span className={set ? 'tabular-nums text-gray-300' : 'text-gray-500'}>
          {set ? formatClock(timeSec) : emptyLabel}
        </span>
      </button>
      {set && onDelete ? (
        <button
          type="button"
          aria-label={deleteLabel}
          title={deleteLabel}
          {...deleteAttr}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onDelete()
          }}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[11px] text-gray-500 hover:bg-gray-800 hover:text-rose-300"
        >
          ✕
        </button>
      ) : null}
    </div>
  )
}

export function DeckTransportControls({
  deckLabel,
  idjActive = false,
  isLive,
  trackTitle,
  hasMemoryCue = false,
  isPlaying = false,
  isLoading = false,
  error = null,
  canSkip = false,
  continuousPlay = false,
  cueJumpPlay = false,
  onSetCue,
  onClearCue,
  onLaunchCue,
  onPrevious,
  onNext,
  onTogglePlay,
  onToggleContinuousPlay,
  hotCues,
  onLaunchHotCue,
  onSetHotCue,
  onClearHotCue,
  onClearAllHotCues,
  memoryCueSec = null,
  trackCues = [],
  onJumpTrackCue,
  activeCue = null,
  onSelectActiveCue,
  className = '',
  compact = false,
}: {
  deckLabel: 'A' | 'B'
  idjActive?: boolean
  isLive: boolean
  trackTitle?: string
  hasMemoryCue?: boolean
  isPlaying?: boolean
  isLoading?: boolean
  error?: string | null
  canSkip?: boolean
  continuousPlay?: boolean
  cueJumpPlay?: boolean
  onSetCue?: () => void
  onClearCue?: () => void
  onLaunchCue?: () => void
  onPrevious?: () => void
  onNext?: () => void
  onTogglePlay?: () => void
  onToggleContinuousPlay?: () => void
  hotCues?: HotCueSlots
  onLaunchHotCue?: (slot: HotCueSlot) => void
  onSetHotCue?: (slot: HotCueSlot) => void
  onClearHotCue?: (slot: HotCueSlot) => void
  onClearAllHotCues?: () => void
  memoryCueSec?: number | null
  trackCues?: DeckJumpCue[]
  onJumpTrackCue?: (timeSec: number) => void
  activeCue?: IDJActiveCue | null
  onSelectActiveCue?: (cue: IDJActiveCue) => void
  className?: string
  /** Tighter hit targets for stacked mobile mixer strips. */
  compact?: boolean
}) {
  const playButtonRef = useRef<HTMLButtonElement>(null)
  const cueButtonRef = useRef<HTMLButtonElement>(null)
  const menuElRef = useRef<HTMLDivElement | null>(null)
  const cueMenuElRef = useRef<HTMLDivElement | null>(null)
  const longPressRef = useRef<number | null>(null)
  const cueHoldRef = useRef<number | null>(null)
  const openedByHoldRef = useRef(false)
  const cueOpenedByHoldRef = useRef(false)
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null)
  const [cueMenuAnchor, setCueMenuAnchor] = useState<{ x: number; y: number } | null>(null)
  const menuOpen = Boolean(idjActive && onToggleContinuousPlay && menuAnchor)
  const cueMenuOpen = Boolean(idjActive && onLaunchHotCue && cueMenuAnchor)
  const menuClamp = useClampedFixedMenuPosition(menuOpen, menuAnchor, {
    width: 288,
    height: 120,
  }, { externalRef: menuElRef })
  const cueMenuClamp = useClampedFixedMenuPosition(cueMenuOpen, cueMenuAnchor, {
    width: 256,
    height: 440,
  }, { externalRef: cueMenuElRef })

  const closeMenu = () => setMenuAnchor(null)
  const closeCueMenu = () => setCueMenuAnchor(null)

  const openMenuFromEl = (el: HTMLElement) => {
    const rect = el.getBoundingClientRect()
    setMenuAnchor({ x: rect.left, y: Math.max(8, rect.top - 128) })
  }

  const openCueMenuFromEl = (el: HTMLElement) => {
    const rect = el.getBoundingClientRect()
    setCueMenuAnchor({ x: rect.left, y: Math.max(8, rect.top - 448) })
  }

  const clearHold = () => {
    if (longPressRef.current != null) {
      window.clearTimeout(longPressRef.current)
      longPressRef.current = null
    }
  }

  const clearCueHold = () => {
    if (cueHoldRef.current != null) {
      window.clearTimeout(cueHoldRef.current)
      cueHoldRef.current = null
    }
  }

  useEffect(() => {
    if (!menuOpen && !cueMenuOpen) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (menuElRef.current?.contains(target) || playButtonRef.current?.contains(target)) {
        /* keep continuous-play menu */
      } else {
        closeMenu()
      }
      if (cueMenuElRef.current?.contains(target) || cueButtonRef.current?.contains(target)) {
        /* keep hot-cue menu */
      } else {
        closeCueMenu()
      }
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu()
        closeCueMenu()
      }
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen, cueMenuOpen])

  const playLabel = isPlaying ? 'Pause' : 'Play'
  const playDisabled = isLoading || Boolean(error) || (!isLive && !trackTitle)
  const hotCueSlots = hotCues ?? {}
  const anyHotCue = hasAnyHotCue(hotCueSlots)
  const resolvedActive = resolveIDJActiveCue({
    active: activeCue,
    memorySec: memoryCueSec,
    hotSlots: hotCueSlots,
    trackCues,
  })
  const canLaunchCue = Boolean(resolvedActive)
  const activeKind = resolvedActive?.cue.kind
  const continuousHint = continuousPlay
    ? 'Continuous play on · right-click to change'
    : 'Right-click for continuous play'

  return (
    <div
      className={`flex shrink-0 items-center ${compact ? 'gap-0.5' : 'gap-0.5'} ${className}`}
      data-deck-transport={deckLabel}
      data-transport-compact={compact ? 'true' : undefined}
    >
      {idjActive && (
        <button
          type="button"
          onClick={onSetCue}
          onContextMenu={(e) => {
            if (!onClearCue || !hasMemoryCue) return
            e.preventDefault()
            onClearCue()
          }}
          disabled={!trackTitle}
          className={`flex items-center justify-center rounded-lg font-semibold uppercase tracking-wide transition-colors touch-manipulation disabled:cursor-not-allowed disabled:opacity-40 ${
            compact
              ? 'min-h-[36px] min-w-[32px] px-1.5 text-[10px]'
              : 'min-h-[36px] min-w-[36px] text-[10px]'
          } ${
            hasMemoryCue
              ? 'bg-amber-500/20 text-amber-200 hover:bg-amber-500/30'
              : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white'
          }`}
          title={
            hasMemoryCue
              ? `Set cue on deck ${deckLabel} · right-click to unset`
              : `Set cue on deck ${deckLabel}`
          }
          aria-label={
            hasMemoryCue
              ? `Set cue deck ${deckLabel}, right-click to unset`
              : `Set cue deck ${deckLabel}`
          }
        >
          SET
        </button>
      )}
      {isLive || idjActive ? (
        <>
          <button
            type="button"
            onClick={onPrevious}
            className={`flex items-center justify-center rounded-lg text-white transition-colors active:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 touch-manipulation ${
              compact ? 'min-h-[36px] min-w-[32px]' : 'min-h-[44px] min-w-[44px]'
            }`}
            disabled={!canSkip}
            aria-label="Previous track"
          >
            <FaStepBackward className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
          </button>
          <button
            ref={playButtonRef}
            type="button"
            onClick={(e) => {
              if (openedByHoldRef.current) {
                openedByHoldRef.current = false
                return
              }
              if (idjActive && onToggleContinuousPlay && (e.shiftKey || e.altKey)) {
                e.preventDefault()
                openMenuFromEl(e.currentTarget)
                return
              }
              if (playDisabled) return
              onTogglePlay?.()
            }}
            onContextMenu={(e) => {
              if (!idjActive || !onToggleContinuousPlay) return
              e.preventDefault()
              e.stopPropagation()
              openMenuFromEl(e.currentTarget)
            }}
            onPointerDown={(e) => {
              if (!idjActive || !onToggleContinuousPlay || e.button !== 0) return
              clearHold()
              const el = e.currentTarget
              longPressRef.current = window.setTimeout(() => {
                openedByHoldRef.current = true
                openMenuFromEl(el)
              }, 500)
            }}
            onPointerUp={clearHold}
            onPointerCancel={clearHold}
            onPointerLeave={clearHold}
            className={`relative flex shrink-0 items-center justify-center rounded-full bg-white text-black transition-colors active:bg-gray-200 touch-manipulation ${
              compact ? 'min-h-[40px] min-w-[40px]' : 'min-h-[48px] min-w-[48px]'
            } ${playDisabled ? 'cursor-not-allowed opacity-50' : ''} ${
              continuousPlay ? 'ring-2 ring-violet-400 ring-offset-2 ring-offset-black' : ''
            }`}
            aria-label={
              idjActive
                ? `${playLabel} deck ${deckLabel}. ${continuousHint}`
                : playLabel
            }
            title={idjActive ? `${playLabel} · ${continuousHint}` : playLabel}
            aria-haspopup={idjActive && onToggleContinuousPlay ? 'dialog' : undefined}
            aria-expanded={idjActive && onToggleContinuousPlay ? menuOpen : undefined}
            aria-disabled={playDisabled}
            disabled={!idjActive && playDisabled}
            data-deck-play={deckLabel}
            data-continuous-play={continuousPlay ? 'on' : 'off'}
          >
            {isPlaying ? (
              <FaPause className={compact ? 'h-4 w-4' : 'h-4 w-4'} />
            ) : (
              <FaPlay className={compact ? 'ml-0.5 h-4 w-4' : 'ml-0.5 h-4 w-4'} />
            )}
          </button>
          <button
            type="button"
            onClick={onNext}
            className={`flex items-center justify-center rounded-lg text-white transition-colors active:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 touch-manipulation ${
              compact ? 'min-h-[36px] min-w-[32px]' : 'min-h-[44px] min-w-[44px]'
            }`}
            disabled={!canSkip}
            aria-label="Next track"
            data-deck-next={deckLabel}
          >
            <FaStepForward className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
          </button>
        </>
      ) : (
        <div
          className={`flex items-center justify-center rounded-full border border-gray-700 bg-gray-900/80 px-2 text-[9px] uppercase tracking-wide text-gray-500 ${
            compact ? 'min-h-[40px] min-w-[40px]' : 'min-h-[48px] min-w-[48px] px-3'
          }`}
          aria-hidden
        >
          Cued
        </div>
      )}
      {idjActive && (
        <button
          ref={cueButtonRef}
          type="button"
          onClick={(e) => {
            if (cueOpenedByHoldRef.current) {
              cueOpenedByHoldRef.current = false
              return
            }
            if (onLaunchHotCue && (e.shiftKey || e.altKey)) {
              e.preventDefault()
              openCueMenuFromEl(e.currentTarget)
              return
            }
            if (!canLaunchCue) return
            onLaunchCue?.()
          }}
          onContextMenu={(e) => {
            if (!onLaunchHotCue) return
            e.preventDefault()
            e.stopPropagation()
            openCueMenuFromEl(e.currentTarget)
          }}
          onPointerDown={(e) => {
            if (!onLaunchHotCue || e.button !== 0) return
            clearCueHold()
            const el = e.currentTarget
            cueHoldRef.current = window.setTimeout(() => {
              cueOpenedByHoldRef.current = true
              openCueMenuFromEl(el)
            }, 500)
          }}
          onPointerUp={clearCueHold}
          onPointerCancel={clearCueHold}
          onPointerLeave={clearCueHold}
          aria-disabled={!canLaunchCue}
          aria-haspopup={onLaunchHotCue ? 'menu' : undefined}
          aria-expanded={onLaunchHotCue ? cueMenuOpen : undefined}
          className={`flex items-center justify-center rounded-lg font-semibold uppercase tracking-wide transition-colors touch-manipulation ${
            compact
              ? 'min-h-[36px] min-w-[32px] px-1.5 text-[10px]'
              : 'min-h-[36px] min-w-[36px] text-[10px]'
          } ${!canLaunchCue ? 'cursor-default opacity-40' : ''} ${
            activeKind === 'hot'
              ? 'bg-violet-500/20 text-violet-200 hover:bg-violet-500/30'
              : activeKind === 'track'
                ? 'bg-sky-500/20 text-sky-200 hover:bg-sky-500/30'
                : canLaunchCue
                  ? 'bg-amber-500/20 text-amber-200 hover:bg-amber-500/30'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white'
          }`}
          title={
            resolvedActive
              ? cueJumpPlay
                ? `Jump to ${resolvedActive.label} and play deck ${deckLabel} · right-click to choose`
                : `Jump to ${resolvedActive.label} and pause deck ${deckLabel} · right-click to choose`
              : `Right-click to choose memory, hot, and track cues on deck ${deckLabel}`
          }
          aria-label={
            resolvedActive
              ? `Launch ${resolvedActive.label} on deck ${deckLabel}, right-click for cue list`
              : `Launch cue deck ${deckLabel}, right-click for cue list`
          }
          data-deck-cue={deckLabel}
          data-active-cue={idjActiveCueKey(resolvedActive?.cue ?? null)}
        >
          CUE
        </button>
      )}
      {cueMenuOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={cueMenuClamp.ref}
          {...cueMenuClamp.rootProps}
          role="menu"
          aria-label={`Deck ${deckLabel} hot cues`}
          data-deck-hot-cue-menu=""
          className="fixed w-[min(16rem,calc(100vw-1rem))] overflow-y-auto overscroll-y-contain rounded-lg border border-gray-700 bg-gray-950 px-2 py-2 shadow-2xl"
          style={cueMenuClamp.style}
          onContextMenu={(e) => e.preventDefault()}
        >
          <p className="px-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            Memory
          </p>
          <div className="space-y-1">
            <CueMenuRow
              label="Memory / SET"
              labelClass="font-semibold text-amber-200"
              timeSec={typeof memoryCueSec === 'number' ? memoryCueSec : undefined}
              selected={sameIDJActiveCue(resolvedActive?.cue, { kind: 'memory' })}
              onSelect={() => {
                onSelectActiveCue?.({ kind: 'memory' })
                if (typeof memoryCueSec === 'number') onLaunchCue?.()
                else onSetCue?.()
                closeCueMenu()
              }}
              onDelete={onClearCue}
              deleteLabel="Delete memory cue"
              deleteAttr={{ 'data-delete-memory-cue': '' }}
            />
          </div>
          <p className="px-1.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            Hot cues
          </p>
          <div className="space-y-1">
            {HOT_CUE_SLOTS.map((slot) => {
              const timeSec = hotCueSlots[slot]
              return (
                <CueMenuRow
                  key={slot}
                  label={`Hot ${slot}`}
                  labelClass="font-semibold text-violet-200"
                  timeSec={timeSec}
                  selected={sameIDJActiveCue(resolvedActive?.cue, { kind: 'hot', slot })}
                  onSelect={() => {
                    onSelectActiveCue?.({ kind: 'hot', slot })
                    if (typeof timeSec === 'number') onLaunchHotCue?.(slot)
                    else onSetHotCue?.(slot)
                    closeCueMenu()
                  }}
                  onDelete={onClearHotCue ? () => onClearHotCue(slot) : undefined}
                  deleteLabel={`Delete hot cue ${slot}`}
                  deleteAttr={{ 'data-delete-hot-cue': String(slot) }}
                />
              )
            })}
          </div>
          {anyHotCue && (onClearAllHotCues || onClearHotCue) ? (
            <button
              type="button"
              data-clear-all-hot-cues=""
              className="mt-1.5 w-full rounded-md px-2 py-1 text-left text-[10px] text-gray-500 hover:bg-gray-800 hover:text-rose-300"
              onClick={() => {
                if (onClearAllHotCues) {
                  onClearAllHotCues()
                  return
                }
                for (const slot of HOT_CUE_SLOTS) {
                  if (typeof hotCueSlots[slot] === 'number') onClearHotCue?.(slot)
                }
              }}
            >
              Clear all hot cues
            </button>
          ) : null}
          {trackCues.length > 0 ? (
            <>
              <p className="px-1.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                Track cues
              </p>
              <div className="space-y-1">
                {trackCues.map((cue) => (
                  <CueMenuRow
                    key={cue.id}
                    label={cue.label}
                    labelClass="font-semibold text-sky-200"
                    timeSec={cue.timeSec}
                    selected={sameIDJActiveCue(resolvedActive?.cue, { kind: 'track', id: cue.id })}
                    onSelect={() => {
                      onSelectActiveCue?.({ kind: 'track', id: cue.id })
                      onJumpTrackCue?.(cue.timeSec)
                      closeCueMenu()
                    }}
                  />
                ))}
              </div>
            </>
          ) : null}
        </div>,
        document.body,
      )}
      {menuOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuClamp.ref}
          {...menuClamp.rootProps}
          role="dialog"
          aria-label={`Deck ${deckLabel} continuous play`}
          data-deck-continuous-play-menu=""
          className="fixed w-[min(18rem,calc(100vw-1rem))] overflow-y-auto overscroll-y-contain rounded-lg border border-gray-700 bg-gray-950 px-3 py-2.5 shadow-2xl"
          style={menuClamp.style}
          onContextMenu={(e) => e.preventDefault()}
        >
          <label className="flex items-start gap-2 text-[11px] text-gray-300">
            <input
              type="checkbox"
              checked={continuousPlay}
              onChange={() => onToggleContinuousPlay?.()}
              className="mt-0.5 accent-violet-500"
            />
            <span>
              <span className="font-medium text-white">Continuous play</span>
              <span className="mt-0.5 block text-[10px] text-gray-500">
                When a deck ends, load the next track on that deck and keep going. Off stops that
                deck only.
              </span>
            </span>
          </label>
        </div>,
        document.body,
      )}
    </div>
  )
}

export default function DeckChannelStrip({
  deck,
  config,
  tempoPct,
  adjustedBpm,
  tempoDialOpen,
  eqDialOpen,
  focusedEqBand,
  openEqBands = [],
  onOpenTempoDial,
  onOpenEqDial,
  onSetEqGain,
  onEqDragStart,
  onEqDragEnd,
  onTapTempo,
  onTempoChange,
  onTempoDragStart,
  onTempoDragEnd,
  onBPMUpdate,
  peerDeckLabel,
  peerMatchBpm = null,
  onMatchPeerTempo,
  canEditOrigBpm = false,
  isPlaying = false,
  isLoading = false,
  error = null,
  canSkip = false,
  onPrevious,
  onNext,
  onTogglePlay,
  idjActive = false,
  hasMemoryCue = false,
  onSetCue,
  onLaunchCue,
  waveform,
  onLibraryTracksDrop,
  onSelectForMixer,
}: {
  deck: DeckChannelId
  config: DeckChannelConfig
  waveform?: ReactNode
  tempoPct: number
  adjustedBpm: number | null
  tempoDialOpen: boolean
  eqDialOpen: boolean
  focusedEqBand: EqBand
  openEqBands?: EqBand[]
  onOpenTempoDial: (opts?: { anchorEl?: HTMLElement | null }) => void
  onOpenEqDial: (band: EqBand, opts?: { anchorEl?: HTMLElement | null }) => void
  onSetEqGain?: (band: EqBand, gain: number) => void
  onEqDragStart?: (band: EqBand, anchorEl: HTMLElement) => void
  onEqDragEnd?: (band: EqBand) => void
  onTapTempo: () => void
  onTempoChange?: (tempoPct: number) => void
  onTempoDragStart?: (anchorEl: HTMLElement) => void
  onTempoDragEnd?: () => void
  onBPMUpdate?: (bpm: number) => Promise<void> | void
  peerDeckLabel?: 'A' | 'B'
  peerMatchBpm?: number | null
  onMatchPeerTempo?: () => void
  canEditOrigBpm?: boolean
  isPlaying?: boolean
  isLoading?: boolean
  error?: string | null
  canSkip?: boolean
  onPrevious?: () => void
  onNext?: () => void
  onTogglePlay?: () => void
  idjActive?: boolean
  hasMemoryCue?: boolean
  onSetCue?: () => void
  onLaunchCue?: () => void
  /** Drop library tracks onto the cue (non-live) deck. */
  onLibraryTracksDrop?: (trackIds: string[], tracks: Array<{ id: string; [key: string]: unknown }>) => void
  /** Mobile mixer: touching this deck selects its transport/EQ strip. */
  onSelectForMixer?: () => void
}) {
  const {
    deckLabel,
    trackTitle,
    trackArtist,
    trackAlbum,
    coverSrc,
    coverAlt,
    coverUnoptimized,
    mosaicCovers,
    detectedBPM,
    isDetectingBPM,
    tapTempoTaps,
    tapTempoBPM,
    tapTempoSectionsCompleted = 0,
    catalogBpm,
    trackGenre,
    trackKey,
    eqGains,
    isLive,
    isArmed = false,
    isMixing = false,
    mixRole = null,
    mixProgress = 0,
    filterOpenness = 1,
    pairHint = null,
    mixQualityGrade = null,
  } = config

  const filterActive = isMixing && filterOpenness < 0.92
  const qualityClass =
    mixQualityGrade === 'excellent'
      ? 'bg-emerald-500/20 text-emerald-300'
      : mixQualityGrade === 'good'
        ? 'bg-sky-500/20 text-sky-300'
        : mixQualityGrade === 'fair'
          ? 'bg-amber-500/20 text-amber-300'
          : mixQualityGrade === 'poor'
            ? 'bg-rose-500/20 text-rose-300'
            : ''

  const origBpm = catalogBpm ?? detectedBPM
  const mixPct = Math.round(Math.max(0, Math.min(1, mixProgress)) * 100)
  const [libraryDropActive, setLibraryDropActive] = useState(false)
  /** Only the cue (non-live) deck accepts library drops. */
  const acceptsLibraryDrop = Boolean(onLibraryTracksDrop) && !isLive

  /** Mobile mixer: BPM lives in the deck header (A right / B left), not the strip. */
  const mobileHeaderBpm = idjActive ? (
    <button
      type="button"
      onClick={(e) => onOpenTempoDial({ anchorEl: e.currentTarget })}
      className={`flex shrink-0 flex-col justify-center rounded-lg px-1.5 py-1 text-left transition touch-manipulation md:hidden ${
        isMixing
          ? mixRole === 'outgoing'
            ? 'bg-amber-500/15 ring-1 ring-amber-400/45'
            : 'bg-sky-500/15 ring-1 ring-sky-400/45'
          : tempoDialOpen || Math.abs(tempoPct) > 0.1
            ? 'bg-yellow-500/15 ring-1 ring-yellow-500/40'
            : 'bg-gray-800/80'
      }`}
      aria-expanded={tempoDialOpen}
      aria-haspopup="dialog"
      aria-label={`Deck ${deckLabel} tempo`}
      data-deck-header-bpm={deckLabel}
    >
      <div className="text-[8px] uppercase tracking-wide text-gray-500">BPM</div>
      <div
        className={`font-mono text-xs font-bold leading-tight ${
          Math.abs(tempoPct) > 0.1 ? 'text-yellow-400' : 'text-white'
        }`}
      >
        {isDetectingBPM ? (
          <span className="text-[10px] text-gray-400">…</span>
        ) : (
          adjustedBpm?.toFixed(0) || origBpm?.toFixed(0) || '---'
        )}
      </div>
    </button>
  ) : null

  const handleLibraryDragOver = (e: DragEvent) => {
    if (!acceptsLibraryDrop || !libraryDragHasTracks(e.dataTransfer)) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
    setLibraryDropActive(true)
  }

  const handleLibraryDragLeave = (e: DragEvent) => {
    const next = e.relatedTarget as Node | null
    if (next && e.currentTarget.contains(next)) return
    setLibraryDropActive(false)
  }

  const handleLibraryDrop = (e: DragEvent) => {
    if (!acceptsLibraryDrop) return
    const tracks = parseLibraryDragTracks(e.dataTransfer)
    const ids = tracks.length ? tracks.map((t) => t.id) : readLibraryDragTrackIds(e.dataTransfer)
    if (!ids.length) return
    e.preventDefault()
    e.stopPropagation()
    setLibraryDropActive(false)
    onLibraryTracksDrop?.(ids, tracks)
  }

  return (
    <div
      className={`relative flex flex-col gap-2 rounded-lg border px-2 py-2 transition-colors ${
        libraryDropActive
          ? 'border-sky-400/80 bg-sky-950/40 ring-1 ring-sky-400/50'
          : isMixing && mixRole === 'outgoing'
          ? 'border-amber-500/45 bg-amber-950/20 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.12)]'
          : isMixing && mixRole === 'incoming'
            ? 'border-sky-500/45 bg-sky-950/20 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.12)]'
            : isLive
              ? 'border-emerald-500/30 bg-gray-900/40'
              : isArmed
                ? 'border-sky-500/35 bg-gray-900/40'
                : 'border-gray-800 bg-gray-950/50'
      }`}
      data-deck={deck}
      data-cue-drop-target={acceptsLibraryDrop ? 'true' : undefined}
      onPointerDown={onSelectForMixer}
      onDragEnter={acceptsLibraryDrop ? handleLibraryDragOver : undefined}
      onDragOver={acceptsLibraryDrop ? handleLibraryDragOver : undefined}
      onDragLeave={acceptsLibraryDrop ? handleLibraryDragLeave : undefined}
      onDrop={acceptsLibraryDrop ? handleLibraryDrop : undefined}
    >
      {libraryDropActive && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-sky-950/55">
          <span className="rounded-md bg-sky-500/25 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-sky-100 ring-1 ring-sky-400/50">
            Drop to cue deck {deckLabel}
          </span>
        </div>
      )}
      {isMixing && (
        <div className="absolute inset-x-2 top-0 h-0.5 overflow-hidden rounded-full bg-gray-800/80">
          <div
            className={`h-full transition-[width] duration-75 ease-linear ${
              mixRole === 'outgoing' ? 'bg-amber-400/90' : 'bg-sky-400/90'
            }`}
            style={{ width: `${mixPct}%` }}
            role="progressbar"
            aria-valuenow={mixPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={
              mixRole === 'outgoing'
                ? `Deck ${deckLabel} mix out ${mixPct}%`
                : `Deck ${deckLabel} mix in ${mixPct}%`
            }
          />
        </div>
      )}
      {(coverSrc || mosaicCovers?.length || trackTitle) && (
        <div
          className={`flex min-w-0 items-center gap-2.5 ${
            deck === 'b' ? 'md:flex-row-reverse' : ''
          }`}
        >
          {(mosaicCovers?.length || coverSrc) && (
            <div className="relative hidden h-12 w-12 shrink-0 overflow-hidden rounded md:block">
              {mosaicCovers?.length ? (
                <CrateCoverMosaic covers={mosaicCovers} />
              ) : coverSrc ? (
                <Image
                  src={coverSrc}
                  alt={coverAlt || trackTitle || `Deck ${deckLabel} artwork`}
                  fill
                  className="object-cover"
                  unoptimized={coverUnoptimized}
                  sizes="48px"
                  quality={85}
                />
              ) : null}
            </div>
          )}
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <div
              className={`min-w-0 flex-1 overflow-hidden space-y-1 ${
                deck === 'b' ? 'md:text-right' : ''
              }`}
            >
            <div
              className={`flex min-w-0 items-center gap-2 overflow-hidden ${
                deck === 'b' ? 'md:flex-row-reverse' : ''
              }`}
            >
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                  isLive
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : isArmed
                      ? 'bg-sky-500/20 text-sky-300'
                      : 'bg-gray-800 text-gray-500'
                }`}
              >
                Deck {deckLabel}
                {isMixing && mixRole === 'outgoing'
                  ? ' · out'
                  : isMixing && mixRole === 'incoming'
                    ? ' · in'
                    : isArmed && !isLive
                      ? ' · cue'
                      : ''}
              </span>
              {mixQualityGrade && !isMixing && (
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide ${qualityClass}`}
                  title="Last blend sync quality"
                >
                  {mixQualityGrade}
                </span>
              )}
              {filterActive && (
                <span
                  className="shrink-0 rounded px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide bg-fuchsia-500/15 text-fuchsia-300"
                  title={`Filter ${Math.round(filterOpenness * 100)}% open`}
                >
                  FIL {Math.round(filterOpenness * 100)}%
                </span>
              )}
              {isMixing && (
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide ${
                    mixRole === 'outgoing'
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'bg-sky-500/20 text-sky-300'
                  }`}
                >
                  Mix {mixPct}%
                </span>
              )}
              {(trackTitle || trackArtist || trackAlbum) && (
                <p
                  className="min-w-0 flex-1 truncate text-sm leading-snug text-white"
                  data-deck-title={deckLabel}
                  title={[trackTitle, trackArtist, trackAlbum].filter(Boolean).join(' · ')}
                >
                  {trackTitle && <span className="font-medium">{trackTitle}</span>}
                  {trackArtist && (
                    <>
                      {trackTitle && (
                        <span className="mx-1.5 hidden text-gray-600 md:inline">·</span>
                      )}
                      <span className="hidden text-xs text-gray-400 md:inline">{trackArtist}</span>
                    </>
                  )}
                  {trackAlbum && (
                    <>
                      {(trackTitle || trackArtist) && (
                        <span className="mx-1.5 hidden text-gray-600 md:inline">·</span>
                      )}
                      <span className="hidden text-[10px] text-gray-500 md:inline">{trackAlbum}</span>
                    </>
                  )}
                </p>
              )}
            </div>
            {(origBpm || trackGenre || trackKey || pairHint) && (
              <div
                className={`hidden min-w-0 flex-wrap items-center gap-1.5 md:flex ${
                  deck === 'b' ? 'md:justify-end' : ''
                }`}
              >
                <BpmBadge bpm={origBpm} size="xs" />
                <GenreBadge genre={trackGenre} size="xs" />
                <KeyBadge keySignature={trackKey} size="xs" />
                {pairHint && (
                  <span
                    className="rounded border border-violet-500/30 bg-violet-950/40 px-1.5 py-0.5 text-[9px] font-medium tabular-nums text-violet-200"
                    title="Planned blend pair"
                  >
                    {pairHint}
                  </span>
                )}
              </div>
            )}
            </div>
            {mobileHeaderBpm}
          </div>
        </div>
      )}

      {waveform && (
        <div className="relative h-32 overflow-hidden rounded-md border border-gray-800/80 bg-black sm:h-36">
          {waveform}
        </div>
      )}

      {!idjActive && (
      <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2">
        <DeckTempoControls
          className="justify-self-start"
          deckLabel={deckLabel}
          tempoPct={tempoPct}
          adjustedBpm={adjustedBpm}
          origBpm={origBpm}
          isDetectingBPM={isDetectingBPM}
          tempoDialOpen={tempoDialOpen}
          isMixing={isMixing}
          mixRole={mixRole}
          tapTempoTaps={tapTempoTaps}
          tapTempoBPM={tapTempoBPM}
          tapTempoSectionsCompleted={tapTempoSectionsCompleted}
          canEditOrigBpm={canEditOrigBpm}
          onBPMUpdate={onBPMUpdate}
          onOpenTempoDial={onOpenTempoDial}
          onTapTempo={onTapTempo}
          onTempoChange={onTempoChange}
          onTempoDragStart={onTempoDragStart}
          onTempoDragEnd={onTempoDragEnd}
          peerDeckLabel={peerDeckLabel}
          peerMatchBpm={peerMatchBpm}
          onMatchPeerTempo={onMatchPeerTempo}
        />

        <DeckTransportControls
          className="justify-self-center"
          deckLabel={deckLabel}
          idjActive={idjActive}
          isLive={isLive}
          trackTitle={trackTitle}
          hasMemoryCue={hasMemoryCue}
          isPlaying={isPlaying}
          isLoading={isLoading}
          error={error}
          canSkip={canSkip}
          onSetCue={onSetCue}
          onLaunchCue={onLaunchCue}
        onPrevious={onPrevious}
        onNext={onNext}
        onTogglePlay={onTogglePlay}
      />

        <DeckEqDials
          className="justify-self-end"
          deckLabel={deckLabel}
          eqGains={eqGains}
          openEqBands={openEqBands}
          eqDialOpen={eqDialOpen}
          focusedEqBand={focusedEqBand}
          isMixing={isMixing}
          mixRole={mixRole}
          onOpenEqDial={onOpenEqDial}
          onSetEqGain={onSetEqGain}
          onEqDragStart={onEqDragStart}
          onEqDragEnd={onEqDragEnd}
        />
      </div>
      )}
    </div>
  )
}

export { formatEqGain, type EqBand }
