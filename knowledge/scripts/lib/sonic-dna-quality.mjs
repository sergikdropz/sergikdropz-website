/** Shared Sonic DNA quality gates for Node analysis scripts. */

const UNKNOWN = new Set(['', 'unknown', 'n/a', 'none', 'null'])

export function isUnknownKey(value) {
  if (value == null) return true
  return UNKNOWN.has(String(value).trim().toLowerCase())
}

export function hasMeasuredBpm(measured) {
  const bpm = Number(measured?.bpm)
  const confidence = Number(measured?.bpmConfidence ?? 0)
  return Number.isFinite(bpm) && bpm >= 60 && bpm <= 220 && confidence >= 0.4
}

export function hasMeasuredDrums(measured) {
  const family = String(measured?.drumFamily || '').toLowerCase()
  if (!family || family === 'unknown') return false
  const kicks = measured?.kickSteps
  const snares = measured?.snareSteps
  return (Array.isArray(kicks) && kicks.length > 0) || (Array.isArray(snares) && snares.length > 0)
}

export function hasMeasuredKey(measured) {
  if (measured?.unpitched) return true
  if (isUnknownKey(measured?.key) && isUnknownKey(measured?.rootNote)) return false
  return Number(measured?.keyConfidence ?? 0) >= 0.35 || Boolean(measured?.rootNote || measured?.key)
}

export function sonicDnaStatusFromMeasured(measured) {
  if (!measured) return 'partial'
  if (hasMeasuredBpm(measured) && hasMeasuredDrums(measured) && hasMeasuredKey(measured)) {
    return 'completed'
  }
  return 'partial'
}

export function extractMeasured(sonicDna) {
  if (!sonicDna || typeof sonicDna !== 'object') return null
  return sonicDna.measured && typeof sonicDna.measured === 'object' ? sonicDna.measured : null
}

const STEPS_PER_BAR = 16
const BARS_PER_PHRASE = 8

const FAMILY_GENRE_HINTS = {
  'four-on-the-floor': ['house', 'tech house', 'disco', 'techno'],
  'half-time': ['trap', 'hip-hop', 'drill'],
  breakbeat: ['breakbeat', 'jungle', 'dnb', 'drum and bass'],
  'boom-bap': ['hip-hop', 'boom bap', 'lo-fi'],
  dembow: ['reggaeton', 'dembow', 'latin'],
  'one-drop': ['reggae', 'dub'],
  sparse: ['ambient', 'downtempo', 'minimal'],
}

const CAMELOT_NEIGHBORS = {
  '1A': ['12A', '2A', '1B'],
  '2A': ['1A', '3A', '2B'],
  '3A': ['2A', '4A', '3B'],
  '4A': ['3A', '5A', '4B'],
  '5A': ['4A', '6A', '5B'],
  '6A': ['5A', '7A', '6B'],
  '7A': ['6A', '8A', '7B', '10B'],
  '8A': ['7A', '9A', '8B'],
  '9A': ['8A', '10A', '9B'],
  '10A': ['9A', '11A', '10B'],
  '11A': ['10A', '12A', '11B'],
  '12A': ['11A', '1A', '12B'],
  '1B': ['12B', '2B', '1A'],
  '2B': ['1B', '3B', '2A'],
  '3B': ['2B', '4B', '3A'],
  '4B': ['3B', '5B', '4A'],
  '5B': ['4B', '6B', '5A'],
  '6B': ['5B', '7B', '6A'],
  '7B': ['6B', '8B', '7A'],
  '8B': ['7B', '9B', '8A'],
  '9B': ['8B', '10B', '9A'],
  '10B': ['9B', '11B', '10A', '7A'],
  '11B': ['10B', '12B', '11A'],
  '12B': ['11B', '1B', '12A'],
}

export function expandBarStepsToPhrase(steps, phraseBars = BARS_PER_PHRASE, stepsPerBar = STEPS_PER_BAR) {
  const bar = Array.isArray(steps)
    ? steps.map((s) => Math.round(Number(s))).filter((s) => Number.isFinite(s)).map((s) => ((s % stepsPerBar) + stepsPerBar) % stepsPerBar)
    : []
  if (!bar.length) return []
  const out = []
  const seen = new Set()
  for (let b = 0; b < phraseBars; b++) {
    for (const s of bar) {
      const i = b * stepsPerBar + s
      if (seen.has(i)) continue
      seen.add(i)
      out.push(i)
    }
  }
  return out
}

