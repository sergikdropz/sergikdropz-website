'use client'

import { useState, type ReactNode } from 'react'
import Image from 'next/image'
import { FaPause, FaPlay, FaStepBackward, FaStepForward } from 'react-icons/fa'
import { formatTapTempoButtonLabel } from '@/lib/audio/beat-count'
import { BpmBadge, GenreBadge, KeyBadge } from '@/components/music/MusicBadges'

export type DeckChannelId = 'a' | 'b'

export type DeckChannelConfig = {
  deckLabel: 'A' | 'B'
  trackTitle?: string
  trackArtist?: string
  trackAlbum?: string
  coverSrc?: string
  coverAlt?: string
  coverUnoptimized?: boolean
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

function MiniEqDial({
  band,
  gain,
  active,
  isMixing = false,
  mixRole = null,
  onSelect,
}: {
  band: EqBand
  gain: number
  active?: boolean
  isMixing?: boolean
  mixRole?: 'outgoing' | 'incoming' | null
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex flex-col items-center gap-0.5 rounded-md px-0.5 py-0.5 transition touch-manipulation ${
        active
          ? 'ring-1 ring-amber-500/50 bg-gray-800/60'
          : isMixing
            ? mixRole === 'outgoing'
              ? 'ring-1 ring-amber-500/35 bg-amber-950/30'
              : 'ring-1 ring-sky-500/35 bg-sky-950/30'
            : ''
      }`}
      aria-label={`${eqBandLabel(band)} EQ ${formatEqGain(gain)}${gain > -39.5 ? ' dB' : ''}`}
      title={`${eqBandLabel(band)} EQ`}
    >
      <div className="relative h-9 w-9 flex-shrink-0 select-none">
        <div className="absolute inset-0 rounded-full border-2 border-gray-700 bg-gray-800 shadow-inner">
          <div
            className={`absolute inset-1 rounded-full bg-gradient-to-br ${eqKnobGradient(band)} shadow-lg`}
            style={{ transform: `rotate(${eqKnobRotation(gain)}deg)` }}
          >
            <div className="absolute left-1/2 top-1 h-1 w-1 -translate-x-1/2 rounded-full bg-white shadow-sm" />
            <div className="absolute left-1/2 top-0 h-2 w-0.5 -translate-x-1/2 rounded-full bg-white/80" />
          </div>
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute left-1/2 top-0 h-1 w-0.5 -translate-x-1/2 bg-gray-400" />
          </div>
        </div>
      </div>
      <span className="text-[8px] font-medium leading-none text-gray-400">{eqBandLabel(band)}</span>
    </button>
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
  onOpenTempoDial,
  onOpenEqDial,
  onTapTempo,
  onBPMUpdate,
  canEditOrigBpm = false,
  isPlaying = false,
  isLoading = false,
  error = null,
  canSkip = false,
  onPrevious,
  onNext,
  onTogglePlay,
  waveform,
}: {
  deck: DeckChannelId
  config: DeckChannelConfig
  waveform?: ReactNode
  tempoPct: number
  adjustedBpm: number | null
  tempoDialOpen: boolean
  eqDialOpen: boolean
  focusedEqBand: EqBand
  onOpenTempoDial: (opts?: { anchorEl?: HTMLElement | null }) => void
  onOpenEqDial: (band: EqBand) => void
  onTapTempo: () => void
  onBPMUpdate?: (bpm: number) => Promise<void> | void
  canEditOrigBpm?: boolean
  isPlaying?: boolean
  isLoading?: boolean
  error?: string | null
  canSkip?: boolean
  onPrevious?: () => void
  onNext?: () => void
  onTogglePlay?: () => void
}) {
  const {
    deckLabel,
    trackTitle,
    trackArtist,
    trackAlbum,
    coverSrc,
    coverAlt,
    coverUnoptimized,
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

  const [editingBpm, setEditingBpm] = useState(false)
  const [bpmDraft, setBpmDraft] = useState('')
  const [savingBpm, setSavingBpm] = useState(false)

  const startBpmEdit = () => {
    setEditingBpm(true)
    setBpmDraft(detectedBPM?.toString() || '')
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

  const onBpmKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      void saveBpmEdit()
    } else if (e.key === 'Escape') {
      cancelBpmEdit()
    }
  }

  const mixPct = Math.round(Math.max(0, Math.min(1, mixProgress)) * 100)

  return (
    <div
      className={`relative flex flex-col gap-2 rounded-lg border px-2 py-2 transition-colors ${
        isMixing && mixRole === 'outgoing'
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
    >
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
      {(coverSrc || trackTitle) && (
        <div className="flex min-w-0 items-center gap-2.5">
          {coverSrc && (
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded">
              <Image
                src={coverSrc}
                alt={coverAlt || trackTitle || `Deck ${deckLabel} artwork`}
                fill
                className="object-cover"
                unoptimized={coverUnoptimized}
                sizes="48px"
                quality={85}
              />
            </div>
          )}
          <div className="min-w-0 flex-1 overflow-hidden space-y-1">
            <div className="flex min-w-0 items-center gap-2 overflow-hidden">
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
                  title={[trackTitle, trackArtist, trackAlbum].filter(Boolean).join(' · ')}
                >
                  {trackTitle && <span className="font-medium">{trackTitle}</span>}
                  {trackArtist && (
                    <>
                      {trackTitle && <span className="mx-1.5 text-gray-600">·</span>}
                      <span className="text-xs text-gray-400">{trackArtist}</span>
                    </>
                  )}
                  {trackAlbum && (
                    <>
                      {(trackTitle || trackArtist) && <span className="mx-1.5 text-gray-600">·</span>}
                      <span className="text-[10px] text-gray-500">{trackAlbum}</span>
                    </>
                  )}
                </p>
              )}
            </div>
            {(catalogBpm || trackGenre || trackKey || pairHint) && (
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <BpmBadge bpm={catalogBpm} size="xs" />
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
        </div>
      )}

      {waveform && (
        <div className="relative h-32 overflow-hidden rounded-md border border-gray-800/80 bg-black sm:h-36">
          {waveform}
        </div>
      )}

      <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="flex min-w-0 flex-wrap items-stretch gap-2 justify-self-start">
          <button
            type="button"
            onClick={() => onOpenTempoDial()}
            className={`flex shrink-0 flex-col justify-center rounded-lg px-2.5 py-1.5 text-left transition touch-manipulation ${
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
            <div className="text-[9px] uppercase tracking-wide text-gray-500">Tempo</div>
            <div
              className={`font-mono text-sm font-bold leading-tight ${
                Math.abs(tempoPct) > 0.1 ? 'text-yellow-400' : 'text-white'
              }`}
            >
              {isDetectingBPM ? (
                <span className="text-xs text-gray-400">…</span>
              ) : (
                adjustedBpm?.toFixed(0) || detectedBPM?.toFixed(0) || '---'
              )}
            </div>
          </button>

          <div className="hidden shrink-0 items-center gap-2 md:flex">
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
                    className="group font-mono text-sm font-bold text-white transition-colors hover:text-blue-400"
                    onClick={startBpmEdit}
                    title="Click to edit BPM"
                  >
                    {isDetectingBPM ? (
                      <span className="text-xs text-gray-400">…</span>
                    ) : (
                      <>
                        {detectedBPM?.toFixed(0) || '---'}
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
                      detectedBPM?.toFixed(0) || '---'
                    )}
                  </div>
                )}
              </div>
              <div className="h-7 w-px bg-gray-700" aria-hidden />
              <button
                type="button"
                onClick={(e) => onOpenTempoDial({ anchorEl: e.currentTarget })}
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
                aria-label={`Deck ${deckLabel} adjusted BPM — open tempo fader`}
                title="Open tempo fader"
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
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5 justify-self-center">
          {isLive ? (
            <>
              <button
                type="button"
                onClick={onPrevious}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-white transition-colors active:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 touch-manipulation"
                disabled={!canSkip}
                aria-label="Previous track"
              >
                <FaStepBackward className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onTogglePlay}
                className="flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-full bg-white text-black transition-colors active:bg-gray-200 disabled:opacity-50 touch-manipulation"
                aria-label={isPlaying ? 'Pause' : 'Play'}
                disabled={isLoading || Boolean(error)}
              >
                {isPlaying ? <FaPause className="h-4 w-4" /> : <FaPlay className="ml-0.5 h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={onNext}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-white transition-colors active:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 touch-manipulation"
                disabled={!canSkip}
                aria-label="Next track"
              >
                <FaStepForward className="h-4 w-4" />
              </button>
            </>
          ) : (
            <div
              className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-full border border-gray-700 bg-gray-900/80 px-3 text-[9px] uppercase tracking-wide text-gray-500"
              aria-hidden
            >
              Cued
            </div>
          )}
        </div>

        <div className="flex items-center gap-0.5 justify-self-end">
          {(['low', 'mid', 'high'] as const).map((band) => (
            <MiniEqDial
              key={band}
              band={band}
              gain={eqGains[band]}
              active={eqDialOpen && focusedEqBand === band}
              isMixing={isMixing}
              mixRole={mixRole}
              onSelect={() => onOpenEqDial(band)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export { formatEqGain, type EqBand }
