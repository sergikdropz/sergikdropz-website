/**
 * World-genre encyclopedia + psychoacoustics for measured grooves.
 * Port of knowledge/scripts/sonic_dna_intelligence.py so agent/UI fill
 * matches the Python measure path depth for every groove class.
 */

import kbJson from '@/lib/audio/data/genre-intelligence.json'
import type { SonicDnaMeasured } from '@/lib/audio/sonic-dna-quality'
import { extractMeasured, parseSonicDna } from '@/lib/audio/sonic-dna-quality'
import { extractInstrumentTypes, inferInstrumentUsageFromMeasured } from '@/lib/audio/instrument-usage'

type GenreProfile = {
  family?: string
  related?: string[]
  subgenres?: string[]
  emotions?: string[]
  regions?: string[]
  eras?: string[]
  evolutionFrom?: string[]
  techniques?: string[]
  influences?: string[]
  history?: string
  culture?: string
  psychology?: string
  theory?: string
  production?: string
  socialUsage?: string
  sonicIntent?: string
  listenerEffects?: string
}

type GenreKb = {
  version?: string
  method?: string
  science?: Record<string, string>
  profiles?: Record<string, GenreProfile>
}

const KB = kbJson as GenreKb

const PRIMARY_ALIASES: Record<string, string> = {
  'dub reggae': 'Reggae',
  dub: 'Reggae',
  steppers: 'Reggae',
  'roots reggae': 'Reggae',
  'deep n funky': 'Funky House',
  'funky house': 'Funky House',
  'tech house': 'Tech House',
  'deep house': 'Deep House',
  house: 'House',
  'hip hop': 'Hip-Hop',
  'hip-hop': 'Hip-Hop',
  trap: 'Hip-Hop',
  'drum & bass': 'Drum & Bass',
  'drum and bass': 'Drum & Bass',
  dnb: 'Drum & Bass',
  breaks: 'Breaks',
  breakbeat: 'Breaks',
  'experimental bass': 'Experimental Bass',
  'bass music': 'Experimental Bass',
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {}
}

function unique(values: Array<string | null | undefined>): string[] {
  const out: string[] = []
  for (const value of values) {
    const text = String(value || '').trim()
    if (!text || out.includes(text)) continue
    out.push(text)
  }
  return out
}

function resolvePrimary(raw: string | null | undefined, familyHint?: string | null): string {
  const text = String(raw || '').trim()
  if (!text) return familyHint || 'Unclassified'
  const alias = PRIMARY_ALIASES[text.toLowerCase()]
  if (alias) return alias
  const profiles = KB.profiles || {}
  if (profiles[text]) return text
  const match = Object.keys(profiles).find((key) => key.toLowerCase() === text.toLowerCase())
  return match || text
}

function profileFor(primary: string, family: string): GenreProfile {
  const profiles = KB.profiles || {}
  return profiles[primary] || profiles[family] || profiles.Unclassified || {}
}

/** Default kick/snare/hat roles from drum family when DSP roles were never written. */
export function synthesizePercussionRoles(measured: SonicDnaMeasured | Record<string, any>): {
  kickRole: string
  snareRole: string
  hatGrid: string
} {
  const existing = asRecord(measured.percussion)
  const family = String(measured.drumFamily || '').toLowerCase()
  const feel = String(measured.timingFeel || '').toLowerCase()
  const bpm = Number(measured.bpm) || 0

  let kickRole = String(existing.kickRole || '')
  let snareRole = String(existing.snareRole || '')
  let hatGrid = String(existing.hatGrid || '')

  if (!kickRole) {
    if (family.includes('four')) kickRole = 'four-on-the-floor'
    else if (
      family.includes('break') ||
      family.includes('boom') ||
      family.includes('half') ||
      family.includes('one-drop') ||
      family.includes('dembow') ||
      family.includes('sparse')
    ) {
      kickRole = 'syncopated-or-broken-kick'
    } else kickRole = 'four-on-the-floor'
  }
  if (!snareRole) {
    if (feel.includes('half') || family.includes('half') || family.includes('boom')) {
      snareRole = 'half-time-beat-3'
    } else if (family.includes('dembow')) snareRole = 'dembow-or-syncopated-snare'
    else if (family.includes('break')) snareRole = 'broken-snare'
    else snareRole = 'backbeat-2-and-4'
  }
  if (!hatGrid) {
    if (family.includes('four') && bpm >= 110 && bpm <= 132) hatGrid = 'offbeat-hats'
    else if (family.includes('four') && bpm >= 138) hatGrid = 'eighths'
    else if (
      family.includes('one-drop') ||
      family.includes('sparse') ||
      family.includes('boom') ||
      family.includes('half')
    ) {
      hatGrid = 'sparse-accents'
    } else hatGrid = 'eighths'
  }

  return { kickRole, snareRole, hatGrid }
}

