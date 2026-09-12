/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useClampedFixedMenuPosition } from '@/hooks/useClampedFixedMenuPosition'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'
import PopupMenuDragHeader from '@/components/ui/PopupMenuDragHeader'
import { 
  FaPlay, FaPause, FaStepForward, FaStepBackward, 
  FaVolumeUp, FaVolumeMute, FaRandom, FaRedo, FaDice,
  FaChevronDown, FaChevronUp, FaTimes, FaShare,
  FaPlus,
  FaGripVertical, FaTrash, FaCog
} from 'react-icons/fa'
import Image from 'next/image'
import { resolveAudioUrl, resolveAudioUrls } from '@/utils/resolveAudioUrl'
import { resolveImageUrl } from '@/utils/resolveImageUrl'
import {
  isUploadedFolderArtwork,
  stripArtworkCacheBust,
  subscribeCatalogSync,
  emitCatalogSync,
  trackShouldUseCrateMosaic,
} from '@/lib/catalog-sync'
import { CrateCoverMosaic } from '@/components/music/CrateCoverMosaic'
import {
  mosaicCoversForTrack,
  usePlayerCoverPool,
  useTrackMosaicCovers,
} from '@/hooks/useTrackMosaicCovers'
import { generatePeakData, detectBPM } from '@/utils/audioWorkerClient'
import { analyzeFrequencyBands, detectTransients } from '@/utils/audioAnalysis'
import { preloadTracks } from '@/utils/serviceWorker'
import { throttle, rafThrottle } from '@/utils/performance'
import { shouldUnoptimizeImage } from '@/utils/imageOptimization'
import { trackTrackPlay } from '@/lib/analytics'
import {
  catalogScopeLabel,
  getRecentPlayedTrackIds,
  isOrderedReleaseRandomScope,
  pickNextOrderedTracks,
  pickRandomUnusedTracks,
  rememberPlayedTrackId,
} from '@/lib/audio/catalog-random'
import {
  libraryDragHasTracks,
  overrideUpcomingQueue,
  parseLibraryDragTracks,
  readLibraryDragTrackIds,
  SERGIK_LIBRARY_TRACKS_DRAG_MIME,
  SERGIK_PLAYLIST_DRAG_MIME,
} from '@/lib/audio/library-drag'
import {
  expandPeakValley,
  multiBandRgbColor,
  normalizeFftBands,
  normalizeWaveformColorMode,
  normalizeWaveformLayerLayout,
  nearestBarZoomStep,
  stepVisibleBars,
  WAVEFORM_BAR_ZOOM_STEPS,
  WAVEFORM_COLOR_MODES,
  WAVEFORM_LAYER_LAYOUTS,
  zoomToVisibleRatio as zoomLevelToVisibleRatio,
  type WaveformColorMode,
  type WaveformLayerLayout,
  type WaveformSample,
} from '@/lib/audio/waveform-view'
import { profileFromSonicDna, withLivePlaybackGrid } from '@/lib/audio/waveform-intelligence'
import { measureBpmFromPeaks, nudgeBeatPhaseSec, reconcileTapeBpm, resolveTapeAlignedGrid, setDownbeatAt } from '@/lib/audio/beat-grid'
import {
  eqBiasFromDna,
  pickBestDnaTrack,
  quantizeToDnaGrid,
  quantizePointerToVisibleGrid,
  rankDnaTracks,
  resolvePlaybackBpm,
  secondsToNextPhraseBoundary,
} from '@/lib/audio/sonic-dna-mix'
import {
  resolveAutoDjMixIntelligence,
  resolveEffectiveMixStyle,
  computeMixDeckRates,
  resolveMixGridOffset,
  resolveMixTapeGrid,
  isUnsetOffset,
  readDnaBeatPhaseSec,
  toPhaseOnlyOffsetSec,
  wrapOffsetSec,
  playbackGridPhaseSec,
  applyDeckTempo,
  configureKeyLock,
  formantCompensationGains,
  rampDeckTempo,
  clampTempoRate,
  formatMixQuality,
  snapshotMixQuality,
  pushMixQualityHistory,
  readMixQualityHistory,
  consecutiveWeakMixCount,
  buildGridOnsetBundle,
  isGridLocked,
  isGridManual,
  readGridLockScore,
  withGridLockOnDna,
  withGridAnalysisOnDna,
  AUTO_GRID_LOCK_SCORE,
  alignMixOverlayToBeatGrid,
  exactOverlapDurationSec,
  buildMixPairHint,
  formatMixPairHintLine,
  filterOpenness,
  pickTrustedAutoDjTrack,
  diagnoseAutoDjPickStall,
  scoreAutoDjPair,
  isFourOnFloorPocket,
  resolveSectionAwareMixStyle,
  assessBeatSyncSafety,
  needsKickRemeasure,
  mergeMixQualityHistory,
  beatPhaseErrorSec,
  type MixPlan,
  type PhraseBars,
  type DeckId,
  type MixIntelligence,
  type MixQualitySnapshot,
  type MixQualityHistoryEntry,
  type MixQualityGrade,
  type MixEngine,
} from '@/lib/audio/mix-engine'
import {
  gateAutoDjFire,
  shouldBlockDnaFallback,
  orchestrateSkipBlendPlan,
} from '@/lib/audio/auto-dj-orchestrate'
import { AutoDjController, type AutoDjControllerHost, type AutoDjHostTrack } from '@/lib/audio/auto-dj-controller'
import { cueIdleEarly as runCueIdleEarly } from '@/lib/audio/auto-dj-cue-idle'
import { getMixEngineClass, loadMixEngineClass } from '@/lib/audio/mix-engine/load-mix-engine'
import { listDeckJumpCues } from '@/lib/audio/mix-engine/cues'
import {
  formatTapTempoButtonLabel,
  recordTapTempo,
} from '@/lib/audio/beat-count'
import {
  DEFAULT_AUTO_DJ_CONFIG,
  parseAutoDJConfig,
  readAutoDJConfigFromStorage,
  resolveIncomingRateForStrategy,
  writeAutoDJConfigToStorage,
  serializeAutoDJPayload,
  SYNC_MODE_OPTIONS,
  type AutoDJConfig,
  type SyncMode,
} from '@/lib/audio/auto-dj-preferences'
import {
  PHASE_METER_JOG_FEEL_OPTIONS,
  PHASE_METER_JOG_SENSITIVITY_OPTIONS,
  PHASE_METER_QUANTIZE_OPTIONS,
  PHASE_METER_WINDOW_OPTIONS,
  localGridPhaseErrorSec,
  readPhaseMeterOptionsFromStorage,
  resolvePhaseMeterWindowBeats,
  writePhaseMeterOptionsToStorage,
  type PhaseMeterJogFeel,
  type PhaseMeterOptions,
  type PhaseMeterQuantize,
  type PhaseMeterWindowId,
} from '@/lib/audio/waveform-overlays'
import { centerPhaseDeltaSec } from '@/lib/ui/phase-meter-wheel'
import {
  clearIDJMemoryCue,
  DEFAULT_IDJ_CONFIG,
  emptyIDJActiveCueMap,
  readIDJActiveCues,
  readIDJConfigFromStorage,
  readIDJMemoryCues,
  resolveIDJActiveCue,
  sameIDJActiveCue,
  writeIDJActiveCue,
  writeIDJConfigToStorage,
  writeIDJMemoryCue,
  type IDJActiveCue,
  type IDJActiveCueMap,
} from '@/lib/audio/idj-preferences'
import { nextQueueNeighbor } from '@/lib/audio/idj-queue'
import { mixCrossfaderPosition } from '@/lib/audio/mix-xf-position'
import {
  HOT_CUE_SLOTS,
  clearAllHotCueSlots,
  clearHotCueSlot,
  readHotCueSlots,
  writeHotCueSlot,
  type HotCueSlot,
  type HotCueSlots,
} from '@/lib/audio/hot-cues'
import { peaksOrEnvelopesToWaveformSamples, DEFAULT_WAVEFORM_BUCKETS } from '@/lib/audio/waveform-dsp-envelope'
import { waveformAnalysisUrls, vaultRelativePath, storedWaveformLikelyStale, looksLikeSyntheticPeaks, canAnalyzeAudioWaveform, isAudioContextUnavailableError, fetchStaticWaveformTape, waveformLookupPath } from '@/lib/audio/waveform-playback-alignment'
import {
  alternateAudioExtensionUrl,
  normalizeVaultAudioUrl,
  toSameOriginMediaUrl,
} from '@/utils/normalizeVaultAudioUrl'
import {
  isDirectPlayableUrl,
  isEdgePlaybackUrl,
  isR2BrowserPlayEnabled,
} from '@/lib/audio/edge-playback-url'
import {
  assignMediaSrcIfChanged,
  mediaUrlExtensionCandidates,
  mediaUrlMatchesTrack,
  mediaUrlsRoughlyEqual,
  peekSyncPlaybackUrl,
} from '@/lib/audio/media-src'
import {
  getPlaybackWaveformCache,
  setPlaybackWaveformCache,
  clearPlaybackWaveformCache,
} from '@/lib/audio/waveform-playback-cache'
import { buildWaveformTapeCache } from '@/lib/audio/waveform-tape-cache'
import { clearCachedWaveformSamples, loadWaveformSamplesForTrack } from '@/lib/audio/waveform-track-loader'
import { rescanAndPersistWaveform } from '@/lib/audio/rescan-waveform'
import { applyAdminBpmToTrack, displayTrackBpm, displayTrackGenre, displayTrackKey } from '@/lib/audio/track-display'
import { appendSonicDnaLookupParams } from '@/lib/audio/sonic-dna-query'
import { readCatalogOverrides } from '@/lib/catalog-lock'
import type {
  WaveformGhostTape,
  WaveformHotCue,
  WaveformMixOverlay,
} from '@/lib/audio/waveform-overlays'
import {
  dispatchPlayerSettings,
  PLAYER_TRANSPORT_EVENT,
  type PlayerTransportCommand,
} from '@/lib/audio/player-transport'
import {
  SONIC_DNA_WAVEFORM_EVENT,
  type SonicDnaWaveformEventDetail,
} from '@/components/music/SonicDnaReportModal'
import { usePathname } from 'next/navigation'
import dynamic from 'next/dynamic'
import React from 'react'
import { createPortal } from 'react-dom'
import {
  useMusicPlayer,
  readMusicPlayerState,
  patchMusicPlayerState,
  DEFAULT_PLAYER_CHROME,
} from '@/contexts/MusicPlayerContext'
import AutoDJHeaderButton from '@/components/music/AutoDJHeaderButton'
import IDJHeaderButton from '@/components/music/IDJHeaderButton'
import MixSessionLog from '@/components/music/MixSessionLog'
import IDJSettingsPanel from '@/components/music/IDJSettingsPanel'
import DjIcon from '@/components/music/DjIcon'
import {
  PlaybackTransportScrubber,
  type PlaybackTransportScrubberHandle,
} from '@/components/music/PlaybackTransportScrubber'

const WaveformStage = dynamic(() => import('@/components/waveform/WaveformStage'), {
  ssr: false,
  loading: () => null,
})
const PhaseAlignMeter = dynamic(() => import('@/components/waveform/PhaseAlignMeter'), {
  ssr: false,
  loading: () => null,
})
const SonicDnaReportModal = dynamic(() => import('@/components/music/SonicDnaReportModal'), {
  ssr: false,
  loading: () => null,
})
const AutoDJSettingsPanel = dynamic(() => import('@/components/music/AutoDJSettingsPanel'), {
  ssr: false,
  loading: () => null,
})
const MixQualityHud = dynamic(() => import('@/components/music/MixQualityHud'), {
  ssr: false,
  loading: () => null,
})

const DEFAULT_AUTO_DJ = DEFAULT_AUTO_DJ_CONFIG

// Memoized Queue Item Component
interface QueueItemProps {
  track: Track
  index: number
  isCurrent: boolean
  onRemove: (index: number) => void
  isAutoDJNext?: boolean
  reorderEnabled?: boolean
  /** Accept library drops even when reorder is off (e.g. empty / single upcoming). */
  dropEnabled?: boolean
  isDragOver?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
  onDragEnd?: () => void
}

const QueueItem = React.memo(
  ({
    track,
    index,
    isCurrent,
    onRemove,
    isAutoDJNext,
    reorderEnabled = false,
    dropEnabled = false,
    isDragOver = false,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
  }: QueueItemProps) => {
  const art = coverArtUrl(track.artwork)
  const mosaicCovers = useTrackMosaicCovers(trackShouldUseCrateMosaic(track) ? track : null)
  const acceptDrop = reorderEnabled || dropEnabled
  return (
    <div
      draggable={reorderEnabled}
      onDragStart={reorderEnabled ? onDragStart : undefined}
      onDragOver={acceptDrop ? onDragOver : undefined}
      onDrop={acceptDrop ? onDrop : undefined}
      onDragEnd={reorderEnabled ? onDragEnd : undefined}
      className={`flex items-center gap-3 px-3 py-2 rounded transition-colors ${
        isDragOver ? 'border-t-2 border-t-purple-400' : ''
      } ${
        isCurrent
          ? 'bg-blue-900/30 border-l-2 border-blue-500'
          : 'hover:bg-gray-800'
      } ${reorderEnabled ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      <FaGripVertical
        className={`text-xs shrink-0 ${reorderEnabled ? 'text-gray-400' : 'text-gray-600'}`}
        aria-hidden
      />
      {(art || mosaicCovers.length > 0) && (
        <div className="relative w-8 h-8 rounded overflow-hidden flex-shrink-0">
          <PlayerCoverArt
            src={art}
            mosaicCovers={mosaicCovers}
            alt={track.album || track.title}
            unoptimized={art ? shouldUnoptimizeImage(art) : true}
            sizes="32px"
            quality={75}
          />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-white truncate">{track.title}</p>
        <p className="text-xs text-gray-400 truncate">{track.artist}</p>
        {isAutoDJNext && (
          <div className="text-[9px] text-emerald-300 uppercase tracking-wider mt-0.5">
            Auto DJ next
          </div>
        )}
      </div>
      {isCurrent && (
        <span className="text-blue-400 text-xs">▶</span>
      )}
      <button
        onClick={() => onRemove(index)}
        onMouseDown={(e) => e.stopPropagation()}
        className="text-gray-400 hover:text-red-400 transition-colors p-1"
        title="Remove from queue"
      >
        <FaTrash className="text-xs" />
      </button>
    </div>
  )
},
)

QueueItem.displayName = 'QueueItem'

const QUEUE_DRAG_MIME = 'application/x-sergik-queue-index'

/** Reorder the upcoming slice of the queue (tracks after the current index). */
function reorderUpcomingQueue(
  queue: Track[],
  currentQueueIndex: number,
  fromDisplayIdx: number,
  toDisplayIdx: number,
): Track[] {
  const base = currentQueueIndex >= 0 ? currentQueueIndex + 1 : 0
  const upcoming = queue.slice(base)
  if (
    fromDisplayIdx < 0 ||
    toDisplayIdx < 0 ||
    fromDisplayIdx >= upcoming.length ||
    toDisplayIdx >= upcoming.length ||
    fromDisplayIdx === toDisplayIdx
  ) {
    return queue
  }
  const nextUpcoming = [...upcoming]
  const [moved] = nextUpcoming.splice(fromDisplayIdx, 1)
  nextUpcoming.splice(toDisplayIdx, 0, moved)
  return [...queue.slice(0, base), ...nextUpcoming]
}

function WaveformMenuItem({
  label,
  active,
  disabled,
  onSelect,
}: {
  label: string
  active?: boolean
  disabled?: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onSelect}
      className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? 'bg-blue-600/25 text-white' : 'text-gray-200 hover:bg-gray-800'
      }`}
    >
      <span>{label}</span>
      {active && <span className="text-blue-400" aria-hidden="true">✓</span>}
    </button>
  )
}

function WaveformMenuDropdown({
  label,
  value,
  open,
  onToggle,
  labelClassName = 'text-[10px] font-semibold uppercase tracking-wide text-gray-500',
  children,
}: {
  label: string
  value?: string
  open: boolean
  onToggle: () => void
  labelClassName?: string
  children: React.ReactNode
}) {
  return (
    <>
      <button
        type="button"
        role="menuitem"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-xs text-gray-200 transition-colors hover:bg-gray-800"
      >
        <span className={labelClassName}>{label}</span>
        <span className="flex min-w-0 items-center gap-1.5 text-gray-200">
          {value ? <span className="truncate tabular-nums">{value}</span> : null}
          <FaChevronDown
            className={`h-2.5 w-2.5 shrink-0 text-gray-500 transition-transform ${
              open ? 'rotate-180' : ''
            }`}
            aria-hidden
          />
        </span>
      </button>
      {open ? (
        <div
          className="max-h-48 overflow-y-auto overscroll-y-contain border-y border-gray-800/80 bg-black/40 py-0.5"
          role="menu"
          aria-label={`${label} options`}
        >
          {children}
        </div>
      ) : null}
    </>
  )
}

/** Phase meter controls — shared by the waveform menu and the phase meter context menu. */
function PhaseMeterMenuItems({
  enabled,
  hasBpm,
  options,
  onToggleEnabled,
  onPatch,
  syncMode,
  onSyncMode,
  onCenterPhase,
  onAlignPlayhead,
  onAlignBothPlayheads,
  onClose,
}: {
  enabled: boolean
  hasBpm: boolean
  options: PhaseMeterOptions
  onToggleEnabled: () => void
  onPatch: (patch: Partial<PhaseMeterOptions>) => void
  syncMode?: SyncMode
  onSyncMode?: (mode: SyncMode) => void
  onCenterPhase?: () => void
  onAlignPlayhead?: () => void
  onAlignBothPlayheads?: () => void
  onClose?: () => void
}) {
  type PhaseMenuSection =
    | 'actions'
    | 'jog'
    | 'sensitivity'
    | 'sync'
    | 'quantize'
    | 'window'
    | 'indicators'
    | 'phrase'
  const [openSection, setOpenSection] = useState<PhaseMenuSection | null>('actions')
  const toggleSection = (section: PhaseMenuSection) => {
    setOpenSection((prev) => (prev === section ? null : section))
  }

  const jogLabel =
    PHASE_METER_JOG_FEEL_OPTIONS.find((o) => o.id === options.jogFeel)?.label ?? 'Normal'
  const sensitivityLabel =
    PHASE_METER_JOG_SENSITIVITY_OPTIONS.find(
      (o) => Math.abs(o.value - (options.jogSensitivity ?? 1)) < 0.001,
    )?.label ?? `${Math.round((options.jogSensitivity ?? 1) * 100)}%`
  const quantizeLabel =
    PHASE_METER_QUANTIZE_OPTIONS.find((o) => o.id === options.quantize)?.label ?? 'Phrase'
  const windowLabel =
    PHASE_METER_WINDOW_OPTIONS.find((o) => o.id === options.windowId)?.label ?? '±1 beat'
  const syncSummary = [
    options.centerSnap ? 'Snap' : null,
    syncMode === 'tempo-sync' ? 'TempoSync' : syncMode === 'beat-sync' ? 'BeatSync' : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const indicatorSummary = [
    options.showBeats ? 'Beats' : null,
    options.showBars ? 'Bars' : null,
    options.showPhrases ? 'Phrase' : null,
    options.showMs ? 'ms' : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const run = (action?: () => void) => {
    action?.()
    onClose?.()
  }

  return (
    <>
      <WaveformMenuItem
        label="Show phase meter"
        active={enabled}
        disabled={!hasBpm}
        onSelect={onToggleEnabled}
      />
      <div className="px-3 py-1 text-[9px] leading-snug text-gray-500">
        Auto DJ sync follows this window to align &amp; beatmatch.
      </div>

      <div className="my-0.5 border-t border-gray-800" />
      <WaveformMenuDropdown
        label="Actions"
        open={openSection === 'actions'}
        onToggle={() => toggleSection('actions')}
      >
        <WaveformMenuItem
          label="Center phase"
          disabled={!enabled || !hasBpm || !onCenterPhase}
          onSelect={() => run(onCenterPhase)}
        />
        <WaveformMenuItem
          label={`Align playhead · ${quantizeLabel}`}
          disabled={
            !enabled || !hasBpm || options.quantize === 'off' || !onAlignPlayhead
          }
          onSelect={() => run(onAlignPlayhead)}
        />
        <WaveformMenuItem
          label={`Align both playheads · ${quantizeLabel}`}
          disabled={
            !enabled || !hasBpm || options.quantize === 'off' || !onAlignBothPlayheads
          }
          onSelect={() => run(onAlignBothPlayheads)}
        />
      </WaveformMenuDropdown>

      <WaveformMenuDropdown
        label="Jog feel"
        value={jogLabel}
        open={openSection === 'jog'}
        onToggle={() => toggleSection('jog')}
      >
        {PHASE_METER_JOG_FEEL_OPTIONS.map((opt) => (
          <WaveformMenuItem
            key={opt.id}
            label={opt.label}
            active={options.jogFeel === opt.id}
            disabled={!enabled}
            onSelect={() => onPatch({ jogFeel: opt.id as PhaseMeterJogFeel })}
          />
        ))}
        <div className="px-3 py-1 text-[9px] leading-snug text-gray-500">
          {PHASE_METER_JOG_FEEL_OPTIONS.find((o) => o.id === options.jogFeel)?.hint}
        </div>
      </WaveformMenuDropdown>

      <WaveformMenuDropdown
        label="Scroll length"
        value={sensitivityLabel}
        open={openSection === 'sensitivity'}
        onToggle={() => toggleSection('sensitivity')}
      >
        {PHASE_METER_JOG_SENSITIVITY_OPTIONS.map((opt) => (
          <WaveformMenuItem
            key={opt.value}
            label={opt.label}
            active={Math.abs((options.jogSensitivity ?? 1) - opt.value) < 0.001}
            disabled={!enabled}
            onSelect={() => onPatch({ jogSensitivity: opt.value })}
          />
        ))}
        <div className="px-3 py-1 text-[9px] leading-snug text-gray-500">
          Higher % = shorter stroke (more phase per scroll). Lower % = longer stroke.
        </div>
      </WaveformMenuDropdown>

      <WaveformMenuDropdown
        label="Sync"
        value={syncSummary || undefined}
        open={openSection === 'sync'}
        onToggle={() => toggleSection('sync')}
      >
        <WaveformMenuItem
          label="Magnetic center snap"
          active={options.centerSnap}
          disabled={!enabled}
          onSelect={() => onPatch({ centerSnap: !options.centerSnap })}
        />
        {onSyncMode
          ? SYNC_MODE_OPTIONS.map((opt) => (
              <WaveformMenuItem
                key={opt.id}
                label={opt.label}
                active={syncMode === opt.id}
                disabled={!enabled}
                onSelect={() => onSyncMode(opt.id)}
              />
            ))
          : null}
        {onSyncMode ? (
          <div className="px-3 py-1 text-[9px] leading-snug text-gray-500">
            {SYNC_MODE_OPTIONS.find((o) => o.id === syncMode)?.hint}
          </div>
        ) : null}
      </WaveformMenuDropdown>

      <WaveformMenuDropdown
        label="Quantize"
        value={quantizeLabel}
        open={openSection === 'quantize'}
        onToggle={() => toggleSection('quantize')}
      >
        {PHASE_METER_QUANTIZE_OPTIONS.map((opt) => (
          <WaveformMenuItem
            key={opt.id}
            label={opt.label}
            active={options.quantize === opt.id}
            disabled={!enabled}
            onSelect={() => onPatch({ quantize: opt.id as PhaseMeterQuantize })}
          />
        ))}
      </WaveformMenuDropdown>

      <WaveformMenuDropdown
        label="Window"
        value={windowLabel}
        open={openSection === 'window'}
        onToggle={() => toggleSection('window')}
      >
        {(['beat', 'bar', 'phrase'] as const).map((group) => (
          <React.Fragment key={group}>
            <div className="px-3 py-1 text-[9px] font-semibold uppercase tracking-wide text-gray-500">
              {group === 'beat' ? 'Beats' : group === 'bar' ? 'Bars' : 'Phrases'}
            </div>
            {PHASE_METER_WINDOW_OPTIONS.filter((o) => o.group === group).map((opt) => (
              <WaveformMenuItem
                key={opt.id}
                label={opt.label}
                active={options.windowId === opt.id}
                disabled={!enabled}
                onSelect={() => onPatch({ windowId: opt.id as PhaseMeterWindowId })}
              />
            ))}
          </React.Fragment>
        ))}
      </WaveformMenuDropdown>

      <WaveformMenuDropdown
        label="Indicators"
        value={indicatorSummary || undefined}
        open={openSection === 'indicators'}
        onToggle={() => toggleSection('indicators')}
      >
        <WaveformMenuItem
          label="Beat ticks"
          active={options.showBeats}
          disabled={!enabled}
          onSelect={() => onPatch({ showBeats: !options.showBeats })}
        />
        <WaveformMenuItem
          label="Bar (downbeat)"
          active={options.showBars}
          disabled={!enabled}
          onSelect={() => onPatch({ showBars: !options.showBars })}
        />
        <WaveformMenuItem
          label="Phrase"
          active={options.showPhrases}
          disabled={!enabled}
          onSelect={() => onPatch({ showPhrases: !options.showPhrases })}
        />
        <WaveformMenuItem
          label="ms readout"
          active={options.showMs}
          disabled={!enabled}
          onSelect={() => onPatch({ showMs: !options.showMs })}
        />
      </WaveformMenuDropdown>

      <WaveformMenuDropdown
        label="Phrase size"
        value={`${options.phraseBars} bars`}
        open={openSection === 'phrase'}
        onToggle={() => toggleSection('phrase')}
      >
        {([4, 8, 16] as const).map((bars) => (
          <WaveformMenuItem
            key={`phase-phrase-${bars}`}
            label={`${bars} bars`}
            active={options.phraseBars === bars}
            disabled={!enabled}
            onSelect={() => onPatch({ phraseBars: bars })}
          />
        ))}
      </WaveformMenuDropdown>
    </>
  )
}

const GRID_NUDGE_FINE_SEC = 0.001
const GRID_NUDGE_MED_SEC = 0.01

function WaveformNudgeButton({
  label,
  title,
  disabled,
  onClick,
}: {
  label: string
  title: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onClick()
      }}
      className="rounded bg-gray-800 px-1 py-1 text-[10px] font-medium text-gray-200 transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {label}
    </button>
  )
}

function WaveformGridNudge({
  bpm,
  offsetSec,
  disabled,
  onNudge,
  onZero,
}: {
  bpm: number | null
  offsetSec: number
  disabled?: boolean
  onNudge: (deltaSec: number) => void
  /** Double-click the ms readout to snap phase to 0 and persist. */
  onZero?: () => void
}) {
  const beatSec = bpm && bpm > 0 ? 60 / bpm : null
  const sixteenth = beatSec ? beatSec / 16 : 0
  const half = beatSec ? beatSec / 2 : 0
  const offsetMs = (Number.isFinite(offsetSec) ? offsetSec : 0) * 1000
  return (
    <div className="px-3 py-1.5" role="group" aria-label="Beat grid alignment nudge">
      <div className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-gray-500">
        <span>Grid nudge</span>
        <button
          type="button"
          className="font-mono font-normal normal-case tabular-nums text-gray-400 hover:text-cyan-300 disabled:cursor-default disabled:opacity-60"
          title="Double-click to zero grid phase (0 ms) and save systemically"
          disabled={disabled || !onZero}
          onDoubleClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (disabled || !onZero) return
            onZero()
          }}
        >
          {offsetMs.toFixed(0)} ms
        </button>
      </div>
      <div className="grid grid-cols-4 gap-1">
        <WaveformNudgeButton
          label="−1/16"
          title="Nudge grid earlier by 1/16 beat"
          disabled={disabled || !sixteenth}
          onClick={() => onNudge(-sixteenth)}
        />
        <WaveformNudgeButton
          label="−1 ms"
          title="Nudge grid earlier by 1 millisecond"
          disabled={disabled}
          onClick={() => onNudge(-GRID_NUDGE_FINE_SEC)}
        />
        <WaveformNudgeButton
          label="+1 ms"
          title="Nudge grid later by 1 millisecond"
          disabled={disabled}
          onClick={() => onNudge(GRID_NUDGE_FINE_SEC)}
        />
        <WaveformNudgeButton
          label="+1/16"
          title="Nudge grid later by 1/16 beat"
          disabled={disabled || !sixteenth}
          onClick={() => onNudge(sixteenth)}
        />
      </div>
      <div className="mt-1 grid grid-cols-3 gap-1">
        <WaveformNudgeButton
          label="−10 ms"
          title="Nudge grid earlier by 10 milliseconds"
          disabled={disabled}
          onClick={() => onNudge(-GRID_NUDGE_MED_SEC)}
        />
        <WaveformNudgeButton
          label="Flip ½"
          title="Flip grid by half a beat"
          disabled={disabled || !half}
          onClick={() => onNudge(half)}
        />
        <WaveformNudgeButton
          label="+10 ms"
          title="Nudge grid later by 10 milliseconds"
          disabled={disabled}
          onClick={() => onNudge(GRID_NUDGE_MED_SEC)}
        />
      </div>
    </div>
  )
}

// Lazy load expanded controls
const ExpandedPlayerControls = dynamic(
  () => import('./ExpandedPlayerControls'),
  {
    loading: () => (
      <div className="container mx-auto px-4 pb-3 border-t border-gray-800 pt-3">
        <div className="flex items-center justify-center py-8">
          <div className="text-gray-400 text-sm">Loading controls...</div>
        </div>
      </div>
    ),
    ssr: false,
  }
)

// Hide DJ mode until completed (set to true when ready)
const DJ_MODE_ENABLED = false
/** Stable empty peaks — avoid `[]` identity churn in dual-deck iDJ waveform memo. */
const EMPTY_WAVEFORM_SAMPLES: WaveformSample[] = []

/**
 * iOS and Android suspend Web Audio's AudioContext when the screen locks. Our analyzer
 * routes the media element through MediaElementSource → destination, so the audible path
 * stops with the context. Keeping output on HTMLMediaElement preserves background playback.
 */
function prefersMediaElementBackgroundPlayback(): boolean {
  if (typeof navigator === 'undefined') return false
  const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData
  if (uaData?.mobile === true) return true
  const ua = navigator.userAgent
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' &&
      (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints > 1)
  return isIOS || /Android/i.test(ua)
}

function coverArtUrl(artwork?: string | null, bust?: number): string | undefined {
  if (!artwork) return undefined
  const src = resolveImageUrl(artwork)
  if (!src) return undefined
  if (!isUploadedFolderArtwork(src) && !src.includes('/images/audio/artwork/')) return src
  const base = stripArtworkCacheBust(src)
  const existing = artwork.match(/[?&]v=([^&]+)/)?.[1]
  if (bust) return `${base}?v=${bust}`
  if (existing) return `${base}?v=${existing}`
  return base
}

/** Prefer the playing track’s own art; fall back to album/folder siblings. */
function albumCoverUrl(
  track?: { artwork?: string; album?: string; folder?: string; albumType?: string; folderId?: string } | null,
  queue: { artwork?: string; album?: string; folder?: string }[] = [],
  bust?: number,
): string | undefined {
  if (!track) return undefined
  const own = coverArtUrl(track.artwork, bust)
  if (own) return own
  if (track.album) {
    const sibling = queue.find((t) => t.album === track.album && t.artwork)
    const fromAlbum = coverArtUrl(sibling?.artwork, bust)
    if (fromAlbum) return fromAlbum
  }
  if (track.folder) {
    const sibling = queue.find((t) => t.folder === track.folder && t.artwork)
    return coverArtUrl(sibling?.artwork, bust)
  }
  return undefined
}

/** Alias kept for Media Session / lock-screen callers. */
function lockScreenCoverUrl(
  track?: { artwork?: string; album?: string; folder?: string } | null,
  queue: { artwork?: string; album?: string; folder?: string }[] = [],
  bust?: number,
): string | undefined {
  return albumCoverUrl(track, queue, bust)
}

function buildLockScreenArtwork(artwork?: string) {
  const src = coverArtUrl(artwork)
  if (!src) return []
  return [
    { src, sizes: '96x96', type: 'image/jpeg' },
    { src, sizes: '128x128', type: 'image/jpeg' },
    { src, sizes: '192x192', type: 'image/jpeg' },
    { src, sizes: '256x256', type: 'image/jpeg' },
    { src, sizes: '384x384', type: 'image/jpeg' },
    { src, sizes: '512x512', type: 'image/jpeg' },
  ]
}

function PlayerCoverArt({
  src,
  mosaicCovers,
  alt,
  unoptimized = true,
  sizes,
  className = 'object-cover',
  priority = false,
  quality = 85,
}: {
  src?: string
  mosaicCovers?: string[]
  alt: string
  unoptimized?: boolean
  sizes: string
  className?: string
  priority?: boolean
  quality?: number
}) {
  if (mosaicCovers?.length) {
    return <CrateCoverMosaic covers={mosaicCovers} />
  }
  if (!src) return null
  return (
    <Image
      key={src}
      src={src}
      alt={alt}
      fill
      className={className}
      unoptimized={unoptimized}
      sizes={sizes}
      priority={priority}
      quality={quality}
      loading={priority ? undefined : 'lazy'}
    />
  )
}

// Lazy load DJ mixer mode
const DJMixerMode = dynamic(
  () => import('./DJMixerMode'),
  {
    loading: () => (
      <div className="container mx-auto px-4 pb-3 border-t border-gray-800 pt-3">
        <div className="flex items-center justify-center py-8">
          <div className="text-gray-400 text-sm">Loading DJ mixer...</div>
        </div>
      </div>
    ),
    ssr: false,
  }
)

interface Track {
  id: string
  title: string
  artist: string
  duration: number
  file: string
  artwork?: string | null
  album?: string
  albumType?: string
  folder?: string
  folderId?: string
  audioFileId?: string
  // Audio analysis fields (from Supabase)
  bpm?: number
  key_signature?: string
  energy_level?: number
  danceability?: number
  frequency_bands?: any
  waveform_data?: number[] // Pre-computed waveform peaks from Supabase
  beat_grid_offset?: number
  /** Lean catalog flag — admin/manual phase must not be auto-realigned. */
  grid_manual?: boolean
  // Sonic DNA analysis (from Supabase)
  sonic_dna?: any
  sonic_dna_status?: string | null
  display_order?: number
  track_number?: number
  musicbrainz_id?: string
  musicbrainz_data?: any
}

interface MusicPlayerProps {
  currentTrack: Track | null
  queue: Track[]
  currentSource?: { type: 'folder' | 'playlist' | null; id: string | null } | null
  getTracksFromSource?: (source: { type: 'folder' | 'playlist' | null; id: string | null } | null) => Promise<Track[]>
  /** When Random exhausts a crate/EP, jump to another release (not the next sibling). */
  onRequestRandomRelease?: () => Promise<boolean>
  onTrackEnd: () => void
  onNext: () => void
  onPrevious: () => void
  isPlaying?: boolean
  onPlayStateChange?: (isPlaying: boolean) => void
  onShuffle?: (shuffledQueue: Track[]) => void
  onQueueChange?: (queue: Track[]) => void
  onRemoveFromQueue?: (index: number) => void
}

interface PlayerSettings {
  volume: number
  isMuted: boolean
  isShuffled: boolean
  /** Random: crates/EPs play in order then jump; catalog/playlist least-repetition. */
  catalogRandom: boolean
  repeatMode: 'off' | 'all' | 'one'
  playbackRate: number
  crossfadeDuration: number
  eqPreset: 'flat' | 'bass' | 'treble' | 'vocal'
  bufferSize: 'small' | 'medium' | 'large' | 'auto'
  streamQuality: 'standard' | 'HD' | 'UHD' | 'auto'
  /** On phones/tablets: keep audio on HTMLMediaElement so lock-screen / background playback works. */
  prioritizeBackgroundPlayback: boolean
}

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const
/**
 * Smoothing time constant for mix filter sweeps. Roughly one animation frame, so
 * the audio thread interpolates between the per-frame targets the mix loop sends
 * instead of stepping to each one.
 */
/** Playback lead required before the waveform decode may re-fetch the file. */
const WAVEFORM_DECODE_BUFFER_LEAD_SEC = 12
/** Give up waiting for that lead rather than never drawing band detail. */
const WAVEFORM_DECODE_MAX_WAIT_MS = 20_000
/** Ignore brief `waiting` blips so preload/range fetches don't flash "Buffering...". */
const BUFFERING_UI_DELAY_MS = 400
/** MediaError.code values — `MediaError` constants are not available on the type. */
const MEDIA_ERR_NETWORK = 2
const MEDIA_ERR_DECODE = 3
const MEDIA_ERR_SRC_NOT_SUPPORTED = 4
/** In-place reloads allowed per track for a transient AUDIO_RENDERER_ERROR. */
const MAX_DECODE_RELOADS = 2
const QUEUE_DOCK_HEIGHT_MIN = 180
const QUEUE_DOCK_HEIGHT_DEFAULT = 360
const QUEUE_DOCK_HEIGHT_STORAGE_KEY = 'sergik.music.queue-dock-height'
const EQ_PRESETS = [
  { value: 'flat', label: 'Flat' },
  { value: 'bass', label: 'Bass Boost' },
  { value: 'treble', label: 'Treble' },
  { value: 'vocal', label: 'Vocal' },
] as const

function getTempoPercentage(rate: number): number {
  return (rate - 1) * 100
}

function getAdjustedBPM(originalBPM: number | null, rate: number): number | null {
  if (originalBPM === null) return null
  return Math.round(originalBPM * rate * 10) / 10
}

function rateToTempoValue(rate: number): number {
  return (rate - 1) * 100
}

function tempoValueToRate(tempoValue: number): number {
  return 1 + (tempoValue / 100)
}

function queueDockHeightMax(): number {
  if (typeof window === 'undefined') return 640
  return Math.max(QUEUE_DOCK_HEIGHT_MIN, Math.floor(window.innerHeight * 0.75))
}

function readStoredQueueDockHeight(): number {
  if (typeof window === 'undefined') return QUEUE_DOCK_HEIGHT_DEFAULT
  const raw = Number(window.localStorage.getItem(QUEUE_DOCK_HEIGHT_STORAGE_KEY))
  if (!Number.isFinite(raw)) return QUEUE_DOCK_HEIGHT_DEFAULT
  return Math.min(Math.max(Math.round(raw), QUEUE_DOCK_HEIGHT_MIN), queueDockHeightMax())
}

export default function MusicPlayer({
  currentTrack,
  queue,
  currentSource,
  getTracksFromSource,
  onRequestRandomRelease,
  onTrackEnd,
  onNext,
  onPrevious,
  isPlaying: externalIsPlaying,
  onPlayStateChange,
  onShuffle,
  onQueueChange,
  onRemoveFromQueue
}: MusicPlayerProps) {
  const pathname = usePathname()
  const isAdminRoute = pathname?.startsWith('/admin') ?? false
  const [isAdminSession, setIsAdminSession] = useState(isAdminRoute)
  useEffect(() => {
    if (isAdminRoute) {
      setIsAdminSession(true)
      return
    }
    let cancelled = false
    void fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setIsAdminSession(Boolean(d?.authenticated && d?.isAdmin))
      })
      .catch(() => {
        if (!cancelled) setIsAdminSession(false)
      })
    return () => {
      cancelled = true
    }
  }, [isAdminRoute])
  const canEditOrigBpm = isAdminRoute || isAdminSession
  const {
    waveformHost,
    seekTargetSec,
    seekNonce,
    reportPlaybackPosition,
    isQueuePanelOpen,
    setIsQueuePanelOpen,
    queuePanelHost,
    playTrack,
    seekTo,
    clearSeekTarget,
    adoptPlayingTrack,
    setCurrentTrack,
    setCurrentIndex,
    playNext,
    isAutoDJEnabled,
    setIsAutoDJEnabled,
    isIDJEnabled,
    autoDJSettingsMenu,
    closeAutoDJSettingsMenu,
    idjSettingsMenu,
    closeIDJSettingsMenu,
    setPlayerChrome,
  } = useMusicPlayer()
  const isQueueOpen = isQueuePanelOpen
  const setIsQueueOpen = setIsQueuePanelOpen
  const queueDockHostRef = useRef<HTMLElement | null>(null)
  if (typeof document !== 'undefined') {
    if (queuePanelHost && document.contains(queuePanelHost)) {
      queueDockHostRef.current = queuePanelHost
    } else if (queueDockHostRef.current && !document.contains(queueDockHostRef.current)) {
      queueDockHostRef.current = null
    }
  }
  const queueDockHost =
    typeof document !== 'undefined' && queuePanelHost && document.contains(queuePanelHost)
      ? queuePanelHost
      : queueDockHostRef.current
  const isQueueDocked = Boolean(queueDockHost)
  const isWaveformDocked = Boolean(waveformHost)
  const [coverBust, setCoverBust] = useState(() => Date.now())
  useEffect(() => {
    return subscribeCatalogSync((event) => {
      if (!Object.prototype.hasOwnProperty.call(event.patch, 'artwork')) return
      setCoverBust(Date.now())
    })
  }, [])
  const coverSrc = useMemo(
    () => albumCoverUrl(currentTrack, queue, coverBust),
    [currentTrack, queue, coverBust],
  )
  const lockScreenSrc = useMemo(
    () => lockScreenCoverUrl(currentTrack, queue, coverBust),
    [currentTrack, queue, coverBust],
  )
  const mosaicCovers = useTrackMosaicCovers(currentTrack, queue)
  const playerCoverPool = usePlayerCoverPool(queue)
  const hasPlayerCover = Boolean(coverSrc) || mosaicCovers.length > 0
  const waveformIntelligenceProfile = useMemo(
    () => profileFromSonicDna(currentTrack?.sonic_dna),
    [currentTrack?.sonic_dna]
  )
  const coverUnoptimized = coverSrc ? shouldUnoptimizeImage(coverSrc) : true
  const coverAlt = currentTrack?.album || currentTrack?.title || 'Album artwork'
  // DJ mode: visible in admin for testing; set DJ_MODE_ENABLED true to show on frontend
  const djModeAvailable = DJ_MODE_ENABLED || isAdminRoute
  const [internalIsPlaying, setInternalIsPlaying] = useState(false)
  const isPlaying = externalIsPlaying !== undefined ? externalIsPlaying : internalIsPlaying
  const setIsPlaying = (value: boolean) => {
    setInternalIsPlaying(value)
    onPlayStateChange?.(value)
  }
  const [currentTime, setCurrentTime] = useState(() => {
    const saved = readMusicPlayerState()?.currentTime
    return typeof saved === 'number' && Number.isFinite(saved) && saved > 0 ? saved : 0
  })
  /** Live playhead for engine logic — updated on timeupdate without React commits. */
  const playbackTimeRef = useRef(currentTime)
  const autoDJCurrentTimeRef = useRef(currentTime)
  const transportMiniMobileRef = useRef<PlaybackTransportScrubberHandle>(null)
  const transportMiniDesktopRef = useRef<PlaybackTransportScrubberHandle>(null)
  const transportExpandedRef = useRef<PlaybackTransportScrubberHandle>(null)
  const [duration, setDuration] = useState(() => {
    const track = readMusicPlayerState()?.currentTrack
    const d = track?.duration
    return typeof d === 'number' && Number.isFinite(d) && d > 0 ? d : 0
  })
  const [isLoading, setIsLoading] = useState(false)
  const [isBuffering, setIsBuffering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null)
  const resolvedUrlCacheRef = useRef<Map<string, string>>(new Map())
  const [bufferedProgress, setBufferedProgress] = useState(0)
  const [seekPreviewTime, setSeekPreviewTime] = useState<number | null>(null)
  const [isQueueExpanded, setIsQueueExpanded] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(() => {
    const saved = readMusicPlayerState()?.chrome?.isExpanded
    return typeof saved === 'boolean' ? saved : DEFAULT_PLAYER_CHROME.isExpanded
  })
  const [isKeyboardShortcutsExpanded, setIsKeyboardShortcutsExpanded] = useState(false)
  const [isWaveformSettingsExpanded, setIsWaveformSettingsExpanded] = useState(false)
  const [expandedMode, setExpandedMode] = useState<'controls' | 'dj'>('controls')
  const [autoDJConfig, setAutoDJConfig] = useState<AutoDJConfig>(() => {
    const saved = readAutoDJConfigFromStorage()
    return {
      ...saved,
      enabled: DEFAULT_AUTO_DJ.enabled,
    }
  })
  const autoDJConfigRef = useRef(autoDJConfig)
  autoDJConfigRef.current = autoDJConfig
  const [autoDJLibrary, setAutoDJLibrary] = useState<Track[]>([])
  const catalogRandomFillKeyRef = useRef('')
  const autoDJIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const autoDjControllerRef = useRef<AutoDjController | null>(null)
  const mixNowFromCurrentBarRef = useRef<(() => void) | null>(null)
  const autoDJLastAddedRef = useRef<string | null>(null)
  const autoDJPendingRef = useRef<string | null>(null)
  /** Freeze OUT plan once within ~4s so ticks cannot snap earlier. */
  const autoDJFrozenPlanRef = useRef<{
    outgoingId: string
    incomingId: string
    plan: MixPlan
  } | null>(null)
  const autoDJCrossfadeTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  /** rAF loop — fires the mix when live currentTime crosses the OUT marker. */
  const autoDJOutRafRef = useRef<number | null>(null)
  /** rAF — skip blend waits for the next outgoing beat. */
  const skipBlendRafRef = useRef<number | null>(null)
  const skipToNextRef = useRef<() => void>(() => {})
  const skipToPreviousRef = useRef<() => void>(() => {})
  /** Seconds until the last planned mix point; drives how often we replan. */
  const autoDJPlanDelayRef = useRef<number | null>(null)
  const autoDJPlanScanRef = useRef(0)
  const [autoDJStatusMessage, setAutoDJStatusMessage] = useState('')
  const [autoDjPickStall, setAutoDjPickStall] = useState<{
    rejectReason: string
    topRejectedWhy: string | null
    needsLockGrids: boolean
    needsRemeasureKicks: boolean
    suggestTempoSync: boolean
  } | null>(null)
  const [lastMixQuality, setLastMixQuality] = useState<MixQualitySnapshot | null>(null)
  const lastMixQualityRef = useRef<MixQualitySnapshot | null>(null)
  lastMixQualityRef.current = lastMixQuality
  const [mixQualityHistory, setMixQualityHistory] = useState<MixQualityHistoryEntry[]>([])
  useEffect(() => {
    setMixQualityHistory(readMixQualityHistory())
  }, [])
  const [autoDJPendingTrackId, setAutoDJPendingTrackId] = useState<string | null>(null)
  const [autoDJLeadIn, setAutoDJLeadIn] = useState(() => readAutoDJConfigFromStorage().leadIn)
  const autoDJLeadInRef = useRef(autoDJLeadIn)
  autoDJLeadInRef.current = autoDJLeadIn
  const [autoDJSuggestedLeadIn, setAutoDJSuggestedLeadIn] = useState(0)
  const autoDJSuggestedLeadInRef = useRef(0)
  autoDJSuggestedLeadInRef.current = autoDJSuggestedLeadIn
  const [fanUserId, setFanUserId] = useState<string | null>(null)
  const [autoDJCloudLoaded, setAutoDJCloudLoaded] = useState(false)
  const [autoDJSaving, setAutoDJSaving] = useState(false)
  const [autoDJDirty, setAutoDJDirty] = useState(false)
  const [isTrackListExpanded, setIsTrackListExpanded] = useState(false)
  const [queueDockHeight, setQueueDockHeight] = useState(QUEUE_DOCK_HEIGHT_DEFAULT)
  const [isResizingQueueDock, setIsResizingQueueDock] = useState(false)
  const queueDockResizeStartRef = useRef({ y: 0, h: QUEUE_DOCK_HEIGHT_DEFAULT })
  const queueDockHeightRef = useRef(QUEUE_DOCK_HEIGHT_DEFAULT)
  queueDockHeightRef.current = queueDockHeight
  useEffect(() => {
    setQueueDockHeight(readStoredQueueDockHeight())
  }, [])
  useEffect(() => {
    if (!isResizingQueueDock) return
    const onMove = (e: PointerEvent) => {
      const dy = e.clientY - queueDockResizeStartRef.current.y
      const next = Math.min(
        queueDockHeightMax(),
        Math.max(QUEUE_DOCK_HEIGHT_MIN, queueDockResizeStartRef.current.h + dy),
      )
      setQueueDockHeight(next)
    }
    const onUp = () => {
      setIsResizingQueueDock(false)
      try {
        window.localStorage.setItem(
          QUEUE_DOCK_HEIGHT_STORAGE_KEY,
          String(queueDockHeightRef.current),
        )
      } catch {
        /* ignore quota / private mode */
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizingQueueDock])
  const handleQueueDockResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    queueDockResizeStartRef.current = { y: e.clientY, h: queueDockHeight }
    setIsResizingQueueDock(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const clearAutoDJOutWatch = useCallback(() => {
    if (autoDJOutRafRef.current != null) {
      cancelAnimationFrame(autoDJOutRafRef.current)
      autoDJOutRafRef.current = null
    }
  }, [])

  const clearSkipBlendWatch = useCallback(() => {
    if (skipBlendRafRef.current != null) {
      cancelAnimationFrame(skipBlendRafRef.current)
      skipBlendRafRef.current = null
    }
  }, [])

  const clearAutoDJCrossfadeTimeout = useCallback(() => {
    if (autoDJCrossfadeTimeoutRef.current) {
      clearTimeout(autoDJCrossfadeTimeoutRef.current)
      autoDJCrossfadeTimeoutRef.current = null
    }
    clearAutoDJOutWatch()
  }, [clearAutoDJOutWatch])

  const resetAutoDJToDefaults = useCallback(() => {
    setIsAutoDJEnabled(DEFAULT_AUTO_DJ.enabled)
    setAutoDJConfig({ ...DEFAULT_AUTO_DJ })
    setAutoDJLeadIn(DEFAULT_AUTO_DJ.leadIn)
    writeAutoDJConfigToStorage({ ...DEFAULT_AUTO_DJ, leadIn: DEFAULT_AUTO_DJ.leadIn })
    setAutoDJDirty(true)
    setAutoDJStatusMessage('Restored default Auto DJ settings')
    clearAutoDJCrossfadeTimeout()
  }, [clearAutoDJCrossfadeTimeout, setIsAutoDJEnabled])

  const patchAutoDJConfig = useCallback((patch: Partial<AutoDJConfig>) => {
    setAutoDJConfig((prev) => {
      const next = parseAutoDJConfig({ ...prev, ...patch })
      writeAutoDJConfigToStorage({ ...next, leadIn: autoDJLeadIn })
      return next
    })
    setAutoDJDirty(true)
  }, [autoDJLeadIn])

  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return
        setFanUserId(d?.authenticated && d.user?.id ? d.user.id : null)
      })
      .catch(() => {
        if (!cancelled) setFanUserId(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!fanUserId || autoDJCloudLoaded) return
    let cancelled = false
    fetch('/api/fan/auto-dj-settings', { credentials: 'include', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d?.settings) return
        const cloud = parseAutoDJConfig(d.settings)
        setAutoDJConfig((prev) => ({
          ...cloud,
          enabled: prev.enabled,
        }))
        setAutoDJLeadIn(cloud.leadIn)
        writeAutoDJConfigToStorage(cloud)
        if (Array.isArray(d.mixQualityHistory) && d.mixQualityHistory.length) {
          setMixQualityHistory((local) => {
            const merged = mergeMixQualityHistory(local, d.mixQualityHistory)
            try {
              localStorage.setItem('sergik.autoDj.mixQualityHistory', JSON.stringify(merged))
            } catch {
              /* quota */
            }
            return merged
          })
        }
        setAutoDJDirty(false)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setAutoDJCloudLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [fanUserId, autoDJCloudLoaded])

  useEffect(() => {
    writeAutoDJConfigToStorage(serializeAutoDJPayload(autoDJConfig, autoDJLeadIn))
  }, [autoDJConfig, autoDJLeadIn])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const w = window as Window & {
      __SERGIK_E2E__?: {
        getAutoDJStatus?: () => string
        isAutoDJEnabled?: () => boolean
        mixNow?: () => void
      }
    }
    w.__SERGIK_E2E__ = {
      ...w.__SERGIK_E2E__,
      getAutoDJStatus: () => autoDJStatusMessage,
      isAutoDJEnabled: () => autoDJConfigRef.current.enabled,
      mixNow: () => mixNowFromCurrentBarRef.current?.(),
    }
  }, [autoDJStatusMessage])

  const saveAutoDJToAccount = useCallback(async () => {
    const payload = serializeAutoDJPayload(autoDJConfig, autoDJLeadIn)
    writeAutoDJConfigToStorage(payload)
    if (!fanUserId) {
      setAutoDJStatusMessage('Settings saved on this device')
      setAutoDJDirty(false)
      return
    }
    setAutoDJSaving(true)
    try {
      const res = await fetch('/api/fan/auto-dj-settings', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: payload, mixQualityHistory }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (body?.code === 'MIGRATION_REQUIRED') {
          setAutoDJStatusMessage('Cloud save pending DB migration — saved locally')
        } else {
          setAutoDJStatusMessage('Could not save to account — stored locally')
        }
        return
      }
      setAutoDJStatusMessage('Auto DJ settings saved to your account')
      setAutoDJDirty(false)
    } catch {
      setAutoDJStatusMessage('Could not save to account — stored locally')
    } finally {
      setAutoDJSaving(false)
    }
  }, [autoDJConfig, autoDJLeadIn, fanUserId, mixQualityHistory])

  const prevAutoDJEnabledRef = useRef(isAutoDJEnabled)
  useEffect(() => {
    setAutoDJConfig((prev) =>
      prev.enabled === isAutoDJEnabled ? prev : { ...prev, enabled: isAutoDJEnabled },
    )
    if (prevAutoDJEnabledRef.current && !isAutoDJEnabled) {
      setAutoDJStatusMessage((msg) =>
        msg === 'Restored default Auto DJ settings' ? msg : '',
      )
      setWaveformMixOverlay(null)
      setWaveformGhostTape(null)
      // Symmetric EQ/filter chain — restore live deck strip to saved gains.
      const liveDeck: DeckId = playbackDeckRef.current === 'next' ? 'b' : 'a'
      const liveEq = deckUiRef.current[liveDeck].eqGains
      mixEngineRef.current?.setDeckEqGains(liveDeck, liveEq, { instant: true })
    }
    prevAutoDJEnabledRef.current = isAutoDJEnabled
    if (isAutoDJEnabled || isIDJEnabled || expandedMode === 'dj') void loadMixEngineClass()
  }, [isAutoDJEnabled, isIDJEnabled, expandedMode])

  useEffect(() => {
    if (!autoDJSettingsMenu) return
    const openedAt = performance.now()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAutoDJSettingsMenu()
    }
    const onPointer = (e: PointerEvent) => {
      // Ignore the opening gesture (and Playwright's leftover pointer events).
      if (performance.now() - openedAt < 400) return
      if (e.button === 2) return
      const target = e.target as HTMLElement | null
      if (target?.closest('[data-auto-dj-settings-menu]')) return
      if (target?.closest('[aria-label="Enable Auto DJ"], [aria-label="Disable Auto DJ"]')) return
      closeAutoDJSettingsMenu()
    }
    window.addEventListener('keydown', onKey)
    const timer = window.setTimeout(() => {
      window.addEventListener('pointerdown', onPointer)
    }, 400)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer)
    }
  }, [autoDJSettingsMenu, closeAutoDJSettingsMenu])

  useEffect(() => {
    if (!idjSettingsMenu) return
    const openedAt = performance.now()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeIDJSettingsMenu()
    }
    const onPointer = (e: PointerEvent) => {
      if (performance.now() - openedAt < 400) return
      if (e.button === 2) return
      const target = e.target as HTMLElement | null
      if (target?.closest('[data-idj-settings-menu]')) return
      if (target?.closest('[aria-label="Enable iDJ"], [aria-label="Disable iDJ"]')) return
      closeIDJSettingsMenu()
    }
    window.addEventListener('keydown', onKey)
    const timer = window.setTimeout(() => {
      window.addEventListener('pointerdown', onPointer)
    }, 400)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer)
    }
  }, [idjSettingsMenu, closeIDJSettingsMenu])

  const [allSourceTracks, setAllSourceTracks] = useState<Track[]>([])

  const defaultSettings: PlayerSettings = {
    volume: 1,
    isMuted: false,
    isShuffled: false,
    catalogRandom: true,
    repeatMode: 'off',
    playbackRate: 1,
    crossfadeDuration: 0,
    eqPreset: 'flat',
    bufferSize: 'auto',
    streamQuality: 'auto',
    prioritizeBackgroundPlayback: true,
  }

  const loadSettings = (): PlayerSettings => {
    if (typeof window === 'undefined') return defaultSettings
    const saved = localStorage.getItem('musicPlayerSettings')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        return { ...defaultSettings, ...parsed }
      } catch {
        return defaultSettings
      }
    }
    return defaultSettings
  }

  const [settings, setSettings] = useState<PlayerSettings>(loadSettings)
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const primeQueue = useCallback(() => {
    if (!onQueueChange) return
    const pool = autoDJConfig.enabled && autoDJLibrary.length > 0
      ? autoDJLibrary
      : allSourceTracks.length > 0
        ? allSourceTracks
        : autoDJLibrary
    if (pool.length === 0) {
      setAutoDJStatusMessage('No library tracks to prime')
      return
    }
    const exclude = new Set(queue.map((track) => track.id))
    const primeCount = Math.max(1, Math.min(autoDJConfig.lookahead, 8))
    const useRandom = settings.catalogRandom || !autoDJConfig.enabled
    const remaining = pool.filter((track) => !exclude.has(track.id))
    const selection =
      useRandom && isOrderedReleaseRandomScope(currentSource)
        ? pickNextOrderedTracks(pool, exclude, primeCount, {
            preferAfterId: currentTrack?.id ?? null,
          })
        : useRandom
          ? pickRandomUnusedTracks(pool, exclude, primeCount, {
              allowReshuffle: true,
              keepExcluded: currentTrack ? [currentTrack.id] : [],
              recentIds: getRecentPlayedTrackIds(),
            })
          : remaining.slice(0, primeCount)
    if (selection.length === 0 && useRandom && isOrderedReleaseRandomScope(currentSource)) {
      void onRequestRandomRelease?.().then((jumped) => {
        if (jumped) {
          setAutoDJStatusMessage('Primed a fresh random crate / EP')
        } else {
          setAutoDJStatusMessage('Queue already contains library tracks')
        }
      })
      return
    }
    if (selection.length === 0) {
      setAutoDJStatusMessage('Queue already contains library tracks')
      return
    }
    onQueueChange([...queue, ...selection])
    const scope = catalogScopeLabel(currentSource)
    const modeLabel = useRandom
      ? isOrderedReleaseRandomScope(currentSource)
        ? 'in-order '
        : 'random '
      : ''
    setAutoDJStatusMessage(
      `Primed ${selection.length} ${modeLabel}track${selection.length > 1 ? 's' : ''} from ${scope}`,
    )
  }, [
    autoDJLibrary,
    allSourceTracks,
    queue,
    onQueueChange,
    autoDJConfig.lookahead,
    autoDJConfig.enabled,
    settings.catalogRandom,
    currentTrack,
    currentSource,
    onRequestRandomRelease,
  ])

  // Update body data attribute when in DJ mode (for hiding header)
  useEffect(() => {
    if (typeof document !== 'undefined') {
      if (isExpanded && expandedMode === 'dj') {
        document.body.setAttribute('data-dj-mode', 'true')
      } else {
        document.body.removeAttribute('data-dj-mode')
      }
    }
  }, [isExpanded, expandedMode])
  const [isLoadingSourceTracks, setIsLoadingSourceTracks] = useState(false)
  const [isMiniMode, setIsMiniMode] = useState(() => {
    const saved = readMusicPlayerState()?.chrome?.isMiniMode
    return typeof saved === 'boolean' ? saved : DEFAULT_PLAYER_CHROME.isMiniMode
  })
  const [isWaveformCollapsed, setIsWaveformCollapsed] = useState(() => {
    const saved = readMusicPlayerState()?.chrome?.isWaveformCollapsed
    return typeof saved === 'boolean' ? saved : DEFAULT_PLAYER_CHROME.isWaveformCollapsed
  })
  useEffect(() => {
    setPlayerChrome({ isMiniMode, isExpanded, isWaveformCollapsed })
    patchMusicPlayerState({ chrome: { isMiniMode, isExpanded, isWaveformCollapsed } })
  }, [isMiniMode, isExpanded, isWaveformCollapsed, setPlayerChrome])
  const [showTrackDetails, setShowTrackDetails] = useState(false)
  const [waveformData, setWaveformData] = useState<WaveformSample[]>([])
  const [precomputedPeaks, setPrecomputedPeaks] = useState<number[] | null>(null)
  const [waveformMode, setWaveformMode] = useState<WaveformColorMode>(() => {
    if (typeof window === 'undefined') return 'drums'
    try {
      const stored = localStorage.getItem('sergik.waveformColorMode')
      // CDJ decks default to drums overlay. Soft-migrate prior energy/channel slabs.
      if (
        !stored ||
        stored === 'gradient' ||
        stored === 'classic' ||
        stored === 'channel' ||
        stored === 'energy'
      ) {
        return 'drums'
      }
      return normalizeWaveformColorMode(stored)
    } catch {
      return 'drums'
    }
  })
  const [waveformLayerLayout, setWaveformLayerLayout] = useState<WaveformLayerLayout>(() => {
    if (typeof window === 'undefined') return 'overlay'
    try {
      const stored = localStorage.getItem('sergik.waveformLayerLayout')
      if (!stored || stored === 'merged') return 'overlay'
      return normalizeWaveformLayerLayout(stored)
    } catch {
      return 'overlay'
    }
  })
  /** 0 = full track; otherwise bars visible (4/8/16… ladder). */
  const [waveformVisibleBars, setWaveformVisibleBars] = useState(0)
  const [waveformOffset, setWaveformOffset] = useState(0) // For panning when zoomed
  const [waveformFollow, setWaveformFollow] = useState(true) // Follow mode - keep playhead centered when zoomed (CDJ)
  const [waveformOverview, setWaveformOverview] = useState(true) // Full-track overview strip under waveform
  const [waveformPhaseMeter, setWaveformPhaseMeter] = useState(true) // CDJ phase / grid-align meter
  const [phaseMeterOptions, setPhaseMeterOptions] = useState<PhaseMeterOptions>(() =>
    readPhaseMeterOptionsFromStorage(),
  )
  const waveformPhaseMeterRef = useRef(waveformPhaseMeter)
  waveformPhaseMeterRef.current = waveformPhaseMeter
  const phaseMeterOptionsRef = useRef(phaseMeterOptions)
  phaseMeterOptionsRef.current = phaseMeterOptions
  const patchPhaseMeterOptions = useCallback((patch: Partial<PhaseMeterOptions>) => {
    setPhaseMeterOptions((prev) => {
      const next = { ...prev, ...patch }
      writePhaseMeterOptionsToStorage(next)
      return next
    })
  }, [])
  /** Incoming Auto DJ deck has its own zoom/follow so live-deck ticks cannot reset it. */
  const [incomingVisibleBars, setIncomingVisibleBars] = useState(0)
  const [incomingOffset, setIncomingOffset] = useState(0)
  const [incomingFollow, setIncomingFollow] = useState(false)
  const incomingZoomTrackIdRef = useRef<string | null>(null)
  // Derived: 1 = full overview; >1 = zoomed bar window (keeps legacy checks working)
  const waveformZoom = waveformVisibleBars > 0 ? Math.max(1.05, 128 / waveformVisibleBars) : 1
  const [waveformMirror, setWaveformMirror] = useState(true) // Mirrored colorful view at 1x (matches waveform menu defaults)
  const [waveformSpeed, setWaveformSpeed] = useState(1.0) // Waveform animation speed (0.25x to 4x)
  const [waveformHorizontalZoom, setWaveformHorizontalZoom] = useState(0.5) // Horizontal zoom (0.1x to 8x) - default 0.5x for slower movement
  const [waveformMenu, setWaveformMenu] = useState<{
    x: number
    y: number
    deck: 'a' | 'b'
    /** Media time under the right-click (no grid snap). */
    timeSec: number | null
  } | null>(null)
  const [waveformMenuSection, setWaveformMenuSection] = useState<
    null | 'color' | 'layer' | 'zoom' | 'sonicDna' | 'phase'
  >(null)
  const waveformMenuRef = useRef<HTMLDivElement>(null)
  const waveformMenuClamp = useClampedFixedMenuPosition(
    !!waveformMenu,
    waveformMenu,
    { width: 224, height: 640 },
    { externalRef: waveformMenuRef },
  )
  const [phaseMeterMenu, setPhaseMeterMenu] = useState<{
    x: number
    y: number
    deck: 'a' | 'b'
  } | null>(null)
  const phaseMeterMenuRef = useRef<HTMLDivElement>(null)
  const phaseMeterMenuClamp = useClampedFixedMenuPosition(
    !!phaseMeterMenu,
    phaseMeterMenu,
    { width: 256, height: 640 },
    { externalRef: phaseMeterMenuRef },
  )
  const autoDJMenuClamp = useClampedFixedMenuPosition(
    !!autoDJSettingsMenu,
    autoDJSettingsMenu
      ? { x: autoDJSettingsMenu.x - 448, y: autoDJSettingsMenu.y }
      : null,
    { width: 448, height: 560 },
  )
  const idjMenuClamp = useClampedFixedMenuPosition(
    !!idjSettingsMenu,
    idjSettingsMenu ? { x: idjSettingsMenu.x - 288, y: idjSettingsMenu.y } : null,
    { width: 288, height: 420 },
  )
  const [sonicDnaReportOpen, setSonicDnaReportOpen] = useState(false)
  const [sonicDnaReportTrack, setSonicDnaReportTrack] = useState<Track | null>(null)
  const sonicDnaReportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      localStorage.setItem('sergik.waveformColorMode', waveformMode)
    } catch {
      /* ignore */
    }
  }, [waveformMode])

  useEffect(() => {
    try {
      localStorage.setItem('sergik.waveformLayerLayout', waveformLayerLayout)
    } catch {
      /* ignore */
    }
  }, [waveformLayerLayout])

  // Beat grid state — offsetSec is within-beat phase [0, beatSec); 0 = downbeat at file t=0
  const [beatGridEnabled, setBeatGridEnabled] = useState(false)
  const [beatGridOffsetSec, setBeatGridOffsetSec] = useState(0)
  const beatGridOffsetSecRef = useRef(0)
  beatGridOffsetSecRef.current = beatGridOffsetSec
  const [beatGridBeatsPerBar, setBeatGridBeatsPerBar] = useState(4)
  const [beatGridLock, setBeatGridLock] = useState<number | null>(null)
  /** Admin/user verified grid — skip auto re-align and persist on sonic_dna. */
  const [beatGridLocked, setBeatGridLocked] = useState(false)
  const beatGridSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoAlignedSigRef = useRef<string | null>(null)
  const [originalQueue, setOriginalQueue] = useState<Track[]>([])
  const [crossfadeActive, setCrossfadeActive] = useState(false)
  const touchStartXRef = useRef<number | null>(null)
  const touchStartYRef = useRef<number | null>(null)
  const [isMobileControlsOpen, setIsMobileControlsOpen] = useState(false)
  const [detectedBPM, setDetectedBPM] = useState<number | null>(null)
  const [tapeBpm, setTapeBpm] = useState<number | null>(null)
  const [tapeGridByTrackId, setTapeGridByTrackId] = useState<
    Record<string, { bpm: number; offsetSec: number }>
  >({})
  const rememberTapeGrid = useCallback((trackId: string, bpm: number, offsetSec: number) => {
    if (!trackId || !(bpm > 0) || !Number.isFinite(offsetSec)) return
    setTapeGridByTrackId((prev) => {
      const cur = prev[trackId]
      if (
        cur &&
        Math.abs(cur.bpm - bpm) < 0.01 &&
        Math.abs(cur.offsetSec - offsetSec) < 0.002
      ) {
        return prev
      }
      return { ...prev, [trackId]: { bpm, offsetSec } }
    })
  }, [])
  const [isDetectingBPM, setIsDetectingBPM] = useState(false)
  const bpmCacheRef = useRef<Map<string, number | null>>(new Map())
  const tapTempoTimeoutRef = useRef<{ a: ReturnType<typeof setTimeout> | null; b: ReturnType<typeof setTimeout> | null }>({
    a: null,
    b: null,
  })
  const loggedErrorsRef = useRef<Set<string>>(new Set())
  type DeckUiSlice = {
    playbackRate: number
    tapTempoTaps: number[]
    tapTempoBPM: number | null
    tapTempoSectionBpms: number[]
    eqGains: { low: number; mid: number; high: number }
    detectedBpm: number | null
  }
  const defaultDeckUiSlice = (): DeckUiSlice => ({
    playbackRate: 1,
    tapTempoTaps: [],
    tapTempoBPM: null,
    tapTempoSectionBpms: [],
    eqGains: { low: 0, mid: 0, high: 0 },
    detectedBpm: null,
  })
  const [deckUi, setDeckUi] = useState<{ a: DeckUiSlice; b: DeckUiSlice }>({
    a: defaultDeckUiSlice(),
    b: defaultDeckUiSlice(),
  })
  const deckUiRef = useRef(deckUi)
  deckUiRef.current = deckUi
  const [mixVisualProgress, setMixVisualProgress] = useState<number | null>(null)
  const mixProgressPendingRef = useRef<number | null>(null)
  const mixUiSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mixUiPendingRef = useRef<{
    progress?: number | null
    deckRates: Partial<Record<DeckId, number>>
    deckEq: Partial<Record<DeckId, { low: number; mid: number; high: number }>>
    deckFilters: Partial<Record<DeckId, { hpfHz: number; lpfHz: number }>>
  }>({ deckRates: {}, deckEq: {}, deckFilters: {} })
  const [deckFilterUi, setDeckFilterUi] = useState<{
    a: { hpfHz: number; lpfHz: number }
    b: { hpfHz: number; lpfHz: number }
  }>({
    a: { hpfHz: 20, lpfHz: 20000 },
    b: { hpfHz: 20, lpfHz: 20000 },
  })
  const [autoDJOutCountdown, setAutoDJOutCountdown] = useState<number | null>(null)
  const [mixQualityFlash, setMixQualityFlash] = useState<{
    grade: MixQualityGrade
    until: number
  } | null>(null)
  const postHandoffTempoUntilRef = useRef(0)
  const MIX_UI_SYNC_MS = 50
  const [connectionQuality, setConnectionQuality] = useState<'slow' | 'medium' | 'fast'>('fast')
  const [networkEffectiveType, setNetworkEffectiveType] = useState<string | null>(null)
  const [isVisible, setIsVisible] = useState(true)
  const processedWaveformTrackRef = useRef<string | null>(null)
  /** Static track envelope (peaks) — never replaced by live oscilloscope data. */
  const trackWaveformBaseRef = useRef<typeof waveformData>([])
  const onQueueChangeRef = useRef(onQueueChange)
  const updatedQueueTrackRef = useRef<Set<string>>(new Set())
  const queueRef = useRef(queue)
  queueRef.current = queue
  
  const audioRef = useRef<HTMLAudioElement>(null)
  const nextAudioRef = useRef<HTMLAudioElement>(null)
  /** Always points at the live transport element (follows deck after mixes). */
  const liveAudioRef = useRef<HTMLAudioElement | null>(null)
  /** Which <audio> is the live playhead after a deck-swap mix. */
  const playbackDeckRef = useRef<'main' | 'next'>('main')
  /** Skip audio.src reload once after deck-swap handoff. */
  const skipSrcReloadRef = useRef(false)
  /** Prevents ended/clock-poll from skip-looping the queue after a track change. */
  const endedTrackIdRef = useRef<string | null>(null)
  /** True while we own a src swap — loadstart must not flip isLoading (that pauses playback). */
  const srcSwapRef = useRef(false)
  /** Last id+url bound on the live element so effect re-runs do not load() again. */
  const lastBoundPlaybackRef = useRef<{ id: string; url: string }>({ id: '', url: '' })
  const trackSwitchAtRef = useRef(0)
  const isPlayingRef = useRef(isPlaying)
  isPlayingRef.current = isPlaying
  /** iDJ per-deck skip: keep idle audio/selection while the live track changes. */
  const idjDeckSkipLockRef = useRef(false)
  /** Src swaps fire a fake `ended` while currentTime/duration are still the previous file. */
  const idjEndedArmedRef = useRef({ live: true, idle: true })
  const idjIgnoreEndedUntilRef = useRef(0)
  /** Suppress Buffering… UI while a same-deck src swap / cue seek settles. */
  const idjIgnoreBufferUiUntilRef = useRef(0)
  const IDJ_ENDED_GUARD_MS = 900
  const IDJ_BUFFER_UI_GUARD_MS = 1600
  const disarmIdjEnded = (deck: 'live' | 'idle') => {
    idjEndedArmedRef.current[deck] = false
    const until = Date.now() + IDJ_ENDED_GUARD_MS
    idjIgnoreEndedUntilRef.current = Math.max(idjIgnoreEndedUntilRef.current, until)
    idjIgnoreBufferUiUntilRef.current = Math.max(
      idjIgnoreBufferUiUntilRef.current,
      Date.now() + IDJ_BUFFER_UI_GUARD_MS,
    )
    trackSwitchAtRef.current = Date.now()
  }
  const armIdjEnded = (deck: 'live' | 'idle') => {
    idjEndedArmedRef.current[deck] = true
  }
  const isGenuineMediaEnd = (el: HTMLMediaElement | null, deck: 'live' | 'idle') => {
    if (!el) return false
    if (!idjEndedArmedRef.current[deck]) return false
    if (Date.now() < idjIgnoreEndedUntilRef.current) return false
    if (idjDeckSkipLockRef.current && deck === 'live') return false
    const dur = el.duration
    if (!Number.isFinite(dur) || dur < 0.5) return false
    const t = Number.isFinite(el.currentTime) ? el.currentTime : 0
    return t >= dur - 0.25
  }
  const stepLiveDeckRef = useRef<(direction: 1 | -1, opts?: { play?: boolean }) => void>(() => {})
  /** Guards React effects from cold-loading main during deck-swap settle. */
  type DeckHandoffState = {
    trackId: string
    deck: 'main' | 'next'
    incomingTargetRate: number
    untilMs: number
  }
  const deckHandoffRef = useRef<DeckHandoffState | null>(null)
  const HANDOFF_GUARD_MS = 700
  const isDeckHandoffActive = useCallback((trackId?: string | null) => {
    const h = deckHandoffRef.current
    if (!h) return false
    if (Date.now() > h.untilMs) {
      deckHandoffRef.current = null
      return false
    }
    if (trackId != null && h.trackId !== trackId) return false
    return true
  }, [])
  const armDeckHandoff = useCallback(
    (track: Track, deck: 'main' | 'next', incomingTargetRate: number) => {
      deckHandoffRef.current = {
        trackId: track.id,
        deck,
        incomingTargetRate,
        untilMs: Date.now() + HANDOFF_GUARD_MS,
      }
      skipSrcReloadRef.current = true
    },
    [],
  )
  const phraseMixLockRef = useRef(false)
  const mixEngineRef = useRef<MixEngine | null>(null)
  const lastMixPlanRef = useRef<MixPlan | null>(null)
  const cuedIdleTrackIdRef = useRef<string | null>(null)
  /** Track id whose idle decoder was silently warmed before OUT. */
  const autoDJIdleWarmedRef = useRef<string | null>(null)
  const [autoDJCuedTrackId, setAutoDJCuedTrackId] = useState<string | null>(null)
  const setCuedIdleTrackId = useCallback((id: string | null) => {
    cuedIdleTrackIdRef.current = id
    setAutoDJCuedTrackId(id)
  }, [])
  const precueIdleForQueueSuccessorRef = useRef<
    ((liveTrack: Track, trackQueue: Track[]) => Promise<void>) | null
  >(null)
  /** Debounce id for N+2 waveform/grid prefetch during Auto DJ. */
  const mixLookahead2IdRef = useRef<string | null>(null)
  const rateEaseRafRef = useRef<number | null>(null)
  const rateEaseLockRef = useRef(false)
  const lastTempoCompRateRef = useRef(1)
  const tempoRampCancelRef = useRef<(() => void) | null>(null)

  const getPlaybackAudio = useCallback((): HTMLAudioElement | null => {
    const live =
      playbackDeckRef.current === 'next' ? nextAudioRef.current : audioRef.current
    liveAudioRef.current = live
    return live
  }, [])

  const getIdleAudio = useCallback((): HTMLAudioElement | null => {
    return playbackDeckRef.current === 'next' ? audioRef.current : nextAudioRef.current
  }, [])

  const readDeckMediaTime = useCallback((deck: DeckId): number => {
    const engine = mixEngineRef.current
    if (engine) return engine.getDeckMediaTime(deck)
    const el = deck === 'b' ? nextAudioRef.current : audioRef.current
    return el && Number.isFinite(el.currentTime) ? el.currentTime : 0
  }, [])

  const seekDeckMediaTime = useCallback((deck: DeckId, sec: number) => {
    const engine = mixEngineRef.current
    if (engine) {
      engine.seekDeckMedia(deck, sec)
      return
    }
    const el = deck === 'b' ? nextAudioRef.current : audioRef.current
    if (el) el.currentTime = sec
  }, [])

  const readLiveMediaTime = useCallback((): number => {
    const engine = mixEngineRef.current
    if (engine) return engine.getDeckMediaTime()
    const live = getPlaybackAudio()
    return live && Number.isFinite(live.currentTime) ? live.currentTime : 0
  }, [getPlaybackAudio])

  const detectedBPMRef = useRef(detectedBPM)
  detectedBPMRef.current = detectedBPM

  /** Live deck tempo — feeds MixEngine beatmatch (ExpandedPlayerControls slider). */
  const getOutgoingPlaybackRate = useCallback((): number => {
    const live = getPlaybackAudio()
    const rate = live?.playbackRate
    if (typeof rate === 'number' && rate > 0) return rate
    const pref = settingsRef.current.playbackRate
    return typeof pref === 'number' && pref > 0 ? pref : 1
  }, [getPlaybackAudio])

  const toMixTrackRef = useCallback((track: Track) => {
    const cachedOffset = mixGridOffsetCacheRef.current.get(track.id)
    const bpm =
      resolvePlaybackBpm(track, detectedBPMRef.current) ??
      track.bpm ??
      detectedBPMRef.current ??
      null
    const beatSec = 60 / (bpm && bpm > 0 ? bpm : 120)
    const rawOffset =
      typeof cachedOffset === 'number' ? cachedOffset : track.beat_grid_offset
    const slots = readHotCueSlots(track.id)
    const hotCues = HOT_CUE_SLOTS.flatMap((slot) => {
      const t = slots[slot]
      return typeof t === 'number' ? [{ timeSec: t, label: `Hot ${slot}` }] : []
    })
    const memory = readIDJMemoryCues()[track.id]
    return {
      id: track.id,
      file: track.file,
      title: track.title,
      bpm,
      beat_grid_offset:
        typeof rawOffset === 'number' && Number.isFinite(rawOffset)
          ? toPhaseOnlyOffsetSec(rawOffset, beatSec)
          : playbackGridPhaseSec(track, bpm),
      duration: track.duration ?? null,
      sonic_dna: track.sonic_dna,
      energy_level: track.energy_level ?? null,
      hotCues: hotCues.length ? hotCues : undefined,
      memoryCueSec: typeof memory === 'number' && Number.isFinite(memory) ? memory : null,
    }
  }, [])

  /** Hot cues mirror — filled after `waveformHotCues` state is declared. */
  const waveformHotCuesRef = useRef<WaveformHotCue[]>([])

  /** Memo of the inputs each track's grid offset was last derived from. */
  const mixGridOffsetSigRef = useRef<Map<string, { sig: string; offset: number }>>(new Map())

  const cacheMixGridOffset = useCallback(
    (
      track: Track,
      peaks: Array<number | { positive?: number; negative?: number; rms?: number }>,
      durationSec: number,
    ) => {
      // The Auto DJ tick calls this ten times a second, but onset detection over
      // the full peak array only yields a new answer when the tape or duration
      // changes — so key on those and reuse the result in between.
      const sig = `${peaks.length}:${Math.round(durationSec * 100)}`
      const memo = mixGridOffsetSigRef.current.get(track.id)
      if (memo && memo.sig === sig) return memo.offset

      if (
        (isGridManual(track.sonic_dna) || track.grid_manual === true) &&
        !isUnsetOffset(track.beat_grid_offset)
      ) {
        const bpm = resolvePlaybackBpm(track) ?? track.bpm ?? 120
        const beatSec = 60 / (bpm > 0 ? bpm : 120)
        const offset = toPhaseOnlyOffsetSec(track.beat_grid_offset!, beatSec)
        mixGridOffsetCacheRef.current.set(track.id, offset)
        mixGridOffsetSigRef.current.set(track.id, { sig, offset })
        rememberTapeGrid(track.id, bpm, offset)
        return offset
      }

      // Catalog phase (including explicit 0) wins over peak re-derivation.
      if (!isUnsetOffset(track.beat_grid_offset)) {
        const bpm = resolvePlaybackBpm(track) ?? track.bpm ?? 120
        const beatSec = 60 / (bpm > 0 ? bpm : 120)
        const offset = toPhaseOnlyOffsetSec(track.beat_grid_offset!, beatSec)
        mixGridOffsetCacheRef.current.set(track.id, offset)
        mixGridOffsetSigRef.current.set(track.id, { sig, offset })
        rememberTapeGrid(track.id, bpm, offset)
        return offset
      }

      const ref = toMixTrackRef(track)
      const tape = resolveMixTapeGrid(ref, { peaks, durationSec })
      const offset = tape.offsetSec
      mixGridOffsetCacheRef.current.set(track.id, offset)
      mixGridOffsetSigRef.current.set(track.id, { sig, offset })
      rememberTapeGrid(track.id, tape.bpm, offset)
      return offset
    },
    [toMixTrackRef, rememberTapeGrid],
  )

  const withMixGrid = useCallback(
    (track: Track) => {
      const ref = toMixTrackRef(track)
      const cached = mixGridOffsetCacheRef.current.get(track.id)
      const ghost = ghostSamplesRef.current
      let waveformPeaks: Array<number | { positive?: number; negative?: number; rms?: number }> | undefined
      let waveformDurationSec: number | undefined
      if (ghost?.trackId === track.id) {
        waveformPeaks = ghost.samples
        waveformDurationSec = ghost.durationSec
      } else if (
        trackWaveformBaseRef.current.length >= 64 &&
        autoDJCurrentTrackRef.current?.id === track.id
      ) {
        waveformPeaks = trackWaveformBaseRef.current
        waveformDurationSec =
          autoDJDurationRef.current > 0
            ? autoDJDurationRef.current
            : track.duration ?? undefined
      }
      const hotCues =
        autoDJCurrentTrackRef.current?.id === track.id
          ? waveformHotCuesRef.current.map((c) => ({ timeSec: c.timeSec, label: c.label }))
          : undefined
      return {
        ...ref,
        beat_grid_offset: (() => {
          if (isGridLocked(track.sonic_dna)) {
            const locked =
              typeof track.beat_grid_offset === 'number' && Number.isFinite(track.beat_grid_offset)
                ? Math.max(0, track.beat_grid_offset)
                : typeof ref.beat_grid_offset === 'number'
                  ? ref.beat_grid_offset
                  : 0
            return locked
          }
          // Prefer persisted UI grid over peak-cache when both exist.
          if (
            typeof track.beat_grid_offset === 'number' &&
            Number.isFinite(track.beat_grid_offset) &&
            track.beat_grid_offset >= 0
          ) {
            return track.beat_grid_offset
          }
          return cached != null ? cached : ref.beat_grid_offset
        })(),
        waveformPeaks,
        waveformDurationSec,
        hotCues,
      }
    },
    [toMixTrackRef],
  )

  const buildMixIntelligenceForPair = useCallback(
    (outTrack: Track, inTrack: Track, style: MixPlan['style'], incomingTargetRate?: number) => {
      const outRef = withMixGrid(outTrack)
      const inRef = withMixGrid(inTrack)
      const cfg = autoDJConfigRef.current
      return resolveAutoDjMixIntelligence({
        outgoing: outRef,
        incoming: inRef,
        style,
        mixStyle: cfg.mixStyle,
        mixTechniques: cfg.mixTechniques,
        energyCurve: cfg.energyCurve,
        outgoingRate: getOutgoingPlaybackRate(),
        incomingTargetRate: incomingTargetRate ?? settingsRef.current.playbackRate,
        qualityGrade: lastMixQualityRef.current?.grade,
      })
    },
    [withMixGrid, getOutgoingPlaybackRate],
  )

  const computeMixIncomingRate = useCallback(
    (outTrack: Track | null | undefined, inTrack: Track) => {
      const outBpm =
        (outTrack && resolvePlaybackBpm(outTrack, detectedBPMRef.current)) ??
        outTrack?.bpm ??
        detectedBPMRef.current ??
        120
      const inBpm = resolvePlaybackBpm(inTrack, null) ?? inTrack.bpm ?? 120
      return computeMixDeckRates({
        outgoingBpm: outBpm,
        incomingBpm: inBpm,
        outgoingPlaybackRate: getOutgoingPlaybackRate(),
        incomingTargetRate: settingsRef.current.playbackRate,
      }).incomingRate
    },
    [getOutgoingPlaybackRate]
  )

  const applyFormantForRate = useCallback((rate: number) => {
    const liveDeck: DeckId = playbackDeckRef.current === 'next' ? 'b' : 'a'
    const engine = mixEngineRef.current
    if (!engine) return
    const gainMul = mixIntelRef.current?.incomingStretch.formantGain ?? 1
    const prev = formantCompensationGains(lastTempoCompRateRef.current)
    const next = formantCompensationGains(rate)
    const cur = engine.getDeckEqGains(liveDeck)
    const updated = {
      low: cur.low - prev.low * gainMul + next.low * gainMul,
      mid: cur.mid - prev.mid * gainMul + next.mid * gainMul,
      high: cur.high - prev.high * gainMul + next.high * gainMul,
    }
    engine.setDeckEqGains(liveDeck, updated, { instant: false })
    setDeckUi((prevUi) => ({
      ...prevUi,
      [liveDeck]: { ...prevUi[liveDeck], eqGains: updated },
    }))
    lastTempoCompRateRef.current = rate
  }, [])

  const applyDeckStripEq = useCallback(
    (
      deck: DeckId,
      gains: { low: number; mid: number; high: number },
      opts?: { instant?: boolean },
    ) => {
      mixEngineRef.current?.setDeckEqGains(deck, gains, opts)
      setDeckUi((prev) => ({
        ...prev,
        [deck]: { ...prev[deck], eqGains: gains },
      }))
    },
    [],
  )

  const applyLiveDeckTempo = useCallback(
    (rate: number, instant = true) => {
      const liveDeck = playbackDeckRef.current === 'next' ? 'b' : 'a'
      const live = getPlaybackAudio()
      const clamped = clampTempoRate(rate)
      if (live) {
        configureKeyLock(live, true)
        applyDeckTempo(live, clamped, { keyLock: true, instant })
      }
      mixEngineRef.current?.setDeckPlaybackRate(liveDeck, clamped, { instant })
      setDeckUi((prev) => ({
        ...prev,
        [liveDeck]: { ...prev[liveDeck], playbackRate: clamped },
      }))
      applyFormantForRate(clamped)
    },
    [getPlaybackAudio, applyFormantForRate],
  )

  const flushMixUiSync = useCallback(() => {
    mixUiSyncTimerRef.current = null
    const pending = mixUiPendingRef.current
    if (pending.progress !== undefined) {
      setMixVisualProgress(pending.progress)
      setWaveformMixOverlay((prev) =>
        prev?.active ? { ...prev, blendProgress: pending.progress ?? null } : prev,
      )
    }
    const hasRates = pending.deckRates.a != null || pending.deckRates.b != null
    const hasEq = pending.deckEq.a != null || pending.deckEq.b != null
    if (hasRates || hasEq) {
      setDeckUi((prev) => ({
        a: {
          ...prev.a,
          ...(pending.deckRates.a != null ? { playbackRate: pending.deckRates.a } : {}),
          ...(pending.deckEq.a != null ? { eqGains: pending.deckEq.a } : {}),
        },
        b: {
          ...prev.b,
          ...(pending.deckRates.b != null ? { playbackRate: pending.deckRates.b } : {}),
          ...(pending.deckEq.b != null ? { eqGains: pending.deckEq.b } : {}),
        },
      }))
    }
    const hasFilters = pending.deckFilters.a != null || pending.deckFilters.b != null
    if (hasFilters) {
      setDeckFilterUi((prev) => ({
        a: pending.deckFilters.a ?? prev.a,
        b: pending.deckFilters.b ?? prev.b,
      }))
    }
    mixUiPendingRef.current = { deckRates: {}, deckEq: {}, deckFilters: {} }
  }, [])

  const scheduleMixUiSync = useCallback(() => {
    if (mixUiSyncTimerRef.current != null) return
    mixUiSyncTimerRef.current = window.setTimeout(flushMixUiSync, MIX_UI_SYNC_MS)
  }, [flushMixUiSync])

  const pushMixVisualProgress = useCallback(
    (raw: number) => {
      mixUiPendingRef.current.progress = Math.max(0, Math.min(1, raw))
      scheduleMixUiSync()
    },
    [scheduleMixUiSync],
  )

  const clearMixVisualProgress = useCallback(() => {
    if (mixUiSyncTimerRef.current != null) {
      clearTimeout(mixUiSyncTimerRef.current)
      mixUiSyncTimerRef.current = null
    }
    mixUiPendingRef.current = { deckRates: {}, deckEq: {}, deckFilters: {} }
    setMixVisualProgress(null)
    setWaveformMixOverlay((prev) =>
      prev?.active ? { ...prev, blendProgress: null } : prev,
    )
  }, [])

  const getDeckStripEq = useCallback((deck: DeckId) => {
    const engine = mixEngineRef.current
    if (engine) return engine.getDeckEqGains(deck)
    return deckUiRef.current[deck].eqGains
  }, [])

  /** Bump when the live media element changes so WaveformStage re-arms its clock. */
  const [waveformMediaSyncKey, setWaveformMediaSyncKey] = useState('main')
  const [waveformMixOverlay, setWaveformMixOverlay] = useState<WaveformMixOverlay | null>(null)
  const [waveformRescanNonce, setWaveformRescanNonce] = useState(0)
  const [waveformGhostTape, setWaveformGhostTape] = useState<WaveformGhostTape | null>(null)
  type DeckWaveformPack = {
    trackId: string
    samples: WaveformSample[]
    durationSec: number
  }
  const [deckWaveformCache, setDeckWaveformCache] = useState<{
    a?: DeckWaveformPack
    b?: DeckWaveformPack
  }>({})
  const [waveformHotCues, setWaveformHotCues] = useState<WaveformHotCue[]>([])
  waveformHotCuesRef.current = waveformHotCues
  const [idjCrossfade, setIdjCrossfade] = useState(0)
  /** Auto DJ stays on; user owns channel XF (engine manualXfOverride). */
  const [autoDjXfUnlocked, setAutoDjXfUnlocked] = useState(false)
  /** Preserve XF position when unlocking from Auto DJ (skip live-deck snap once). */
  const idjXfSeedRef = useRef<number | null>(null)
  const [idleDeckPlaying, setIdleDeckPlaying] = useState(false)
  const [idjIdleTrackId, setIdjIdleTrackId] = useState<string | null>(null)
  /** Full track for cue deck until playNext lands it in `queue` (same-tick paint). */
  const [cueDeckTrackOverride, setCueDeckTrackOverride] = useState<Track | null>(null)
  const [idjMemoryCues, setIdjMemoryCues] = useState<Record<string, number>>({})
  const idjMemoryCuesRef = useRef<Record<string, number>>({})
  idjMemoryCuesRef.current = idjMemoryCues
  const [idjActiveCues, setIdjActiveCues] = useState<IDJActiveCueMap>(emptyIDJActiveCueMap)
  const idjActiveCuesRef = useRef<IDJActiveCueMap>(emptyIDJActiveCueMap())
  const persistDeckActiveCue = useCallback(
    (deck: 'a' | 'b', trackId: string | undefined, cue: IDJActiveCue | null) => {
      if (!trackId) return
      const next = writeIDJActiveCue(deck, trackId, cue)
      idjActiveCuesRef.current = next
      setIdjActiveCues(next)
    },
    [],
  )
  const clearDeckActiveCueIf = useCallback(
    (deck: 'a' | 'b', trackId: string | undefined, match: IDJActiveCue) => {
      if (!trackId) return
      if (!sameIDJActiveCue(idjActiveCuesRef.current[deck]?.[trackId], match)) return
      persistDeckActiveCue(deck, trackId, null)
    },
    [persistDeckActiveCue],
  )
  const [idjConfig, setIdjConfig] = useState(DEFAULT_IDJ_CONFIG)
  const idjConfigRef = useRef(idjConfig)
  idjConfigRef.current = idjConfig
  const idjOnDeckEndedRef = useRef<(deck: 'live' | 'idle') => boolean>(() => false)
  const isIDJEnabledRef = useRef(false)
  isIDJEnabledRef.current = isIDJEnabled
  const idjIdleTrackIdRef = useRef<string | null>(null)
  idjIdleTrackIdRef.current = idjIdleTrackId
  const idjLiveTrackIdRef = useRef<string | null>(currentTrack?.id ?? null)
  const idleDeckPlayingRef = useRef(false)
  idleDeckPlayingRef.current = idleDeckPlaying
  const idleLoadGenRef = useRef(0)
  const liveLoadGenRef = useRef(0)
  const liveDeckIdRef = useRef<'a' | 'b'>('a')
  const lastDeckSkipAtRef = useRef<{ a: number; b: number }>({ a: 0, b: 0 })
  const ghostSamplesRef = useRef<{
    trackId: string
    samples: import('@/lib/audio/waveform-view').WaveformSample[]
    durationSec: number
    sonicDna?: unknown
  } | null>(null)
  /** Cached peak-aligned grid offsets for mix planning */
  const mixGridOffsetCacheRef = useRef<Map<string, number>>(new Map())
  const mixIntelRef = useRef<MixIntelligence | null>(null)

  const ensureMixEngine = useCallback((): MixEngine | null => {
    const main = audioRef.current
    const next = nextAudioRef.current
    if (!main || !next) return null
    if (!mixEngineRef.current) {
      const MixEngineCtor = getMixEngineClass()
      if (!MixEngineCtor) {
        void loadMixEngineClass()
          .then(() => {
            attachEngineGraphRef.current()
          })
          .catch(() => {
            /* fallback output keeps playback audible */
          })
        return null
      }
      const engine = new MixEngineCtor(main, next)
      engine.subscribe((ev) => {
        if (ev.type !== 'mix-quality') return
        const snap = snapshotMixQuality({
          samples: ev.samples,
          phaseRmsSec: ev.phaseRmsSec,
          kickResidualRmsMs: ev.kickResidualRmsMs,
        })
        if (snap) {
          setLastMixQuality(snap)
          setMixQualityFlash({ grade: snap.grade, until: Date.now() + 8000 })
          const plan = ev.plan
          const q = autoDJQueueRef.current
          const outT = q.find((t) => t.id === plan.outgoingTrackId)?.title
          const inT = q.find((t) => t.id === plan.incomingTrackId)?.title
          const hist = pushMixQualityHistory(snap, {
            outgoingTitle: outT,
            incomingTitle: inT,
            outgoingTrackId: plan.outgoingTrackId,
            incomingTrackId: plan.incomingTrackId,
            syncMode: autoDJConfigRef.current.syncMode,
            reason: plan.reason,
          })
          setMixQualityHistory(hist)
        }
        const suffix = formatMixQuality({
          phaseRmsSec: ev.phaseRmsSec,
          kickResidualRmsMs: ev.kickResidualRmsMs,
          grade: snap?.grade,
        })
        if (!suffix) return
        setAutoDJStatusMessage((prev) => {
          const base = prev.replace(
            /\s*·\s*sync\s+\d+ms\s*\/\s*kick\s+\d+ms(?:\s+\w+)?\s*$/i,
            '',
          )
          return `${base}${suffix}`
        })
      })
      mixEngineRef.current = engine
    }
    mixEngineRef.current.setKeyLock(true)
    const engine = mixEngineRef.current
    if (engine.getActiveTrack()) {
      // Follow the deck that is already playing — do not flip it back to A.
      playbackDeckRef.current = engine.getActiveDeck() === 'b' ? 'next' : 'main'
    } else {
      engine.setActiveDeck(playbackDeckRef.current === 'next' ? 'b' : 'a')
    }
    return engine
  }, [])

  /** Keep the element audible when MixEngine isn't available to own the graph. */
  const connectFallbackOutput = useCallback(() => {
    const ctx = audioContextRef.current
    const source = sourceNodeRef.current
    if (!ctx || !source) return false
    if (fallbackOutputRef.current) return true
    try {
      const gain = ctx.createGain()
      gain.gain.value = 1
      try {
        source.disconnect()
      } catch {
        /* ignore */
      }
      source.connect(gain)
      gain.connect(ctx.destination)
      const an = analyserRef.current
      if (an) {
        try {
          gain.connect(an)
        } catch {
          /* visualisation only */
        }
      }
      fallbackOutputRef.current = gain
      return true
    } catch {
      return false
    }
  }, [])

  const teardownFallbackOutput = useCallback(() => {
    const gain = fallbackOutputRef.current
    if (!gain) return
    const source = sourceNodeRef.current
    // Disconnect MES from the orphan gain first — otherwise Chrome stalls the element
    // (currentTime freezes, no error) with nowhere for samples to go.
    if (source) {
      try {
        source.disconnect(gain)
      } catch {
        try {
          source.disconnect()
        } catch {
          /* ignore */
        }
      }
    }
    try {
      gain.disconnect()
    } catch {
      /* ignore */
    }
    fallbackOutputRef.current = null
  }, [])

  const attachEngineGraph = useCallback(() => {
    const ctx = audioContextRef.current
    const source = sourceNodeRef.current
    if (!ctx || !source) return false
    const engine = ensureMixEngine()
    if (!engine) {
      connectFallbackOutput()
      return false
    }
    teardownFallbackOutput()
    engine.adoptExternalSourceA(source)
    const ok = engine.attachGraph(ctx)
    if (!ok) {
      connectFallbackOutput()
      return false
    }
    const an = analyserRef.current
    if (an) {
      try {
        an.disconnect()
      } catch {
        /* ignore */
      }
      engine.connectDeckAnalyser('a', an)
    }
    return ok
  }, [ensureMixEngine, connectFallbackOutput, teardownFallbackOutput])

  // `ensureMixEngine` can only return an engine once the lazy chunk has loaded,
  // so re-attach from the load callback instead of leaving the fallback in place.
  const attachEngineGraphRef = useRef<() => boolean>(() => false)
  useEffect(() => {
    attachEngineGraphRef.current = attachEngineGraph
  }, [attachEngineGraph])

  useEffect(() => {
    if (audioRef.current) configureKeyLock(audioRef.current, true)
    if (nextAudioRef.current) configureKeyLock(nextAudioRef.current, true)
  }, [])

  useEffect(() => {
    if (seekTargetSec == null || !Number.isFinite(seekTargetSec)) return
    const audio = getPlaybackAudio()
    if (!audio) return
    // iDJ same-deck load seeks once in applyIDJLiveTrack after canplay.
    // Re-seeking here on every canplay aborts the buffer and flashes Buffering…
    if (
      isIDJEnabledRef.current &&
      (idjDeckSkipLockRef.current || skipSrcReloadRef.current)
    ) {
      return
    }
    let applied = false
    const apply = () => {
      if (applied) return
      try {
        const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : NaN
        let target = seekTargetSec
        // Wait for duration before clamping a non-zero restore seek.
        if (target > 0.05 && !Number.isFinite(dur)) return
        if (Number.isFinite(dur)) {
          target = Math.min(Math.max(0, target), Math.max(0, dur - 0.05))
        }
        audio.currentTime = target
        applied = true
        setCurrentTime(target)
        reportPlaybackPosition(target)
      } catch {
        /* ignore */
      }
    }
    apply()
    audio.addEventListener('loadedmetadata', apply)
    audio.addEventListener('canplay', apply)
    const timer = window.setTimeout(apply, 250)
    return () => {
      audio.removeEventListener('loadedmetadata', apply)
      audio.removeEventListener('canplay', apply)
      window.clearTimeout(timer)
    }
    // Only seekNonce (and its target) may re-apply. currentTrack identity
    // changes (catalog stamps, waveform_data, BPM patches) must not jump
    // the playhead back to the last seek.
  }, [seekNonce, seekTargetSec, reportPlaybackPosition, getPlaybackAudio])

  // Flush position on tab hide / unload so reload restores the last playhead
  useEffect(() => {
    const flush = () => {
      const audio = getPlaybackAudio()
      if (!audio || !Number.isFinite(audio.currentTime)) return
      reportPlaybackPosition(audio.currentTime)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flush)
    }
  }, [reportPlaybackPosition, getPlaybackAudio])
  /** Used by player-chrome touch seek to ignore events over the waveform. */
  const waveformContainerRef = useRef<HTMLDivElement>(null)
  const waveformVisibleBarsRef = useRef(0)
  const waveformOffsetRef = useRef(0)
  const waveformDataLengthRef = useRef(0)
  const waveformGestureRef = useRef(false)
  const waveformPanEnabledRef = useRef(false)
  const waveformFlushRafRef = useRef<number | null>(null)
  const pendingWaveformBarsRef = useRef<number | null>(null)
  const pendingWaveformOffsetRef = useRef<number | null>(null)
  const fadeIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const playerRef = useRef<HTMLDivElement>(null)
  const queueContainerRef = useRef<HTMLDivElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  /**
   * A MediaElementSource with no downstream node silently stalls the element
   * (Chrome pulls one buffer, then `currentTime` freezes with no error), so this
   * holds a direct-to-destination output whenever MixEngine can't take over.
   */
  const fallbackOutputRef = useRef<GainNode | null>(null)
  /** After a hard MES/AC failure, skip Web Audio and play via HTMLMediaElement only. */
  const htmlAudioOnlyRef = useRef(false)
  const [audioElementEpoch, setAudioElementEpoch] = useState(0)
  const pendingHtmlRestoreRef = useRef<{
    resumeAt: number
    wasPlaying: boolean
    liveSrc: string
    idleSrc: string
  } | null>(null)
  /** True once we've created MediaElementSource on the current audio epoch. */
  const mesCreatedForEpochRef = useRef(false)
  /** In-place reloads used against a transient AUDIO_RENDERER_ERROR on this track. */
  const decodeReloadsRef = useRef(0)
  const [audioContextReady, setAudioContextReady] = useState(false)
  const frequencyDataArrayRef = useRef<Float32Array | null>(null)
  const timeDataArrayRef = useRef<Float32Array | null>(null)
  const previousSpectrumRef = useRef<Float32Array | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const trackedPlayRef = useRef<string | null>(null) // Track which track we've already tracked a play for

  const snapPlaybackTime = useCallback((t: number) => {
    const safe = Number.isFinite(t) ? Math.max(0, t) : 0
    playbackTimeRef.current = safe
    setCurrentTime(safe)
    transportMiniMobileRef.current?.update(safe, duration)
    transportMiniDesktopRef.current?.update(safe, duration)
    transportExpandedRef.current?.update(safe, duration)
  }, [duration])

  const pushTransportTime = useCallback((timeSec: number, durationSec: number) => {
    const safe = Number.isFinite(timeSec) ? Math.max(0, timeSec) : 0
    playbackTimeRef.current = safe
    autoDJCurrentTimeRef.current = safe
    transportMiniMobileRef.current?.update(safe, durationSec)
    transportMiniDesktopRef.current?.update(safe, durationSec)
    transportExpandedRef.current?.update(safe, durationSec)
  }, [])

  // Hot cues per track (local)
  useEffect(() => {
    if (!currentTrack?.id || typeof window === 'undefined') {
      setWaveformHotCues([])
      return
    }
    syncWaveformHotCuesFromSlots(currentTrack.id, readHotCueSlots(currentTrack.id))
  }, [currentTrack?.id])

  useEffect(() => {
    setIdjMemoryCues(readIDJMemoryCues())
    const active = readIDJActiveCues()
    idjActiveCuesRef.current = active
    setIdjActiveCues(active)
    setIdjConfig(readIDJConfigFromStorage())
  }, [])

  const patchIDJConfig = useCallback((patch: Partial<typeof idjConfig>) => {
    setIdjConfig((prev) => {
      const next = { ...prev, ...patch }
      writeIDJConfigToStorage(next)
      return next
    })
  }, [])

  const [hotCueRevision, setHotCueRevision] = useState(0)

  const syncWaveformHotCuesFromSlots = useCallback((trackId: string, slots: HotCueSlots) => {
    setWaveformHotCues(
      HOT_CUE_SLOTS.filter((slot) => typeof slots[slot] === 'number')
        .map((slot) => ({
          id: `${trackId}-${slot}`,
          timeSec: slots[slot] as number,
          label: String(slot),
          color: 'rgba(167, 139, 250, 0.95)',
        }))
        .sort((a, b) => a.timeSec - b.timeSec),
    )
  }, [])

  const persistHotCue = useCallback(
    (slot: 1 | 2 | 3 | 4, timeSec: number) => {
      if (!currentTrack?.id || typeof window === 'undefined') return
      const bpm = currentTrack.bpm ?? 120
      const snapped = idjConfig.snapToGrid
        ? quantizePointerToVisibleGrid({
            timeSec,
            bpm,
            offsetSec:
              typeof currentTrack.beat_grid_offset === 'number' &&
              Number.isFinite(currentTrack.beat_grid_offset)
                ? currentTrack.beat_grid_offset
                : 0,
            visibleBars: waveformVisibleBars,
            beatsPerBar: 4,
            durationSec: currentTrack.duration,
            sonicDna: currentTrack.sonic_dna,
          })
        : timeSec
      const next = writeHotCueSlot(currentTrack.id, slot, snapped)
      syncWaveformHotCuesFromSlots(currentTrack.id, next)
      setHotCueRevision((n) => n + 1)
    },
    [currentTrack, waveformVisibleBars, idjConfig.snapToGrid, syncWaveformHotCuesFromSlots]
  )

  const jumpHotCue = useCallback(
    (slot: 1 | 2 | 3 | 4) => {
      const cue = waveformHotCues.find((c) => c.label === String(slot))
      if (!cue) return
      const audio = getPlaybackAudio()
      if (!audio) return
      try {
        audio.currentTime = cue.timeSec
      } catch {
        /* ignore */
      }
      snapPlaybackTime(cue.timeSec)
    },
    [waveformHotCues, getPlaybackAudio, snapPlaybackTime]
  )

  // Ghost incoming tape while dual-deck mix is active (throttle React updates)
  useEffect(() => {
    if (!crossfadeActive) {
      setWaveformGhostTape(null)
      return
    }
    let raf = 0
    let cached: ReturnType<typeof buildWaveformTapeCache> = null
    let cachedTrackId: string | null = null
    let lastPush = 0
    const tick = (now: number) => {
      const ghost = ghostSamplesRef.current
      const idle = getIdleAudio()
      if (ghost?.samples.length && idle && now - lastPush > 80) {
        lastPush = now
        if (!cached || cachedTrackId !== ghost.trackId) {
          cached = buildWaveformTapeCache({
            samples: ghost.samples,
            durationSec: ghost.durationSec,
            colorMode: waveformMode,
            intelligenceProfile: profileFromSonicDna(ghost.sonicDna),
            targetCount: 2400,
          })
          cachedTrackId = ghost.trackId
        }
        if (cached) {
          setWaveformGhostTape({
            timed: cached.timed,
            durationSec: ghost.durationSec,
            timeSec: idle.currentTime || 0,
            opacity: 0.4,
          })
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [crossfadeActive, getIdleAudio, waveformMode])

  const clearFadeInterval = useCallback(() => {
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current)
      fadeIntervalRef.current = null
    }
  }, [])

  const restoreMainVolume = useCallback(() => {
    const vol = settingsRef.current.isMuted ? 0 : settingsRef.current.volume
    try {
      mixEngineRef.current?.setMasterVolume(vol)
    } catch {
      /* ignore */
    }
    if (
      phraseMixLockRef.current ||
      mixEngineRef.current?.isMixing() ||
      isDeckHandoffActive()
    ) {
      return
    }
    if (playbackDeckRef.current === 'next') return
    const audio = getPlaybackAudio()
    if (!audio) return
    try {
      audio.volume = vol
    } catch {
      /* ignore */
    }
  }, [getPlaybackAudio, isDeckHandoffActive])

  const trackIntroOffsetSec = useCallback((track: Track) => {
    return playbackGridPhaseSec(
      track,
      resolvePlaybackBpm(track, detectedBPMRef.current) ?? track.bpm,
    )
  }, [])

  /** Auto DJ mix-in: selected memory cue, or track start when none is set. */
  const resolveIncomingMixCueSec = useCallback((track: Track | null | undefined): number => {
    if (!track?.id) return 0
    const cue = idjMemoryCuesRef.current[track.id]
    return typeof cue === 'number' && Number.isFinite(cue) && cue >= 0 ? cue : 0
  }, [])

  const teardownWebAudioOutput = useCallback(() => {
    try {
      sourceNodeRef.current?.disconnect()
    } catch {
      // noop
    }
    sourceNodeRef.current = null
    try {
      fallbackOutputRef.current?.disconnect()
    } catch {
      // noop
    }
    fallbackOutputRef.current = null
    try {
      analyserRef.current?.disconnect()
    } catch {
      // noop
    }
    analyserRef.current = null
    frequencyDataArrayRef.current = null
    timeDataArrayRef.current = null
    previousSpectrumRef.current = null
    if (audioContextRef.current) {
      void audioContextRef.current.close()
      audioContextRef.current = null
    }
    setAudioContextReady(false)
  }, [])

  const prioritizeBackgroundPlaybackRef = useRef<boolean | null>(null)

  // Mobile: switching back to background-safe output tears down Web Audio and reloads the media element.
  useEffect(() => {
    const mobile = prefersMediaElementBackgroundPlayback()
    const prev = prioritizeBackgroundPlaybackRef.current
    const next = settings.prioritizeBackgroundPlayback
    if (prev === null) {
      prioritizeBackgroundPlaybackRef.current = next
      return
    }
    prioritizeBackgroundPlaybackRef.current = next

    if (!mobile || !next || prev) return
    if (!sourceNodeRef.current && !audioContextRef.current) return

    // A MES-bound element stays tied to its AudioContext for life, so it cannot be
    // reused once we close that context. Remount instead — this also restores
    // position and play state.
    if (mesCreatedForEpochRef.current || sourceNodeRef.current) {
      fallBackToHtmlAudioOnlyRef.current()
      return
    }

    const audio = audioRef.current
    const url = resolvedUrl
    if (!audio || !url) {
      teardownWebAudioOutput()
      return
    }

    const t = audio.currentTime
    const wasPlaying = !audio.paused
    teardownWebAudioOutput()
    audio.pause()
    audio.src = url
    audio.load()

    const onLoaded = () => {
      audio.removeEventListener('loadeddata', onLoaded)
      try {
        audio.currentTime = t
      } catch {
        // noop
      }
      if (wasPlaying) {
        void audio.play().catch(() => {})
      }
    }
    audio.addEventListener('loadeddata', onLoaded)
  }, [settings.prioritizeBackgroundPlayback, resolvedUrl, teardownWebAudioOutput])

  // Save settings to localStorage
  const saveSettings = useCallback((newSettings: Partial<PlayerSettings>) => {
    const updated = { ...settings, ...newSettings }
    setSettings(updated)
    if (typeof window !== 'undefined') {
      localStorage.setItem('musicPlayerSettings', JSON.stringify(updated))
      dispatchPlayerSettings({
        isShuffled: updated.isShuffled,
        repeatMode: updated.repeatMode,
      })
    }
  }, [settings])

  // Helper function to get energy in a frequency band
  const getBandEnergy = useCallback((frequencyData: Float32Array, lowFreq: number, highFreq: number, sampleRate: number): number => {
    const nyquist = sampleRate / 2
    const binSize = nyquist / frequencyData.length
    const lowBin = Math.floor(lowFreq / binSize)
    const highBin = Math.floor(highFreq / binSize)
    let energy = 0
    
    for (let i = lowBin; i <= highBin && i < frequencyData.length; i++) {
      energy += Math.abs(frequencyData[i])
    }
    
    return energy / Math.max(1, highBin - lowBin + 1)
  }, [])

  // Helper function to calculate energy in time domain
  const calculateEnergy = useCallback((timeData: Float32Array, start: number, length: number): number => {
    let energy = 0
    const end = Math.min(start + length, timeData.length)
    
    for (let i = start; i < end; i++) {
      energy += timeData[i] * timeData[i]
    }
    
    return Math.sqrt(energy / (end - start))
  }, [])

  // Keep ref in sync with onQueueChange
  useEffect(() => {
    onQueueChangeRef.current = onQueueChange
  }, [onQueueChange])

  // Fetch waveform from Supabase API
  const fetchWaveformFromSupabase = useCallback(async (filePath: string, trackId?: string): Promise<number[] | null> => {
    try {
      const params = new URLSearchParams()
      const lookupPath = waveformLookupPath(filePath)
      if (lookupPath) params.set('path', lookupPath)
      if (trackId) params.set('trackId', trackId)
      if (!params.toString()) return null

      const response = await fetch(`/api/audio/waveform?${params.toString()}`)
      if (!response.ok) {
        if (response.status === 404) return null
        if (response.status === 500 && process.env.NODE_ENV === 'development') {
          const errorData = await response.json().catch(() => ({}))
          console.warn('Waveform API error (will generate from audio):', errorData.error || 'Server error')
        }
        return null
      }

      const data = await response.json()
      if (data.waveform_data && Array.isArray(data.waveform_data) && data.waveform_data.length > 0) {
        return data.waveform_data
      }

      return null
    } catch {
      return null
    }
  }, [])

  // Fetch BPM from Supabase API
  const fetchBPMFromSupabase = useCallback(async (filePath: string, trackId?: string): Promise<number | null> => {
    try {
      // Extract local path from Supabase URL if needed
      let localPath = filePath
      if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
        // Extract path from Supabase Storage URL
        const match = filePath.match(/\/storage\/v1\/object\/public\/audio-files\/(.+)$/)
        if (match) {
          localPath = decodeURIComponent(match[1])
        }
      }
      
      const params = new URLSearchParams()
      if (localPath) params.set('path', localPath)
      if (trackId) params.set('trackId', trackId)
      const response = await fetch(`/api/audio/bpm?${params.toString()}`, { cache: 'no-store' })
      if (!response.ok) {
        // Silently handle 404s and other errors - we'll try other methods
        return null
      }
      
      const data = await response.json()
      if (data.bpm && typeof data.bpm === 'number' && data.bpm > 0) {
        // Silently return BPM
        return data.bpm
      }
      
      return null
    } catch (error) {
      // Silently fail - will try other methods
      return null
    }
  }, [])

  const commitTrackWaveform = useCallback((data: typeof waveformData, peaks?: number[] | null) => {
    trackWaveformBaseRef.current = data
    setWaveformData(data)
    if (peaks !== undefined) setPrecomputedPeaks(peaks)
  }, [])

  // Generate waveform from the same file the <audio> element plays.
  // Defer network decode until playing or waveform chrome is visible (avoid cold-path contention).
  const trackKey = currentTrack ? `${currentTrack.id}-${currentTrack.file}` : null
  const waveformNetworkAllowed = isPlaying || isExpanded || isWaveformDocked
  
  useEffect(() => {
    if (!currentTrack || !resolvedUrl) {
      trackWaveformBaseRef.current = []
      setPrecomputedPeaks(null)
      setWaveformData([])
      processedWaveformTrackRef.current = null
      return
    }

    // Fast path: paint inline peaks without network; wait for play/expand for heavy fetch/decode
    const inlineOnly =
      !waveformNetworkAllowed &&
      Array.isArray(currentTrack.waveform_data) &&
      (currentTrack.waveform_data as number[]).length > 0
    if (!waveformNetworkAllowed && !inlineOnly) {
      return
    }
    if (inlineOnly && !waveformNetworkAllowed) {
      const peaks = currentTrack.waveform_data as number[]
      const waveform = peaksOrEnvelopesToWaveformSamples(peaks, null)
      if (waveform.length) {
        commitTrackWaveform(waveform, peaks)
        processedWaveformTrackRef.current = trackKey
      }
      return
    }

    let cancelled = false
    const convertPeaksToWaveform = (
      peaks: number[],
      envelopes?: { peak: number; rms: number; low: number; mid: number; high: number }[] | null
    ) => peaksOrEnvelopesToWaveformSamples(peaks, envelopes)

    // Whether what we painted already carries per-band envelope detail. Plain
    // peaks still render, but only envelopes drive the multi-band coloring.
    let appliedEnvelopeDetail = false

    const applyPeaks = (
      peaks: number[],
      envelopes?: { peak: number; rms: number; low: number; mid: number; high: number }[] | null,
    ) => {
      if (cancelled || !peaks.length) return false
      const waveform = convertPeaksToWaveform(peaks, envelopes)
      if (!waveform.length) return false
      commitTrackWaveform(waveform, peaks)
      processedWaveformTrackRef.current = trackKey
      if (envelopes?.length) appliedEnvelopeDetail = true
      return true
    }

    /**
     * The decode path re-downloads the entire file that the media element is
     * already streaming. Hold it until playback has a comfortable buffer so the
     * two requests don't compete for bandwidth mid-track.
     */
    const waitForComfortableBuffer = async () => {
      const el = audioRef.current
      if (!el) return
      const deadline = Date.now() + WAVEFORM_DECODE_MAX_WAIT_MS
      while (!cancelled && Date.now() < deadline) {
        if (el.paused) return
        let secondsAhead = 0
        try {
          const ranges = el.buffered
          for (let i = 0; i < ranges.length; i += 1) {
            if (ranges.start(i) <= el.currentTime && el.currentTime <= ranges.end(i)) {
              secondsAhead = ranges.end(i) - el.currentTime
              break
            }
          }
        } catch {
          return
        }
        if (el.readyState >= 3 && secondsAhead >= WAVEFORM_DECODE_BUFFER_LEAD_SEC) return
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }

    // Instant placeholder: static precomputed tape (deployed) → track/API peaks
    const showStoredPlaceholder = async () => {
      const storageRel =
        vaultRelativePath(resolvedUrl) ||
        vaultRelativePath(currentTrack.file) ||
        null
      const skipStaticTape =
        Boolean(storageRel) &&
        storedWaveformLikelyStale(currentTrack.file || '', resolvedUrl)
      if (storageRel && !skipStaticTape) {
        const tape = await fetchStaticWaveformTape(storageRel)
        if (tape) {
          if (tape.envelopes?.length) {
            if (applyPeaks(tape.data, tape.envelopes)) return
          }
          if (tape.data.length) {
            if (applyPeaks(tape.data)) return
          }
        }
      }

      const inline = currentTrack.waveform_data
      if (inline && Array.isArray(inline) && inline.length > 0) {
        applyPeaks(inline)
        return
      }
      try {
        const peaks = await fetchWaveformFromSupabase(currentTrack.file, currentTrack.id)
        if (peaks?.length) applyPeaks(peaks)
      } catch {
        // ignore — decode path below is authoritative
      }
    }

    const loadFromPlayback = async () => {
      if (!canAnalyzeAudioWaveform()) return

      const candidates = waveformAnalysisUrls(resolvedUrl, currentTrack.file)
      for (const url of candidates) {
        if (cancelled) return
        const cached = getPlaybackWaveformCache(url)
        if (cached?.data?.length) {
          if (applyPeaks(cached.data, cached.envelopes)) return
        }
      }

      for (const url of candidates) {
        if (cancelled) return
        try {
          const peakData = await generatePeakData(url, DEFAULT_WAVEFORM_BUCKETS)
          if (!peakData?.data?.length) continue
          setPlaybackWaveformCache(url, peakData)
          setPlaybackWaveformCache(resolvedUrl, peakData)
          if (applyPeaks(peakData.data, peakData.envelopes)) return
        } catch (err) {
          if (isAudioContextUnavailableError(err)) return
          if (process.env.NODE_ENV === 'development') {
            console.warn('Waveform decode failed for', url, err)
          }
        }
      }
    }

    const networkWork = window.setTimeout(() => {
    void (async () => {
      // Don't mark processed until we have paint data — Strict Mode cancel must retry.
      if (processedWaveformTrackRef.current === trackKey && trackWaveformBaseRef.current.length >= 64) {
        return
      }

      const fileHint = currentTrack.file || ''
      const inlinePeaks = Array.isArray(currentTrack.waveform_data)
        ? (currentTrack.waveform_data as number[])
        : []
      // Prefer decode from the same bytes we play when stored tape is WAV-vs-MP3 stale
      // or a synthetic sine fallback — otherwise grid/kick alignment drifts.
      const preferPlayback =
        Boolean(resolvedUrl) &&
        (storedWaveformLikelyStale(fileHint, resolvedUrl) ||
          (inlinePeaks.length > 0 && looksLikeSyntheticPeaks(inlinePeaks)))

      if (preferPlayback) {
        await waitForComfortableBuffer()
        if (cancelled) return
        await loadFromPlayback()
        if (!cancelled && trackWaveformBaseRef.current.length < 64) {
          await showStoredPlaceholder()
        }
      } else {
        await showStoredPlaceholder()
        if (cancelled) return
        const havePaintableTape = trackWaveformBaseRef.current.length >= 64
        // Stored peaks are authoritative on this branch — `preferPlayback` above
        // already claimed the stale/synthetic cases — so decoding again would
        // pull the whole file down a second time for an identical tape.
        if (havePaintableTape) return
        if (isMiniMode && !isExpanded) return
        await waitForComfortableBuffer()
        if (cancelled) return
        await loadFromPlayback()
      }
    })()
    }, 280)

    return () => {
      cancelled = true
      window.clearTimeout(networkWork)
    }
  }, [
    trackKey,
    resolvedUrl,
    fetchWaveformFromSupabase,
    commitTrackWaveform,
    currentTrack,
    waveformNetworkAllowed,
    isMiniMode,
    isExpanded,
    waveformRescanNonce,
  ])

  // Ultra high-definition real-time waveform analysis with transient detection
  // Helper function for better color interpolation (RGB to RGB with gamma correction)
  const interpolateColor = useCallback((color1: string, color2: string, factor: number): string => {
    const parseRgb = (rgb: string): [number, number, number] => {
      const match = rgb.match(/\d+/g)
      if (match && match.length >= 3) {
        return [parseInt(match[0]), parseInt(match[1]), parseInt(match[2])]
      }
      return [255, 255, 255]
    }
    
    const [r1, g1, b1] = parseRgb(color1)
    const [r2, g2, b2] = parseRgb(color2)
    
    // Gamma-corrected interpolation for smoother color transitions
    const gamma = 2.2
    const r1g = Math.pow(r1 / 255, gamma)
    const g1g = Math.pow(g1 / 255, gamma)
    const b1g = Math.pow(b1 / 255, gamma)
    const r2g = Math.pow(r2 / 255, gamma)
    const g2g = Math.pow(g2 / 255, gamma)
    const b2g = Math.pow(b2 / 255, gamma)
    
    const r = Math.pow(r1g + (r2g - r1g) * factor, 1 / gamma) * 255
    const g = Math.pow(g1g + (g2g - g1g) * factor, 1 / gamma) * 255
    const b = Math.pow(b1g + (b2g - b1g) * factor, 1 / gamma) * 255
    
    return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`
  }, [])

  // Only run when player is expanded, visible, and playing
  // Preserves initial waveform when conditions aren't met
  useEffect(() => {
    if (!analyserRef.current || !frequencyDataArrayRef.current || !timeDataArrayRef.current) {
      return
    }
    
    // Don't run waveform updates if player is minimized, not expanded, not playing, or not visible
    // But preserve the initial waveform - don't clear it
    if ((isMiniMode && !isWaveformDocked) || !isExpanded || !isPlaying || !isVisible) {
      // Cancel any ongoing animation frame
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      // Restore static track envelope so beat grid stays aligned after live coloring
      const base = trackWaveformBaseRef.current
      if (base.length > 0) {
        setWaveformData(base)
      }
      return
    }

    // Full-buffer peak tape (Ableton/MiniMeters): no live oscilloscope loop — zoom/pan only.
    if (trackWaveformBaseRef.current.length >= 64) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      setWaveformData(trackWaveformBaseRef.current)
      return
    }
    
    // Peak detection for transients (kicks, claps, hats)
    let previousPeaks: number[] = []
    const envelopeFollower: number[] = []
    let lastUpdateTime = 0
    // Exponential smoothing - stores previous smoothed waveform for better interpolation
    let previousSmoothedWaveform: WaveformSample[] | null = null
    const smoothingFactor = 0.14 // snappy — preserve peak/valley contrast
    
    const updateWaveform = (currentTime: number = performance.now()) => {
      // Check conditions again in case they changed
      if (!analyserRef.current || !frequencyDataArrayRef.current || !timeDataArrayRef.current || (isMiniMode && !isWaveformDocked) || !isExpanded || !isPlaying || !isVisible) {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current)
          animationFrameRef.current = null
        }
        return
      }
      
      // Apply speed adjustment - throttle updates based on speed
      // Slower default update rate for better visibility
      const speedMultiplier = waveformSpeed
      const baseFrameRate = 30 // Reduced from 60 to 30 FPS for slower movement
      const targetFrameRate = baseFrameRate * speedMultiplier
      const minFrameInterval = 1000 / targetFrameRate // Minimum milliseconds between updates
      
      const timeSinceLastUpdate = currentTime - lastUpdateTime
      if (timeSinceLastUpdate < minFrameInterval) {
        // Skip this frame if not enough time has passed
        animationFrameRef.current = requestAnimationFrame(updateWaveform)
        return
      }
      
      lastUpdateTime = currentTime
      
      // Get both time-domain (waveform shape) and frequency-domain (colors) data using Float32Array for precision
      if (timeDataArrayRef.current && frequencyDataArrayRef.current) {
        // TypeScript workaround for Float32Array generic type compatibility
        analyserRef.current.getFloatTimeDomainData(timeDataArrayRef.current as any)
        analyserRef.current.getFloatFrequencyData(frequencyDataArrayRef.current as any)
      }

      const frequencyData = frequencyDataArrayRef.current
      const timeData = timeDataArrayRef.current
      const audioContext = audioContextRef.current
      const sampleRate = audioContext?.sampleRate || 44100
      
      const baseBars = 200 // Fallback oscilloscope only when no track peaks exist
      const bars = Math.max(8, Math.floor(baseBars * waveformHorizontalZoom))
      const previousSpectrum = previousSpectrumRef.current
      const timeDataLength = timeData.length
      const data: Array<{
        positive: number
        negative: number
        color: string
        elementType?: WaveformSample['elementType']
        elementConfidence?: number
        bands?: { low: number; mid: number; high: number }
      }> = []
      
      // Update previous spectrum for next frame
      if (previousSpectrumRef.current && frequencyData) {
        previousSpectrumRef.current.set(frequencyData)
      }

      if (!frequencyData || !timeData || timeDataLength <= 0) {
        animationFrameRef.current = requestAnimationFrame(updateWaveform)
        return
      }
      
      // Calculate RMS and peak values for transient detection
      const samplesPerBar = Math.ceil(timeDataLength / bars)
      const currentPeaks: number[] = []
      const currentEnvelope: number[] = []
      let previousEnergy = 0
      
      // Analyze frequency bands using utility function
      const frequencyBands = analyzeFrequencyBands(frequencyData, sampleRate)
      const kicksEnergy = frequencyBands.kicks
      const snaresEnergy = frequencyBands.snares
      const hihatsEnergy = frequencyBands.hihats
      const cymbalsEnergy = frequencyBands.cymbals

      // MiniMeters-style Low / Mid / High crossovers (~250 Hz / ~2.5 kHz)
      const rawLow = getBandEnergy(frequencyData, 20, 250, sampleRate)
      const rawMid = getBandEnergy(frequencyData, 250, 2500, sampleRate)
      const rawHigh = getBandEnergy(frequencyData, 2500, 16000, sampleRate)
      const frameBands = normalizeFftBands(rawLow, rawMid, rawHigh)
      
      // Detect transients using utility function
      const transientInfo = detectTransients(
        frequencyData,
        previousSpectrum,
        timeData
      )
      
      // Process waveform data with ultra high resolution and accurate transient detection
      for (let i = 0; i < bars; i++) {
        const position = i / bars // 0 to 1
        
        // Get samples for this bar
        const startSample = Math.floor(i * samplesPerBar)
        const endSample = Math.min(startSample + samplesPerBar, timeDataLength)
        
        // Calculate peak and RMS for this segment using Float32Array (values are -1 to 1)
        let peak = 0
        let rms = 0
        let sampleCount = 0
        
        for (let j = startSample; j < endSample; j++) {
          const sample = Math.abs(timeData[j]) // Already -1 to 1 range
          peak = Math.max(peak, sample)
          rms += sample * sample
          sampleCount++
        }
        
        rms = Math.sqrt(rms / sampleCount) // RMS value
        
        // Calculate energy change for transient detection
        const currentEnergy = calculateEnergy(timeData, startSample, samplesPerBar)
        const energyChange = currentEnergy - previousEnergy
        previousEnergy = currentEnergy
        
        // Enhanced envelope following with adaptive smoothing based on content
        const isHighEnergy = peak > 0.7 || rms > 0.5
        const attackTime = isHighEnergy ? 0.002 : 0.001 // Slower attack for high energy
        const releaseTime = isHighEnergy ? 0.2 : 0.15 // Slower release for high energy content
        const previousEnvelope = envelopeFollower[i] || 0
        
        let envelope = previousEnvelope
        if (peak > previousEnvelope) {
          // Attack phase (transient detected) - adaptive smoothing
          const attackRate = attackTime * 30
          envelope = previousEnvelope + (peak - previousEnvelope) * attackRate
        } else {
          // Release phase - adaptive smoothing for smoother movement
          const releaseRate = releaseTime * 30
          envelope = previousEnvelope + (peak - previousEnvelope) * releaseRate
        }
        envelopeFollower[i] = envelope
        
        // Improved transient detection using multiple factors
        const transientRatio = peak / (rms + 0.001) // Ratio indicates transient
        const hasEnergyChange = transientInfo.energyChange > 0.2 // Significant energy increase
        const hasSpectralFlux = transientInfo.spectralFlux > 0.15 // Spectral flux indicates onset
        const isTransient = transientRatio > 1.8 && (hasEnergyChange || hasSpectralFlux || transientInfo.isTransient)
        
        // Determine element type based on frequency band analysis
        const totalEnergy = kicksEnergy + snaresEnergy + hihatsEnergy + cymbalsEnergy
        let elementType: NonNullable<WaveformSample['elementType']> = 'other'
        let elementConfidence = 0
        
        if (totalEnergy > 0) {
          if (kicksEnergy > snaresEnergy && kicksEnergy > hihatsEnergy && kicksEnergy > cymbalsEnergy) {
            elementType = 'kick'
            elementConfidence = kicksEnergy / totalEnergy
          } else if (snaresEnergy > hihatsEnergy && snaresEnergy > cymbalsEnergy) {
            elementType = 'snare'
            elementConfidence = snaresEnergy / totalEnergy
          } else if (hihatsEnergy > cymbalsEnergy) {
            elementType = 'hihat'
            elementConfidence = hihatsEnergy / totalEnergy
          }
        }
        
        // Combine peak and RMS — MiniMeters-like: peaks dominate shape, valleys dig deep
        const amplitude = isTransient 
          ? peak * 0.95 + rms * 0.05
          : peak * 0.55 + rms * 0.45
        
        const boostedAmplitude = isTransient && elementConfidence > 0.25
          ? amplitude * 1.75
          : amplitude * 1.15
        
        // Near-zero valleys, near-full peaks (critical MiniMeters silhouette contrast)
        const shaped = expandPeakValley(boostedAmplitude, {
          power: isTransient ? 1.35 : 1.9,
          gain: isTransient ? 1.7 : 1.45,
          floor: 0.01,
        })
        const positive = shaped
        const negative = expandPeakValley(boostedAmplitude * (isTransient ? 0.92 : 0.78), {
          power: isTransient ? 1.35 : 1.9,
          gain: isTransient ? 1.6 : 1.35,
          floor: 0.01,
        })
        
        // Per-slice band emphasis: weight frame bands by local amplitude + element type
        // so kicks go red-hot, hats cyan, and balanced hits white (MiniMeters Multi-Band)
        let sliceBands = { ...frameBands }
        if (isTransient && elementConfidence > 0.25) {
          switch (elementType) {
            case 'kick':
              sliceBands = {
                low: Math.max(frameBands.low, shaped),
                mid: frameBands.mid * 0.22,
                high: frameBands.high * 0.1,
              }
              break
            case 'snare':
              sliceBands = {
                low: frameBands.low * 0.28,
                mid: Math.max(frameBands.mid, shaped),
                high: Math.max(frameBands.high, shaped * 0.75),
              }
              break
            case 'hihat':
              sliceBands = {
                low: frameBands.low * 0.08,
                mid: frameBands.mid * 0.22,
                high: Math.max(frameBands.high, shaped),
              }
              break
            default:
              sliceBands = {
                low: Math.max(frameBands.low, shaped * 0.35),
                mid: Math.max(frameBands.mid, shaped),
                high: Math.max(frameBands.high, shaped * 0.55),
              }
          }
        } else {
          // Scale frame bands by local envelope so quiet slices go near-black
          const ampScale = Math.max(0.05, Math.min(1.55, shaped * 1.5))
          sliceBands = {
            low: frameBands.low * ampScale,
            mid: frameBands.mid * ampScale,
            high: frameBands.high * ampScale,
          }
        }

        // Extra punch on strong transients (white-hot / cyan spike)
        if (isTransient) {
          const punch = 1 + Math.min(1.0, elementConfidence * 1.0 + shaped * 0.4)
          sliceBands = {
            low: Math.min(1, sliceBands.low * punch),
            mid: Math.min(1, sliceBands.mid * punch),
            high: Math.min(1, sliceBands.high * punch),
          }
        }

        const color = multiBandRgbColor(sliceBands, {
          contrast: 2.15,
          saturation: 1.8,
          floor: 0.015,
        })
        
        data.push({
          positive,
          negative,
          color,
          elementType,
          elementConfidence,
          bands: sliceBands,
        })
        
        currentPeaks.push(peak)
      }
      
      previousPeaks = currentPeaks
      // Only update waveform if we have valid data and conditions are still met
      if (data.length > 0 && !(isMiniMode && !isWaveformDocked) && isExpanded && isPlaying && isVisible) {
        // Use exponential smoothing for better visual quality and smoother movement
        let smoothedData: WaveformSample[]
        
        if (previousSmoothedWaveform && previousSmoothedWaveform.length === data.length) {
          // Exponential smoothing: blend current frame with previous smoothed frame
          smoothedData = data.map((current, index) => {
            const previous = previousSmoothedWaveform![index]
            
            // Smooth amplitudes lightly; keep peaks sharp (MiniMeters contrast)
            const blend = 1 - smoothingFactor
            const peakHold = current.positive > previous.positive ? 0.92 : blend
            const smoothedPositive = previous.positive + (current.positive - previous.positive) * peakHold
            const smoothedNegative = previous.negative + (current.negative - previous.negative) * blend

            const prevBands = previous.bands || { low: 0.15, mid: 0.15, high: 0.15 }
            const curBands = current.bands || { low: 0.15, mid: 0.15, high: 0.15 }
            const bands = {
              low: prevBands.low + (curBands.low - prevBands.low) * blend,
              mid: prevBands.mid + (curBands.mid - prevBands.mid) * blend,
              high: prevBands.high + (curBands.high - prevBands.high) * blend,
            }
            
            return {
              positive: smoothedPositive,
              negative: smoothedNegative,
              color: multiBandRgbColor(bands, { contrast: 2.15, saturation: 1.8, floor: 0.015 }),
              elementType: current.elementType || previous.elementType,
              elementConfidence: current.elementConfidence || previous.elementConfidence,
              bands,
            }
          })
        } else {
          // First frame or length mismatch - use current data
          smoothedData = data
        }
        
        previousSmoothedWaveform = smoothedData
        setWaveformData(smoothedData)
      }
      animationFrameRef.current = requestAnimationFrame(updateWaveform)
    }
    
    updateWaveform()
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
  }, [getBandEnergy, calculateEnergy, isMiniMode, isWaveformDocked, isExpanded, isPlaying, isVisible, currentTrack?.id, waveformSpeed, waveformHorizontalZoom])

  // Intersection Observer to detect when player is visible
  useEffect(() => {
    if (!playerRef.current || typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      setIsVisible(true) // Default to visible if observer not supported
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setIsVisible(entry.isIntersecting)
        })
      },
      {
        threshold: 0.1, // Trigger when 10% visible
        rootMargin: '0px',
      }
    )

    observer.observe(playerRef.current)

    return () => {
      observer.disconnect()
    }
  }, [])

  // Detect network quality
  useEffect(() => {
    if (typeof window === 'undefined' || !('connection' in navigator)) return

    const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection
    
    if (connection) {
      const updateConnection = () => {
        const effectiveType = connection.effectiveType || '4g'
        setNetworkEffectiveType(effectiveType)
        
        // Map to quality levels
        if (effectiveType === 'slow-2g' || effectiveType === '2g') {
          setConnectionQuality('slow')
        } else if (effectiveType === '3g') {
          setConnectionQuality('medium')
        } else {
          setConnectionQuality('fast')
        }
      }
      
      updateConnection()
      connection.addEventListener('change', updateConnection)
      
      return () => {
        connection.removeEventListener('change', updateConnection)
      }
    }
  }, [])

  // The current track should always buffer aggressively.
  // On slow connections with small buffer settings, use 'metadata' to avoid
  // wasting bandwidth, otherwise 'auto' lets the browser stream-ahead fully.
  const getPreloadStrategy = useCallback((): 'none' | 'metadata' | 'auto' => {
    if (connectionQuality === 'slow' && settings.bufferSize === 'small') {
      return 'metadata'
    }
    return 'auto'
  }, [settings.bufferSize, connectionQuality])

  // Store original queue when shuffle is enabled
  useEffect(() => {
    if (!settings.isShuffled && queue.length > 0) {
      setOriginalQueue([...queue])
    }
  }, [queue, settings.isShuffled])

  // Resolve audio URL when track changes
  useEffect(() => {
    if (!currentTrack) {
      setResolvedUrl(null)
      setIsLoading(false)
      setError(null)
      return
    }

    const trackFile = currentTrack.file
    const syncNormalized =
      toSameOriginMediaUrl(trackFile) || normalizeVaultAudioUrl(trackFile)

    // iDJ already bound a playable URL onto the live element — don't flip
    // isLoading or race a second resolve that rewrites src mid-buffer.
    if (
      isIDJEnabledRef.current &&
      (idjDeckSkipLockRef.current ||
        skipSrcReloadRef.current ||
        (lastBoundPlaybackRef.current.id === currentTrack.id &&
          mediaUrlMatchesTrack(lastBoundPlaybackRef.current.url, trackFile)))
    ) {
      const bound = lastBoundPlaybackRef.current.url
      if (bound) {
        setResolvedUrl((prev) => (prev === bound ? prev : bound))
      }
      setIsLoading(false)
      return
    }

    const cached = resolvedUrlCacheRef.current.get(trackFile)
    const optimistic =
      cached && isDirectPlayableUrl(cached) && !isEdgePlaybackUrl(cached)
        ? cached
        : isDirectPlayableUrl(syncNormalized)
          ? syncNormalized
          : null

    if (optimistic) {
      setResolvedUrl((prev) => (prev === optimistic ? prev : optimistic))
    }

    setIsLoading(!optimistic)
    setError(null)
    setRetryCount(0)
    decodeReloadsRef.current = 0
    loggedErrorsRef.current.clear()

    let cancelled = false
    resolveAudioUrl(trackFile)
      .then((url) => {
        if (cancelled) return
        setResolvedUrl((prev) => (prev === url ? prev : url))
        setIsLoading(false)
        resolvedUrlCacheRef.current.set(trackFile, url)
      })
      .catch((err) => {
        if (cancelled) return
        console.error('Failed to resolve audio URL:', err)
        const fallback = toSameOriginMediaUrl(trackFile) || syncNormalized
        setResolvedUrl(fallback || trackFile)
        setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [currentTrack?.id, currentTrack?.file])

  // Prefer server-resolved extension (m4a vs mp3) over sync catalog guess.
  const playbackUrl = useMemo(() => {
    if (!currentTrack?.file) return null
    if (resolvedUrl && mediaUrlMatchesTrack(resolvedUrl, currentTrack.file)) return resolvedUrl
    return peekSyncPlaybackUrl(currentTrack.file, resolvedUrlCacheRef.current)
  }, [currentTrack?.id, currentTrack?.file, resolvedUrl])

  // Batch resolve URLs for next tracks in queue (sync for media-proxy paths — no HEAD)
  useEffect(() => {
    if (!currentTrack || !queue.length) return
    
    const currentIndex = queue.findIndex(track => track.id === currentTrack.id)
    if (currentIndex === -1) return
    
    const nextTracks = queue.slice(currentIndex + 1, currentIndex + 3)
    const tracksToResolve = nextTracks
      .map(track => track.file)
      .filter(file => file && !resolvedUrlCacheRef.current.has(file))
    
    if (tracksToResolve.length === 0) return

    const asyncNeeded: string[] = []
    for (const file of tracksToResolve) {
      const sync = normalizeVaultAudioUrl(file)
      const playable = toSameOriginMediaUrl(file) || sync
      if (!isR2BrowserPlayEnabled() && isDirectPlayableUrl(playable)) {
        resolvedUrlCacheRef.current.set(file, playable)
      } else {
        asyncNeeded.push(file)
      }
    }

    if (asyncNeeded.length === 0) return

    resolveAudioUrls(asyncNeeded)
      .then((urls) => {
        asyncNeeded.forEach((file) => {
          const url = urls.get(file)
          if (url) resolvedUrlCacheRef.current.set(file, url)
        })
      })
      .catch(err => {
        console.debug('Failed to batch resolve URLs:', err)
      })
  }, [currentTrack, queue])

  // Preload next track onto the IDLE deck only (never clobber live after deck-swap)
  useEffect(() => {
    if (!currentTrack || !queue.length) return
    if (phraseMixLockRef.current) return
    if (isIDJEnabledRef.current) return
    if (isLoading) return
    if (Date.now() - trackSwitchAtRef.current < 800) return

    const live = audioRef.current
    if (live && isPlaying && live.readyState < 2) return

    const currentIndex = queue.findIndex((track) => track.id === currentTrack.id)
    if (currentIndex === -1) return

    const idleEl = getIdleAudio()
    if (!idleEl) return

    const nextIndex = currentIndex + 1
    if (nextIndex < queue.length) {
      const nextTrack = queue[nextIndex]
      if (isIDJEnabledRef.current && idjIdleTrackIdRef.current) {
        return
      }
      // Don't overwrite an already-cued Auto DJ idle load
      if (cuedIdleTrackIdRef.current === nextTrack.id) return

      const syncUrl = normalizeVaultAudioUrl(nextTrack.file)
      const applyIdleSrc = (url: string) => {
        if (!url || phraseMixLockRef.current) return
        const idle = getIdleAudio()
        if (!idle) return
        if (mediaUrlsRoughlyEqual(idle.currentSrc || idle.src, url)) {
          return
        }
        idle.src = url
        idle.preload = 'auto'
        try {
          idle.volume = 0
        } catch {
          /* ignore */
        }
        resolvedUrlCacheRef.current.set(nextTrack.file, url)
      }

      const playable = toSameOriginMediaUrl(nextTrack.file) || syncUrl
      if (!isR2BrowserPlayEnabled() && isDirectPlayableUrl(playable)) {
        applyIdleSrc(playable)
        return
      }

      resolveAudioUrl(nextTrack.file)
        .then(applyIdleSrc)
        .catch((err) => {
          console.debug('Failed to preload next track:', err)
        })
    }
  }, [currentTrack, queue, getIdleAudio, isLoading, isPlaying])

  // Preload next tracks in queue using Service Worker (keep shallow — deep preload
  // was HEADing/GETting 5 R2 objects and starving the live play request).
  useEffect(() => {
    if (!currentTrack || !queue.length) return
    
    // Find current index in queue
    const currentIndex = queue.findIndex(track => track.id === currentTrack.id)
    if (currentIndex === -1) return
    
    const tracksToPreload = queue
      .slice(currentIndex + 1, currentIndex + 4)
      .map(track => track.file)
      .filter(Boolean)
    
    if (tracksToPreload.length > 0) {
      // Resolve all URLs first (use cache if available)
      const cache = resolvedUrlCacheRef.current
      const resolved = tracksToPreload.map((file) => {
        const cached = cache.get(file)
        if (cached && isDirectPlayableUrl(cached)) return cached
        const playable = toSameOriginMediaUrl(file) || normalizeVaultAudioUrl(file)
        if (!isR2BrowserPlayEnabled() && isDirectPlayableUrl(playable)) {
          cache.set(file, playable)
          return playable
        }
        return null
      })
      const needAsync = tracksToPreload.filter((_, i) => !resolved[i])
      const finish = (urls: string[]) => {
        const playable = urls.filter((url) => isDirectPlayableUrl(url))
        if (playable.length) preloadTracks(playable)
      }
      if (needAsync.length === 0) {
        finish(resolved.filter(Boolean) as string[])
        return
      }
      Promise.all(needAsync.map((file) => resolveAudioUrl(file)))
        .then((urls) => {
          needAsync.forEach((file, idx) => {
            if (urls[idx]) cache.set(file, urls[idx])
          })
          finish([
            ...(resolved.filter(Boolean) as string[]),
            ...urls.filter(Boolean),
          ])
        })
        .catch((err) => {
          console.debug('Failed to preload tracks via service worker:', err)
        })
    }
  }, [currentTrack, queue])

  // Setup audio analysis - must be accessible from both useEffect and togglePlay
  // This should only be called after user interaction (e.g., when playing)
  const needsWebAudioGraph = useCallback(() => {
    return (
      isIDJEnabledRef.current ||
      autoDJConfigRef.current.enabled ||
      Boolean(mixEngineRef.current?.isMixing())
    )
  }, [])

  const setupAudioAnalysis = useCallback(async () => {
    const audio = audioRef.current
    if (!audio) return
    if (htmlAudioOnlyRef.current) return
    if (
      prefersMediaElementBackgroundPlayback() &&
      settingsRef.current.prioritizeBackgroundPlayback
    ) {
      return
    }
    // Normal library play must stay on HTMLMediaElement → speakers.
    // Opening AudioContext here triggers "audio device or WebAudio renderer"
    // errors on some machines and can stall playback.
    if (!needsWebAudioGraph()) return

    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
      }

      const audioContext = audioContextRef.current

      if (audioContext.state === 'suspended') {
        try {
          await audioContext.resume()
        } catch (resumeError: any) {
          if (resumeError.name !== 'InvalidStateError') {
            if (process.env.NODE_ENV === 'development') {
              console.warn('AudioContext resume failed (will retry on play):', resumeError)
            }
          }
          return
        }
      }

      await loadMixEngineClass().catch(() => null)

      if (!sourceNodeRef.current) {
        try {
          const source = audioContext.createMediaElementSource(audio)
          sourceNodeRef.current = source
          mesCreatedForEpochRef.current = true
        } catch (error: any) {
          if (error.name !== 'InvalidStateError') {
            throw error
          }
          // Element is already MES-bound (often a stale HMR node). Remount to
          // restore the HTML → speakers path.
          fallBackToHtmlAudioOnlyRef.current()
          return
        }
      }

      if (analyserRef.current) {
        try {
          analyserRef.current.disconnect()
        } catch {
          /* already disconnected */
        }
      }

      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 8192
      analyser.smoothingTimeConstant = 0
      analyserRef.current = analyser
      frequencyDataArrayRef.current = new Float32Array(analyser.frequencyBinCount)
      timeDataArrayRef.current = new Float32Array(analyser.fftSize)
      previousSpectrumRef.current = new Float32Array(analyser.frequencyBinCount)

      attachEngineGraph()
      setAudioContextReady(true)
    } catch (error) {
      htmlAudioOnlyRef.current = true
      if (process.env.NODE_ENV === 'development') {
        console.warn('Web Audio unavailable — staying on HTML playback:', error)
      }
    }
  }, [attachEngineGraph, needsWebAudioGraph])
  const setupAudioAnalysisRef = useRef(setupAudioAnalysis)
  setupAudioAnalysisRef.current = setupAudioAnalysis

  /** Wire both decks through MixEngine (symmetric EQ/filter/gain chains). */
  const ensureDualDeckGraph = useCallback(async () => {
    if (htmlAudioOnlyRef.current || !needsWebAudioGraph()) {
      return mixEngineRef.current
    }
    try {
      await setupAudioAnalysis()
    } catch {
      /* play without analysis if needed */
    }
    attachEngineGraph()
    return mixEngineRef.current
  }, [setupAudioAnalysis, attachEngineGraph, needsWebAudioGraph])

  /** Unstick a MediaElementSource that lost its path to the destination. */
  const recoverAudibleGraph = useCallback(() => {
    const live = getPlaybackAudio()
    if (htmlAudioOnlyRef.current || !needsWebAudioGraph()) {
      if (live && live.paused && isPlayingRef.current) void live.play().catch(() => {})
      return
    }
    const ctx = audioContextRef.current
    const source = sourceNodeRef.current
    if (ctx && (ctx.state === 'suspended' || (ctx.state as string) === 'interrupted')) {
      void ctx.resume().catch(() => {})
    }
    if (!ctx || !source) {
      void ensureDualDeckGraph().then(() => {
        if (live && live.paused && isPlayingRef.current) void live.play().catch(() => {})
      })
      return
    }
    teardownFallbackOutput()
    const engine = mixEngineRef.current
    if (engine) {
      engine.adoptExternalSourceA(source)
      const reattached = engine.attachGraph(ctx)
      const forced = engine.forceReconnectMediaSources()
      if (!reattached && !forced) {
        connectFallbackOutput()
      }
    } else {
      connectFallbackOutput()
    }
    if (live && live.paused && isPlayingRef.current) {
      void live.play().catch(() => {})
    }
  }, [
    connectFallbackOutput,
    teardownFallbackOutput,
    ensureDualDeckGraph,
    getPlaybackAudio,
    needsWebAudioGraph,
  ])
  const recoverAudibleGraphRef = useRef(recoverAudibleGraph)
  recoverAudibleGraphRef.current = recoverAudibleGraph

  /**
   * Last-resort: MES is bound to a dead AudioContext (device error). Remount
   * both <audio> elements and stay on the HTML output path.
   */
  const fallBackToHtmlAudioOnly = useCallback(() => {
    if (htmlAudioOnlyRef.current) return
    htmlAudioOnlyRef.current = true
    mesCreatedForEpochRef.current = false
    const live = getPlaybackAudio()
    const resumeAt = live && Number.isFinite(live.currentTime) ? live.currentTime : 0
    const wasPlaying = isPlayingRef.current
    const liveSrc = live?.currentSrc || live?.src || ''
    const idle = getIdleAudio()
    const idleSrc = idle?.currentSrc || idle?.src || ''

    teardownFallbackOutput()
    sourceNodeRef.current = null
    analyserRef.current = null
    try {
      audioContextRef.current?.close()
    } catch {
      /* ignore */
    }
    audioContextRef.current = null
    setAudioContextReady(false)
    mixEngineRef.current = null
    // Force the media bind effect to re-assign src onto the new elements.
    lastBoundPlaybackRef.current = { id: '', url: '' }
    pendingHtmlRestoreRef.current = {
      resumeAt,
      wasPlaying,
      liveSrc,
      idleSrc,
    }

    setAudioElementEpoch((n) => n + 1)
  }, [getPlaybackAudio, getIdleAudio, teardownFallbackOutput])
  const fallBackToHtmlAudioOnlyRef = useRef(fallBackToHtmlAudioOnly)
  fallBackToHtmlAudioOnlyRef.current = fallBackToHtmlAudioOnly

  // One-shot remount after mount — clears MediaElementSource left on the DOM
  // from a previous HMR / dead AudioContext (element stays bound for its life).
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (audioElementEpoch > 0) return
    const live = audioRef.current
    const liveSrc = live?.currentSrc || live?.src || ''
    // Remounting swaps in fresh <audio> nodes, so running this blind tears down
    // a deck that is already streaming: the element is emptied mid-track, the
    // replacement re-buffers from cold, and Chromium raises
    // AUDIO_RENDERER_ERROR on the discarded renderer. An element that is
    // already playing demonstrably has no dead MediaElementSource to clear, and
    // setupAudioAnalysis still remounts reactively if binding ever throws
    // InvalidStateError — so skip the pre-emptive pass entirely.
    if (liveSrc || isPlayingRef.current) return
    const idle = nextAudioRef.current
    const idleSrc = idle?.currentSrc || idle?.src || ''
    pendingHtmlRestoreRef.current = {
      resumeAt: live && Number.isFinite(live.currentTime) ? live.currentTime : 0,
      wasPlaying: false,
      liveSrc,
      idleSrc,
    }
    mesCreatedForEpochRef.current = false
    setAudioElementEpoch(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, [])

  // After remounting <audio> for HTML-only recovery, restore src / seek / play.
  useEffect(() => {
    if (audioElementEpoch === 0) return
    const pending = pendingHtmlRestoreRef.current
    pendingHtmlRestoreRef.current = null
    if (!pending) return

    const main = audioRef.current
    const next = nextAudioRef.current
    const url = playbackUrl || pending.liveSrc
    if (main && url) {
      try {
        if (assignMediaSrcIfChanged(main, url) || !(main.currentSrc || main.src)) {
          main.src = url
        }
        main.volume = settingsRef.current.isMuted ? 0 : settingsRef.current.volume
        const seek = () => {
          try {
            if (pending.resumeAt > 0.05 && Number.isFinite(main.duration)) {
              main.currentTime = Math.min(pending.resumeAt, Math.max(0, main.duration - 0.05))
            } else if (pending.resumeAt > 0.05) {
              main.currentTime = pending.resumeAt
            }
          } catch {
            /* ignore */
          }
          if (pending.wasPlaying || isPlayingRef.current) {
            void main.play().catch(() => {})
          }
        }
        if (main.readyState >= 1) seek()
        else main.addEventListener('loadedmetadata', seek, { once: true })
      } catch {
        /* ignore */
      }
    }
    if (next && pending.idleSrc) {
      try {
        if (next.src !== pending.idleSrc) next.src = pending.idleSrc
        next.volume = 0
      } catch {
        /* ignore */
      }
    }
  }, [audioElementEpoch, playbackUrl])

  // Media Session API for background playback and lock screen controls
  useEffect(() => {
    if (!currentTrack || typeof navigator === 'undefined' || !('mediaSession' in navigator)) return

    const mediaSession = (navigator as any).mediaSession
    
    // Set metadata for lock screen/notification controls
    mediaSession.metadata = new (window as any).MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.artist,
      album: currentTrack.album || currentTrack.folder || 'SERGIK',
      artwork: buildLockScreenArtwork(lockScreenSrc || currentTrack.artwork),
    })

    // Handle play action from lock screen/notification
    mediaSession.setActionHandler('play', () => {
      const live = getPlaybackAudio()
      if (live && !isPlaying) {
        live.play().catch(() => {})
        setIsPlaying(true)
      }
    })

    // Handle pause action
    mediaSession.setActionHandler('pause', () => {
      const live = getPlaybackAudio()
      if (live && isPlaying) {
        mixEngineRef.current?.pauseActiveClock()
        live.pause()
        setIsPlaying(false)
      }
    })

    // Handle next track
    mediaSession.setActionHandler('nexttrack', () => {
      if (queue.length > 1) {
        skipToNextRef.current()
      }
    })

    // Handle previous track
    mediaSession.setActionHandler('previoustrack', () => {
      if (queue.length > 1) {
        skipToPreviousRef.current()
      }
    })

    // Handle seek backward
    mediaSession.setActionHandler('seekbackward', (details: any) => {
      const live = getPlaybackAudio()
      if (live) {
        const skipTime = details.seekOffset || 10
        const engine = mixEngineRef.current
        const now = engine?.hasBufferClock() ? engine.getActiveMediaTime() : live.currentTime
        const next = Math.max(0, now - skipTime)
        if (engine?.hasBufferClock()) engine.seekActiveMedia(next)
        else live.currentTime = next
      }
    })

    // Handle seek forward
    mediaSession.setActionHandler('seekforward', (details: any) => {
      const live = getPlaybackAudio()
      if (live && duration) {
        const skipTime = details.seekOffset || 10
        const engine = mixEngineRef.current
        const now = engine?.hasBufferClock() ? engine.getActiveMediaTime() : live.currentTime
        const next = Math.min(duration, now + skipTime)
        if (engine?.hasBufferClock()) engine.seekActiveMedia(next)
        else live.currentTime = next
      }
    })

    try {
      mediaSession.setActionHandler('seekto', (details: { seekTime?: number } | undefined) => {
        const live = getPlaybackAudio()
        if (
          live &&
          duration > 0 &&
          details &&
          typeof details.seekTime === 'number' &&
          Number.isFinite(details.seekTime)
        ) {
          const t = Math.max(0, Math.min(duration, details.seekTime))
          const engine = mixEngineRef.current
          if (engine?.hasBufferClock()) engine.seekActiveMedia(t)
          else live.currentTime = t
        }
      })
    } catch {
      // seekto not supported in this browser
    }

    // Update playback state
    mediaSession.playbackState = isPlaying ? 'playing' : 'paused'

    // Position updates read the live element — not React `currentTime`, which
    // would tear this effect down ~10×/sec and re-register every handler.
    const updatePositionState = () => {
      const live = getPlaybackAudio()
      const position = readLiveMediaTime() || autoDJCurrentTimeRef.current
      const liveDuration =
        live && Number.isFinite(live.duration) && live.duration > 0 ? live.duration : duration
      if (live && liveDuration > 0 && 'setPositionState' in mediaSession) {
        try {
          mediaSession.setPositionState({
            duration: liveDuration,
            playbackRate: settingsRef.current.playbackRate,
            position,
          })
        } catch {
          // Some browsers don't support setPositionState
        }
      }
    }

    // Update position periodically
    const positionInterval = setInterval(updatePositionState, 1000)
    updatePositionState()

    return () => {
      clearInterval(positionInterval)
      if (mediaSession.metadata) {
        mediaSession.metadata = null
      }
      const clear = (action: string) => {
        try {
          mediaSession.setActionHandler(action as MediaSessionAction, null)
        } catch {
          // noop
        }
      }
      clear('play')
      clear('pause')
      clear('nexttrack')
      clear('previoustrack')
      clear('seekbackward')
      clear('seekforward')
      clear('seekto')
    }
  }, [currentTrack, lockScreenSrc, isPlaying, duration, queue.length, onNext, onPrevious, getPlaybackAudio])

  // If the browser pauses the element when the screen locks, resume when visible again.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      const audio = audioRef.current
      if (!audio || !isPlaying) return
      if (audio.paused) {
        audio.play().catch(() => {})
      }
      const ctx = audioContextRef.current
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [isPlaying])

  // Audio element setup and event handlers - only when track changes
  useEffect(() => {
    const audio = audioRef.current
    const activeUrl = playbackUrl
    if (!audio || !currentTrack || !activeUrl) return

    const handleError = (e: Event) => {
      const audio = e.target as HTMLAudioElement
      const isDevelopment = process.env.NODE_ENV === 'development'

      // iDJ owns the live element during same-deck load — never audio.load() here.
      if (
        isIDJEnabledRef.current &&
        (idjDeckSkipLockRef.current || skipSrcReloadRef.current || srcSwapRef.current)
      ) {
        return
      }
      
      // Only log error once per URL to reduce console spam
      const errorKey = resolvedUrl || currentTrack?.file || 'unknown'
      const hasLogged = loggedErrorsRef.current.has(errorKey)
      
      const mediaErrorCode = audio?.error?.code

      // Check for 544 error (Supabase Storage file not found or timeout)
      const is544Error = mediaErrorCode === MEDIA_ERR_NETWORK ||
        (resolvedUrl?.includes('supabase.co') && audio?.networkState === 3) // NO_SOURCE
      
      if (!hasLogged) {
        loggedErrorsRef.current.add(errorKey)
        
        if (isDevelopment) {
          if (is544Error) {
            console.warn(`Audio file not found or timeout (544): ${resolvedUrl}`)
            console.warn('This usually means the file doesn\'t exist in Supabase Storage or the file is too large.')
          } else {
            // Format/extension retries are expected (m4a↔mp3); don't scream.
            if (mediaErrorCode === MEDIA_ERR_SRC_NOT_SUPPORTED || retryCount < 2) {
              console.warn('Audio loading error:', {
                code: mediaErrorCode,
                message: audio?.error?.message,
                src: (audio?.currentSrc || resolvedUrl || '').slice(-80),
              })
            } else {
              console.error('Audio loading error:', e)
            }
          }
        }
      }

      // createMediaElementSource() binds an element to one AudioContext for the
      // element's lifetime. Once that context closes (deck teardown, background
      // playback switch), the element can never render again and every load fails
      // with MEDIA_ERR_DECODE / AUDIO_RENDERER_ERROR. No src can fix that — remount
      // onto a fresh, unbound element.
      if (
        mediaErrorCode === MEDIA_ERR_DECODE &&
        (mesCreatedForEpochRef.current || sourceNodeRef.current) &&
        !htmlAudioOnlyRef.current
      ) {
        fallBackToHtmlAudioOnlyRef.current()
        return
      }

      // Chromium reports AUDIO_RENDERER_ERROR as MEDIA_ERR_DECODE, but it is an
      // output-renderer failure, not a codec one: readyState is HAVE_ENOUGH_DATA
      // and the very same element plays the very same URL after a plain load().
      // It has no MediaElementSource to blame, so the remount above never fires
      // and nothing else retries a decode error — the track just dies. Reload in
      // place a couple of times before surfacing an error.
      if (mediaErrorCode === MEDIA_ERR_DECODE && decodeReloadsRef.current < MAX_DECODE_RELOADS) {
        const attempt = decodeReloadsRef.current + 1
        decodeReloadsRef.current = attempt
        const resumeAt = Number.isFinite(audio.currentTime) ? audio.currentTime : 0
        const wasPlaying = isPlayingRef.current
        setTimeout(() => {
          if (
            isIDJEnabledRef.current &&
            (idjDeckSkipLockRef.current || skipSrcReloadRef.current || srcSwapRef.current)
          ) {
            return
          }
          if (!audio.isConnected) return
          try {
            audio.load()
            if (resumeAt > 0) audio.currentTime = resumeAt
            if (wasPlaying) void audio.play().catch(() => {})
          } catch {
            /* the error handler will fire again and fall through to the message */
          }
        }, 300 * attempt)
        return
      }

      // Only a missing or unsupported source can be fixed by another extension. A
      // decode failure means we fetched the right bytes and could not render them.
      const canRetryExtension =
        mediaErrorCode == null ||
        mediaErrorCode === MEDIA_ERR_NETWORK ||
        mediaErrorCode === MEDIA_ERR_SRC_NOT_SUPPORTED
      const extensionCandidates = canRetryExtension
        ? mediaUrlExtensionCandidates(currentTrack.file, resolvedUrl || activeUrl)
        : []
      const maxRetries = Math.max(0, extensionCandidates.length - 1)

      // Retry mechanism — assign src only; never call load() (aborts in-flight fetch).
      if (retryCount < maxRetries) {
        setTimeout(() => {
          if (
            isIDJEnabledRef.current &&
            (idjDeckSkipLockRef.current || skipSrcReloadRef.current || srcSwapRef.current)
          ) {
            return
          }
          const nextAttempt = retryCount + 1
          setRetryCount(nextAttempt)

          const nextUrl = extensionCandidates[nextAttempt]
          if (nextUrl && assignMediaSrcIfChanged(audio, nextUrl)) {
            setResolvedUrl(nextUrl)
            if (currentTrack.file) {
              resolvedUrlCacheRef.current.set(currentTrack.file, nextUrl)
            }
            return
          }

          const proxy = toSameOriginMediaUrl(resolvedUrl || currentTrack.file)
          if (
            proxy &&
            assignMediaSrcIfChanged(audio, proxy) &&
            (isEdgePlaybackUrl(resolvedUrl || '') || !isDirectPlayableUrl(resolvedUrl || ''))
          ) {
            setResolvedUrl(proxy)
            if (currentTrack.file) {
              resolvedUrlCacheRef.current.set(currentTrack.file, proxy)
            }
          }
        }, 500 * (retryCount + 1))
      } else {
        // After retries failed, show appropriate error message
        let errorMsg = ''
        if (is544Error) {
          errorMsg = isDevelopment
            ? `Media file not found: ${resolvedUrl?.split('/').pop() || 'unknown file'}`
            : 'Audio file not found. Check vault upload or R2 sync.'
        } else if (mediaErrorCode === MEDIA_ERR_DECODE) {
          // Chromium reports a failure to start the system audio output with the
          // same code as a genuine decode failure. AUDIO_RENDERER_ERROR means the
          // bytes decoded fine and the output device refused the stream, so
          // blaming the file sends anyone debugging this the wrong way.
          errorMsg = /AUDIO_RENDERER_ERROR/i.test(audio.error?.message || '')
            ? 'Your system audio output refused to start. Check the output device in Sound settings, then reload.'
            : isDevelopment
              ? 'Audio decode failed. The file downloaded but the renderer rejected it.'
              : 'This track could not be played. Try another track or refresh the page.'
        } else {
          errorMsg = isDevelopment
            ? 'Failed to load audio. Check /api/audio/media and file extension (mp3/m4a/wav).'
            : 'Failed to load audio. Try another track or refresh the page.'
        }
        setError(errorMsg)
        setIsPlaying(false)
      }
    }

    let liveEl =
      playbackDeckRef.current === 'next' && nextAudioRef.current
        ? nextAudioRef.current
        : audio

    let bufferingUiTimer: ReturnType<typeof setTimeout> | null = null
    const clearBufferingUiTimer = () => {
      if (bufferingUiTimer) {
        clearTimeout(bufferingUiTimer)
        bufferingUiTimer = null
      }
    }

    const handleLoadStart = () => {
      // Intentional skip/src swap: never flip isLoading. That paused the
      // element (play effect) and retriggered load() — the reload/buffer loop.
      if (srcSwapRef.current) return
      if (idjDeckSkipLockRef.current || skipSrcReloadRef.current) return
      if (Date.now() < idjIgnoreBufferUiUntilRef.current) return
      if (liveEl.readyState >= 3 && !liveEl.paused) return
      setIsBuffering(true)
    }

    const handleCanPlay = () => {
      // During an iDJ same-deck load, applyIDJLiveTrack owns seek → play →
      // lock release. Playing here first caused a 0:00 blip then a seek jump.
      const idjLoading =
        isIDJEnabledRef.current &&
        (idjDeckSkipLockRef.current || skipSrcReloadRef.current)
      if (!idjLoading) {
        srcSwapRef.current = false
      }
      armIdjEnded('live')
      clearBufferingUiTimer()
      setIsBuffering(false)
      setIsLoading(false)
      setError(null)
      if (idjLoading) return
      if (isPlayingRef.current && liveEl.paused && !mixEngineRef.current?.hasBufferClock()) {
        void liveEl.play().catch(() => {})
      }
    }

    const handleWaiting = () => {
      if (srcSwapRef.current) return
      if (idjDeckSkipLockRef.current || skipSrcReloadRef.current) return
      if (Date.now() < idjIgnoreBufferUiUntilRef.current) return
      if (bufferingUiTimer) return
      bufferingUiTimer = setTimeout(() => {
        bufferingUiTimer = null
        if (srcSwapRef.current || liveEl.paused) return
        if (idjDeckSkipLockRef.current || skipSrcReloadRef.current) return
        if (Date.now() < idjIgnoreBufferUiUntilRef.current) return
        setIsBuffering(true)
      }, BUFFERING_UI_DELAY_MS)
    }

    let stallRecoveryTimer: ReturnType<typeof setTimeout> | null = null
    const handleStalled = () => {
      if (!isPlaying || liveEl.paused) return
      if (stallRecoveryTimer) return
      // Never `load()` here — that dumps the buffer and restarts the track.
      const frozenAt = liveEl.currentTime
      stallRecoveryTimer = setTimeout(() => {
        stallRecoveryTimer = null
        if (liveEl.paused || !isPlaying) return
        if (Math.abs(liveEl.currentTime - frozenAt) > 0.2) return
        recoverAudibleGraphRef.current()
        liveEl.play().catch(() => {})
      }, 4000)
    }

    // (Freeze watchdog lives in a separate effect — this one rebinds too often
    // when parent callbacks change and would never accumulate stuck ticks.)

    const handlePlaying = () => {
      if (!(isIDJEnabledRef.current && (idjDeckSkipLockRef.current || skipSrcReloadRef.current))) {
        srcSwapRef.current = false
      }
      if (stallRecoveryTimer) {
        clearTimeout(stallRecoveryTimer)
        stallRecoveryTimer = null
      }
      clearBufferingUiTimer()
      setIsBuffering(false)
      setIsLoading(false)
      // Only open Web Audio when iDJ / Auto DJ actually needs the mix graph.
      if (
        !htmlAudioOnlyRef.current &&
        (isIDJEnabledRef.current || autoDJConfigRef.current.enabled) &&
        (!audioContextRef.current || !sourceNodeRef.current)
      ) {
        setupAudioAnalysisRef.current().catch(() => {})
      }
      
      // Track play event when audio actually starts playing
      // Only track on public frontend routes, NOT admin routes
      if (currentTrack && trackedPlayRef.current !== currentTrack.id && !isAdminRoute) {
        trackedPlayRef.current = currentTrack.id
        trackTrackPlay(currentTrack.id, currentTrack.title)
      }
    }



    audio.preload = 'auto'

    const engineLive = mixEngineRef.current
    const live = getPlaybackAudio() || audio
    liveEl = live
    liveAudioRef.current = live
    const liveSrcMatches = mediaUrlsRoughlyEqual(live.currentSrc || live.src, activeUrl)
    const liveMatchesTrack = mediaUrlMatchesTrack(live.currentSrc || live.src, currentTrack.file)
    const alreadyBound =
      lastBoundPlaybackRef.current.id === currentTrack.id &&
      (lastBoundPlaybackRef.current.url === activeUrl ||
        mediaUrlsRoughlyEqual(lastBoundPlaybackRef.current.url, activeUrl) ||
        liveMatchesTrack) &&
      (liveSrcMatches || liveMatchesTrack)
    const idjOwnsLive =
      isIDJEnabledRef.current &&
      (idjDeckSkipLockRef.current || skipSrcReloadRef.current)

    if (idjOwnsLive || liveSrcMatches || alreadyBound) {
      // While iDJ owns the live element, do not drop skipSrcReload here — the
      // canplay handler (or applyIDJLiveTrack safety timeout) owns release.
      if (!idjOwnsLive) {
        skipSrcReloadRef.current = false
      }
      lastBoundPlaybackRef.current = { id: currentTrack.id, url: activeUrl }
      if (engineLive?.getActiveTrack()?.id === currentTrack.id) {
        playbackDeckRef.current = engineLive.getActiveDeck() === 'b' ? 'next' : 'main'
      }
      const syncKey = `${playbackDeckRef.current}:${currentTrack.id}`
      setWaveformMediaSyncKey((prev) => (prev === syncKey ? prev : syncKey))
      const t = readLiveMediaTime()
      const d =
        engineLive?.getDeckDuration() ||
        (Number.isFinite(live.duration) ? live.duration : 0)
      playbackTimeRef.current = t
      // Avoid setState storms when this effect re-enters for an already-bound src.
      setDuration((prev) => (Math.abs(prev - d) < 0.01 ? prev : d))
      pushTransportTime(t, d)
      setIsLoading(false)
      setIsBuffering(false)
      setError(null)
      if (
        !idjOwnsLive &&
        endedTrackIdRef.current === currentTrack.id &&
        isGenuineMediaEnd(live, 'live') &&
        (live.ended || (live.duration > 0 && live.currentTime >= live.duration - 0.08))
      ) {
        endedTrackIdRef.current = null
        try {
          live.currentTime = 0
        } catch {
          /* ignore */
        }
        if (isPlayingRef.current) void live.play().catch(() => {})
      }
    } else {
      // One src swap on the live deck only. Do not flip decks, pause idle,
      // or tear down AudioContext — those retrigger this effect and reload.
      srcSwapRef.current = true
      trackSwitchAtRef.current = Date.now()
      if (isIDJEnabledRef.current) disarmIdjEnded('live')
      const fallbackDur =
        typeof currentTrack.duration === 'number' && currentTrack.duration > 0
          ? currentTrack.duration
          : 0
      playbackTimeRef.current = 0
      setDuration(fallbackDur)
      setCurrentTime(0)
      pushTransportTime(0, fallbackDur)
      setIsBuffering(false)
      setIsLoading(false)
      assignMediaSrcIfChanged(live, activeUrl)
      lastBoundPlaybackRef.current = { id: currentTrack.id, url: activeUrl }
      setWaveformMediaSyncKey(`${playbackDeckRef.current}:${currentTrack.id}`)
      if (isPlayingRef.current) {
        void live.play().catch(() => {})
      }
    }

    if (trackedPlayRef.current !== currentTrack.id) {
      trackedPlayRef.current = null
    }
    
    // Imperative scrubber paint — avoids ~10 full MusicPlayer re-renders/sec.
    const readLiveTime = () => {
      const engine = mixEngineRef.current
      if (engine?.hasBufferClock()) {
        engine.stampActiveElementTime()
        return engine.getActiveMediaTime()
      }
      return liveEl.currentTime
    }
    const updateTime = throttle(() => {
      pushTransportTime(readLiveTime(), liveEl.duration)
    }, 100)
    // Persist seek position less often so reload restores mini-bar progress
    const persistTime = throttle(() => {
      reportPlaybackPosition(readLiveTime())
    }, 1000)
    const onTimeUpdate = () => {
      updateTime()
      persistTime()
    }
    
    const updateDuration = () => setDuration(liveEl.duration)
    const handleEnded = () => {
      // Never advance transport while a dual-deck mix is in progress
      if (phraseMixLockRef.current || mixEngineRef.current?.isMixing()) return
      if (!mediaUrlMatchesTrack(liveEl.currentSrc || liveEl.src, currentTrack.file)) return
      if (!isGenuineMediaEnd(liveEl, 'live')) return
      if (endedTrackIdRef.current === currentTrack.id) return
      endedTrackIdRef.current = currentTrack.id

      if (settings.repeatMode === 'one') {
        endedTrackIdRef.current = null
        liveEl.currentTime = 0
        liveEl.play().catch((err) => {
          if (err.name !== 'AbortError') {
            console.error('Audio play failed on repeat:', err)
          }
        })
        return
      }

      if (autoDJConfigRef.current.enabled) {
        skipToNextRef.current()
        return
      }

      if (idjOnDeckEndedRef.current('live')) return

      onTrackEnd()
    }

    liveEl.addEventListener('timeupdate', onTimeUpdate)
    liveEl.addEventListener('loadedmetadata', updateDuration)
    liveEl.addEventListener('ended', handleEnded)
    let endedFromClock = false
    const clockPoll = window.setInterval(() => {
      const engine = mixEngineRef.current
      if (!engine?.hasBufferClock()) return
      onTimeUpdate()
      if (!mediaUrlMatchesTrack(liveEl.currentSrc || liveEl.src, currentTrack.file)) return
      const dur = liveEl.duration
      if (
        !endedFromClock &&
        isGenuineMediaEnd(liveEl, 'live') &&
        dur > 0 &&
        engine.getActiveMediaTime() >= dur - 0.08
      ) {
        endedFromClock = true
        handleEnded()
      }
    }, 100)
    liveEl.addEventListener('error', handleError)
    liveEl.addEventListener('loadstart', handleLoadStart)
    liveEl.addEventListener('canplay', handleCanPlay)
    liveEl.addEventListener('waiting', handleWaiting)
    liveEl.addEventListener('stalled', handleStalled)
    liveEl.addEventListener('playing', handlePlaying)

    return () => {
      if (stallRecoveryTimer) clearTimeout(stallRecoveryTimer)
      clearBufferingUiTimer()
      window.clearInterval(clockPoll)
      liveEl.removeEventListener('timeupdate', onTimeUpdate)
      liveEl.removeEventListener('loadedmetadata', updateDuration)
      liveEl.removeEventListener('ended', handleEnded)
      liveEl.removeEventListener('error', handleError)
      liveEl.removeEventListener('loadstart', handleLoadStart)
      liveEl.removeEventListener('canplay', handleCanPlay)
      liveEl.removeEventListener('waiting', handleWaiting)
      liveEl.removeEventListener('stalled', handleStalled)
      liveEl.removeEventListener('playing', handlePlaying)
    }
  }, [currentTrack?.id, playbackUrl, retryCount, reportPlaybackPosition, pushTransportTime, getPlaybackAudio, audioElementEpoch])

  /**
   * MES with no destination freezes currentTime without firing `stalled`.
   * Keep this interval OUT of the media-bind effect — that effect's deps churn
   * and would reset stuck-tick counters before recovery can fire.
   */
  useEffect(() => {
    let freezeLastSec = 0
    let freezeStuckTicks = 0
    let freezeRecoverAttempts = 0
    const timer = window.setInterval(() => {
      const liveEl = getPlaybackAudio()
      if (!liveEl) return
      if (!isPlayingRef.current) {
        freezeStuckTicks = 0
        freezeLastSec = liveEl.currentTime
        return
      }
      // isPlaying but element paused — play() aborted or MES-bound element won't run.
      if (liveEl.paused) {
        freezeStuckTicks += 1
        if (freezeStuckTicks >= 2) {
          freezeStuckTicks = 0
          if (mesCreatedForEpochRef.current || sourceNodeRef.current) {
            fallBackToHtmlAudioOnlyRef.current()
          } else {
            void liveEl.play().catch(() => {
              fallBackToHtmlAudioOnlyRef.current()
            })
          }
        }
        return
      }
      if (htmlAudioOnlyRef.current) {
        freezeStuckTicks = 0
        freezeLastSec = liveEl.currentTime
        return
      }
      // Buffer source may leave the element paused while still audible — but if
      // the buffer clock exists AND the AudioContext is dead, fall through.
      const engine = mixEngineRef.current
      const ctx = audioContextRef.current
      const ctxDead =
        !ctx ||
        ctx.state === 'closed' ||
        (ctx.state as string) === 'interrupted'
      if (engine?.hasBufferClock() && !ctxDead) {
        freezeStuckTicks = 0
        freezeLastSec = liveEl.currentTime
        return
      }
      const now = liveEl.currentTime
      if (Math.abs(now - freezeLastSec) < 0.05) {
        freezeStuckTicks += 1
        if (freezeStuckTicks >= 2) {
          freezeStuckTicks = 0
          freezeRecoverAttempts += 1
          if (freezeRecoverAttempts >= 2 || ctxDead || !sourceNodeRef.current) {
            fallBackToHtmlAudioOnlyRef.current()
          } else {
            const mark = liveEl.currentTime
            recoverAudibleGraphRef.current()
            void liveEl.play().catch(() => {})
            window.setTimeout(() => {
              if (htmlAudioOnlyRef.current) return
              if (!isPlayingRef.current) return
              const el = getPlaybackAudio()
              if (!el || el.paused) return
              if (Math.abs(el.currentTime - mark) < 0.08) {
                fallBackToHtmlAudioOnlyRef.current()
              }
            }, 700)
          }
        }
      } else {
        freezeStuckTicks = 0
        freezeRecoverAttempts = 0
      }
      freezeLastSec = liveEl.currentTime
    }, 500)
    return () => window.clearInterval(timer)
  }, [getPlaybackAudio])

  // Track buffering progress and adjust buffer dynamically
  useEffect(() => {
    const audio = getPlaybackAudio()
    if (!audio || !resolvedUrl) return

    const updateBuffered = () => {
      if (audio.buffered.length > 0 && audio.duration > 0) {
        const bufferedEnd = audio.buffered.end(audio.buffered.length - 1)
        const bufferedPercent = (bufferedEnd / audio.duration) * 100
        setBufferedProgress(bufferedPercent)
        
        // If buffering is low and we're playing, try to increase buffer (auto mode only)
        if (isPlaying && bufferedPercent < 10 && settings.bufferSize === 'auto' && connectionQuality === 'fast') {
          // Switch to auto preload if we're running low
          if (audio.preload !== 'auto') {
            audio.preload = 'auto'
          }
        }
      }
    }

    audio.addEventListener('progress', updateBuffered)
    
    return () => {
      audio.removeEventListener('progress', updateBuffered)
    }
  }, [resolvedUrl, isPlaying, settings.bufferSize, connectionQuality, getPlaybackAudio])

  const easeLivePlaybackRate = useCallback(
    (fromRate: number, toRate: number, durationMs = 1400) => {
      if (rateEaseRafRef.current != null) {
        cancelAnimationFrame(rateEaseRafRef.current)
        rateEaseRafRef.current = null
      }
      if (tempoRampCancelRef.current) {
        tempoRampCancelRef.current()
        tempoRampCancelRef.current = null
      }
      const live = getPlaybackAudio()
      if (!live) return
      if (Math.abs(fromRate - toRate) < 0.004) {
        rateEaseLockRef.current = false
        applyLiveDeckTempo(toRate, true)
        return
      }
      rateEaseLockRef.current = true
      postHandoffTempoUntilRef.current = Date.now() + durationMs + 64
      tempoRampCancelRef.current = rampDeckTempo(live, fromRate, toRate, durationMs, {
        keyLock: true,
        onFormant: applyFormantForRate,
        onTick: () => {
          /* ramp handles element rate */
        },
      })
      window.setTimeout(() => {
        rateEaseLockRef.current = false
        tempoRampCancelRef.current = null
        applyLiveDeckTempo(toRate, true)
      }, durationMs + 32)
    },
    [getPlaybackAudio, applyLiveDeckTempo, applyFormantForRate]
  )

  // Update volume and playback rate separately - don't reload audio
  useEffect(() => {
    const vol = settings.isMuted ? 0 : settings.volume
    try {
      mixEngineRef.current?.setMasterVolume(vol)
    } catch {
      /* ignore */
    }
    const audio = getPlaybackAudio()
    if (!audio || phraseMixLockRef.current || mixEngineRef.current?.isMixing()) return

    if (playbackDeckRef.current === 'main') {
      audio.volume = vol
    }
    const handoff = deckHandoffRef.current
    const handoffTempoGuard =
      handoff &&
      handoff.trackId === currentTrack?.id &&
      Date.now() < handoff.untilMs
    if (handoffTempoGuard) {
      if (rateEaseLockRef.current) return
      const liveRate =
        Number.isFinite(audio.playbackRate) && audio.playbackRate > 0
          ? audio.playbackRate
          : handoff.incomingTargetRate
      if (Math.abs(liveRate - handoff.incomingTargetRate) > 0.004) {
        easeLivePlaybackRate(liveRate, handoff.incomingTargetRate, 850)
      }
      return
    }
    if (Date.now() < postHandoffTempoUntilRef.current) return
    if (!rateEaseLockRef.current) {
      applyLiveDeckTempo(settings.playbackRate, true)
    }
  }, [settings.volume, settings.isMuted, settings.playbackRate, getPlaybackAudio, applyLiveDeckTempo, currentTrack?.id, easeLivePlaybackRate])

  const handleMixDeckEq = useCallback(
    (deck: DeckId, gains: { low: number; mid: number; high: number }) => {
      mixUiPendingRef.current.deckEq[deck] = gains
      scheduleMixUiSync()
    },
    [scheduleMixUiSync],
  )

  const handleMixDeckRate = useCallback(
    (deck: DeckId, rate: number) => {
      const clamped = clampTempoRate(rate)
      mixUiPendingRef.current.deckRates[deck] = clamped
      scheduleMixUiSync()
      const liveDeck = playbackDeckRef.current === 'next' ? 'b' : 'a'
      if (deck === liveDeck) applyFormantForRate(clamped)
    },
    [scheduleMixUiSync, applyFormantForRate],
  )

  const syncPostHandoffEq = useCallback((deck: DeckId) => {
    const userEq = deckUiRef.current[deck].eqGains
    mixEngineRef.current?.setDeckEqGains(deck, userEq, { instant: false })
  }, [])

  const handleDeckEqGains = useCallback(
    (deck: 'a' | 'b', gains: { low: number; mid: number; high: number }) => {
      applyDeckStripEq(deck, gains, { instant: true })
    },
    [applyDeckStripEq],
  )

  const handleMixDeckFilter = useCallback(
    (deck: DeckId, state: { hpfHz: number; lpfHz: number }) => {
      mixUiPendingRef.current.deckFilters[deck] = state
      scheduleMixUiSync()
    },
    [scheduleMixUiSync],
  )

  // Crossfade / phrase mix via MixEngine (rAF equal-power + deck swap)
  const startPhraseMix = useCallback(
    async (
      nextTrack: Track,
      mixSec: number,
      incomingRate = 1,
      plan?: MixPlan | null,
      /** Rate the incoming deck settles on; defaults to the user's tempo slider. */
      opts?: { incomingTargetRate?: number },
    ) => {
      const main = audioRef.current
      const next = nextAudioRef.current
      if (!main || !next) {
        const qFallback = queueRef.current.some((t) => t.id === nextTrack.id)
          ? queueRef.current
          : [...queueRef.current, nextTrack]
        playTrack(nextTrack, qFallback)
        seekTo(
          autoDJConfigRef.current.enabled && !autoDJConfigRef.current.creativeMode
            ? trackIntroOffsetSec(nextTrack)
            : autoDJConfigRef.current.enabled
              ? resolveIncomingMixCueSec(nextTrack)
              : trackIntroOffsetSec(nextTrack),
        )
        return
      }

      if (phraseMixLockRef.current || mixEngineRef.current?.isMixing()) return

      clearSkipBlendWatch()

      const engine = ensureMixEngine()
      if (!engine) {
        playTrack(nextTrack, queueRef.current)
        return
      }
      await ensureDualDeckGraph()
      engine.setMasterVolume(settingsRef.current.isMuted ? 0 : settingsRef.current.volume)
      if (currentTrack) {
        engine.setActiveTrack(withMixGrid(currentTrack))
      }

      phraseMixLockRef.current = true
      autoDJPendingRef.current = null
      autoDJIdleWarmedRef.current = null
      setAutoDJPendingTrackId(null)
      clearFadeInterval()
      clearAutoDJCrossfadeTimeout()
      setCrossfadeActive(true)
      setMixVisualProgress(0)
      setWaveformMixOverlay((prev) =>
        prev?.active ? { ...prev, blendProgress: 0 } : prev,
      )

      const q = queueRef.current.some((t) => t.id === nextTrack.id)
        ? queueRef.current
        : [...queueRef.current, nextTrack]
      const introSec =
        plan &&
        plan.incomingTrackId === nextTrack.id &&
        typeof plan.resolvedIncomingSec === 'number' &&
        Number.isFinite(plan.resolvedIncomingSec)
          ? plan.resolvedIncomingSec
          : plan &&
              plan.incomingTrackId === nextTrack.id &&
              typeof plan.incomingStartSec === 'number' &&
              Number.isFinite(plan.incomingStartSec)
            ? plan.incomingStartSec
            : autoDJConfigRef.current.enabled && !autoDJConfigRef.current.creativeMode
              ? trackIntroOffsetSec(nextTrack)
              : autoDJConfigRef.current.enabled
                ? resolveIncomingMixCueSec(nextTrack)
                : plan?.incomingStartSec ?? trackIntroOffsetSec(nextTrack)
      const live = getPlaybackAudio() || main
      const liveNow = readLiveMediaTime()
      const liveDur =
        mixEngineRef.current?.getDeckDuration() ||
        (Number.isFinite(live.duration) ? live.duration : 0)
      const remain = liveDur - liveNow
      const autoDjDoctrine =
        autoDJConfigRef.current.enabled &&
        (plan?.blendFromOut !== false || plan?.phrase1Lock !== false || plan?.exactOverlap === true)
      const remainBlend = remain - 0.05
      const mixDurationSec = autoDjDoctrine && plan?.mixDurationSec
        ? plan.exactOverlap !== false
          ? exactOverlapDurationSec(plan.mixDurationSec)
          : remainBlend >= plan.mixDurationSec * 0.95
            ? plan.mixDurationSec
            : Math.max(0.8, Math.min(plan.mixDurationSec, remainBlend, 48))
        : Math.max(0.8, Math.min(mixSec, remain - 0.15, 48))
      const beatmatchRate = computeMixIncomingRate(currentTrack, nextTrack)

      const mixStyle = resolveSectionAwareMixStyle({
        outgoing: currentTrack ?? ({ id: 'out', file: '', title: '' } as Track),
        incoming: nextTrack,
        outSec: liveNow,
        userStyle: autoDJConfig.mixStyle,
        techniques: autoDJConfig.mixTechniques,
        currentStyle: resolveEffectiveMixStyle(
          autoDJConfig.mixStyle,
          autoDJConfig.mixTechniques,
        ),
        sectionStyle: autoDJConfig.sectionStyle,
      })

      const resolvedPlan: MixPlan =
        plan && plan.incomingTrackId === nextTrack.id
          ? {
              ...plan,
              mixDurationSec,
              // Keep AlignmentState / phrase-1 — do not overwrite with host memory cue.
              incomingStartSec: introSec,
              resolvedIncomingSec: introSec,
              rateRatio: incomingRate || plan.rateRatio || beatmatchRate,
              style: plan.style ?? mixStyle,
            }
          : {
              outgoingTrackId: currentTrack?.id || 'out',
              incomingTrackId: nextTrack.id,
              startAtOutgoingSec: liveNow,
              incomingStartSec: introSec,
              resolvedIncomingSec: introSec,
              mixDurationSec,
              rateRatio: incomingRate || beatmatchRate,
              style: mixStyle,
              curve: 'equal-power',
              outPhraseBars: autoDJConfig.outPhraseBars,
              inPhraseBars: autoDJConfig.inPhraseBars,
              overlapBars: autoDJConfig.overlapBars,
              phraseBars: autoDJConfig.overlapBars,
              reason: 'Manual/phrase mix',
            }
      lastMixPlanRef.current = resolvedPlan

      const abortToHardCut = () => {
        engine.stopMix()
        restoreMainVolume()
        setCrossfadeActive(false)
        clearMixVisualProgress()
        phraseMixLockRef.current = false
        mixIntelRef.current = null
        setCuedIdleTrackId(null)
        playbackDeckRef.current = 'main'
        skipSrcReloadRef.current = false
        playTrack(nextTrack, q)
        seekTo(introSec)
      }

      try {
        let url = resolvedUrlCacheRef.current.get(nextTrack.file) || null
        if (!url) {
          url = await resolveAudioUrl(nextTrack.file)
          if (url) resolvedUrlCacheRef.current.set(nextTrack.file, url)
        }
        if (!url) {
          abortToHardCut()
          return
        }

        setAutoDJStatusMessage(
          `Mixing ${resolvedPlan.overlapBars}-bar overlap → “${nextTrack.title}”`,
        )
        {
          const bpm =
            resolvePlaybackBpm(currentTrack, detectedBPMRef.current) ??
            currentTrack?.bpm ??
            detectedBPMRef.current ??
            120
          const aligned = alignMixOverlayToBeatGrid({
            mixOutSec: resolvedPlan.startAtOutgoingSec,
            mixDurationSec: resolvedPlan.mixDurationSec,
            bpm,
            offsetSec: beatGridOffsetSecRef.current,
            overlapBars: resolvedPlan.overlapBars,
          })
          setWaveformMixOverlay({
            active: true,
            mixOutSec: aligned.mixOutSec,
            mixStartSec: aligned.mixStartSec,
            mixEndSec: aligned.mixEndSec,
          })
        }
        // Ensure ghost samples ready
        if (ghostSamplesRef.current?.trackId !== nextTrack.id) {
          void loadWaveformSamplesForTrack(nextTrack, url, { allowFullDecode: true }).then((packed) => {
            if (!packed) return
            cacheMixGridOffset(nextTrack, packed.samples, packed.durationSec || nextTrack.duration || 180)
            ghostSamplesRef.current = {
              trackId: nextTrack.id,
              samples: packed.samples,
              durationSec: packed.durationSec || nextTrack.duration || 180,
              sonicDna: nextTrack.sonic_dna,
            }
            const idleDeck: 'a' | 'b' = playbackDeckRef.current === 'next' ? 'a' : 'b'
            setDeckWaveformCache((prev) => ({
              ...prev,
              [idleDeck]: {
                trackId: nextTrack.id,
                samples: packed.samples,
                durationSec: packed.durationSec || nextTrack.duration || 180,
              },
            }))
          })
        }

        const mixIntel = buildMixIntelligenceForPair(
          currentTrack ?? ({ id: 'out', file: '', title: '' } as Track),
          nextTrack,
          resolvedPlan.style,
          opts?.incomingTargetRate ?? settingsRef.current.playbackRate,
        )
        mixIntelRef.current = mixIntel

        const outDeckId = engine.getActiveDeck()
        const inDeckId: DeckId = outDeckId === 'a' ? 'b' : 'a'
        const outgoingUserEq = getDeckStripEq(outDeckId)
        const incomingUserEq = getDeckStripEq(inDeckId)

        const ok = await engine.prepareAndTransition(
          resolvedPlan,
          withMixGrid(nextTrack),
          url,
          {
            incomingRate: resolvedPlan.rateRatio,
            incomingTargetRate: opts?.incomingTargetRate ?? settingsRef.current.playbackRate,
            masterVolume: settingsRef.current.isMuted ? 0 : settingsRef.current.volume,
            audioContext: audioContextRef.current,
            mixIntelligence: mixIntel,
            onProgress: pushMixVisualProgress,
            onDeckRate: handleMixDeckRate,
            onDeckEq: handleMixDeckEq,
            onDeckFilter: handleMixDeckFilter,
            outgoingEqBias: outgoingUserEq,
            incomingEqBias: incomingUserEq,
            keyLock: true,
          },
        )

        if (!ok) {
          abortToHardCut()
          return
        }

        // The engine swapped its own active deck when the fade completed. Deriving
        // the deck from the pre-mix playbackDeckRef here would undo that swap and
        // leave the outgoing deck live, so read the engine and follow it instead.
        engine.setMasterVolume(settingsRef.current.isMuted ? 0 : settingsRef.current.volume)

        // Mixer handoff — incoming stays on its deck; both channels remain "on"
        const handoffTarget = opts?.incomingTargetRate ?? settingsRef.current.playbackRate
        const nextDeck = engine.getActiveDeck() === 'b' ? 'next' : 'main'
        armDeckHandoff(nextTrack, nextDeck, handoffTarget)
        playbackDeckRef.current = nextDeck
        // Sync waveform clock to live deck immediately (don't wait for React commit)
        liveAudioRef.current =
          playbackDeckRef.current === 'next' ? nextAudioRef.current : audioRef.current
        setWaveformMediaSyncKey(`${playbackDeckRef.current}:${nextTrack.id}`)
        const xfRest = nextDeck === 'next' ? 1 : 0
        setIdjCrossfade(xfRest)
        mixEngineRef.current?.setManualCrossfade(xfRest)
        setCuedIdleTrackId(null)
        setCrossfadeActive(false)
        clearMixVisualProgress()
        phraseMixLockRef.current = false

        const liveAfter = getPlaybackAudio()
        if (liveAfter?.paused && !engine.hasBufferClock()) {
          void liveAfter.play().catch(() => {})
        }
        // Engine already soft-opens filters after handoff settle — avoid a second snap.

        adoptPlayingTrack(nextTrack, q)
        setResolvedUrl(url)
        // MixEngine already slews both decks onto mixEndRate. A second
        // easeLivePlaybackRate here fought that ramp and felt like a stop.
        if (autoDJConfigRef.current.enabled) {
          // Wait until outgoing fader + park settle before pausing that deck
          // to load N+2 — pause-during-tail is the end-of-mix click.
          window.setTimeout(() => {
            if (mixEngineRef.current?.isMixing()) return
            void precueIdleForQueueSuccessorRef.current?.(nextTrack, q)
          }, 700)
        }
        mixIntelRef.current = null
        setWaveformMixOverlay(null)
        setWaveformGhostTape(null)
        ghostSamplesRef.current = null
        setAutoDJStatusMessage(`On air: “${nextTrack.title}”`)
        const activeEngineDeck = engine.getActiveDeck()
        window.setTimeout(() => {
          if (!isDeckHandoffActive(nextTrack.id)) return
          syncPostHandoffEq(activeEngineDeck)
        }, 280)
      } catch (err) {
        console.debug('Phrase mix failed:', err)
        abortToHardCut()
      }
    },
    [
      clearFadeInterval,
      clearAutoDJCrossfadeTimeout,
      clearSkipBlendWatch,
      restoreMainVolume,
      trackIntroOffsetSec,
      resolveIncomingMixCueSec,
      playTrack,
      seekTo,
      adoptPlayingTrack,
      getPlaybackAudio,
      ensureMixEngine,
      ensureDualDeckGraph,
      handleMixDeckEq,
      handleMixDeckRate,
      handleMixDeckFilter,
      cacheMixGridOffset,
      toMixTrackRef,
      applyFormantForRate,
      computeMixIncomingRate,
      buildMixIntelligenceForPair,
      armDeckHandoff,
      syncPostHandoffEq,
      isDeckHandoffActive,
      getDeckStripEq,
      pushMixVisualProgress,
      clearMixVisualProgress,
      currentTrack?.id,
      getOutgoingPlaybackRate,
      autoDJConfig.mixStyle,
      autoDJConfig.mixTechniques,
      autoDJConfig.outPhraseBars,
      autoDJConfig.inPhraseBars,
      autoDJConfig.overlapBars,
      autoDJConfig.energyCurve,
    ]
  )

  const startCrossfade = useCallback(
    (nextTrack: Track, durationOverride?: number) => {
      const fadeSec =
        typeof durationOverride === 'number' && durationOverride >= 0
          ? durationOverride
          : settings.crossfadeDuration
      if (fadeSec <= 0) {
        restoreMainVolume()
        const q = queueRef.current.some((t) => t.id === nextTrack.id)
          ? queueRef.current
          : [...queueRef.current, nextTrack]
        playTrack(nextTrack, q)
        seekTo(trackIntroOffsetSec(nextTrack))
        return
      }
      void startPhraseMix(nextTrack, fadeSec)
    },
    [
      settings.crossfadeDuration,
      startPhraseMix,
      restoreMainVolume,
      playTrack,
      seekTo,
      trackIntroOffsetSec,
    ]
  )

  const silenceCuedIdle = useCallback(() => {
    mixEngineRef.current?.silenceIdle({ instant: true })
    const idle = getIdleAudio()
    if (!idle) return
    try {
      idle.pause()
      idle.volume = 0
    } catch {
      /* ignore */
    }
  }, [getIdleAudio])

  const wasIDJEnabledRef = useRef(false)
  useEffect(() => {
    if (!isIDJEnabled) {
      if (wasIDJEnabledRef.current) {
        mixEngineRef.current?.clearManualCrossfade()
        silenceCuedIdle()
        setIdleDeckPlaying(false)
        setIdjIdleTrackId(null)
        setCueDeckTrackOverride(null)
        idjIdleTrackIdRef.current = null
      }
      wasIDJEnabledRef.current = false
      return
    }
    const enabling = !wasIDJEnabledRef.current
    wasIDJEnabledRef.current = true
    if (!enabling) return
    const xf = playbackDeckRef.current === 'next' ? 1 : 0
    setIdjCrossfade(xf)
    void (async () => {
      await loadMixEngineClass()
      try {
        await ensureDualDeckGraph()
      } catch {
        /* mix without analysis */
      }
      mixEngineRef.current?.setManualCrossfade(xf)
    })()
  }, [isIDJEnabled, ensureDualDeckGraph, silenceCuedIdle])

  useEffect(() => {
    if (isExpanded || !isIDJEnabled) return
    const idle = getIdleAudio()
    if (!idle || idle.paused) return
    idle.pause()
    setIdleDeckPlaying(false)
  }, [isExpanded, isIDJEnabled, getIdleAudio])

  useEffect(() => {
    const idle = getIdleAudio()
    if (!idle) return
    const onPlay = () => setIdleDeckPlaying(true)
    const onPause = () => setIdleDeckPlaying(false)
    const onEnded = () => {
      if (!isGenuineMediaEnd(idle, 'idle')) return
      if (idjOnDeckEndedRef.current('idle')) return
      setIdleDeckPlaying(false)
    }
    const onCanPlay = () => armIdjEnded('idle')
    idle.addEventListener('play', onPlay)
    idle.addEventListener('pause', onPause)
    idle.addEventListener('ended', onEnded)
    idle.addEventListener('canplay', onCanPlay)
    return () => {
      idle.removeEventListener('play', onPlay)
      idle.removeEventListener('pause', onPause)
      idle.removeEventListener('ended', onEnded)
      idle.removeEventListener('canplay', onCanPlay)
    }
  }, [getIdleAudio, currentTrack?.id, isIDJEnabled])

  const armResolvedUrlForTrack = useCallback((track: Track | null | undefined) => {
    if (!track?.file) return
    const url = peekSyncPlaybackUrl(track.file, resolvedUrlCacheRef.current)
    if (url) setResolvedUrl((prev) => (prev === url ? prev : url))
  }, [])

  const hardSkipToNext = useCallback(() => {
    clearSkipBlendWatch()
    clearAutoDJOutWatch()
    mixEngineRef.current?.stopMix()
    silenceCuedIdle()
    setCuedIdleTrackId(null)
    phraseMixLockRef.current = false
    skipSrcReloadRef.current = false
    deckHandoffRef.current = null
    endedTrackIdRef.current = null
    const q = queueRef.current
    const cur = autoDJCurrentTrackRef.current
    const idx = cur ? q.findIndex((t) => t.id === cur.id) : -1
    const next = (idx >= 0 && idx < q.length - 1 ? q[idx + 1] : q[0]) ?? null
    armResolvedUrlForTrack(next)
    onNext?.()
  }, [clearSkipBlendWatch, clearAutoDJOutWatch, silenceCuedIdle, onNext, armResolvedUrlForTrack])

  /**
   * AutoDJ skip-while-cued: blend from the next outgoing beat into the parked
   * phrase-1 cue instead of a hard cut. Falls back to hard skip when not cued.
   */
  const tryAutoDjSkipBlend = useCallback((): boolean => {
    if (!autoDJConfigRef.current.enabled) return false
    if (phraseMixLockRef.current || mixEngineRef.current?.isMixing()) return false

    const cur = autoDJCurrentTrackRef.current
    const q = queueRef.current
    if (!cur) return false
    const idx = q.findIndex((t) => t.id === cur.id)
    const next = idx >= 0 && idx < q.length - 1 ? q[idx + 1] : null
    if (!next) return false
    if (cuedIdleTrackIdRef.current !== next.id) return false

    const live = getPlaybackAudio()
    if (!live) return false
    const nowSec = Number.isFinite(live.currentTime) ? live.currentTime : 0
    const liveDur =
      mixEngineRef.current?.getDeckDuration() ||
      (Number.isFinite(live.duration) ? live.duration : cur.duration || 0)

    const prior =
      (autoDJFrozenPlanRef.current?.incomingId === next.id
        ? autoDJFrozenPlanRef.current.plan
        : null) ||
      (lastMixPlanRef.current?.incomingTrackId === next.id ? lastMixPlanRef.current : null)

    const cfg = autoDJConfigRef.current
    const outBpm =
      resolvePlaybackBpm(cur, detectedBPMRef.current) ?? cur.bpm ?? detectedBPMRef.current ?? 120
    const inBpm = resolvePlaybackBpm(next, null) ?? next.bpm ?? outBpm
    const outRate = getOutgoingPlaybackRate()
    const handoffTarget = resolveIncomingRateForStrategy({
      strategy: cfg.bpmStrategy,
      beatmatchRate: 1,
      sliderRate: settingsRef.current.playbackRate,
    })
    const rateRatio = computeMixDeckRates({
      outgoingBpm: outBpm,
      incomingBpm: inBpm,
      outgoingPlaybackRate: outRate,
      incomingTargetRate: handoffTarget,
    }).incomingRate

    const style =
      prior?.style ??
      resolveEffectiveMixStyle(cfg.mixStyle, cfg.mixTechniques)
    const skipPlan = orchestrateSkipBlendPlan({
      outgoingTrackId: cur.id,
      incomingTrackId: next.id,
      nowSec,
      outgoingBpm: outBpm,
      outgoingOffsetSec: beatGridOffsetSecRef.current,
      incomingStartSec:
        prior?.resolvedIncomingSec ??
        prior?.incomingStartSec ??
        (autoDJConfigRef.current.creativeMode
          ? resolveIncomingMixCueSec(next)
          : trackIntroOffsetSec(next)),
      overlapBars: (prior?.overlapBars ?? cfg.overlapBars) as PhraseBars,
      rateRatio,
      style,
      outPhraseBars: prior?.outPhraseBars ?? cfg.outPhraseBars,
      inPhraseBars: prior?.inPhraseBars ?? cfg.inPhraseBars,
      remainSec: Math.max(0, liveDur - nowSec),
      prior,
    })

    clearAutoDJOutWatch()
    clearSkipBlendWatch()
    autoDJPendingRef.current = next.id
    setAutoDJPendingTrackId(next.id)
    setAutoDJStatusMessage(`Skip blend → “${next.title}”`)
    lastMixPlanRef.current = skipPlan

    const fireAt = skipPlan.startAtOutgoingSec
    const fireSkip = () => {
      if (!autoDJConfigRef.current.enabled || phraseMixLockRef.current) {
        clearSkipBlendWatch()
        return
      }
      const liveNow = getPlaybackAudio()?.currentTime ?? autoDJCurrentTimeRef.current
      if (liveNow + 0.012 < fireAt) {
        skipBlendRafRef.current = requestAnimationFrame(fireSkip)
        return
      }
      clearSkipBlendWatch()
      autoDJFrozenPlanRef.current = null
      const gate = gateAutoDjFire({
        hasIncomingReady: mixEngineRef.current?.hasIncomingReady() === true,
        plannedOverlapSec: skipPlan.mixDurationSec,
        exactOverlapSec: skipPlan.mixDurationSec,
        requireIncomingReady: false,
      })
      void startPhraseMix(
        next,
        gate.mixDurationSec,
        skipPlan.rateRatio,
        { ...skipPlan, mixDurationSec: gate.mixDurationSec },
        { incomingTargetRate: handoffTarget },
      )
    }

    if (nowSec + 0.02 >= fireAt) {
      fireSkip()
    } else {
      skipBlendRafRef.current = requestAnimationFrame(fireSkip)
    }
    return true
  }, [
    clearAutoDJOutWatch,
    clearSkipBlendWatch,
    getPlaybackAudio,
    getOutgoingPlaybackRate,
    resolveIncomingMixCueSec,
    trackIntroOffsetSec,
    startPhraseMix,
  ])

  const handleSkipToPrevious = useCallback(() => {
    if (isIDJEnabledRef.current) {
      stepLiveDeckRef.current(-1)
      return
    }
    clearSkipBlendWatch()
    clearAutoDJOutWatch()
    mixEngineRef.current?.stopMix()
    silenceCuedIdle()
    setCuedIdleTrackId(null)
    phraseMixLockRef.current = false
    skipSrcReloadRef.current = false
    deckHandoffRef.current = null
    endedTrackIdRef.current = null
    const q = queueRef.current
    const cur = autoDJCurrentTrackRef.current
    const idx = cur ? q.findIndex((t) => t.id === cur.id) : -1
    const prev = (idx > 0 ? q[idx - 1] : q[q.length - 1]) ?? null
    armResolvedUrlForTrack(prev)
    onPrevious?.()
  }, [clearSkipBlendWatch, clearAutoDJOutWatch, silenceCuedIdle, onPrevious, armResolvedUrlForTrack])

  /**
   * Skip / next: AutoDJ skip-blend when cued; iDJ steps the live deck only;
   * otherwise hard cut.
   */
  const handleSkipToNext = useCallback(() => {
    if (isIDJEnabledRef.current) {
      stepLiveDeckRef.current(1)
      return
    }
    if (tryAutoDjSkipBlend()) return
    hardSkipToNext()
  }, [hardSkipToNext, tryAutoDjSkipBlend])

  skipToNextRef.current = handleSkipToNext
  skipToPreviousRef.current = handleSkipToPrevious

  // Playback control
  useEffect(() => {
    const audio = getPlaybackAudio()
    if (!audio) return

    if (isPlaying && !error) {
      // iDJ same-deck load owns the first play after seek; don't resume early.
      if (idjDeckSkipLockRef.current || skipSrcReloadRef.current) return
      if (srcSwapRef.current && audio.readyState < 2) return
      if (mixEngineRef.current?.hasBufferClock()) {
        mixEngineRef.current.resumeActiveClock()
      } else if (audio.paused) {
        audio.play().catch((err) => {
          if (err.name !== 'AbortError') {
            console.error('Audio play failed:', err)
            setIsPlaying(false)
            setError('Playback failed')
          }
        })
      }
    } else if (
      !isPlaying &&
      !phraseMixLockRef.current &&
      !mixEngineRef.current?.isMixing() &&
      !isDeckHandoffActive(currentTrack?.id)
    ) {
      mixEngineRef.current?.pauseActiveClock()
      audio.pause()
    }
  }, [isPlaying, error, getPlaybackAudio, isDeckHandoffActive, currentTrack?.id])

  // Seek function
  const seek = useCallback((seconds: number) => {
    const audio = getPlaybackAudio()
    if (!audio) return
    const engine = mixEngineRef.current
    const now = engine?.hasBufferClock() ? engine.getActiveMediaTime() : audio.currentTime
    const newTime = Math.max(0, Math.min(duration, now + seconds))
    if (engine?.hasBufferClock()) engine.seekActiveMedia(newTime)
    else audio.currentTime = newTime
    snapPlaybackTime(newTime)
  }, [duration, snapPlaybackTime, getPlaybackAudio])

  // Touch gestures for mobile
  useEffect(() => {
    const player = playerRef.current
    if (!player) return

    const handleTouchStart = (e: TouchEvent) => {
      if (waveformContainerRef.current?.contains(e.target as Node)) return
      if (e.touches.length === 1) {
        touchStartXRef.current = e.touches[0].clientX
        touchStartYRef.current = e.touches[0].clientY
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (waveformContainerRef.current?.contains(e.target as Node)) return
      if (touchStartXRef.current === null || touchStartYRef.current === null || e.touches.length !== 1) return

      const touchX = e.touches[0].clientX
      const touchY = e.touches[0].clientY
      const deltaX = touchX - touchStartXRef.current
      const deltaY = touchY - touchStartYRef.current

      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 30) {
        e.preventDefault()
        const seekSeconds = Math.floor(deltaX / 5)
        seek(seekSeconds)
        touchStartXRef.current = null
        touchStartYRef.current = null
      }
    }

    const handleTouchEnd = () => {
      touchStartXRef.current = null
      touchStartYRef.current = null
    }

    player.addEventListener('touchstart', handleTouchStart, { passive: false })
    player.addEventListener('touchmove', handleTouchMove, { passive: false })
    player.addEventListener('touchend', handleTouchEnd)

    return () => {
      player.removeEventListener('touchstart', handleTouchStart)
      player.removeEventListener('touchmove', handleTouchMove)
      player.removeEventListener('touchend', handleTouchEnd)
    }
  }, [seek])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (
        (e.target instanceof HTMLInputElement) ||
        (e.target instanceof HTMLTextAreaElement) ||
        (e.target instanceof HTMLButtonElement)
      ) {
        return
      }

      if (!currentTrack) return

      const audio = getPlaybackAudio()
      if (!audio) return

      switch (e.key) {
        case ' ':
          e.preventDefault()
          togglePlay()
          break
        case 'ArrowLeft': {
          e.preventDefault()
          const bpm =
            resolvePlaybackBpm(currentTrack, detectedBPM) || detectedBPM || currentTrack.bpm || 120
          const beat = 60 / Math.max(1, Number(bpm) || 120)
          if (e.altKey) seek(-(beat * 4 * (autoDJConfig.overlapBars || 8)))
          else if (e.shiftKey) seek(-(beat * 4))
          else seek(-beat)
          break
        }
        case 'ArrowRight': {
          e.preventDefault()
          const bpm =
            resolvePlaybackBpm(currentTrack, detectedBPM) || detectedBPM || currentTrack.bpm || 120
          const beat = 60 / Math.max(1, Number(bpm) || 120)
          if (e.altKey) seek(beat * 4 * (autoDJConfig.overlapBars || 8))
          else if (e.shiftKey) seek(beat * 4)
          else seek(beat)
          break
        }
        case 'ArrowUp':
          e.preventDefault()
          adjustVolume(0.05)
          break
        case 'ArrowDown':
          e.preventDefault()
          adjustVolume(-0.05)
          break
        case '1':
        case '2':
        case '3':
        case '4': {
          const slot = Number(e.key) as 1 | 2 | 3 | 4
          e.preventDefault()
          if (e.metaKey || e.ctrlKey) {
            persistHotCue(slot, audio.currentTime || 0)
          } else {
            jumpHotCue(slot)
          }
          break
        }
        case 'm':
        case 'M':
          e.preventDefault()
          toggleMute()
          break
        case 's':
        case 'S':
          e.preventDefault()
          toggleShuffle()
          break
        case 'r':
        case 'R':
          e.preventDefault()
          cycleRepeatMode()
          break
        case 'k':
        case 'K':
          if (!e.metaKey && !e.ctrlKey && !e.altKey) {
            e.preventDefault()
            const bpm =
              resolvePlaybackBpm(currentTrack, detectedBPM) ||
              detectedBPM ||
              currentTrack.bpm ||
              120
            const next = quantizeToDnaGrid({
              timeSec: audio.currentTime,
              bpm,
              offsetSec: beatGridOffsetSec,
              sonicDna: currentTrack?.sonic_dna,
              mode: 'kick',
            })
            audio.currentTime = next
            setCurrentTime(next)
          }
          break
        case 'p':
        case 'P':
          if (!e.metaKey && !e.ctrlKey && !e.altKey) {
            e.preventDefault()
            const bpm =
              resolvePlaybackBpm(currentTrack, detectedBPM) ||
              detectedBPM ||
              currentTrack.bpm ||
              120
            const next = quantizeToDnaGrid({
              timeSec: audio.currentTime,
              bpm,
              offsetSec: beatGridOffsetSec,
              sonicDna: currentTrack?.sonic_dna,
              mode: 'phrase',
            })
            audio.currentTime = next
            setCurrentTime(next)
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [currentTrack, isPlaying, settings, seek, persistHotCue, jumpHotCue, detectedBPM, autoDJConfig.overlapBars, getPlaybackAudio, beatGridOffsetSec])

  const togglePlay = async () => {
    const audio = getPlaybackAudio()
    if (!audio) return

    if (isPlaying) {
      mixEngineRef.current?.pauseActiveClock()
      audio.pause()
      setIsPlaying(false)
    } else {
      // Keep default play on HTMLMediaElement. Web Audio only for mix features.
      if (
        !htmlAudioOnlyRef.current &&
        (isIDJEnabledRef.current || autoDJConfigRef.current.enabled)
      ) {
        if (!audioContextRef.current || !sourceNodeRef.current) {
          try {
            await ensureDualDeckGraph()
          } catch (err: any) {
            if (process.env.NODE_ENV === 'development') {
              console.warn('AudioContext setup failed, continuing without analysis:', err)
            }
          }
        } else {
          recoverAudibleGraph()
        }
      }
      
      if (mixEngineRef.current?.hasBufferClock()) {
        mixEngineRef.current.resumeActiveClock()
      } else {
        audio.play().catch((err) => {
          // Ignore AbortError - it's expected when play() is interrupted by pause()
          if (err.name !== 'AbortError') {
            console.error('Audio play failed:', err)
            setError('Playback failed')
          }
        })
      }
      setIsPlaying(true)
      // MES + dead AudioContext freezes currentTime with paused=false — catch it
      // immediately after play instead of waiting on the slow interval alone.
      const mark = audio.currentTime
      window.setTimeout(() => {
        if (htmlAudioOnlyRef.current) return
        if (!isPlayingRef.current) return
        const live = getPlaybackAudio()
        if (!live || live.paused) return
        if (mixEngineRef.current?.hasBufferClock()) return
        if (Math.abs(live.currentTime - mark) < 0.05) {
          fallBackToHtmlAudioOnlyRef.current()
        }
      }, 900)
    }
  }


  const seekToTime = useCallback(
    (newTime: number) => {
      const audio = getPlaybackAudio()
      if (!audio) return
      const engine = mixEngineRef.current
      if (engine?.hasBufferClock()) engine.seekActiveMedia(newTime)
      else audio.currentTime = newTime
      snapPlaybackTime(newTime)
    },
    [getPlaybackAudio, snapPlaybackTime],
  )

  const adjustVolume = (delta: number) => {
    const newVolume = Math.max(0, Math.min(1, settings.volume + delta))
    saveSettings({ volume: newVolume, isMuted: newVolume === 0 })
    const live = getPlaybackAudio()
    if (live && !phraseMixLockRef.current) {
      live.volume = newVolume
    }
    mixEngineRef.current?.setMasterVolume(newVolume)
  }

  const toggleMute = () => {
    const newMuted = !settings.isMuted
    saveSettings({ isMuted: newMuted })
    const vol = newMuted ? 0 : settings.volume
    const live = getPlaybackAudio()
    if (live && !phraseMixLockRef.current) {
      live.volume = vol
    }
    mixEngineRef.current?.setMasterVolume(vol)
  }

  const toggleCatalogRandom = () => {
    const next = !settings.catalogRandom
    saveSettings({ catalogRandom: next })
    catalogRandomFillKeyRef.current = ''
    setAutoDJStatusMessage(
      next
        ? `Random · ${
            isOrderedReleaseRandomScope(currentSource)
              ? 'crates/EPs in order → fresh release'
              : catalogScopeLabel(currentSource)
          } on`
        : 'Catalog random off — queue order unchanged',
    )
  }

  const toggleShuffle = () => {
    if (queue.length <= 1) return

    const newShuffled = !settings.isShuffled
    saveSettings({ isShuffled: newShuffled })

    if (newShuffled) {
      // Shuffle the queue
      const shuffled = [...queue]
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }
      onShuffle?.(shuffled)
      onQueueChange?.(shuffled)
    } else {
      // Restore original queue
      if (originalQueue.length > 0) {
        onShuffle?.(originalQueue)
        onQueueChange?.(originalQueue)
      }
    }
  }

  const cycleRepeatMode = () => {
    const modes: Array<'off' | 'all' | 'one'> = ['off', 'all', 'one']
    const currentIndex = modes.indexOf(settings.repeatMode)
    const nextMode = modes[(currentIndex + 1) % modes.length]
    saveSettings({ repeatMode: nextMode })
  }

  const transportHandlersRef = useRef({
    togglePlay: async () => {},
    toggleShuffle: () => {},
    cycleRepeatMode: () => {},
    onPrevious: () => {},
    onNext: () => {},
  })
  transportHandlersRef.current = {
    togglePlay,
    toggleShuffle,
    cycleRepeatMode,
    onPrevious: () => handleSkipToPrevious(),
    onNext: () => skipToNextRef.current(),
  }

  useEffect(() => {
    const onCommand = (ev: Event) => {
      const cmd = (ev as CustomEvent<{ cmd: PlayerTransportCommand }>).detail?.cmd
      if (!cmd) return
      const h = transportHandlersRef.current
      switch (cmd) {
        case 'togglePlay':
          void h.togglePlay()
          break
        case 'previous':
          h.onPrevious()
          break
        case 'next':
          h.onNext()
          break
        case 'toggleShuffle':
          h.toggleShuffle()
          break
        case 'cycleRepeat':
          h.cycleRepeatMode()
          break
      }
    }
    window.addEventListener(PLAYER_TRANSPORT_EVENT, onCommand)
    dispatchPlayerSettings({
      isShuffled: settingsRef.current.isShuffled,
      repeatMode: settingsRef.current.repeatMode,
    })
    return () => window.removeEventListener(PLAYER_TRANSPORT_EVENT, onCommand)
  }, [])

  const changeDeckPlaybackRate = useCallback(
    (deck: 'a' | 'b', rate: number) => {
      const clamped = clampTempoRate(rate)
      const el = deck === 'a' ? audioRef.current : nextAudioRef.current
      if (el) {
        configureKeyLock(el, true)
        applyDeckTempo(el, clamped, { keyLock: true, instant: false })
      }
      mixEngineRef.current?.setDeckPlaybackRate(deck, clamped, { instant: false })
      setDeckUi((prev) => ({
        ...prev,
        [deck]: { ...prev[deck], playbackRate: clamped },
      }))
      const liveDeck = playbackDeckRef.current === 'next' ? 'b' : 'a'
      const idleDeck: DeckId = liveDeck === 'a' ? 'b' : 'a'
      if (
        deck === idleDeck &&
        cuedIdleTrackIdRef.current &&
        !mixEngineRef.current?.isMixing()
      ) {
        mixEngineRef.current?.lockIdleTempo(clamped)
      }
      if (deck === liveDeck) {
        saveSettings({ playbackRate: clamped })
        applyFormantForRate(clamped)
      }
    },
    [applyFormantForRate, saveSettings],
  )

  const changePlaybackRate = (rate: number) => {
    const liveDeck = playbackDeckRef.current === 'next' ? 'b' : 'a'
    changeDeckPlaybackRate(liveDeck, rate)
  }

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getCurrentQueueIndex = () => {
    if (!currentTrack) return -1
    return queue.findIndex(t => t.id === currentTrack.id)
  }

  const currentQueueIndex = useMemo(() => getCurrentQueueIndex(), [currentTrack, queue])

  const liveDeckId = waveformMediaSyncKey.startsWith('next') ? 'b' : 'a'
  liveDeckIdRef.current = liveDeckId

  const mixerCrossfadeProgress =
    autoDjXfUnlocked ||
    (isIDJEnabled && !(crossfadeActive && mixVisualProgress != null))
      ? idjCrossfade
      : mixCrossfaderPosition({
          liveDeck: liveDeckId,
          blendProgress: crossfadeActive ? mixVisualProgress : null,
        })

  const nextQueueTrack = useMemo(() => {
    const idx = currentQueueIndex
    return idx >= 0 && queue[idx + 1] ? queue[idx + 1] : null
  }, [currentQueueIndex, queue])

  useEffect(() => {
    if (currentTrack?.id) idjLiveTrackIdRef.current = currentTrack.id
  }, [currentTrack?.id])

  useEffect(() => {
    if (!isIDJEnabled || idjIdleTrackIdRef.current) return
    const idle = nextQueueTrack
    if (!idle?.id || idle.id === currentTrack?.id) return
    idjIdleTrackIdRef.current = idle.id
    setIdjIdleTrackId(idle.id)
  }, [isIDJEnabled, nextQueueTrack, currentTrack?.id])

  const memoryCueMarker = useCallback((trackId: string | undefined): WaveformHotCue[] => {
    if (!trackId) return []
    const t = idjMemoryCues[trackId]
    if (typeof t !== 'number' || !Number.isFinite(t)) return []
    return [
      {
        id: `${trackId}-cue`,
        timeSec: t,
        label: 'CUE',
        color: 'rgba(251, 191, 36, 0.95)',
      },
    ]
  }, [idjMemoryCues])

  const liveWaveformCues = useMemo(
    () => [...waveformHotCues, ...memoryCueMarker(currentTrack?.id)],
    [waveformHotCues, memoryCueMarker, currentTrack?.id],
  )

  const idleDeckTrackId = idjIdleTrackId || nextQueueTrack?.id

  const idleWaveformCues = useMemo(() => {
    const id = idleDeckTrackId
    if (!id) return memoryCueMarker(id)
    const slots = readHotCueSlots(id)
    const cues: WaveformHotCue[] = HOT_CUE_SLOTS.filter((slot) => typeof slots[slot] === 'number')
      .map((slot) => ({
        id: `${id}-${slot}`,
        timeSec: slots[slot] as number,
        label: String(slot),
        color: 'rgba(167, 139, 250, 0.95)',
      }))
    return [...cues, ...memoryCueMarker(id)].sort((a, b) => a.timeSec - b.timeSec)
  }, [idleDeckTrackId, memoryCueMarker, hotCueRevision])

  useEffect(() => {
    const id = idleDeckTrackId ?? null
    if (incomingZoomTrackIdRef.current === id) return
    incomingZoomTrackIdRef.current = id
    setIncomingVisibleBars(0)
    setIncomingOffset(0)
    setIncomingFollow(false)
  }, [idleDeckTrackId])

  /** Live deck = now playing; idle deck = iDJ pick, drop override, or queue up-next. */
  const trackForQueueDeck = useCallback(
    (deck: 'a' | 'b'): Track | null => {
      if (deck === liveDeckId) return currentTrack ?? null
      if (idjIdleTrackId) {
        const picked = queue.find((t) => t.id === idjIdleTrackId)
        if (picked) return picked
        if (cueDeckTrackOverride?.id === idjIdleTrackId) return cueDeckTrackOverride
      }
      return nextQueueTrack ?? null
    },
    [liveDeckId, currentTrack, nextQueueTrack, idjIdleTrackId, queue, cueDeckTrackOverride],
  )

  const incomingDeckHot = (isIDJEnabled || isAutoDJEnabled) && !!nextQueueTrack

  const autoDjPairInsight = useMemo(() => {
    if (!currentTrack || !nextQueueTrack) {
      return { why: null as string | null, beatSyncUnsafe: null as string | null }
    }
    const last = mixQualityHistory[0]
    const scored = scoreAutoDjPair({
      outgoing: currentTrack,
      incoming: nextQueueTrack,
      syncMode: autoDJConfig.syncMode,
      lastGrade: last?.grade,
      lastIncomingId: last?.incomingTrackId ?? null,
      consecutiveWeak: autoDJConfig.autoCorrectWeakMixes
        ? consecutiveWeakMixCount(mixQualityHistory)
        : 0,
    })
    const safety = assessBeatSyncSafety({
      outgoingSonicDna: currentTrack.sonic_dna,
      incomingSonicDna: nextQueueTrack.sonic_dna,
      outgoingBpm: resolvePlaybackBpm(currentTrack, detectedBPM) ?? currentTrack.bpm ?? null,
      incomingBpm: resolvePlaybackBpm(nextQueueTrack, null) ?? nextQueueTrack.bpm ?? null,
      outgoingGridOffset: currentTrack.beat_grid_offset,
      incomingGridOffset: nextQueueTrack.beat_grid_offset,
      syncMode: autoDJConfig.syncMode,
    })
    const beatSyncUnsafe =
      autoDJConfig.syncMode === 'beat-sync' && !safety.ok ? safety.message : null
    return { why: scored.why, beatSyncUnsafe }
  }, [
    currentTrack,
    nextQueueTrack,
    autoDJConfig.syncMode,
    autoDJConfig.autoCorrectWeakMixes,
    mixQualityHistory,
    detectedBPM,
  ])

  const autoDjDeckStatusLine = useMemo(() => {
    if (!isAutoDJEnabled) return null
    if (crossfadeActive && mixVisualProgress != null) {
      const bars = autoDJConfig.overlapBars
      return `Blending ${Math.round(mixVisualProgress * 100)}% · ${bars}-bar overlap`
    }
    const safetyBit = autoDjPairInsight.beatSyncUnsafe
      ? `BeatSync unsafe — ${autoDjPairInsight.beatSyncUnsafe}`
      : null
    if (autoDJOutCountdown != null && autoDJOutCountdown > 0) {
      const hint =
        autoDjPairInsight.why ||
        (currentTrack && nextQueueTrack
          ? formatMixPairHintLine(
              buildMixPairHint(
                {
                  bpm:
                    resolvePlaybackBpm(currentTrack, detectedBPM) ??
                    currentTrack.bpm ??
                    null,
                  sonic_dna: currentTrack.sonic_dna,
                  trackKey: displayTrackKey(currentTrack) || null,
                },
                {
                  bpm:
                    resolvePlaybackBpm(nextQueueTrack, null) ??
                    nextQueueTrack.bpm ??
                    null,
                  sonic_dna: nextQueueTrack.sonic_dna,
                  trackKey: displayTrackKey(nextQueueTrack) || null,
                },
              ),
            )
          : null)
      return `OUT in ${autoDJOutCountdown.toFixed(1)}s${hint ? ` · ${hint}` : ''}${
        safetyBit ? ` · ${safetyBit}` : ''
      }`
    }
    return safetyBit
  }, [
    isAutoDJEnabled,
    crossfadeActive,
    mixVisualProgress,
    autoDJOutCountdown,
    autoDJConfig.overlapBars,
    currentTrack,
    nextQueueTrack,
    detectedBPM,
    autoDjPairInsight,
  ])

  const resolveTrackBpm = useCallback((track: Track | null | undefined) => {
    if (!track) return null
    const locked = Number(readCatalogOverrides(track.metadata)?.bpm)
    if (Number.isFinite(locked) && locked > 0) return locked
    const tape = tapeGridByTrackId[track.id]
    if (tape?.bpm) {
      const catalog = displayTrackBpm(track)
      return reconcileTapeBpm(tape.bpm, locked || catalog)
    }
    const catalog = displayTrackBpm(track)
    if (catalog) return catalog
    const cached = bpmCacheRef.current.get(track.id)
    if (typeof cached === 'number') return cached
    return track.bpm ?? null
  }, [tapeGridByTrackId])

  const resolveTrackBeatGridOffset = useCallback(
    (track: Track | null | undefined): number => {
      if (!track) return 0
      const bpm = resolvePlaybackBpm(track) ?? track.bpm ?? 120
      const beatSec = 60 / (bpm > 0 ? bpm : 120)
      // Manual CDJ jog may store multi-bar offsets (window wrap). Do not crush
      // those back to one beat on read — phase-only is only for DNA/tape defaults.
      if (!isUnsetOffset(track.beat_grid_offset)) {
        if (track.grid_manual === true || isGridManual(track.sonic_dna)) {
          return Math.max(0, track.beat_grid_offset!)
        }
        return toPhaseOnlyOffsetSec(track.beat_grid_offset!, beatSec)
      }
      const tape = tapeGridByTrackId[track.id]
      if (tape) {
        const tapeBeat = 60 / (tape.bpm > 0 ? tape.bpm : 120)
        return toPhaseOnlyOffsetSec(tape.offsetSec, tapeBeat)
      }
      const cached = mixGridOffsetCacheRef.current.get(track.id)
      if (typeof cached === 'number' && Number.isFinite(cached)) {
        // Cache may hold a multi-bar manual jog — keep it.
        return Math.max(0, cached)
      }
      return playbackGridPhaseSec(track, bpm)
    },
    [tapeGridByTrackId],
  )

  useEffect(() => {
    setDeckUi((prev) => ({
      ...prev,
      [liveDeckId]: { ...prev[liveDeckId], detectedBpm: detectedBPM },
    }))
  }, [detectedBPM, liveDeckId])

  useEffect(() => {
    const aRate = audioRef.current?.playbackRate
    const bRate = nextAudioRef.current?.playbackRate
    setDeckUi((prev) => ({
      ...prev,
      a: {
        ...prev.a,
        playbackRate:
          typeof aRate === 'number' && aRate > 0 ? aRate : prev.a.playbackRate,
      },
      b: {
        ...prev.b,
        playbackRate:
          typeof bRate === 'number' && bRate > 0 ? bRate : prev.b.playbackRate,
      },
    }))
  }, [waveformMediaSyncKey, currentTrack?.id, settings.playbackRate])

  useEffect(() => {
    if (!isExpanded || !audioContextReady) return
    const engine = mixEngineRef.current
    if (!engine) return
    setDeckUi((prev) => ({
      ...prev,
      a: { ...prev.a, eqGains: engine.getDeckEqGains('a') },
      b: { ...prev.b, eqGains: engine.getDeckEqGains('b') },
    }))
  }, [isExpanded, audioContextReady, waveformMediaSyncKey])

  const resolveDeckTrack = useCallback(
    (deck: 'a' | 'b'): Track | null => trackForQueueDeck(deck),
    [trackForQueueDeck],
  )

  const expandedDeckChannels = useMemo(() => {
    const deckATrack = trackForQueueDeck('a')
    const deckBTrack = trackForQueueDeck('b')

    const build = (
      deck: 'a' | 'b',
      track: Track | null | undefined,
      isLive: boolean,
    ) => {
      const trackCoverSrc = track ? albumCoverUrl(track, queue, coverBust) : undefined
      const trackMosaicCovers = mosaicCoversForTrack(track, playerCoverPool)
      const liveDetectedBpm = isLive ? detectedBPM : null
      const tape = track ? tapeGridByTrackId[track.id] : null
      const catalogBpm = track ? displayTrackBpm(track) : null
      const deckBpm =
        catalogBpm ??
        (isLive ? liveDetectedBpm : deckUi[deck].detectedBpm) ??
        (tape?.bpm ? reconcileTapeBpm(tape.bpm, catalogBpm) : null) ??
        resolveTrackBpm(track)
      const liveTrackForHint = liveDeckId === 'a' ? deckATrack : deckBTrack
      const pairHint =
        !isLive &&
        (isAutoDJEnabled || isIDJEnabled) &&
        track &&
        liveTrackForHint
          ? formatMixPairHintLine(
              buildMixPairHint(
                {
                  bpm:
                    resolvePlaybackBpm(liveTrackForHint, detectedBPM) ??
                    liveTrackForHint.bpm ??
                    null,
                  sonic_dna: liveTrackForHint.sonic_dna,
                  trackKey: displayTrackKey(liveTrackForHint) || null,
                },
                {
                  bpm: resolvePlaybackBpm(track, null) ?? track.bpm ?? null,
                  sonic_dna: track.sonic_dna,
                  trackKey: displayTrackKey(track) || null,
                },
              ),
            )
          : null
      const filters = deckFilterUi[deck]
      const qualityFlashActive =
        mixQualityFlash != null && Date.now() < mixQualityFlash.until
      return {
        deckLabel: deck === 'a' ? ('A' as const) : ('B' as const),
        trackTitle: track?.title,
        trackArtist: track?.artist,
        trackAlbum: track?.album || track?.folder,
        coverSrc: trackCoverSrc,
        coverAlt: track?.album || track?.title || `Deck ${deck === 'a' ? 'A' : 'B'}`,
        coverUnoptimized: trackCoverSrc ? shouldUnoptimizeImage(trackCoverSrc) : true,
        mosaicCovers: trackMosaicCovers,
        catalogBpm,
        trackGenre: track ? displayTrackGenre(track) || null : null,
        trackKey: track ? displayTrackKey(track) || null : null,
        detectedBPM: deckBpm,
        isDetectingBPM: isLive && isDetectingBPM,
        playbackRate: deckUi[deck].playbackRate,
        tapTempoTaps: deckUi[deck].tapTempoTaps,
        tapTempoBPM: deckUi[deck].tapTempoBPM,
        tapTempoSectionsCompleted: deckUi[deck].tapTempoSectionBpms.length,
        eqGains: deckUi[deck].eqGains,
        isLive,
        isArmed: !isLive && incomingDeckHot,
        isMixing: crossfadeActive && mixVisualProgress != null,
        mixRole:
          crossfadeActive && mixVisualProgress != null
            ? isLive
              ? ('outgoing' as const)
              : ('incoming' as const)
            : null,
        mixProgress: crossfadeActive && mixVisualProgress != null ? mixVisualProgress : undefined,
        filterOpenness: filterOpenness(filters.hpfHz, filters.lpfHz),
        pairHint,
        mixQualityGrade:
          qualityFlashActive && isLive ? mixQualityFlash!.grade : null,
      }
    }

    return {
      a: build('a', deckATrack, liveDeckId === 'a'),
      b: build('b', deckBTrack, liveDeckId === 'b'),
    }
  }, [
    liveDeckId,
    currentTrack,
    nextQueueTrack,
    trackForQueueDeck,
    currentQueueIndex,
    queue,
    detectedBPM,
    isDetectingBPM,
    deckUi,
    resolveTrackBpm,
    tapeGridByTrackId,
    incomingDeckHot,
    crossfadeActive,
    mixVisualProgress,
    isAutoDJEnabled,
    isIDJEnabled,
    deckFilterUi,
    mixQualityFlash,
    coverBust,
    playerCoverPool,
  ])

  const handleIdjCrossfade = useCallback((progress: number) => {
    const p = Math.max(0, Math.min(1, progress))
    setIdjCrossfade(p)
    mixEngineRef.current?.setManualCrossfade(p)
  }, [])

  const unlockCrossfaderFromAutoDj = useCallback(() => {
    const progress = Math.max(0, Math.min(1, mixerCrossfadeProgress))
    setAutoDjXfUnlocked(true)
    setIdjCrossfade(progress)
    mixEngineRef.current?.setManualXfOverride(true)
    mixEngineRef.current?.setManualCrossfade(progress, { instant: true })
    setAutoDJStatusMessage('Crossfader unlocked — Auto DJ still on')
  }, [mixerCrossfadeProgress])

  const relockCrossfaderToAutoDj = useCallback(() => {
    setAutoDjXfUnlocked(false)
    if (!crossfadeActive) {
      const xf = liveDeckIdRef.current === 'b' ? 1 : 0
      setIdjCrossfade(xf)
      mixEngineRef.current?.clearManualCrossfade()
    } else {
      // Mid-blend: next fade tick resumes Auto DJ channel gains.
      mixEngineRef.current?.setManualXfOverride(false)
    }
    setAutoDJStatusMessage((msg) =>
      msg.startsWith('Crossfader unlocked') ? '' : msg,
    )
  }, [crossfadeActive])

  useEffect(() => {
    if (isAutoDJEnabled) return
    if (!autoDjXfUnlocked) return
    setAutoDjXfUnlocked(false)
    mixEngineRef.current?.setManualXfOverride(false)
  }, [isAutoDJEnabled, autoDjXfUnlocked])

  useEffect(() => {
    if (!isIDJEnabled || crossfadeActive) return
    if (idjXfSeedRef.current != null) {
      const seeded = idjXfSeedRef.current
      idjXfSeedRef.current = null
      setIdjCrossfade(seeded)
      mixEngineRef.current?.setManualCrossfade(seeded, { instant: true })
      return
    }
    const xf = liveDeckId === 'b' ? 1 : 0
    setIdjCrossfade(xf)
    mixEngineRef.current?.setManualCrossfade(xf)
  }, [isIDJEnabled, liveDeckId, crossfadeActive])

  const toggleIdleDeckPlay = useCallback(async () => {
    const idle = getIdleAudio()
    if (!idle) return
    try {
      await ensureDualDeckGraph()
    } catch {
      /* play without analysis */
    }
    if (idle.paused) {
      try {
        await idle.play()
        setIdleDeckPlaying(true)
      } catch (err) {
        if ((err as { name?: string })?.name !== 'AbortError') {
          console.error('Idle deck play failed:', err)
        }
      }
      return
    }
    idle.pause()
    setIdleDeckPlaying(false)
  }, [getIdleAudio, ensureDualDeckGraph])

  const handleToggleDeckPlay = useCallback(
    (deck: 'a' | 'b') => {
      if (deck === liveDeckIdRef.current) {
        void togglePlay()
        return
      }
      void toggleIdleDeckPlay()
    },
    [toggleIdleDeckPlay, togglePlay],
  )

  const startDeckPlay = useCallback(
    (deck: 'a' | 'b') => {
      if (deck === liveDeckIdRef.current) {
        const live = getPlaybackAudio()
        if (live && !live.paused) return
        void togglePlay()
        return
      }
      const idle = getIdleAudio()
      if (idle && !idle.paused) return
      void toggleIdleDeckPlay()
    },
    [getPlaybackAudio, getIdleAudio, toggleIdleDeckPlay, togglePlay],
  )

  const pauseDeckPlay = useCallback(
    (deck: 'a' | 'b') => {
      if (deck === liveDeckIdRef.current) {
        const live = getPlaybackAudio()
        if (live && !live.paused) {
          try {
            live.pause()
          } catch {
            /* ignore */
          }
        }
        setIsPlaying(false)
        return
      }
      const idle = getIdleAudio()
      if (idle && !idle.paused) {
        try {
          idle.pause()
        } catch {
          /* ignore */
        }
      }
      setIdleDeckPlaying(false)
    },
    [getPlaybackAudio, getIdleAudio],
  )

  const memoryCueStartSec = useCallback((trackId: string | undefined | null): number => {
    if (!trackId || !idjConfigRef.current.startOnCue) return 0
    const cue = idjMemoryCuesRef.current[trackId]
    return typeof cue === 'number' && Number.isFinite(cue) && cue >= 0 ? cue : 0
  }, [])

  const writeDeckMemoryCue = useCallback(
    (deck: 'a' | 'b', timeSec: number) => {
      const track = trackForQueueDeck(deck)
      if (!track?.id) return
      const bpm =
        resolvePlaybackBpm(track, deck === liveDeckId ? detectedBPM : null) ??
        track.bpm ??
        120
      const visibleBars =
        deck === liveDeckIdRef.current ? waveformVisibleBars : incomingVisibleBars
      const snapped = idjConfig.snapToGrid
        ? quantizePointerToVisibleGrid({
            timeSec,
            bpm,
            offsetSec: resolveTrackBeatGridOffset(track),
            visibleBars,
            beatsPerBar: 4,
            durationSec: track.duration,
            sonicDna: track.sonic_dna,
          })
        : timeSec
      const next = writeIDJMemoryCue(track.id, snapped)
      idjMemoryCuesRef.current = next
      setIdjMemoryCues(next)
      persistDeckActiveCue(deck, track.id, { kind: 'memory' })
    },
    [
      trackForQueueDeck,
      liveDeckId,
      detectedBPM,
      resolveTrackBeatGridOffset,
      waveformVisibleBars,
      incomingVisibleBars,
      idjConfig.snapToGrid,
      persistDeckActiveCue,
    ],
  )

  const handleSelectDeckActiveCue = useCallback(
    (deck: 'a' | 'b', cue: IDJActiveCue) => {
      persistDeckActiveCue(deck, trackForQueueDeck(deck)?.id, cue)
    },
    [persistDeckActiveCue, trackForQueueDeck],
  )

  const handleSetDeckCue = useCallback(
    (deck: 'a' | 'b') => {
      writeDeckMemoryCue(deck, readDeckMediaTime(deck))
    },
    [writeDeckMemoryCue, readDeckMediaTime],
  )

  const handleClearDeckCue = useCallback(
    (deck: 'a' | 'b') => {
      const track = trackForQueueDeck(deck)
      if (!track?.id) return
      const next = clearIDJMemoryCue(track.id)
      idjMemoryCuesRef.current = next
      setIdjMemoryCues(next)
      clearDeckActiveCueIf(deck, track.id, { kind: 'memory' })
    },
    [trackForQueueDeck, clearDeckActiveCueIf],
  )

  const handleLaunchDeckCue = useCallback(
    (deck: 'a' | 'b') => {
      const track = trackForQueueDeck(deck)
      if (!track?.id) return
      const resolved = resolveIDJActiveCue({
        active: idjActiveCuesRef.current[deck]?.[track.id],
        memorySec: idjMemoryCues[track.id],
        hotSlots: readHotCueSlots(track.id),
        trackCues: listDeckJumpCues({
          sonicDna: track.sonic_dna,
          beatGridOffsetSec: resolveTrackBeatGridOffset(track),
        }),
      })
      // Auto DJ: missing cue = track start. iDJ: CUE only jumps when a cue exists.
      if (!resolved && !isAutoDJEnabled) return
      const cue = resolved?.timeSec ?? 0
      seekDeckMediaTime(deck, cue)
      if (deck === liveDeckIdRef.current) snapPlaybackTime(cue)
      if (idjConfigRef.current.cueJumpPlay) startDeckPlay(deck)
      else pauseDeckPlay(deck)
    },
    [
      trackForQueueDeck,
      idjMemoryCues,
      resolveTrackBeatGridOffset,
      isAutoDJEnabled,
      seekDeckMediaTime,
      snapPlaybackTime,
      startDeckPlay,
      pauseDeckPlay,
    ],
  )

  const deckHotCues = useMemo(
    () => ({
      a: readHotCueSlots(trackForQueueDeck('a')?.id),
      b: readHotCueSlots(trackForQueueDeck('b')?.id),
    }),
    [trackForQueueDeck, hotCueRevision, currentTrack?.id, idjIdleTrackId, nextQueueTrack?.id],
  )

  const deckMemoryCueSec = useMemo(() => {
    const aId = trackForQueueDeck('a')?.id
    const bId = trackForQueueDeck('b')?.id
    return {
      a: aId != null && typeof idjMemoryCues[aId] === 'number' ? idjMemoryCues[aId] : null,
      b: bId != null && typeof idjMemoryCues[bId] === 'number' ? idjMemoryCues[bId] : null,
    }
  }, [trackForQueueDeck, idjMemoryCues, idjIdleTrackId, nextQueueTrack?.id, currentTrack?.id])

  const deckTrackCues = useMemo(() => {
    const forDeck = (deck: 'a' | 'b') => {
      const track = trackForQueueDeck(deck)
      if (!track) return []
      return listDeckJumpCues({
        sonicDna: track.sonic_dna,
        beatGridOffsetSec: resolveTrackBeatGridOffset(track),
      })
    }
    return { a: forDeck('a'), b: forDeck('b') }
  }, [trackForQueueDeck, resolveTrackBeatGridOffset, idjIdleTrackId, nextQueueTrack?.id, currentTrack?.id])

  const jumpDeckToTime = useCallback(
    (deck: 'a' | 'b', timeSec: number) => {
      seekDeckMediaTime(deck, timeSec)
      if (deck === liveDeckIdRef.current) snapPlaybackTime(timeSec)
      if (idjConfigRef.current.cueJumpPlay) startDeckPlay(deck)
      else pauseDeckPlay(deck)
    },
    [seekDeckMediaTime, snapPlaybackTime, startDeckPlay, pauseDeckPlay],
  )

  const handleLaunchDeckHotCue = useCallback(
    (deck: 'a' | 'b', slot: HotCueSlot) => {
      const timeSec = deckHotCues[deck][slot]
      if (typeof timeSec !== 'number') return
      jumpDeckToTime(deck, timeSec)
    },
    [deckHotCues, jumpDeckToTime],
  )

  const handleSetDeckHotCue = useCallback(
    (deck: 'a' | 'b', slot: HotCueSlot) => {
      const track = trackForQueueDeck(deck)
      if (!track?.id) return
      const timeSec = readDeckMediaTime(deck)
      const bpm =
        resolvePlaybackBpm(track, deck === liveDeckId ? detectedBPM : null) ??
        track.bpm ??
        120
      const visibleBars =
        deck === liveDeckIdRef.current ? waveformVisibleBars : incomingVisibleBars
      const snapped = idjConfig.snapToGrid
        ? quantizePointerToVisibleGrid({
            timeSec,
            bpm,
            offsetSec: resolveTrackBeatGridOffset(track),
            visibleBars,
            beatsPerBar: 4,
            durationSec: track.duration,
            sonicDna: track.sonic_dna,
          })
        : timeSec
      const next = writeHotCueSlot(track.id, slot, snapped)
      if (track.id === currentTrack?.id) syncWaveformHotCuesFromSlots(track.id, next)
      setHotCueRevision((n) => n + 1)
    },
    [
      trackForQueueDeck,
      readDeckMediaTime,
      liveDeckId,
      detectedBPM,
      resolveTrackBeatGridOffset,
      waveformVisibleBars,
      incomingVisibleBars,
      idjConfig.snapToGrid,
      currentTrack?.id,
      syncWaveformHotCuesFromSlots,
    ],
  )

  const handleClearDeckHotCue = useCallback(
    (deck: 'a' | 'b', slot: HotCueSlot) => {
      const track = trackForQueueDeck(deck)
      if (!track?.id) return
      const next = clearHotCueSlot(track.id, slot)
      if (track.id === currentTrack?.id) syncWaveformHotCuesFromSlots(track.id, next)
      setHotCueRevision((n) => n + 1)
      clearDeckActiveCueIf(deck, track.id, { kind: 'hot', slot })
    },
    [trackForQueueDeck, currentTrack?.id, syncWaveformHotCuesFromSlots, clearDeckActiveCueIf],
  )

  const handleClearAllDeckHotCues = useCallback(
    (deck: 'a' | 'b') => {
      const track = trackForQueueDeck(deck)
      if (!track?.id) return
      const next = clearAllHotCueSlots(track.id)
      if (track.id === currentTrack?.id) syncWaveformHotCuesFromSlots(track.id, next)
      setHotCueRevision((n) => n + 1)
      const active = idjActiveCuesRef.current[deck]?.[track.id]
      if (active?.kind === 'hot') {
        const cleared = writeIDJActiveCue(deck, track.id, null)
        idjActiveCuesRef.current = cleared
        setIdjActiveCues(cleared)
      }
    },
    [trackForQueueDeck, currentTrack?.id, syncWaveformHotCuesFromSlots],
  )

  const handleJumpDeckTrackCue = useCallback(
    (deck: 'a' | 'b', timeSec: number) => {
      if (!Number.isFinite(timeSec) || timeSec < 0) return
      jumpDeckToTime(deck, timeSec)
    },
    [jumpDeckToTime],
  )

  const syncDeckWaveformCache = useCallback((deck: 'a' | 'b', pack: DeckWaveformPack) => {
    setDeckWaveformCache((prev) => {
      if (prev[deck]?.trackId === pack.trackId) return prev
      return { ...prev, [deck]: pack }
    })
  }, [])

  const syncIdleDeckWaveformCache = useCallback(
    (trackId: string, samples: WaveformSample[], durationSec: number) => {
      const idleDeck: 'a' | 'b' = liveDeckId === 'a' ? 'b' : 'a'
      syncDeckWaveformCache(idleDeck, { trackId, samples, durationSec })
    },
    [liveDeckId, syncDeckWaveformCache],
  )

  const loadTrackOntoIdleDeck = useCallback(
    async (track: Track, opts?: { play?: boolean; gen?: number }) => {
      const gen = opts?.gen ?? idleLoadGenRef.current
      const stale = () => idleLoadGenRef.current !== gen
      const idle = getIdleAudio()
      if (!idle || stale()) return
      const keepPlaying = Boolean(opts?.play)
      let url =
        peekSyncPlaybackUrl(track.file, resolvedUrlCacheRef.current) ||
        resolvedUrlCacheRef.current.get(track.file) ||
        null
      if (!url) {
        url = await resolveAudioUrl(track.file)
        if (url) resolvedUrlCacheRef.current.set(track.file, url)
      }
      if (!url || stale()) return

      const sameSrc = mediaUrlsRoughlyEqual(idle.currentSrc || idle.src, url)
      if (!sameSrc) {
        disarmIdjEnded('idle')
        try {
          idle.pause()
        } catch {
          /* ignore */
        }
        idle.src = url
        idle.preload = 'auto'
        try {
          idle.volume = 0
        } catch {
          /* ignore */
        }
      }
      setCuedIdleTrackId(track.id)

      const startSec = isIDJEnabledRef.current
        ? memoryCueStartSec(track.id)
        : resolveIncomingMixCueSec(track)
      const applyIdleStart = () => {
        try {
          idle.currentTime = startSec
        } catch {
          /* ignore */
        }
      }
      applyIdleStart()
      if (startSec > 0) {
        idle.addEventListener('loadedmetadata', applyIdleStart, { once: true })
        idle.addEventListener('canplay', applyIdleStart, { once: true })
      }

      // Auto DJ only: loadIdle parks at memory cue (or track start). iDJ keeps the HTML src.
      const engine = mixEngineRef.current
      if (!isIDJEnabledRef.current && engine && !engine.isMixing()) {
        try {
          await engine.loadIdle(withMixGrid(track), url, resolveIncomingMixCueSec(track), 1)
        } catch {
          /* HTML audio src is enough */
        }
      }
      if (stale()) return

      void loadWaveformSamplesForTrack(track, url, { allowFullDecode: true }).then((packed) => {
        if (!packed || stale() || idjIdleTrackIdRef.current !== track.id) return
        syncIdleDeckWaveformCache(
          track.id,
          packed.samples,
          packed.durationSec || track.duration || 180,
        )
      })

      if (keepPlaying) {
        const playWhenReady = async () => {
          if (stale()) return
          try {
            await idle.play()
            if (stale()) return
            setIdleDeckPlaying(true)
          } catch (err) {
            if ((err as { name?: string })?.name !== 'AbortError') {
              console.error('Idle deck play failed:', err)
            }
          }
        }
        if (!sameSrc && idle.readyState < 2) {
          const onReady = () => {
            idle.removeEventListener('canplay', onReady)
            void playWhenReady()
          }
          idle.addEventListener('canplay', onReady)
          window.setTimeout(() => {
            if (stale()) return
            idle.removeEventListener('canplay', onReady)
            void playWhenReady()
          }, 2500)
        } else {
          await playWhenReady()
        }
      }
    },
    [
      getIdleAudio,
      setCuedIdleTrackId,
      withMixGrid,
      resolveIncomingMixCueSec,
      syncIdleDeckWaveformCache,
      memoryCueStartSec,
    ],
  )

  const pinIdleIfNeeded = useCallback((): string | null => {
    if (idjIdleTrackIdRef.current) return idjIdleTrackIdRef.current
    const q = queueRef.current
    const liveId = idjLiveTrackIdRef.current ?? autoDJCurrentTrackRef.current?.id ?? null
    const liveIdx = liveId ? q.findIndex((item) => item.id === liveId) : -1
    const sequential =
      (liveIdx >= 0 ? q.slice(liveIdx + 1).find((item) => item.id !== liveId) : null) ??
      q.find((item) => item.id && item.id !== liveId) ??
      null
    if (!sequential?.id) return null
    idjIdleTrackIdRef.current = sequential.id
    setIdjIdleTrackId(sequential.id)
    setCueDeckTrackOverride(sequential)
    return sequential.id
  }, [])

  const applyIDJLiveTrack = useCallback(
    async (track: Track, opts?: { play?: boolean }) => {
      const gen = ++liveLoadGenRef.current
      const live = getPlaybackAudio()
      if (!live) return
      // Drop sticky session/scrub seeks — they re-fire on every canplay and
      // thrash waiting↔canplay after a same-deck load (player feels dead).
      clearSeekTarget()
      const keepPlaying = opts?.play ?? ((!live.paused && !live.ended) || isPlayingRef.current)
      let url = peekSyncPlaybackUrl(track.file, resolvedUrlCacheRef.current)
      if (!url) {
        url = await resolveAudioUrl(track.file)
        if (url) resolvedUrlCacheRef.current.set(track.file, url)
      }
      if (!url || liveLoadGenRef.current !== gen) return

      idjDeckSkipLockRef.current = true
      skipSrcReloadRef.current = true
      srcSwapRef.current = true
      endedTrackIdRef.current = null
      lastBoundPlaybackRef.current = { id: track.id, url }
      disarmIdjEnded('live')

      // Pause only the element for a clean resource swap. Keep React isPlaying
      // true so canplay / the play effect resume without a second user gesture.
      try {
        live.pause()
      } catch {
        /* ignore */
      }

      const srcChanged = assignMediaSrcIfChanged(live, url)
      const startSec = memoryCueStartSec(track.id)

      const engine = mixEngineRef.current
      if (engine && !engine.isMixing()) {
        try {
          engine.setActiveTrack(withMixGrid(track))
        } catch {
          /* ignore */
        }
      }

      const idx = queueRef.current.findIndex((item) => item.id === track.id)
      idjLiveTrackIdRef.current = track.id
      setResolvedUrl((prev) => (prev === url ? prev : url))
      setCurrentTrack(track)
      setCurrentIndex(idx >= 0 ? idx : 0)
      snapPlaybackTime(startSec)
      // Do not seekTo() here — the global seek effect re-applies on every
      // canplay and restarts the buffer. Cue parking happens in startAfterReady.
      setWaveformMediaSyncKey(`${playbackDeckRef.current}:${track.id}`)
      if (keepPlaying) setIsPlaying(true)

      const releaseLiveLoadLocks = () => {
        if (liveLoadGenRef.current !== gen) return
        idjDeckSkipLockRef.current = false
        skipSrcReloadRef.current = false
        srcSwapRef.current = false
        idjIgnoreBufferUiUntilRef.current = Math.max(
          idjIgnoreBufferUiUntilRef.current,
          Date.now() + 700,
        )
      }

      const startAfterReady = async () => {
        if (liveLoadGenRef.current !== gen) return
        try {
          live.currentTime = startSec
        } catch {
          /* ignore */
        }
        snapPlaybackTime(startSec)
        if (keepPlaying || isPlayingRef.current) {
          try {
            await live.play()
          } catch (err) {
            if ((err as { name?: string })?.name !== 'AbortError') {
              console.error('Live deck skip play failed:', err)
            }
          }
        }
        if (liveLoadGenRef.current !== gen) return
        releaseLiveLoadLocks()
        armIdjEnded('live')
      }

      if (!srcChanged && live.readyState >= 2) {
        await startAfterReady()
        return
      }

      let settled = false
      const onReady = () => {
        if (settled || liveLoadGenRef.current !== gen) return
        settled = true
        live.removeEventListener('canplay', onReady)
        live.removeEventListener('loadedmetadata', onReady)
        void startAfterReady()
      }
      live.addEventListener('canplay', onReady)
      live.addEventListener('loadedmetadata', onReady)
      // Safety net if canplay never fires (offline / decode stall).
      window.setTimeout(() => {
        if (settled || liveLoadGenRef.current !== gen) return
        settled = true
        live.removeEventListener('canplay', onReady)
        live.removeEventListener('loadedmetadata', onReady)
        void startAfterReady()
      }, 2500)
    },
    [
      getPlaybackAudio,
      snapPlaybackTime,
      setCurrentTrack,
      setCurrentIndex,
      withMixGrid,
      memoryCueStartSec,
      clearSeekTarget,
    ],
  )

  const stepIdleDeck = useCallback(
    (direction: 1 | -1, opts?: { play?: boolean }) => {
      const q = queueRef.current
      const currentIdleId = pinIdleIfNeeded()
      const next = nextQueueNeighbor(q, currentIdleId, null, direction)
      if (!next) return
      const gen = ++idleLoadGenRef.current
      idjIdleTrackIdRef.current = next.id
      setIdjIdleTrackId(next.id)
      setCueDeckTrackOverride(next)
      void loadTrackOntoIdleDeck(next, {
        play: opts?.play ?? idleDeckPlayingRef.current,
        gen,
      })
    },
    [loadTrackOntoIdleDeck, pinIdleIfNeeded],
  )

  const stepLiveDeck = useCallback(
    (direction: 1 | -1, opts?: { play?: boolean }) => {
      if (mixEngineRef.current?.isMixing() || phraseMixLockRef.current) return
      const q = queueRef.current
      const liveId = idjLiveTrackIdRef.current ?? autoDJCurrentTrackRef.current?.id ?? null
      // Freeze the idle pick so the other deck does not follow the new live track.
      pinIdleIfNeeded()
      const next = nextQueueNeighbor(q, liveId, null, direction)
      if (!next) return
      idjLiveTrackIdRef.current = next.id
      void applyIDJLiveTrack(next, opts)
    },
    [applyIDJLiveTrack, pinIdleIfNeeded],
  )
  stepLiveDeckRef.current = stepLiveDeck

  idjOnDeckEndedRef.current = (deck) => {
    if (!isIDJEnabledRef.current) return false
    if (!idjEndedArmedRef.current[deck]) return false
    const endedDeckId = deck === 'live'
      ? liveDeckIdRef.current
      : liveDeckIdRef.current === 'a'
        ? 'b'
        : 'a'
    if (idjConfigRef.current.continuousPlay[endedDeckId]) {
      if (deck === 'live') stepLiveDeck(1, { play: true })
      else stepIdleDeck(1, { play: true })
      return true
    }
    if (deck === 'live') setIsPlaying(false)
    else setIdleDeckPlaying(false)
    return true
  }

  useEffect(() => {
    type IDJSnapshot = {
      liveId: string | null
      idleId: string | null
      liveTime: number | null
      liveDuration: number | null
      liveEnded: boolean
      livePaused: boolean
      liveReadyState: number
      armed: { live: boolean; idle: boolean }
      skipLocked: boolean
      srcSwap: boolean
      loadStarts: number
      waitings: number
      canplays: number
      endeds: number
    }
    type E2EApi = {
      idjSnapshot?: () => IDJSnapshot
      fireMediaEnded?: (deck: 'live' | 'idle') => void
      seekLiveNearEnd?: () => boolean
      resetIdjMediaCounters?: () => void
    }
    const counters = { loadStarts: 0, waitings: 0, canplays: 0, endeds: 0 }
    const w = window as Window & { __SERGIK_E2E__?: E2EApi }
    const onLoadStart = () => {
      counters.loadStarts += 1
    }
    const onWaiting = () => {
      counters.waitings += 1
    }
    const onCanPlay = () => {
      counters.canplays += 1
    }
    const onEnded = () => {
      counters.endeds += 1
    }
    const els = [audioRef.current, nextAudioRef.current].filter(
      (el): el is HTMLAudioElement => Boolean(el),
    )
    for (const el of els) {
      el.addEventListener('loadstart', onLoadStart)
      el.addEventListener('waiting', onWaiting)
      el.addEventListener('canplay', onCanPlay)
      el.addEventListener('ended', onEnded)
    }
    let pollId: number | null = null
    const attach = () => {
      const api = w.__SERGIK_E2E__
      if (!api) return false
      api.resetIdjMediaCounters = () => {
        counters.loadStarts = 0
        counters.waitings = 0
        counters.canplays = 0
        counters.endeds = 0
      }
      api.idjSnapshot = () => {
        const live = getPlaybackAudio()
        return {
          liveId: idjLiveTrackIdRef.current,
          idleId: idjIdleTrackIdRef.current,
          liveTime: live && Number.isFinite(live.currentTime) ? live.currentTime : null,
          liveDuration: live && Number.isFinite(live.duration) ? live.duration : null,
          liveEnded: Boolean(live?.ended),
          livePaused: Boolean(live?.paused),
          liveReadyState: live?.readyState ?? 0,
          armed: { ...idjEndedArmedRef.current },
          skipLocked: idjDeckSkipLockRef.current,
          srcSwap: srcSwapRef.current,
          loadStarts: counters.loadStarts,
          waitings: counters.waitings,
          canplays: counters.canplays,
          endeds: counters.endeds,
        }
      }
      api.fireMediaEnded = (deck) => {
        const el = deck === 'live' ? getPlaybackAudio() : getIdleAudio()
        el?.dispatchEvent(new Event('ended'))
      }
      api.seekLiveNearEnd = () => {
        const el = getPlaybackAudio()
        if (!el || !Number.isFinite(el.duration) || el.duration < 0.5) return false
        try {
          el.currentTime = Math.max(0, el.duration - 0.05)
        } catch {
          return false
        }
        return true
      }
      return true
    }
    if (!attach()) {
      pollId = window.setInterval(() => {
        if (attach() && pollId != null) {
          window.clearInterval(pollId)
          pollId = null
        }
      }, 50)
    }
    return () => {
      if (pollId != null) window.clearInterval(pollId)
      for (const el of els) {
        el.removeEventListener('loadstart', onLoadStart)
        el.removeEventListener('waiting', onWaiting)
        el.removeEventListener('canplay', onCanPlay)
        el.removeEventListener('ended', onEnded)
      }
      const api = w.__SERGIK_E2E__
      if (!api) return
      delete api.idjSnapshot
      delete api.fireMediaEnded
      delete api.seekLiveNearEnd
      delete api.resetIdjMediaCounters
    }
  }, [getPlaybackAudio, getIdleAudio])

  const handleDeckPrevious = useCallback(
    (deck: 'a' | 'b') => {
      const now = Date.now()
      if (now - lastDeckSkipAtRef.current[deck] < 180) return
      lastDeckSkipAtRef.current[deck] = now
      if (deck === liveDeckIdRef.current) {
        stepLiveDeck(-1)
        return
      }
      stepIdleDeck(-1)
    },
    [stepIdleDeck, stepLiveDeck],
  )

  const handleDeckNext = useCallback(
    (deck: 'a' | 'b') => {
      const now = Date.now()
      if (now - lastDeckSkipAtRef.current[deck] < 180) return
      lastDeckSkipAtRef.current[deck] = now
      if (deck === liveDeckIdRef.current) {
        stepLiveDeck(1)
        return
      }
      stepIdleDeck(1)
    },
    [stepIdleDeck, stepLiveDeck],
  )

  /** Load the queue track after `liveTrack` onto the idle deck for the next mix. */
  const precueIdleForQueueSuccessor = useCallback(
    async (liveTrack: Track, trackQueue: Track[]) => {
      if (!autoDJConfigRef.current.enabled) return
      const liveIdx = trackQueue.findIndex((t) => t.id === liveTrack.id)
      const successor = liveIdx >= 0 ? trackQueue[liveIdx + 1] : null
      if (!successor || cuedIdleTrackIdRef.current === successor.id) return

      await ensureDualDeckGraph()
      const engine = ensureMixEngine()
      if (!engine || engine.isMixing()) return

      let url = resolvedUrlCacheRef.current.get(successor.file) || null
      if (!url) {
        url = await resolveAudioUrl(successor.file)
        if (url) resolvedUrlCacheRef.current.set(successor.file, url)
      }
      if (!url) return

      void loadWaveformSamplesForTrack(successor, url, { allowFullDecode: true }).then((packed) => {
        if (!packed) return
        cacheMixGridOffset(
          successor,
          packed.samples,
          packed.durationSec || successor.duration || 180,
        )
        ghostSamplesRef.current = {
          trackId: successor.id,
          samples: packed.samples,
          durationSec: packed.durationSec || successor.duration || 180,
          sonicDna: successor.sonic_dna,
        }
        syncIdleDeckWaveformCache(
          successor.id,
          packed.samples,
          packed.durationSec || successor.duration || 180,
        )
      })

      const outBpm =
        resolvePlaybackBpm(liveTrack, detectedBPMRef.current) ??
        liveTrack.bpm ??
        detectedBPMRef.current ??
        120
      const inBpm = resolvePlaybackBpm(successor, null) ?? successor.bpm ?? outBpm
      const mixDeckRates = computeMixDeckRates({
        outgoingBpm: outBpm,
        incomingBpm: inBpm,
        outgoingPlaybackRate: getOutgoingPlaybackRate(),
        incomingTargetRate:
          autoDJConfigRef.current.bpmStrategy === 'manual'
            ? settingsRef.current.playbackRate
            : 1,
      })
      const cueSec = resolveIncomingMixCueSec(successor)

      try {
        await engine.loadIdle(withMixGrid(successor), url, cueSec, mixDeckRates.incomingRate)
        setCuedIdleTrackId(successor.id)
        setAutoDJStatusMessage(`Pre-cued “${successor.title}” for next mix`)
      } catch (err) {
        console.debug('Post-handoff idle precue failed:', err)
      }
    },
    [
      ensureDualDeckGraph,
      ensureMixEngine,
      resolveIncomingMixCueSec,
      cacheMixGridOffset,
      syncIdleDeckWaveformCache,
      getOutgoingPlaybackRate,
    ],
  )
  precueIdleForQueueSuccessorRef.current = precueIdleForQueueSuccessor

  // Prefetch idle-deck waveforms — idle deck always mirrors queue up-next.
  useEffect(() => {
    if (isMiniMode || (expandedMode as string) === 'dj') return

    const idleTargets: { deck: 'a' | 'b'; track: Track | null | undefined }[] = [
      {
        deck: 'a',
        track: liveDeckId === 'a' ? null : trackForQueueDeck('a'),
      },
      {
        deck: 'b',
        track: liveDeckId === 'b' ? null : trackForQueueDeck('b'),
      },
    ]

    let cancelled = false
    for (const { deck, track } of idleTargets) {
      if (!track?.id) continue
      if (deckWaveformCache[deck]?.trackId === track.id) continue

      const ghost = ghostSamplesRef.current
      if (ghost?.trackId === track.id && ghost.samples.length > 0) {
        cacheMixGridOffset(
          track,
          ghost.samples,
          ghost.durationSec || track.duration || 180,
        )
        syncDeckWaveformCache(deck, {
          trackId: track.id,
          samples: ghost.samples,
          durationSec: ghost.durationSec || track.duration || 180,
        })
        continue
      }

      void (async () => {
        try {
          let url = resolvedUrlCacheRef.current.get(track.file) || null
          if (!url) url = await resolveAudioUrl(track.file)
          if (!url || cancelled) return
          resolvedUrlCacheRef.current.set(track.file, url)
          const packed = await loadWaveformSamplesForTrack(track, url, { allowFullDecode: true })
          if (cancelled || !packed.samples.length) return
          cacheMixGridOffset(
            track,
            packed.samples,
            packed.durationSec || track.duration || 180,
          )
          syncDeckWaveformCache(deck, {
            trackId: track.id,
            samples: packed.samples,
            durationSec: packed.durationSec || track.duration || 180,
          })
        } catch {
          /* ignore */
        }
      })()
    }

    return () => {
      cancelled = true
    }
  }, [
    isMiniMode,
    expandedMode,
    liveDeckId,
    trackForQueueDeck,
    currentQueueIndex,
    queue,
    deckWaveformCache,
    syncDeckWaveformCache,
    cacheMixGridOffset,
  ])

  // Mini/expand chrome must not collapse a docked vault queue panel.
  useEffect(() => {
    if (!isQueueOpen) {
      setIsQueueExpanded(false)
      setIsTrackListExpanded(false)
      return
    }
    if (isQueueDocked || !isMiniMode || isExpanded) {
      setIsTrackListExpanded(true)
    }
  }, [isQueueOpen, isMiniMode, isExpanded, isQueueDocked])

  // Load the selected folder / playlist / catalog for queue preview and random picks.
  useEffect(() => {
    if (!getTracksFromSource) return
    const needPool = isQueueOpen || settings.catalogRandom || autoDJConfig.enabled
    if (!needPool) {
      setAllSourceTracks([])
      return
    }
    let cancelled = false
    setIsLoadingSourceTracks(isQueueOpen)
    getTracksFromSource(currentSource ?? null)
      .then((tracks) => {
        if (cancelled) return
        setAllSourceTracks(tracks)
        setIsLoadingSourceTracks(false)
      })
      .catch((error) => {
        console.error('Error fetching source tracks:', error)
        if (!cancelled) {
          setAllSourceTracks([])
          setIsLoadingSourceTracks(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [
    isQueueOpen,
    currentSource,
    getTracksFromSource,
    settings.catalogRandom,
    autoDJConfig.enabled,
  ])

  useEffect(() => {
    if (!autoDJConfig.enabled || autoDJLibrary.length > 0 || !getTracksFromSource) return
    let cancelled = false
    getTracksFromSource(null)
      .then((tracks) => {
        if (!cancelled && tracks.length > 0) {
          setAutoDJLibrary(tracks)
        }
      })
      .catch((error) => {
        console.error('Failed to load Auto DJ library:', error)
      })
    return () => {
      cancelled = true
    }
  }, [autoDJConfig.enabled, autoDJLibrary.length, getTracksFromSource])

  const phraseDuration = useMemo(() => {
    const bpm =
      resolvePlaybackBpm(currentTrack, detectedBPM) ||
      detectedBPM ||
      currentTrack?.bpm ||
      120
    const beatDuration = bpm > 0 ? 60 / bpm : 0.5
    // Always honor the Auto DJ phrase-length control (beat-grid aligned).
    return beatDuration * 4 * autoDJConfig.overlapBars
  }, [autoDJConfig.overlapBars, detectedBPM, currentTrack])

  const autoDJPool = useMemo(() => {
    if (autoDJLibrary.length > 0) return autoDJLibrary
    if (allSourceTracks.length > 0) return allSourceTracks
    return queue
  }, [autoDJLibrary, allSourceTracks, queue])

  const catalogPool = useMemo(() => {
    if (allSourceTracks.length > 0) return allSourceTracks
    return queue
  }, [allSourceTracks, queue])

  const handleCueDeckLibraryDrop = useCallback(
    (
      trackIds: string[],
      payloadTracks: Array<{ id: string; [key: string]: unknown }>,
    ) => {
      if (!trackIds.length) return
      const byId = new Map<string, Track>()
      for (const t of payloadTracks) {
        if (t?.id) byId.set(String(t.id), t as Track)
      }
      for (const t of autoDJPool) byId.set(t.id, t)
      for (const t of queue) byId.set(t.id, t)
      const incoming = trackIds
        .map((id) => byId.get(id))
        .filter((t): t is Track => Boolean(t?.id))
      if (!incoming.length) {
        setAutoDJStatusMessage('Could not cue dropped track — missing library data')
        return
      }

      const primary = incoming[0]!
      if (!currentTrack) {
        playTrack(primary, incoming)
        setAutoDJStatusMessage(
          incoming.length === 1
            ? `Playing “${primary.title}”`
            : `Playing · ${incoming.length} tracks from library`,
        )
        return
      }

      playNext(incoming)
      const gen = ++idleLoadGenRef.current
      idjIdleTrackIdRef.current = primary.id
      setIdjIdleTrackId(primary.id)
      setCueDeckTrackOverride(primary)
      void ensureDualDeckGraph().then(() => {
        void loadTrackOntoIdleDeck(primary, { play: false, gen })
      })
      setAutoDJStatusMessage(
        incoming.length === 1
          ? `Cued “${primary.title}” on idle deck`
          : `Cued “${primary.title}” · ${incoming.length - 1} more up next`,
      )
    },
    [
      autoDJPool,
      queue,
      currentTrack,
      playTrack,
      playNext,
      ensureDualDeckGraph,
      loadTrackOntoIdleDeck,
    ],
  )

  useEffect(() => {
    catalogRandomFillKeyRef.current = ''
  }, [currentSource?.type, currentSource?.id])

  useEffect(() => {
    if (currentTrack?.id) rememberPlayedTrackId(currentTrack.id)
  }, [currentTrack?.id])

  const catalogRandomLookahead = Math.max(1, Math.min(autoDJConfig.lookahead || 4, 8))

  useEffect(() => {
    if (autoDJConfig.enabled || !settings.catalogRandom || !onQueueChange) return
    if (!currentTrack || catalogPool.length === 0) return
    const idx =
      currentQueueIndex >= 0
        ? currentQueueIndex
        : queue.findIndex((track) => track.id === currentTrack.id)
    const upcoming = idx >= 0 ? queue.length - 1 - idx : 0
    if (upcoming >= catalogRandomLookahead) return
    const fillKey = `${currentTrack.id}:${idx}:${queue.length}`
    if (catalogRandomFillKeyRef.current === fillKey) return
    const needed = catalogRandomLookahead - Math.max(0, upcoming)
    const exclude = new Set(queue.map((track) => track.id))

    if (isOrderedReleaseRandomScope(currentSource)) {
      const picked = pickNextOrderedTracks(catalogPool, exclude, needed, {
        preferAfterId: currentTrack.id,
      })
      if (picked.length === 0) return
      catalogRandomFillKeyRef.current = fillKey
      onQueueChange([...queue, ...picked])
      setAutoDJStatusMessage(
        `Playing ${catalogScopeLabel(currentSource)} in order · queued “${picked[0]!.title}”`,
      )
      return
    }

    const picked = pickRandomUnusedTracks(catalogPool, exclude, needed, {
      allowReshuffle: true,
      keepExcluded: [currentTrack.id],
      recentIds: getRecentPlayedTrackIds(),
    })
    if (picked.length === 0) return
    catalogRandomFillKeyRef.current = fillKey
    onQueueChange([...queue, ...picked])
    setAutoDJStatusMessage(
      `Random from ${catalogScopeLabel(currentSource)} · queued “${picked[0]!.title}”`,
    )
  }, [
    autoDJConfig.enabled,
    settings.catalogRandom,
    onQueueChange,
    currentTrack,
    catalogPool,
    queue,
    currentQueueIndex,
    catalogRandomLookahead,
    currentSource,
  ])

  const pickAutoDJTrack = useCallback((): Track | null => {
    if (!currentTrack || autoDJPool.length === 0) return null
    const upcomingIds = new Set(
      (currentQueueIndex >= 0 ? queue.slice(currentQueueIndex) : queue).map((t) => t.id),
    )
    for (const id of getRecentPlayedTrackIds()) upcomingIds.add(id)
    upcomingIds.add(currentTrack.id)
    const last = mixQualityHistory[0]
    const consecutiveWeak = autoDJConfig.autoCorrectWeakMixes
      ? consecutiveWeakMixCount(mixQualityHistory)
      : 0
    const trusted = pickTrustedAutoDjTrack({
      outgoing: currentTrack,
      candidates: autoDJPool as Track[],
      syncMode: autoDJConfig.syncMode,
      lastGrade: last?.grade,
      lastIncomingId: last?.incomingTrackId ?? null,
      consecutiveWeak,
      excludeIds: upcomingIds,
      randomizeTop: 2,
    })
    if (trusted?.track) {
      setAutoDjPickStall(null)
      return trusted.track as Track
    }

    // BeatSync on a 4/4 outgoing: do not DNA-fallback into trap / breaks / one-drop.
    if (
      shouldBlockDnaFallback({
        syncMode: autoDJConfig.syncMode,
        fourOnFloorOutgoing: isFourOnFloorPocket(currentTrack.sonic_dna),
      })
    ) {
      const stall = diagnoseAutoDjPickStall({
        outgoing: currentTrack,
        candidates: autoDJPool as Track[],
        syncMode: autoDJConfig.syncMode,
        lastGrade: last?.grade,
        lastIncomingId: last?.incomingTrackId ?? null,
        consecutiveWeak,
        excludeIds: upcomingIds,
      })
      setAutoDjPickStall(stall)
      setAutoDJStatusMessage(`No next track — ${stall.rejectReason}`)
      return null
    }

    const harmonic = autoDJConfig.harmonicMatch
    if (harmonic !== 'off') {
      const ranked = rankDnaTracks(currentTrack, autoDJPool, {
        excludeIds: upcomingIds,
        limit: 12,
        minScore: 0.15,
      })
      const keyThreshold = harmonic === 'key-lock' ? 0.6 : 0.45
      const keyed = ranked.filter((r) => r.score.key >= keyThreshold)
      if (keyed.length) {
        setAutoDjPickStall(null)
        return keyed[0]!.track as Track
      }
    }
    const dnaPick = (pickBestDnaTrack(currentTrack, autoDJPool, {
      excludeIds: upcomingIds,
      randomizeTop: 2,
    }) as Track) || null
    if (dnaPick) {
      setAutoDjPickStall(null)
      return dnaPick
    }
    const stall = diagnoseAutoDjPickStall({
      outgoing: currentTrack,
      candidates: autoDJPool as Track[],
      syncMode: autoDJConfig.syncMode,
      lastGrade: last?.grade,
      lastIncomingId: last?.incomingTrackId ?? null,
      consecutiveWeak,
      excludeIds: upcomingIds,
    })
    setAutoDjPickStall(stall)
    setAutoDJStatusMessage(`No next track — ${stall.rejectReason}`)
    return null
  }, [
    autoDJPool,
    queue,
    currentTrack,
    currentQueueIndex,
    autoDJConfig.harmonicMatch,
    autoDJConfig.syncMode,
    autoDJConfig.autoCorrectWeakMixes,
    mixQualityHistory,
  ])

  // Refs for fast-changing values so Auto DJ interval doesn't churn on every timeupdate
  const autoDJDurationRef = useRef(duration)
  const autoDJQueueRef = useRef(queue)
  const autoDJCurrentTrackRef = useRef(currentTrack)
  const autoDJPhraseDurationRef = useRef(phraseDuration)
  autoDJDurationRef.current = duration
  autoDJQueueRef.current = queue
  autoDJCurrentTrackRef.current = currentTrack
  autoDJPhraseDurationRef.current = phraseDuration

  // Systemic beat-grid saves (other tabs / library) keep the live deck phase in lockstep.
  useEffect(() => {
    return subscribeCatalogSync((event) => {
      if (event.entity !== 'track') return
      const live = autoDJCurrentTrackRef.current
      if (!live) return
      const matchesCurrent =
        live.id === event.entityId ||
        (live as { audioFileId?: string }).audioFileId === event.entityId
      if (!matchesCurrent) return
      if (typeof event.patch.beat_grid_offset === 'number' && Number.isFinite(event.patch.beat_grid_offset)) {
        setBeatGridOffsetSec(event.patch.beat_grid_offset)
        live.beat_grid_offset = event.patch.beat_grid_offset
      }
      if (event.patch.sonic_dna !== undefined) {
        live.sonic_dna = event.patch.sonic_dna
        setBeatGridLocked(isGridLocked(event.patch.sonic_dna))
      }
    })
  }, [])

  // Drop stale transition locks when the playhead moves to a new track
  useEffect(() => {
    // A new track means the previous track's mix distance says nothing about
    // how often we should be replanning.
    autoDJPlanDelayRef.current = null
    autoDJPlanScanRef.current = 0
    // iDJ same-deck skips must not clear the idle cue or poke master volume —
    // that fought live src swaps and looked like a reload/buffer loop.
    if (isIDJEnabledRef.current) {
      autoDJPendingRef.current = null
      setAutoDJPendingTrackId(null)
      return
    }
    // Keep MixEngine lock intact during an in-flight deck-swap handoff
    if (
      phraseMixLockRef.current ||
      skipSrcReloadRef.current ||
      isDeckHandoffActive(currentTrack?.id)
    ) {
      autoDJPendingRef.current = null
      setAutoDJPendingTrackId(null)
      return
    }
    autoDJPendingRef.current = null
    autoDJLastAddedRef.current = null
    setAutoDJPendingTrackId(null)
    clearAutoDJCrossfadeTimeout()
    setCuedIdleTrackId(null)
    clearFadeInterval()
    restoreMainVolume()
  }, [currentTrack?.id, clearAutoDJCrossfadeTimeout, clearFadeInterval, restoreMainVolume, isDeckHandoffActive])

  const cueIdleEarlyRef = useRef<
    (nextTrack: Track, plan: MixPlan, mixStartRate: number) => Promise<void>
  >(async () => {})

  cueIdleEarlyRef.current = async (nextTrack: Track, plan: MixPlan, mixStartRate: number) => {
    await runCueIdleEarly(nextTrack, plan, mixStartRate, {
      getCuedIdleTrackId: () => cuedIdleTrackIdRef.current,
      setCuedIdleTrackId: (id) => setCuedIdleTrackId(id),
      isEngineMixing: () => mixEngineRef.current?.isMixing() === true,
      lockIdleTempo: (rate) => {
        mixEngineRef.current?.lockIdleTempo(rate)
      },
      getIdleDeckId: () => (mixEngineRef.current?.getActiveDeck() === 'a' ? 'b' : 'a'),
      setIdleDeckUi: (deck, patch) => {
        setDeckUi((prev) => ({
          ...prev,
          [deck]: {
            ...prev[deck],
            playbackRate: patch.playbackRate,
            detectedBpm:
              patch.detectedBpm !== undefined
                ? patch.detectedBpm ?? prev[deck].detectedBpm
                : prev[deck].detectedBpm,
          },
        }))
      },
      silenceIdle: () => {
        mixEngineRef.current?.silenceIdle({ instant: true })
      },
      ensureDualDeckGraph,
      ensureMixEngine,
      peekUrl: (file) => resolvedUrlCacheRef.current.get(file) || null,
      cacheUrl: (file, url) => {
        resolvedUrlCacheRef.current.set(file, url)
      },
      loadWaveformSamples: (track, url) =>
        loadWaveformSamplesForTrack(track as Track, url, { allowFullDecode: true }),
      cacheMixGridOffset: (track, samples, durationSec) =>
        cacheMixGridOffset(track as Track, samples, durationSec),
      setGhostSamples: (payload) => {
        ghostSamplesRef.current = payload
      },
      syncIdleDeckWaveformCache,
      resolveIncomingCueSec: (track) => {
        if (!autoDJConfigRef.current.creativeMode) {
          return trackIntroOffsetSec(track as Track)
        }
        return resolveIncomingMixCueSec(track as Track)
      },
      withMixGrid: (track) => withMixGrid(track as Track),
      getSyncMode: () => autoDJConfigRef.current.syncMode,
      phaseMeterEnabled: () => waveformPhaseMeterRef.current,
      getPhaseMeter: () => ({
        windowId: phaseMeterOptionsRef.current.windowId,
        phraseBars: phaseMeterOptionsRef.current.phraseBars,
      }),
      getOutgoingTrack: () => autoDJCurrentTrackRef.current,
      getDetectedBpm: () => detectedBPMRef.current,
      getBeatGridOffsetSec: () => beatGridOffsetSecRef.current,
      getDefaultOverlapBars: () => autoDJConfigRef.current.overlapBars,
      getAudioContext: () => audioContextRef.current,
      armIncomingBuffer: (buf) => {
        mixEngineRef.current?.armIncomingBuffer(buf)
      },
      clearIdleWarmed: () => {
        autoDJIdleWarmedRef.current = null
      },
      setMixOverlay: (overlay) => setWaveformMixOverlay(overlay),
      setStatus: (message) => setAutoDJStatusMessage(message),
    })
  }


  useEffect(() => {
    if (!autoDJConfig.enabled || !onQueueChange) {
      autoDjControllerRef.current?.stop()
      autoDjControllerRef.current = null
      if (autoDJIntervalRef.current) {
        clearInterval(autoDJIntervalRef.current)
        autoDJIntervalRef.current = null
      }
      autoDJLastAddedRef.current = null
      autoDJPendingRef.current = null
      autoDJFrozenPlanRef.current = null
      autoDJIdleWarmedRef.current = null
      deckHandoffRef.current = null
      phraseMixLockRef.current = false
      setCuedIdleTrackId(null)
      clearAutoDJCrossfadeTimeout()
      clearFadeInterval()
      restoreMainVolume()
      setAutoDJStatusMessage('')
      setAutoDJPendingTrackId(null)
      return
    }

    const asHostTrack = (t: Track): AutoDjHostTrack => t as AutoDjHostTrack

    const host: AutoDjControllerHost = {
      getConfig: () => autoDJConfigRef.current,
      getLeadInSec: () => autoDJLeadInRef.current,
      getSuggestedLeadInSec: () => autoDJSuggestedLeadInRef.current,
      setSuggestedLeadInSec: (sec) => setAutoDJSuggestedLeadIn(sec),
      isMixingLocked: () => phraseMixLockRef.current,
      getNowSec: () => {
        const live = getPlaybackAudio()
        const engineClock = mixEngineRef.current
        const liveTime = engineClock?.hasBufferClock()
          ? engineClock.getActiveMediaTime()
          : live && Number.isFinite(live.currentTime)
            ? live.currentTime
            : NaN
        return Number.isFinite(liveTime) ? liveTime : autoDJCurrentTimeRef.current
      },
      getDurationSec: () => {
        const live = getPlaybackAudio()
        return live && Number.isFinite(live.duration) && live.duration > 0
          ? live.duration
          : autoDJDurationRef.current
      },
      getQueue: () => autoDJQueueRef.current.map(asHostTrack),
      setQueue: (queue) => {
        const next = queue as Track[]
        queueRef.current = next
        autoDJQueueRef.current = next
      },
      getCurrentTrack: () => {
        const t = autoDJCurrentTrackRef.current
        return t ? asHostTrack(t) : null
      },
      getPhraseDurationSec: () => autoDJPhraseDurationRef.current,
      getOutgoingPlaybackRate: () => getOutgoingPlaybackRate(),
      getDetectedBpm: () => detectedBPMRef.current,
      getBeatGridOffsetSec: () => beatGridOffsetSecRef.current,
      getSliderPlaybackRate: () => settingsRef.current.playbackRate,
      getLastMixGrade: () => lastMixQualityRef.current?.grade ?? null,
      getConsecutiveWeak: () =>
        autoDJConfigRef.current.autoCorrectWeakMixes
          ? consecutiveWeakMixCount(readMixQualityHistory())
          : 0,
      withMixGrid: (track) => withMixGrid(track as Track),
      resolveIncomingCueSec: (track) => {
        if (!autoDJConfigRef.current.creativeMode) {
          return trackIntroOffsetSec(track as Track)
        }
        return resolveIncomingMixCueSec(track as Track)
      },
      pickNextTrack: () => {
        const t = pickAutoDJTrack()
        return t ? asHostTrack(t) : null
      },
      cacheMixGridFromLiveWaveform: (track, durationSec) => {
        if (trackWaveformBaseRef.current.length >= 64) {
          cacheMixGridOffset(track as Track, trackWaveformBaseRef.current, durationSec)
        }
      },
      cacheMixGridFromGhost: (track) => {
        if (ghostSamplesRef.current?.trackId === track.id) {
          cacheMixGridOffset(
            track as Track,
            ghostSamplesRef.current.samples,
            ghostSamplesRef.current.durationSec,
          )
        }
      },
      peekUrl: (file) => resolvedUrlCacheRef.current.get(file) || null,
      ensureUrl: (file) => {
        void resolveAudioUrl(file).then((resolved) => {
          if (resolved) resolvedUrlCacheRef.current.set(file, resolved)
        })
      },
      warmLookahead2: (lookAhead2) => {
        void (async () => {
          let url = resolvedUrlCacheRef.current.get(lookAhead2.file) || null
          if (!url) {
            url = await resolveAudioUrl(lookAhead2.file)
            if (url) resolvedUrlCacheRef.current.set(lookAhead2.file, url)
          }
          if (!url) return
          const packed = await loadWaveformSamplesForTrack(lookAhead2 as Track, url, {
            allowFullDecode: true,
          })
          if (!packed || mixLookahead2IdRef.current !== lookAhead2.id) return
          const durationSec = packed.durationSec || lookAhead2.duration || 180
          cacheMixGridOffset(lookAhead2 as Track, packed.samples, durationSec)
          if (needsKickRemeasure(lookAhead2.sonic_dna, durationSec)) {
            const bpm =
              resolvePlaybackBpm(lookAhead2 as Track, null) ?? lookAhead2.bpm ?? null
            if (bpm && bpm > 0 && packed.samples.length >= 64) {
              const offset =
                typeof lookAhead2.beat_grid_offset === 'number' &&
                Number.isFinite(lookAhead2.beat_grid_offset)
                  ? lookAhead2.beat_grid_offset
                  : 0
              const bundle = buildGridOnsetBundle({
                sonicDna: lookAhead2.sonic_dna,
                peaks: packed.samples,
                durationSec,
                bpm,
                offsetSec: offset,
              })
              if (bundle.kickOnsetSec.length >= 4) {
                const nextDna = withGridAnalysisOnDna(lookAhead2.sonic_dna, {
                  kickOnsetSec: bundle.kickOnsetSec,
                  snareClapOnsetSec:
                    bundle.snareClapOnsetSec.length >= 4
                      ? bundle.snareClapOnsetSec
                      : undefined,
                  offsetSec: offset,
                })
                lookAhead2.sonic_dna = nextDna
                if (onQueueChangeRef.current) {
                  onQueueChangeRef.current(
                    (queueRef.current || []).map((t) =>
                      t.id === lookAhead2.id ? { ...t, sonic_dna: nextDna } : t,
                    ),
                  )
                }
                if (canEditOrigBpm) {
                  void fetch('/api/music-library/tracks', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      id: lookAhead2.id,
                      beat_grid_offset: offset,
                      sonic_dna: nextDna,
                    }),
                  }).catch(() => {})
                }
              }
            }
          }
        })()
      },
      getLookahead2Id: () => mixLookahead2IdRef.current,
      setLookahead2Id: (id) => {
        mixLookahead2IdRef.current = id
      },
      phaseMeterEnabled: () => waveformPhaseMeterRef.current,
      getPhaseMeter: () => ({
        windowId: phaseMeterOptionsRef.current.windowId,
        phraseBars: phaseMeterOptionsRef.current.phraseBars,
      }),
      enterPlan: (plan) => {
        mixEngineRef.current?.enterPlan(plan)
      },
      cueIdleEarly: (track, plan, rate) => {
        void cueIdleEarlyRef.current(track as Track, plan, rate)
      },
      getCuedIdleTrackId: () => cuedIdleTrackIdRef.current,
      getIdleWarmedId: () => autoDJIdleWarmedRef.current,
      setIdleWarmedId: (id) => {
        autoDJIdleWarmedRef.current = id
      },
      isEngineMixing: () => mixEngineRef.current?.isMixing() === true,
      hasIncomingReady: () => mixEngineRef.current?.hasIncomingReady() === true,
      canEnterFire: () => mixEngineRef.current?.canEnterFire() === true,
      getIdleReadyState: () => getIdleAudio()?.readyState ?? 0,
      parkAndWarmIdle: (cueSec, rate) => {
        mixEngineRef.current?.parkIdleAtCue(cueSec, rate)
        mixEngineRef.current?.warmIdle(rate)
      },
      nudgeIdleToMaster: (args) => {
        mixEngineRef.current?.nudgeIdleToMaster(args)
      },
      incomingPeaksReady: (track, inRef) =>
        (ghostSamplesRef.current?.trackId === track.id &&
          (ghostSamplesRef.current.samples?.length ?? 0) >= 64) ||
        (Array.isArray(inRef.waveformPeaks) && inRef.waveformPeaks.length >= 64),
      loadIncomingPeaks: (track) => {
        const url = resolvedUrlCacheRef.current.get(track.file) || null
        if (!url) {
          void resolveAudioUrl(track.file).then((resolved) => {
            if (resolved) resolvedUrlCacheRef.current.set(track.file, resolved)
          })
          return
        }
        if (ghostSamplesRef.current?.trackId === track.id) return
        void loadWaveformSamplesForTrack(track as Track, url, { allowFullDecode: true }).then(
          (packed) => {
            if (!packed) return
            const durationSec = packed.durationSec || track.duration || 180
            cacheMixGridOffset(track as Track, packed.samples, durationSec)
            if (needsKickRemeasure(track.sonic_dna, durationSec)) {
              const bpm = resolvePlaybackBpm(track as Track, null) ?? track.bpm ?? null
              if (bpm && bpm > 0 && packed.samples.length >= 64) {
                const offset =
                  typeof track.beat_grid_offset === 'number' &&
                  Number.isFinite(track.beat_grid_offset)
                    ? track.beat_grid_offset
                    : 0
                const bundle = buildGridOnsetBundle({
                  sonicDna: track.sonic_dna,
                  peaks: packed.samples,
                  durationSec,
                  bpm,
                  offsetSec: offset,
                })
                if (bundle.kickOnsetSec.length >= 4) {
                  const nextDna = withGridAnalysisOnDna(track.sonic_dna, {
                    kickOnsetSec: bundle.kickOnsetSec,
                    snareClapOnsetSec:
                      bundle.snareClapOnsetSec.length >= 4
                        ? bundle.snareClapOnsetSec
                        : undefined,
                    offsetSec: offset,
                  })
                  track.sonic_dna = nextDna
                  if (onQueueChangeRef.current) {
                    onQueueChangeRef.current(
                      (queueRef.current || []).map((t) =>
                        t.id === track.id ? { ...t, sonic_dna: nextDna } : t,
                      ),
                    )
                  }
                }
              }
            }
            ghostSamplesRef.current = {
              trackId: track.id,
              samples: packed.samples,
              durationSec,
              sonicDna: track.sonic_dna,
            }
            syncIdleDeckWaveformCache(track.id, packed.samples, durationSec)
          },
        )
      },
      startPhraseMix: (track, mixDur, rate, plan, opts) => {
        void startPhraseMix(track as Track, mixDur, rate, plan, opts)
      },
      setStatus: (msg) => setAutoDJStatusMessage(msg),
      setPendingTrackId: (id) => setAutoDJPendingTrackId(id),
      setOutCountdown: (sec) => setAutoDJOutCountdown(sec),
      setMixOverlay: (overlay) => setWaveformMixOverlay(overlay),
      clearOutWatch: () => clearAutoDJOutWatch(),
      clearCrossfadeTimeout: () => clearAutoDJCrossfadeTimeout(),
      watchOutMarker: (targetOut, fire) => {
        clearAutoDJOutWatch()
        const watch = () => {
          if (!autoDJConfigRef.current.enabled || phraseMixLockRef.current) {
            autoDJOutRafRef.current = null
            return
          }
          const liveEl = getPlaybackAudio()
          const nowSec = liveEl?.currentTime ?? autoDJCurrentTimeRef.current
          if (nowSec >= targetOut - 0.005) {
            autoDJOutRafRef.current = null
            fire()
            return
          }
          autoDJOutRafRef.current = requestAnimationFrame(watch)
        }
        autoDJOutRafRef.current = requestAnimationFrame(watch)
      },
      scheduleFireRetry: (fire) => {
        if (autoDJOutRafRef.current == null) {
          autoDJOutRafRef.current = requestAnimationFrame(() => {
            autoDJOutRafRef.current = null
            fire()
          })
        }
      },
      getFrozen: () => autoDJFrozenPlanRef.current,
      setFrozen: (frozen) => {
        autoDJFrozenPlanRef.current = frozen
      },
      getLastPlan: () => lastMixPlanRef.current,
      setLastPlan: (plan) => {
        lastMixPlanRef.current = plan
      },
      getPendingId: () => autoDJPendingRef.current,
      setPendingId: (id) => {
        autoDJPendingRef.current = id
      },
      getLastAddedId: () => autoDJLastAddedRef.current,
      setLastAddedId: (id) => {
        autoDJLastAddedRef.current = id
      },
      getPlanDelay: () => autoDJPlanDelayRef.current,
      setPlanDelay: (sec) => {
        autoDJPlanDelayRef.current = sec
      },
      getPlanScan: () => autoDJPlanScanRef.current,
      setPlanScan: (n) => {
        autoDJPlanScanRef.current = n
      },
      onQueueChange: (queue) => onQueueChange(queue as Track[]),
    }

    const controller = new AutoDjController(host)
    autoDjControllerRef.current?.stop()
    autoDjControllerRef.current = controller
    controller.start()
    return () => {
      controller.stop()
      if (autoDjControllerRef.current === controller) {
        autoDjControllerRef.current = null
      }
      clearAutoDJCrossfadeTimeout()
    }
  }, [
    autoDJConfig.enabled,
    autoDJConfig.mixStyle,
    autoDJConfig.mixTechniques,
    autoDJConfig.outPhraseBars,
    autoDJConfig.inPhraseBars,
    autoDJConfig.overlapBars,
    autoDJConfig.cuePriority,
    autoDJConfig.mixLengthBias,
    autoDJConfig.energyCurve,
    autoDJConfig.harmonicMatch,
    autoDJConfig.bpmStrategy,
    autoDJConfig.syncMode,
    autoDJConfig.sectionStyle,
    autoDJConfig.lookahead,
    autoDJConfig.blendQuantize,
    autoDJConfig.beatCorrect,
    autoDJConfig.autoCorrectWeakMixes,
    autoDJConfig.creativeMode,
    autoDJLeadIn,
    onQueueChange,
    pickAutoDJTrack,
    startPhraseMix,
    resolveIncomingMixCueSec,
    clearAutoDJCrossfadeTimeout,
    clearAutoDJOutWatch,
    clearFadeInterval,
    restoreMainVolume,
    ensureMixEngine,
    ensureDualDeckGraph,
    getPlaybackAudio,
    getOutgoingPlaybackRate,
    withMixGrid,
    getIdleAudio,
    cacheMixGridOffset,
    syncIdleDeckWaveformCache,
    canEditOrigBpm,
    pickAutoDJTrack,
    trackIntroOffsetSec,
    resolveIncomingMixCueSec,
  ])


  const UPCOMING_PREVIEW = 8
  /** Tracks already queued after the current one (“assigned cues”). */
  const assignedUpcoming = useMemo(() => {
    if (currentQueueIndex >= 0) return queue.slice(currentQueueIndex + 1)
    if (!currentTrack) return queue
    return queue.filter((t) => t.id !== currentTrack.id)
  }, [queue, currentQueueIndex, currentTrack])

  /**
   * Up-next preview (not the full library):
   * - Assigned cues (queued after current) → next up to 8
   * - Else Auto DJ on → top DNA matches
   * - Else catalog random → empty until random fill lands in the queue
   * - Else shuffle off → next 8 in library/source order
   * - Else (queue-order shuffle on, no cues) → empty
   */
  const displayTracks = useMemo(() => {
    const pool = autoDJPool

    if (assignedUpcoming.length > 0) {
      return assignedUpcoming.slice(0, UPCOMING_PREVIEW)
    }

    if (autoDJConfig.enabled && currentTrack) {
      return rankDnaTracks(currentTrack, pool, {
        excludeIds: new Set([currentTrack.id]),
        limit: UPCOMING_PREVIEW,
        minScore: 0.08,
      }).map((x) => x.track as Track)
    }

    if (settings.catalogRandom || settings.isShuffled || !currentTrack) {
      return []
    }

    const idx = pool.findIndex((t) => t.id === currentTrack.id)
    if (idx >= 0) {
      return pool.slice(idx + 1, idx + 1 + UPCOMING_PREVIEW)
    }
    return pool.slice(0, UPCOMING_PREVIEW)
  }, [
    autoDJPool,
    queue,
    currentTrack,
    autoDJConfig.enabled,
    assignedUpcoming,
    settings.isShuffled,
    settings.catalogRandom,
  ])

  const upcomingListLabel =
    assignedUpcoming.length > 0
      ? 'Up next'
      : autoDJConfig.enabled
        ? 'Auto DJ matches'
        : settings.catalogRandom
          ? isOrderedReleaseRandomScope(currentSource)
            ? 'EP/crate in order'
            : `Random from ${catalogScopeLabel(currentSource)}`
          : settings.isShuffled
            ? 'Up next'
            : 'Next in library'

  const queueTrackIds = useMemo(() => new Set(queue.map(t => t.id)), [queue])
  const queueIndexMap = useMemo(() => {
    const m = new Map<string, number>()
    queue.forEach((t, i) => m.set(t.id, i))
    return m
  }, [queue])

  const handleRemoveFromQueueClick = (index: number) => {
    if (onRemoveFromQueue) {
      onRemoveFromQueue(index)
    } else {
      // Fallback: remove from local queue
      const newQueue = queue.filter((_, i) => i !== index)
      onQueueChange?.(newQueue)
    }
  }

  const [queueDragOverIndex, setQueueDragOverIndex] = useState<number | null>(null)
  const [queueLibraryDropActive, setQueueLibraryDropActive] = useState(false)
  const queueDragActiveRef = useRef(false)
  const canReorderQueue = assignedUpcoming.length > 1 && Boolean(onQueueChange)
  const canAcceptLibraryQueueDrop = Boolean(onQueueChange)

  const resolveLibraryDropTracks = useCallback(
    (dt: DataTransfer): Track[] => {
      const fromPayload = parseLibraryDragTracks(dt) as Track[]
      if (fromPayload.length) return fromPayload.filter((t) => Boolean(t?.id))
      const ids = readLibraryDragTrackIds(dt)
      if (!ids.length) return []
      const byId = new Map<string, Track>()
      for (const t of autoDJPool) byId.set(t.id, t)
      for (const t of queue) byId.set(t.id, t)
      return ids.map((id) => byId.get(id)).filter((t): t is Track => Boolean(t?.id))
    },
    [autoDJPool, queue],
  )

  const applyLibraryQueueOverride = useCallback(
    (incoming: Track[]) => {
      if (!incoming.length) return
      setIsTrackListExpanded(true)
      if (!currentTrack) {
        playTrack(incoming[0], incoming)
        setAutoDJStatusMessage(
          incoming.length === 1
            ? `Playing “${incoming[0]!.title}”`
            : `Playing · ${incoming.length} tracks from library`,
        )
        return
      }
      if (!onQueueChange) return
      const next = overrideUpcomingQueue(queue, currentQueueIndex, incoming)
      const unchanged =
        next.length === queue.length && next.every((t, i) => t.id === queue[i]?.id)
      if (!unchanged) {
        onQueueChange(next)
        setAutoDJStatusMessage(
          incoming.length === 1
            ? `Up next overridden · “${incoming[0]!.title}”`
            : `Up next overridden · ${incoming.length} tracks`,
        )
      }
    },
    [currentTrack, playTrack, onQueueChange, queue, currentQueueIndex],
  )

  const isLibraryQueueDrag = useCallback((dt: DataTransfer | null) => {
    if (!dt || queueDragActiveRef.current) return false
    if (Array.from(dt.types || []).includes(QUEUE_DRAG_MIME)) return false
    return libraryDragHasTracks(dt)
  }, [])

  const handleQueueDragStart = useCallback((e: React.DragEvent, displayIndex: number, trackId: string) => {
    if (!canReorderQueue) return
    queueDragActiveRef.current = true
    e.dataTransfer.setData(QUEUE_DRAG_MIME, String(displayIndex))
    e.dataTransfer.setData('text/plain', trackId)
    e.dataTransfer.effectAllowed = 'move'
  }, [canReorderQueue])

  const handleQueueDragOver = useCallback((e: React.DragEvent, displayIndex: number) => {
    const libraryDrop = canAcceptLibraryQueueDrop && isLibraryQueueDrag(e.dataTransfer)
    const reorderDrop =
      canReorderQueue &&
      (e.dataTransfer.types.includes(QUEUE_DRAG_MIME) || queueDragActiveRef.current)
    if (!libraryDrop && !reorderDrop) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = libraryDrop ? 'copy' : 'move'
    if (libraryDrop) setQueueLibraryDropActive(true)
    setQueueDragOverIndex((prev) => (prev === displayIndex ? prev : displayIndex))
  }, [canAcceptLibraryQueueDrop, canReorderQueue, isLibraryQueueDrag])

  const handleQueuePanelDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!canAcceptLibraryQueueDrop || !isLibraryQueueDrag(e.dataTransfer)) return
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'copy'
      setQueueLibraryDropActive(true)
    },
    [canAcceptLibraryQueueDrop, isLibraryQueueDrag],
  )

  const handleQueuePanelDragLeave = useCallback((e: React.DragEvent) => {
    const next = e.relatedTarget as Node | null
    if (next && e.currentTarget.contains(next)) return
    setQueueLibraryDropActive(false)
    setQueueDragOverIndex(null)
  }, [])

  const handleQueueDrop = useCallback(
    (e: React.DragEvent, toDisplayIdx: number) => {
      if (!onQueueChange) return

      if (isLibraryQueueDrag(e.dataTransfer) || e.dataTransfer.types.includes(SERGIK_LIBRARY_TRACKS_DRAG_MIME) || e.dataTransfer.types.includes(SERGIK_PLAYLIST_DRAG_MIME)) {
        const incoming = resolveLibraryDropTracks(e.dataTransfer)
        if (incoming.length) {
          e.preventDefault()
          e.stopPropagation()
          setQueueDragOverIndex(null)
          setQueueLibraryDropActive(false)
          queueDragActiveRef.current = false
          applyLibraryQueueOverride(incoming)
          return
        }
      }

      if (!canReorderQueue) return
      const raw = e.dataTransfer.getData(QUEUE_DRAG_MIME)
      const fromDisplayIdx = parseInt(raw, 10)
      if (!Number.isFinite(fromDisplayIdx)) return
      e.preventDefault()
      e.stopPropagation()
      setQueueDragOverIndex(null)
      setQueueLibraryDropActive(false)
      queueDragActiveRef.current = false
      const next = reorderUpcomingQueue(queue, currentQueueIndex, fromDisplayIdx, toDisplayIdx)
      const unchanged =
        next.length === queue.length && next.every((t, i) => t.id === queue[i]?.id)
      if (!unchanged) onQueueChange(next)
    },
    [
      canReorderQueue,
      onQueueChange,
      queue,
      currentQueueIndex,
      isLibraryQueueDrag,
      resolveLibraryDropTracks,
      applyLibraryQueueOverride,
    ],
  )

  const handleQueuePanelDrop = useCallback(
    (e: React.DragEvent) => {
      if (!canAcceptLibraryQueueDrop) return
      const incoming = resolveLibraryDropTracks(e.dataTransfer)
      if (!incoming.length) return
      e.preventDefault()
      e.stopPropagation()
      setQueueDragOverIndex(null)
      setQueueLibraryDropActive(false)
      queueDragActiveRef.current = false
      applyLibraryQueueOverride(incoming)
    },
    [canAcceptLibraryQueueDrop, resolveLibraryDropTracks, applyLibraryQueueOverride],
  )

  const handleQueueDragEnd = useCallback(() => {
    queueDragActiveRef.current = false
    setQueueDragOverIndex(null)
    setQueueLibraryDropActive(false)
  }, [])

  const playbackRates = PLAYBACK_RATES
  const eqPresets = EQ_PRESETS

  // Extract BPM from multiple sources with improved patterns
  const extractBPM = useCallback((track: Track | null): number | null => {
    if (!track) return null
    
    // 1. Check if track has BPM property
    if (track.bpm && track.bpm > 0) {
      return track.bpm
    }
    
    // 2. Extract from title with multiple patterns
    const titlePatterns = [
      /(\d+)\s*bpm/i,                    // "120bpm" or "120 bpm"
      /(\d+)\s*BPM/i,                    // "120 BPM"
      /bpm[:\s]+(\d+)/i,                 // "BPM: 120" or "BPM 120"
      /\((\d+)\s*bpm\)/i,                // "(120bpm)"
      /\[(\d+)\s*bpm\]/i,                // "[120bpm]"
      /-(\d+)\s*bpm/i,                   // "-120bpm"
      /\s(\d{2,3})\s*bpm/i,              // "Track 120 bpm" (2-3 digits before bpm)
    ]
    
    for (const pattern of titlePatterns) {
      const match = track.title.match(pattern)
      if (match) {
        const bpm = parseInt(match[1], 10)
        // Validate BPM is in reasonable range (30-300 BPM)
        if (bpm >= 30 && bpm <= 300) {
          return bpm
        }
      }
    }
    
    return null
  }, [])

  // Detect BPM from audio file if not found in metadata
  // Priority: 1) Cache, 2) Supabase database (PRIMARY SOURCE - Sonic DNA), 3) Track.bpm property, 4) Extract from title/metadata, 5) Audio analysis
  useEffect(() => {
    if (!currentTrack) {
      setDetectedBPM(null)
      setTapeBpm(null)
      return
    }

    const catalogBpm = displayTrackBpm(currentTrack)
    if (catalogBpm) {
      setDetectedBPM(catalogBpm)
      if (bpmCacheRef.current) {
        bpmCacheRef.current.set(currentTrack.id, catalogBpm)
      }
      return
    }

    // Check cache first
    if (bpmCacheRef.current) {
      const cachedBPM = bpmCacheRef.current.get(currentTrack.id)
      if (cachedBPM !== undefined) {
        setDetectedBPM(cachedBPM)
        return
      }
    }

    // Priority 1: Fetch from Supabase database (Sonic DNA database) - PRIMARY SOURCE OF TRUTH
    // This ensures we always use the correct BPM from the database, not random/incorrect values
    if (currentTrack.file) {
      // Capture current queue at effect time (not as dependency)
      const currentQueue = queue
      
      fetchBPMFromSupabase(currentTrack.file, currentTrack.id)
        .then(bpm => {
          if (bpm && bpm > 0) {
            setDetectedBPM(bpm)
            if (bpmCacheRef.current) {
              bpmCacheRef.current.set(currentTrack.id, bpm)
            }
            // Update the track in context with BPM for future use
            if (onQueueChangeRef.current && currentTrack && !updatedQueueTrackRef.current.has(currentTrack.id)) {
              updatedQueueTrackRef.current.add(currentTrack.id)
              setTimeout(() => {
                if (onQueueChangeRef.current) {
                  const updatedTrack = { ...currentTrack, bpm: bpm }
                  // Use captured queue from effect time
                  const updatedQueue = currentQueue.map(t => t.id === currentTrack.id ? updatedTrack : t)
                  onQueueChangeRef.current(updatedQueue)
                }
              }, 0)
            }
            return
          }
          
          // If not found in database, try other methods
          // Priority 2: Try track.bpm property (fallback if database doesn't have it)
          if (currentTrack.bpm && currentTrack.bpm > 0) {
            setDetectedBPM(currentTrack.bpm)
            if (bpmCacheRef.current) {
              bpmCacheRef.current.set(currentTrack.id, currentTrack.bpm)
            }
            return
          }
          
          // Priority 3: Extract from title/metadata
          const extractedBPM = extractBPM(currentTrack)
          if (extractedBPM) {
            setDetectedBPM(extractedBPM)
            if (bpmCacheRef.current) {
              bpmCacheRef.current.set(currentTrack.id, extractedBPM)
            }
            return
          }

          // Priority 4: If not found and we have a resolved URL, try audio analysis (async, don't block)
          if (!resolvedUrl) {
            setDetectedBPM(null)
            if (bpmCacheRef.current) {
              bpmCacheRef.current.set(currentTrack.id, null)
            }
            return
          }

          setIsDetectingBPM(true)
          detectBPM(resolvedUrl)
            .then(analyzedBPM => {
              if (analyzedBPM) {
                setDetectedBPM(analyzedBPM)
                if (bpmCacheRef.current) {
                  bpmCacheRef.current.set(currentTrack.id, analyzedBPM)
                }
              } else {
                setDetectedBPM(null)
                if (bpmCacheRef.current) {
                  bpmCacheRef.current.set(currentTrack.id, null)
                }
              }
              setIsDetectingBPM(false)
            })
            .catch(() => {
              setDetectedBPM(null)
              if (bpmCacheRef.current) {
                bpmCacheRef.current.set(currentTrack.id, null)
              }
              setIsDetectingBPM(false)
            })
        })
        .catch(() => {
          // Database fetch failed, try other methods
          // Priority 2: Try track.bpm property (fallback if database fetch failed)
          if (currentTrack.bpm && currentTrack.bpm > 0) {
            setDetectedBPM(currentTrack.bpm)
            if (bpmCacheRef.current) {
              bpmCacheRef.current.set(currentTrack.id, currentTrack.bpm)
            }
            return
          }
          
          // Priority 3: Extract from title/metadata
          const extractedBPM = extractBPM(currentTrack)
          if (extractedBPM) {
            setDetectedBPM(extractedBPM)
            if (bpmCacheRef.current) {
              bpmCacheRef.current.set(currentTrack.id, extractedBPM)
            }
            return
          }

          if (!resolvedUrl) {
            setDetectedBPM(null)
            if (bpmCacheRef.current) {
              bpmCacheRef.current.set(currentTrack.id, null)
            }
            return
          }

          setIsDetectingBPM(true)
          detectBPM(resolvedUrl)
            .then(analyzedBPM => {
              if (analyzedBPM) {
                setDetectedBPM(analyzedBPM)
                if (bpmCacheRef.current) {
                  bpmCacheRef.current.set(currentTrack.id, analyzedBPM)
                }
              } else {
                setDetectedBPM(null)
                if (bpmCacheRef.current) {
                  bpmCacheRef.current.set(currentTrack.id, null)
                }
              }
              setIsDetectingBPM(false)
            })
            .catch(() => {
              setDetectedBPM(null)
              if (bpmCacheRef.current) {
                bpmCacheRef.current.set(currentTrack.id, null)
              }
              setIsDetectingBPM(false)
            })
        })
      return
    }
    
    // Fallback if no file path: try extract from title/metadata
    const extractedBPM = extractBPM(currentTrack)
    if (extractedBPM) {
      setDetectedBPM(extractedBPM)
      if (bpmCacheRef.current) {
        bpmCacheRef.current.set(currentTrack.id, extractedBPM)
      }
      return
    }

    // Last resort: audio analysis if we have a resolved URL
    if (!resolvedUrl) {
      setDetectedBPM(null)
      if (bpmCacheRef.current) {
        bpmCacheRef.current.set(currentTrack.id, null)
      }
      return
    }

    setIsDetectingBPM(true)
    detectBPM(resolvedUrl)
      .then(bpm => {
        if (bpm) {
          setDetectedBPM(bpm)
          if (bpmCacheRef.current) {
            bpmCacheRef.current.set(currentTrack.id, bpm)
          }
        } else {
          setDetectedBPM(null)
          if (bpmCacheRef.current) {
            bpmCacheRef.current.set(currentTrack.id, null)
          }
        }
        setIsDetectingBPM(false)
      })
      .catch(() => {
        setDetectedBPM(null)
        if (bpmCacheRef.current) {
          bpmCacheRef.current.set(currentTrack.id, null)
        }
        setIsDetectingBPM(false)
      })
  }, [currentTrack, currentTrack?.id, currentTrack?.bpm, currentTrack?.file, resolvedUrl, extractBPM, fetchBPMFromSupabase])

  const handleDeckTapTempo = useCallback(
    (deck: 'a' | 'b') => {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now()

      setDeckUi((prev) => {
        const slice = prev[deck]
        const result = recordTapTempo(slice.tapTempoTaps, now, {
          sectionBpms: slice.tapTempoSectionBpms,
          sectionsCompleted: slice.tapTempoSectionBpms.length,
        })
        return {
          ...prev,
          [deck]: {
            ...slice,
            tapTempoTaps: result.taps,
            tapTempoSectionBpms: result.sectionBpms,
            tapTempoBPM: result.sectionsCompleted > 0 ? result.averageBpm : null,
          },
        }
      })

      const prevTimeout = tapTempoTimeoutRef.current?.[deck]
      if (prevTimeout) clearTimeout(prevTimeout)

      if (!tapTempoTimeoutRef.current) {
        tapTempoTimeoutRef.current = { a: null, b: null }
      }
      tapTempoTimeoutRef.current[deck] = setTimeout(() => {
        setDeckUi((prev) => ({
          ...prev,
          [deck]: {
            ...prev[deck],
            tapTempoTaps: [],
            tapTempoBPM: null,
            tapTempoSectionBpms: [],
          },
        }))
        if (tapTempoTimeoutRef.current) {
          tapTempoTimeoutRef.current[deck] = null
        }
      }, 5000)
    },
    [],
  )

  const handleTapTempo = useCallback(() => {
    const liveDeck = playbackDeckRef.current === 'next' ? 'b' : 'a'
    handleDeckTapTempo(liveDeck)
  }, [handleDeckTapTempo])
  
  // Cleanup tap tempo timeout on unmount
  useEffect(() => {
    return () => {
      const timeouts = tapTempoTimeoutRef.current
      if (!timeouts) return
      if (timeouts.a) clearTimeout(timeouts.a)
      if (timeouts.b) clearTimeout(timeouts.b)
    }
  }, [])

  // Reset tap tempo when live track changes
  useEffect(() => {
    const liveDeck = playbackDeckRef.current === 'next' ? 'b' : 'a'
    setDeckUi((prev) => ({
      ...prev,
      [liveDeck]: {
        ...prev[liveDeck],
        tapTempoTaps: [],
        tapTempoBPM: null,
        tapTempoSectionBpms: [],
      },
    }))
    const timeouts = tapTempoTimeoutRef.current
    if (timeouts?.[liveDeck]) {
      clearTimeout(timeouts[liveDeck]!)
      timeouts[liveDeck] = null
    }
  }, [currentTrack?.id])

  // Handle BPM update (manual edit — admin persists to library)
  const handleBPMUpdate = useCallback(
    async (newBPM: number, track: Track, syncLiveDetected = true) => {
      if (!track?.id) {
        throw new Error('No track selected')
      }

      const patchTrackBpm = (source: Track): Track => applyAdminBpmToTrack(source, newBPM)

      const applyLocalBpm = () => {
        bpmCacheRef.current.set(track.id, newBPM)
        if (syncLiveDetected && currentTrack?.id === track.id) {
          setDetectedBPM(newBPM)
          setTapeBpm(newBPM)
        }
        const existing = tapeGridByTrackId[track.id]
        rememberTapeGrid(
          track.id,
          newBPM,
          existing?.offsetSec ?? (currentTrack?.id === track.id ? beatGridOffsetSec : 0),
        )
        autoAlignedSigRef.current = null
        if (onQueueChangeRef.current) {
          onQueueChangeRef.current(queue.map((t) => (t.id === track.id ? patchTrackBpm(t) : t)))
        }
        // After the queue replace — last write wins so live extras (grid, DNA)
        // on currentTrack are not overwritten by a stale queue copy.
        if (currentTrack?.id === track.id) {
          setCurrentTrack(patchTrackBpm(currentTrack))
        }
      }

      if (!canEditOrigBpm) {
        applyLocalBpm()
        return
      }

      const isUUID = (value: string | undefined) =>
        Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))
      const persistId = [track.id, track.audioFileId].find(isUUID)

      if (!persistId) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('Track is not in database, updating local state only')
        }
        applyLocalBpm()
        emitCatalogSync({
          entity: 'track',
          entityId: track.id,
          patch: { bpm: newBPM },
        })
        return
      }

      try {
        const response = await fetch('/api/audio/update-bpm', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            trackId: persistId,
            bpm: newBPM,
          }),
        })

        if (!response.ok) {
          let errorMessage = 'Failed to update BPM'
          try {
            const errorData = await response.json()
            errorMessage = errorData.error || errorMessage
          } catch {
            errorMessage =
              response.status === 404
                ? 'API route not found. Please restart the dev server.'
                : `HTTP ${response.status}: ${response.statusText}`
          }
          throw new Error(errorMessage)
        }

        const saved = await response.json()
        applyLocalBpm()
        const syncIds = [
          persistId,
          saved?.data?.audioFileId,
          ...(Array.isArray(saved?.data?.libraryTrackIds) ? saved.data.libraryTrackIds : []),
        ].filter((id): id is string => typeof id === 'string' && id.length > 0)
        for (const id of [...new Set(syncIds)]) {
          emitCatalogSync({
            entity: 'track',
            entityId: id,
            patch: { bpm: newBPM },
            publishVersion: saved?.publishVersion ?? null,
          })
        }
      } catch (error: unknown) {
        console.error('Error updating BPM:', error)
        throw error
      }
    },
    [canEditOrigBpm, currentTrack, queue, rememberTapeGrid, tapeGridByTrackId, beatGridOffsetSec, setCurrentTrack],
  )

  const handleDeckBPMUpdate = useCallback(
    async (deck: 'a' | 'b', newBPM: number) => {
      const track = resolveDeckTrack(deck)
      if (!track) {
        throw new Error('No track on this deck')
      }
      const liveDeck = playbackDeckRef.current === 'next' ? 'b' : 'a'
      setDeckUi((prev) => ({
        ...prev,
        [deck]: { ...prev[deck], detectedBpm: newBPM },
      }))
      await handleBPMUpdate(newBPM, track, deck === liveDeck)
    },
    [handleBPMUpdate, resolveDeckTrack],
  )

  // Cleanup audio context on unmount - MUST be before early return to maintain hook order
  useEffect(() => {
    return () => {
      // Cleanup audio context
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {
          // Ignore errors during cleanup
        })
        audioContextRef.current = null
      }
      
      // Cleanup analyser
      if (analyserRef.current) {
        try {
          analyserRef.current.disconnect()
        } catch (e) {
          // Ignore errors
        }
        analyserRef.current = null
      }
      
      // Cleanup source node
      if (sourceNodeRef.current) {
        try {
          sourceNodeRef.current.disconnect()
        } catch (e) {
          // Ignore errors
        }
        sourceNodeRef.current = null
      }
      
      // Cancel animation frames
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      
      // Clear intervals
      if (fadeIntervalRef.current) {
        clearInterval(fadeIntervalRef.current)
        fadeIntervalRef.current = null
      }
      
      const timeouts = tapTempoTimeoutRef.current
      if (timeouts) {
        if (timeouts.a) clearTimeout(timeouts.a)
        if (timeouts.b) clearTimeout(timeouts.b)
      }
    }
  }, [])

  // Calculate tempo percentage from playback rate

  const handleDeckTempoChange = (deck: 'a' | 'b', tempoValue: number) => {
    changeDeckPlaybackRate(deck, tempoValueToRate(tempoValue))
  }

  const handleTempoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const liveDeck = playbackDeckRef.current === 'next' ? 'b' : 'a'
    handleDeckTempoChange(liveDeck, parseFloat(e.target.value))
  }

  // Musical zoom: visible window in bars (4/8/16…), 0 = full track overview
  const zoomToVisibleRatio = useCallback((zoomLevel: number): number => {
    return zoomLevelToVisibleRatio(zoomLevel)
  }, [])

  const waveformBpm = (() => {
    const locked = currentTrack
      ? Number(readCatalogOverrides(currentTrack.metadata)?.bpm)
      : NaN
    if (Number.isFinite(locked) && locked > 0) return locked
    const catalog = currentTrack ? displayTrackBpm(currentTrack) : null
    const tapeRaw =
      (currentTrack?.id && tapeGridByTrackId[currentTrack.id]?.bpm) || tapeBpm || null
    if (tapeRaw) return reconcileTapeBpm(tapeRaw, catalog)
    return (
      resolvePlaybackBpm(currentTrack, detectedBPM) ||
      detectedBPM ||
      currentTrack?.bpm ||
      null
    )
  })()
  const waveformBeatDurationSec = waveformBpm && waveformBpm > 0 ? 60 / waveformBpm : null
  const waveformBeatsPerBar = beatGridBeatsPerBar || 4
  const isWaveformBarZoomed = waveformVisibleBars > 0

  const persistBeatGridOffsetForTrack = useCallback(
    (
      track: Track | null | undefined,
      offset: number,
      sonicDna?: unknown,
      opts?: { immediate?: boolean; gridManual?: boolean },
    ) => {
      if (!track?.id) return
      const isUuid = (value: string | undefined) =>
        Boolean(
          value &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value),
        )
      const persistId = [track.id, (track as { audioFileId?: string }).audioFileId].find(isUuid)
      if (beatGridSaveTimeoutRef.current) {
        clearTimeout(beatGridSaveTimeoutRef.current)
        beatGridSaveTimeoutRef.current = null
      }

      const run = async () => {
        if (!canEditOrigBpm || !persistId) {
          if (canEditOrigBpm && !persistId) {
            console.warn('Beat grid not saved: track is not in the catalog (missing UUID)')
          }
          return
        }
        try {
          const response = await fetch('/api/audio/update-beat-grid', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              trackId: persistId,
              offsetSec: offset,
              ...(sonicDna !== undefined ? { sonicDna } : {}),
              ...(typeof opts?.gridManual === 'boolean' ? { gridManual: opts.gridManual } : {}),
            }),
          })
          if (!response.ok) {
            let message = 'Failed to persist beat grid offset'
            try {
              const err = await response.json()
              if (err?.error) message = String(err.error)
            } catch {
              /* ignore */
            }
            console.warn(message)
            return
          }
          const saved = await response.json().catch(() => null)
          const nextDna = saved?.data?.sonic_dna ?? sonicDna
          const syncIds = [
            persistId,
            track.id,
            (track as { audioFileId?: string }).audioFileId,
            saved?.data?.audioFileId,
            ...(Array.isArray(saved?.data?.libraryTrackIds) ? saved.data.libraryTrackIds : []),
          ].filter((id): id is string => typeof id === 'string' && id.length > 0)
          for (const id of [...new Set(syncIds)]) {
            emitCatalogSync({
              entity: 'track',
              entityId: id,
              patch: {
                beat_grid_offset: offset,
                ...(nextDna !== undefined ? { sonic_dna: nextDna } : {}),
              },
            })
          }
        } catch (e) {
          console.warn('Failed to persist beat grid offset:', e)
        }
      }

      if (opts?.immediate) {
        void run()
        return
      }
      beatGridSaveTimeoutRef.current = setTimeout(() => {
        void run()
      }, 450)
    },
    [canEditOrigBpm],
  )

  const persistBeatGridOffset = useCallback(
    (offset: number) => {
      persistBeatGridOffsetForTrack(currentTrack ?? undefined, offset, currentTrack?.sonic_dna)
    },
    [currentTrack, persistBeatGridOffsetForTrack],
  )

  const commitBeatGridOffset = useCallback(
    (
      track: Track | null | undefined,
      offsetSec: number,
      opts?: {
        bpm?: number | null
        manual?: boolean
        live?: boolean
        flush?: boolean
        /**
         * CDJ phase-meter jog window (sec). When set, offset wraps into
         * [0, wrapSec) instead of within-beat phase — so side-scroll can
         * shift downbeats across 2/4/8 bars without resetting every beat.
         */
        wrapSec?: number
      },
    ) => {
      if (!track?.id) return null
      const bpm =
        (opts?.bpm && opts.bpm > 0 ? opts.bpm : null) ||
        resolveTrackBpm(track) ||
        120
      const beatSec = 60 / (bpm > 0 ? bpm : 120)
      const wrapSec =
        typeof opts?.wrapSec === 'number' && opts.wrapSec > 0 ? opts.wrapSec : null
      const phase = wrapSec
        ? wrapOffsetSec(offsetSec, wrapSec)
        : toPhaseOnlyOffsetSec(offsetSec, beatSec)
      const manual = opts?.manual !== false
      const nextDna = withGridAnalysisOnDna(track.sonic_dna, {
        offsetSec: phase,
        gridOffsetSec: phase,
        gridManual: manual,
      })
      track.beat_grid_offset = phase
      track.sonic_dna = nextDna
      track.grid_manual = manual
      rememberTapeGrid(track.id, bpm, phase)
      mixGridOffsetCacheRef.current.set(track.id, phase)
      mixGridOffsetSigRef.current.delete(track.id)
      const isLive = opts?.live ?? currentTrack?.id === track.id
      if (isLive) {
        setBeatGridEnabled(true)
        setBeatGridOffsetSec(phase)
        // Keep ref hot for rapid phase-meter wheel events before React re-renders.
        beatGridOffsetSecRef.current = phase
        if (currentTrack && currentTrack.id === track.id) {
          currentTrack.beat_grid_offset = phase
          currentTrack.sonic_dna = nextDna
          currentTrack.grid_manual = manual
        }
      }
      if (onQueueChangeRef.current) {
        onQueueChangeRef.current(
          (queue || []).map((t) =>
            t.id === track.id
              ? { ...t, beat_grid_offset: phase, sonic_dna: nextDna, grid_manual: manual }
              : t,
          ),
        )
      }
      persistBeatGridOffsetForTrack(track, phase, nextDna, {
        immediate: Boolean(opts?.flush),
        gridManual: manual,
      })
      return phase
    },
    [currentTrack, persistBeatGridOffsetForTrack, queue, rememberTapeGrid, resolveTrackBpm],
  )

  const persistGridLock = useCallback(
    async (
      locked: boolean,
      extras?: {
        kickOnsetSec?: number[]
        snareClapOnsetSec?: number[]
        gridLockScore?: number
      },
    ) => {
      if (!currentTrack?.id) return
      const nextDna = withGridLockOnDna(currentTrack.sonic_dna, locked, extras)
      if (!canEditOrigBpm) {
        currentTrack.sonic_dna = nextDna
        return
      }
      try {
        const response = await fetch('/api/audio/update-beat-grid', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            trackId: currentTrack.id,
            offsetSec: beatGridOffsetSec,
            sonicDna: nextDna,
            gridManual: true,
          }),
        })
        if (!response.ok) throw new Error('Failed to persist grid lock')
        const saved = await response.json().catch(() => null)
        const stampedDna = saved?.data?.sonic_dna ?? nextDna
        currentTrack.sonic_dna = stampedDna
        if (onQueueChange) {
          const nextQ = queue.map((t) =>
            t.id === currentTrack.id
              ? { ...t, sonic_dna: stampedDna, beat_grid_offset: beatGridOffsetSec }
              : t,
          )
          onQueueChange(nextQ)
        }
        const syncIds = [
          currentTrack.id,
          saved?.data?.audioFileId,
          ...(Array.isArray(saved?.data?.libraryTrackIds) ? saved.data.libraryTrackIds : []),
        ].filter((id): id is string => typeof id === 'string' && id.length > 0)
        for (const id of [...new Set(syncIds)]) {
          emitCatalogSync({
            entity: 'track',
            entityId: id,
            patch: { beat_grid_offset: beatGridOffsetSec, sonic_dna: stampedDna },
          })
        }
      } catch (e) {
        console.warn('Failed to persist grid lock:', e)
      }
    },
    [currentTrack, beatGridOffsetSec, onQueueChange, queue, canEditOrigBpm],
  )

  const persistGridAnalysis = useCallback(
    async (extras: {
      kickOnsetSec?: number[]
      snareClapOnsetSec?: number[]
      gridLockScore?: number
      gridLocked?: boolean
      offsetSec?: number
    }) => {
      if (!currentTrack?.id) return
      const nextDna = withGridAnalysisOnDna(currentTrack.sonic_dna, extras)
      const offset =
        typeof extras.offsetSec === 'number' ? extras.offsetSec : beatGridOffsetSec
      currentTrack.sonic_dna = nextDna
      currentTrack.beat_grid_offset = offset
      if (onQueueChange) {
        const nextQ = queue.map((t) =>
          t.id === currentTrack.id
            ? { ...t, sonic_dna: nextDna, beat_grid_offset: offset }
            : t,
        )
        onQueueChange(nextQ)
      }
      if (!canEditOrigBpm) return
      try {
        const response = await fetch('/api/audio/update-beat-grid', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            trackId: currentTrack.id,
            offsetSec: offset,
            sonicDna: nextDna,
          }),
        })
        if (!response.ok) throw new Error('Failed to persist grid analysis')
        const saved = await response.json().catch(() => null)
        const stampedDna = saved?.data?.sonic_dna ?? nextDna
        const syncIds = [
          currentTrack.id,
          saved?.data?.audioFileId,
          ...(Array.isArray(saved?.data?.libraryTrackIds) ? saved.data.libraryTrackIds : []),
        ].filter((id): id is string => typeof id === 'string' && id.length > 0)
        for (const id of [...new Set(syncIds)]) {
          emitCatalogSync({
            entity: 'track',
            entityId: id,
            patch: { beat_grid_offset: offset, sonic_dna: stampedDna },
          })
        }
      } catch (e) {
        console.warn('Failed to persist grid analysis:', e)
      }
    },
    [currentTrack, beatGridOffsetSec, onQueueChange, queue, canEditOrigBpm],
  )

  // Restore beat **phase** when the track changes (phrase lattice always from t=0).
  useEffect(() => {
    if (!currentTrack) {
      setBeatGridOffsetSec(0)
      setBeatGridLock(null)
      setBeatGridLocked(false)
      return
    }
    const bpm =
      resolvePlaybackBpm(currentTrack, detectedBPM) ||
      detectedBPM ||
      currentTrack.bpm ||
      120
    const beatSec = 60 / (bpm > 0 ? bpm : 120)
    const stored = currentTrack.beat_grid_offset
    const dnaPhase = readDnaBeatPhaseSec(currentTrack.sonic_dna, beatSec)
    let offset = 0
    if (!isUnsetOffset(stored)) {
      offset = toPhaseOnlyOffsetSec(stored!, beatSec)
    } else if (dnaPhase != null) {
      offset = dnaPhase
    }
    // Fold legacy absolute kick offsets into phase and persist once.
    if (
      typeof stored === 'number' &&
      Number.isFinite(stored) &&
      stored >= beatSec
    ) {
      persistBeatGridOffset(offset)
    } else if (isUnsetOffset(stored) && dnaPhase != null) {
      persistBeatGridOffset(dnaPhase)
    }
    setBeatGridOffsetSec(offset)
    rememberTapeGrid(currentTrack.id, bpm, offset)
    mixGridOffsetCacheRef.current.set(currentTrack.id, offset)
    mixGridOffsetSigRef.current.delete(currentTrack.id)
    const locked = isGridLocked(currentTrack.sonic_dna)
    setBeatGridLocked(locked)
    const score = readGridLockScore(currentTrack.sonic_dna)
    setBeatGridLock(locked && score != null ? score : score)
    const bias = eqBiasFromDna(currentTrack.sonic_dna)
    queueMicrotask(() => {
      const liveDeck: DeckId = playbackDeckRef.current === 'next' ? 'b' : 'a'
      applyDeckStripEq(liveDeck, {
        low: bias.low * 0.5,
        mid: bias.mid * 0.35,
        high: bias.high * 0.35,
      })
    })
  }, [currentTrack?.id, currentTrack?.beat_grid_offset, persistBeatGridOffset, detectedBPM, applyDeckStripEq, rememberTapeGrid])

  const applyPeakVisualLock = useCallback(
    (offsetSec: number, bpm: number) => {
      const base =
        trackWaveformBaseRef.current.length > 0
          ? trackWaveformBaseRef.current
          : waveformData
      if (!base.length || duration <= 0 || !(bpm > 0)) return
      const bundle = buildGridOnsetBundle({
        sonicDna: currentTrack?.sonic_dna,
        peaks: base,
        durationSec: duration,
        bpm,
        offsetSec,
      })
      const onsets = [...bundle.kickOnsetSec, ...bundle.snareClapOnsetSec]
      if (onsets.length < 4) return
      const n = base.length
      const radius = Math.max(1, Math.round(n * 0.0015))
      const boost = 0.32
      const next = base.map((s) => ({ ...s }))
      for (const t of onsets) {
        if (!Number.isFinite(t) || t < 0 || t > duration) continue
        const center = Math.round((t / duration) * (n - 1))
        for (let d = -radius; d <= radius; d++) {
          const i = center + d
          if (i < 0 || i >= n) continue
          const w = 1 - Math.abs(d) / (radius + 1)
          const cur = next[i]!
          const p = Math.min(1, cur.positive + (1 - cur.positive) * boost * w)
          const neg = Math.min(1, cur.negative + (1 - cur.negative) * boost * w * 0.85)
          next[i] = { ...cur, positive: p, negative: neg }
        }
      }
      setWaveformData(next)
    },
    [currentTrack?.sonic_dna, waveformData, duration],
  )

  const alignBeatGridToWaveform = useCallback((opts?: { force?: boolean }) => {
    if (!opts?.force && (isGridManual(currentTrack?.sonic_dna) || currentTrack?.grid_manual === true)) {
      return null
    }
    if (!opts?.force && !isUnsetOffset(currentTrack?.beat_grid_offset)) {
      return null
    }
    const bpm = resolvePlaybackBpm(currentTrack, detectedBPM) || detectedBPM || currentTrack?.bpm
    const peaks =
      trackWaveformBaseRef.current.length > 0
        ? trackWaveformBaseRef.current
        : waveformData
    if (!peaks.length || duration <= 0) return null
    const aligned = resolveTapeAlignedGrid({
      peaks,
      durationSec: duration,
      bpm,
      storedPhaseSec: beatGridOffsetSec,
      beatsPerBar: beatGridBeatsPerBar || 4,
      sonicDna: currentTrack?.sonic_dna,
    })
    if (!aligned) return null
    const beatSec = 60 / aligned.bpm
    const phase = toPhaseOnlyOffsetSec(aligned.offsetSec, beatSec)
    setBeatGridLock(aligned.lock)
    commitBeatGridOffset(currentTrack, phase, {
      bpm: aligned.bpm,
      // User-forced align must stick (gridManual) so auto-align cannot overwrite it.
      manual: Boolean(opts?.force),
      live: true,
    })
    setTapeBpm(aligned.bpm)
    if (typeof bpm !== 'number' || Math.abs(aligned.bpm - bpm) >= 0.05) {
      setDetectedBPM(aligned.bpm)
    }
    setBeatGridEnabled(true)
    applyPeakVisualLock(phase, aligned.bpm)

    const bundle = buildGridOnsetBundle({
      sonicDna: currentTrack?.sonic_dna,
      peaks,
      durationSec: duration,
      bpm: aligned.bpm,
      offsetSec: phase,
    })
    const shouldAutoLock =
      aligned.lock >= AUTO_GRID_LOCK_SCORE && (isAutoDJEnabled || aligned.lock >= 0.7)
    if (shouldAutoLock) {
      setBeatGridLocked(true)
      void persistGridLock(true, {
        kickOnsetSec: bundle.kickOnsetSec.length >= 4 ? bundle.kickOnsetSec : undefined,
        snareClapOnsetSec:
          bundle.snareClapOnsetSec.length >= 4 ? bundle.snareClapOnsetSec : undefined,
        gridLockScore: aligned.lock,
      })
    } else if (aligned.lock >= 0.4 || needsKickRemeasure(currentTrack?.sonic_dna, duration)) {
      void persistGridAnalysis({
        kickOnsetSec: bundle.kickOnsetSec.length >= 4 ? bundle.kickOnsetSec : undefined,
        snareClapOnsetSec:
          bundle.snareClapOnsetSec.length >= 4 ? bundle.snareClapOnsetSec : undefined,
        gridLockScore: aligned.lock,
        offsetSec: phase,
      })
    }
    return { ...aligned, offsetSec: phase }
  }, [
    detectedBPM,
    currentTrack,
    waveformData,
    duration,
    beatGridBeatsPerBar,
    commitBeatGridOffset,
    applyPeakVisualLock,
    isAutoDJEnabled,
    persistGridLock,
    persistGridAnalysis,
    beatGridOffsetSec,
    rememberTapeGrid,
  ])

  // CDJ default: unset catalog phase → sticky 0 ms (downbeat at file t=0).
  // Peak "Align Grid" remains a manual / force action only.
  useEffect(() => {
    if (!currentTrack?.id) return
    if (duration <= 0) return
    if (beatGridLocked) return
    if (isGridManual(currentTrack.sonic_dna) || currentTrack.grid_manual === true) return
    if (!isUnsetOffset(currentTrack.beat_grid_offset)) return
    const peaks = trackWaveformBaseRef.current
    if (peaks.length < 64) return
    const sig = `${currentTrack.id}:zero:${peaks.length}:${Math.round(duration * 100)}`
    if (autoAlignedSigRef.current === sig) return

    const t = window.setTimeout(() => {
      autoAlignedSigRef.current = sig
      const bpm =
        resolvePlaybackBpm(currentTrack, detectedBPM) ||
        detectedBPM ||
        currentTrack.bpm ||
        waveformBpm ||
        120
      commitBeatGridOffset(currentTrack, 0, { bpm, manual: true, live: true })
      setBeatGridEnabled(true)
    }, 180)
    return () => window.clearTimeout(t)
  }, [
    currentTrack?.id,
    currentTrack?.sonic_dna,
    currentTrack?.grid_manual,
    currentTrack?.beat_grid_offset,
    currentTrack?.bpm,
    duration,
    waveformData.length,
    detectedBPM,
    waveformBpm,
    beatGridLocked,
    commitBeatGridOffset,
  ])

  // Reset auto-align gate when the track changes
  useEffect(() => {
    autoAlignedSigRef.current = null
    setTapeBpm(null)
  }, [currentTrack?.id])

  // Revalidate catalog beat-grid phase once per track so session tape cache /
  // lean queue rows without beat_grid_offset cannot keep showing a stale ms value.
  useEffect(() => {
    const track = currentTrack
    if (!track?.id) return
    let cancelled = false
    const trackId = track.id
    ;(async () => {
      try {
        const res = await fetch(
          `/api/music-library/tracks?ids=${encodeURIComponent(trackId)}`,
          { credentials: 'include' },
        )
        if (!res.ok || cancelled) return
        const json = await res.json().catch(() => null)
        const row = Array.isArray(json?.tracks) ? json.tracks[0] : null
        if (!row || cancelled) return
        const catalogOffset = row.beat_grid_offset
        if (isUnsetOffset(catalogOffset)) return
        const bpm =
          resolvePlaybackBpm(track, detectedBPMRef.current) ||
          track.bpm ||
          detectedBPMRef.current ||
          120
        const beatSec = 60 / (bpm > 0 ? bpm : 120)
        const phase = toPhaseOnlyOffsetSec(Number(catalogOffset), beatSec)
        const manual =
          row.grid_manual === true || isGridManual(row.sonic_dna) || isGridManual(track.sonic_dna)
        track.beat_grid_offset = phase
        track.grid_manual = manual || track.grid_manual
        if (row.sonic_dna) track.sonic_dna = row.sonic_dna
        rememberTapeGrid(trackId, bpm, phase)
        mixGridOffsetCacheRef.current.set(trackId, phase)
        mixGridOffsetSigRef.current.delete(trackId)
        if (autoDJCurrentTrackRef.current?.id === trackId) {
          setBeatGridOffsetSec(phase)
        }
        if (onQueueChangeRef.current) {
          onQueueChangeRef.current(
            (queueRef.current || []).map((t) =>
              t.id === trackId
                ? {
                    ...t,
                    beat_grid_offset: phase,
                    grid_manual: manual || t.grid_manual,
                    ...(row.sonic_dna ? { sonic_dna: row.sonic_dna } : {}),
                  }
                : t,
            ),
          )
        }
        setCurrentTrack?.({
          ...track,
          beat_grid_offset: phase,
          grid_manual: manual || track.grid_manual,
          ...(row.sonic_dna ? { sonic_dna: row.sonic_dna } : {}),
        })
      } catch {
        /* ignore — live deck keeps local phase */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [currentTrack?.id, rememberTapeGrid, setCurrentTrack])

  // List/queue rows strip sonic_dna for payload size — hydrate from the dedicated DNA API.
  useEffect(() => {
    const track = currentTrack
    if (!track?.id || track.sonic_dna) return
    let cancelled = false
    const trackId = track.id
    ;(async () => {
      try {
        const params = new URLSearchParams()
        appendSonicDnaLookupParams(params, {
          libraryTrackId: track.id,
          audioFileId: track.audioFileId,
          file: track.file,
          title: track.title,
        })
        const res = await fetch(`/api/audio/sonic-dna?${params.toString()}`, { cache: 'no-store' })
        if (!res.ok || cancelled) return
        const data = await res.json().catch(() => ({}))
        const sonicDna = data?.sonicDNA
        if (!sonicDna || cancelled) return
        track.sonic_dna = sonicDna
        if (typeof data.status === 'string') track.sonic_dna_status = data.status
        if (onQueueChangeRef.current) {
          onQueueChangeRef.current(
            (queueRef.current || []).map((t) =>
              t.id === trackId ? { ...t, sonic_dna: sonicDna, sonic_dna_status: data.status || t.sonic_dna_status } : t,
            ),
          )
        }
        setCurrentTrack?.({
          ...track,
          sonic_dna: sonicDna,
          sonic_dna_status: data.status || track.sonic_dna_status,
        })
      } catch {
        /* ignore — mix features degrade without DNA */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [currentTrack?.id, currentTrack?.sonic_dna, setCurrentTrack])

  const lockBeatGrid = useCallback(() => {
    const bpm = resolvePlaybackBpm(currentTrack, detectedBPM) || detectedBPM || currentTrack?.bpm
    const peaks =
      trackWaveformBaseRef.current.length > 0
        ? trackWaveformBaseRef.current
        : waveformData
    const bundle =
      bpm && bpm > 0 && peaks.length && duration > 0
        ? buildGridOnsetBundle({
            sonicDna: currentTrack?.sonic_dna,
            peaks,
            durationSec: duration,
            bpm,
            offsetSec: beatGridOffsetSec,
          })
        : { kickOnsetSec: [] as number[], snareClapOnsetSec: [] as number[] }
    setBeatGridLocked(true)
    setBeatGridEnabled(true)
    applyPeakVisualLock(beatGridOffsetSec, bpm || 120)
    void persistGridLock(true, {
      kickOnsetSec: bundle.kickOnsetSec.length >= 4 ? bundle.kickOnsetSec : undefined,
      snareClapOnsetSec:
        bundle.snareClapOnsetSec.length >= 4 ? bundle.snareClapOnsetSec : undefined,
      gridLockScore: beatGridLock ?? undefined,
    })
  }, [
    currentTrack,
    detectedBPM,
    waveformData,
    duration,
    beatGridOffsetSec,
    beatGridLock,
    persistGridLock,
    applyPeakVisualLock,
  ])

  const unlockBeatGrid = useCallback(() => {
    setBeatGridLocked(false)
    void persistGridLock(false)
  }, [persistGridLock])

  const persistTrackGridLock = useCallback(
    async (track: Track, extras?: {
      kickOnsetSec?: number[]
      snareClapOnsetSec?: number[]
      gridLockScore?: number
    }) => {
      const nextDna = withGridLockOnDna(track.sonic_dna, true, extras)
      track.sonic_dna = nextDna
      if (!canEditOrigBpm) return
      try {
        await fetch('/api/music-library/tracks', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: track.id,
            beat_grid_offset: track.beat_grid_offset ?? 0,
            sonic_dna: nextDna,
          }),
        })
      } catch (e) {
        console.warn('Failed to persist queued grid lock:', e)
      }
    },
    [canEditOrigBpm],
  )

  const lockQueuedGrids = useCallback(() => {
    if (currentTrack) {
      lockBeatGrid()
    }
    const idx = currentQueueIndex >= 0 ? currentQueueIndex : 0
    const upcoming = queue.slice(idx, idx + 1 + (autoDJConfig.lookahead || 2))
    void Promise.all(
      upcoming
        .filter((t) => t.id !== currentTrack?.id && !isGridLocked(t.sonic_dna))
        .map((t) => persistTrackGridLock(t)),
    ).then(() => {
      if (onQueueChange) {
        onQueueChange(
          queue.map((t) =>
            upcoming.some((u) => u.id === t.id)
              ? { ...t, sonic_dna: withGridLockOnDna(t.sonic_dna, true) }
              : t,
          ),
        )
      }
      setAutoDJStatusMessage('Queued grids locked')
      setAutoDjPickStall(null)
    })
  }, [
    currentTrack,
    lockBeatGrid,
    currentQueueIndex,
    queue,
    autoDJConfig.lookahead,
    persistTrackGridLock,
    onQueueChange,
  ])

  const remeasureKickOnsets = useCallback(() => {
    const targets: Track[] = []
    if (currentTrack) targets.push(currentTrack)
    if (nextQueueTrack && nextQueueTrack.id !== currentTrack?.id) {
      targets.push(nextQueueTrack)
    }
    if (!targets.length) return

    let measured = 0
    for (const track of targets) {
      const bpm =
        resolvePlaybackBpm(track, track.id === currentTrack?.id ? detectedBPM : null) ||
        (track.id === currentTrack?.id ? detectedBPM : null) ||
        track.bpm
      const peaks =
        track.id === currentTrack?.id
          ? trackWaveformBaseRef.current.length > 0
            ? trackWaveformBaseRef.current
            : waveformData
          : ghostSamplesRef.current?.trackId === track.id
            ? ghostSamplesRef.current.samples
            : []
      const dur =
        track.id === currentTrack?.id
          ? duration
          : ghostSamplesRef.current?.trackId === track.id
            ? ghostSamplesRef.current.durationSec
            : track.duration || 0
      const offset =
        track.id === currentTrack?.id
          ? beatGridOffsetSec
          : typeof track.beat_grid_offset === 'number'
            ? track.beat_grid_offset
            : 0
      if (!bpm || bpm <= 0 || !peaks.length || dur <= 0) continue
      const bundle = buildGridOnsetBundle({
        sonicDna: track.sonic_dna,
        peaks,
        durationSec: dur,
        bpm,
        offsetSec: offset,
      })
      if (track.id === currentTrack?.id) {
        void persistGridAnalysis({
          kickOnsetSec: bundle.kickOnsetSec,
          snareClapOnsetSec: bundle.snareClapOnsetSec,
          gridLockScore: beatGridLock ?? undefined,
          offsetSec: beatGridOffsetSec,
        })
        applyPeakVisualLock(beatGridOffsetSec, bpm)
      } else if (bundle.kickOnsetSec.length >= 4) {
        const nextDna = withGridAnalysisOnDna(track.sonic_dna, {
          kickOnsetSec: bundle.kickOnsetSec,
          snareClapOnsetSec:
            bundle.snareClapOnsetSec.length >= 4 ? bundle.snareClapOnsetSec : undefined,
          offsetSec: offset,
        })
        track.sonic_dna = nextDna
        if (onQueueChange) {
          onQueueChange(queue.map((t) => (t.id === track.id ? { ...t, sonic_dna: nextDna } : t)))
        }
      }
      if (bundle.kickOnsetSec.length) measured += bundle.kickOnsetSec.length
    }
    setAutoDjPickStall(null)
    setAutoDJStatusMessage(
      measured
        ? `Remeasured ${measured} kick onsets`
        : 'Need waveform peaks to remeasure kicks',
    )
  }, [
    currentTrack,
    nextQueueTrack,
    detectedBPM,
    waveformData,
    duration,
    beatGridOffsetSec,
    beatGridLock,
    persistGridAnalysis,
    applyPeakVisualLock,
    onQueueChange,
    queue,
  ])

  const mixNowFromCurrentBar = useCallback(() => {
    const next = nextQueueTrack
    if (!next || !currentTrack) {
      setAutoDJStatusMessage('Queue a next track to mix now')
      return
    }
    if (phraseMixLockRef.current || mixEngineRef.current?.isMixing()) return
    const live = getPlaybackAudio()
    const now = live?.currentTime ?? 0
    const plan = lastMixPlanRef.current
    const rate = computeMixIncomingRate(currentTrack, next)
    setAutoDJStatusMessage(`Mix now → “${next.title}”`)
    void startPhraseMix(next, plan?.mixDurationSec ?? 16, rate, plan ? {
      ...plan,
      startAtOutgoingSec: now,
      mixOutMarkerSec: now,
    } : plan)
  }, [nextQueueTrack, currentTrack, startPhraseMix, computeMixIncomingRate, getPlaybackAudio])
  mixNowFromCurrentBarRef.current = mixNowFromCurrentBar

  const previewNextBlend = useCallback(async () => {
    const next = nextQueueTrack
    if (!next) {
      setAutoDJStatusMessage('Queue a next track to preview')
      return
    }
    const engine = ensureMixEngine()
    if (!engine) {
      setAutoDJStatusMessage('Mix engine not ready')
      return
    }
    const rate = currentTrack ? computeMixIncomingRate(currentTrack, next) : 1
    setAutoDJStatusMessage(`Previewing 4 bars → “${next.title}”`)
    const ok = await engine.previewIncoming({ bars: 4, rate })
    setAutoDJStatusMessage(ok ? 'Preview finished' : 'Preview failed — cue incoming first')
  }, [nextQueueTrack, currentTrack, ensureMixEngine, computeMixIncomingRate])

  const snapPlayheadToDna = useCallback(
    (mode: 'kick' | 'beat' | 'phrase') => {
      const bpm = waveformBpm
      const live = getPlaybackAudio()
      if (!bpm || !live) return
      const next = quantizeToDnaGrid({
        timeSec: readLiveMediaTime(),
        bpm,
        offsetSec: beatGridOffsetSec,
        sonicDna: currentTrack?.sonic_dna,
        mode,
        beatsPerBar: beatGridBeatsPerBar || 4,
      })
      seekDeckMediaTime(
        mixEngineRef.current?.getActiveDeck() ??
          (playbackDeckRef.current === 'next' ? 'b' : 'a'),
        next,
      )
      setCurrentTime(next)
    },
    [waveformBpm, beatGridOffsetSec, currentTrack?.sonic_dna, beatGridBeatsPerBar, getPlaybackAudio]
  )

  const applyDnaEqPocket = useCallback(() => {
    const bias = eqBiasFromDna(currentTrack?.sonic_dna)
    const liveDeck: DeckId = playbackDeckRef.current === 'next' ? 'b' : 'a'
    applyDeckStripEq(liveDeck, {
      low: bias.low,
      mid: bias.mid,
      high: bias.high,
    })
  }, [currentTrack?.sonic_dna, applyDeckStripEq])

  const resetBeatGrid = useCallback(() => {
    if (beatGridLocked) return
    // Sticky CDJ zero: downbeat at file t=0 + gridManual so peak auto-align cannot undo it.
    commitBeatGridOffset(currentTrack, 0, { bpm: waveformBpm, manual: true, live: true })
    setBeatGridLock(null)
  }, [beatGridLocked, commitBeatGridOffset, currentTrack, waveformBpm])

  const setBeatHere = useCallback(() => {
    if (beatGridLocked) return
    const bpm = waveformBpm || resolvePlaybackBpm(currentTrack, detectedBPM) || detectedBPM || currentTrack?.bpm
    if (!bpm || bpm <= 0) return
    const beatSec = 60 / bpm
    const next = setDownbeatAt(readLiveMediaTime() || playbackTimeRef.current, beatSec)
    commitBeatGridOffset(currentTrack, next, { bpm, manual: true, live: true })
    setBeatGridLock(null)
  }, [beatGridLocked, currentTrack, detectedBPM, commitBeatGridOffset, waveformBpm, getPlaybackAudio])

  const applyRescannedWaveform = useCallback((
    trackId: string | undefined,
    peaks?: number[],
    envelopes?: Array<{ peak: number; rms: number; low: number; mid: number; high: number }>,
  ) => {
    if (trackId) clearCachedWaveformSamples(trackId)
    if (resolvedUrl) clearPlaybackWaveformCache(resolvedUrl)
    if (currentTrack?.file) clearPlaybackWaveformCache(currentTrack.file)
    processedWaveformTrackRef.current = null
    const matchesCurrent =
      !trackId ||
      trackId === currentTrack?.id ||
      trackId === currentTrack?.audioFileId
    if (matchesCurrent && peaks && peaks.length >= 64) {
      const samples = peaksOrEnvelopesToWaveformSamples(peaks, envelopes)
      if (samples.length) {
        commitTrackWaveform(samples, peaks)
        processedWaveformTrackRef.current = currentTrack
          ? `${currentTrack.id}-${currentTrack.file}`
          : null
        if (currentTrack) {
          setCurrentTrack({ ...currentTrack, waveform_data: peaks })
        }
        return
      }
    }
    setWaveformRescanNonce((n) => n + 1)
  }, [commitTrackWaveform, currentTrack, resolvedUrl, setCurrentTrack])

  const rescanCurrentWaveform = useCallback(async () => {
    const track = currentTrack
    if (!track?.file) return
    const result = await rescanAndPersistWaveform({
      id: track.id,
      file: track.file,
      audioFileId: track.audioFileId,
      title: track.title,
    })
    applyRescannedWaveform(track.id, result.peaks, result.envelopes)
  }, [applyRescannedWaveform, currentTrack])

  // DNA report (library) can drive the same waveform actions via event bridge
  useEffect(() => {
    const onDnaWaveform = (ev: Event) => {
      const detail = (ev as CustomEvent<SonicDnaWaveformEventDetail>).detail
      if (!detail) return
      switch (detail.action) {
        case 'align-grid':
          alignBeatGridToWaveform({ force: true })
          break
        case 'set-beat-here':
          setBeatHere()
          break
        case 'snap':
          snapPlayheadToDna(detail.mode)
          break
        case 'reset-grid':
          resetBeatGrid()
          break
        case 'apply-eq':
          applyDnaEqPocket()
          break
        case 'rescan-waveform':
          applyRescannedWaveform(detail.trackId, detail.peaks, detail.envelopes)
          break
      }
    }
    window.addEventListener(SONIC_DNA_WAVEFORM_EVENT, onDnaWaveform as EventListener)
    return () => window.removeEventListener(SONIC_DNA_WAVEFORM_EVENT, onDnaWaveform as EventListener)
  }, [alignBeatGridToWaveform, snapPlayheadToDna, resetBeatGrid, applyDnaEqPocket, setBeatHere, applyRescannedWaveform])

  waveformDataLengthRef.current = waveformData.length
  if (!waveformGestureRef.current && waveformFlushRafRef.current == null) {
    waveformVisibleBarsRef.current = waveformVisibleBars
    waveformOffsetRef.current = waveformOffset
    waveformPanEnabledRef.current = isWaveformBarZoomed
  }

  const flushWaveformView = useCallback(() => {
    waveformFlushRafRef.current = null
    if (pendingWaveformBarsRef.current != null) {
      setWaveformVisibleBars(pendingWaveformBarsRef.current)
      pendingWaveformBarsRef.current = null
    }
    if (pendingWaveformOffsetRef.current != null) {
      setWaveformOffset(pendingWaveformOffsetRef.current)
      pendingWaveformOffsetRef.current = null
    }
  }, [])

  const scheduleWaveformFlush = useCallback(() => {
    if (waveformFlushRafRef.current != null) return
    waveformFlushRafRef.current = requestAnimationFrame(flushWaveformView)
  }, [flushWaveformView])

  const onWaveformVisibleBarsChange = useCallback(
    (bars: number) => {
      // Stage already applied focal math — sync React state only
      waveformVisibleBarsRef.current = bars
      pendingWaveformBarsRef.current = bars
      waveformPanEnabledRef.current = bars > 0
      scheduleWaveformFlush()
    },
    [scheduleWaveformFlush]
  )

  const onWaveformOffsetChange = useCallback(
    (offset: number) => {
      waveformOffsetRef.current = offset
      pendingWaveformOffsetRef.current = offset
      scheduleWaveformFlush()
    },
    [scheduleWaveformFlush]
  )

  const onIncomingVisibleBarsChange = useCallback((bars: number) => {
    setIncomingVisibleBars(bars)
  }, [])

  const onIncomingOffsetChange = useCallback((offset: number) => {
    setIncomingOffset(offset)
  }, [])

  const onWaveformContextMenu = useCallback(
    (deck: 'a' | 'b', e: React.MouseEvent, timeSec: number | null = null) => {
      e.preventDefault()
      e.stopPropagation()
      setWaveformMenu({
        x: e.clientX,
        y: e.clientY,
        deck,
        timeSec: typeof timeSec === 'number' && Number.isFinite(timeSec) ? timeSec : null,
      })
    },
    [],
  )

  const onPhaseMeterContextMenu = useCallback((deck: 'a' | 'b', e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setWaveformMenu(null)
    setPhaseMeterMenu({ x: e.clientX, y: e.clientY, deck })
  }, [])

  const resolveDeckChannelTrack = useCallback(
    (deck: 'a' | 'b'): Track | null | undefined => trackForQueueDeck(deck),
    [trackForQueueDeck],
  )

  const waveformMenuDeck = waveformMenu?.deck ?? liveDeckId
  const waveformMenuDeckIsLive = waveformMenuDeck === liveDeckId
  const waveformMenuDeckTrack = resolveDeckChannelTrack(waveformMenuDeck)
  const waveformMenuDeckBpm = waveformMenuDeckIsLive
    ? waveformBpm
    : resolveTrackBpm(waveformMenuDeckTrack)
  const phaseMeterMenuDeck = phaseMeterMenu?.deck ?? liveDeckId
  const phaseMeterMenuDeckBpm =
    phaseMeterMenuDeck === liveDeckId
      ? waveformBpm
      : resolveTrackBpm(resolveDeckChannelTrack(phaseMeterMenuDeck))
  const waveformMenuDeckOffsetSec = waveformMenuDeckIsLive
    ? beatGridOffsetSec
    : resolveTrackBeatGridOffset(waveformMenuDeckTrack)

  const nudgeBeatGrid = useCallback(
    (deltaSec: number) => {
      const track = waveformMenuDeckIsLive ? currentTrack : waveformMenuDeckTrack
      const bpm = waveformMenuDeckBpm
      if (!track?.id || !bpm || bpm <= 0 || !Number.isFinite(deltaSec) || deltaSec === 0) return
      const beatSec = 60 / bpm
      const next = nudgeBeatPhaseSec(waveformMenuDeckOffsetSec, deltaSec, beatSec)
      commitBeatGridOffset(track, next, {
        bpm,
        manual: true,
        live: waveformMenuDeckIsLive,
      })
    },
    [
      waveformMenuDeckTrack,
      waveformMenuDeckBpm,
      waveformMenuDeckOffsetSec,
      waveformMenuDeckIsLive,
      currentTrack,
      commitBeatGridOffset,
    ],
  )

  const zeroBeatGrid = useCallback(() => {
    const track = waveformMenuDeckIsLive ? currentTrack : waveformMenuDeckTrack
    if (!track?.id) return
    if (waveformMenuDeckIsLive && beatGridLocked) return
    // Immediate systemic write — do not wait on the nudge debounce.
    commitBeatGridOffset(track, 0, {
      bpm: waveformMenuDeckBpm,
      manual: true,
      live: waveformMenuDeckIsLive,
      flush: true,
    })
    if (waveformMenuDeckIsLive) setBeatGridLock(null)
    if (waveformMenuDeckIsLive && currentTrack?.id === track.id && setCurrentTrack) {
      setCurrentTrack({
        ...currentTrack,
        beat_grid_offset: 0,
        grid_manual: true,
        sonic_dna: track.sonic_dna,
      })
    }
  }, [
    waveformMenuDeckIsLive,
    currentTrack,
    waveformMenuDeckTrack,
    waveformMenuDeckBpm,
    beatGridLocked,
    commitBeatGridOffset,
    setCurrentTrack,
  ])

  const incomingMenuSamples =
    waveformMenuDeckTrack &&
    ((deckWaveformCache[waveformMenuDeck]?.trackId === waveformMenuDeckTrack.id &&
      deckWaveformCache[waveformMenuDeck]!.samples) ||
      (ghostSamplesRef.current?.trackId === waveformMenuDeckTrack.id
        ? ghostSamplesRef.current.samples
        : null))
  const incomingMenuDuration =
    waveformMenuDeckTrack &&
    ((deckWaveformCache[waveformMenuDeck]?.trackId === waveformMenuDeckTrack.id &&
      deckWaveformCache[waveformMenuDeck]!.durationSec) ||
      (ghostSamplesRef.current?.trackId === waveformMenuDeckTrack.id
        ? ghostSamplesRef.current.durationSec
        : waveformMenuDeckTrack.duration) ||
      0)
  const menuDeckReady = Boolean(waveformMenuDeckBpm && waveformMenuDeckTrack)
  const menuVisibleBars = waveformMenuDeckIsLive ? waveformVisibleBars : incomingVisibleBars
  const menuFollow = waveformMenuDeckIsLive ? waveformFollow : incomingFollow

  const setMenuBeatHere = useCallback(() => {
    const track = waveformMenuDeckIsLive ? currentTrack : waveformMenuDeckTrack
    const bpm = waveformMenuDeckBpm
    if (!track || !bpm) return
    const time = waveformMenuDeckIsLive
      ? readLiveMediaTime() || playbackTimeRef.current
      : readDeckMediaTime(waveformMenuDeck)
    commitBeatGridOffset(track, setDownbeatAt(time || 0, 60 / bpm), {
      bpm,
      manual: true,
      live: waveformMenuDeckIsLive,
    })
    if (waveformMenuDeckIsLive) setBeatGridLock(null)
  }, [
    waveformMenuDeckIsLive,
    currentTrack,
    waveformMenuDeckTrack,
    waveformMenuDeckBpm,
    waveformMenuDeck,
    commitBeatGridOffset,
  ])

  /** Prefer selected memory cue; otherwise the right-click waveform time. */
  const resolveMenuAlignPoint = useCallback((): {
    timeSec: number
    source: 'memory' | 'point'
  } | null => {
    const deck = waveformMenu?.deck
    if (!deck) return null
    const track = waveformMenuDeckIsLive ? currentTrack : waveformMenuDeckTrack
    const trackId = track?.id
    if (trackId) {
      const active = idjActiveCues[deck]?.[trackId]
      if (active?.kind === 'memory') {
        const mem = idjMemoryCues[trackId]
        if (typeof mem === 'number' && Number.isFinite(mem) && mem >= 0) {
          return { timeSec: mem, source: 'memory' }
        }
      }
    }
    const clickSec = waveformMenu?.timeSec
    if (typeof clickSec === 'number' && Number.isFinite(clickSec) && clickSec >= 0) {
      return { timeSec: clickSec, source: 'point' }
    }
    return null
  }, [
    waveformMenu,
    waveformMenuDeckIsLive,
    currentTrack,
    waveformMenuDeckTrack,
    idjActiveCues,
    idjMemoryCues,
  ])

  const menuAlignPoint = resolveMenuAlignPoint()

  const alignMenuBeatGridToPoint = useCallback(() => {
    const track = waveformMenuDeckIsLive ? currentTrack : waveformMenuDeckTrack
    const bpm = waveformMenuDeckBpm
    const point = resolveMenuAlignPoint()
    if (!track || !bpm || bpm <= 0 || !point) return
    if (waveformMenuDeckIsLive && beatGridLocked) return
    commitBeatGridOffset(track, setDownbeatAt(point.timeSec, 60 / bpm), {
      bpm,
      manual: true,
      live: waveformMenuDeckIsLive,
    })
    if (waveformMenuDeckIsLive) setBeatGridLock(null)
    setWaveformMenu(null)
  }, [
    waveformMenuDeckIsLive,
    currentTrack,
    waveformMenuDeckTrack,
    waveformMenuDeckBpm,
    resolveMenuAlignPoint,
    beatGridLocked,
    commitBeatGridOffset,
  ])

  const resetMenuBeatGrid = useCallback(() => {
    const track = waveformMenuDeckIsLive ? currentTrack : waveformMenuDeckTrack
    if (!track) return
    if (waveformMenuDeckIsLive && beatGridLocked) return
    commitBeatGridOffset(track, 0, {
      bpm: waveformMenuDeckBpm,
      manual: false,
      live: waveformMenuDeckIsLive,
    })
    if (waveformMenuDeckIsLive) setBeatGridLock(null)
  }, [
    waveformMenuDeckIsLive,
    currentTrack,
    waveformMenuDeckTrack,
    waveformMenuDeckBpm,
    beatGridLocked,
    commitBeatGridOffset,
  ])

  const alignMenuDeckGrid = useCallback(() => {
    if (waveformMenuDeckIsLive) {
      alignBeatGridToWaveform({ force: true })
      return
    }
    const track = waveformMenuDeckTrack
    const peaks = incomingMenuSamples
    const durationSec = Number(incomingMenuDuration) || 0
    if (!track || !peaks || peaks.length < 64 || durationSec <= 0) return
    const aligned = resolveTapeAlignedGrid({
      peaks,
      durationSec,
      bpm: waveformMenuDeckBpm,
      storedPhaseSec: waveformMenuDeckOffsetSec,
      sonicDna: track.sonic_dna,
      beatsPerBar: waveformBeatsPerBar,
    })
    if (!aligned) return
    commitBeatGridOffset(track, aligned.offsetSec, {
      bpm: aligned.bpm,
      manual: true,
      live: false,
    })
  }, [
    waveformMenuDeckIsLive,
    waveformMenuDeckTrack,
    incomingMenuSamples,
    incomingMenuDuration,
    waveformMenuDeckBpm,
    waveformMenuDeckOffsetSec,
    waveformBeatsPerBar,
    alignBeatGridToWaveform,
    commitBeatGridOffset,
  ])

  const snapMenuPlayhead = useCallback(
    (mode: 'kick' | 'beat' | 'phrase') => {
      if (waveformMenuDeckIsLive) {
        snapPlayheadToDna(mode)
        return
      }
      const bpm = waveformMenuDeckBpm
      if (!bpm) return
      const next = quantizeToDnaGrid({
        timeSec: readDeckMediaTime(waveformMenuDeck) || 0,
        bpm,
        offsetSec: waveformMenuDeckOffsetSec,
        sonicDna: waveformMenuDeckTrack?.sonic_dna,
        mode,
        beatsPerBar: waveformBeatsPerBar || 4,
      })
      seekDeckMediaTime(waveformMenuDeck, next)
    },
    [
      waveformMenuDeckIsLive,
      snapPlayheadToDna,
      waveformMenuDeckBpm,
      waveformMenuDeck,
      waveformMenuDeckOffsetSec,
      waveformMenuDeckTrack?.sonic_dna,
      waveformBeatsPerBar,
    ],
  )

  const showDeckChannelWaveforms =
    isExpanded && !isMiniMode && (expandedMode as string) !== 'dj'

  const deckChannelWaveforms = useMemo(() => {
    if (!showDeckChannelWaveforms) return undefined

    const hoverRoot =
      (waveformHost?.closest('[data-waveform-hover-root]') as HTMLElement | null) || waveformHost
    const deckAIsLive = liveDeckId === 'a'
    const deckBIsLive = liveDeckId === 'b'
    const deckATrack = trackForQueueDeck('a')
    const deckBTrack = trackForQueueDeck('b')

    const resolveIdleSamples = (deck: 'a' | 'b', track: Track | null | undefined) => {
      // Stable empty ref — a fresh [] each memo pass retriggers WaveformStage paints.
      const empty = EMPTY_WAVEFORM_SAMPLES
      if (!track?.id) return { samples: empty, durationSec: 0 }
      const cached = deckWaveformCache[deck]
      if (cached?.trackId === track.id) {
        return { samples: cached.samples, durationSec: cached.durationSec }
      }
      const ghost = ghostSamplesRef.current
      if (ghost?.trackId === track.id && ghost.samples.length > 0) {
        return {
          samples: ghost.samples,
          durationSec: ghost.durationSec || track.duration || 180,
        }
      }
      return { samples: empty, durationSec: track.duration || 180 }
    }

    const deckAIdle = deckAIsLive ? null : resolveIdleSamples('a', deckATrack)
    const deckBIdle = deckBIsLive ? null : resolveIdleSamples('b', deckBTrack)
    const deckASamples = deckAIsLive ? waveformData : deckAIdle!.samples
    const deckBSamples = deckBIsLive ? waveformData : deckBIdle!.samples
    const deckADuration = deckAIsLive ? duration || 0 : deckAIdle!.durationSec
    const deckBDuration = deckBIsLive ? duration || 0 : deckBIdle!.durationSec
    const deckABpm = deckAIsLive ? waveformBpm : resolveTrackBpm(deckATrack)
    const deckBBpm = deckBIsLive ? waveformBpm : resolveTrackBpm(deckBTrack)
    const deckAGridOffset = deckAIsLive
      ? beatGridOffsetSec
      : resolveTrackBeatGridOffset(deckATrack)
    const deckBGridOffset = deckBIsLive
      ? beatGridOffsetSec
      : resolveTrackBeatGridOffset(deckBTrack)
    const deckAIntel = withLivePlaybackGrid(
      deckAIsLive ? waveformIntelligenceProfile : profileFromSonicDna(deckATrack?.sonic_dna),
      deckAGridOffset,
      deckABpm,
    )
    const deckBIntel = withLivePlaybackGrid(
      deckBIsLive ? waveformIntelligenceProfile : profileFromSonicDna(deckBTrack?.sonic_dna),
      deckBGridOffset,
      deckBBpm,
    )

    const renderDeckWaveform = (
      deck: 'a' | 'b',
      opts: {
        audioRef: typeof audioRef
        isLive: boolean
        samples: typeof waveformData
        durationSec: number
        bpm: number | null
        beatGridOffsetSec: number
        mediaSyncKey: string
        intelligenceProfile: ReturnType<typeof profileFromSonicDna>
      },
    ) => (
      <WaveformStage
        audioRef={opts.audioRef}
        mediaSyncKey={opts.mediaSyncKey}
        readMediaTime={() => readDeckMediaTime(deck)}
        isPlaying={opts.isLive ? isPlaying : (isIDJEnabled || isAutoDJEnabled) ? idleDeckPlaying : incomingDeckHot}
        samples={opts.samples}
        durationSec={opts.durationSec}
        visibleBars={opts.isLive ? waveformVisibleBars : incomingVisibleBars}
        offsetIndex={opts.isLive ? waveformOffset : incomingOffset}
        follow={opts.isLive ? waveformFollow : incomingFollow}
        mirror={waveformMirror}
        colorMode={waveformMode}
        layerLayout={waveformLayerLayout}
        intelligenceProfile={opts.intelligenceProfile}
        bpm={opts.bpm}
        beatGridEnabled={beatGridEnabled && Boolean(opts.bpm)}
        beatGridOffsetSec={opts.beatGridOffsetSec}
        beatsPerBar={waveformBeatsPerBar}
        snapToGrid={idjConfig.snapToGrid}
        mixOverlay={opts.isLive && isAutoDJEnabled ? waveformMixOverlay : null}
        ghostTape={null}
        hotCues={opts.isLive ? liveWaveformCues : (isIDJEnabled || isAutoDJEnabled) ? idleWaveformCues : []}
        deckId={deck === 'a' ? 'A' : 'B'}
        hoverRoot={undefined}
        gestureActiveRef={waveformGestureRef}
        className={`relative h-full w-full touch-none overflow-hidden ${
          (opts.isLive ? waveformZoom : incomingVisibleBars > 0) ? 'cursor-grab' : 'cursor-pointer'
        } ${!opts.isLive && !incomingDeckHot ? 'opacity-80' : ''}`}
        onVisibleBarsChange={
          opts.isLive ? onWaveformVisibleBarsChange : onIncomingVisibleBarsChange
        }
        onOffsetChange={opts.isLive ? onWaveformOffsetChange : onIncomingOffsetChange}
        onFollowChange={opts.isLive ? setWaveformFollow : setIncomingFollow}
        onSeekSec={
          opts.isLive
            ? snapPlaybackTime
            : incomingDeckHot
              ? (t) => seekDeckMediaTime(deck, t)
              : () => {}
        }
        onCueSec={
          isIDJEnabled || isAutoDJEnabled ? (t) => writeDeckMemoryCue(deck, t) : undefined
        }
        onJumpPlay={
          isIDJEnabled || isAutoDJEnabled ? () => startDeckPlay(deck) : undefined
        }
        seekMediaTime={
          opts.isLive || incomingDeckHot ? (t) => seekDeckMediaTime(deck, t) : undefined
        }
        onContextMenu={(e, timeSec) => onWaveformContextMenu(deck, e, timeSec)}
        showOverview={waveformOverview}
        showPhaseMeter={false}
      />
    )

    return {
      a: renderDeckWaveform('a', {
        audioRef: audioRef,
        isLive: deckAIsLive,
        samples: deckASamples,
        durationSec: deckADuration,
        bpm: deckABpm,
        beatGridOffsetSec: deckAGridOffset,
        mediaSyncKey: deckAIsLive ? waveformMediaSyncKey : 'idle-a',
        intelligenceProfile: deckAIntel,
      }),
      b: renderDeckWaveform('b', {
        audioRef: nextAudioRef,
        isLive: deckBIsLive,
        samples: deckBSamples,
        durationSec: deckBDuration,
        bpm: deckBBpm,
        beatGridOffsetSec: deckBGridOffset,
        mediaSyncKey: deckBIsLive ? waveformMediaSyncKey : 'idle-b',
        intelligenceProfile: deckBIntel,
      }),
    }
  }, [
    showDeckChannelWaveforms,
    waveformHost,
    liveDeckId,
    trackForQueueDeck,
    waveformData,
    deckWaveformCache,
    duration,
    nextQueueTrack,
    currentQueueIndex,
    queue,
    waveformBpm,
    resolveTrackBpm,
    resolveTrackBeatGridOffset,
    currentTrack,
    isPlaying,
    waveformVisibleBars,
    waveformOffset,
    waveformFollow,
    waveformOverview,
    waveformMirror,
    waveformMode,
    waveformLayerLayout,
    waveformIntelligenceProfile,
    beatGridEnabled,
    beatGridOffsetSec,
    idjConfig.snapToGrid,
    waveformBeatsPerBar,
    isAutoDJEnabled,
    incomingDeckHot,
    incomingVisibleBars,
    incomingOffset,
    incomingFollow,
    onIncomingVisibleBarsChange,
    onIncomingOffsetChange,
    waveformMixOverlay,
    waveformGhostTape,
    waveformHotCues,
    waveformZoom,
    waveformMediaSyncKey,
    onWaveformVisibleBarsChange,
    onWaveformOffsetChange,
    snapPlaybackTime,
    onWaveformContextMenu,
    isIDJEnabled,
    idleDeckPlaying,
    liveWaveformCues,
    idleWaveformCues,
    seekDeckMediaTime,
    writeDeckMemoryCue,
    startDeckPlay,
    readDeckMediaTime,
  ])

  /** Stacked A/B phase meters above the mixer crossfader (full chrome width). */
  const readDeckSyncPhaseError = useCallback(
    (deck: 'a' | 'b', selfBpm: number | null, selfOffset: number) => {
      if (!(isIDJEnabled || isAutoDJEnabled) || !selfBpm || selfBpm <= 0) return null
      const peer = deck === 'a' ? 'b' : 'a'
      const peerTrack = trackForQueueDeck(peer)
      const peerBpm = peer === liveDeckId ? waveformBpm : resolveTrackBpm(peerTrack)
      if (!peerBpm || peerBpm <= 0) return null
      const peerEl = peer === 'a' ? audioRef.current : nextAudioRef.current
      if (!peerEl || peerEl.readyState < 1) return null
      const peerOffset =
        peer === liveDeckId ? beatGridOffsetSec : resolveTrackBeatGridOffset(peerTrack)
      const selfTime = readDeckMediaTime(deck)
      const peerTime = readDeckMediaTime(peer)
      const isLive = deck === liveDeckId
      const periodBeats = resolvePhaseMeterWindowBeats(
        phaseMeterOptions.windowId,
        waveformBeatsPerBar || 4,
        phaseMeterOptions.phraseBars,
      )
      if (isLive) {
        return beatPhaseErrorSec({
          outgoingTimeSec: selfTime,
          outgoingBpm: selfBpm,
          outgoingOffsetSec: selfOffset,
          incomingTimeSec: peerTime,
          incomingBpm: peerBpm,
          incomingOffsetSec: peerOffset,
          periodBeats,
        })
      }
      return beatPhaseErrorSec({
        outgoingTimeSec: peerTime,
        outgoingBpm: peerBpm,
        outgoingOffsetSec: peerOffset,
        incomingTimeSec: selfTime,
        incomingBpm: selfBpm,
        incomingOffsetSec: selfOffset,
        periodBeats,
      })
    },
    [
      isIDJEnabled,
      isAutoDJEnabled,
      trackForQueueDeck,
      liveDeckId,
      waveformBpm,
      resolveTrackBpm,
      beatGridOffsetSec,
      resolveTrackBeatGridOffset,
      readDeckMediaTime,
      phaseMeterOptions.windowId,
      phaseMeterOptions.phraseBars,
      waveformBeatsPerBar,
    ],
  )

  const centerPhaseMeterDeck = useCallback(
    (deck: 'a' | 'b') => {
      const isLive = deck === liveDeckId
      const track = isLive ? currentTrack : trackForQueueDeck(deck)
      const bpm = isLive ? waveformBpm : resolveTrackBpm(track)
      if (!track?.id || !bpm || bpm <= 0) return
      const offsetSec = isLive ? beatGridOffsetSecRef.current : resolveTrackBeatGridOffset(track)
      const beatSec = 60 / bpm
      const windowBeats = resolvePhaseMeterWindowBeats(
        phaseMeterOptions.windowId,
        waveformBeatsPerBar || 4,
        phaseMeterOptions.phraseBars,
      )
      const wrapSec = windowBeats * beatSec
      const peerErr = readDeckSyncPhaseError(deck, bpm, offsetSec)
      const errSec =
        typeof peerErr === 'number' && Number.isFinite(peerErr)
          ? peerErr
          : localGridPhaseErrorSec({
              currentTimeSec: readDeckMediaTime(deck),
              bpm,
              offsetSec,
              // Needle stays beat-lock; multi-bar wrap is only for offset storage.
            })
      const polarity: 1 | -1 =
        typeof peerErr === 'number' && Number.isFinite(peerErr) && isLive ? 1 : -1
      const delta = centerPhaseDeltaSec({ errSec, polarity })
      if (!delta) return
      const next = nudgeBeatPhaseSec(offsetSec, delta, beatSec, wrapSec)
      commitBeatGridOffset(track, next, { bpm, manual: true, live: isLive, wrapSec })
    },
    [
      liveDeckId,
      currentTrack,
      trackForQueueDeck,
      waveformBpm,
      resolveTrackBpm,
      resolveTrackBeatGridOffset,
      readDeckSyncPhaseError,
      readDeckMediaTime,
      commitBeatGridOffset,
      phaseMeterOptions.windowId,
      phaseMeterOptions.phraseBars,
      waveformBeatsPerBar,
    ],
  )

  const alignPhaseMeterPlayhead = useCallback(
    (deck: 'a' | 'b') => {
      const mode = phaseMeterOptions.quantize
      if (mode === 'off') return
      const isLive = deck === liveDeckId
      const track = isLive ? currentTrack : trackForQueueDeck(deck)
      const bpm = isLive ? waveformBpm : resolveTrackBpm(track)
      if (!bpm || bpm <= 0) return
      const offsetSec = isLive ? beatGridOffsetSec : resolveTrackBeatGridOffset(track)
      const next = quantizeToDnaGrid({
        timeSec: readDeckMediaTime(deck) || 0,
        bpm,
        offsetSec,
        sonicDna: track?.sonic_dna,
        mode,
        beatsPerBar: waveformBeatsPerBar || 4,
      })
      seekDeckMediaTime(deck, next)
      if (isLive) setCurrentTime(next)
    },
    [
      phaseMeterOptions.quantize,
      liveDeckId,
      currentTrack,
      trackForQueueDeck,
      waveformBpm,
      resolveTrackBpm,
      beatGridOffsetSec,
      resolveTrackBeatGridOffset,
      readDeckMediaTime,
      waveformBeatsPerBar,
      seekDeckMediaTime,
    ],
  )

  const alignBothPhaseMeterPlayheads = useCallback(() => {
    alignPhaseMeterPlayhead('a')
    alignPhaseMeterPlayhead('b')
  }, [alignPhaseMeterPlayhead])

  const deckPhaseMeters = useMemo(() => {
    if (!waveformPhaseMeter || !showDeckChannelWaveforms) return null

    const deckATrack = trackForQueueDeck('a')
    const deckBTrack = trackForQueueDeck('b')
    const deckAIsLive = liveDeckId === 'a'
    const deckBIsLive = liveDeckId === 'b'
    const deckABpm = deckAIsLive ? waveformBpm : resolveTrackBpm(deckATrack)
    const deckBBpm = deckBIsLive ? waveformBpm : resolveTrackBpm(deckBTrack)
    const deckAGridOffset = deckAIsLive
      ? beatGridOffsetSec
      : resolveTrackBeatGridOffset(deckATrack)
    const deckBGridOffset = deckBIsLive
      ? beatGridOffsetSec
      : resolveTrackBeatGridOffset(deckBTrack)

    const makeMeter = (
      deck: 'a' | 'b',
      label: 'A' | 'B',
      bpm: number | null,
      offsetSec: number,
      isLive: boolean,
    ) => (
      <PhaseAlignMeter
        key={deck}
        deckLabel={label}
        bpm={bpm}
        beatsPerBar={waveformBeatsPerBar}
        offsetSec={offsetSec}
        options={phaseMeterOptions}
        readTimeSec={() => readDeckMediaTime(deck)}
        readOffsetSec={() => {
          const track = isLive ? currentTrack : trackForQueueDeck(deck)
          if (isLive) return beatGridOffsetSecRef.current
          return track ? resolveTrackBeatGridOffset(track) : offsetSec
        }}
        readPhaseErrorSec={() => {
          const track = isLive ? currentTrack : trackForQueueDeck(deck)
          const liveOffset = isLive
            ? beatGridOffsetSecRef.current
            : track
              ? resolveTrackBeatGridOffset(track)
              : offsetSec
          return readDeckSyncPhaseError(deck, bpm, liveOffset)
        }}
        nudgePolarity={isLive ? 1 : -1}
        onPhaseNudge={(deltaSec) => {
          const track = isLive ? currentTrack : trackForQueueDeck(deck)
          if (!track?.id || !bpm || bpm <= 0) return
          // Phase-meter jog stays live even when the waveform grid is locked —
          // locking blocks auto/align writes, not the CDJ jog strip.
          const beatSec = 60 / bpm
          const windowBeats = resolvePhaseMeterWindowBeats(
            phaseMeterOptions.windowId,
            waveformBeatsPerBar || 4,
            phaseMeterOptions.phraseBars,
          )
          const wrapSec = windowBeats * beatSec
          // Read live offset (ref / track) so rapid wheel ticks accumulate
          // instead of replaying against a stale useMemo closure.
          const offsetNow = isLive
            ? beatGridOffsetSecRef.current
            : resolveTrackBeatGridOffset(track)
          const next = nudgeBeatPhaseSec(offsetNow, deltaSec, beatSec, wrapSec)
          commitBeatGridOffset(track, next, {
            bpm,
            manual: true,
            live: isLive,
            wrapSec,
          })
        }}
        onAlignPlayhead={() => alignPhaseMeterPlayhead(deck)}
      />
    )

    return (
      <>
        {makeMeter('a', 'A', deckABpm, deckAGridOffset, deckAIsLive)}
        {makeMeter('b', 'B', deckBBpm, deckBGridOffset, deckBIsLive)}
      </>
    )
  }, [
    waveformPhaseMeter,
    showDeckChannelWaveforms,
    liveDeckId,
    trackForQueueDeck,
    waveformBpm,
    resolveTrackBpm,
    resolveTrackBeatGridOffset,
    beatGridOffsetSec,
    waveformBeatsPerBar,
    phaseMeterOptions,
    readDeckSyncPhaseError,
    readDeckMediaTime,
    currentTrack,
    commitBeatGridOffset,
    alignPhaseMeterPlayhead,
  ])

  const markPanEnabled = useCallback((visibleBars: number) => {
    waveformPanEnabledRef.current = visibleBars > 0
  }, [])

  const samplesForVisibleBars = useCallback((visibleBars: number, length: number) => {
    if (length <= 0) return length
    if (visibleBars <= 0) return length
    const dur = audioRef.current?.duration || duration || 0
    const beatSec = waveformBeatDurationSec
    if (dur > 0 && beatSec && beatSec > 0) {
      const spanSec = Math.min(dur, visibleBars * waveformBeatsPerBar * beatSec)
      return Math.max(8, Math.round((spanSec / dur) * length))
    }
    // Fallback without BPM: treat 128 bars as full track
    return Math.max(8, Math.round(length * (visibleBars / 128)))
  }, [duration, waveformBeatDurationSec, waveformBeatsPerBar])

  /** Set absolute visible-bar window (0 = full). Preserves focal time under cursor. */
  const applyVisibleBars = useCallback((nextBars: number, focalRatio = 0.5) => {
    const length = waveformDataLengthRef.current
    const prevBars = waveformVisibleBarsRef.current
    const newBars = nextBars <= 0 ? 0 : nearestBarZoomStep(nextBars)

    if (newBars <= 0 || length <= 0) {
      waveformVisibleBarsRef.current = 0
      waveformOffsetRef.current = 0
      pendingWaveformBarsRef.current = 0
      pendingWaveformOffsetRef.current = 0
      markPanEnabled(0)
      scheduleWaveformFlush()
      return
    }

    const prevVisible = samplesForVisibleBars(prevBars <= 0 ? 0 : prevBars, length)
    const newVisible = samplesForVisibleBars(newBars, length)
    const start = prevBars <= 0 ? 0 : waveformOffsetRef.current
    const focal = Math.max(0, Math.min(1, focalRatio))
    const focalIndex = start + focal * Math.min(prevBars <= 0 ? length : prevVisible, length)
    const newStart = focalIndex - focal * newVisible
    const maxOffset = Math.max(0, length - newVisible)
    const newOffset = Math.max(0, Math.min(maxOffset, newStart))

    waveformVisibleBarsRef.current = newBars
    waveformOffsetRef.current = newOffset
    pendingWaveformBarsRef.current = newBars
    pendingWaveformOffsetRef.current = newOffset
    markPanEnabled(newBars)
    scheduleWaveformFlush()
  }, [markPanEnabled, samplesForVisibleBars, scheduleWaveformFlush])

  /** Legacy name — maps old zoom multipliers onto the bar ladder. */
  const applyWaveformZoom = useCallback((nextZoom: number, focalRatio = 0.5) => {
    if (nextZoom <= 1.04) {
      applyVisibleBars(0, focalRatio)
      return
    }
    // Map legacy zoom into a bar count on the ladder (higher zoom → fewer bars)
    const approxBars = Math.max(4, Math.round(128 / nextZoom))
    const stepped = WAVEFORM_BAR_ZOOM_STEPS.reduce((best, step) =>
      Math.abs(step - approxBars) < Math.abs(best - approxBars) ? step : best
    , WAVEFORM_BAR_ZOOM_STEPS[0])
    applyVisibleBars(stepped, focalRatio)
  }, [applyVisibleBars])

  /** delta > 0 zooms in (fewer bars); delta < 0 zooms out (+8 bar steps toward full). */
  const handleWaveformZoom = useCallback((delta: number) => {
    const prev = waveformVisibleBarsRef.current
    const next = stepVisibleBars(prev, delta > 0 ? 1 : -1)
    applyVisibleBars(next, 0.5)
  }, [applyVisibleBars])

  const applyMenuVisibleBars = useCallback(
    (bars: number, focal = 0.5) => {
      if (waveformMenuDeckIsLive) {
        applyVisibleBars(bars, focal)
        return
      }
      setIncomingVisibleBars(bars <= 0 ? 0 : nearestBarZoomStep(bars))
    },
    [waveformMenuDeckIsLive, applyVisibleBars],
  )

  const handleMenuZoom = useCallback(
    (delta: number) => {
      if (waveformMenuDeckIsLive) {
        handleWaveformZoom(delta)
        return
      }
      setIncomingVisibleBars((prev) => stepVisibleBars(prev, delta > 0 ? 1 : -1))
    },
    [waveformMenuDeckIsLive, handleWaveformZoom],
  )

  const handleWaveformPan = useCallback((delta: number) => {
    if (waveformVisibleBarsRef.current <= 0) return
    const length = waveformDataLengthRef.current
    const visibleCount = samplesForVisibleBars(waveformVisibleBarsRef.current, length)
    const maxOffset = Math.max(0, length - visibleCount)
    const next = Math.max(0, Math.min(maxOffset, waveformOffsetRef.current + delta))
    waveformOffsetRef.current = next
    pendingWaveformOffsetRef.current = next
    setWaveformOffset(next)
  }, [samplesForVisibleBars])

  useEffect(() => {
    if (!waveformMenu) {
      setWaveformMenuSection(null)
      return
    }

    const onPointerDown = (e: PointerEvent) => {
      if (waveformMenuRef.current?.contains(e.target as Node)) return
      setWaveformMenu(null)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setWaveformMenu(null)
    }

    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [waveformMenu])

  useEffect(() => {
    if (!phaseMeterMenu) return

    const onPointerDown = (e: PointerEvent) => {
      if (phaseMeterMenuRef.current?.contains(e.target as Node)) return
      setPhaseMeterMenu(null)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPhaseMeterMenu(null)
    }

    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [phaseMeterMenu])

  // Reset zoom/pan when minimized or not expanded; keep Colorful + Mirror defaults
  useEffect(() => {
    if (waveformHost) return
    if (isMiniMode || !isExpanded) {
      waveformVisibleBarsRef.current = 0
      waveformOffsetRef.current = 0
      waveformPanEnabledRef.current = false
      setWaveformVisibleBars(0)
      setWaveformOffset(0)
      setWaveformFollow(false)
      if (!isMiniMode && !isExpanded && precomputedPeaks && precomputedPeaks.length > 0) {
        const restored = peaksOrEnvelopesToWaveformSamples(precomputedPeaks)
        trackWaveformBaseRef.current = restored
        setWaveformData(restored)
      }
    }
  }, [isMiniMode, isExpanded, precomputedPeaks, waveformHost])

  /** Lets fixed UI (e.g. docked Admin AI) reserve space above this bar. */
  useEffect(() => {
    if (typeof window === 'undefined' || typeof ResizeObserver === 'undefined') return
    const el = playerRef.current
    if (!el) return
    const node = el

    function sync() {
      const h = Math.ceil(node.getBoundingClientRect().height)
      if (h > 0) {
        document.documentElement.style.setProperty('--global-music-player-height', `${h}px`)
      } else {
        document.documentElement.style.removeProperty('--global-music-player-height')
      }
    }

    sync()
    const ro = new ResizeObserver(() => {
      window.requestAnimationFrame(sync)
    })
    ro.observe(el)
    window.addEventListener('resize', sync)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', sync)
      document.documentElement.style.removeProperty('--global-music-player-height')
    }
  }, [currentTrack, isMiniMode, isExpanded, isWaveformCollapsed, isQueueOpen, isSettingsOpen, isMobileControlsOpen])

  const lockBackgroundScroll = Boolean(
    autoDJSettingsMenu ||
      idjSettingsMenu ||
      showTrackDetails ||
      (isSettingsOpen && !isMiniMode) ||
      (isQueueOpen && !isQueueDocked),
  )
  useLockBodyScroll(lockBackgroundScroll)

  const bpmForGrid = waveformBpm
  const beatDurationSec = waveformBeatDurationSec
  // setBeatHere is defined above (useCallback) so DNA bridge + menu share one handler

  if (!currentTrack) {
    return null
  }


  return (
    <div 
      ref={playerRef}
      className={`fixed bottom-0 left-0 right-0 bg-black border-t border-gray-800 z-[9999] transition-[max-height] duration-300 [contain:layout_paint] ${
        isMiniMode ? 'max-sm:h-auto sm:h-16' : 'max-h-[90vh]'
      }`}
    >
      <div
        data-scroll-lock-root=""
        className={
          isMiniMode
            ? ''
            : `max-h-[90vh] overscroll-contain ${lockBackgroundScroll ? 'overflow-hidden' : 'overflow-y-auto'}`
        }
      >
      <audio
        key={`main-audio-${audioElementEpoch}`}
        ref={audioRef}
        preload="metadata"
        crossOrigin="anonymous"
        playsInline
        webkit-playsinline="true"
        x-webkit-airplay="allow"
      />
      <audio
        key={`next-audio-${audioElementEpoch}`}
        ref={nextAudioRef}
        preload="none"
        crossOrigin="anonymous"
        playsInline
        webkit-playsinline="true"
      />
      
      {/* Mini Mode Bar — mobile: two rows, larger touch targets + safe area; sm+: single row */}
      {isMiniMode && (
        <>
          {/* Mobile: seek above title; then artwork/transport chrome */}
          <div className="container mx-auto w-full max-w-full min-w-0 px-3 pt-2 sm:hidden">
            <PlaybackTransportScrubber
              ref={transportMiniMobileRef}
              variant="mini-mobile"
              duration={duration}
              initialTime={currentTime}
              onSeek={seekToTime}
            />
            <p className="mt-1.5 truncate text-center text-sm font-medium leading-snug text-white">
              {currentTrack.title}
            </p>
          </div>
          <div className="container mx-auto w-full max-w-full min-w-0 px-3 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] sm:px-4 sm:py-2 sm:pb-2 sm:pt-2">
          {/* Mobile (< sm): artwork + artist | centered transport | expand */}
          <div className="flex w-full min-w-0 flex-col gap-1.5 sm:hidden">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <div className="flex min-w-0 items-center gap-2.5 justify-self-start">
                {hasPlayerCover && (
                  <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md">
                    <PlayerCoverArt
                      src={coverSrc}
                      mosaicCovers={mosaicCovers}
                      alt={coverAlt}
                      unoptimized={coverUnoptimized}
                      sizes="44px"
                      priority
                      quality={75}
                    />
                  </div>
                )}
                <div className="min-w-0 flex-1 overflow-hidden">
                  <p className="truncate text-xs leading-snug text-gray-400">{currentTrack.artist}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-0.5 justify-self-center">
                <button
                  type="button"
                  onClick={handleSkipToPrevious}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-white transition-colors active:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 touch-manipulation"
                  disabled={queue.length <= 1}
                  aria-label="Previous track"
                >
                  <FaStepBackward className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={togglePlay}
                  className="flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-full bg-white text-black transition-colors active:bg-gray-200 disabled:opacity-50 touch-manipulation"
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                  disabled={isLoading || !!error}
                >
                  {isPlaying ? <FaPause className="h-4 w-4" /> : <FaPlay className="ml-0.5 h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={handleSkipToNext}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-white transition-colors active:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 touch-manipulation"
                  disabled={queue.length <= 1}
                  aria-label="Next track"
                >
                  <FaStepForward className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-center gap-0.5 justify-self-end">
                <button
                  type="button"
                  onClick={() => {
                    setIsMiniMode(false)
                    setIsExpanded(true)
                  }}
                  className="flex h-11 w-[88px] shrink-0 items-center justify-center rounded-lg px-1 py-1 text-gray-400 transition-colors active:bg-white/10 hover:bg-gray-800 hover:text-white touch-manipulation"
                  title="Expand player"
                  aria-label="Expand player"
                >
                  <DjIcon className="h-full w-full" preserveAspectRatio="none" />
                </button>
              </div>
            </div>
          </div>

          {/* Desktop / tablet: single row */}
          <div className="hidden w-full min-w-0 items-center gap-2 sm:flex sm:gap-3">
            {/* Playback controls — left of artwork */}
            <div className="flex shrink-0 items-center gap-1">
              <button
                onClick={toggleShuffle}
                className={`flex min-h-[36px] min-w-[36px] items-center justify-center rounded p-1.5 transition-colors touch-manipulation ${
                  settings.isShuffled ? 'bg-gray-800/40 text-white' : 'text-gray-400 hover:text-white'
                }`}
                title="Shuffle queue order"
                disabled={queue.length <= 1}
                aria-label="Shuffle queue order"
              >
                <FaRandom className="h-3 w-3" />
              </button>
              <button
                onClick={handleSkipToPrevious}
                className="flex min-h-[36px] min-w-[36px] items-center justify-center p-1.5 text-white transition-colors hover:text-gray-300 disabled:cursor-not-allowed disabled:opacity-50 touch-manipulation"
                disabled={queue.length <= 1}
                title="Previous"
                aria-label="Previous track"
              >
                <FaStepBackward className="h-3 w-3" />
              </button>
              <button
                onClick={togglePlay}
                className="flex min-h-[40px] min-w-[40px] shrink-0 items-center justify-center rounded-full bg-white p-2 text-black transition-colors hover:bg-gray-200 disabled:opacity-50 touch-manipulation"
                aria-label={isPlaying ? 'Pause' : 'Play'}
                disabled={isLoading || !!error}
              >
                {isPlaying ? <FaPause className="h-3 w-3" /> : <FaPlay className="ml-0.5 h-3 w-3" />}
              </button>
              <button
                onClick={handleSkipToNext}
                className="flex min-h-[36px] min-w-[36px] items-center justify-center p-1.5 text-white transition-colors hover:text-gray-300 disabled:cursor-not-allowed disabled:opacity-50 touch-manipulation"
                disabled={queue.length <= 1}
                title="Next"
                aria-label="Next track"
              >
                <FaStepForward className="h-3 w-3" />
              </button>
              <button
                onClick={cycleRepeatMode}
                className={`relative flex min-h-[36px] min-w-[36px] items-center justify-center rounded p-1.5 transition-colors touch-manipulation ${
                  settings.repeatMode !== 'off' ? 'bg-gray-800/40 text-white' : 'text-gray-400 hover:text-white'
                }`}
                title={`Repeat: ${settings.repeatMode}`}
                aria-label={`Repeat: ${settings.repeatMode}`}
              >
                <FaRedo className="h-3 w-3" />
                {settings.repeatMode === 'one' && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-blue-500 text-[6px]">1</span>
                )}
                {settings.repeatMode === 'all' && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-blue-500 text-[6px]">∞</span>
                )}
              </button>
            </div>
            {hasPlayerCover && (
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded">
                <PlayerCoverArt
                  src={coverSrc}
                  mosaicCovers={mosaicCovers}
                  alt={coverAlt}
                  unoptimized={coverUnoptimized}
                  sizes="40px"
                  priority
                  quality={75}
                />
              </div>
            )}
            <div className="min-w-0 max-w-[200px] shrink-0 overflow-hidden md:max-w-[240px]">
              <p className="truncate text-xs font-medium text-white">{currentTrack.title}</p>
              <p className="truncate text-xs text-gray-400">{currentTrack.artist}</p>
            </div>
            <PlaybackTransportScrubber
              ref={transportMiniDesktopRef}
              variant="mini-desktop"
              duration={duration}
              initialTime={currentTime}
              onSeek={seekToTime}
            />
            <div className="hidden items-center gap-1.5 md:flex md:shrink-0">
              <button
                onClick={toggleMute}
                className="flex min-h-[40px] min-w-[36px] items-center justify-center text-gray-400 transition-colors hover:text-white touch-manipulation"
                title={settings.isMuted ? 'Unmute' : 'Mute'}
                aria-label={settings.isMuted ? 'Unmute' : 'Mute'}
              >
                {settings.isMuted ? <FaVolumeMute className="h-3.5 w-3.5" /> : <FaVolumeUp className="h-3.5 w-3.5" />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={settings.isMuted ? 0 : settings.volume}
                onChange={(e) => {
                  const newVolume = parseFloat(e.target.value)
                  saveSettings({ volume: newVolume, isMuted: newVolume === 0 })
                  const __live = getPlaybackAudio()
                  if (__live && !phraseMixLockRef.current) {
                    __live.volume = newVolume
                  }
                  mixEngineRef.current?.setMasterVolume(newVolume)
                }}
                className="h-1.5 w-16 cursor-pointer appearance-none rounded-lg touch-manipulation"
                style={{
                  background: `linear-gradient(to right, #fff 0%, #fff ${(settings.isMuted ? 0 : settings.volume) * 100}%, #374151 ${(settings.isMuted ? 0 : settings.volume) * 100}%, #374151 100%)`
                }}
                title="Adjust volume"
                aria-label="Adjust volume"
              />
            </div>
            <button
              onClick={() => {
                setIsMiniMode(false)
                setIsExpanded(true)
              }}
              className="flex h-11 w-[88px] shrink-0 items-center justify-center rounded-lg px-1 py-1 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white touch-manipulation"
              title="Expand player"
              aria-label="Expand player"
            >
              <DjIcon className="h-full w-full" preserveAspectRatio="none" />
            </button>
          </div>
        </div>
        </>
      )}

      {/* Expanded decks / mix session sit above the chrome row when open. */}
      {!isMiniMode && isExpanded && (
        <div className="border-t border-gray-800">
          {expandedMode === 'controls' || !djModeAvailable ? (
            <ExpandedPlayerControls
              decks={expandedDeckChannels}
              deckWaveforms={deckChannelWaveforms}
              phaseMeters={deckPhaseMeters}
              onPhaseMetersContextMenu={onPhaseMeterContextMenu}
              onTapTempo={handleDeckTapTempo}
              onTempoChange={handleDeckTempoChange}
              onChangePlaybackRate={changeDeckPlaybackRate}
              getTempoPercentage={getTempoPercentage}
              getAdjustedBPM={getAdjustedBPM}
              rateToTempoValue={rateToTempoValue}
              onBPMUpdate={handleDeckBPMUpdate}
              canEditOrigBpm={canEditOrigBpm}
              onDeckEqGains={handleDeckEqGains}
              isPlaying={isPlaying}
              isLoading={isLoading}
              error={error}
              canSkip={queue.length > 1}
              onPrevious={handleSkipToPrevious}
              onNext={handleSkipToNext}
              onDeckPrevious={handleDeckPrevious}
              onDeckNext={handleDeckNext}
              onTogglePlay={() => {
                void togglePlay()
              }}
              mixProgress={mixerCrossfadeProgress}
              mixCrossfadeActive={isIDJEnabled || isAutoDJEnabled || crossfadeActive}
              idjActive={isIDJEnabled}
              autoDjActive={isAutoDJEnabled}
              onIdjCrossfade={handleIdjCrossfade}
              autoDjXfUnlocked={autoDjXfUnlocked}
              onUnlockCrossfaderFromAutoDj={unlockCrossfaderFromAutoDj}
              onRelockCrossfaderToAutoDj={relockCrossfaderToAutoDj}
              onSetCue={handleSetDeckCue}
              onClearCue={handleClearDeckCue}
              onLaunchCue={handleLaunchDeckCue}
              deckHotCues={deckHotCues}
              onLaunchDeckHotCue={handleLaunchDeckHotCue}
              onSetDeckHotCue={handleSetDeckHotCue}
              onClearDeckHotCue={handleClearDeckHotCue}
              onClearAllDeckHotCues={handleClearAllDeckHotCues}
              deckMemoryCueSec={deckMemoryCueSec}
              deckTrackCues={deckTrackCues}
              onJumpDeckTrackCue={handleJumpDeckTrackCue}
              deckActiveCues={{
                a: trackForQueueDeck('a')?.id
                  ? idjActiveCues.a[trackForQueueDeck('a')!.id] ?? null
                  : null,
                b: trackForQueueDeck('b')?.id
                  ? idjActiveCues.b[trackForQueueDeck('b')!.id] ?? null
                  : null,
              }}
              onSelectDeckActiveCue={handleSelectDeckActiveCue}
              deckHasCue={{
                a: Boolean(
                  trackForQueueDeck('a')?.id &&
                    idjMemoryCues[trackForQueueDeck('a')!.id] != null,
                ),
                b: Boolean(
                  trackForQueueDeck('b')?.id &&
                    idjMemoryCues[trackForQueueDeck('b')!.id] != null,
                ),
              }}
              deckPlaying={{
                a: liveDeckId === 'a' ? isPlaying : idleDeckPlaying,
                b: liveDeckId === 'b' ? isPlaying : idleDeckPlaying,
              }}
              onToggleDeckPlay={handleToggleDeckPlay}
              deckContinuousPlay={idjConfig.continuousPlay}
              onToggleDeckContinuousPlay={(deck) => {
                patchIDJConfig({
                  continuousPlay: {
                    ...idjConfig.continuousPlay,
                    [deck]: !idjConfig.continuousPlay[deck],
                  },
                })
              }}
              cueJumpPlay={idjConfig.cueJumpPlay}
              onCueDeckLibraryDrop={handleCueDeckLibraryDrop}
            />
          ) : (
            <DJMixerMode
              currentTrack={currentTrack}
              queue={queue}
              onExit={() => setExpandedMode('controls')}
            />
          )}
        </div>
      )}

      {/* Full Player chrome — docks under expanded decks (merged iDJ / AutoDJ / Tap). */}
      {!isMiniMode && expandedMode !== 'dj' && (
        <>
          {/* Waveform above chrome when collapsed (vault Now Playing docks via portal) */}
          {!isExpanded && (() => {
            if (!waveformHost && isWaveformCollapsed) {
              return (
                <button
                  type="button"
                  onClick={() => setIsWaveformCollapsed(false)}
                  className="flex h-7 w-full items-center justify-center gap-1.5 border-b border-gray-700 bg-black/90 text-[10px] font-medium uppercase tracking-wide text-gray-500 transition-colors hover:bg-gray-900 hover:text-gray-300 touch-manipulation"
                  title="Show waveform"
                  aria-label="Show waveform"
                  aria-expanded={false}
                  aria-controls="player-compact-waveform"
                >
                  <FaChevronUp className="h-3 w-3" aria-hidden />
                  Waveform
                </button>
              )
            }

            const hoverRoot =
              (waveformHost?.closest('[data-waveform-hover-root]') as HTMLElement | null) || waveformHost
            const waveformHeightClass = isWaveformDocked
              ? 'h-full w-full'
              : 'h-20 sm:h-24 md:h-32'

            const incomingDeckId: 'a' | 'b' = liveDeckId === 'a' ? 'b' : 'a'
            const incomingTrack = trackForQueueDeck(incomingDeckId) ?? nextQueueTrack
            const incomingCached = incomingTrack
              ? deckWaveformCache[incomingDeckId]
              : undefined
            const incomingGhost =
              incomingTrack && ghostSamplesRef.current?.trackId === incomingTrack.id
                ? ghostSamplesRef.current
                : null
            const incomingCacheHit = Boolean(
              incomingCached && incomingTrack && incomingCached.trackId === incomingTrack.id,
            )
            const incomingSamples = incomingCacheHit
              ? incomingCached.samples
              : incomingGhost?.samples ?? []
            const incomingDuration = incomingCacheHit
              ? incomingCached.durationSec
              : incomingGhost?.durationSec || incomingTrack?.duration || 0
            const showDualDeckBlend =
              isAutoDJEnabled && incomingDeckHot && incomingSamples.length > 0

            const renderWaveformStage = (
              deck: 'a' | 'b',
              opts: {
                audioRef: typeof audioRef
                isLive: boolean
                samples: typeof waveformData
                durationSec: number
                bpm: number | null
                mediaSyncKey: string
                intelligenceProfile?: ReturnType<typeof profileFromSonicDna>
                beatGridOffsetSec?: number
              },
            ) => (
              <WaveformStage
                audioRef={opts.audioRef}
                mediaSyncKey={opts.mediaSyncKey}
                readMediaTime={() => readDeckMediaTime(deck)}
                seekMediaTime={
                  opts.isLive || incomingDeckHot ? (t) => seekDeckMediaTime(deck, t) : undefined
                }
                isPlaying={opts.isLive ? isPlaying : (isIDJEnabled || isAutoDJEnabled) ? idleDeckPlaying : incomingDeckHot}
                samples={opts.samples}
                durationSec={opts.durationSec}
                visibleBars={opts.isLive ? waveformVisibleBars : incomingVisibleBars}
                offsetIndex={opts.isLive ? waveformOffset : incomingOffset}
                follow={opts.isLive ? waveformFollow : incomingFollow}
                mirror={waveformMirror}
                colorMode={waveformMode}
                layerLayout={waveformLayerLayout}
                intelligenceProfile={opts.intelligenceProfile ?? waveformIntelligenceProfile}
                bpm={opts.bpm}
                beatGridEnabled={beatGridEnabled && Boolean(opts.bpm)}
                beatGridOffsetSec={
                  opts.beatGridOffsetSec ??
                  (opts.isLive
                    ? beatGridOffsetSec
                    : resolveTrackBeatGridOffset(incomingTrack ?? currentTrack))
                }
                beatsPerBar={waveformBeatsPerBar}
                snapToGrid={idjConfig.snapToGrid}
                mixOverlay={opts.isLive && isAutoDJEnabled ? waveformMixOverlay : null}
                ghostTape={null}
                hotCues={opts.isLive ? liveWaveformCues : (isIDJEnabled || isAutoDJEnabled) ? idleWaveformCues : []}
                deckId={deck === 'a' ? 'A' : 'B'}
                hoverRoot={hoverRoot}
                gestureActiveRef={waveformGestureRef}
                className={`relative touch-none overflow-hidden ${
                  showDualDeckBlend ? 'h-full w-full' : waveformHeightClass
                } ${
                  opts.isLive && waveformZoom > 1.04 ? 'cursor-grab' : 'cursor-pointer'
                } ${!opts.isLive && !incomingDeckHot ? 'opacity-80' : ''}`}
                onVisibleBarsChange={
                  opts.isLive ? onWaveformVisibleBarsChange : onIncomingVisibleBarsChange
                }
                onOffsetChange={opts.isLive ? onWaveformOffsetChange : onIncomingOffsetChange}
                onFollowChange={opts.isLive ? setWaveformFollow : setIncomingFollow}
                onSeekSec={
                  opts.isLive
                    ? snapPlaybackTime
                    : incomingDeckHot
                      ? (t) => seekDeckMediaTime(deck, t)
                      : () => {}
                }
                onCueSec={
                  isIDJEnabled || isAutoDJEnabled ? (t) => writeDeckMemoryCue(deck, t) : undefined
                }
                onJumpPlay={
                  isIDJEnabled || isAutoDJEnabled ? () => startDeckPlay(deck) : undefined
                }
                onContextMenu={(e, timeSec) => onWaveformContextMenu(deck, e, timeSec)}
                showOverview={false}
                showPhaseMeter={false}
              />
            )

            const outgoingStage = renderWaveformStage(liveDeckId, {
              audioRef: liveAudioRef,
              isLive: true,
              samples: waveformData,
              durationSec: duration || 0,
              bpm: waveformBpm,
              mediaSyncKey: waveformMediaSyncKey,
            })
            const incomingStage =
              showDualDeckBlend && incomingTrack
                ? renderWaveformStage(incomingDeckId, {
                    audioRef: incomingDeckId === 'b' ? nextAudioRef : audioRef,
                    isLive: false,
                    samples: incomingSamples,
                    durationSec: incomingDuration,
                    bpm: resolveTrackBpm(incomingTrack),
                    mediaSyncKey: incomingDeckId === 'b' ? 'idle-b' : 'idle-a',
                    intelligenceProfile: withLivePlaybackGrid(
                      profileFromSonicDna(incomingTrack.sonic_dna),
                      resolveTrackBeatGridOffset(incomingTrack),
                      resolveTrackBpm(incomingTrack),
                    ),
                    beatGridOffsetSec: resolveTrackBeatGridOffset(incomingTrack),
                  })
                : null

            const waveformUi = (
              <div
                id="player-compact-waveform"
                ref={waveformContainerRef}
                className={`h-full w-full min-h-0 ${
                  showDualDeckBlend && !isWaveformDocked
                    ? 'min-h-[10rem] sm:min-h-[12rem] md:min-h-[16rem]'
                    : ''
                }`}
              >
                {showDualDeckBlend && incomingStage ? (
                  <div className="grid h-full min-h-0 grid-rows-2">
                    <div className="min-h-0 border-b border-emerald-500/20">{outgoingStage}</div>
                    <div className="min-h-0 border-t border-sky-500/20">{incomingStage}</div>
                  </div>
                ) : (
                  outgoingStage
                )}
              </div>
            )
            if (waveformHost) {
              return createPortal(waveformUi, waveformHost)
            }
            return (
              <div className="relative w-full bg-black/90 border-b border-gray-700">
                {waveformUi}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setIsWaveformCollapsed(true)
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="absolute right-1.5 top-1.5 z-20 flex h-7 w-7 items-center justify-center rounded-md bg-black/70 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white touch-manipulation"
                  title="Hide waveform"
                  aria-label="Hide waveform"
                  aria-expanded={true}
                  aria-controls="player-compact-waveform"
                >
                  <FaChevronDown className="h-3 w-3" aria-hidden />
                </button>
              </div>
            )
          })()}

          {/* Main Controls */}
          <div
            className={`w-full max-w-none px-3 sm:px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] sm:py-3 ${
              isExpanded ? 'sticky bottom-0 z-20 border-t border-gray-800 bg-black' : ''
            }`}
          >
            {/* Mobile: art + title | centered transport (seek via waveform unless it is collapsed) */}
            <div className="md:hidden">
              {!isExpanded && isWaveformCollapsed && (
                <div className="mb-1.5">
                  <PlaybackTransportScrubber
                    ref={transportMiniMobileRef}
                    variant="mini-mobile"
                    duration={duration}
                    initialTime={currentTime}
                    onSeek={seekToTime}
                  />
                </div>
              )}
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <div className="flex min-w-0 items-center gap-2.5 justify-self-start">
                  {/* Cover art omitted on mobile — deck strips / waveform already show artwork. */}
                  {(isLoading || error) && (
                  <div className="min-w-0 flex-1 overflow-hidden">
                    {isLoading && (
                      <p className="truncate text-[10px] text-gray-500">Loading…</p>
                    )}
                    {error && (
                      <p className="truncate text-[10px] text-red-400">{error}</p>
                    )}
                  </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-0.5 justify-self-center">
                  {isExpanded ? (
                    <div className="flex items-center gap-1">
                      <AutoDJHeaderButton size="compact" />
                      <IDJHeaderButton size="compact" />
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={handleSkipToPrevious}
                        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-white transition-colors active:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 touch-manipulation"
                        disabled={queue.length <= 1}
                        aria-label="Previous track"
                      >
                        <FaStepBackward className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={togglePlay}
                        className="flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-full bg-white text-black transition-colors active:bg-gray-200 disabled:opacity-50 touch-manipulation"
                        aria-label={isPlaying ? 'Pause' : 'Play'}
                        disabled={isLoading || !!error}
                      >
                        {isPlaying ? <FaPause className="h-4 w-4" /> : <FaPlay className="ml-0.5 h-4 w-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={handleSkipToNext}
                        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-white transition-colors active:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 touch-manipulation"
                        disabled={queue.length <= 1}
                        aria-label="Next track"
                      >
                        <FaStepForward className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
                <div className="flex items-center justify-self-end">
                  <button
                    type="button"
                    onClick={() => {
                      if (isExpanded) {
                        setIsExpanded(false)
                        setIsSettingsOpen(false)
                      } else {
                        setIsExpanded(true)
                      }
                    }}
                    className="flex h-11 min-w-[44px] shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors active:bg-white/10 hover:bg-gray-800 hover:text-white touch-manipulation"
                    title={isExpanded ? 'Collapse' : 'Expand'}
                    aria-label={isExpanded ? 'Collapse player' : 'Expand player'}
                    aria-expanded={isExpanded}
                  >
                    <FaChevronDown
                      className={`h-4 w-4 transition-transform duration-300 ${isExpanded ? '' : 'rotate-180'}`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* Desktop / tablet: collapsed = flex row with fluid scrubber; expanded = 3-col grid */}
            <div
              className={`relative hidden w-full md:items-center ${
                isExpanded
                  ? 'md:grid md:grid-cols-[1fr_auto_1fr] md:gap-4'
                  : 'md:flex md:gap-3'
              }`}
            >
              <div
                className={`flex min-w-0 items-center gap-3 ${
                  isExpanded ? 'md:col-start-1' : 'shrink-0'
                }`}
              >
              {isExpanded && (
                <button
                  onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                  className={`flex min-h-[44px] min-w-[44px] items-center justify-center p-2 transition-colors touch-manipulation ${
                    isSettingsOpen ? 'text-white' : 'text-gray-400 hover:text-white'
                  }`}
                  title="Settings"
                >
                  <FaCog />
                </button>
              )}
              {!isExpanded && hasPlayerCover && (
                <button
                  type="button"
                  onClick={() => setShowTrackDetails(!showTrackDetails)}
                  className="relative h-14 w-14 shrink-0 overflow-hidden rounded hover:opacity-80 transition-opacity touch-manipulation"
                  title="View track details"
                  aria-label="View track details"
                >
                  <PlayerCoverArt
                    src={coverSrc}
                    mosaicCovers={mosaicCovers}
                    alt={coverAlt}
                    unoptimized={coverUnoptimized}
                    sizes="56px"
                    priority
                    quality={85}
                  />
                </button>
              )}

              {!isExpanded && (
              <div className="min-w-0 max-w-[220px] shrink-0 lg:max-w-[280px]">
                <p className="truncate text-sm font-medium text-white">{currentTrack.title}</p>
                <p className="truncate text-xs text-gray-400">{currentTrack.artist}</p>
                {(currentTrack.album || currentTrack.folder) && (
                  <p className="truncate text-xs text-gray-500">
                    {currentTrack.album || currentTrack.folder}
                  </p>
                )}
              </div>
              )}

              {isLoading && <div className="text-xs text-gray-400">Loading...</div>}
              {isBuffering && (
                <div className="text-xs text-yellow-400">
                  Buffering... {bufferedProgress > 0 && `${Math.round(bufferedProgress)}%`}
                </div>
              )}
              {error && (
                <div className="text-xs text-red-400">
                  {error}
                  {retryCount < 3 && <span className="ml-2">Retrying...</span>}
                </div>
              )}

              {!isExpanded && (
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleShuffle}
                  className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded p-2 transition-colors touch-manipulation ${
                    settings.isShuffled ? 'bg-gray-800/40 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                  title="Shuffle queue order"
                  disabled={queue.length <= 1}
                >
                  <FaRandom />
                </button>
                <button
                  onClick={handleSkipToPrevious}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center p-2 text-white transition-colors hover:text-gray-300 disabled:cursor-not-allowed disabled:opacity-50 touch-manipulation"
                  disabled={queue.length <= 1}
                  title="Previous"
                >
                  <FaStepBackward />
                </button>
                <button
                  onClick={togglePlay}
                  className="flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-full bg-white p-3 text-black transition-colors hover:bg-gray-200 disabled:opacity-50 touch-manipulation"
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                  disabled={isLoading || !!error}
                >
                  {isPlaying ? <FaPause /> : <FaPlay />}
                </button>
                <button
                  onClick={handleSkipToNext}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center p-2 text-white transition-colors hover:text-gray-300 disabled:cursor-not-allowed disabled:opacity-50 touch-manipulation"
                  disabled={queue.length <= 1}
                  title="Next"
                >
                  <FaStepForward />
                </button>
                <button
                  onClick={cycleRepeatMode}
                  className={`relative flex min-h-[44px] min-w-[44px] items-center justify-center rounded p-2 transition-colors touch-manipulation ${
                    settings.repeatMode !== 'off' ? 'bg-gray-800/40 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                  title={`Repeat: ${settings.repeatMode}`}
                >
                  <FaRedo />
                  {settings.repeatMode === 'one' && (
                    <span className="absolute -right-1 -top-1 flex h-3 w-3 items-center justify-center rounded-full bg-blue-500 text-[8px]">
                      1
                    </span>
                  )}
                  {settings.repeatMode === 'all' && (
                    <span className="absolute -right-1 -top-1 flex h-3 w-3 items-center justify-center rounded-full bg-blue-500 text-[8px]">
                      ∞
                    </span>
                  )}
                </button>
              </div>
              )}

              </div>

              {!isExpanded && (
              <div className="relative min-w-0 flex-1">
                <PlaybackTransportScrubber
                  ref={transportExpandedRef}
                  variant="expanded"
                  duration={duration}
                  initialTime={currentTime}
                  onSeek={seekToTime}
                  onHoverPreview={setSeekPreviewTime}
                />
                {seekPreviewTime !== null && (
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-800/40 px-2 py-1 text-xs text-white">
                    {formatTime(seekPreviewTime)}
                  </div>
                )}
              </div>
              )}

              {isExpanded && (
              <div className="hidden items-center gap-2 justify-self-center md:col-start-2 lg:flex">
                <IDJHeaderButton size="header" />
                <button
                  onClick={toggleShuffle}
                  className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded p-2 transition-colors touch-manipulation ${
                    settings.isShuffled ? 'bg-gray-800/40 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                  title="Shuffle queue order"
                  disabled={queue.length <= 1}
                >
                  <FaRandom />
                </button>
                <button
                  onClick={() => {
                    setIsExpanded(false)
                    setIsSettingsOpen(false)
                  }}
                  className="flex h-11 w-[88px] shrink-0 items-center justify-center rounded-lg px-1 py-1 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white touch-manipulation"
                  title="Collapse"
                  aria-label="Collapse player"
                >
                  <DjIcon
                    className="h-full w-full rotate-180 transition-transform duration-300"
                    preserveAspectRatio="none"
                  />
                </button>
                <button
                  onClick={cycleRepeatMode}
                  className={`relative flex min-h-[44px] min-w-[44px] items-center justify-center rounded p-2 transition-colors touch-manipulation ${
                    settings.repeatMode !== 'off' ? 'bg-gray-800/40 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                  title={`Repeat: ${settings.repeatMode}`}
                >
                  <FaRedo />
                  {settings.repeatMode === 'one' && (
                    <span className="absolute -right-1 -top-1 flex h-3 w-3 items-center justify-center rounded-full bg-blue-500 text-[8px]">
                      1
                    </span>
                  )}
                  {settings.repeatMode === 'all' && (
                    <span className="absolute -right-1 -top-1 flex h-3 w-3 items-center justify-center rounded-full bg-blue-500 text-[8px]">
                      ∞
                    </span>
                  )}
                </button>
                <AutoDJHeaderButton size="header" />
                <MixSessionLog
                  size="header"
                  entries={mixQualityHistory}
                  liveStatus={autoDJStatusMessage || null}
                  headerStatus={
                    isIDJEnabled ? 'iDJ — you mix both decks' : autoDjDeckStatusLine
                  }
                />
              </div>
              )}

              <div
                className={`flex items-center justify-end gap-3 ${
                  isExpanded ? 'md:col-start-3 md:justify-self-end' : 'shrink-0'
                }`}
              >
              {!isExpanded && (
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={toggleMute}
                    className="flex min-h-[44px] min-w-[36px] items-center justify-center text-gray-400 transition-colors hover:text-white touch-manipulation"
                    title={settings.isMuted ? 'Unmute' : 'Mute'}
                    aria-label={settings.isMuted ? 'Unmute' : 'Mute'}
                  >
                    {settings.isMuted ? <FaVolumeMute className="h-4 w-4" /> : <FaVolumeUp className="h-4 w-4" />}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={settings.isMuted ? 0 : settings.volume}
                    onChange={(e) => {
                      const newVolume = parseFloat(e.target.value)
                      saveSettings({ volume: newVolume, isMuted: newVolume === 0 })
                      const __live = getPlaybackAudio()
                      if (__live && !phraseMixLockRef.current) {
                        __live.volume = newVolume
                      }
                      mixEngineRef.current?.setMasterVolume(newVolume)
                    }}
                    className="h-1.5 w-20 cursor-pointer appearance-none rounded-lg touch-manipulation"
                    style={{
                      background: `linear-gradient(to right, #fff 0%, #fff ${(settings.isMuted ? 0 : settings.volume) * 100}%, #374151 ${(settings.isMuted ? 0 : settings.volume) * 100}%, #374151 100%)`,
                    }}
                    title="Adjust volume"
                    aria-label="Adjust volume"
                  />
                </div>
              )}
              {!isExpanded && <AutoDJHeaderButton size="header" />}
              {!isExpanded && (
                <button
                  onClick={() => setIsExpanded(true)}
                  className="hidden h-11 w-[88px] shrink-0 items-center justify-center rounded-lg px-1 py-1 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white touch-manipulation lg:flex"
                  title="Expand"
                  aria-label="Expand player"
                >
                  <DjIcon
                    className="h-full w-full transition-transform duration-300"
                    preserveAspectRatio="none"
                  />
                </button>
              )}
              {!isExpanded && (
              <button
                onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                className={`flex min-h-[44px] min-w-[44px] items-center justify-center p-2 transition-colors touch-manipulation ${
                  isSettingsOpen ? 'text-white' : 'text-gray-400 hover:text-white'
                }`}
                title="Settings"
              >
                <FaCog />
              </button>
              )}

              {djModeAvailable && (
                <button
                  onClick={() => {
                    if (!isExpanded) setIsExpanded(true)
                    setExpandedMode((m) => (m === 'controls' ? 'dj' : 'controls'))
                  }}
                  className={`hidden min-h-[44px] min-w-[44px] items-center justify-center p-2 transition-colors touch-manipulation lg:flex ${
                    (expandedMode as string) === 'dj' ? 'bg-blue-600/30 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                  title={expandedMode === 'controls' ? 'Switch to DJ Mode' : 'Switch to Controls'}
                  aria-label="Toggle DJ Mode"
                >
                  {expandedMode === 'controls' ? '🎛️' : '⚙️'}
                </button>
              )}
              {isExpanded && (
                <button
                  type="button"
                  onClick={handleTapTempo}
                  className={`flex h-[43px] min-w-[2.75rem] items-center justify-center rounded-xl px-3 text-xs font-semibold transition-all active:scale-95 touch-manipulation ${
                    deckUi[liveDeckId].tapTempoTaps.length > 0 ||
                    deckUi[liveDeckId].tapTempoSectionBpms.length > 0
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                  title="Tap 16 beats to measure BPM (does not change playback)"
                >
                  {formatTapTempoButtonLabel({
                    taps: deckUi[liveDeckId].tapTempoTaps,
                    bpm: deckUi[liveDeckId].tapTempoBPM,
                    sectionsCompleted: deckUi[liveDeckId].tapTempoSectionBpms.length,
                  })}
                </button>
              )}
              </div>
            </div>
          </div>

        {/* Queue Panel — docked under vault header when host exists; else above player */}
        {isQueueOpen && typeof document !== 'undefined' && createPortal(
          <div
            data-allow-scroll-when-locked=""
            className={
              isQueueDocked
                ? 'relative flex w-full flex-col overflow-hidden bg-black'
                : 'fixed left-0 right-0 z-[10040] border-t border-gray-800 bg-black pt-3 pb-3 shadow-2xl overscroll-y-contain'
            }
            style={
              isQueueDocked
                ? {
                    height: queueDockHeight,
                    maxHeight:
                      'min(75vh, calc(100dvh - var(--music-lib-chrome-top, 4rem) - var(--global-music-player-height, 5rem) - 4rem))',
                  }
                : {
                    bottom: 'var(--global-music-player-height, 5rem)',
                    maxHeight: 'min(70vh, calc(100vh - var(--global-music-player-height, 5rem) - 0.5rem))',
                  }
            }
            role="dialog"
            aria-label="Playlist queue"
          >
            <div
              className={`${
                isQueueDocked
                  ? 'min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-5 pt-3 pb-2'
                  : 'container mx-auto max-h-full overflow-y-auto px-4'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-white">
                    {`Queue (${queue.length}) · ${upcomingListLabel}`}
                  </h3>
                  {autoDJStatusMessage && (
                    <p
                      data-testid="autodj-status"
                      className="text-[10px] text-emerald-300"
                    >
                      {autoDJStatusMessage}
                    </p>
                  )}
                  <MixQualityHud quality={lastMixQuality} compact />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={primeQueue}
                    className="h-11 min-w-[88px] shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold bg-gray-800 text-gray-200 hover:bg-gray-700 transition-colors touch-manipulation"
                    title="Add upcoming library tracks to the queue (skips the last 35 played)"
                    aria-label="Prime queue"
                  >
                    Prime queue
                  </button>
                  <AutoDJHeaderButton size="compact" />
                  <button
                    type="button"
                    onClick={toggleCatalogRandom}
                    className={`relative flex h-11 min-w-[88px] shrink-0 items-center justify-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors touch-manipulation ${
                      settings.catalogRandom
                        ? 'bg-amber-600/30 text-amber-200'
                        : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                    }`}
                    title={
                      autoDJConfig.enabled
                        ? 'Random on: play crates/EPs in order, then jump to a fresh random release (not the next on the shelf). Catalog/playlists use least-repetition picks. Applies when Auto DJ is off.'
                        : 'Random on: play crates/EPs in order, then jump to a fresh random release (not the next on the shelf). Catalog/playlists avoid the last 35 played tracks.'
                    }
                    aria-label={
                      settings.catalogRandom ? 'Disable catalog random' : 'Enable catalog random'
                    }
                    aria-pressed={settings.catalogRandom}
                  >
                    <FaDice className="h-3 w-3" />
                    Random
                  </button>
                  <button
                    onClick={toggleShuffle}
                    className={`p-2 rounded transition-colors touch-manipulation min-h-[36px] min-w-[36px] flex items-center justify-center ${
                      settings.isShuffled ? 'text-white bg-gray-800/40' : 'text-gray-400 hover:text-white'
                    }`}
                    title="Shuffle queue list order"
                    disabled={queue.length <= 1}
                    aria-label="Shuffle queue order"
                  >
                    <FaRandom className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={cycleRepeatMode}
                    className={`p-2 rounded transition-colors relative touch-manipulation min-h-[36px] min-w-[36px] flex items-center justify-center ${
                      settings.repeatMode !== 'off' ? 'text-white bg-gray-800/40' : 'text-gray-400 hover:text-white'
                    }`}
                    title={`Repeat: ${settings.repeatMode}`}
                    aria-label={`Repeat: ${settings.repeatMode}`}
                  >
                    <FaRedo className="w-3.5 h-3.5" />
                    {settings.repeatMode === 'one' && (
                      <span className="absolute -top-1 -right-1 text-[8px] bg-blue-500 rounded-full w-3 h-3 flex items-center justify-center">1</span>
                    )}
                    {settings.repeatMode === 'all' && (
                      <span className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-blue-500 text-[8px]">∞</span>
                    )}
                  </button>
                  <button
                    onClick={() => setIsQueueOpen(false)}
                    className="text-gray-400 hover:text-white transition-colors p-2 touch-manipulation min-h-[36px] min-w-[36px] flex items-center justify-center"
                    title="Close queue"
                    aria-label="Close queue"
                  >
                    <FaTimes className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {/* Auto DJ settings live in the now-playing Auto DJ right-click menu */}
                            {/* Collapsible Queue Track List */}
              <div
                className={`mt-3 bg-gray-900/70 border rounded-lg transition-colors ${
                  queueLibraryDropActive
                    ? 'border-purple-400/70 ring-1 ring-purple-400/40 bg-purple-950/30'
                    : 'border-gray-800'
                }`}
                onDragEnter={handleQueuePanelDragOver}
                onDragOver={handleQueuePanelDragOver}
                onDragLeave={handleQueuePanelDragLeave}
                onDrop={handleQueuePanelDrop}
              >
                <button
                  onClick={() => setIsTrackListExpanded((prev) => !prev)}
                  className="w-full flex items-center justify-between p-3 hover:bg-gray-800/50 transition-colors rounded-lg"
                >
                  <span className="text-xs uppercase tracking-[0.2em] text-gray-400">
                    {upcomingListLabel} ({displayTracks.length})
                    {canReorderQueue && canAcceptLibraryQueueDrop
                      ? ' · drag to reorder · drop to replace'
                      : canReorderQueue
                        ? ' · drag to reorder'
                        : canAcceptLibraryQueueDrop
                          ? ' · drop library to replace'
                          : ''}
                  </span>
                  <FaChevronDown className={`w-3 h-3 text-gray-400 transition-transform ${isTrackListExpanded ? 'rotate-180' : ''}`} />
                </button>
                {isTrackListExpanded && (
                <div 
                  ref={queueContainerRef}
                  className={`overflow-y-auto border-t border-gray-800/50 ${
                    isQueueDocked ? 'max-h-none' : 'max-h-[min(50vh,24rem)]'
                  }`}
                >
                  {isLoadingSourceTracks ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="text-gray-400 text-sm">Loading tracks...</div>
                    </div>
                  ) : displayTracks.length > 0 ? (
                    <div className="divide-y divide-gray-800/30">
                      {displayTracks.map((track, index) => {
                        const isInQueue = queueTrackIds.has(track.id)
                        const queueIndex = queueIndexMap.get(track.id) ?? -1
                        const isDnaSuggestion = autoDJConfig.enabled && !isInQueue
                        const reorderEnabled = canReorderQueue && isInQueue && queueIndex > currentQueueIndex
                        return (
                          <div key={track.id} className="relative">
                            <QueueItem
                              track={track}
                              index={queueIndex >= 0 ? queueIndex : index}
                              isCurrent={queueIndex === currentQueueIndex}
                              onRemove={queueIndex >= 0 ? handleRemoveFromQueueClick : () => {}}
                              isAutoDJNext={
                                autoDJPendingTrackId === track.id ||
                                (isDnaSuggestion && index === 0)
                              }
                              reorderEnabled={reorderEnabled}
                              dropEnabled={canAcceptLibraryQueueDrop}
                              isDragOver={queueDragOverIndex === index || (queueLibraryDropActive && index === 0)}
                              onDragStart={(e) => handleQueueDragStart(e, index, track.id)}
                              onDragOver={(e) => handleQueueDragOver(e, index)}
                              onDrop={(e) => handleQueueDrop(e, index)}
                              onDragEnd={handleQueueDragEnd}
                            />
                            {isDnaSuggestion && index > 0 && (
                              <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-emerald-400/80">
                                DNA match
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center py-8 px-4">
                      <div className="text-gray-400 text-sm text-center">
                        {queueLibraryDropActive
                          ? 'Drop to replace up next'
                          : autoDJConfig.enabled
                          ? 'No upcoming tracks.'
                          : settings.catalogRandom
                            ? isLoadingSourceTracks
                              ? `Loading ${catalogScopeLabel(currentSource)}…`
                              : isOrderedReleaseRandomScope(currentSource)
                                ? 'Finishing this release in order — next up is a fresh random crate / EP.'
                                : `Picking random tracks from ${catalogScopeLabel(currentSource)}…`
                            : settings.isShuffled
                              ? 'Queue-order shuffle is on — add tracks or turn on Random.'
                              : canAcceptLibraryQueueDrop
                                ? 'No upcoming tracks. Drop library tracks here to set up next.'
                                : 'No upcoming tracks.'}
                      </div>
                    </div>
                  )}
                </div>
                )}
              </div>
            </div>
            {isQueueDocked && (
              <div
                role="separator"
                aria-orientation="horizontal"
                aria-label="Resize queue panel"
                title="Drag to resize"
                onPointerDown={handleQueueDockResizeStart}
                className={`group relative flex h-2.5 shrink-0 cursor-row-resize items-center justify-center border-t touch-none ${
                  isResizingQueueDock
                    ? 'border-purple-400/50 bg-purple-500/25'
                    : 'border-gray-800 hover:border-purple-500/40 hover:bg-purple-500/10'
                }`}
              >
                <span
                  aria-hidden
                  className={`h-0.5 w-10 rounded-full transition-colors ${
                    isResizingQueueDock
                      ? 'bg-purple-300'
                      : 'bg-gray-600 group-hover:bg-purple-400/80'
                  }`}
                />
              </div>
            )}
          </div>,
          queueDockHost ?? document.body
        )}

          {/* Settings Panel */}
          {isSettingsOpen && (
            <div className="container mx-auto px-4 pb-3 border-t border-gray-800 pt-3 bg-black/90 relative z-10">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white">Settings</h3>
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="text-gray-400 hover:text-white transition-colors"
                  title="Close settings"
                >
                  <FaTimes />
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Stream Quality Settings */}
                <div>
                  <label className="text-xs text-gray-400 mb-2 block">
                    Stream Quality: {settings.streamQuality === 'auto' 
                      ? `Auto (${connectionQuality === 'slow' ? 'Standard' : connectionQuality === 'medium' ? 'HD' : 'UHD'})`
                      : settings.streamQuality}
                    {networkEffectiveType && (
                      <span className="ml-2 text-[10px] text-gray-500">
                        ({networkEffectiveType})
                      </span>
                    )}
                  </label>
                  <div className="flex gap-2 mb-2">
                    {(['standard', 'HD', 'UHD', 'auto'] as const).map((quality) => (
                      <button
                        key={quality}
                        onClick={() => saveSettings({ streamQuality: quality })}
                        className={`px-3 py-1.5 rounded text-xs transition-colors ${
                          settings.streamQuality === quality
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-800/40 text-gray-300 hover:bg-gray-700/40'
                        }`}
                        title={
                          quality === 'standard' ? 'Standard quality (faster loading, less buffering)' :
                          quality === 'HD' ? 'HD quality (balanced quality and performance)' :
                          quality === 'UHD' ? 'UHD quality (best audio, may require more buffering)' :
                          'Auto (adapts to connection)'
                        }
                      >
                        {quality}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-500">
                    {settings.streamQuality === 'standard' && 'Standard quality for faster streaming and reduced buffering. Best for slow connections.'}
                    {settings.streamQuality === 'HD' && 'HD quality with balanced performance. Good for most connections.'}
                    {settings.streamQuality === 'UHD' && 'Ultra HD quality for the best audio experience. May require more buffering on slow connections.'}
                    {settings.streamQuality === 'auto' && `Automatically adjusts quality based on your connection (currently: ${connectionQuality === 'slow' ? 'Standard' : connectionQuality === 'medium' ? 'HD' : 'UHD'})`}
                  </p>
                </div>

                {/* Buffer Size Settings */}
                <div>
                  <label className="text-xs text-gray-400 mb-2 block">
                    Buffer Size: {settings.bufferSize === 'auto' 
                      ? `Auto (${connectionQuality === 'slow' ? 'Small' : connectionQuality === 'medium' ? 'Medium' : 'Large'})`
                      : settings.bufferSize.charAt(0).toUpperCase() + settings.bufferSize.slice(1)}
                    {networkEffectiveType && (
                      <span className="ml-2 text-[10px] text-gray-500">
                        ({networkEffectiveType})
                      </span>
                    )}
                  </label>
                  <div className="flex gap-2 mb-2">
                    {(['small', 'medium', 'large', 'auto'] as const).map((size) => (
                      <button
                        key={size}
                        onClick={() => saveSettings({ bufferSize: size })}
                        className={`px-3 py-1.5 rounded text-xs transition-colors ${
                          settings.bufferSize === size
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-800/40 text-gray-300 hover:bg-gray-700/40'
                        }`}
                        title={
                          size === 'small' ? 'Small buffer (saves bandwidth)' :
                          size === 'medium' ? 'Medium buffer (balanced)' :
                          size === 'large' ? 'Large buffer (smooth playback)' :
                          'Auto (adapts to connection)'
                        }
                      >
                        {size.charAt(0).toUpperCase() + size.slice(1)}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-500">
                    {settings.bufferSize === 'small' && 'Minimal buffering, may cause interruptions on slow connections'}
                    {settings.bufferSize === 'medium' && 'Balanced buffering for most connections'}
                    {settings.bufferSize === 'large' && 'Maximum buffering for smooth playback'}
                    {settings.bufferSize === 'auto' && `Automatically adjusts based on your connection (currently: ${connectionQuality})`}
                  </p>
                </div>

                {prefersMediaElementBackgroundPlayback() && (
                  <div className="md:col-span-2">
                    <label className="text-xs text-gray-400 mb-2 block">
                      Background and lock screen playback
                    </label>
                    <div className="flex gap-2 mb-2">
                      <button
                        type="button"
                        onClick={() => saveSettings({ prioritizeBackgroundPlayback: true })}
                        className={`px-3 py-1.5 rounded text-xs transition-colors ${
                          settings.prioritizeBackgroundPlayback
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-800/40 text-gray-300 hover:bg-gray-700/40'
                        }`}
                        title="Keep audio on the native player so music continues when the screen is off"
                      >
                        On (recommended)
                      </button>
                      <button
                        type="button"
                        onClick={() => saveSettings({ prioritizeBackgroundPlayback: false })}
                        className={`px-3 py-1.5 rounded text-xs transition-colors ${
                          !settings.prioritizeBackgroundPlayback
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-800/40 text-gray-300 hover:bg-gray-700/40'
                        }`}
                        title="Enable live spectrum analysis; playback may stop when the screen locks"
                      >
                        Live analyzer
                      </button>
                    </div>
                    <p className="text-[10px] text-gray-500">
                      {settings.prioritizeBackgroundPlayback
                        ? 'Best for listening with the screen off. The real-time spectrum in the expanded player will stay static or use stored waveform data only.'
                        : 'Routes audio through Web Audio for the live spectrum. On many phones, music pauses when the screen locks.'}
                    </p>
                  </div>
                )}

                {/* Keyboard Shortcuts */}
                <div>
                  <button
                    onClick={() => setIsKeyboardShortcutsExpanded(!isKeyboardShortcutsExpanded)}
                    className="flex items-center justify-between w-full text-left mb-2 group"
                    aria-expanded={isKeyboardShortcutsExpanded ? 'true' : 'false'}
                    aria-label="Toggle keyboard shortcuts"
                  >
                    <label className="text-xs text-gray-400 cursor-pointer group-hover:text-gray-300 transition-colors">
                      Keyboard Shortcuts
                    </label>
                    <FaChevronDown
                      className={`text-gray-400 text-xs transition-transform duration-200 ${
                        isKeyboardShortcutsExpanded ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {isKeyboardShortcutsExpanded && (
                    <div className="bg-gray-800/40 rounded-lg p-3 space-y-1.5 text-xs text-gray-300">
                      <div className="flex items-center justify-between">
                        <kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-xs border border-gray-600">Space</kbd>
                        <span>Play/Pause</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex gap-1">
                          <kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-xs border border-gray-600">←</kbd>
                          <kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-xs border border-gray-600">→</kbd>
                        </div>
                        <span>Seek</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex gap-1">
                          <kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-xs border border-gray-600">↑</kbd>
                          <kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-xs border border-gray-600">↓</kbd>
                        </div>
                        <span>Volume</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-xs border border-gray-600">M</kbd>
                        <span>Mute</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-xs border border-gray-600">S</kbd>
                        <span>Shuffle</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-xs border border-gray-600">R</kbd>
                        <span>Repeat</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-xs border border-gray-600">Del</kbd>
                        <span>Remove</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-xs border border-gray-600">Esc</kbd>
                        <span>Clear search</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Waveform Settings */}
                <div>
                  <button
                    onClick={() => setIsWaveformSettingsExpanded(!isWaveformSettingsExpanded)}
                    className="flex items-center justify-between w-full text-left mb-2 group"
                    aria-expanded={isWaveformSettingsExpanded ? 'true' : 'false'}
                    aria-label="Toggle waveform settings"
                  >
                    <label className="text-xs text-gray-400 cursor-pointer group-hover:text-gray-300 transition-colors">
                      Waveform Settings
                    </label>
                    <FaChevronDown
                      className={`text-gray-400 text-xs transition-transform duration-200 ${
                        isWaveformSettingsExpanded ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {isWaveformSettingsExpanded && (
                    <div className="bg-gray-800/40 rounded-lg p-3 space-y-3 text-xs">
                      {/* Waveform Color Mode */}
                      <div>
                        <label className="text-gray-300 mb-2 block">Color Mode</label>
                        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                          {WAVEFORM_COLOR_MODES.map((mode) => (
                            <button
                              key={mode.id}
                              onClick={() => setWaveformMode(mode.id)}
                              className={`px-2 py-1.5 rounded text-[11px] transition-colors ${
                                waveformMode === mode.id
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-gray-700/40 text-gray-300 hover:bg-gray-700/60'
                              }`}
                              title={mode.description}
                            >
                              {mode.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Layer layout — Drums/Elements separated lanes vs classic merged */}
                      <div>
                        <label className="text-gray-300 mb-2 block">Layer display</label>
                        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                          {WAVEFORM_LAYER_LAYOUTS.map((layout) => (
                            <button
                              key={layout.id}
                              onClick={() => setWaveformLayerLayout(layout.id)}
                              className={`px-2 py-1.5 rounded text-[11px] transition-colors ${
                                waveformLayerLayout === layout.id
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-gray-700/40 text-gray-300 hover:bg-gray-700/60'
                              }`}
                              title={layout.description}
                            >
                              {layout.label}
                            </button>
                          ))}
                        </div>
                        <p className="mt-1.5 text-[10px] text-gray-500 leading-snug">
                          Separated / overlay / merged apply to Drums &amp; Elements; other modes stay merged.
                        </p>
                      </div>

                      {/* Mirror Mode */}
                      <div>
                        <label className="text-gray-300 mb-2 block">Mirror Mode</label>
                        <button
                          onClick={() => setWaveformMirror(prev => !prev)}
                          className={`w-full px-3 py-1.5 rounded text-xs transition-colors ${
                            waveformMirror 
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-700/40 text-gray-300 hover:bg-gray-700/60'
                          }`}
                          title={waveformMirror ? "Disable mirror mode (show single waveform)" : "Enable mirror mode (show mirrored waveform)"}
                        >
                          {waveformMirror ? '🪞 Mirror Enabled' : '📊 Single Waveform'}
                        </button>
                      </div>

                      {/* Zoom Controls — musical bar windows */}
                      <div>
                        <label className="text-gray-300 mb-2 block">
                          Zoom: {waveformVisibleBars <= 0 ? 'Full track' : `${Math.round(waveformVisibleBars)} bars`}
                        </label>
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => handleWaveformZoom(-1)}
                            className="px-3 py-1.5 bg-gray-700/40 text-gray-300 hover:bg-gray-700/60 rounded text-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Zoom out (+bars toward full track)"
                            disabled={waveformVisibleBars <= 0}
                          >
                            −
                          </button>
                          <button
                            onClick={() => applyVisibleBars(0, 0.5)}
                            className="px-3 py-1.5 bg-gray-700/40 text-gray-300 hover:bg-gray-700/60 rounded text-xs transition-colors"
                            title="Fit full waveform"
                          >
                            Full
                          </button>
                          <button
                            onClick={() => handleWaveformZoom(1)}
                            className="px-3 py-1.5 bg-gray-700/40 text-gray-300 hover:bg-gray-700/60 rounded text-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Zoom in (fewer bars)"
                            disabled={waveformVisibleBars === WAVEFORM_BAR_ZOOM_STEPS[0]}
                          >
                            +
                          </button>
                        </div>
                        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                          {[4, 8, 16].map((bars) => (
                            <button
                              key={bars}
                              type="button"
                              onClick={() => applyVisibleBars(bars, 0.5)}
                              className={`px-2.5 py-1 rounded text-[11px] transition-colors ${
                                waveformVisibleBars === bars
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-gray-700/40 text-gray-300 hover:bg-gray-700/60'
                              }`}
                              title={`Show ${bars} bars`}
                            >
                              {bars}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Speed Control */}
                      <div>
                        <label className="text-gray-300 mb-2 block">Speed: {waveformSpeed.toFixed(2)}x</label>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setWaveformSpeed(prev => Math.max(0.25, prev - 0.25))}
                            className="px-3 py-1.5 bg-gray-700/40 text-gray-300 hover:bg-gray-700/60 rounded text-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Decrease speed"
                            disabled={waveformSpeed <= 0.25}
                          >
                            −
                          </button>
                          <button
                            onClick={() => setWaveformSpeed(1.0)}
                            className="px-3 py-1.5 bg-gray-700/40 text-gray-300 hover:bg-gray-700/60 rounded text-xs transition-colors"
                            title="Reset to 1x"
                          >
                            Reset
                          </button>
                          <button
                            onClick={() => setWaveformSpeed(prev => Math.min(4.0, prev + 0.25))}
                            className="px-3 py-1.5 bg-gray-700/40 text-gray-300 hover:bg-gray-700/60 rounded text-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Increase speed"
                            disabled={waveformSpeed >= 4.0}
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* Horizontal Zoom */}
                      <div>
                        <label className="text-gray-300 mb-2 block">Horizontal Zoom: {waveformHorizontalZoom.toFixed(2)}x</label>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setWaveformHorizontalZoom(prev => Math.max(0.1, prev - 0.1))}
                            className="px-3 py-1.5 bg-gray-700/40 text-gray-300 hover:bg-gray-700/60 rounded text-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Zoom out horizontally"
                            disabled={waveformHorizontalZoom <= 0.1}
                          >
                            −
                          </button>
                          <button
                            onClick={() => setWaveformHorizontalZoom(1.0)}
                            className="px-3 py-1.5 bg-gray-700/40 text-gray-300 hover:bg-gray-700/60 rounded text-xs transition-colors"
                            title="Reset horizontal zoom"
                          >
                            Reset
                          </button>
                          <button
                            onClick={() => setWaveformHorizontalZoom(prev => Math.min(8.0, prev + 0.1))}
                            className="px-3 py-1.5 bg-gray-700/40 text-gray-300 hover:bg-gray-700/60 rounded text-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Zoom in horizontally"
                            disabled={waveformHorizontalZoom >= 8.0}
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* Follow Mode */}
                      {waveformVisibleBars > 0 && (
                        <div>
                          <label className="text-gray-300 mb-2 block">Follow Mode</label>
                          <button
                            onClick={() => setWaveformFollow(prev => !prev)}
                            className={`w-full px-3 py-1.5 rounded text-xs transition-colors ${
                              waveformFollow 
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-700/40 text-gray-300 hover:bg-gray-700/60'
                            }`}
                            title={waveformFollow ? "Disable follow mode" : "Enable follow mode - keep playhead centered"}
                          >
                            {waveformFollow ? '📍 Follow Enabled' : '📍 Follow Disabled'}
                          </button>
                          {!waveformFollow && (
                            <div className="flex items-center gap-2 mt-2">
                              <button
                                onClick={() => handleWaveformPan(-waveformData.length * 0.1)}
                                className="px-3 py-1.5 bg-gray-700/40 text-gray-300 hover:bg-gray-700/60 rounded text-xs transition-colors"
                                title="Pan left"
                              >
                                ← Pan Left
                              </button>
                              <button
                                onClick={() => handleWaveformPan(waveformData.length * 0.1)}
                                className="px-3 py-1.5 bg-gray-700/40 text-gray-300 hover:bg-gray-700/60 rounded text-xs transition-colors"
                                title="Pan right"
                              >
                                Pan Right →
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Beat Grid */}
                      <div>
                        <label className="text-gray-300 mb-2 block">
                          Beat Grid {bpmForGrid ? `(${Number(bpmForGrid.toFixed(2))} BPM)` : '(no BPM)'}
                        </label>

                        <div className="flex gap-2 flex-wrap">
                          <button
                            onClick={() => {
                              setBeatGridEnabled((v) => {
                                const next = !v
                                if (next && beatGridOffsetSec === 0) {
                                  // Defer so state toggle isn't blocked by align work
                                  queueMicrotask(() => alignBeatGridToWaveform())
                                }
                                return next
                              })
                            }}
                            className={`px-3 py-1.5 rounded text-xs transition-colors ${
                              beatGridEnabled ? 'bg-blue-600 text-white' : 'bg-gray-700/40 text-gray-300 hover:bg-gray-700/60'
                            }`}
                            disabled={!bpmForGrid}
                            title="Toggle beat grid"
                          >
                            {beatGridEnabled ? 'Beat Grid: ON' : 'Beat Grid: OFF'}
                          </button>

                          <button
                            onClick={setBeatHere}
                            className="px-3 py-1.5 rounded text-xs bg-gray-700/40 text-gray-300 hover:bg-gray-700/60 transition-colors disabled:opacity-40"
                            disabled={!bpmForGrid || beatGridLocked}
                            title="Set downbeat at the playhead (phrase starts here)"
                          >
                            Set Downbeat Here
                          </button>

                          <button
                            onClick={() => {
                              if (beatGridLocked) unlockBeatGrid()
                              else lockBeatGrid()
                            }}
                            className={`px-3 py-1.5 rounded text-xs transition-colors disabled:opacity-40 ${
                              beatGridLocked
                                ? 'bg-emerald-700/80 text-white'
                                : 'bg-gray-700/40 text-gray-300 hover:bg-gray-700/60'
                            }`}
                            disabled={!bpmForGrid}
                            title={
                              beatGridLocked
                                ? 'Unlock beat grid (allow re-align)'
                                : 'Verify & lock beat grid + kick onsets for Auto DJ'
                            }
                          >
                            {beatGridLocked ? 'Grid: LOCKED' : 'Lock Grid'}
                          </button>

                          <div className="flex items-center gap-2 ml-auto">
                            <span className="text-[10px] text-gray-500">Beats/Bar</span>
                            <select
                              value={beatGridBeatsPerBar}
                              onChange={(e) => setBeatGridBeatsPerBar(parseInt(e.target.value, 10))}
                              className="bg-gray-800 border border-gray-700 rounded text-xs text-gray-200 px-2 py-1"
                              disabled={beatGridLocked}
                            >
                              <option value={3}>3</option>
                              <option value={4}>4</option>
                            </select>
                          </div>
                        </div>

                        {bpmForGrid && (
                          <div className="text-[10px] text-gray-500 mt-1">
                            Downbeat: {beatGridOffsetSec.toFixed(3)}s
                            {beatGridLock != null ? ` · lock ${(beatGridLock * 100).toFixed(0)}%` : ''}
                            {beatGridLocked ? ' · verified' : ''}
                            {' · '}bars / 8-bar phrases / 16-bar sections
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Mobile Controls Panel */}
          {isMobileControlsOpen && (
            <div className="md:hidden container mx-auto px-3 sm:px-4 pb-3 border-t border-gray-800 pt-3">
              <div className="flex items-center justify-center gap-3 sm:gap-4 mb-3">
                <button
                  onClick={handleSkipToPrevious}
                  className="p-2.5 text-white hover:text-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
                  disabled={queue.length <= 1}
                  title="Previous"
                >
                  <FaStepBackward className="w-4 h-4" />
                </button>
                <button
                  onClick={toggleShuffle}
                  className={`p-2.5 rounded transition-colors touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center ${
                    settings.isShuffled ? 'text-white bg-gray-800/40' : 'text-gray-400 hover:text-white'
                  }`}
                  title="Shuffle queue order"
                  disabled={queue.length <= 1}
                >
                  <FaRandom className="w-4 h-4" />
                </button>
                <button
                  onClick={handleSkipToNext}
                  className="p-2.5 text-white hover:text-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
                  disabled={queue.length <= 1}
                  title="Next"
                >
                  <FaStepForward className="w-4 h-4" />
                </button>
                <button
                  onClick={cycleRepeatMode}
                  className={`p-2.5 rounded transition-colors relative touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center ${
                    settings.repeatMode !== 'off' ? 'text-white bg-gray-800/40' : 'text-gray-400 hover:text-white'
                  }`}
                  title={`Repeat: ${settings.repeatMode}`}
                >
                  <FaRedo className="w-4 h-4" />
                  {settings.repeatMode === 'one' && (
                    <span className="absolute -top-1 -right-1 text-[8px] bg-blue-500 rounded-full w-3 h-3 flex items-center justify-center">1</span>
                  )}
                  {settings.repeatMode === 'all' && (
                    <span className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-blue-500 text-[8px]">∞</span>
                  )}
                </button>
                <AutoDJHeaderButton size="compact" />
              </div>
              {/* Volume Control - always visible in mobile panel */}
              {!isExpanded && (
                <div className="flex items-center justify-center gap-3 mt-1">
                  <button
                    onClick={toggleMute}
                    className={`touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors ${
                      settings.isMuted ? 'text-white' : 'text-gray-400 hover:text-white'
                    }`}
                    title={settings.isMuted ? 'Unmute' : 'Mute'}
                    aria-label={settings.isMuted ? 'Unmute' : 'Mute'}
                  >
                    {settings.isMuted ? <FaVolumeMute className="w-5 h-5" /> : <FaVolumeUp className="w-5 h-5" />}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={settings.isMuted ? 0 : settings.volume}
                    onChange={(e) => {
                      const newVolume = parseFloat(e.target.value)
                      saveSettings({ volume: newVolume, isMuted: newVolume === 0 })
                      const __live = getPlaybackAudio()
                      if (__live && !phraseMixLockRef.current) {
                        __live.volume = newVolume
                      }
                      mixEngineRef.current?.setMasterVolume(newVolume)
                    }}
                    className="flex-1 max-w-[200px] h-2 rounded-lg appearance-none cursor-pointer touch-manipulation"
                    style={{
                      background: `linear-gradient(to right, #fff 0%, #fff ${(settings.isMuted ? 0 : settings.volume) * 100}%, #374151 ${(settings.isMuted ? 0 : settings.volume) * 100}%, #374151 100%)`
                    }}
                    title="Adjust volume"
                    aria-label="Adjust volume"
                  />
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Auto DJ settings — always available from mini bar / vault header (not only expanded chrome) */}
      {autoDJSettingsMenu && typeof document !== 'undefined' && createPortal(
        <div
          ref={autoDJMenuClamp.ref}
          {...autoDJMenuClamp.rootProps}
          data-auto-dj-settings-menu=""
          data-allow-scroll-when-locked=""
          className="fixed w-[min(28rem,calc(100vw-1rem))] overflow-y-auto overscroll-y-contain rounded-lg border border-gray-700 bg-gray-950 shadow-2xl"
          style={autoDJMenuClamp.style}
          role="dialog"
          aria-label="Auto DJ settings"
          onContextMenu={(e) => e.preventDefault()}
        >
              <PopupMenuDragHeader
                title={
                  <span className="flex items-center gap-2">
                    <span>Auto DJ Settings</span>
                    {autoDJConfig.enabled && (
                      <span className="px-1.5 py-0.5 text-[9px] normal-case tracking-normal bg-emerald-600/30 text-emerald-400 rounded">
                        ON
                      </span>
                    )}
                  </span>
                }
                headerProps={{
                  ...autoDJMenuClamp.headerProps,
                  className: `${autoDJMenuClamp.headerProps.className} bg-gray-950`,
                }}
                trailing={
                  <button
                    type="button"
                    data-no-drag=""
                    onClick={closeAutoDJSettingsMenu}
                    className="flex min-h-[32px] min-w-[32px] items-center justify-center text-gray-400 hover:text-white"
                    aria-label="Close Auto DJ settings"
                  >
                    <FaTimes className="h-3 w-3" />
                  </button>
                }
              />
              <div className="px-3 pb-3 pt-2">
                <AutoDJSettingsPanel
                  config={autoDJConfig}
                  leadIn={autoDJLeadIn}
                  suggestedLeadIn={autoDJSuggestedLeadIn}
                  fanUserId={fanUserId}
                  saving={autoDJSaving}
                  dirty={autoDJDirty}
                  statusMessage={autoDJStatusMessage}
                  lastMixQuality={lastMixQuality}
                  mixQualityHistory={mixQualityHistory}
                  onMixQualityHistoryChange={setMixQualityHistory}
                  pairWhy={autoDjPairInsight.why}
                  beatSyncUnsafe={autoDjPairInsight.beatSyncUnsafe}
                  pickStall={autoDjPickStall}
                  mixActionsDisabled={!nextQueueTrack || crossfadeActive}
                  onMixNow={mixNowFromCurrentBar}
                  onPreviewBlend={() => { void previewNextBlend() }}
                  onLockQueuedGrids={lockQueuedGrids}
                  onRemeasureKicks={remeasureKickOnsets}
                  onTempoSyncPair={() => {
                    patchAutoDJConfig({ syncMode: 'tempo-sync' })
                    setAutoDjPickStall(null)
                    setAutoDJStatusMessage('TempoSync this pair — BeatSync stall cleared')
                  }}
                  onPatch={patchAutoDJConfig}
                  onLeadIn={(value) => {
                    setAutoDJLeadIn(value)
                    setAutoDJDirty(true)
                  }}
                  onSave={() => { void saveAutoDJToAccount() }}
                  onReset={resetAutoDJToDefaults}
                />
              </div>
        </div>,
        document.body,
      )}

      {idjSettingsMenu && typeof document !== 'undefined' && createPortal(
        <div
          ref={idjMenuClamp.ref}
          {...idjMenuClamp.rootProps}
          data-idj-settings-menu=""
          data-allow-scroll-when-locked=""
          className="fixed w-[min(18rem,calc(100vw-1rem))] overflow-y-auto overscroll-y-contain rounded-lg border border-gray-700 bg-gray-950 shadow-2xl"
          style={idjMenuClamp.style}
          role="dialog"
          aria-label="iDJ settings"
          onContextMenu={(e) => e.preventDefault()}
        >
          <PopupMenuDragHeader
            title={
              <span className="flex items-center gap-2">
                <span>iDJ Settings</span>
                {isIDJEnabled && (
                  <span className="rounded bg-violet-600/30 px-1.5 py-0.5 text-[9px] normal-case tracking-normal text-violet-300">
                    ON
                  </span>
                )}
              </span>
            }
            headerProps={{
              ...idjMenuClamp.headerProps,
              className: `${idjMenuClamp.headerProps.className} bg-gray-950`,
            }}
            trailing={
              <button
                type="button"
                data-no-drag=""
                onClick={closeIDJSettingsMenu}
                className="flex min-h-[32px] min-w-[32px] items-center justify-center text-gray-400 hover:text-white"
                aria-label="Close iDJ settings"
              >
                <FaTimes className="h-3 w-3" />
              </button>
            }
          />
          <div className="px-3 pb-3 pt-2">
            <IDJSettingsPanel
              config={idjConfig}
              onPatch={patchIDJConfig}
              onCenterCrossfader={() => {
                setIdjCrossfade(0.5)
                mixEngineRef.current?.setManualCrossfade(0.5)
              }}
              onResetEq={() => {
                applyDeckStripEq('a', { low: 0, mid: 0, high: 0 }, { instant: true })
                applyDeckStripEq('b', { low: 0, mid: 0, high: 0 }, { instant: true })
              }}
            />
          </div>
        </div>,
        document.body,
      )}

      {/* Track Details Modal — portaled so player contain/overflow cannot pin it off-screen */}
      {showTrackDetails && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[15000] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowTrackDetails(false)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="track-details-title"
            className="max-h-[min(85vh,calc(100dvh-2rem))] w-full max-w-md overflow-y-auto overscroll-y-contain rounded-lg border border-gray-800 bg-black/90 p-6 shadow-2xl"
            data-allow-scroll-when-locked=""
            data-track-details-modal=""
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 id="track-details-title" className="text-lg font-semibold text-white">Track Details</h3>
              <button
                onClick={() => setShowTrackDetails(false)}
                className="text-gray-400 hover:text-white transition-colors touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
                title="Close track details"
                aria-label="Close track details"
              >
                <FaTimes />
              </button>
            </div>
            {hasPlayerCover && (
              <div className="relative w-full h-64 rounded-lg overflow-hidden mb-4">
                <PlayerCoverArt
                  src={coverSrc}
                  mosaicCovers={mosaicCovers}
                  alt={coverAlt}
                  unoptimized={coverUnoptimized}
                  sizes="400px"
                  quality={90}
                />
              </div>
            )}
            <div className="space-y-2">
              <div>
                <p className="text-xs text-gray-400">Title</p>
                <p className="text-white font-medium">{currentTrack.title}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Artist</p>
                <p className="text-white">{currentTrack.artist}</p>
              </div>
              {currentTrack.album && (
                <div>
                  <p className="text-xs text-gray-400">Album</p>
                  <p className="text-white">{currentTrack.album}</p>
                </div>
              )}
              {currentTrack.folder && (
                <div>
                  <p className="text-xs text-gray-400">Folder</p>
                  <p className="text-white">{currentTrack.folder}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-gray-400">Duration</p>
                <p className="text-white">{formatTime(currentTrack.duration)}</p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500 transition-colors text-sm flex items-center justify-center gap-2"
                onClick={() => {
                  if (navigator.share) {
                    navigator.share({
                      title: currentTrack.title,
                      text: `Listen to ${currentTrack.title} by ${currentTrack.artist}`,
                    }).catch(() => {})
                  }
                }}
              >
                <FaShare />
                Share
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      </div>
      {waveformMenu && createPortal(
        <div
          ref={waveformMenuClamp.ref}
          {...waveformMenuClamp.rootProps}
          role="menu"
          aria-label="Waveform display options"
          data-allow-scroll-when-locked=""
          className="fixed z-[12000] w-56 overflow-y-auto overscroll-y-contain rounded-lg border border-gray-700 bg-gray-900 py-0 shadow-2xl"
          style={waveformMenuClamp.style}
          onContextMenu={(e) => e.preventDefault()}
        >
          <PopupMenuDragHeader
            title={`Waveform · Deck ${waveformMenuDeck === 'a' ? 'A' : 'B'}`}
            headerProps={waveformMenuClamp.headerProps}
          />
          <div className="py-1">
          <WaveformMenuDropdown
            label="Color mode"
            value={
              WAVEFORM_COLOR_MODES.find((mode) => mode.id === waveformMode)?.shortLabel ??
              WAVEFORM_COLOR_MODES.find((mode) => mode.id === waveformMode)?.label
            }
            open={waveformMenuSection === 'color'}
            onToggle={() =>
              setWaveformMenuSection((section) => (section === 'color' ? null : 'color'))
            }
          >
            {WAVEFORM_COLOR_MODES.map((mode) => (
              <WaveformMenuItem
                key={mode.id}
                label={mode.label}
                active={waveformMode === mode.id}
                onSelect={() => setWaveformMode(mode.id)}
              />
            ))}
          </WaveformMenuDropdown>
          <div className="my-1 border-t border-gray-800" />
          <WaveformMenuDropdown
            label="Layer display"
            value={
              WAVEFORM_LAYER_LAYOUTS.find((layout) => layout.id === waveformLayerLayout)
                ?.shortLabel ??
              WAVEFORM_LAYER_LAYOUTS.find((layout) => layout.id === waveformLayerLayout)?.label
            }
            open={waveformMenuSection === 'layer'}
            onToggle={() =>
              setWaveformMenuSection((section) => (section === 'layer' ? null : 'layer'))
            }
          >
            {WAVEFORM_LAYER_LAYOUTS.map((layout) => (
              <WaveformMenuItem
                key={layout.id}
                label={layout.label}
                active={waveformLayerLayout === layout.id}
                onSelect={() => setWaveformLayerLayout(layout.id)}
              />
            ))}
          </WaveformMenuDropdown>
          <div className="my-1 border-t border-gray-800" />
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            Display
          </div>
          <WaveformMenuItem
            label="Mirror"
            active={waveformMirror}
            onSelect={() => setWaveformMirror((prev) => !prev)}
          />
          <WaveformMenuItem
            label={waveformMenuDeckBpm ? `Beat grid (${waveformMenuDeckBpm.toFixed(0)} BPM)` : 'Beat grid'}
            active={beatGridEnabled}
            disabled={!waveformMenuDeckBpm}
            onSelect={() => setBeatGridEnabled((v) => !v)}
          />
          <WaveformMenuItem
            label={
              menuAlignPoint?.source === 'memory'
                ? 'Align beat grid to memory cue'
                : 'Align beat grid to this point'
            }
            disabled={
              !menuDeckReady ||
              !menuAlignPoint ||
              (waveformMenuDeckIsLive && beatGridLocked)
            }
            onSelect={alignMenuBeatGridToPoint}
          />
          <WaveformGridNudge
            bpm={waveformMenuDeckBpm}
            offsetSec={waveformMenuDeckOffsetSec}
            disabled={!waveformMenuDeckBpm || (waveformMenuDeckIsLive && beatGridLocked)}
            onNudge={nudgeBeatGrid}
            onZero={zeroBeatGrid}
          />
          <WaveformMenuItem
            label="Follow playhead"
            active={menuFollow}
            disabled={menuVisibleBars <= 0}
            onSelect={() => {
              if (waveformMenuDeckIsLive) setWaveformFollow((prev) => !prev)
              else setIncomingFollow((prev) => !prev)
            }}
          />
          <WaveformMenuItem
            label="Overview"
            active={waveformOverview}
            onSelect={() => setWaveformOverview((prev) => !prev)}
          />
          <WaveformMenuDropdown
            label="Phase meter"
            value={
              !waveformPhaseMeter
                ? 'Off'
                : PHASE_METER_WINDOW_OPTIONS.find((o) => o.id === phaseMeterOptions.windowId)
                    ?.label ?? 'On'
            }
            open={waveformMenuSection === 'phase'}
            onToggle={() =>
              setWaveformMenuSection((section) => (section === 'phase' ? null : 'phase'))
            }
          >
            <PhaseMeterMenuItems
              enabled={waveformPhaseMeter}
              hasBpm={Boolean(waveformMenuDeckBpm)}
              options={phaseMeterOptions}
              onToggleEnabled={() => setWaveformPhaseMeter((prev) => !prev)}
              onPatch={patchPhaseMeterOptions}
              syncMode={autoDJConfig.syncMode}
              onSyncMode={(mode) => patchAutoDJConfig({ syncMode: mode })}
              onCenterPhase={() => centerPhaseMeterDeck(waveformMenuDeck)}
              onAlignPlayhead={() => alignPhaseMeterPlayhead(waveformMenuDeck)}
              onAlignBothPlayheads={alignBothPhaseMeterPlayheads}
              onClose={() => setWaveformMenu(null)}
            />
          </WaveformMenuDropdown>
          <div className="my-1 border-t border-gray-800" />
          <WaveformMenuDropdown
            label="Zoom"
            value={
              menuVisibleBars <= 0 ? 'Full track' : `${Math.round(menuVisibleBars)} bars`
            }
            open={waveformMenuSection === 'zoom'}
            onToggle={() =>
              setWaveformMenuSection((section) => (section === 'zoom' ? null : 'zoom'))
            }
          >
            <WaveformMenuItem
              label="Full track"
              active={menuVisibleBars <= 0}
              onSelect={() => applyMenuVisibleBars(0, 0.5)}
            />
            {WAVEFORM_BAR_ZOOM_STEPS.map((bars) => (
              <WaveformMenuItem
                key={`bars-${bars}`}
                label={`${bars} bars`}
                active={Math.round(menuVisibleBars) === bars}
                onSelect={() => applyMenuVisibleBars(bars, 0.5)}
              />
            ))}
            <div className="my-0.5 border-t border-gray-800" />
            <WaveformMenuItem
              label="Zoom in"
              disabled={menuVisibleBars === WAVEFORM_BAR_ZOOM_STEPS[0]}
              onSelect={() => handleMenuZoom(1)}
            />
            <WaveformMenuItem
              label="Zoom out"
              disabled={menuVisibleBars <= 0}
              onSelect={() => handleMenuZoom(-1)}
            />
          </WaveformMenuDropdown>
          <div className="my-1 border-t border-gray-800" />
          <WaveformMenuDropdown
            label="Sonic DNA"
            labelClassName="text-[10px] font-semibold uppercase tracking-wide text-cyan-500/90"
            open={waveformMenuSection === 'sonicDna'}
            onToggle={() =>
              setWaveformMenuSection((section) => (section === 'sonicDna' ? null : 'sonicDna'))
            }
          >
            <WaveformMenuItem
              label="Open Sonic DNA"
              disabled={!waveformMenuDeckTrack}
              onSelect={() => {
                if (waveformMenuDeckTrack) {
                  setSonicDnaReportTrack(waveformMenuDeckTrack)
                }
                setWaveformMenu(null)
                setSonicDnaReportOpen(true)
              }}
            />
            <WaveformMenuItem
              label="Set beat here"
              disabled={!menuDeckReady}
              onSelect={setMenuBeatHere}
            />
            <WaveformMenuItem
              label="Snap to kick"
              disabled={!menuDeckReady}
              onSelect={() => snapMenuPlayhead('kick')}
            />
            <WaveformMenuItem
              label="Snap to beat"
              disabled={!menuDeckReady}
              onSelect={() => snapMenuPlayhead('beat')}
            />
            <WaveformMenuItem
              label="Snap to phrase"
              disabled={!menuDeckReady}
              onSelect={() => snapMenuPlayhead('phrase')}
            />
            <WaveformMenuItem
              label="Align to waveform"
              disabled={
                !menuDeckReady ||
                (waveformMenuDeckIsLive
                  ? waveformData.length === 0
                  : !incomingMenuSamples || incomingMenuSamples.length < 64)
              }
              onSelect={alignMenuDeckGrid}
            />
            <WaveformMenuItem
              label="Apply DNA EQ pocket"
              disabled={!waveformMenuDeckTrack?.sonic_dna || !waveformMenuDeckIsLive}
              onSelect={applyDnaEqPocket}
            />
            <WaveformMenuItem
              label="Reset beat grid"
              disabled={!menuDeckReady || (waveformMenuDeckIsLive && beatGridLocked)}
              onSelect={resetMenuBeatGrid}
            />
            {canEditOrigBpm ? (
              <WaveformMenuItem
                label="Rescan waveform"
                disabled={!waveformMenuDeckTrack?.file}
                onSelect={() => {
                  void rescanCurrentWaveform()
                }}
              />
            ) : null}
          </WaveformMenuDropdown>
          </div>
        </div>,
        document.body
      )}
      {phaseMeterMenu && createPortal(
        <div
          ref={phaseMeterMenuClamp.ref}
          {...phaseMeterMenuClamp.rootProps}
          role="menu"
          aria-label="Phase meter options"
          data-phase-meter-menu=""
          data-allow-scroll-when-locked=""
          className="fixed z-[12000] w-64 max-h-[min(70vh,36rem)] overflow-y-auto overscroll-y-contain rounded-lg border border-gray-700 bg-gray-900 py-0 shadow-2xl"
          style={phaseMeterMenuClamp.style}
          onContextMenu={(e) => e.preventDefault()}
        >
          <PopupMenuDragHeader
            title={`Phase meter · Deck ${phaseMeterMenuDeck === 'a' ? 'A' : 'B'}`}
            headerProps={phaseMeterMenuClamp.headerProps}
          />
          <div className="py-1">
            <PhaseMeterMenuItems
              enabled={waveformPhaseMeter}
              hasBpm={Boolean(phaseMeterMenuDeckBpm)}
              options={phaseMeterOptions}
              onToggleEnabled={() => setWaveformPhaseMeter((prev) => !prev)}
              onPatch={patchPhaseMeterOptions}
              syncMode={autoDJConfig.syncMode}
              onSyncMode={(mode) => patchAutoDJConfig({ syncMode: mode })}
              onCenterPhase={() => centerPhaseMeterDeck(phaseMeterMenuDeck)}
              onAlignPlayhead={() => alignPhaseMeterPlayhead(phaseMeterMenuDeck)}
              onAlignBothPlayheads={alignBothPhaseMeterPlayheads}
              onClose={() => setPhaseMeterMenu(null)}
            />
          </div>
        </div>,
        document.body
      )}
      {sonicDnaReportOpen && (sonicDnaReportTrack ?? currentTrack) && (
        <SonicDnaReportModal
          track={(sonicDnaReportTrack ?? currentTrack) as any}
          dialogRef={sonicDnaReportRef}
          onClose={() => {
            setSonicDnaReportOpen(false)
            setSonicDnaReportTrack(null)
          }}
          waveformActions={{
            gridReady: Boolean(bpmForGrid),
            hasWaveform: waveformData.length > 0,
            onAlignGrid: () => alignBeatGridToWaveform({ force: true }),
            onSetBeatHere: setBeatHere,
            onSnapPlayhead: snapPlayheadToDna,
            onResetGrid: resetBeatGrid,
            onApplyEqBias: applyDnaEqPocket,
            onRescanWaveform: rescanCurrentWaveform,
          }}
        />
      )}
    </div>
  )
}
