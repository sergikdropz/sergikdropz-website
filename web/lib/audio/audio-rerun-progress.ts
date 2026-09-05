/**
 * Live job progress for “Re-run audio” — independent of DSP completeness gates
 * (those are 33/34/45/67/100 based on BPM/drums/key and confuse the button).
 */

export type AudioRerunPhase =
  | 'idle'
  | 'queued'
  | 'analyzing'
  | 'saving'
  | 'rewriting'
  | 'done'
  | 'stalled'

export type AudioRerunProgress = {
  percent: number
  label: string
  phase: AudioRerunPhase
}

/** Typical single-track agent pipeline wall time for the asymptotic climb. */
export const AUDIO_RERUN_EXPECTED_MS = 75_000

/**
 * Smooth 0→~90% while analyzing (never hits 100 until phase says done).
 * Completely ignores DSP gate percentages.
 */
export function estimateAudioRerunProgress(input: {
  phase: AudioRerunPhase
  startedAtMs: number
  nowMs?: number
  status?: string | null
}): AudioRerunProgress {
  const now = input.nowMs ?? Date.now()
  const phase = input.phase

  if (phase === 'idle') return { percent: 0, label: 'Re-run audio', phase }
  if (phase === 'done') return { percent: 100, label: 'Complete', phase }
  if (phase === 'rewriting') return { percent: 96, label: 'Rewriting sections', phase }
  if (phase === 'saving') return { percent: 92, label: 'Saving measured DNA', phase }
  if (phase === 'stalled') {
    const elapsed = Math.max(0, now - input.startedAtMs)
    const held = Math.min(94, Math.max(88, Math.round(5 + (1 - Math.exp(-elapsed / (AUDIO_RERUN_EXPECTED_MS * 0.45))) * 85)))
    return { percent: held, label: 'Still working…', phase }
  }

  const elapsed = Math.max(0, now - input.startedAtMs)
  const raw = 1 - Math.exp(-elapsed / (AUDIO_RERUN_EXPECTED_MS * 0.45))
  const climb = Math.round(5 + raw * 85) // 5 → ~90

  if (phase === 'queued' || (input.status && input.status !== 'processing' && phase !== 'analyzing')) {
    return { percent: Math.min(12, climb), label: 'Queued', phase: 'queued' }
  }

  return {
    percent: Math.min(90, Math.max(14, climb)),
    label: 'Analyzing audio',
    phase: 'analyzing',
  }
}

/** Monotonic merge so the bar never jumps backward. */
export function advanceAudioRerunPercent(prev: number, next: number): number {
  const a = Number.isFinite(prev) ? prev : 0
  const b = Number.isFinite(next) ? next : 0
  return Math.min(100, Math.max(a, b))
}
