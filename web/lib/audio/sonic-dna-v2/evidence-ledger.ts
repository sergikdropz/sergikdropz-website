/**
 * Evidence ledger — every report claim should cite measured fields.
 */

export type EvidenceClaim = {
  sectionId: string
  claim: string
  evidenceFields: string[]
  confidence: 'green' | 'amber' | 'red'
}

export type EvidenceLedger = {
  version: 1
  claims: EvidenceClaim[]
  updatedAt: string
}

export function confidenceForSection(input: {
  hasGrooveCore: boolean
  text: string
  measuredBacked: boolean
}): 'green' | 'amber' | 'red' {
  if (!input.text || input.text.trim() === '—' || /no dsp|await audio|preference only/i.test(input.text)) {
    return 'red'
  }
  if (input.measuredBacked && input.hasGrooveCore) return 'green'
  if (input.hasGrooveCore) return 'amber'
  return 'red'
}

export function buildEvidenceLedger(
  sections: Array<{ id: string; text: string }>,
  opts: { hasGrooveCore: boolean; measuredFields: string[] },
): EvidenceLedger {
  const claims: EvidenceClaim[] = sections.map((section) => {
    const cited = opts.measuredFields.filter((field) =>
      new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(section.text),
    )
    const measuredBacked = cited.length > 0 || /BPM:|Drums:|Key:|Groove class:/i.test(section.text)
    return {
      sectionId: section.id,
      claim: section.text.slice(0, 180),
      evidenceFields: cited.length ? cited : measuredBacked ? ['measured-block'] : [],
      confidence: confidenceForSection({
        hasGrooveCore: opts.hasGrooveCore,
        text: section.text,
        measuredBacked,
      }),
    }
  })
  return { version: 1, claims, updatedAt: new Date().toISOString() }
}

/** Prompt hard rule: descriptions must quote the grid. */
export const QUOTE_THE_GRID_RULE =
  'Description and groove sections MUST embed at least one literal measured line such as "BPM: …", "Drums: …", or "Groove class: …". Claims without evidence fields are invalid.'
