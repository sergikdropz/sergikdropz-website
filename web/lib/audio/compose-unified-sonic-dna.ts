import { extractMeasured, parseSonicDna, type SonicDnaMeasured } from '@/lib/audio/sonic-dna-quality'
import { measuredGrooveFacts } from '@/lib/audio/sonic-dna-prose'
import { composeInstrumentationSection } from '@/lib/audio/instrument-usage'
import { isEncyclopediaThin } from '@/lib/audio/compose-genre-intelligence'
import { hasGrooveCore } from '@/lib/audio/sonic-dna-pipeline'

/** True when measured intelligence + report layers are the compiled unified knowledge card (do not re-compose). */
export function hasUnifiedSonicDnaIntelligence(dna: unknown): boolean {
  const root = parseSonicDna(dna)
  if (!root || !hasGrooveCore(extractMeasured(root))) return false
  return !isEncyclopediaThin(root)
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {}
}

function unique(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const text = String(value || '').trim()
    if (!text || seen.has(text)) continue
    seen.add(text)
    out.push(text)
  }
  return out
}

function sentence(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return ''
  return /[.!?]"?$/.test(trimmed) ? trimmed : `${trimmed}.`
}

function usableIntel(text: unknown): string {
  const value = String(text || '').trim()
  if (!value || /awaiting audio analysis/i.test(value)) return ''
  return value
}

export function collectRelatedTraditions(dna: unknown): string[] {
  const root = asRecord(parseSonicDna(dna) || dna)
  const measured = extractMeasured(root)
  const intel = asRecord(measured?.intelligence)
  return unique([
    ...(Array.isArray(intel.relatedGenres) ? intel.relatedGenres : []),
    ...(Array.isArray(intel.cultural?.culturalInfluences) ? intel.cultural.culturalInfluences : []),
    ...(Array.isArray(intel.regional?.culturalInfluences) ? intel.regional.culturalInfluences : []),
    ...(Array.isArray(intel.genres?.genreInfluences) ? intel.genres.genreInfluences : []),
    ...(Array.isArray(root.genres?.relatedGenres) ? root.genres.relatedGenres : []),
    ...(Array.isArray(root.genres?.genreInfluences) ? root.genres.genreInfluences : []),
  ])
}

/** Percussion/instrument usage lines in the public SonicDNA style. */
export function composeUsageLines(dna: unknown): string[] {
  const root = asRecord(parseSonicDna(dna) || dna)
  const measured = extractMeasured(root)
  const fromArrangement = Array.isArray(measured?.arrangement?.lines)
    ? measured!.arrangement!.lines!.map((line) => String(line || '').trim()).filter(Boolean)
    : []
  if (fromArrangement.length) return unique(fromArrangement)

  const perc = measured?.percussion
  const lines: string[] = []
  if (perc?.kickRole) lines.push(`Kick is used as ${perc.kickRole}.`)
  if (perc?.snareRole) lines.push(`Snare/clap is used as ${perc.snareRole}.`)
  if (perc?.hatGrid) lines.push(`Hats are used as ${perc.hatGrid}.`)
  if (measured?.bass?.lock) {
    const around = measured.bass.rootNote ? ` around ${measured.bass.rootNote}` : ''
    lines.push(`Bass is used with a ${measured.bass.lock} lock${around}.`)
  }
  const instruments = (measured?.instruments || [])
    .filter((item) => (item.confidence || 0) >= 0.4)
    .map((item) => item.label)
    .filter(Boolean)
  if (instruments.length) {
    lines.push(`Instrument scene: ${instruments.slice(0, 6).join(', ')}.`)
  }
  return unique(lines)
}

function energyDanceBits(measured: SonicDnaMeasured | null, root: Record<string, any>, intel: Record<string, any>) {
  const energy = intel.technical?.energyLevel ?? root.technical?.energyLevel ?? root.energy_level
  const dance = intel.technical?.danceability ?? root.technical?.danceability ?? root.danceability
  const bits: string[] = []
  if (Number.isFinite(Number(energy))) bits.push(`arousal ~${Math.round(Number(energy))}/10`)
  if (Number.isFinite(Number(dance))) bits.push(`dance affordance ~${Math.round(Number(dance))}/10`)
  if (measured?.timingFeel) bits.push(`${measured.timingFeel} feel`)
  return bits
}

/**
 * Full-track description: one inclusive narrative from every Sonic DNA knowledge layer.
 */