export function synthesizeArrangementLines(measured: SonicDnaMeasured | Record<string, any>): string[] {
  const perc = {
    ...asRecord(measured.percussion),
    ...synthesizePercussionRoles(measured),
  }
  const bass = asRecord(measured.bass)
  const drum = String(measured.drumFamily || '')
  const hipHop = ['half-time', 'breakbeat', 'boom-bap'].includes(drum)
  const hats = perc.hatGrid
  const eighthHatUse = hipHop
    ? 'Hats are used as a house-like eighth-note ride over hip-hop/trap kick-snare (hats are color, not a house kick).'
    : 'Hats are used as an eighth-note ride that keeps house/tech time.'

  const hatUse: Record<string, string> = {
    '16th-wash': 'Hats are used as a continuous 16th ride (club/trance pressure).',
    eighths: eighthHatUse,
    'offbeat-hats': 'Hats are used on the offbeat — disco/house ride, not a reggae one-drop skip.',
    'sparse-accents': 'Hats are used as space and accents, leaving room for bass (dub/trap/experimental).',
    'open-or-minimal': 'Cymbals are mostly open or absent — the groove is carried by kick and bass.',
  }
  const snareUse: Record<string, string> = {
    'backbeat-2-and-4': 'Snare/clap is used as a 2-and-4 backbeat (house, hip-hop, steppers).',
    'half-time-beat-3': 'Snare is used on beat 3 — half-time feel (trap, dub, dubstep), not four-on-the-floor trance.',
    'dembow-or-syncopated-snare': 'Snare is used in a syncopated/dembow cadence.',
    'broken-snare': 'Snare is used in a broken pattern (breaks, hip-hop, experimental bass).',
    'no-clear-snare': 'No stable snare role — percussion is kick/hat or texture-led.',
  }
  const kickUse: Record<string, string> = {
    'four-on-the-floor': 'Kick is used as a steady four-on-the-floor pulse.',
    'syncopated-or-broken-kick': 'Kick is used syncopated/broken, not as a house pulse.',
  }
  const bassUseMap: Record<string, string> = {
    'offbeat-syncopated': hipHop
      ? 'Bass is used off the kick (syncopated pocket under hip-hop/trap drums).'
      : 'Bass is used off the kick (funky/syncopated), which in a house pocket makes funky house; with sparse hats and sub it can still be reggae/bass.',
    'sparse-808': 'Bass is used as sparse 808/sub hits — trap and experimental bass language.',
    'follows-kick': 'Bass is locked to the kick (techno/classic house).',
    rolling: 'Bass is used as a rolling ostinato (tech house/psy).',
    'pedal-root': 'Bass is used as a pedal/root drone (dub, minimal).',
    'synth-bass': 'Bass is used as a synth-bass voice — tonal low end with pocket weight.',
  }

  const lines = [
    kickUse[perc.kickRole],
    snareUse[perc.snareRole],
    hatUse[hats],
    bassUseMap[String(bass.lock || '')] ||
      (bass.lock
        ? `Bass is used with a ${bass.lock} lock${bass.rootNote ? ` around ${bass.rootNote}` : ''}.`
        : null),
  ].filter(Boolean) as string[]

  const named = ((measured as any).instruments || [])
    .filter((i: any) => (i?.confidence || 0) >= 0.4)
    .map((i: any) => String(i.label || ''))
  const houseRide = ['offbeat-hats', 'eighths', '16th-wash'].includes(hats)
  const bassLed =
    ['sparse-accents', 'open-or-minimal'].includes(hats) ||
    perc.snareRole === 'half-time-beat-3' ||
    perc.kickRole === 'syncopated-or-broken-kick'
  if (named.some((n: string) => /pad|keys|harmonic/i.test(n))) {
    lines.push(
      'Sustained mid harmonic (keys/pad) is used as a bed, which supports house/disco more than sparse bass music.',
    )
  } else if (houseRide && hipHop) {
    lines.push('House-like hats sit on top of a hip-hop/trap kick-snare; kick and snare decide genre, not the hat ride.')
  } else if (bassLed && named.some((n: string) => /808|sub/i.test(n))) {
    lines.push('Low end is used as sub/808 weight without a pad bed — bass-music, dub, or trap arrangement.')
  } else if (houseRide) {
    lines.push(
      "Hats/cymbals are used as a ride over 4/4, so the low-end label is a house/disco sub, not a trap 808 by itself.",
    )
  }
  return unique(lines)
}

