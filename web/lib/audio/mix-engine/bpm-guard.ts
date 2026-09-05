/**
 * BeatSync safety — refuse phase lock when BPM confidence / octave is unreliable.
 */

import { extractMeasured } from '@/lib/audio/sonic-dna-quality'
import { MISSING_BPM_CONFIDENCE, readPairBpmConfidence } from './alignment'
import { bothGridsReady } from './phrase-mix-doctrine'
import { readGridLockScore } from './kick-onsets'

export type BeatSyncRiskCode =
  | 'low-confidence'
  | 'half-time-feel'
  | 'double-time-suspect'
  | 'pair-octave'
  | 'grids-unlocked'
  | 'ok'

export type BeatSyncSafety = {
  ok: boolean
  code: BeatSyncRiskCode
  message: string
  /** Prefer TempoSync (holdBeatmatch=false) when not ok */
  forceTempoSync: boolean
}

function octaveSuspect(a: number, b: number): 'double' | 'half' | null {
  if (!(a > 0) || !(b > 0)) return null
  const r = a / b
  if (r >= 1.85 && r <= 2.2) return 'double'
  if (r >= 0.45 && r <= 0.55) return 'half'
  return null
}

function trackFeelRisk(sonicDna: unknown, playbackBpm?: number | null): BeatSyncSafety | null {
  const measured = extractMeasured(sonicDna)
  if (!measured) return null
  const feel = String(measured.timingFeel || '').toLowerCase()
  const dnaBpm = Number(measured.bpm)
  const effective = Number(measured.effectiveBpm)
  const conf =
    typeof measured.bpmConfidence === 'number' && Number.isFinite(measured.bpmConfidence)
      ? measured.bpmConfidence
      : MISSING_BPM_CONFIDENCE

  if (feel.includes('half') && effective > 0 && dnaBpm > 0) {
    const rel = Math.abs(effective - dnaBpm) / dnaBpm
    if (rel >= 0.35) {
      return {
        ok: false,
        code: 'half-time-feel',
        message: `Half-time feel (pulse ~${Math.round(effective)} vs DNA ${Math.round(dnaBpm)})`,
        forceTempoSync: true,
      }
    }
  }

  if (playbackBpm && playbackBpm > 0 && dnaBpm > 0) {
    const oct = octaveSuspect(dnaBpm, playbackBpm)
    if (oct === 'double') {
      return {
        ok: false,
        code: 'double-time-suspect',
        message: `DNA BPM ~2× playback (${Math.round(dnaBpm)} vs ${Math.round(playbackBpm)})`,
        forceTempoSync: true,
      }
    }
    if (oct === 'half') {
      return {
        ok: false,
        code: 'half-time-feel',
        message: `DNA BPM ~½ playback (${Math.round(dnaBpm)} vs ${Math.round(playbackBpm)})`,
        forceTempoSync: true,
      }
    }
  }

  if (conf < 0.45) {
    return {
      ok: false,
      code: 'low-confidence',
      message: `Low BPM confidence (${conf.toFixed(2)})`,
      forceTempoSync: true,
    }
  }

  return null
}

/**
 * Assess whether BeatSync (phase lock) is safe for this pair.
 * Call before setting `holdBeatmatch`.
 */
export function assessBeatSyncSafety(params: {
  outgoingSonicDna?: unknown
  incomingSonicDna?: unknown
  outgoingBpm?: number | null
  incomingBpm?: number | null
  outgoingGridOffset?: number | null
  incomingGridOffset?: number | null
  /** User preference; when already tempo-sync, still report risks but forceTempoSync stays true */
  syncMode?: 'beat-sync' | 'tempo-sync'
}): BeatSyncSafety {
  if (params.syncMode === 'tempo-sync') {
    return {
      ok: true,
      code: 'ok',
      message: 'TempoSync selected',
      forceTempoSync: true,
    }
  }

  if (
    !bothGridsReady(
      params.outgoingSonicDna,
      params.incomingSonicDna,
      params.outgoingGridOffset,
      params.incomingGridOffset,
    )
  ) {
    return {
      ok: false,
      code: 'grids-unlocked',
      message: 'No beatgrid on one deck — TempoSync (lock grids for BeatSync)',
      forceTempoSync: true,
    }
  }

  const pairConf = readPairBpmConfidence(params.outgoingSonicDna, params.incomingSonicDna)
  if (pairConf < 0.45) {
    return {
      ok: false,
      code: 'low-confidence',
      message: `Pair BPM confidence ${pairConf.toFixed(2)} — using TempoSync`,
      forceTempoSync: true,
    }
  }

  // Prefer both decks soft-locked (gridLockScore) when available.
  const outScore = readGridLockScore(params.outgoingSonicDna)
  const inScore = readGridLockScore(params.incomingSonicDna)
  if (
    (outScore != null && outScore < 0.4) ||
    (inScore != null && inScore < 0.4)
  ) {
    return {
      ok: false,
      code: 'grids-unlocked',
      message: 'Weak beatgrid lock score — TempoSync until grids are aligned',
      forceTempoSync: true,
    }
  }

  const outRisk = trackFeelRisk(params.outgoingSonicDna, params.outgoingBpm)
  if (outRisk) return outRisk
  const inRisk = trackFeelRisk(params.incomingSonicDna, params.incomingBpm)
  if (inRisk) return inRisk

  const outBpm = Number(params.outgoingBpm)
  const inBpm = Number(params.incomingBpm)
  if (outBpm > 0 && inBpm > 0) {
    const oct = octaveSuspect(outBpm, inBpm)
    if (oct) {
      return {
        ok: false,
        code: 'pair-octave',
        message:
          oct === 'double'
            ? `Incoming BPM ~2× outgoing (${Math.round(inBpm)} vs ${Math.round(outBpm)})`
            : `Incoming BPM ~½ outgoing (${Math.round(inBpm)} vs ${Math.round(outBpm)})`,
        forceTempoSync: true,
      }
    }
  }

  return {
    ok: true,
    code: 'ok',
    message: 'BeatSync safe',
    forceTempoSync: false,
  }
}

/** Resolve holdBeatmatch from sync mode + DNA safety. */
export function resolveHoldBeatmatch(params: {
  syncMode?: 'beat-sync' | 'tempo-sync'
  outgoingSonicDna?: unknown
  incomingSonicDna?: unknown
  outgoingBpm?: number | null
  incomingBpm?: number | null
  outgoingGridOffset?: number | null
  incomingGridOffset?: number | null
}): { holdBeatmatch: boolean; safety: BeatSyncSafety } {
  const safety = assessBeatSyncSafety(params)
  const holdBeatmatch = params.syncMode !== 'tempo-sync' && !safety.forceTempoSync
  return { holdBeatmatch, safety }
}
