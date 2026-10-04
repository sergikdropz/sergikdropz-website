/**
 * SERGIK house terms for Rights packets. Applied only when someone chooses them.
 * A lawyer admitted in Arizona, or in the other party's home jurisdiction, still reviews the draft.
 */

export const SERGIK_STANDARD_TERMS = {
  termYears: 5,
  territory: 'worldwide, except territories already granted to a collecting society',
  governingLaw: 'the laws of the State of Arizona, USA, without regard to conflict-of-law rules',
  forum: 'state or federal courts located in Maricopa County, Arizona',
  royaltyBase: 'net receipts actually received from the distributor, less only that distributor fee',
} as const

const FILLS: Array<{ pattern: RegExp; value: string; label: string }> = [
  {
    pattern: /Term:\s*_{3,}\s*years/gi,
    value: `Term: ${SERGIK_STANDARD_TERMS.termYears} years`,
    label: 'term',
  },
  {
    pattern: /Territory:\s*_{3,}/gi,
    value: `Territory: ${SERGIK_STANDARD_TERMS.territory}`,
    label: 'territory',
  },
  {
    pattern: /Governing law:\s*_{3,}/gi,
    value: `Governing law: ${SERGIK_STANDARD_TERMS.governingLaw}`,
    label: 'governing law',
  },
  {
    pattern: /Forum:\s*_{3,}/gi,
    value: `Forum: ${SERGIK_STANDARD_TERMS.forum}`,
    label: 'forum',
  },
  {
    pattern: /the base is\s*_{3,}/gi,
    value: `the base is ${SERGIK_STANDARD_TERMS.royaltyBase}`,
    label: 'royalty base',
  },
]

export function applySergikStandardTerms(text: string): { text: string; filled: string[] } {
  let next = text
  const filled: string[] = []
  for (const fill of FILLS) {
    if (fill.pattern.test(next)) {
      filled.push(fill.label)
      next = next.replace(fill.pattern, fill.value)
    }
    fill.pattern.lastIndex = 0
  }
  return { text: next, filled }
}