function usageRelated(measured: Record<string, any>): string[] {
  const perc = asRecord(measured.percussion)
  const hats = perc.hatGrid
  const snare = perc.snareRole
  const kick = perc.kickRole
  const drum = measured.drumFamily
  const bpm = Number(measured.bpm) || 0
  const extra: string[] = []
  if (hats === 'offbeat-hats' && bpm >= 110 && bpm <= 132) {
    extra.push('Disco', 'Chicago House', 'Boogie', 'Nu-Disco')
  }
  if (hats === 'sparse-accents' || hats === 'open-or-minimal') {
    extra.push('Dub', 'UK Steppers', 'Sound-system culture')
  }
  if (snare === 'half-time-beat-3' && ['eighths', 'offbeat-hats'].includes(hats) && drum !== 'four-on-the-floor') {
    extra.push('Trap', 'Southern Hip-Hop', 'Atlanta Trap')
  } else if (snare === 'half-time-beat-3' && hats === '16th-wash') {
    extra.push('Atlanta Trap', 'Drill')
  } else if (snare === 'half-time-beat-3') {
    extra.push('Dancehall', 'Dub', 'Halftime')
  }
  if (kick === 'syncopated-or-broken-kick' || drum === 'breakbeat') {
    extra.push('UK Bass', 'Broken Beat', 'Funk breaks')
  }
  if (drum === 'dembow') extra.push('Dancehall', 'Latin urban')
  if (drum === 'boom-bap') extra.push('East Coast Hip-Hop', 'Jazz Rap')
  if (drum === 'one-drop') extra.push('Roots Reggae', 'Rocksteady')
  if (['eighths', '16th-wash'].includes(hats) && drum === 'four-on-the-floor' && bpm >= 138) {
    extra.push('Techno', 'Trance')
  }
  return unique(extra)
}

function energyDance(measured: Record<string, any>): [number, number] {
  const rel = asRecord(asRecord(measured.spectral).relative)
  const bpm = Number(measured.bpm) || 120
  const drum = measured.drumFamily
  const hats = asRecord(measured.percussion).hatGrid
  const arousal = (Number(rel.presence) || 0) + (Number(rel.air) || 0) + (Number(rel.kick) || 0) * 0.5
  const energy = 4 + Math.round(Math.min(5, arousal * 12 + Math.max(0, bpm - 100) / 40))
  let dance = 5
  if (drum === 'four-on-the-floor' && bpm >= 115 && bpm <= 132) {
    dance = 8
    if (hats === 'offbeat-hats' || hats === 'eighths') dance = 9
  } else if (drum === 'dembow' || drum === 'one-drop') dance = 8
  else if (drum === 'breakbeat' || drum === 'half-time' || drum === 'boom-bap') dance = 6
  else if (drum === 'sparse' || drum === 'unknown') dance = 3
  if (hats === 'sparse-accents' || hats === 'open-or-minimal') dance = Math.max(4, dance - 2)
  return [Math.max(1, Math.min(10, energy)), Math.max(1, Math.min(10, dance))]
}

function modePsychology(measured: Record<string, any>): string {
  const scale = String(measured.scale || '').toLowerCase()
  const key = measured.key || 'an unnamed center'
  if (measured.unpitched) {
    return (
      'Pitch center is too weak to name. Without a stable tonic, Western major/minor valence maps do not apply; ' +
      'listeners will lean on rhythm and spectrum instead.'
    )
  }
  if (scale === 'minor' || /\bmin(or)?\b/i.test(String(key))) {
    return (
      `Named center ${key}. In many Western listeners, minor collections trend toward lower valence ` +
      '(Juslin/Gabrielsson-type findings) — a tendency, not a universal. Rhythm and bass weight can override that coloring.'
    )
  }
  if (scale === 'major' || /\bmaj(or)?\b/i.test(String(key))) {
    return (
      `Named center ${key}. Major collections often trend brighter in Western pop/club hearing, ` +
      'again as a statistical tendency rather than a law.'
    )
  }
  return `Named center ${key}.`
}

