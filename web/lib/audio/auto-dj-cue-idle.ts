/**
 * AutoDJ early idle cue — park/pre-arm incoming on the idle deck before OUT.
 * MusicPlayer supplies MixEngine + UI deps; this owns the cue sequence.
 */

import { resolveAudioUrl } from '@/utils/resolveAudioUrl'
import { resolvePlaybackBpm } from '@/lib/audio/sonic-dna-mix'
import { phaseMeterWindowToGridAlign } from '@/lib/audio/waveform-overlays'
import type { PhaseMeterWindowId } from '@/lib/audio/waveform-overlays'
import { clampTempoRate, alignMixOverlayToBeatGrid, decodeIncomingBuffer } from '@/lib/audio/mix-engine'
import type { DeckId, MixEngine, MixPlan, MixTrackRef, PhraseBars } from '@/lib/audio/mix-engine'

export type CueIdleTrack = MixTrackRef & {
  id: string
  title: string
  file: string
  bpm?: number | null
  duration?: number | null
  beat_grid_offset?: number | null
  sonic_dna?: unknown
}

export type CueIdleWaveformPacked = {
  samples: number[]
  durationSec: number
}

export type CueIdleEarlyDeps = {
  getCuedIdleTrackId: () => string | null
  setCuedIdleTrackId: (id: string | null) => void
  isEngineMixing: () => boolean
  lockIdleTempo: (rate: number) => void
  getIdleDeckId: () => DeckId
  setIdleDeckUi: (
    deck: DeckId,
    patch: { playbackRate: number; detectedBpm?: number | null },
  ) => void
  silenceIdle: () => void
  ensureDualDeckGraph: () => Promise<void>
  ensureMixEngine: () => MixEngine | null
  peekUrl: (file: string) => string | null
  cacheUrl: (file: string, url: string) => void
  loadWaveformSamples: (
    track: CueIdleTrack,
    url: string,
  ) => Promise<CueIdleWaveformPacked | null>
  cacheMixGridOffset: (track: CueIdleTrack, samples: number[], durationSec: number) => void
  setGhostSamples: (payload: {
    trackId: string
    samples: number[]
    durationSec: number
    sonicDna: unknown
  }) => void
  syncIdleDeckWaveformCache: (trackId: string, samples: number[], durationSec: number) => void
  resolveIncomingCueSec: (track: CueIdleTrack) => number
  withMixGrid: (track: CueIdleTrack) => MixTrackRef
  getSyncMode: () => 'beat-sync' | 'tempo-sync'
  phaseMeterEnabled: () => boolean
  getPhaseMeter: () => { windowId: PhaseMeterWindowId; phraseBars: number }
  getOutgoingTrack: () => CueIdleTrack | null
  getDetectedBpm: () => number | null
  getBeatGridOffsetSec: () => number
  getDefaultOverlapBars: () => PhraseBars
  getAudioContext: () => AudioContext | null
  armIncomingBuffer: (buf: AudioBuffer) => void
  clearIdleWarmed: () => void
  setMixOverlay: (overlay: {
    active: boolean
    mixOutSec: number
    mixStartSec: number
    mixEndSec: number
  }) => void
  setStatus: (message: string) => void
}

