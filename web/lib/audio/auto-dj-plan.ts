/**
 * Pure AutoDJ plan/fire builders — no DOM, no MixEngine, no React.
 * MusicPlayer / AutoDjController apply side effects from these results.
 */

import type { AutoDJConfig, BeatCorrect } from '@/lib/audio/auto-dj-preferences'
import {
  beatCorrectFlags,
  resolveIncomingRateForStrategy,
  withPhaseMeterGridAlign,
} from '@/lib/audio/auto-dj-preferences'
import { resolvePlaybackBpm } from '@/lib/audio/sonic-dna-mix'
import { phaseMeterWindowToGridAlign } from '@/lib/audio/waveform-overlays'
import type { PhaseMeterWindowId } from '@/lib/audio/waveform-overlays'
import {
  applyPrepareLeadIn,
  resolveFireMixPlan,
  gateAutoDjFire,
} from '@/lib/audio/auto-dj-orchestrate'
import {
  buildMixPlan,
  alignMixOverlayToBeatGrid,
  resolvePhraseMixSettings,
  resolveSectionAwareMixStyle,
  resolveEffectiveMixStyle,
  resolveEffectiveMixTechniques,
  outgoingSectionAt,
  bothGridsReady,
  shouldApplyQualityGate,
  prearmLeadSec,
  PLAN_FREEZE_SEC,
  computeMixDeckRates,
  resolveHoldBeatmatch,
  suggestLeadInSec,
  type MixPlan,
  type MixTrackRef,
  type MixQualityGrade,
  type PhraseBars,
} from '@/lib/audio/mix-engine'

export {
  applyPrepareLeadIn,
  resolveFireMixPlan,
  gateAutoDjFire,
  shouldBlockDnaFallback,
  orchestrateSkipBlendPlan,
} from '@/lib/audio/auto-dj-orchestrate'

/** Coarse scan early in the track; every tick near OUT. */
export function autoDjPlanScanEvery(
  lastDelaySec: number | null,
  phraseDurationSec: number,
): number {
  if (lastDelaySec == null || lastDelaySec <= phraseDurationSec + 6) return 1
  if (lastDelaySec > 60) return 10
  return 3
}

export function shouldRunAutoDjPlanScan(
  scanCount: number,
  lastDelaySec: number | null,
  phraseDurationSec: number,
): boolean {
  const every = autoDjPlanScanEvery(lastDelaySec, phraseDurationSec)
  return scanCount % every === 0
}

export type AutoDjFrozenPlan = {
  outgoingId: string
  incomingId: string
  plan: MixPlan
}

export type AutoDjPhaseMeterOpts = {
  windowId: PhaseMeterWindowId
  phraseBars: number
}

export type BuildAutoDjTickPlanInput = {
  config: AutoDJConfig
  nowSec: number
  durationSec: number
  outgoing: MixTrackRef
  incoming: MixTrackRef
  outgoingPlaybackRate: number
  outgoingBpm: number
  outgoingGridOffset: number
  incomingGridOffset?: number
  leadInSec: number
  lastMixGrade: MixQualityGrade | null
  consecutiveWeak: number
  phaseMeterEnabled: boolean
  phaseMeter: AutoDjPhaseMeterOpts
  frozen: AutoDjFrozenPlan | null
  mixInCueSec: number
  sliderPlaybackRate: number
}

export type BuildAutoDjTickPlanResult = {
  plan: MixPlan
  phraseMix: ReturnType<typeof resolvePhraseMixSettings>
  suggestedLeadInSec: number
  effectiveLeadInSec: number
  cueArmRate: number
  delaySeconds: number
  prepareLeadSec: number
  beatSec: number
  armWindowSec: number
  holdBeatmatch: boolean
  safety: ReturnType<typeof resolveHoldBeatmatch>['safety']
  frozen: AutoDjFrozenPlan | null
  overlay: { mixOutSec: number; mixStartSec: number; mixEndSec: number }
}