function socialUsageFn(drum: string, hat: string, snare: string, bpm: number, primary: string): string {
  if (hat === 'offbeat-hats' && bpm >= 110 && bpm <= 132) {
    return 'Social usage: a shared dance-floor clock. People fill the gaps between kicks together — talking, stepping, and staying in the room without needing a lyric to agree.'
  }
  if (hat === 'sparse-accents' || hat === 'open-or-minimal') {
    return 'Social usage: huddle and sound-system congregation. The social unit is the chest and the sub, not a marching line of hats.'
  }
  if (snare === 'half-time-beat-3') {
    return 'Social usage: lean-back togetherness. The snare on 3 invites heads and shoulders more than a four-on-the-floor march.'
  }
  if (drum === 'four-on-the-floor' && bpm >= 138) {
    return 'Social usage: endurance warehouse coupling — stay on the grid for a long time with few harmonic events.'
  }
  if (drum === 'boom-bap' || drum === 'breakbeat') {
    return 'Social usage: nod-and-cypher energy. The broken kick is a conversation starter more than a mass-march cue.'
  }
  return `Social usage: ${primary} as a room template — people use the measured pulse to decide whether to dance, lean, or listen.`
}

function sonicIntentFn(drum: string, hat: string, lock: string, primary: string): string {
  if (hat === 'offbeat-hats' && drum === 'four-on-the-floor') {
    return 'Sonic intent: keep bodies on a house/disco lift — kick as heartbeat, offbeat hats as the invitation to move in the holes.'
  }
  if (hat === 'sparse-accents' || hat === 'open-or-minimal') {
    return 'Sonic intent: open space so bass and delay can act as architecture. The mix wants weight and air, not a hat wash.'
  }
  if (drum === 'half-time' || /half-time/i.test(lock)) {
    return 'Sonic intent: slow the felt pocket against a faster clock so attention drops into the snare and sub.'
  }
  if (lock === 'offbeat-syncopated' && drum === 'four-on-the-floor') {
    return 'Sonic intent: conversation between bass and kick — bounce rather than lockstep — typical of funky/disco house usage.'
  }
  return `Sonic intent: instantiate ${primary} as a motor-and-mood template from this file's drums, tempo, bass, and percussion — not from a crate name.`
}

function listenerEffectFn(
  drum: string,
  hat: string,
  snare: string,
  lock: string,
  energy: number,
  dance: number,
  emotions: string,
  modeNote: string,
): string {
  const bits = [
    `Listener effect: predicted affect cluster ${emotions}.`,
    `Heuristic arousal ${energy}/10 and dance affordance ${dance}/10 from pulse, hats, and spectrum — not a lab score.`,
  ]
  if (hat === 'offbeat-hats') {
    bits.push(
      'Offbeat hats create a small, repeating prediction error that many listeners feel as lift (groove-pleasure curve).',
    )
  }
  if (hat === 'sparse-accents' || hat === 'open-or-minimal') {
    bits.push(
      "Sparse hats lower temporal density so sub and space can dominate the nervous system's 'where am I' map.",
    )
  }
  if (snare === 'half-time-beat-3') {
    bits.push(
      'Snare on 3 half-times the felt meter; the body often couples to the slower pocket even when the clock BPM is high.',
    )
  }
  if (lock === 'offbeat-syncopated') {
    bits.push('Bass off the kick is moderate syncopation — the pleasure peak for groove rather than stiffness or chaos.')
  }
  if (drum === 'four-on-the-floor') {
    bits.push('Stable 4/4 recruits sensorimotor synchronization: the pulse becomes something to join, not just to hear.')
  }
  bits.push(modeNote)
  bits.push('These are listening and movement tendencies, not a guarantee of inner state and not a therapeutic claim.')
  return bits.join(' ')
}

function composePsychoacoustics(input: {
  measured: Record<string, any>
  prof: GenreProfile
  science: Record<string, string>
  energy: number
  dance: number
  primary: string
  clock: string
  feel: string
  kick: string
  snare: string
  hat: string
  inst: string[]
}) {
  const { measured, prof, science, energy, dance, primary, clock, feel, kick, snare, hat, inst } = input
  const drum = measured.drumFamily || 'unknown'
  const lock = asRecord(measured.bass).lock || 'unspecified bass'
  const bpm = Number(measured.bpm) || 0
  const emotions = (prof.emotions || []).slice(0, 4).join(', ') || 'an unmarked affect'
  const modeNote = modePsychology(measured)
  let social = prof.socialUsage || socialUsageFn(drum, hat, snare, bpm, primary)
  if (!/^social usage/i.test(social)) social = `Social usage: ${social}`
  let intent = prof.sonicIntent || sonicIntentFn(drum, hat, String(lock), primary)
  if (!/^sonic intent/i.test(intent)) intent = `Sonic intent: ${intent}`
  let effect =
    prof.listenerEffects ||
    listenerEffectFn(drum, hat, snare, String(lock), energy, dance, emotions, modeNote)
  if (!/^listener effect/i.test(effect)) effect = `Listener effect: ${effect}`
  const scene = inst.slice(0, 3).join(', ') || 'the measured drum/bass scene'
  const formula =
    `Activation formula: drums (${kick} on a ${drum} grid) → tempo/feel (${clock}, ${feel || 'unknown feel'}) → ` +
    `bass (${lock}) → hats and snare (${hat}; ${snare}) → instruments (${scene}) → ` +
    `listener (${emotions}; arousal ${energy}/10, dance ${dance}/10).`
  const report = [
    social,
    intent,
    formula,
    effect,
    science.activationFormula,
    science.socialCoupling,
    drum === 'four-on-the-floor' ? science.entrainment : null,
    lock === 'offbeat-syncopated' || hat === 'offbeat-hats' ? science.syncopation : null,
    snare === 'half-time-beat-3' || feel === 'half-time' ? science.halfTime : null,
    inst.some((n) => /sub|808/i.test(n)) ? science.subBass : null,
    primary === 'Reggae' ? science.delaySpace : null,
  ]
    .filter(Boolean)
    .join(' ')
  return {
    socialUsage: social,
    sonicIntent: intent,
    activationFormula: formula,
    listenerEffects: effect,
    report,
  }
}

