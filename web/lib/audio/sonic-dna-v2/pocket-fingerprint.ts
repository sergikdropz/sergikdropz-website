/**
 * Pocket fingerprint — compact groove vector for related tracks / mix graph.
 */

export type PocketFingerprint = {
  version: 1
  bpmBucket: number
  drumFamily: string
  timingFeel: string
  bassLock: string
  swingBucket: number
  kickHash: string
  snareHash: string
  vector: number[]
}

function stepsHash(steps: number[] | undefined): string {
  if (!Array.isArray(steps) || !steps.length) return 'none'
  return [...steps].sort((a, b) => a - b).join('-')
}

function swingBucket(swing: number | null | undefined): number {
  const s = Number(swing)
  if (!Number.isFinite(s)) return 0
  return Math.round(Math.max(0, Math.min(1, s)) * 10) / 10
}

export function buildPocketFingerprint(measured: {
  bpm?: number | null
  drumFamily?: string | null
  timingFeel?: string | null
  bassLock?: string | null
  swing?: number | null
  kickSteps?: number[]
  snareSteps?: number[]
  hatSteps?: number[]
} | null): PocketFingerprint | null {
  if (!measured) return null
  const bpm = Number(measured.bpm)
  if (!Number.isFinite(bpm) || bpm < 50) return null
  const drumFamily = String(measured.drumFamily || 'unknown').toLowerCase()
  const timingFeel = String(measured.timingFeel || 'unknown').toLowerCase()
  const bassLock = String(measured.bassLock || 'unknown').toLowerCase()
  const kick = Array.isArray(measured.kickSteps) ? measured.kickSteps : []
  const snare = Array.isArray(measured.snareSteps) ? measured.snareSteps : []
  const hat = Array.isArray(measured.hatSteps) ? measured.hatSteps : []

  const vector = [
    bpm / 200,
    kick.length / 16,
    snare.length / 16,
    hat.length / 16,
    swingBucket(measured.swing),
    drumFamily.includes('four') ? 1 : drumFamily.includes('half') ? 0.6 : drumFamily.includes('break') ? 0.4 : 0.2,
    timingFeel.includes('half') ? 0.5 : 1,
  ]

  return {
    version: 1,
    bpmBucket: Math.round(bpm / 2) * 2,
    drumFamily,
    timingFeel,
    bassLock,
    swingBucket: swingBucket(measured.swing),
    kickHash: stepsHash(kick),
    snareHash: stepsHash(snare),
    vector,
  }
}

export function pocketSimilarity(a: PocketFingerprint | null, b: PocketFingerprint | null): number {
  if (!a || !b) return 0
  if (a.vector.length !== b.vector.length) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.vector.length; i++) {
    dot += a.vector[i] * b.vector[i]
    na += a.vector[i] ** 2
    nb += b.vector[i] ** 2
  }
  if (na < 1e-9 || nb < 1e-9) return 0
  const cos = dot / (Math.sqrt(na) * Math.sqrt(nb))
  const bpmClose = Math.abs(a.bpmBucket - b.bpmBucket) <= 4 ? 0.15 : 0
  const familyBonus = a.drumFamily === b.drumFamily ? 0.1 : 0
  return Math.round(Math.max(0, Math.min(1, cos + bpmClose + familyBonus)) * 1000) / 1000
}
