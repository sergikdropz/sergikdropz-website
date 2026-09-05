import type { SonicDnaMeasured } from './sonic-dna-quality'

/** Rebuild the audited description from measured fields (no titles or folders). */
export function composeSonicDnaAudit(measured: SonicDnaMeasured): {
  description: string
  facts: string[]
} {
  if (measured.report?.description) {
    return {
      description: measured.report.description,
      facts: measured.report.facts || [],
    }
  }
  const genre = measured.genre || {}
  const bass = measured.bass || {}
  const perc = measured.percussion || {}
  const facts: string[] = []
  if (measured.bpm) {
    facts.push(`Pulse ${Math.round(measured.bpm)} BPM (${measured.timingFeel || 'unknown feel'}).`)
  }
  if (measured.drumFamily) {
    facts.push(
      `Drum family ${measured.drumFamily}; kick ${perc.kickRole}; snare ${perc.snareRole}; hats ${perc.hatGrid}.`
    )
  }
  if (bass.lock) {
    facts.push(`Bass lock ${bass.lock}${bass.rootNote ? ` around ${bass.rootNote}` : ''}.`)
  }
  if (measured.unpitched) {
    facts.push('Pitch center too weak to name a key (unpitched / noise-like chroma).')
  } else if (measured.key) {
    facts.push(`Root/key ${measured.key}${measured.camelot ? ` / Camelot ${measured.camelot}` : ''}.`)
  }
  const named = (measured.instruments || [])
    .filter((item) => (item.confidence || 0) >= 0.4)
    .map((item) => item.label)
  if (named.length) facts.push(`Instrument scene: ${named.slice(0, 6).join(', ')}.`)
  for (const line of measured.arrangement?.lines || []) {
    if (line) facts.push(line)
  }
  if (genre.primary) {
    facts.push(
      `Groove class ${genre.primary}${genre.subgenre ? ` / ${genre.subgenre}` : ''} (conf ${(genre.confidence || 0).toFixed(2)}).`
    )
  }
  if (measured.intelligence?.description) {
    return {
      description: measured.intelligence.description,
      facts: measured.report?.facts || facts,
    }
  }
  return { description: facts.join(' '), facts }
}
