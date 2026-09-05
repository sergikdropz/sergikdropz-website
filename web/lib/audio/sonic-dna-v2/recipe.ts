/**
 * Sonic DNA v2 pipeline recipe — staged signal flow for accurate comprehensive reports.
 * Recipe id is stamped on DNA so prose/analysis versions stay auditable.
 *
 * Aligns with pipeline-architecture.ts (intel v3):
 * health → waveform → measure → normalize → classify → blend → compose → challenge → publish
 */

export const SONIC_DNA_RECIPE_ID = 'sonic-dna-v2.2-intel' as const

export const SONIC_DNA_V2_STAGES = [
  'queued',
  'health',
  'waveform',
  'measure',
  'normalize',
  'classify',
  'blend',
  'compose',
  'challenge',
  'publish',
  'done',
  'failed',
] as const

export type SonicDnaV2Stage = (typeof SONIC_DNA_V2_STAGES)[number]

export type SonicDnaJobProgress = {
  stage: SonicDnaV2Stage
  percent: number
  label: string
  message?: string
  recipeId: typeof SONIC_DNA_RECIPE_ID
  startedAt?: string
  updatedAt?: string
  /** DSP gate snapshot (independent of job %). */
  dspPercent?: number
  dspStatus?: string
}

const STAGE_META: Record<SonicDnaV2Stage, { percent: number; label: string }> = {
  queued: { percent: 2, label: 'Queued' },
  health: { percent: 6, label: 'Audio health check' },
  waveform: { percent: 16, label: 'Waveform envelope' },
  measure: { percent: 38, label: 'DSP measure (drums ∥ harmony)' },
  normalize: { percent: 48, label: 'Normalizing measured DNA' },
  classify: { percent: 56, label: 'Genre engine classify lock' },
  blend: { percent: 64, label: 'Blend preference + polymath board' },
  compose: { percent: 82, label: 'Compose encyclopedia + narrative' },
  challenge: { percent: 92, label: 'Accuracy challenge' },
  publish: { percent: 97, label: 'Publishing' },
  done: { percent: 100, label: 'Complete' },
  failed: { percent: 100, label: 'Failed' },
}

export function stageProgress(
  stage: SonicDnaV2Stage,
  extra?: Partial<SonicDnaJobProgress>,
): SonicDnaJobProgress {
  const meta = STAGE_META[stage]
  return {
    stage,
    percent: meta.percent,
    label: meta.label,
    recipeId: SONIC_DNA_RECIPE_ID,
    updatedAt: new Date().toISOString(),
    ...extra,
  }
}

/** Monotonic percent advance within a stage (sub-steps). */
export function interpolateStagePercent(stage: SonicDnaV2Stage, fraction01: number): number {
  const order = SONIC_DNA_V2_STAGES.filter(
    (s): s is Exclude<SonicDnaV2Stage, 'failed'> => s !== 'failed',
  )
  const idx = order.indexOf(stage as Exclude<SonicDnaV2Stage, 'failed'>)
  if (idx < 0) return STAGE_META[stage].percent
  const cur = STAGE_META[stage].percent
  const nextStage = order[idx + 1]
  const next = nextStage ? STAGE_META[nextStage].percent : 100
  const t = Math.max(0, Math.min(1, fraction01))
  return Math.round(cur + (next - cur) * t)
}

export function isTerminalV2Stage(stage: SonicDnaV2Stage): boolean {
  return stage === 'done' || stage === 'failed'
}