export function composeDetailedTrackDescription(dna: unknown): string {
  const root = asRecord(parseSonicDna(dna) || dna)
  const measured = extractMeasured(root)
  const intel = asRecord(measured?.intelligence)
  const layers = asRecord(measured?.report?.layers)
  const genre = [measured?.genre?.primary || root.genres?.primaryGenres?.[0], measured?.genre?.subgenre || root.genres?.subgenres?.[0]]
    .filter(Boolean)
    .join(' / ')
  const bpm = measured?.bpm ?? root.technical?.bpm
  const key = measured?.key || root.harmony?.keySignature || root.musical?.keySignature
  const related = collectRelatedTraditions(root)
  const usage = composeUsageLines(root)
  const facts = measuredGrooveFacts(measured)
  const paragraphs: string[] = []

  const lead: string[] = []
  if (genre) lead.push(`This cut sits in the ${genre} groove class`)
  if (bpm) lead.push(`at ${Math.round(Number(bpm))} BPM${measured?.timingFeel ? ` (${measured.timingFeel})` : ''}`)
  if (key && key !== 'Unknown') lead.push(`centered on ${key}${measured?.camelot ? ` / Camelot ${measured.camelot}` : ''}`)
  if (measured?.drumFamily) lead.push(`with a ${measured.drumFamily} drum family`)
  if (lead.length) paragraphs.push(sentence(lead.join(' ')))

  if (measured?.genre?.judgment) paragraphs.push(sentence(String(measured.genre.judgment)))
  if (measured?.genre?.audioPrimary && measured.genre.audioPrimary !== measured.genre?.primary) {
    paragraphs.push(
      sentence(
        `Audio-measured class reads ${[measured.genre.audioPrimary, measured.genre.audioSubgenre].filter(Boolean).join(' / ')}; catalog preference and DSP evidence are held together in the judgment above`,
      ),
    )
  }

  if (usage.length) {
    paragraphs.push(sentence(`How percussion and instruments are used: ${usage.join(' ')}`))
  } else if (facts.length) {
    paragraphs.push(sentence(`Measured facts — ${facts.map((row) => `${row.label}: ${row.value}`).join('; ')}`))
  }

  const instrumentation = composeInstrumentationSection(root)
  if (instrumentation) {
    const instSummary = instrumentation
      .split(/\n\n+/)
      .slice(1)
      .join(' ')
      .slice(0, 600)
    if (instSummary) {
      paragraphs.push(sentence(`Technical instrumentation: ${instSummary}`))
    }
  }

  const existingDesc = usableIntel(intel.description || root.description || measured?.report?.description || '')
  if (existingDesc && !paragraphs.some((p) => p.includes(existingDesc.slice(0, 80)))) {
    paragraphs.push(existingDesc)
  }

  const intention = usableIntel(intel.intention || root.intention || '')
  if (intention) paragraphs.push(sentence(`Intention: ${intention}`))

  const history = usableIntel(
    layers.historical || intel.historical?.historicalContext || root.historical?.historicalContext || '',
  )
  if (history) paragraphs.push(sentence(`History and science: ${history}`))

  const culture = usableIntel(
    layers.cultural || intel.cultural?.description || intel.regional?.regionalCharacteristics || root.cultural?.description || '',
  )
  if (culture) paragraphs.push(sentence(`Culture: ${culture}`))

  const psych = usableIntel(
    layers.psychological || intel.emotional?.psychologicalProfile || root.emotional?.psychologicalProfile || '',
  )
  if (psych) paragraphs.push(sentence(`Psychology: ${psych}`))

  const journey = usableIntel(intel.emotional?.emotionalJourney || '')
  if (journey && journey !== psych) paragraphs.push(sentence(`Emotional arc: ${journey}`))

  const psycho = usableIntel(
    layers.psychoacoustics ||
      intel.psychoacoustics?.report ||
      [intel.psychoacoustics?.socialUsage, intel.psychoacoustics?.sonicIntent, intel.psychoacoustics?.activationFormula]
        .filter(Boolean)
        .join(' '),
  )
  if (psycho) paragraphs.push(sentence(`Psychoacoustics: ${psycho}`))

  const musico = usableIntel(
    layers.musicological || root.musicology?.description || intel.musicology?.description || intel.musical?.harmonicComplexity || '',
  )
  if (musico) paragraphs.push(sentence(`Musicology: ${musico}`))

  if (related.length) {
    paragraphs.push(
      sentence(`Related traditions on the world-genre map (context, not extra crate labels): ${related.slice(0, 12).join(', ')}`),
    )
  }

  const ed = energyDanceBits(measured, root, intel)
  if (ed.length) paragraphs.push(sentence(`Listener activation heuristics: ${ed.join(', ')}`))

  const instruments = (measured?.instruments || [])
    .filter((item) => (item.confidence || 0) >= 0.35)
    .map((item) => `${item.label}${item.role ? ` (${item.role})` : ''}`)
  if (instruments.length) {
    paragraphs.push(sentence(`Spectral instrument scene: ${instruments.slice(0, 8).join(', ')}`))
  }

  return paragraphs.filter(Boolean).join('\n\n')
}

/**
 * Benefits of listening derived from measured groove + encyclopedia layers.
 */