/** True when encyclopedia layers are missing or stub-thin vs gold measure depth. */
export function isEncyclopediaThin(dna: unknown): boolean {
  const measured = extractMeasured(dna)
  if (!measured) return true
  const intel = asRecord(measured.intelligence)
  const layers = asRecord(asRecord(measured.report).layers)
  const history = String(intel.historical?.historicalContext || layers.historical || '')
  const psycho = String(intel.psychoacoustics?.report || layers.psychoacoustics || '')
  const description = String(intel.description || '')
  if (/awaiting audio analysis/i.test(history + psycho + description)) return true
  if (history.length < 280) return true
  if (psycho.length < 280) return true
  if (description.length < 400) return true
  if (!intel.method || !String(intel.method).includes('encyclopedia')) return true
  return false
}

export function composeGenreIntelligence(
  measuredInput: SonicDnaMeasured | Record<string, any>,
): Record<string, any> {
  const roles = synthesizePercussionRoles(measuredInput)
  const lines = synthesizeArrangementLines({
    ...measuredInput,
    percussion: { ...asRecord(measuredInput.percussion), ...roles },
  })
  const measured: Record<string, any> = {
    ...measuredInput,
    percussion: { ...asRecord(measuredInput.percussion), ...roles },
    arrangement: {
      ...asRecord(measuredInput.arrangement),
      lines:
        Array.isArray(measuredInput.arrangement?.lines) && measuredInput.arrangement!.lines!.length
          ? measuredInput.arrangement!.lines
          : lines,
    },
  }

  const genre = asRecord(measured.genre)
  const primary = resolvePrimary(genre.primary || genre.audioPrimary, genre.family)
  const family = String(genre.family || profileFor(primary, primary).family || primary)
  const sub = genre.subgenre || genre.audioSubgenre || null
  const prof = profileFor(primary, family)
  const perc = asRecord(measured.percussion)
  const arr = asRecord(measured.arrangement)
  const bpm = measured.bpm
  const feel = measured.timingFeel
  const effective = measured.effectiveBpm
  const key = measured.key
  const camelot = measured.camelot
  const science = KB.science || {}
  const related = unique([...(prof.related || []), ...usageRelated(measured)])
  const [energy, dance] = energyDance(measured)
  const instDetailed = extractInstrumentTypes(inferInstrumentUsageFromMeasured(measured))
  const inst =
    instDetailed.length > 0
      ? instDetailed
      : (measured.instruments || [])
          .filter((i: any) => (i?.confidence || 0) >= 0.4)
          .map((i: any) => String(i.label || ''))
          .filter(Boolean)

  const clock = bpm != null ? `${Math.round(Number(bpm))} BPM` : 'unmeasured tempo'
  const pocket =
    effective != null && bpm != null && Math.abs(Number(effective) - Number(bpm)) >= 8
      ? `effective pocket ~${Math.round(Number(effective))} BPM`
      : clock
  const usageBits = (arr.lines || []).join(' ')
  const hat = perc.hatGrid || 'unspecified hats'
  const snare = perc.snareRole || 'unspecified snare'
  const kick = perc.kickRole || 'unspecified kick'
  const lock = asRecord(measured.bass).lock

  const historicalContext = [
    prof.history,
    `This file's clock is ${clock} (${feel || 'unknown feel'}; ${pocket}). Kick is used as ${kick}; snare as ${snare}; hats as ${hat}.`,
    snare === 'half-time-beat-3' || feel === 'half-time' ? science.halfTime : null,
    lock === 'offbeat-syncopated' ? science.syncopation : null,
    measured.drumFamily === 'four-on-the-floor' ? science.entrainment : null,
    inst.some((n: string) => /sub|808/i.test(n)) ? science.subBass : null,
    primary === 'Reggae' ? science.delaySpace : null,
  ]
    .filter(Boolean)
    .join(' ')

  const culturalDesc = [
    prof.culture,
    related.length
      ? `Related traditions on the map (not extra labels for this file): ${related.slice(0, 10).join(', ')}.`
      : null,
  ]
    .filter(Boolean)
    .join(' ')

  const psych = [
    prof.psychology,
    modePsychology(measured),
    `Estimated arousal ${energy}/10 and dance affordance ${dance}/10 from spectrum, pulse, and hat usage — heuristic, not a lab score.`,
  ]
    .filter(Boolean)
    .join(' ')

  const psycho = composePsychoacoustics({
    measured,
    prof,
    science,
    energy,
    dance,
    primary,
    clock,
    feel: String(feel || ''),
    kick,
    snare,
    hat,
    inst,
  })

  const journey =
    `The motor story follows how percussion is used: ${usageBits || `${kick}; ${snare}; ${hat}`} ` +
    `Emotionally the encyclopedia of ${primary} suggests ${(prof.emotions || []).slice(0, 5).join(', ') || 'an unmarked affect'}, ` +
    `instantiated at ${pocket}` +
    (key && !measured.unpitched ? ` in ${key}` : '') +
    '.'

  const musicologyDesc = [prof.theory, prof.production, camelot ? `Camelot ${camelot}.` : null]
    .filter(Boolean)
    .join(' ')

  const fusion = related.length
    ? `${primary} sits in the ${family} family${sub ? ` with sub-dialect ${sub}` : ''}. Adjacent world styles for context: ${related.slice(0, 8).join(', ')}.`
    : `${primary} / ${family}.`

  const description = [
    `Groove class ${primary}${sub ? ` / ${sub}` : ''} from measured usage, not from a crate name.`,
    usageBits,
    historicalContext,
    culturalDesc,
    psych,
  ]
    .filter(Boolean)
    .join(' ')

  const intention =
    psycho.sonicIntent ||
    `Function: ${primary} as a social-motor template — ${
      measured.drumFamily === 'four-on-the-floor' ? 'dance-floor 4/4 coupling' : 'a non-4/4 or half-time body map'
    }. The mix privileges ${inst.slice(0, 3).join(', ') || 'the measured drum/bass scene'}.`

  return {
    description,
    intention,
    summary: description.slice(0, 400) + (description.length > 400 ? '…' : ''),
    emotional: {
      primaryEmotions: prof.emotions || [],
      emotionalJourney: journey,
      psychologicalProfile: psych,
      moodTransitions: [],
    },
    musical: {
      keySignature: key || 'Unknown',
      timeSignature: '4/4',
      scale: measured.scale,
      harmonicComplexity: prof.theory || '',
      rhythmicPatterns: [measured.drumFamily, perc.hatGrid, perc.snareRole, feel, lock, clock]
        .filter(Boolean)
        .join(' · '),
      instrumentation: inst,
      productionTechniques: prof.techniques || [],
      musicalInfluences: prof.influences || [],
    },
    historical: {
      eraInfluences: prof.eras || [],
      historicalContext,
      evolutionFrom: prof.evolutionFrom || [],
      innovationPoints: [
        'Usage-first classification: drums → hats/snare role → bass → tempo.',
        ...related.slice(0, 3).map((r) => `Related map includes ${r}`),
      ],
    },
    regional: {
      primaryRegions: prof.regions || [],
      culturalInfluences: (prof.related || []).slice(0, 6),
      regionalCharacteristics: culturalDesc,
      crossCulturalElements: related.slice(0, 8),
    },
    genres: {
      primaryGenres: [primary, family].filter(Boolean),
      subgenres: [sub, ...(prof.subgenres || [])].filter(Boolean),
      genreFusion: fusion,
      genreEvolution: [...(prof.evolutionFrom || []).slice(0, 6), primary].join(' ← '),
      genreCharacteristics: (prof.techniques || []).slice(0, 8),
      genreInfluences: related,
    },
    technical: {
      bpm: bpm != null ? Math.round(Number(bpm)) : null,
      energyLevel: energy,
      danceability: dance,
      key,
      camelot,
      technicalDescription: [
        prof.production,
        `Spectral bands relative: ${JSON.stringify(asRecord(asRecord(measured.spectral).relative))}.`,
      ]
        .filter(Boolean)
        .join(' '),
    },
    drums: {
      patternRecognition: `${measured.drumFamily} grid; kick ${kick}; snare ${snare}; hats ${hat}.`,
      complexity: perc.styles || [],
    },
    musicology: {
      description: musicologyDesc,
      era: {
        decade: (prof.eras || ['unspecified era'])[0],
        description: prof.history,
        eraInfluences: prof.eras || [],
        historicalPeriod: (prof.eras || []).join('; '),
      },
      style: {
        primaryStyle: primary,
        description: prof.theory,
        styleCharacteristics: prof.techniques || [],
        stylisticInfluences: prof.influences || [],
      },
      production: {
        techniques: prof.techniques || [],
        description: prof.production,
        productionEra: (prof.eras || [null])[0],
      },
    },
    cultural: {
      description: culturalDesc,
      regions: prof.regions || [],
      culturalInfluences: related.slice(0, 8),
      regionalCharacteristics: culturalDesc,
      crossCulturalElements: related.slice(0, 8),
    },
    relatedGenres: related,
    relatedTraditionsText: related.length
      ? `World-genre map for this class — not extra crate labels for this file. ${related.map((r) => `• ${r}.`).join(' ')}`
      : '',
    usageText: (arr.lines || []).join('\n'),
    listeningBenefits: '',
    psychoacoustics: psycho,
    scienceNotes: [
      science.entrainment,
      science.syncopation,
      science.subBass,
      science.modeValence,
      science.socialCoupling,
      science.activationFormula,
    ].filter(Boolean),
    kbVersion: KB.version,
    method: KB.method || 'measured-groove + world-genre encyclopedia + psychoacoustics study',
  }
}

