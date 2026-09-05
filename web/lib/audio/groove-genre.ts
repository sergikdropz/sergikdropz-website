/**
 * Genre from how percussion and instruments are used:
 * drum grid → hat/snare role → bass usage → tempo.
 * Title, folder, and tags are not used here.
 */
import type {
  DrumFamily,
  MeasuredBass,
  MeasuredInstrument,
  MeasuredPercussion,
  SonicDnaMeasured,
} from './sonic-dna-quality'

export interface GrooveClassification {
  family: string
  primary: string
  subgenre: string | null
  confidence: number
  reason: string[]
  timingFeel: 'full-time' | 'half-time' | 'double-time' | 'unknown'
  effectiveBpm: number | null
}

const HALF_TIME_FAMILIES = new Set(['half-time', 'boom-bap'])

type SceneFlags = {
  halfSnare: boolean
  subHeavy: boolean
  midOpen: boolean
  sparseHats: boolean
  busyHats: boolean
  offbeatHats: boolean
  washHats: boolean
  brokenKick: boolean
  fourRatio: number
  has808: boolean
  hasPad: boolean
  hasPluck: boolean
  hatDensity: number
}

export function classifyGroove(measured: {
  bpm?: number | null
  drumFamily?: DrumFamily | string | null
  bass?: MeasuredBass | null
  timingFeel?: string | null
  swingPercent?: number | null
  percussion?: MeasuredPercussion | null
  instruments?: MeasuredInstrument[] | null
  fourRatio?: number | null
  snareSteps?: number[] | null
  spectral?: { relative?: Record<string, number> } | null
}): GrooveClassification {
  const reasons: string[] = []
  const family = normalizeDrumFamily(measured.drumFamily)
  const bpm = Number(measured.bpm)
  const hasBpm = Number.isFinite(bpm) && bpm > 0
  const bassLock = String(measured.bass?.lock || 'unknown')
  const swing = Number(measured.swingPercent ?? measured.percussion?.swingPercent ?? 0)
  const flags = sceneFlags(measured)

  reasons.push(`drums: ${family}`)
  if (hasBpm) reasons.push(`tempo: ${Math.round(bpm)} BPM`)
  if (bassLock !== 'unknown') reasons.push(`bass: ${bassLock}`)
  if (flags.subHeavy) reasons.push('sub-heavy low end')
  if (flags.halfSnare) reasons.push('snare used on beat 3 (half-time pocket)')
  if (measured.percussion?.hatGrid) reasons.push(`hats used as ${measured.percussion.hatGrid}`)

  let timingFeel: GrooveClassification['timingFeel'] =
    measured.timingFeel === 'half-time' || measured.timingFeel === 'full-time' || measured.timingFeel === 'double-time'
      ? measured.timingFeel
      : family === 'half-time'
        ? 'half-time'
        : 'full-time'

  if (flags.halfSnare && hasBpm && bpm >= 132) timingFeel = 'half-time'
  if (family === 'boom-bap' && hasBpm && bpm >= 130) {
    timingFeel = 'half-time'
    reasons.push('boom-bap grid at high BPM treated as half-time')
  }

  const effectiveBpm =
    hasBpm && (timingFeel === 'half-time' || HALF_TIME_FAMILIES.has(family)) && bpm >= 120
      ? Math.round(bpm / 2)
      : hasBpm
        ? Math.round(bpm)
        : null

  if (!hasBpm && family === 'unknown') {
    return {
      family: 'Unclassified',
      primary: 'Unclassified',
      subgenre: null,
      confidence: 0.1,
      reason: ['no drum grid or tempo measured'],
      timingFeel: 'unknown',
      effectiveBpm: null,
    }
  }

  const result = classifyFamily(family, hasBpm ? bpm : null, bassLock, swing, timingFeel, flags)
  return {
    ...result,
    reason: [...reasons, ...result.reason],
    timingFeel,
    effectiveBpm,
  }
}

export function classifyMeasuredGenre(measured: SonicDnaMeasured): GrooveClassification {
  return classifyGroove({
    bpm: measured.bpm,
    drumFamily: measured.drumFamily,
    bass: measured.bass,
    timingFeel: measured.timingFeel,
    swingPercent: measured.swingPercent,
    percussion: measured.percussion,
    instruments: measured.instruments,
    fourRatio: (measured as { fourRatio?: number }).fourRatio,
    snareSteps: measured.snareSteps,
    spectral: (measured as { spectral?: { relative?: Record<string, number> } }).spectral,
  })
}

