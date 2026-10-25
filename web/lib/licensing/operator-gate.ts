import { LICENSING_LICENSOR } from '@/lib/licensing/identity'

export type CopyrightOwnerFact = 'unconfirmed' | 'llc' | 'personal'

export function attorneyReviewEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.LICENSING_ATTORNEY_REVIEW_ENABLED === 'true'
}

export function stripeNameMatchesLicensor(name: string | null | undefined): boolean {
  const normalized = String(name || '')
    .toLowerCase()
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const expected = LICENSING_LICENSOR.legalName.toLowerCase().replace(/[.,]/g, '').replace(/\s+/g, ' ').trim()
  return normalized.length > 0 && normalized === expected
}

/** Null when review and activation may proceed. */
export function attorneyActionBlock(input: {
  reviewEnabled: boolean
  copyrightOwner: CopyrightOwnerFact
  stripeChecked: boolean
  stripeNameMatchesLlc: boolean
}): string | null {
  if (input.copyrightOwner === 'unconfirmed') {
    return `Record whether ${LICENSING_LICENSOR.legalName} or ${LICENSING_LICENSOR.songwriterName} personally owns the copyright this draft licenses.`
  }
  if (input.copyrightOwner === 'personal') {
    return `This draft names ${LICENSING_LICENSOR.legalName} as the licensor. A lawyer has to change that line before attorney review or activation.`
  }
  if (!input.stripeChecked) {
    return 'Check the Stripe account legal name before attorney review or activation.'
  }
  if (!input.stripeNameMatchesLlc) {
    return `The Stripe account name does not match ${LICENSING_LICENSOR.legalName}. Align the account or the licensor line before attorney review or activation.`
  }
  if (!input.reviewEnabled) {
    return 'Attorney review and activation stay off until a lawyer approves this draft and LICENSING_ATTORNEY_REVIEW_ENABLED is set to true.'
  }
  return null
}