function stampPhaseMeterOnPlan<T extends MixPlan>(
  plan: T,
  opts: {
    enabled: boolean
    syncMode: string
    beatCorrect: BeatCorrect
    meter: AutoDjPhaseMeterOpts
  },
): T {
  if (!opts.enabled || opts.syncMode !== 'beat-sync') return plan
  const flags = beatCorrectFlags(opts.beatCorrect)
  return {
    ...plan,
    gridAlign: phaseMeterWindowToGridAlign(opts.meter.windowId),
    gridPhraseBars: opts.meter.phraseBars,
    vinylBend: flags.vinylBend,
    kickCorrect: flags.kickCorrect,
  }
}

/** Build + freeze the AutoDJ OUT plan for one tick. Returns null if DNA plan fails. */
export function buildAutoDjTickPlan(
  input: BuildAutoDjTickPlanInput,
): BuildAutoDjTickPlanResult | null {
  const {
    config,
    nowSec: ct,
    durationSec: dur,
    outgoing: outRef,
    incoming: inRef,
    outgoingPlaybackRate: outRate,
    outgoingBpm: outBpm,
    outgoingGridOffset,
    incomingGridOffset,
    leadInSec,
    lastMixGrade,
    consecutiveWeak,
    phaseMeterEnabled,
    phaseMeter: meterOpts,
    frozen,
    mixInCueSec,
    sliderPlaybackRate,
  } = input

  const resolvedTechniques = resolveEffectiveMixTechniques(
    config.mixTechniques,
    outRef,
    inRef,
  )
  const engineStyle = resolveSectionAwareMixStyle({
    outgoing: outRef,
    incoming: inRef,
    outSec: ct,
    userStyle: config.mixStyle,
    techniques: resolvedTechniques,
    currentStyle: resolveEffectiveMixStyle(config.mixStyle, resolvedTechniques),
    sectionStyle: config.sectionStyle,
  })

  const inBpmForOverlap = resolvePlaybackBpm(inRef, null) ?? inRef.bpm ?? outBpm
  const phraseMix = resolvePhraseMixSettings(config, {
    qualityGate:
      config.autoCorrectWeakMixes && shouldApplyQualityGate(lastMixGrade)
        ? lastMixGrade
        : null,
    consecutiveWeak: config.autoCorrectWeakMixes ? consecutiveWeak : 0,
    gridsReady: bothGridsReady(
      outRef.sonic_dna,
      inRef.sonic_dna,
      outgoingGridOffset,
      incomingGridOffset,
    ),
    bpmRelDelta: Math.abs(outBpm - inBpmForOverlap) / Math.max(outBpm, inBpmForOverlap),
    outgoingSection: outgoingSectionAt(outRef, ct),
  })

  const beatCorrectForPlan =
    phaseMeterEnabled && phraseMix.syncMode === 'beat-sync'
      ? withPhaseMeterGridAlign(
          config.beatCorrect,
          phaseMeterWindowToGridAlign(meterOpts.windowId),
        )
      : config.beatCorrect

  const stamp = <T extends MixPlan>(p: T): T =>
    stampPhaseMeterOnPlan(p, {
      enabled: phaseMeterEnabled,
      syncMode: phraseMix.syncMode,
      beatCorrect: config.beatCorrect,
      meter: meterOpts,
    })

  const basePlan = buildMixPlan({
    outgoing: { ...outRef, duration: dur, beat_grid_offset: outgoingGridOffset },
    incoming: inRef,
    nowSec: ct,
    outPhraseBars: phraseMix.outPhraseBars,
    inPhraseBars: phraseMix.inPhraseBars,
    overlapBars: phraseMix.overlapBars,
    cuePriority: phraseMix.cuePriority,
    mixLengthBias: phraseMix.mixLengthBias,
    energyCurve: phraseMix.energyCurve,
    harmonicMatch: config.harmonicMatch,
    outgoingPlaybackRate: outRate,
    outgoingGridOffset,
    incomingGridOffset,
    style: engineStyle,
    autoStyle: false,
    leadInSec: 0,
    canonicalPhraseCues: phraseMix.canonicalPhraseCues,
    exactOverlap: phraseMix.exactOverlap,
    blendQuantize: config.blendQuantize,
    beatCorrect: beatCorrectForPlan,
  })
  if (!basePlan) return null

  const planWithCue: MixPlan = phraseMix.canonicalPhraseCues
    ? {
        ...basePlan,
        // Phrase-1 / AlignmentState stay authoritative — never stamp host memory/0.
        incomingStartSec: basePlan.incomingStartSec,
        resolvedIncomingSec:
          typeof basePlan.resolvedIncomingSec === 'number' &&
          Number.isFinite(basePlan.resolvedIncomingSec)
            ? basePlan.resolvedIncomingSec
            : basePlan.incomingStartSec,
      }
    : {
        ...basePlan,
        incomingStartSec: mixInCueSec,
        resolvedIncomingSec: mixInCueSec,
      }

  const suggestedLeadInSec = suggestLeadInSec({
    startAtOutgoingSec: planWithCue.startAtOutgoingSec,
    nowSec: ct,
    bpm: outBpm,
    outPhraseBars: phraseMix.outPhraseBars,
  })
  const effectiveLeadInSec = Math.max(leadInSec, suggestedLeadInSec)

  let plan = applyPrepareLeadIn(planWithCue, effectiveLeadInSec)
  const aligned = alignMixOverlayToBeatGrid({
    mixOutSec:
      typeof plan.mixOutMarkerSec === 'number' ? plan.mixOutMarkerSec : plan.startAtOutgoingSec,
    mixDurationSec: plan.mixDurationSec,
    bpm: outBpm,
    offsetSec: outgoingGridOffset,
    overlapBars: plan.overlapBars ?? phraseMix.overlapBars,
  })
  plan = {
    ...plan,
    startAtOutgoingSec: aligned.mixOutSec,
    mixOutMarkerSec: aligned.mixOutSec,
    mixDurationSec: aligned.mixDurationSec,
  }
  plan = stamp(plan)

  let nextFrozen: AutoDjFrozenPlan | null = frozen
  if (
    frozen &&
    frozen.outgoingId === outRef.id &&
    frozen.incomingId === inRef.id
  ) {
    const frozenStart = frozen.plan.startAtOutgoingSec
    if (plan.startAtOutgoingSec + 0.05 < frozenStart) {
      const keepCue = phraseMix.canonicalPhraseCues
      plan = stamp({
        ...frozen.plan,
        prepareLeadInSec: effectiveLeadInSec,
        incomingStartSec: keepCue
          ? frozen.plan.incomingStartSec
          : mixInCueSec,
        resolvedIncomingSec: keepCue
          ? frozen.plan.resolvedIncomingSec ?? frozen.plan.incomingStartSec
          : mixInCueSec,
      })
    } else {
      nextFrozen = { outgoingId: outRef.id, incomingId: inRef.id, plan }
    }
  } else if (plan.startAtOutgoingSec - ct <= PLAN_FREEZE_SEC) {
    nextFrozen = { outgoingId: outRef.id, incomingId: inRef.id, plan }
  } else if (
    frozen &&
    (frozen.outgoingId !== outRef.id || frozen.incomingId !== inRef.id)
  ) {
    nextFrozen = null
  }

  const mixDeckRates = computeMixDeckRates({
    outgoingBpm: outBpm,
    incomingBpm: resolvePlaybackBpm(inRef, null) ?? inRef.bpm ?? outBpm,
    outgoingPlaybackRate: outRate,
    incomingTargetRate: phraseMix.bpmStrategy === 'manual' ? sliderPlaybackRate : 1,
  })
  const cueArmRate = mixDeckRates.incomingRate
  const inBpmForGuard = resolvePlaybackBpm(inRef, null) ?? inRef.bpm ?? outBpm
  const { holdBeatmatch, safety } = resolveHoldBeatmatch({
    syncMode: phraseMix.syncMode,
    outgoingSonicDna: outRef.sonic_dna,
    incomingSonicDna: inRef.sonic_dna,
    outgoingBpm: outBpm,
    incomingBpm: inBpmForGuard,
    outgoingGridOffset,
    incomingGridOffset,
  })
  plan.holdBeatmatch = holdBeatmatch
  plan.masterTempoHandoff = true
  plan.phrase1Lock = true
  plan.blendFromOut = true

  const delaySeconds = plan.startAtOutgoingSec - ct
  const prepareLeadSec = Math.max(
    effectiveLeadInSec,
    typeof plan.prepareLeadInSec === 'number' ? plan.prepareLeadInSec : 0,
    prearmLeadSec(outBpm),
  )
  const beatSec = 60 / Math.max(60, outBpm)
  const armWindowSec = Math.max(prepareLeadSec + beatSec * 2, 3)
  const mixOut = plan.mixOutMarkerSec ?? plan.startAtOutgoingSec

  return {
    plan,
    phraseMix,
    suggestedLeadInSec,
    effectiveLeadInSec,
    cueArmRate,
    delaySeconds,
    prepareLeadSec,
    beatSec,
    armWindowSec,
    holdBeatmatch,
    safety,
    frozen: nextFrozen,
    overlay: {
      mixOutSec: mixOut,
      mixStartSec: mixOut,
      mixEndSec: mixOut + plan.mixDurationSec,
    },
  }
}