function sceneFlags(measured: Parameters<typeof classifyGroove>[0]): SceneFlags {
  const perc = measured.percussion || {}
  const rel = measured.spectral?.relative || {}
  const snares = new Set(measured.snareSteps || [])
  const hats = String(perc.hatGrid || '')
  const halfSnare = perc.snareRole === 'half-time-beat-3' || (snares.has(8) && !snares.has(4))
  const ids = new Set((measured.instruments || []).filter((item) => (item.confidence || 0) >= 0.4).map((item) => item.id))
  const has808 = measured.bass?.lock === 'sparse-808'
  const hasPad = ids.has('harmonic-pad')
  const hasPluck = ids.has('plucked-mid')
  const subHeavy = (rel.sub || 0) + (rel.bass || 0) >= 0.38
  return {
    halfSnare,
    subHeavy,
    midOpen: (rel.mid || 0) + (rel.presence || 0) >= 0.18 || hasPad || hasPluck,
    sparseHats: hats === 'sparse-accents' || hats === 'open-or-minimal',
    busyHats: hats === 'eighths' || hats === '16th-wash',
    offbeatHats: hats === 'offbeat-hats',
    washHats: hats === '16th-wash',
    brokenKick: perc.kickRole === 'syncopated-or-broken-kick',
    fourRatio: Number(measured.fourRatio || 0),
    has808,
    hasPad,
    hasPluck,
    hatDensity: Number(perc.hatDensity || 0),
  }
}

function normalizeDrumFamily(value: unknown): DrumFamily {
  const raw = String(value || 'unknown').toLowerCase()
  const allowed: DrumFamily[] = [
    'four-on-the-floor',
    'half-time',
    'breakbeat',
    'boom-bap',
    'dembow',
    'one-drop',
    'sparse',
    'unknown',
  ]
  return (allowed.find((item) => item === raw) || 'unknown') as DrumFamily
}

