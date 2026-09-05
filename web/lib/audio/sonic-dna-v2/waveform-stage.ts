/**
 * Waveform stage — envelope stats for player UI + dynamics prose.
 * Pure helpers; generation I/O lives in the job runner.
 */

export type WaveformEnvelope = {
  peaks: number[]
  samples: number
  version: number
  sampleRate?: number
  generatedAt: string
  stats: WaveformStats
  bands?: { low: number[]; mid: number[]; high: number[] }
}

export type WaveformStats = {
  peak: number
  rms: number
  crest: number
  /** 0–1 mean energy */
  mean: number
  /** Approximate first sustained energy jump (sec proxy via bin index). */
  dropBin: number
  dropRatio: number
  dynamicsLabel: 'intimate' | 'balanced' | 'cresty' | 'dense'
}

export function computeWaveformStats(peaks: number[]): WaveformStats {
  const clean = (Array.isArray(peaks) ? peaks : []).map((n) => Math.abs(Number(n) || 0))
  if (!clean.length) {
    return {
      peak: 0,
      rms: 0,
      crest: 0,
      mean: 0,
      dropBin: 0,
      dropRatio: 0,
      dynamicsLabel: 'balanced',
    }
  }
  const peak = Math.max(...clean, 1e-9)
  const mean = clean.reduce((s, n) => s + n, 0) / clean.length
  const rms = Math.sqrt(clean.reduce((s, n) => s + n * n, 0) / clean.length) || 1e-9
  const crest = peak / rms
  const intro = Math.max(4, Math.floor(clean.length * 0.08))
  const introMean = clean.slice(0, intro).reduce((s, n) => s + n, 0) / intro
  let dropBin = 0
  for (let i = intro; i < clean.length; i++) {
    if (clean[i] > introMean * 1.8 && clean[i] > peak * 0.35) {
      dropBin = i
      break
    }
  }
  const dynamicsLabel: WaveformStats['dynamicsLabel'] =
    crest >= 4.5 ? 'cresty' : crest >= 3.2 ? 'dense' : mean < 0.18 ? 'intimate' : 'balanced'

  return {
    peak: round4(peak),
    rms: round4(rms),
    crest: round4(crest),
    mean: round4(mean),
    dropBin,
    dropRatio: round4(dropBin / clean.length),
    dynamicsLabel,
  }
}

export function buildWaveformEnvelope(
  peaks: number[],
  opts?: { sampleRate?: number; version?: number },
): WaveformEnvelope {
  const stats = computeWaveformStats(peaks)
  return {
    peaks,
    samples: peaks.length,
    version: opts?.version ?? 2,
    sampleRate: opts?.sampleRate ?? 44100,
    generatedAt: new Date().toISOString(),
    stats,
  }
}

export function dynamicsProse(stats: WaveformStats | null | undefined): string {
  if (!stats) return ''
  const drop =
    stats.dropRatio > 0.05
      ? ` First energy lift near ${(stats.dropRatio * 100).toFixed(0)}% into the file.`
      : ' Groove energy arrives early.'
  return `Waveform reads ${stats.dynamicsLabel} (crest ${stats.crest}, RMS ${stats.rms}).${drop}`
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000
}