/**
 * Attach full encyclopedia intelligence + report layers when groove core exists
 * but encyclopedia is thin (agent path / preference stubs).
 */
export function applyGenreEncyclopedia(
  dna: unknown,
  opts?: { force?: boolean; preserveAgentPolymath?: boolean },
): Record<string, any> {
  const root = parseSonicDna(dna) || (dna && typeof dna === 'object' ? { ...(dna as object) } : {})
  const next = JSON.parse(JSON.stringify(root)) as Record<string, any>
  const measured = extractMeasured(next)
  if (!measured?.bpm || !measured?.drumFamily || String(measured.drumFamily) === 'unknown') {
    return next
  }
  if (!opts?.force && !isEncyclopediaThin(next)) return next

  const roles = synthesizePercussionRoles(measured)
  const lines = synthesizeArrangementLines({
    ...measured,
    percussion: { ...asRecord(measured.percussion), ...roles },
  })
  const arrangementLines =
    Array.isArray(measured.arrangement?.lines) && measured.arrangement.lines.length
      ? measured.arrangement.lines
      : lines
  const intel = composeGenreIntelligence({
    ...measured,
    percussion: { ...asRecord(measured.percussion), ...roles },
    arrangement: { ...asRecord(measured.arrangement), lines: arrangementLines },
  })

  const priorGenre = asRecord(measured.genre)
  const priorIntel = asRecord(measured.intelligence)
  const priorLayers = asRecord(asRecord(measured.report).layers)
  const preserveAgent = opts?.preserveAgentPolymath !== false
  const priorPsych = preserveAgent
    ? String(
        priorLayers.psychological ||
          priorIntel.emotional?.psychologicalProfile ||
          asRecord(next.emotional).psychologicalProfile ||
          asRecord(next.psychology).psychologicalProfile ||
          '',
      ).trim()
    : ''
  const priorPsycho = preserveAgent
    ? String(
        priorLayers.psychoacoustics ||
          priorIntel.psychoacoustics?.report ||
          asRecord(next.psychoacoustics).report ||
          '',
      ).trim()
    : ''
  const priorPsychoObj = preserveAgent
    ? {
        ...asRecord(priorIntel.psychoacoustics),
        ...asRecord(next.psychoacoustics),
      }
    : {}

  const judgment = String(priorGenre.judgment || '').trim()
  if (judgment && !String(intel.description).includes(judgment.slice(0, 40))) {
    intel.description = `${intel.description} ${judgment}`.trim()
  }

  // Prefer polymath agent psychology / psychoacoustics when already substantial (unless genre was just remapped)
  const psychProfile =
    priorPsych.length >= 90 ? priorPsych : String(intel.emotional?.psychologicalProfile || '')
  const psychoReport =
    priorPsycho.length >= 90 ? priorPsycho : String(intel.psychoacoustics?.report || '')
  if (priorPsych.length >= 90) {
    intel.emotional = { ...asRecord(intel.emotional), psychologicalProfile: priorPsych }
  }
  if (priorPsycho.length >= 90) {
    intel.psychoacoustics = {
      ...asRecord(intel.psychoacoustics),
      ...priorPsychoObj,
      report: priorPsycho,
    }
  }

  const primary = resolvePrimary(priorGenre.audioPrimary || priorGenre.primary, priorGenre.family)
  next.measured = {
    ...measured,
    percussion: { ...asRecord(measured.percussion), ...roles },
    arrangement: { ...asRecord(measured.arrangement), lines: arrangementLines },
    genre: {
      ...priorGenre,
      primary: priorGenre.primary || primary,
      family: priorGenre.family || profileFor(primary, primary).family || primary,
      audioPrimary: priorGenre.audioPrimary || primary,
      source:
        priorGenre.source === 'user-preferred'
          ? 'hybrid'
          : priorGenre.source || 'audio-measured',
    },
    intelligence: {
      ...asRecord(measured.intelligence),
      ...intel,
      description: intel.description,
      intention: intel.intention,
      listeningBenefits: asRecord(measured.intelligence).listeningBenefits || intel.listeningBenefits,
      emotional: {
        ...asRecord(intel.emotional),
        psychologicalProfile: psychProfile || intel.emotional?.psychologicalProfile,
      },
      psychoacoustics: {
        ...asRecord(intel.psychoacoustics),
        report: psychoReport || intel.psychoacoustics?.report,
      },
    },
    report: {
      ...asRecord(measured.report),
      description: intel.description,
      facts: [
        measured.bpm ? `BPM: ${Math.round(Number(measured.bpm))}` : null,
        measured.drumFamily ? `Drums: ${measured.drumFamily}` : null,
        roles.kickRole ? `Kick: ${roles.kickRole}` : null,
        roles.snareRole ? `Snare: ${roles.snareRole}` : null,
        roles.hatGrid ? `Hats: ${roles.hatGrid}` : null,
        measured.key ? `Key: ${measured.key}` : null,
      ].filter(Boolean),
      layers: {
        ...asRecord(asRecord(measured.report).layers),
        dsp: [
          measured.bpm
            ? `Pulse: ${Math.round(Number(measured.bpm))} BPM${measured.timingFeel ? ` (${measured.timingFeel})` : ''}`
            : null,
          measured.drumFamily ? `Drum family: ${measured.drumFamily}` : null,
          `Kick: ${roles.kickRole}`,
          `Snare: ${roles.snareRole}`,
          `Hats: ${roles.hatGrid}`,
          asRecord(measured.bass).lock
            ? `Bass lock: ${asRecord(measured.bass).lock}${
                asRecord(measured.bass).rootNote ? ` around ${asRecord(measured.bass).rootNote}` : ''
              }`
            : null,
          measured.key
            ? `Root / key: ${measured.key}${measured.camelot ? ` / Camelot ${measured.camelot}` : ''}`
            : null,
          ...arrangementLines,
        ]
          .filter(Boolean)
          .join('\n'),
        historical: intel.historical.historicalContext,
        cultural: intel.cultural.description,
        psychological: psychProfile || intel.emotional.psychologicalProfile,
        psychoacoustics: psychoReport || intel.psychoacoustics.report,
        musicological: intel.musicology.description,
        benefits: '',
      },
    },
  }

  next.description = intel.description
  next.intention = intel.intention
  next.historical = { ...(next.historical || {}), historicalContext: intel.historical.historicalContext }
  next.cultural = { ...(next.cultural || {}), description: intel.cultural.description }
  next.emotional = {
    ...(next.emotional || {}),
    psychologicalProfile: psychProfile || intel.emotional.psychologicalProfile,
    primaryEmotions: intel.emotional.primaryEmotions,
    emotionalJourney: intel.emotional.emotionalJourney,
  }
  next.psychology = {
    ...(next.psychology || {}),
    psychologicalProfile: psychProfile || asRecord(next.psychology).psychologicalProfile,
  }
  next.psychoacoustics = {
    ...asRecord(intel.psychoacoustics),
    ...(next.psychoacoustics || {}),
    report: psychoReport || asRecord(next.psychoacoustics).report || intel.psychoacoustics.report,
  }
  next.musicology = { ...(next.musicology || {}), description: intel.musicology.description }
  next.technical = {
    ...(next.technical || {}),
    energyLevel: intel.technical.energyLevel,
    danceability: intel.technical.danceability,
    bpm: intel.technical.bpm ?? next.technical?.bpm,
  }
  next._encyclopedia = {
    appliedAt: new Date().toISOString(),
    kbVersion: KB.version,
    method: intel.method,
    primary,
  }
  return next
}