function classifyFamily(
  family: DrumFamily,
  bpm: number | null,
  bassLock: string,
  swing: number,
  timingFeel: GrooveClassification['timingFeel'],
  flags: SceneFlags
): Omit<GrooveClassification, 'timingFeel' | 'effectiveBpm'> {
  const eightOhEight =
    bassLock === 'sparse-808' ||
    flags.has808 ||
    (flags.subHeavy && (flags.sparseHats || flags.halfSnare || flags.brokenKick))
  const sparseOrBroken = flags.sparseHats || flags.brokenKick || family === 'breakbeat' || family === 'sparse' || family === 'half-time'
  const houseHats = flags.offbeatHats || flags.busyHats

  if (flags.halfSnare && bpm && bpm >= 132) {
    if (eightOhEight && flags.sparseHats) {
      return scored('Bass', 'Experimental Bass', 'Half-time Bass', 0.78, [
        'snare used half-time, hats used as space, sub carries the style',
      ])
    }
    if (eightOhEight && bpm >= 138 && flags.washHats) {
      return scored('Trap', 'Trap', 'Melodic Trap', 0.76, ['snare used on 3 with 808; hats used as a 16th trap ride'])
    }
    if (eightOhEight) {
      return scored('Reggae', 'Reggae', 'Dub', 0.74, ['snare used half-time + sub; pulse is doubled dub, not trance'])
    }
    return scored('Hip-Hop', 'Hip-Hop', 'Half-time', 0.62, ['snare used on 3 without 808 dominance'])
  }

  if (family === 'dembow') {
    return scored('Reggaeton', 'Reggaeton', 'Dembow', 0.82, ['kick/snare used in dembow cadence'])
  }
  if (family === 'one-drop') {
    return scored('Reggae', 'Reggae', bassLock === 'pedal-root' || flags.subHeavy ? 'Dub' : 'Steppers', 0.8, [
      'kick withheld on 1; snare/bass used as reggae weight',
    ])
  }
  if (family === 'boom-bap') {
    return scored('Hip-Hop', bpm && bpm < 80 ? 'Lo-Fi' : 'Hip-Hop', 'Boom Bap', 0.78, ['snare used on 2 and 4 in boom-bap'])
  }
  if (family === 'breakbeat') {
    if (bpm && bpm >= 160) {
      return scored('Drum & Bass', 'Drum & Bass', bassLock === 'rolling' ? 'Liquid DnB' : 'Jungle', 0.8, [
        'broken drums used at DnB tempo',
      ])
    }
    if (eightOhEight && sparseOrBroken && !flags.hasPad) {
      if (bpm && bpm >= 118 && bpm <= 136) {
        return scored('Bass', 'Experimental Bass', 'Broken 808', 0.74, [
          'kick used broken, bass used as 808, no pad bed — not funky house',
        ])
      }
      if (bpm && bpm >= 130) {
        return scored('Trap', 'Trap', 'Broken Trap', 0.72, ['broken percussion with 808 usage'])
      }
      return scored('Bass', 'Experimental Bass', null, 0.68, ['broken drums + sub usage'])
    }
    if (bpm && bpm >= 130 && bpm < 160) {
      return scored('Breaks', 'Breaks', 'UK Breaks', 0.7, ['breakbeat used at mid-tempo without 808 dominance'])
    }
    return scored('Hip-Hop', 'Hip-Hop', 'Broken Beat', 0.58, ['broken drums used without sub-led arrangement'])
  }
  if (family === 'half-time') {
    if (houseHats && !flags.sparseHats) {
      return scored('Hip-Hop', 'Hip-Hop', 'Trap', 0.78, [
        'hip-hop/trap kick-snare with house-like hats; not a house 4/4 kick',
      ])
    }
    if (eightOhEight && flags.sparseHats && bpm && bpm >= 130) {
      return scored('Bass', 'Experimental Bass', 'Half-time Bass', 0.8, ['hats used as space; snare half-time; sub leads'])
    }
    if (bassLock === 'sparse-808' || (eightOhEight && bpm && bpm >= 130 && bpm <= 155)) {
      return scored('Trap', 'Trap', 'Melodic Trap', 0.8, ['808 used sparsely under a half-time snare'])
    }
    if (bpm && bpm >= 135 && bpm <= 150) {
      return scored('Dubstep', 'Dubstep', null, 0.68, ['half-time percussion at dubstep tempo'])
    }
    if (eightOhEight) {
      return scored('Reggae', 'Reggae', 'Dub', 0.7, ['sub used as dub weight under half-time snare'])
    }
    return scored('Hip-Hop', 'Hip-Hop', 'Half-time', 0.7, ['snare used on beat 3'])
  }
  if (family === 'four-on-the-floor') {
    return classifyFourOnTheFloor(bpm, bassLock, swing, flags, houseHats)
  }
  if (family === 'sparse') {
    if (eightOhEight && bpm && bpm >= 120) {
      return scored('Bass', 'Experimental Bass', 'Sparse 808', 0.62, ['percussion used sparsely so 808/sub can lead'])
    }
    if (bpm && bpm < 100) {
      return scored('Downtempo', 'Downtempo', 'Ambient', 0.55, ['sparse drums, slow pulse'])
    }
    return scored('Minimal', 'Minimal', null, 0.5, ['sparse drum grid'])
  }

  if (timingFeel === 'half-time') {
    return scored('Hip-Hop', 'Hip-Hop', null, 0.45, ['half-time feel without a clear family'])
  }
  if (bpm && bpm >= 118 && bpm <= 132) {
    return scored('House', 'House', null, 0.35, ['tempo-only fallback; drums unknown'])
  }
  if (bpm && bpm < 90) {
    return scored('Downtempo', 'Downtempo', null, 0.35, ['tempo-only fallback; drums unknown'])
  }
  return scored('Unclassified', 'Unclassified', null, 0.2, ['insufficient groove evidence'])
}

