/**
 * AutoDJ runtime controller — owns the 100ms tick, OUT rAF watch, and fire.
 * MixEngine / MusicPlayer remain the audio host via AutoDjControllerHost.
 */

import type { AutoDJConfig } from '@/lib/audio/auto-dj-preferences'
import { resolvePlaybackBpm } from '@/lib/audio/sonic-dna-mix'
import {
  buildAutoDjTickPlan,
  buildAutoDjFirePlan,
  shouldRunAutoDjPlanScan,
  type AutoDjFrozenPlan,
  type AutoDjPhaseMeterOpts,
  type MixPlan,
  type MixTrackRef,
} from '@/lib/audio/auto-dj-plan'
import type { MixQualityGrade } from '@/lib/audio/mix-engine'
import type { resolvePhraseMixSettings } from '@/lib/audio/mix-engine/phrase-mix-doctrine'

export type AutoDjHostTrack = MixTrackRef & {
  title: string
  file: string
}

export type AutoDjControllerHost = {
  getConfig: () => AutoDJConfig
  getLeadInSec: () => number
  getSuggestedLeadInSec: () => number
  setSuggestedLeadInSec: (sec: number) => void
  isMixingLocked: () => boolean
  getNowSec: () => number
  getDurationSec: () => number
  getQueue: () => AutoDjHostTrack[]
  setQueue: (queue: AutoDjHostTrack[]) => void
  getCurrentTrack: () => AutoDjHostTrack | null
  getPhraseDurationSec: () => number
  getOutgoingPlaybackRate: () => number
  getDetectedBpm: () => number | null
  getBeatGridOffsetSec: () => number
  getSliderPlaybackRate: () => number
  getLastMixGrade: () => MixQualityGrade | null
  getConsecutiveWeak: () => number
  withMixGrid: (track: AutoDjHostTrack) => MixTrackRef
  resolveIncomingCueSec: (track: AutoDjHostTrack) => number
  pickNextTrack: () => AutoDjHostTrack | null
  cacheMixGridFromLiveWaveform: (track: AutoDjHostTrack, durationSec: number) => void
  cacheMixGridFromGhost: (track: AutoDjHostTrack) => void
  peekUrl: (file: string) => string | null
  ensureUrl: (file: string) => void
  warmLookahead2: (track: AutoDjHostTrack) => void
  getLookahead2Id: () => string | null
  setLookahead2Id: (id: string | null) => void
  phaseMeterEnabled: () => boolean
  getPhaseMeter: () => AutoDjPhaseMeterOpts
  enterPlan: (plan: MixPlan) => void
  cueIdleEarly: (track: AutoDjHostTrack, plan: MixPlan, mixStartRate: number) => void
  getCuedIdleTrackId: () => string | null
  getIdleWarmedId: () => string | null
  setIdleWarmedId: (id: string | null) => void
  isEngineMixing: () => boolean
  hasIncomingReady: () => boolean
  canEnterFire: () => boolean
  getIdleReadyState: () => number
  parkAndWarmIdle: (cueSec: number, rate: number) => void
  nudgeIdleToMaster: (args: {
    outgoingTimeSec: number
    outgoingBpm: number
    outgoingOffsetSec: number
    incomingBpm: number
    incomingOffsetSec?: number
    incomingRate: number
    gridAlign?: MixPlan['gridAlign']
    gridPhraseBars?: number
  }) => void
  incomingPeaksReady: (track: AutoDjHostTrack, inRef: MixTrackRef) => boolean
  loadIncomingPeaks: (track: AutoDjHostTrack) => void
  startPhraseMix: (
    track: AutoDjHostTrack,
    mixDur: number,
    rate: number,
    plan: MixPlan,
    opts: { incomingTargetRate: number },
  ) => void
  setStatus: (msg: string | ((prev: string) => string)) => void
  setPendingTrackId: (id: string | null) => void
  setOutCountdown: (sec: number | null) => void
  setMixOverlay: (overlay: {
    active: boolean
    mixOutSec: number
    mixStartSec: number
    mixEndSec: number
  }) => void
  clearOutWatch: () => void
  clearCrossfadeTimeout: () => void
  watchOutMarker: (targetOut: number, fire: () => void) => void
  scheduleFireRetry: (fire: () => void) => void
  getFrozen: () => AutoDjFrozenPlan | null
  setFrozen: (frozen: AutoDjFrozenPlan | null) => void
  getLastPlan: () => MixPlan | null
  setLastPlan: (plan: MixPlan | null) => void
  getPendingId: () => string | null
  setPendingId: (id: string | null) => void
  getLastAddedId: () => string | null
  setLastAddedId: (id: string | null) => void
  getPlanDelay: () => number | null
  setPlanDelay: (sec: number | null) => void
  getPlanScan: () => number
  setPlanScan: (n: number) => void
  onQueueChange: (queue: AutoDjHostTrack[]) => void
}