export function composeListeningBenefits(dna: unknown): string {
  const root = asRecord(parseSonicDna(dna) || dna)
  const measured = extractMeasured(root)
  const intel = asRecord(measured?.intelligence)
  const genre = [measured?.genre?.primary || root.genres?.primaryGenres?.[0], measured?.genre?.subgenre]
    .filter(Boolean)
    .join(' / ')
  const bpm = measured?.bpm ?? root.technical?.bpm
  const key = measured?.key || root.harmony?.keySignature
  const related = collectRelatedTraditions(root)
  const psycho = asRecord(intel.psychoacoustics)
  const emotions = Array.isArray(intel.emotional?.primaryEmotions) ? intel.emotional.primaryEmotions : []
  const lines: string[] = []

  lines.push(
    sentence(
      genre
        ? `Listening benefit: a focused ${genre} pocket that trains the body on how this class of groove moves`
        : 'Listening benefit: a focused study of this track’s measured groove and how it moves a body',
    ),
  )

  if (bpm) {
    lines.push(
      sentence(
        `Tempo lock-in around ${Math.round(Number(bpm))} BPM${
          measured?.timingFeel ? ` (${measured.timingFeel})` : ''
        } supports entrainment — useful for DJs matching energy and for listeners who want a clear pulse to settle into`,
      ),
    )
  }

  if (measured?.drumFamily === 'four-on-the-floor') {
    lines.push(
      sentence(
        'Four-on-the-floor kick coupling is a social-dance activator: it rewards continuous movement and keeps crowds oriented without lyrical instruction',
      ),
    )
  } else if (measured?.drumFamily === 'one-drop' || String(genre).toLowerCase().includes('reggae')) {
    lines.push(
      sentence(
        'One-drop / reggae-space phrasing rewards deep listening — space between hits can lower rush and open room for bass meditation and head-nod pocket',
      ),
    )
  } else if (String(measured?.drumFamily || '').includes('half') || measured?.timingFeel === 'half-time') {
    lines.push(
      sentence(
        'Half-time snare placement can feel heavier than the clock BPM suggests — useful for mood regulation, swagger, and set transitions that need weight without speeding up',
      ),
    )
  }

  if (measured?.percussion?.hatGrid) {
    lines.push(sentence(`Hat grid (${measured.percussion.hatGrid}) fine-tunes forward motion and can sharpen focus or float depending on density`))
  }
  if (measured?.bass?.lock) {
    lines.push(
      sentence(
        `Bass lock (${measured.bass.lock}) gives the low end a predictable hook — good for physical grounding and for ear training on how bass and kick cooperate`,
      ),
    )
  }
  if (key && key !== 'Unknown') {
    lines.push(
      sentence(
        `Key center ${key}${measured?.camelot ? ` / Camelot ${measured.camelot}` : ''} supports harmonic mixing and mood continuity across a session`,
      ),
    )
  }

  if (psycho.socialUsage) lines.push(sentence(`Social usage: ${psycho.socialUsage}`))
  if (psycho.sonicIntent) lines.push(sentence(`Sonic intent for the listener: ${psycho.sonicIntent}`))
  if (psycho.listenerEffects) lines.push(sentence(`Listener effects: ${psycho.listenerEffects}`))
  if (psycho.activationFormula) lines.push(sentence(`Activation formula: ${psycho.activationFormula}`))

  if (emotions.length) {
    lines.push(sentence(`Emotional palette you can expect to visit: ${emotions.slice(0, 6).join(', ')}`))
  }

  const psych = String(intel.emotional?.psychologicalProfile || '').trim()
  if (psych) lines.push(sentence(`Psychological takeaway: ${psych}`))

  const ed = energyDanceBits(measured, root, intel)
  if (ed.length) {
    lines.push(sentence(`Heuristic activation profile — ${ed.join('; ')} — use this when choosing the track for warm-up, peak, or cool-down`))
  }

  if (related.length) {
    lines.push(
      sentence(
        `Cultural / stylistic literacy benefit: hearing adjacent traditions (${related.slice(0, 8).join(', ')}) without confusing them for this file’s crate tag`,
      ),
    )
  }

  if (intel.intention) lines.push(sentence(`Practical set use: ${intel.intention}`))

  lines.push(
    sentence(
      'Use this report as a unified knowledge card for the track: measured DSP facts, encyclopedia layers, and listening benefits stay bound to this file alone',
    ),
  )

  return unique(lines).join('\n')
}

export function composeRelatedTraditionsSection(dna: unknown): string {
  const related = collectRelatedTraditions(dna)
  if (!related.length) {
    return 'No related-tradition map stored yet. Re-run Sonic DNA intelligence so the world-genre map can fill from the measured groove class.'
  }
  return [
    'World-genre map for this class — not extra crate labels for this file.',
    related.map((name) => `• ${name}`).join('\n'),
  ].join('\n')
}

export function composeUsageSection(dna: unknown): string {
  const lines = composeUsageLines(dna)
  if (!lines.length) {
    return 'Usage lines are not stored yet. Re-run audio analysis so kick/snare/hat/bass roles can populate this section.'
  }
  return lines.join('\n')
}
