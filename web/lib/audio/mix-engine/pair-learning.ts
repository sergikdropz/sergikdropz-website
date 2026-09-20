/**
 * Persist per-pair Auto DJ memory: last good cueΔ, lock latency, preferred OUT bars.
 */

import type { MixQualityGrade } from './mix-quality'
import type { OutPhraseBars } from './types'
import type { MixScorecard } from './mix-scorecard'

export const PAIR_LEARNING_KEY = 'sergik.autoDj.pairLearning'
export const PAIR_LEARNING_MAX = 80

export type PairLearningEntry = {
  pairKey: string
  outgoingTrackId: string
  incomingTrackId: string
  updatedAt: number
  /** Last mix that graded good/excellent */
  lastGoodCueDeltaMs: number | null
  lastGoodLockMs: number | null
  preferredOutPhraseBars: OutPhraseBars | null
  lastGrade: MixQualityGrade
  goodCount: number
  weakCount: number
}

function pairKey(outId: string, inId: string): string {
  return `${outId}→${inId}`
}

function isOutBars(n: unknown): n is OutPhraseBars {
  return n === 8 || n === 16 || n === 24 || n === 32
}

export function parsePairLearning(raw: unknown): PairLearningEntry[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === 'object')
    .filter(
      (e) =>
        typeof e.pairKey === 'string' &&
        typeof e.outgoingTrackId === 'string' &&
        typeof e.incomingTrackId === 'string',
    )
    .map((e) => ({
      pairKey: e.pairKey as string,
      outgoingTrackId: e.outgoingTrackId as string,
      incomingTrackId: e.incomingTrackId as string,
      updatedAt: typeof e.updatedAt === 'number' ? e.updatedAt : 0,
      lastGoodCueDeltaMs:
        typeof e.lastGoodCueDeltaMs === 'number' && Number.isFinite(e.lastGoodCueDeltaMs)
          ? e.lastGoodCueDeltaMs
          : null,
      lastGoodLockMs:
        typeof e.lastGoodLockMs === 'number' && Number.isFinite(e.lastGoodLockMs)
          ? e.lastGoodLockMs
          : null,
      preferredOutPhraseBars: isOutBars(e.preferredOutPhraseBars)
        ? e.preferredOutPhraseBars
        : null,
      lastGrade: (e.lastGrade as MixQualityGrade) || 'unknown',
      goodCount: typeof e.goodCount === 'number' ? e.goodCount : 0,
      weakCount: typeof e.weakCount === 'number' ? e.weakCount : 0,
    }))
    .slice(0, PAIR_LEARNING_MAX)
}

export function readPairLearning(): PairLearningEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(PAIR_LEARNING_KEY)
    if (!raw) return []
    return parsePairLearning(JSON.parse(raw))
  } catch {
    return []
  }
}

function writePairLearning(entries: PairLearningEntry[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(PAIR_LEARNING_KEY, JSON.stringify(entries.slice(0, PAIR_LEARNING_MAX)))
  } catch {
    /* quota */
  }
}

export function getPairLearning(
  outgoingTrackId: string | null | undefined,
  incomingTrackId: string | null | undefined,
  store?: PairLearningEntry[],
): PairLearningEntry | null {
  if (!outgoingTrackId || !incomingTrackId) return null
  const key = pairKey(outgoingTrackId, incomingTrackId)
  const list = store ?? readPairLearning()
  return list.find((e) => e.pairKey === key) ?? null
}

/**
 * After a graded mix, update pair memory. Good mixes stamp cue/lock/OUT;
 * weak mixes increment weakCount and may shorten preferred OUT.
 */
export function pushPairLearning(params: {
  outgoingTrackId: string
  incomingTrackId: string
  grade: MixQualityGrade
  scorecard?: MixScorecard | null
  outPhraseBars?: OutPhraseBars | number | null
}): PairLearningEntry[] {
  const { outgoingTrackId, incomingTrackId, grade } = params
  if (!outgoingTrackId || !incomingTrackId || grade === 'unknown') {
    return readPairLearning()
  }
  const key = pairKey(outgoingTrackId, incomingTrackId)
  const prev = getPairLearning(outgoingTrackId, incomingTrackId)
  const good = grade === 'excellent' || grade === 'good'
  const weak = grade === 'fair' || grade === 'poor'
  const cueMs = params.scorecard?.fireCueDeltaMs ?? null
  const lockMs =
    params.scorecard?.overlapLockMs ?? params.scorecard?.preArmLockMs ?? null
  const outBars = isOutBars(params.outPhraseBars) ? params.outPhraseBars : null

  let preferredOut: OutPhraseBars | null = prev?.preferredOutPhraseBars ?? null
  if (good && outBars) preferredOut = outBars
  else if (weak && preferredOut && preferredOut > 8) preferredOut = 8
  else if (weak && !preferredOut) preferredOut = 8

  const next: PairLearningEntry = {
    pairKey: key,
    outgoingTrackId,
    incomingTrackId,
    updatedAt: Date.now(),
    lastGoodCueDeltaMs: good && cueMs != null ? cueMs : prev?.lastGoodCueDeltaMs ?? null,
    lastGoodLockMs: good && lockMs != null ? lockMs : prev?.lastGoodLockMs ?? null,
    preferredOutPhraseBars: preferredOut,
    lastGrade: grade,
    goodCount: (prev?.goodCount ?? 0) + (good ? 1 : 0),
    weakCount: (prev?.weakCount ?? 0) + (weak ? 1 : 0),
  }

  const rest = readPairLearning().filter((e) => e.pairKey !== key)
  const all = [next, ...rest].slice(0, PAIR_LEARNING_MAX)
  writePairLearning(all)
  return all
}

/** Bias pick score when this pair previously locked well. */
export function pairLearningScoreBias(entry: PairLearningEntry | null | undefined): number {
  if (!entry) return 0
  if (entry.goodCount >= 2 && entry.weakCount === 0) return 0.06
  if (entry.lastGrade === 'excellent') return 0.05
  if (entry.lastGrade === 'good') return 0.03
  if (entry.lastGrade === 'poor' && entry.weakCount >= 2) return -0.12
  if (entry.lastGrade === 'fair') return -0.05
  return 0
}

/** Prefer last-good OUT depth when present and not quality-gated. */
export function preferredOutFromPairLearning(
  entry: PairLearningEntry | null | undefined,
): OutPhraseBars | null {
  if (!entry?.preferredOutPhraseBars) return null
  return entry.preferredOutPhraseBars
}

/**
 * Cue bias in seconds toward last good fire cueΔ (signed media − planned).
 * Used only as a soft hint when |bias| is under half a beat.
 */
export function cueBiasSecFromPairLearning(
  entry: PairLearningEntry | null | undefined,
  bpm: number,
): number | null {
  if (entry?.lastGoodCueDeltaMs == null || !Number.isFinite(entry.lastGoodCueDeltaMs)) {
    return null
  }
  const halfBeat = (60 / Math.max(60, bpm)) * 0.5
  const sec = entry.lastGoodCueDeltaMs / 1000
  if (Math.abs(sec) > halfBeat) return null
  return sec
}