const TICK_MS = 100

type PhraseMix = ReturnType<typeof resolvePhraseMixSettings>

export class AutoDjController {
  private host: AutoDjControllerHost
  private timer: ReturnType<typeof setInterval> | null = null
  private lastPhraseMix: PhraseMix | null = null
  private lastBeatSec = 0.5
  private lastTickPlan: MixPlan | null = null

  constructor(host: AutoDjControllerHost) {
    this.host = host
  }

  start() {
    this.stop()
    this.timer = setInterval(() => this.tick(), TICK_MS)
    this.tick()
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.host.clearOutWatch()
    this.host.clearCrossfadeTimeout()
  }

  private tick() {
    const host = this.host
    if (host.isMixingLocked()) {
      host.setOutCountdown(null)
      return
    }

    const ct = host.getNowSec()
    const dur = host.getDurationSec()
    const q = host.getQueue()
    const track = host.getCurrentTrack()
    const phrase = host.getPhraseDurationSec()
    const config = host.getConfig()

    if (!track || dur <= 0 || !Number.isFinite(ct)) return
    const currentIndex = q.findIndex((t) => t.id === track.id)
    if (currentIndex < 0) return

    host.cacheMixGridFromLiveWaveform(track, dur)

    const upcomingCount = q.length - 1 - currentIndex
    if (upcomingCount < config.lookahead) {
      const candidate = host.pickNextTrack()
      if (
        candidate &&
        !q.some((t) => t.id === candidate.id) &&
        host.getLastAddedId() !== candidate.id
      ) {
        host.setLastAddedId(candidate.id)
        const nextQueue = [...q, candidate]
        host.setQueue(nextQueue)
        host.onQueueChange(nextQueue)
        host.setStatus(`Auto DJ queued “${candidate.title}” (DNA)`)
        return
      }
    }

    if (host.getPendingId()) return
    const nextTrackInQueue = q[currentIndex + 1]
    if (!nextTrackInQueue) {
      host.setOutCountdown(null)
      return
    }

    if (!host.peekUrl(nextTrackInQueue.file)) {
      host.ensureUrl(nextTrackInQueue.file)
    }

    const frozen = host.getFrozen()
    if (
      frozen &&
      (frozen.outgoingId !== track.id || frozen.incomingId !== nextTrackInQueue.id)
    ) {
      host.setFrozen(null)
    }

    const lookAhead2 = q[currentIndex + 2]
    if (lookAhead2 && host.getLookahead2Id() !== lookAhead2.id) {
      host.setLookahead2Id(lookAhead2.id)
      host.warmLookahead2(lookAhead2)
    }

    const scan = host.getPlanScan() + 1
    host.setPlanScan(scan)
    if (!shouldRunAutoDjPlanScan(scan, host.getPlanDelay(), phrase)) return

    const outRate = host.getOutgoingPlaybackRate()
    const outBpm =
      resolvePlaybackBpm(track, host.getDetectedBpm()) ??
      track.bpm ??
      host.getDetectedBpm() ??
      120
    host.cacheMixGridFromGhost(nextTrackInQueue)

    const outRef = {
      ...host.withMixGrid(track),
      duration: dur,
      beat_grid_offset: host.getBeatGridOffsetSec(),
    }
    const inRef = host.withMixGrid(nextTrackInQueue)
    const outgoingGridOffset = host.getBeatGridOffsetSec()
    const incomingGridOffset =
      typeof inRef.beat_grid_offset === 'number' ? inRef.beat_grid_offset : undefined
    const mixInCue = host.resolveIncomingCueSec(nextTrackInQueue)

    const built = buildAutoDjTickPlan({
      config,
      nowSec: ct,
      durationSec: dur,
      outgoing: outRef,
      incoming: inRef,
      outgoingPlaybackRate: outRate,
      outgoingBpm: outBpm,
      outgoingGridOffset,
      incomingGridOffset,
      leadInSec: host.getLeadInSec(),
      lastMixGrade: host.getLastMixGrade(),
      consecutiveWeak: host.getConsecutiveWeak(),
      phaseMeterEnabled: host.phaseMeterEnabled(),
      phaseMeter: host.getPhaseMeter(),
      frozen: host.getFrozen(),
      mixInCueSec: mixInCue,
      sliderPlaybackRate: host.getSliderPlaybackRate(),
    })
    if (!built) return

    this.lastPhraseMix = built.phraseMix
    this.lastBeatSec = built.beatSec
    this.lastTickPlan = built.plan
    host.setFrozen(built.frozen)

    if (Math.abs(built.suggestedLeadInSec - host.getSuggestedLeadInSec()) > 0.04) {
      host.setSuggestedLeadInSec(built.suggestedLeadInSec)
    }

    host.setMixOverlay({
      active: true,
      mixOutSec: built.overlay.mixOutSec,
      mixStartSec: built.overlay.mixStartSec,
      mixEndSec: built.overlay.mixEndSec,
    })
    host.enterPlan(built.plan)

    host.setPlanDelay(built.delaySeconds)
    if (built.delaySeconds > 0 && built.delaySeconds <= 90) {
      host.setOutCountdown(Math.round(built.delaySeconds * 10) / 10)
    } else {
      host.setOutCountdown(null)
    }
    if (
      !built.safety.ok &&
      built.safety.forceTempoSync &&
      built.delaySeconds > 0 &&
      built.delaySeconds <= 8
    ) {
      host.setStatus((prev) =>
        prev.includes(built.safety.message) ? prev : `${built.safety.message} · TempoSync`,
      )
    }

    const { delaySeconds, prepareLeadSec, armWindowSec, cueArmRate, plan } = built
    const meterOpts = host.getPhaseMeter()
    const resolvedCue =
      typeof plan.resolvedIncomingSec === 'number' && Number.isFinite(plan.resolvedIncomingSec)
        ? plan.resolvedIncomingSec
        : plan.incomingStartSec

    if (!host.incomingPeaksReady(nextTrackInQueue, inRef) && delaySeconds > 0.4) {
      host.loadIncomingPeaks(nextTrackInQueue)
      if (delaySeconds <= prepareLeadSec + 0.45) {
        host.cueIdleEarly(nextTrackInQueue, plan, cueArmRate)
      }
    }

    if (
      delaySeconds > 0 &&
      delaySeconds <= prepareLeadSec + 0.45 &&
      host.getCuedIdleTrackId() === nextTrackInQueue.id &&
      !host.isEngineMixing()
    ) {
      const inBpm =
        resolvePlaybackBpm(nextTrackInQueue, null) ?? nextTrackInQueue.bpm ?? outBpm
      // Keep AlignmentState / phrase-1 cue — do not stamp host memory/0 over it.
      if (host.getIdleWarmedId() !== nextTrackInQueue.id) {
        host.parkAndWarmIdle(resolvedCue, cueArmRate)
        host.setIdleWarmedId(nextTrackInQueue.id)
      }
      host.nudgeIdleToMaster({
        outgoingTimeSec: ct,
        outgoingBpm: outBpm,
        outgoingOffsetSec: outgoingGridOffset,
        incomingBpm: inBpm,
        incomingOffsetSec: incomingGridOffset,
        incomingRate: cueArmRate,
        gridAlign: plan.gridAlign,
        gridPhraseBars: plan.gridPhraseBars ?? meterOpts.phraseBars,
      })
    }

    if (delaySeconds <= armWindowSec + phrase && delaySeconds > -0.25) {
      host.cueIdleEarly(nextTrackInQueue, plan, cueArmRate)
    }

    if (delaySeconds > armWindowSec) return

    const targetOut = plan.startAtOutgoingSec
    const fire = () => this.fireMix(track, nextTrackInQueue, targetOut, dur)

    host.setPendingId(nextTrackInQueue.id)
    host.setPendingTrackId(nextTrackInQueue.id)
    host.setLastPlan(plan)

    if (delaySeconds <= 0) {
      fire()
      return
    }
    host.watchOutMarker(targetOut, fire)
  }

