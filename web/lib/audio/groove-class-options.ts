import { extractMeasured, parseSonicDna } from '@/lib/audio/sonic-dna-quality'
import { displayTrackGenre, displayTrackSubgenre, type TrackDisplaySource } from '@/lib/audio/track-display'
import { SUBGENRE_PROFILES } from '@/utils/extendedSubgenreClassifier'
import { ensureSonicDnaReportSectionsFilled } from '@/lib/audio/sonic-dna-report-sections'
import { applyGenreEncyclopedia } from '@/lib/audio/compose-genre-intelligence'
import genreIntelligence from '@/lib/audio/data/genre-intelligence.json'

/** Groove-class primaries the DSP classifier can emit. */
export const GROOVE_CLASS_GROUPS: { family: string; genres: string[] }[] = [
  { family: 'House', genres: ['Funky House', 'Tech House', 'Deep House', 'House', 'Slow House', 'Psychedelic House'] },
  { family: 'Disco / funk / soul', genres: ['Disco', 'Funk', 'Soul'] },
  { family: 'Techno / trance / hard', genres: ['Techno', 'Trance', 'Hard Dance', 'Minimal', 'EDM', 'Hardcore'] },
  { family: 'Hip-Hop / trap', genres: ['Hip-Hop', 'Trap', 'Lo-Fi'] },
  { family: 'Reggae / bass', genres: ['Reggae', 'Dubstep', 'Experimental Bass', 'Reggaeton', 'Bass Music'] },
  { family: 'Broken / fast', genres: ['Breaks', 'Drum & Bass'] },
  { family: 'Electronic / other', genres: ['Downtempo', 'Electronic'] },
]

export const GROOVE_CLASS_GENRES = GROOVE_CLASS_GROUPS.flatMap((group) => group.genres)

const PARENT_FAMILY: Record<string, string> = {
  House: 'House',
  Disco: 'Disco / funk / soul',
  Funk: 'Disco / funk / soul',
  Soul: 'Disco / funk / soul',
  Techno: 'Techno / trance / hard',
  Trance: 'Techno / trance / hard',
  'Hard Dance': 'Techno / trance / hard',
  EDM: 'Techno / trance / hard',
  Hardcore: 'Techno / trance / hard',
  'Hip-Hop': 'Hip-Hop / trap',
  Reggae: 'Reggae / bass',
  Dubstep: 'Reggae / bass',
  'Bass Music': 'Reggae / bass',
  'Experimental Bass': 'Reggae / bass',
  'Drum & Bass': 'Broken / fast',
  Electronic: 'Electronic / other',
}

/** When picking subgenres, treat these parents as one bass continuum. */
const SUBGENRE_PARENT_ALIASES: Record<string, string[]> = {
  'experimental bass': ['Experimental Bass', 'Bass Music', 'Dubstep'],
  'bass music': ['Experimental Bass', 'Bass Music', 'Dubstep'],
  dubstep: ['Dubstep', 'Experimental Bass', 'Bass Music'],
}

