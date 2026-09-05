/**
 * Mix-quality telemetry for Auto DJ A/B (phase RMS + kick residual).
 */

export type MixQualitySample = {
  phaseErrSec: number
  kickResidualMs: number
}

export type MixQualityReport = {
  samples: number
  phaseRmsSec: number
  kickResidualRmsMs: number
}

export type MixQualityGrade = 'excellent' | 'good' | 'fair' | 'poor' | 'unknown'

export type MixQualitySnapshot = MixQualityReport & {
  grade: MixQualityGrade
  label: string
  at: number
}

export function createMixQualityAccumulator() {
  const samples: MixQualitySample[] = []
  return {
    push(sample: MixQualitySample) {
      if (!Number.isFinite(sample.phaseErrSec)) return
      samples.push(sample)
    },
    report(): MixQualityReport {
      const n = samples.length
      if (!n) return { samples: 0, phaseRmsSec: 0, kickResidualRmsMs: 0 }
      let p2 = 0
      let k2 = 0
      for (const s of samples) {
        p2 += s.phaseErrSec * s.phaseErrSec
        k2 += s.kickResidualMs * s.kickResidualMs
      }
      return {
        samples: n,
        phaseRmsSec: Math.sqrt(p2 / n),
        kickResidualRmsMs: Math.sqrt(k2 / n),
      }
    },
  }
}

/** Worst of phase vs kick residual (ms) drives the grade. */
export function gradeMixQuality(
  r: Pick<MixQualityReport, 'phaseRmsSec' | 'kickResidualRmsMs' | 'samples'>,
): MixQualityGrade {
  if (typeof r.samples === 'number' && r.samples > 0 && r.samples < 4) return 'unknown'
  if (!Number.isFinite(r.phaseRmsSec) || !Number.isFinite(r.kickResidualRmsMs)) return 'unknown'
  const worstMs = Math.max(r.phaseRmsSec * 1000, r.kickResidualRmsMs)
  if (worstMs < 8) return 'excellent'
  if (worstMs < 15) return 'good'
  if (worstMs < 25) return 'fair'
  return 'poor'
}

export function mixQualityLabel(grade: MixQualityGrade): string {
  if (grade === 'excellent') return 'Tight'
  if (grade === 'good') return 'Locked'
  if (grade === 'fair') return 'Loose'
  if (grade === 'poor') return 'Drift'
  return '—'
}

export function snapshotMixQuality(
  r: MixQualityReport,
  at = Date.now(),
): MixQualitySnapshot | null {
  if (r.samples < 4) return null
  const grade = gradeMixQuality(r)
  if (grade === 'unknown') return null
  return {
    ...r,
    grade,
    label: mixQualityLabel(grade),
    at,
  }
}

export function formatMixQuality(
  r: Pick<MixQualityReport, 'phaseRmsSec' | 'kickResidualRmsMs'> & {
    samples?: number
    grade?: MixQualityGrade
  },
): string {
  if (typeof r.samples === 'number' && r.samples > 0 && r.samples < 4) return ''
  if (!Number.isFinite(r.phaseRmsSec) || !Number.isFinite(r.kickResidualRmsMs)) return ''
  const phaseMs = r.phaseRmsSec * 1000
  const grade = r.grade ?? gradeMixQuality({ ...r, samples: r.samples ?? 8 })
  const tag = grade !== 'unknown' ? ` ${mixQualityLabel(grade).toLowerCase()}` : ''
  return ` · sync ${phaseMs.toFixed(0)}ms / kick ${r.kickResidualRmsMs.toFixed(0)}ms${tag}`
}