/** Cue (or refresh) the idle deck for an upcoming AutoDJ blend. */
export async function cueIdleEarly(
  nextTrack: CueIdleTrack,
  plan: MixPlan,
  mixStartRate: number,
  deps: CueIdleEarlyDeps,
): Promise<void> {
  if (deps.getCuedIdleTrackId() === nextTrack.id) {
    if (!deps.isEngineMixing()) {
      if (mixStartRate > 0) {
        deps.lockIdleTempo(mixStartRate)
        deps.setIdleDeckUi(deps.getIdleDeckId(), {
          playbackRate: clampTempoRate(mixStartRate),
        })
      }
      deps.silenceIdle()
    }
    return
  }

  await deps.ensureDualDeckGraph()
  const engine = deps.ensureMixEngine()
  if (!engine || engine.isMixing()) return

  let url = deps.peekUrl(nextTrack.file)
  if (!url) {
    url = await resolveAudioUrl(nextTrack.file)
    if (url) deps.cacheUrl(nextTrack.file, url)
  }
  if (!url) return

  void deps.loadWaveformSamples(nextTrack, url).then((packed) => {
    if (!packed) return
    deps.cacheMixGridOffset(
      nextTrack,
      packed.samples,
      packed.durationSec || nextTrack.duration || 180,
    )
    deps.setGhostSamples({
      trackId: nextTrack.id,
      samples: packed.samples,
      durationSec: packed.durationSec || nextTrack.duration || 180,
      sonicDna: nextTrack.sonic_dna,
    })
    deps.syncIdleDeckWaveformCache(
      nextTrack.id,
      packed.samples,
      packed.durationSec || nextTrack.duration || 180,
    )
  })

  try {
    // Prefer plan's AlignmentState / phrase-1 cue — host memory cue only fills gaps.
    const planCue =
      typeof plan.resolvedIncomingSec === 'number' && Number.isFinite(plan.resolvedIncomingSec)
        ? plan.resolvedIncomingSec
        : typeof plan.incomingStartSec === 'number' && Number.isFinite(plan.incomingStartSec)
          ? plan.incomingStartSec
          : null
    const cueSec =
      planCue != null ? planCue : deps.resolveIncomingCueSec(nextTrack)
    plan.incomingStartSec = cueSec
    plan.resolvedIncomingSec = cueSec
    await engine.enterPreArm(plan, deps.withMixGrid(nextTrack), url, mixStartRate)
    deps.clearIdleWarmed()

    if (
      deps.phaseMeterEnabled() &&
      deps.getSyncMode() === 'beat-sync' &&
      plan.holdBeatmatch !== false
    ) {
      const meter = deps.getPhaseMeter()
      const outTrack = deps.getOutgoingTrack()
      const outBpm =
        resolvePlaybackBpm(outTrack, deps.getDetectedBpm()) ??
        outTrack?.bpm ??
        deps.getDetectedBpm() ??
        120
      const inBpm = resolvePlaybackBpm(nextTrack, null) ?? nextTrack.bpm ?? outBpm
      const gridAlign = plan.gridAlign ?? phaseMeterWindowToGridAlign(meter.windowId)
      engine.nudgeIdleToMaster({
        outgoingTimeSec: engine.getActiveMediaTime(),
        outgoingBpm: outBpm,
        outgoingOffsetSec:
          typeof outTrack?.beat_grid_offset === 'number' ? outTrack.beat_grid_offset : undefined,
        incomingBpm: inBpm,
        incomingOffsetSec:
          typeof nextTrack.beat_grid_offset === 'number' ? nextTrack.beat_grid_offset : undefined,
        incomingRate: mixStartRate,
        gridAlign,
        gridPhraseBars: plan.gridPhraseBars ?? meter.phraseBars,
      })
    }

    const idleDeck = deps.getIdleDeckId()
    deps.setIdleDeckUi(idleDeck, {
      playbackRate: clampTempoRate(mixStartRate),
      detectedBpm: resolvePlaybackBpm(nextTrack, null) ?? nextTrack.bpm ?? null,
    })
    deps.setCuedIdleTrackId(nextTrack.id)

    const ctx = deps.getAudioContext()
    if (ctx && url) {
      void decodeIncomingBuffer(ctx, url).then((buf) => {
        if (!buf) return
        if (deps.getCuedIdleTrackId() !== nextTrack.id) return
        deps.armIncomingBuffer(buf)
      })
    }

    const outTrack = deps.getOutgoingTrack()
    const bpm =
      resolvePlaybackBpm(outTrack, deps.getDetectedBpm()) ??
      outTrack?.bpm ??
      deps.getDetectedBpm() ??
      120
    const aligned = alignMixOverlayToBeatGrid({
      mixOutSec: plan.mixOutMarkerSec ?? plan.startAtOutgoingSec,
      mixDurationSec: plan.mixDurationSec,
      bpm,
      offsetSec: deps.getBeatGridOffsetSec(),
      overlapBars: plan.overlapBars ?? deps.getDefaultOverlapBars(),
    })
    deps.setMixOverlay({
      active: true,
      mixOutSec: aligned.mixOutSec,
      mixStartSec: aligned.mixStartSec,
      mixEndSec: aligned.mixEndSec,
    })
    deps.setStatus(`Cued “${nextTrack.title}” @ ${cueSec.toFixed(1)}s`)
  } catch (err) {
    console.debug('Early idle cue failed:', err)
  }
}