const RELATED_BY_CLASS: Record<string, string[]> = {
  'Funky House': ['Chicago House', 'Disco', 'Boogie', 'Nu-Disco', 'French House', 'UK Garage', 'Soulful House', 'Deep House'],
  'Tech House': ['Minimal House', 'Techno', 'UK Tech House', 'Groovy Tech House'],
  'Deep House': ['Soulful House', 'Organic House', 'Chicago House', 'Slow House', 'Psychedelic House'],
  House: ['Funky House', 'Tech House', 'Deep House', 'Disco', 'Psychedelic House'],
  'Slow House': ['Deep House', 'Organic House', 'Balearic', 'House'],
  'Psychedelic House': ['Acid House', 'Organic House', 'Space Disco', 'Progressive House', 'Deep House', 'Psytrance'],
  Disco: ['Boogie', 'Nu-Disco', 'Funky House', 'Chicago House'],
  Techno: ['Peak Time Techno', 'Minimal', 'Tech House', 'Hard Dance'],
  Reggae: ['Dub', 'Steppers', 'Dancehall'],
  Trap: ['Hip-Hop', 'Atlanta Trap', 'Melodic Trap', 'Experimental Bass'],
  'Hip-Hop': ['Trap', 'Boom Bap', 'Broken Beat', 'Lo-Fi', 'Southern Rap'],
  'Experimental Bass': [
    'Spacebass',
    'Wubs',
    'Wonky',
    'Leftfield Bass',
    'UK Bass',
    'Broken 808',
    'Half-time Bass',
    'Sparse 808',
    'Future Bass',
    'Footwork',
    'Halftime',
    'Wave',
    'Colour Bass',
    'Neurobass',
    'Tearout',
    'Dubstep',
    'Trap',
    'Breaks',
    'Grime',
    'IDM',
  ],
  'Bass Music': [
    'Experimental Bass',
    'Spacebass',
    'Wubs',
    'Wonky',
    'Leftfield Bass',
    'UK Bass',
    'Future Bass',
    'Dubstep',
  ],
  'Drum & Bass': ['Jungle', 'Liquid DnB', 'Breaks'],
  Breaks: ['UK Breaks', 'Hip-Hop', 'Big Beat'],
  Dubstep: ['UK Bass', 'Experimental Bass', 'Riddim', 'Deep Dubstep', 'Brostep', 'Wubs'],
  Reggaeton: ['Dembow', 'Dancehall'],
  Trance: ['Psytrance', 'Hard Dance'],
  'Hard Dance': ['Trance', 'Techno'],
  Downtempo: ['Ambient', 'Lo-Fi', 'Slow House'],
  'Lo-Fi': ['Hip-Hop', 'Downtempo'],
  Minimal: ['Techno', 'Tech House'],
}

const DRUM_FAMILY_GENRES: Record<string, string[]> = {
  'four-on-the-floor': [
    'Funky House',
    'Tech House',
    'Deep House',
    'House',
    'Slow House',
    'Psychedelic House',
    'Disco',
    'Techno',
    'Trance',
    'Minimal',
    'Reggae',
  ],
  'half-time': ['Hip-Hop', 'Trap', 'Reggae', 'Dubstep', 'Experimental Bass'],
  breakbeat: ['Hip-Hop', 'Breaks', 'Drum & Bass', 'Experimental Bass', 'Trap'],
  'boom-bap': ['Hip-Hop', 'Lo-Fi'],
  dembow: ['Reggaeton'],
  'one-drop': ['Reggae'],
  sparse: ['Downtempo', 'Minimal', 'Experimental Bass'],
}

function unique(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const text = String(value || '').trim()
    if (!text || text === 'Unclassified' || seen.has(text)) continue
    seen.add(text)
    out.push(text)
  }
  return out
}

function allSubgenreProfiles() {
  return Object.values(SUBGENRE_PROFILES)
}

export function encyclopediaParentGenres(): string[] {
  return unique(allSubgenreProfiles().map((profile) => profile.parent)).sort((a, b) => a.localeCompare(b))
}

function profileForLabel(label: string) {
  const needle = label.trim().toLowerCase()
  if (!needle) return null
  return (
    allSubgenreProfiles().find(
      (profile) =>
        profile.name.toLowerCase() === needle ||
        profile.parent.toLowerCase() === needle ||
        profile.aliases.some((alias) => alias.toLowerCase() === needle),
    ) || null
  )
}