function classifyFourOnTheFloor(
  bpm: number | null,
  bassLock: string,
  swing: number,
  flags: SceneFlags,
  houseHats: boolean
): Omit<GrooveClassification, 'timingFeel' | 'effectiveBpm'> {
  const funkyBass = bassLock === 'offbeat-syncopated'
  const rolling = bassLock === 'rolling'
  const follows = bassLock === 'follows-kick' || bassLock === 'pedal-root'

  const housePocket = bpm != null && bpm >= 118 && bpm <= 128
  if (housePocket && houseHats) {
    // disco/house hat ride — do not steal as reggae
  } else if (flags.subHeavy && flags.fourRatio < 0.36 && flags.sparseHats && !flags.hasPad && !houseHats) {
    if (bpm && bpm >= 138) {
      return scored('Reggae', 'Reggae', 'Dub', 0.7, [
        'kick used as 4/4 but hats used as space + sub — doubled dub, not trance',
      ])
    }
    if (bpm && bpm >= 118) {
      return scored('Reggae', 'Reggae', 'Steppers', 0.68, ['4/4 kick used with reggae-weight sub and sparse cymbals'])
    }
  }
  if (bpm && bpm >= 160) {
    if (flags.busyHats && !flags.subHeavy) {
      return scored('Trance', 'Hard Dance', null, 0.55, ['hats used as a busy ride at high tempo'])
    }
    return scored('Bass', 'Experimental Bass', null, 0.5, ['high tempo 4/4 without trance hat usage'])
  }
  if (bpm && bpm >= 138 && bpm < 160) {
    if (flags.busyHats && !flags.halfSnare && flags.fourRatio >= 0.38 && flags.midOpen) {
      return scored('Trance', 'Trance', rolling ? 'Psytrance' : 'Trance', 0.7, [
        'hats used busy, mid harmonic present, true 4/4',
      ])
    }
    if (flags.subHeavy && !flags.hasPad) {
      return scored('Bass', 'Experimental Bass', 'Halftime adjacent', 0.66, [
        'sub/808 used without a trance ride or pad bed',
      ])
    }
    return scored('House', 'Tech House', null, 0.5, ['high house/tech tempo without trance hat+pad usage'])
  }
  if (bpm && bpm > 128 && bpm < 138) {
    if (flags.subHeavy && flags.sparseHats && !flags.hasPad) {
      return scored('Reggae', 'Reggae', 'Steppers', 0.66, ['129–137: kick 4/4, hats used as space, sub leads'])
    }
    if (funkyBass && houseHats) {
      return scored('House', 'Tech House', 'Groovy Tech House', 0.74, ['kick 4/4, bass off-kick, hats used as a ride'])
    }
    if (follows && flags.busyHats) {
      return scored('Techno', 'Techno', 'Peak Time Techno', 0.74, ['kick-locked bass and busy hats'])
    }
    if (funkyBass) {
      return scored('House', 'Tech House', 'Groovy Tech House', 0.7, ['4/4, 129–137, syncopated bass'])
    }
    return scored('Techno', 'Techno', 'Techno', 0.7, ['straight 4/4 above house pocket'])
  }
  if (bpm && bpm >= 118 && bpm <= 128) {
    if (flags.brokenKick && flags.subHeavy && !houseHats) {
      return scored('Bass', 'Experimental Bass', null, 0.62, [
        'house tempo but kick used broken and hats not as a house ride',
      ])
    }
    if (funkyBass && (flags.offbeatHats || flags.hasPluck || swing >= 18)) {
      return scored('House', 'Funky House', swing >= 20 ? 'Deep n Funky' : 'Nu-Disco', 0.8, [
        'kick used 4/4, bass used off the kick, hats/pluck used for house/disco feel',
      ])
    }
    if (funkyBass && flags.busyHats) {
      return scored('House', 'Funky House', 'Nu-Disco', 0.76, ['4/4 + offbeat bass + hat ride'])
    }
    if (rolling) {
      return scored('House', 'Tech House', 'Rolling Tech House', 0.76, ['bass used as a rolling ostinato under 4/4'])
    }
    if (swing >= 25) {
      return scored('House', 'Deep House', null, 0.72, ['swung 4/4 house usage'])
    }
    if (follows) {
      return scored('House', 'House', 'Classic House', 0.74, ['bass used locked to the kick'])
    }
    return scored('House', 'House', null, 0.68, ['four-on-the-floor in 118–128'])
  }
  if (bpm && bpm >= 110 && bpm < 118) {
    return scored('Disco', 'Disco', funkyBass ? 'Nu-Disco' : 'Disco', 0.68, ['4/4 just under house pocket'])
  }
  if (bpm && bpm < 110) {
    if (flags.subHeavy && flags.sparseHats) {
      return scored('Reggae', 'Reggae', 'Dub', 0.62, ['slow pulse, sub used as weight, hats used as space'])
    }
    return scored('House', 'Slow House', null, 0.5, ['4/4 below typical house tempo'])
  }
  return scored('House', 'House', null, 0.55, ['4/4 without a reliable tempo'])
}

function scored(
  family: string,
  primary: string,
  subgenre: string | null,
  confidence: number,
  reason: string[]
): Omit<GrooveClassification, 'timingFeel' | 'effectiveBpm'> {
  return { family, primary, subgenre, confidence, reason }
}
