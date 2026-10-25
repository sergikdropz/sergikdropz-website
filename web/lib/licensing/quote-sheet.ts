/**
 * Private starting points for the admin desk.
 * Public pages must not import this module.
 */

export type InternalQuote = {
  cents: number | null
  hold: boolean
  estimate: boolean
  reason: string
}

/** Non-exclusive catalog floors, in cents. Raise these per term, territory, and media. */
const CATALOG_FLOORS: Record<string, number> = {
  Personal: 15000,
  'Creator / Social': 25000,
  Podcast: 40000,
  Exhibition: 75000,
  Commercial: 100000,
  Film: 150000,
  Game: 150000,
  Television: 250000,
  Advertising: 500000,
  Custom: 100000,
}

export const CUSTOM_PRODUCTION_FLOOR_CENTS = 50000

export function privateQuoteSheet() {
  return {
    private: true as const,
    catalog: Object.entries(CATALOG_FLOORS).map(([usage, cents]) => ({ usage, cents })),
    customProductionCents: CUSTOM_PRODUCTION_FLOOR_CENTS,
    exclusive: 'On hold. No exclusive price.',
  }
}

export function internalQuote(input: {
  kind: string
  usageType: string
  exclusivity: string
  rightsCleared: boolean | null
}): InternalQuote {
  if (input.exclusivity === 'exclusive') {
    return {
      cents: null,
      hold: true,
      estimate: false,
      reason: 'Exclusive requests stay on hold. The private sheet has no exclusive price.',
    }
  }
  if (input.rightsCleared === false) {
    return {
      cents: null,
      hold: true,
      estimate: false,
      reason: 'This track is not cleared. Finish splits and sample clearance before a quote.',
    }
  }
  if (input.kind === 'custom_production') {
    return {
      cents: CUSTOM_PRODUCTION_FLOOR_CENTS,
      hold: false,
      estimate: true,
      reason: 'Custom production estimate only. This is not a license to use an existing recording.',
    }
  }
  const cents = CATALOG_FLOORS[input.usageType] ?? CATALOG_FLOORS.Custom
  return {
    cents,
    hold: false,
    estimate: false,
    reason: 'Private starting point for a non-exclusive quote. Raise it for term, territory, and media.',
  }
}

export function quoteAmountError(input: {
  kind: string
  usageType: string
  exclusivity: string
  rightsCleared: boolean | null
  cents: number
}): string | null {
  const sheet = internalQuote(input)
  if (sheet.hold) return sheet.reason
  if (sheet.cents != null && input.cents < sheet.cents) {
    return `The private sheet starts at USD ${(sheet.cents / 100).toFixed(2)} for this use.`
  }
  return null
}
