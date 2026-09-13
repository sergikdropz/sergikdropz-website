/**
 * Bass / pocket inference from measured drums + spectral hints.
 * DSP-first: no title/folder genre leakage.
 */

export type BassLock =
  | 'follows-kick'
  | 'offbeat-syncopated'
  | 'sparse-808'
  | 'rolling'
  | 'pedal-root'
  | 'melodic'
  | 'syncopated'
  | 'unknown'

export type BassPocketInference = {
  lock: BassLock
  rootNote: string | null
  slidesLikely: boolean
  timingFeel: string | null
  swingPercent: number | null
  confidence: number
  reason: string[]
  character: string[]
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {}
}

function mapBasslineTypeToLock(type: string | null | undefined, rhythm?: string | null): BassLock {
  const t = String(type || '').toLowerCase()
  const r = String(rhythm || '').toLowerCase()
  if (/808|sparse/.test(t) || r === 'sparse') return 'sparse-808'
  if (/reese|neuro|rolling/.test(t) || r === 'rolling') return 'rolling'
  if (/wobble|syncop/.test(t) || r === 'syncopated') return 'syncopated'
  if (/melodic/.test(t) || r === 'melodic') return 'melodic'
  if (/offbeat/.test(t) || /offbeat/.test(r)) return 'offbeat-syncopated'
  if (/follows|kick|synth/.test(t) || r === 'follows-kick') return 'follows-kick'
  if (/pedal|sub/.test(t)) return 'pedal-root'
  return 'unknown'
}

function lockFromDrumFamily(family: string | null | undefined, bpm: number | null): BassLock {
  const f = String(family || '').toLowerCase()
  if (f.includes('half') || f.includes('boom')) return 'sparse-808'
  if (f.includes('break')) return 'rolling'
  if (f.includes('one-drop') || f.includes('one drop')) return 'offbeat-syncopated'
  if (f.includes('dembow')) return 'syncopated'
  if (f.includes('four')) {
    // House/disco pocket often rides offbeat bass or kick-locked synth bass
    if (bpm != null && bpm >= 118 && bpm <= 128) return 'offbeat-syncopated'
    return 'follows-kick'
  }
  if (f.includes('sparse')) return 'sparse-808'
  return 'unknown'
}

/**
 * Infer bass lock + pocket timing from drum peer / measured / frequency bands.
 */
export function inferBassPocket(input: {
  bpm?: number | null
  drumFamily?: string | null
  timingFeel?: string | null
  swingPercent?: number | null
  key?: string | null
  existingLock?: string | null
  bassline?: { type?: string; rhythm?: string; slides?: boolean; character?: string[]; subHarmonics?: boolean } | null
  lowFreqEnergy?: number | null
  kickSteps?: number[]
  snareSteps?: number[]
}): BassPocketInference {
  const reason: string[] = []
  const bpm = Number.isFinite(Number(input.bpm)) ? Number(input.bpm) : null
  const existing = String(input.existingLock || '').trim()
  if (existing && existing !== 'unknown') {
    return {
      lock: existing as BassLock,
      rootNote: input.key ? String(input.key).split(/\s+/)[0] : null,
      slidesLikely: Boolean(input.bassline?.slides),
      timingFeel: input.timingFeel || null,
      swingPercent: input.swingPercent ?? null,
      confidence: 0.92,
      reason: ['kept existing measured bass lock'],
      character: input.bassline?.character || [],
    }
  }

  let lock: BassLock = 'unknown'
  let confidence = 0.45
  const character = [...(input.bassline?.character || [])]

  if (input.bassline?.type) {
    lock = mapBasslineTypeToLock(input.bassline.type, input.bassline.rhythm)
    if (lock !== 'unknown') {
      confidence = 0.78
      reason.push(`bassline type ${input.bassline.type}`)
    }
  }

  if (lock === 'unknown') {
    lock = lockFromDrumFamily(input.drumFamily, bpm)
    if (lock !== 'unknown') {
      confidence = Math.max(confidence, 0.68)
      reason.push(`drum family ${input.drumFamily}`)
    }
  }

  const low = Number(input.lowFreqEnergy)
  if (Number.isFinite(low)) {
    if (low > 0.72 && (lock === 'unknown' || lock === 'follows-kick')) {
      if (String(input.timingFeel || '').includes('half') || String(input.drumFamily || '').includes('half')) {
        lock = 'sparse-808'
        reason.push('high sub energy + half-time')
        confidence = Math.max(confidence, 0.72)
      }
    }
    if (low > 0.65) character.push('sub-heavy')
  }

  let timingFeel = input.timingFeel || null
  if (!timingFeel && bpm != null) {
    const kicks = input.kickSteps || []
    const snares = input.snareSteps || []
    if (bpm >= 130 && snares.length <= 2 && kicks.length <= 2) {
      timingFeel = 'half-time'
      reason.push('sparse kick/snare at high BPM → half-time feel')
      confidence = Math.max(confidence, 0.7)
    } else if (bpm >= 110) {
      timingFeel = 'full-time'
    }
  }

  let swingPercent = input.swingPercent ?? null
  if (swingPercent == null && lock === 'offbeat-syncopated') {
    swingPercent = 18
    reason.push('default mild swing for offbeat bass pocket')
  }

  if (lock === 'unknown') {
    lock = 'follows-kick'
    reason.push('fallback follows-kick')
    confidence = Math.min(confidence, 0.4)
  }

  const rootNote = input.key ? String(input.key).replace(/\s+(major|minor|maj|min).*$/i, '').trim() || null : null

  return {
    lock,
    rootNote,
    slidesLikely: Boolean(input.bassline?.slides) || lock === 'sparse-808',
    timingFeel,
    swingPercent,
    confidence,
    reason,
    character: Array.from(new Set(character)),
  }
}

/** Pull bassline/timing hints from drum expert / comprehensive blobs. */
export function bassHintsFromPeers(peers: {
  drums?: unknown
  comprehensive?: unknown
  measured?: unknown
}): {
  bassline: Record<string, any> | null
  lowFreq: number | null
  timingFeel: string | null
  swingPercent: number | null
  existingLock: string | null
} {
  const drums = asRecord(peers.drums)
  const advanced = asRecord(drums.advancedAnalysis)
  const bassline = asRecord(drums.bassline || advanced.bassline)
  const comprehensive = asRecord(peers.comprehensive)
  const measured = asRecord(peers.measured)
  const timing =
    measured.timingFeel ||
    advanced.timing?.type ||
    drums.timing?.type ||
    comprehensive.technical?.timingFeel ||
    null
  const swing =
    measured.swingPercent ??
    measured.percussion?.swingPercent ??
    drums.swingPercent ??
    null
  const lowRaw =
    comprehensive.technical?.frequencyBands?.lowFreq ??
    drums.frequency?.lowFreq ??
    (advanced.bassline?.subHarmonics ? 0.75 : null)
  const low = Number.isFinite(Number(lowRaw)) ? Number(lowRaw) : null

  return {
    bassline: Object.keys(bassline).length ? bassline : null,
    lowFreq: low,
    timingFeel: timing ? String(timing) : null,
    swingPercent: Number.isFinite(Number(swing)) ? Number(swing) : null,
    existingLock: measured.bass?.lock || null,
  }
}