/** Ensure 16×8 phrase steps exist (tile from bar pocket when DSP hasn't written them). */
export function ensurePhraseSteps(measured) {
  if (!measured || typeof measured !== 'object') return measured
  const stepsPerBar = measured.stepsPerBar > 0 ? measured.stepsPerBar : STEPS_PER_BAR
  const phraseBars = measured.phraseBars > 0 ? measured.phraseBars : BARS_PER_PHRASE
  const next = { ...measured, stepsPerBar, phraseBars }
  if (!(Array.isArray(next.kickPhraseSteps) && next.kickPhraseSteps.length) && Array.isArray(next.kickSteps) && next.kickSteps.length) {
    next.kickPhraseSteps = expandBarStepsToPhrase(next.kickSteps, phraseBars, stepsPerBar)
  }
  if (!(Array.isArray(next.snarePhraseSteps) && next.snarePhraseSteps.length) && Array.isArray(next.snareSteps) && next.snareSteps.length) {
    next.snarePhraseSteps = expandBarStepsToPhrase(next.snareSteps, phraseBars, stepsPerBar)
  }
  if (!(Array.isArray(next.hatPhraseSteps) && next.hatPhraseSteps.length) && Array.isArray(next.hatSteps) && next.hatSteps.length) {
    next.hatPhraseSteps = expandBarStepsToPhrase(next.hatSteps, phraseBars, stepsPerBar)
  }
  return ensureKickOnsetSec(next)
}

/** Project kickOnsetSec from phrase steps when missing (legacy measured JSON). */
export function ensureKickOnsetSec(measured) {
  if (!measured || typeof measured !== 'object') return measured
  if (Array.isArray(measured.kickOnsetSec) && measured.kickOnsetSec.length >= 4) return measured
  const bpm = Number(measured.bpm)
  if (!(bpm > 0)) return measured
  const stepsPerBar = measured.stepsPerBar > 0 ? measured.stepsPerBar : STEPS_PER_BAR
  const phraseBars = measured.phraseBars > 0 ? measured.phraseBars : BARS_PER_PHRASE
  const offset =
    typeof measured.gridOffsetSec === 'number' && Number.isFinite(measured.gridOffsetSec)
      ? measured.gridOffsetSec
      : typeof measured.window?.startSec === 'number'
        ? measured.window.startSec
        : 0
  const end =
    typeof measured.window?.endSec === 'number' && measured.window.endSec > offset
      ? measured.window.endSec
      : offset + (60 / bpm) * 4 * phraseBars * 2
  const phraseSteps =
    Array.isArray(measured.kickPhraseSteps) && measured.kickPhraseSteps.length
      ? measured.kickPhraseSteps
      : Array.isArray(measured.kickSteps) && measured.kickSteps.length
        ? expandBarStepsToPhrase(measured.kickSteps, phraseBars, stepsPerBar)
        : []
  if (!phraseSteps.length) return measured
  const beat = 60 / bpm
  const stepSec = (beat * 4) / stepsPerBar
  const phraseSec = beat * 4 * phraseBars
  const out = []
  const nPhrases = Math.max(1, Math.ceil((Math.max(end, offset + 1) - offset) / phraseSec) + 1)
  for (let p = 0; p < nPhrases; p++) {
    for (const s of phraseSteps) {
      if (!Number.isFinite(s) || s < 0) continue
      const t = offset + p * phraseSec + s * stepSec
      if (t >= 0 && t <= end + 0.25) out.push(Number(t.toFixed(4)))
    }
  }
  const unique = [...new Set(out)].sort((a, b) => a - b)
  if (unique.length < 4) return measured
  return {
    ...measured,
    kickOnsetSec: unique,
    gridOffsetSec: measured.gridOffsetSec ?? offset,
  }
}

export function mixingBlockFromMeasured(measured) {
  const bpm =
    Number(measured?.effectiveBpm) > 0
      ? Number(measured.effectiveBpm)
      : Number(measured?.bpm) > 0
        ? Number(measured.bpm)
        : null
  const camelot = measured?.camelot ? String(measured.camelot).trim().toUpperCase() : null
  const family = measured?.drumFamily ? String(measured.drumFamily) : null
  const neighbors = camelot && CAMELOT_NEIGHBORS[camelot] ? CAMELOT_NEIGHBORS[camelot] : []
  return {
    bpmRange:
      bpm && bpm > 0
        ? { min: Math.max(60, Math.round(bpm - 6)), max: Math.min(200, Math.round(bpm + 6)) }
        : undefined,
    compatibleKeys: camelot ? [camelot, ...neighbors] : [],
    mixableGenres: family ? FAMILY_GENRE_HINTS[family] || [] : [],
    pocketFamilies: family ? [family] : [],
    derivedFrom: 'measured',
  }
}