/** Subgenres (and aliases) that belong with a chosen parent/groove class. */
export function subgenresForGenre(genre: string): string[] {
  const needle = genre.trim().toLowerCase()
  if (!needle) {
    return unique(allSubgenreProfiles().map((profile) => profile.name)).sort((a, b) => a.localeCompare(b))
  }
  const match = profileForLabel(genre)
  const parent = match?.parent || genre
  const parentKeys = unique([
    parent,
    genre,
    ...(SUBGENRE_PARENT_ALIASES[needle] || []),
    ...(SUBGENRE_PARENT_ALIASES[parent.toLowerCase()] || []),
  ])
  const siblings = allSubgenreProfiles().filter((profile) =>
    parentKeys.some(
      (key) =>
        profile.parent.toLowerCase() === key.toLowerCase() ||
        profile.name.toLowerCase() === key.toLowerCase() ||
        profile.name.toLowerCase() === needle,
    ),
  )
  const encyclopedia = parentKeys.flatMap((key) => {
    const profile = (genreIntelligence as { profiles?: Record<string, { subgenres?: string[]; related?: string[] }> })
      .profiles?.[key]
    return [...(profile?.subgenres || []), ...(profile?.related || [])]
  })
  return unique([
    ...siblings.map((profile) => profile.name),
    ...siblings.flatMap((profile) => profile.aliases),
    ...parentKeys.flatMap((key) => RELATED_BY_CLASS[key] || []),
    ...(match?.relatedSubgenres || []),
    ...encyclopedia,
  ]).sort((a, b) => a.localeCompare(b))
}

export function encyclopediaGenreGroups(): { family: string; genres: string[] }[] {
  const byFamily = new Map<string, string[]>()
  const add = (family: string, genre: string) => {
    const list = byFamily.get(family) || []
    if (!list.includes(genre)) list.push(genre)
    byFamily.set(family, list)
  }
  for (const group of GROOVE_CLASS_GROUPS) {
    for (const genre of group.genres) add(group.family, genre)
  }
  for (const parent of encyclopediaParentGenres()) {
    add(PARENT_FAMILY[parent] || 'Electronic / other', parent)
  }
  return [...byFamily.entries()].map(([family, genres]) => ({
    family,
    genres: genres.sort((a, b) => a.localeCompare(b)),
  }))
}

export type GenrePickerOption = { value: string; hint?: string }

export type GenrePickerModel = {
  current: string
  currentSubgenre: string
  suggested: GenrePickerOption[]
  groups: { family: string; genres: string[] }[]
  subgenres: string[]
}

export function genrePickerModel(track: TrackDisplaySource | null | undefined, selectedGenre?: string): GenrePickerModel {
  const current = displayTrackGenre(track || {})
  const currentSubgenre = displayTrackSubgenre(track || {})
  const genre = (selectedGenre ?? current).trim()
  const dna = parseSonicDna(track?.sonic_dna) || parseSonicDna(track?.metadata?.sonic_dna)
  const measured = extractMeasured(dna)
  const drumFamily = String(measured?.drumFamily || dna?.drums?.patternType || '').toLowerCase()
  const groove = measured?.genre?.primary || current
  const related = unique([
    ...(measured?.intelligence?.relatedGenres || []),
    ...(Array.isArray(dna?.genres?.relatedGenres) ? dna.genres.relatedGenres : []),
    ...(RELATED_BY_CLASS[groove] || []),
    measured?.genre?.subgenre,
  ])

  const suggested = unique([
    measured?.genre?.primary,
    current,
    ...(DRUM_FAMILY_GENRES[drumFamily] || []),
    ...related,
  ]).map((value) => {
    if (value === measured?.genre?.primary) {
      return { value, hint: 'Measured groove class' }
    }
    if ((DRUM_FAMILY_GENRES[drumFamily] || []).includes(value)) {
      return { value, hint: `Fits ${drumFamily.replace(/-/g, ' ')} drums` }
    }
    if (related.includes(value)) {
      return { value, hint: 'Related style' }
    }
    return { value }
  })

  const catalog = encyclopediaGenreGroups()
  const catalogGenres = new Set(catalog.flatMap((group) => group.genres))
  const extraCurrent =
    current && !catalogGenres.has(current)
      ? [{ family: 'Current label', genres: [current] }]
      : []

  const subgenres = unique([currentSubgenre, measured?.genre?.subgenre, ...subgenresForGenre(genre)])

  return {
    current,
    currentSubgenre,
    suggested,
    groups: [...extraCurrent, ...catalog],
    subgenres,
  }
}

function normalizeGenreLabel(value: unknown): string {
  return String(value || '').trim()
}