  private fireMix(
    plannedOutgoing: AutoDjHostTrack,
    plannedIncoming: AutoDjHostTrack,
    targetOut: number,
    plannedDur: number,
  ) {
    const host = this.host
    const releasePending = () => {
      host.setPendingId(null)
      host.setPendingTrackId(null)
    }

    if (!host.getConfig().enabled || host.isMixingLocked()) {
      host.clearOutWatch()
      host.clearCrossfadeTimeout()
      releasePending()
      return
    }

    const liveQ = host.getQueue()
    const liveTrack = host.getCurrentTrack()
    if (!liveTrack || liveTrack.id !== plannedOutgoing.id) {
      host.clearOutWatch()
      host.clearCrossfadeTimeout()
      releasePending()
      return
    }
    const stillNext = liveQ.find((t) => t.id === plannedIncoming.id)
    if (!stillNext) {
      host.clearOutWatch()
      host.clearCrossfadeTimeout()
      releasePending()
      return
    }

    const nowSec = host.getNowSec()
    const liveDur = host.getDurationSec() > 0 ? host.getDurationSec() : plannedDur
    const frozenPlan = host.getFrozen()?.plan
    const outMarker = frozenPlan?.startAtOutgoingSec ?? targetOut

    if (nowSec < outMarker - 0.012) return

    const phraseMixEarly = this.lastPhraseMix
    const idleReady = host.getIdleReadyState()
    const incomingReady = host.hasIncomingReady()
    const fireGateOpen = host.canEnterFire()
    const beatSync = phraseMixEarly?.syncMode !== 'tempo-sync'
    const holdForIncoming =
      (idleReady < 2 && nowSec < outMarker + 0.12) ||
      ((!incomingReady || !fireGateOpen) &&
        nowSec < outMarker + (beatSync ? 0.85 : 0.4))
    if (holdForIncoming) {
      if (beatSync && !incomingReady && nowSec >= outMarker + 0.35) {
        host.setStatus('Holding OUT — arming incoming for BeatSync…')
      }
      host.scheduleFireRetry(() =>
        this.fireMix(plannedOutgoing, plannedIncoming, targetOut, plannedDur),
      )
      return
    }

    // Past hold window still unarmed under BeatSync → fire will TempoSync-degrade.
    if (beatSync && !incomingReady) {
      host.setStatus('BeatSync unavailable — TempoSync this blend (incoming not armed)')
    }

    host.clearOutWatch()
    host.clearCrossfadeTimeout()
    host.setOutCountdown(null)

    const phraseMix = phraseMixEarly
    if (!phraseMix) {
      releasePending()
      return
    }

    const fireOutRef = { ...host.withMixGrid(liveTrack), duration: liveDur }
    const fireInRef = host.withMixGrid(stillNext)
    const fired = buildAutoDjFirePlan({
      config: host.getConfig(),
      phraseMix,
      liveOutgoing: fireOutRef,
      liveIncoming: fireInRef,
      nowSec,
      liveDurationSec: liveDur,
      outMarker,
      beatSec: this.lastBeatSec,
      outgoingPlaybackRate: host.getOutgoingPlaybackRate(),
      frozenPlan,
      fallbackStyle:
        this.lastTickPlan?.style ?? host.getLastPlan()?.style ?? 'crossfade',
      lastOrTickPlan:
        host.getLastPlan() ||
        this.lastTickPlan || {
          outgoingTrackId: liveTrack.id,
          incomingTrackId: stillNext.id,
          startAtOutgoingSec: outMarker,
          incomingStartSec: host.resolveIncomingCueSec(stillNext),
          mixDurationSec: 16,
          rateRatio: 1,
          style: 'crossfade',
          curve: 'equal-power',
          outPhraseBars: 8,
          inPhraseBars: 8,
          overlapBars: 8,
          phraseBars: 8,
          reason: 'fallback',
        },
      phaseMeterEnabled: host.phaseMeterEnabled(),
      phaseMeter: host.getPhaseMeter(),
      detectedBpm: host.getDetectedBpm(),
      sliderPlaybackRate: host.getSliderPlaybackRate(),
      hasIncomingReady: incomingReady,
    })

    if (fired.gateReason) {
      console.debug('AutoDJ fire gate:', fired.gateReason)
    }

    host.setStatus(`Auto DJ ${fired.plan.reason} → “${stillNext.title}”`)
    host.setPendingTrackId(stillNext.id)
    host.setFrozen(null)

    host.startPhraseMix(stillNext, fired.mixDurationSec, fired.incomingRate, fired.plan, {
      incomingTargetRate: fired.handoffTarget,
    })
  }
}