export function applyMeasuredToDna(existing, measured) {
  const dna = existing && typeof existing === 'object' ? { ...existing } : {}
  if (!measured) {
    return { dna, status: 'partial' }
  }
  const normalized = ensurePhraseSteps(measured)
  const genre = normalized.genre || {}
  const intel = normalized.intelligence || {}
  dna.measured = normalized
  dna.technical = {
    ...(dna.technical || {}),
    ...(intel.technical || {}),
    bpm: normalized.bpm ?? intel.technical?.bpm ?? dna.technical?.bpm ?? null,
    key: normalized.key || intel.technical?.key || dna.technical?.key || null,
    camelot: normalized.camelot || intel.technical?.camelot || dna.technical?.camelot || null,
  }
  dna.instruments = {
    ...(dna.instruments || {}),
    detected: normalized.instruments || [],
    roles: (normalized.instruments || []).map((item) => item.id),
  }
  dna.percussion = normalized.percussion || dna.percussion
  const description = intel.description || normalized.report?.description
  if (description) {
    dna.description = description
    dna.summary = intel.summary || description
  }
  if (intel.intention) dna.intention = intel.intention
  if (intel.psychoacoustics) dna.psychoacoustics = intel.psychoacoustics
  if (intel.emotional) dna.emotional = { ...(dna.emotional || {}), ...intel.emotional }
  if (intel.historical) dna.historical = { ...(dna.historical || {}), ...intel.historical }
  if (intel.regional) dna.regional = { ...(dna.regional || {}), ...intel.regional }
  if (intel.cultural) dna.cultural = { ...(dna.cultural || {}), ...intel.cultural }
  if (intel.musicology) dna.musicology = { ...(dna.musicology || {}), ...intel.musicology }
  dna.comprehensive = {
    ...(dna.comprehensive || {}),
    cultural: intel.cultural || dna.comprehensive?.cultural,
    musicology: intel.musicology || dna.comprehensive?.musicology,
    emotional: intel.emotional || dna.comprehensive?.emotional,
    historical: intel.historical || dna.comprehensive?.historical,
  }
  dna.musical = {
    ...(dna.musical || {}),
    ...(intel.musical || {}),
    keySignature: normalized.key || intel.musical?.keySignature || dna.musical?.keySignature || 'Unknown',
    timeSignature: dna.musical?.timeSignature || intel.musical?.timeSignature || '4/4',
    rhythmicPatterns:
      intel.musical?.rhythmicPatterns ||
      [
        normalized.drumFamily,
        normalized.percussion?.hatGrid,
        normalized.percussion?.snareRole,
        normalized.timingFeel,
        normalized.bass?.lock,
        normalized.bpm ? `${normalized.bpm} BPM` : null,
      ]
        .filter(Boolean)
        .join(' · '),
  }
  dna.harmony = {
    ...(dna.harmony || {}),
    keySignature: normalized.key || dna.harmony?.keySignature,
    camelot: normalized.camelot || dna.harmony?.camelot,
    scale: normalized.scale || dna.harmony?.scale,
    rootNote: normalized.rootNote || dna.harmony?.rootNote,
  }
  dna.drums = {
    ...(dna.drums || {}),
    ...(intel.drums || {}),
    patternType: normalized.drumFamily,
    kickPattern: (normalized.kickSteps || []).join('-') || dna.drums?.kickPattern,
    snarePattern: (normalized.snareSteps || []).join('-') || dna.drums?.snarePattern,
    hihatPattern: normalized.percussion?.hatGrid || (normalized.hatSteps || []).join('-') || dna.drums?.hihatPattern,
    timingFeel: normalized.timingFeel,
    genreStyles: [...(normalized.percussion?.styles || []), genre.primary, genre.subgenre].filter(Boolean),
    patternRecognition: intel.drums?.patternRecognition || dna.drums?.patternRecognition,
    stepsPerBar: normalized.stepsPerBar,
    phraseBars: normalized.phraseBars,
    kickPhraseSteps: normalized.kickPhraseSteps,
    snarePhraseSteps: normalized.snarePhraseSteps,
    hatPhraseSteps: normalized.hatPhraseSteps,
  }
  const intelGenres = intel.genres || {}
  if (genre.primary && genre.primary !== 'Unclassified') {
    dna.genres = {
      ...(dna.genres || {}),
      ...intelGenres,
      primaryGenres: [genre.primary, genre.family, ...(intelGenres.primaryGenres || [])]
        .filter((v, i, a) => v && a.indexOf(v) === i)
        .slice(0, 3),
      subgenres: [genre.subgenre, ...(intelGenres.subgenres || [])].filter((v, i, a) => v && a.indexOf(v) === i),
      classificationReason: genre.reason || [],
      relatedGenres: intel.relatedGenres || intelGenres.genreInfluences || [],
    }
  }
  // Derive mixing recommendations from measured Camelot / BPM / pocket when missing.
  const derivedMixing = mixingBlockFromMeasured(normalized)
  if (!dna.mixing || !(dna.mixing.compatibleKeys?.length || dna.mixing.bpmRange)) {
    dna.mixing = { ...(dna.mixing || {}), ...derivedMixing }
  }
  dna._metadata = {
    ...(dna._metadata || {}),
    measuredSource: normalized.source,
    measuredAt: normalized.analyzedAt,
    grooveClassifier: 'drum-tempo-bass-usage-v1',
    instrumentScene: 'band-energy-v1',
    intelligenceKb: intel.kbVersion || 'genre-intelligence.json',
    auditMethod: normalized.report?.method || 'dsp-audit-v1+world-genre-intelligence',
    phraseGrid: `${normalized.stepsPerBar}x${normalized.phraseBars}`,
  }
  return { dna, status: sonicDnaStatusFromMeasured(normalized) }
}