function genreFamilyKey(label: string): string {
  const needle = label.trim().toLowerCase()
  if (!needle) return ''
  const profile = profileForLabel(label)
  if (profile?.parent) return profile.parent.toLowerCase()
  for (const [parent, family] of Object.entries(PARENT_FAMILY)) {
    if (parent.toLowerCase() === needle) return family.toLowerCase()
  }
  for (const [className, related] of Object.entries(RELATED_BY_CLASS)) {
    if (className.toLowerCase() === needle) return (PARENT_FAMILY[className] || className).toLowerCase()
    if (related.some((item) => item.toLowerCase() === needle)) {
      return (PARENT_FAMILY[className] || className).toLowerCase()
    }
  }
  return needle
}

function labelsAgree(a: string, b: string): boolean {
  if (!a || !b) return false
  const left = a.toLowerCase()
  const right = b.toLowerCase()
  if (left === right) return true
  if (left.includes(right) || right.includes(left)) return true
  return genreFamilyKey(a) === genreFamilyKey(b) && Boolean(genreFamilyKey(a))
}

export type GenreBlendInput = {
  audioPrimary?: string | null
  audioSubgenre?: string | null
  preferredPrimary?: string | null
  preferredSubgenre?: string | null
  existingFamily?: string | null
  existingReason?: string[] | null
  existingConfidence?: number | null
}

export type GenreBlendResult = {
  family: string | null
  primary: string | null
  subgenre: string | null
  source: 'audio-measured' | 'user-preferred' | 'hybrid'
  audioPrimary: string | null
  audioSubgenre: string | null
  preferredPrimary: string | null
  preferredSubgenre: string | null
  confidence: number
  reason: string[]
  judgment: string
}

/** Mix audio-measured groove class with catalog/user preference into one judgment. */
export function blendGenreJudgment(input: GenreBlendInput): GenreBlendResult {
  const audioPrimary = normalizeGenreLabel(input.audioPrimary)
  const audioSubgenre = normalizeGenreLabel(input.audioSubgenre)
  const preferredPrimary = normalizeGenreLabel(input.preferredPrimary)
  const preferredSubgenre = normalizeGenreLabel(input.preferredSubgenre)
  const priorReasons = Array.isArray(input.existingReason) ? input.existingReason.filter(Boolean) : []

  if (!preferredPrimary && !audioPrimary) {
    return {
      family: null,
      primary: null,
      subgenre: null,
      source: 'audio-measured',
      audioPrimary: null,
      audioSubgenre: null,
      preferredPrimary: null,
      preferredSubgenre: null,
      confidence: 0,
      reason: priorReasons,
      judgment: 'No audio-measured or user-preferred genre is available yet.',
    }
  }

  if (!preferredPrimary && audioPrimary) {
    const judgment = `Audio-measured groove class is ${[audioPrimary, audioSubgenre].filter(Boolean).join(' / ')}.`
    return {
      family: input.existingFamily || audioPrimary,
      primary: audioPrimary,
      subgenre: audioSubgenre || null,
      source: 'audio-measured',
      audioPrimary,
      audioSubgenre: audioSubgenre || null,
      preferredPrimary: null,
      preferredSubgenre: null,
      confidence: Number(input.existingConfidence ?? 0.7),
      reason: unique([...priorReasons, 'source: audio-measured']),
      judgment,
    }
  }

  if (preferredPrimary && !audioPrimary) {
    const judgment = `Catalog preference is ${[preferredPrimary, preferredSubgenre].filter(Boolean).join(' / ')} (no audio groove class yet — confirm with DSP when available).`
    return {
      family: preferredPrimary,
      primary: preferredPrimary,
      subgenre: preferredSubgenre || null,
      source: 'user-preferred',
      audioPrimary: null,
      audioSubgenre: null,
      preferredPrimary,
      preferredSubgenre: preferredSubgenre || null,
      confidence: 0.55,
      reason: unique([...priorReasons, 'source: user-preferred']),
      judgment,
    }
  }

  const agree = labelsAgree(preferredPrimary, audioPrimary) || labelsAgree(preferredSubgenre, audioSubgenre)
  const primary = agree
    ? preferredPrimary || audioPrimary
    : preferredPrimary
  const subgenre =
    preferredSubgenre ||
    (agree ? audioSubgenre : null) ||
    (!agree && audioSubgenre && !labelsAgree(preferredPrimary, audioSubgenre) ? null : audioSubgenre) ||
    null
  const audioLabel = [audioPrimary, audioSubgenre].filter(Boolean).join(' / ')
  const preferredLabel = [preferredPrimary, preferredSubgenre].filter(Boolean).join(' / ')
  const judgment = agree
    ? `Hybrid judgment: catalog preference (${preferredLabel}) aligns with audio-measured groove (${audioLabel}). Using ${[primary, subgenre].filter(Boolean).join(' / ')} for report copy.`
    : `Hybrid judgment: catalog preference is ${preferredLabel}; audio-measured groove reads ${audioLabel}. Report copy should honor both — preference as intent, audio as grid evidence — and not discard either.`

  return {
    family: input.existingFamily || primary,
    primary,
    subgenre: subgenre || null,
    source: 'hybrid',
    audioPrimary,
    audioSubgenre: audioSubgenre || null,
    preferredPrimary,
    preferredSubgenre: preferredSubgenre || null,
    confidence: agree ? Math.max(0.75, Number(input.existingConfidence ?? 0.7)) : 0.62,
    reason: unique([
      ...priorReasons,
      `audio: ${audioLabel}`,
      `preferred: ${preferredLabel}`,
      agree ? 'preference agrees with audio' : 'preference and audio differ — blended',
    ]),
    judgment,
  }
}