export type BuildAutoDjFirePlanInput = {
  config: AutoDJConfig
  phraseMix: ReturnType<typeof resolvePhraseMixSettings>
  liveOutgoing: MixTrackRef
  liveIncoming: MixTrackRef
  nowSec: number
  liveDurationSec: number
  outMarker: number
  beatSec: number
  outgoingPlaybackRate: number
  frozenPlan: MixPlan | null | undefined
  fallbackStyle: MixPlan['style']
  lastOrTickPlan: MixPlan
  phaseMeterEnabled: boolean
  phaseMeter: AutoDjPhaseMeterOpts
  detectedBpm: number | null
  sliderPlaybackRate: number
  hasIncomingReady: boolean
}

export type BuildAutoDjFirePlanResult = {
  plan: MixPlan
  mixDurationSec: number
  handoffTarget: number
  incomingRate: number
  gateReason?: string
}

/** Resolve the fire-time plan (prefer freeze) + doctrine mix length. */
export function buildAutoDjFirePlan(
  input: BuildAutoDjFirePlanInput,
): BuildAutoDjFirePlanResult {
  const {
    config,
    phraseMix,
    liveOutgoing,
    liveIncoming,
    nowSec,
    liveDurationSec,
    outMarker,
    beatSec,
    outgoingPlaybackRate,
    frozenPlan,
    fallbackStyle,
    lastOrTickPlan,
    phaseMeterEnabled,
    phaseMeter,
    detectedBpm,
    sliderPlaybackRate,
    hasIncomingReady,
  } = input

  const remainAfterOut = Math.max(0.5, liveDurationSec - outMarker - 0.05)
  const fireBeatCorrect =
    phaseMeterEnabled && phraseMix.syncMode === 'beat-sync'
      ? withPhaseMeterGridAlign(
          config.beatCorrect,
          phaseMeterWindowToGridAlign(phaseMeter.windowId),
        )
      : config.beatCorrect

  const lateFallback =
    buildMixPlan({
      outgoing: { ...liveOutgoing, duration: liveDurationSec },
      incoming: liveIncoming,
      nowSec,
      outPhraseBars: phraseMix.outPhraseBars,
      inPhraseBars: phraseMix.inPhraseBars,
      overlapBars: phraseMix.overlapBars,
      cuePriority: phraseMix.cuePriority,
      mixLengthBias: phraseMix.mixLengthBias,
      energyCurve: phraseMix.energyCurve,
      harmonicMatch: config.harmonicMatch,
      outgoingPlaybackRate,
      outgoingGridOffset:
        typeof liveOutgoing.beat_grid_offset === 'number'
          ? liveOutgoing.beat_grid_offset
          : undefined,
      incomingGridOffset:
        typeof liveIncoming.beat_grid_offset === 'number'
          ? liveIncoming.beat_grid_offset
          : undefined,
      style: fallbackStyle,
      autoStyle: false,
      leadInSec: 0,
      canonicalPhraseCues: phraseMix.canonicalPhraseCues,
      exactOverlap: phraseMix.exactOverlap,
      blendQuantize: config.blendQuantize,
      beatCorrect: fireBeatCorrect,
    }) || lastOrTickPlan

  let fresh = resolveFireMixPlan({
    frozen: frozenPlan,
    fallback: lateFallback,
    nowSec,
    outMarker,
    beatSec,
    remainAfterOut,
    exactOverlap: phraseMix.exactOverlap,
  })

  if (phaseMeterEnabled && phraseMix.syncMode === 'beat-sync') {
    fresh = stampPhaseMeterOnPlan(fresh, {
      enabled: true,
      syncMode: 'beat-sync',
      beatCorrect: config.beatCorrect,
      meter: phaseMeter,
    })
  }

  const handoffTarget = resolveIncomingRateForStrategy({
    strategy: phraseMix.bpmStrategy,
    beatmatchRate: fresh.rateRatio,
    sliderRate: sliderPlaybackRate,
  })
  const fireOutBpm =
    resolvePlaybackBpm(liveOutgoing, detectedBpm) ??
    liveOutgoing.bpm ??
    detectedBpm ??
    120
  const fireInBpm = resolvePlaybackBpm(liveIncoming, null) ?? liveIncoming.bpm ?? fireOutBpm
  fresh.rateRatio = computeMixDeckRates({
    outgoingBpm: fireOutBpm,
    incomingBpm: fireInBpm,
    outgoingPlaybackRate,
    incomingTargetRate: handoffTarget,
  }).incomingRate

  const { holdBeatmatch: fireHold } = resolveHoldBeatmatch({
    syncMode: phraseMix.syncMode,
    outgoingSonicDna: liveOutgoing.sonic_dna,
    incomingSonicDna: liveIncoming.sonic_dna,
    outgoingBpm: fireOutBpm,
    incomingBpm: fireInBpm,
    outgoingGridOffset:
      typeof liveOutgoing.beat_grid_offset === 'number'
        ? liveOutgoing.beat_grid_offset
        : undefined,
    incomingGridOffset:
      typeof liveIncoming.beat_grid_offset === 'number'
        ? liveIncoming.beat_grid_offset
        : undefined,
  })
  fresh.holdBeatmatch = fireHold
  fresh.masterTempoHandoff = true
  fresh.phrase1Lock = true
  fresh.blendFromOut = true

  const styleCut = fresh.style === 'cut'
  const plannedMixDur = styleCut
    ? Math.min(1.15, Math.max(0.65, fresh.mixDurationSec * 0.35))
    : fresh.mixDurationSec
  const fireGate = gateAutoDjFire({
    hasIncomingReady,
    plannedOverlapSec: fresh.mixDurationSec,
    exactOverlapSec: plannedMixDur,
    // BeatSync without an armed buffer → hard hold / TempoSync fallback (no soft smash).
    requireIncomingReady: phraseMix.syncMode === 'beat-sync',
  })
  const mixDurationSec = styleCut ? plannedMixDur : fireGate.mixDurationSec

  let planOut: MixPlan = { ...fresh, mixDurationSec }
  let gateReason = fireGate.ok ? undefined : fireGate.reason
  if (!fireGate.ok && phraseMix.syncMode === 'beat-sync' && !hasIncomingReady) {
    // Degrade this fire only — keep phase unlocked so we don't smash.
    planOut = {
      ...planOut,
      holdBeatmatch: false,
      reason: `${planOut.reason} · TempoSync (incoming not armed)`,
    }
    gateReason = fireGate.reason || 'BeatSync blocked — incoming not armed'
  }

  return {
    plan: planOut,
    mixDurationSec,
    handoffTarget,
    incomingRate: planOut.rateRatio,
    gateReason,
  }
}

export type { PhraseBars, MixPlan, MixTrackRef }
