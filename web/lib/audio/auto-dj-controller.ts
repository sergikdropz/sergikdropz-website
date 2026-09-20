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
  /** True when idle deck phase is within the pre-audible lock window. */
  isIdlePreArmLocked: () => boolean
  getIdleReadyState: () => number
  parkAndWarmIdle: (cueSec: number, rate: number) => void
  /** Warm without parking (keeps live phase lock). */
  warmIdle: (rate: number) => void
  clearIdlePreArmLock: () => void
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
  /** Keep idle deck rate beatmatched to outgoing while cued. */
  lockIdleTempo: (rate: number) => void
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
  /** Throttle pending pre-arm nudges so OUT rAF + tick don't double-seek. */
  private lastPendingNudgeAt = 0

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

  /**
   * While fire is pending, keep idle beatmatched + phase-nudged without
   * rebuilding the mix plan (which would thrash OUT / cues).
   */
  private maintainPendingPreArm(
    track: AutoDjHostTrack,
    nextTrack: AutoDjHostTrack | undefined,
    ct: number,
  ) {
    const host = this.host
    if (!nextTrack || host.isEngineMixing()) return
    if (host.getPendingId() !== nextTrack.id) return
    if (host.getCuedIdleTrackId() !== nextTrack.id) return

    const plan = host.getFrozen()?.plan ?? this.lastTickPlan ?? host.getLastPlan()
    if (!plan) return

    const outBpm =
      resolvePlaybackBpm(track, host.getDetectedBpm()) ??
      track.bpm ??
      host.getDetectedBpm() ??
      120
    const cueArmRate =
      typeof plan.rateRatio === 'number' && plan.rateRatio > 0
        ? plan.rateRatio
        : 1
    if (cueArmRate > 0) host.lockIdleTempo(cueArmRate)

    const outMarker = plan.startAtOutgoingSec
    const delay = outMarker - ct
    if (delay > 0 && delay <= 90) {
      host.setOutCountdown(Math.round(delay * 10) / 10)
    }

    const inBpm = resolvePlaybackBpm(nextTrack, null) ?? nextTrack.bpm ?? outBpm
    const meterOpts = host.getPhaseMeter()
    const inRef = host.withMixGrid(nextTrack)
    const incomingGridOffset =
      typeof inRef.beat_grid_offset === 'number' ? inRef.beat_grid_offset : undefined

    // Warm only — never park while pending (park kills the phase lock).
    if (host.getIdleWarmedId() !== nextTrack.id) {
      host.warmIdle(cueArmRate)
      host.setIdleWarmedId(nextTrack.id)
    }

    // Single owner clock near OUT: tick nudges at most 5Hz when locked, 10Hz when chasing.
    // Fire-hold path must NOT also nudge (see fireMix) — that was dual-seek thrash.
    const now = performance.now()
    const locked = host.isIdlePreArmLocked()
    const minGapMs = locked ? 200 : 100
    if (now - this.lastPendingNudgeAt < minGapMs) return
    this.lastPendingNudgeAt = now

    host.nudgeIdleToMaster({
      outgoingTimeSec: ct,
      outgoingBpm: outBpm,
      outgoingOffsetSec: host.getBeatGridOffsetSec(),
      incomingBpm: inBpm,
      incomingOffsetSec: incomingGridOffset,
      incomingRate: cueArmRate,
      gridAlign: plan.phrase1Lock !== false ? 'phrase' : plan.gridAlign,
      gridPhraseBars: plan.gridPhraseBars ?? meterOpts.phraseBars ?? 8,
    })
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

    const nextTrackInQueue = q[currentIndex + 1]
    if (host.getPendingId()) {
      // Pending = fire armed. Keep tempo + phase lock alive until OUT —
      // bailing the whole tick lets silent idle drift into a trainwreck.
      this.maintainPendingPreArm(track, nextTrackInQueue, ct)
      return
    }
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
    // Single freeze owner: plan module only (no controller double-latch).
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

    // As soon as the cue deck is loaded, hold beatmatch tempo every tick.
    if (
      cueArmRate > 0 &&
      host.getCuedIdleTrackId() === nextTrackInQueue.id &&
      !host.isEngineMixing()
    ) {
      host.lockIdleTempo(cueArmRate)
    }

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
      // Already pre-armed / cued: warm + nudge only — park throws the lock away.
      if (host.getIdleWarmedId() !== nextTrackInQueue.id) {
        host.warmIdle(cueArmRate)
        host.setIdleWarmedId(nextTrackInQueue.id)
      }
      host.nudgeIdleToMaster({
        outgoingTimeSec: ct,
        outgoingBpm: outBpm,
        outgoingOffsetSec: outgoingGridOffset,
        incomingBpm: inBpm,
        incomingOffsetSec: incomingGridOffset,
        incomingRate: cueArmRate,
        // Phrase-1 doctrine: keep warm idle on the phrase lattice until fire.
        gridAlign:
          plan.phrase1Lock !== false
            ? 'phrase'
            : plan.gridAlign,
        gridPhraseBars: plan.gridPhraseBars ?? meterOpts.phraseBars ?? 8,
      })
    } else if (
      delaySeconds > 0 &&
      delaySeconds <= prepareLeadSec + 0.45 &&
      host.getCuedIdleTrackId() !== nextTrackInQueue.id &&
      !host.isEngineMixing()
    ) {
      // First arm — park at cue then warm (cueIdleEarly below may also enterPreArm).
      host.parkAndWarmIdle(resolvedCue, cueArmRate)
      host.setIdleWarmedId(nextTrackInQueue.id)
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
    const preArmLocked = host.isIdlePreArmLocked()
    const beatSync = phraseMixEarly?.syncMode !== 'tempo-sync'
    // BeatSync: hold until buffer + real phase lock (not just stage gate).
    // TempoSync: shorter hold for buffer only.
    const holdWindowSec = beatSync ? 2.4 : 0.4
    const holdForIncoming =
      (idleReady < 2 && nowSec < outMarker + 0.12) ||
      ((!incomingReady || !fireGateOpen || (beatSync && !preArmLocked)) &&
        nowSec < outMarker + holdWindowSec)
    if (holdForIncoming) {
      if (beatSync && (!incomingReady || !preArmLocked) && nowSec >= outMarker + 0.35) {
        host.setStatus(
          !incomingReady
            ? 'Holding OUT — arming incoming for BeatSync…'
            : 'Holding OUT — locking phrase phase…',
        )
      }
      // Tempo lock only here — phase nudge is owned by maintainPendingPreArm (single scheduler).
      const frozen = host.getFrozen()?.plan
      const rate =
        typeof frozen?.rateRatio === 'number' && frozen.rateRatio > 0
          ? frozen.rateRatio
          : this.lastTickPlan?.rateRatio && this.lastTickPlan.rateRatio > 0
            ? this.lastTickPlan.rateRatio
            : 1
      host.lockIdleTempo(rate)
      host.scheduleFireRetry(() =>
        this.fireMix(plannedOutgoing, plannedIncoming, targetOut, plannedDur),
      )
      return
    }

    // Past hold window still unlocked under BeatSync → delay OUT one phrase
    // (prefer lock over TempoSync smash). Only TempoSync when BPM gap is tiny
    // or there is no room left on the outgoing track.
    if (beatSync && (!incomingReady || !preArmLocked)) {
      const outBars =
        host.getFrozen()?.plan.outPhraseBars ??
        this.lastTickPlan?.outPhraseBars ??
        8
      const phraseSec = Math.max(this.lastBeatSec * 4 * outBars, this.lastBeatSec * 16)
      const delayedOut = outMarker + phraseSec
      const roomLeft = liveDur - delayedOut
      const outBpmLive =
        resolvePlaybackBpm(liveTrack, host.getDetectedBpm()) ??
        liveTrack.bpm ??
        host.getDetectedBpm() ??
        120
      const inBpmLive =
        resolvePlaybackBpm(stillNext, null) ?? stillNext.bpm ?? outBpmLive
      const bpmRel =
        Math.abs(outBpmLive - inBpmLive) / Math.max(outBpmLive, inBpmLive, 1)
      const tinyBpmGap = bpmRel <= 0.02

      if (roomLeft > 2.5 && !tinyBpmGap) {
        const basePlan = host.getFrozen()?.plan ?? this.lastTickPlan ?? host.getLastPlan()
        if (!basePlan) {
          releasePending()
          return
        }
        host.setStatus('BeatSync — delaying OUT one phrase to lock phase…')
        const delayedPlan = {
          ...basePlan,
          startAtOutgoingSec: delayedOut,
          mixOutMarkerSec: delayedOut,
          // Force fire re-solve so IN matches the new OUT bar (don't trust stale lock).
          reason: `${basePlan.reason || 'mix'} · phrase-delay`,
          dnaConfidence: Math.min(0.55, basePlan.dnaConfidence ?? 0.55),
        }
        // Unlock so maintainPending re-locks against the delayed OUT.
        host.clearIdlePreArmLock()
        host.setFrozen({
          outgoingId: liveTrack.id,
          incomingId: stillNext.id,
          plan: delayedPlan,
        })
        host.setLastPlan(delayedPlan)
        host.setMixOverlay({
          active: true,
          mixOutSec: delayedOut,
          mixStartSec: delayedOut,
          mixEndSec: delayedOut + (delayedPlan.mixDurationSec || 16),
        })
        host.clearOutWatch()
        host.watchOutMarker(delayedOut, () =>
          this.fireMix(plannedOutgoing, plannedIncoming, delayedOut, plannedDur),
        )
        return
      }

      host.setStatus(
        tinyBpmGap
          ? 'BeatSync unlock timed out — TempoSync (ΔBPM tiny)'
          : !incomingReady
            ? 'BeatSync unavailable — TempoSync this blend (incoming not armed)'
            : 'BeatSync unlock timed out — TempoSync (no phrase room)',
      )
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
      preArmLocked,
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