function injectJudgmentIntoIntelligence(
  measured: Record<string, any>,
  blend: GenreBlendResult,
): Record<string, any> {
  const intelligence =
    measured.intelligence && typeof measured.intelligence === 'object' ? { ...measured.intelligence } : {}
  const report = measured.report && typeof measured.report === 'object' ? { ...measured.report } : {}
  const layers = report.layers && typeof report.layers === 'object' ? { ...report.layers } : {}
  const existingDesc = String(intelligence.description || report.description || '').trim()
  const judgment = blend.judgment.trim()
  const description = existingDesc
    ? existingDesc.includes(judgment)
      ? existingDesc
      : `${existingDesc}\n\n${judgment}`
    : judgment
  const intention = String(intelligence.intention || '').trim() || judgment

  return {
    ...measured,
    intelligence: {
      ...intelligence,
      description,
      intention: intelligence.intention || intention,
      genres: {
        ...(intelligence.genres || {}),
        primaryGenres: unique([blend.primary, blend.audioPrimary, blend.preferredPrimary]),
        subgenres: unique([blend.subgenre, blend.audioSubgenre, blend.preferredSubgenre]),
        genreFusion: judgment,
      },
    },
    report: {
      ...report,
      description: report.description || description,
      layers: {
        ...layers,
        musicological: layers.musicological || judgment,
      },
    },
  }
}

/**
 * Drop genre-bound encyclopedia / narrative so a catalog preference change can force-refill
 * against the new primary class. Keeps DSP measured facts (BPM, drums, bass, key, audioPrimary).
 */
export function stripGenreBoundEncyclopedia(dna: Record<string, any>): Record<string, any> {
  const next = { ...dna }
  const measured = extractMeasured(next) || {}
  const report = { ...(asRecord(measured).report || {}) }
  const layers = asRecord(report.layers)
  const dsp = layers.dsp
  report.layers = dsp ? { dsp } : {}
  delete report.description

  const intel = { ...(asRecord(measured).intelligence || {}) }
  delete intel.description
  delete intel.intention
  delete intel.historical
  delete intel.cultural
  delete intel.regional
  delete intel.emotional
  delete intel.psychoacoustics
  delete intel.musicology
  delete intel.relatedGenres
  delete intel.relatedTraditionsText
  delete intel.usageText
  delete intel.listeningBenefits
  delete intel.method
  delete intel.kbVersion

  next.measured = {
    ...asRecord(measured),
    report,
    intelligence: intel,
  }
  delete next.description
  delete next.intention
  delete next.listeningBenefits
  delete next.historical
  delete next.cultural
  delete next.emotional
  delete next.psychology
  delete next.psychoacoustics
  delete next.musicology
  delete next._encyclopedia
  return next
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {}
}

export function applyPreferredGenreToSonicDna(
  existing: unknown,
  genre: string,
  subgenre: string,
): Record<string, any> {
  const dna = parseSonicDna(existing) || {}
  const measured = extractMeasured(dna) || {}
  const priorGenre =
    typeof measured.genre === 'object' && measured.genre ? (measured.genre as Record<string, any>) : {}
  const audioPrimary =
    normalizeGenreLabel(priorGenre.audioPrimary) ||
    (priorGenre.source === 'user-preferred' || priorGenre.source === 'hybrid'
      ? ''
      : normalizeGenreLabel(priorGenre.primary))
  const audioSubgenre =
    normalizeGenreLabel(priorGenre.audioSubgenre) ||
    (priorGenre.source === 'user-preferred' || priorGenre.source === 'hybrid'
      ? ''
      : normalizeGenreLabel(priorGenre.subgenre))

  const blend = blendGenreJudgment({
    audioPrimary: audioPrimary || null,
    audioSubgenre: audioSubgenre || null,
    preferredPrimary: genre,
    preferredSubgenre: subgenre,
    existingFamily: priorGenre.family || null,
    existingReason: Array.isArray(priorGenre.reason) ? priorGenre.reason : null,
    existingConfidence: typeof priorGenre.confidence === 'number' ? priorGenre.confidence : null,
  })

  const withIntel = injectJudgmentIntoIntelligence(
    {
      ...measured,
      genre: {
        ...priorGenre,
        family: blend.family || blend.primary,
        primary: blend.primary,
        subgenre: blend.subgenre,
        source: blend.source,
        audioPrimary: blend.audioPrimary,
        audioSubgenre: blend.audioSubgenre,
        preferredPrimary: blend.preferredPrimary,
        preferredSubgenre: blend.preferredSubgenre,
        judgment: blend.judgment,
        confidence: blend.confidence,
        reason: blend.reason,
      },
    },
    blend,
  )

  const primary = blend.primary || ''
  const sub = blend.subgenre || ''
  const merged = stripGenreBoundEncyclopedia({
    ...dna,
    measured: withIntel,
    genres: {
      ...(dna.genres || {}),
      primaryGenres: primary
        ? unique([primary, blend.audioPrimary, ...((dna.genres?.primaryGenres as string[]) || [])])
        : dna.genres?.primaryGenres,
      subgenres: unique([sub, blend.audioSubgenre, ...((dna.genres?.subgenres as string[]) || [])].filter(Boolean)),
      classificationReason: blend.reason,
      genreFusion: blend.judgment,
    },
    preferredGenre: {
      genre: blend.preferredPrimary || null,
      subgenre: blend.preferredSubgenre || null,
      savedAt: new Date().toISOString(),
    },
  })

  // Force encyclopedia + report sections for the new preferred class (do not keep old genre prose).
  const recomposed = applyGenreEncyclopedia(merged, { force: true, preserveAgentPolymath: false })
  return ensureSonicDnaReportSectionsFilled(recomposed)
}

export function preferredGenreDirective(genre: string, subgenre: string): string {
  const primary = genre.trim()
  const sub = subgenre.trim()
  const label = [primary, sub].filter(Boolean).join(' / ')
  return [
    `Preferred catalog genre is "${label}".`,
    'Keep measured drums, BPM, and key from audio.',
    'Blend catalog preference with the audio-measured groove class — do not discard either.',
    'Fill every report section systematically: usage, description, benefits of listening, intention, DSP, related traditions, history, culture, psychology, psychoacoustics, musicology.',
    'Description must be a detailed unified knowledge report of all Sonic DNA data for this track.',
    'Benefits must explain listening and DJ value from the full analysis.',
    'If preference and audio disagree, explain both and conclude a clear judgment; do not invent house from folder/title alone.',
  ].join(' ')
}
