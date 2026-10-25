import { LICENSING_LICENSOR, licensorSignatureBlock } from '@/lib/licensing/identity'

export const AGREEMENT_NOT_FOR_SIGNATURE =
  'DRAFT — not for signature. A lawyer admitted in Arizona, or in the licensee’s home jurisdiction, must approve this version before it is sent. This draft is not a validated legal instrument.'

export function renderLicenseDraft(input: {
  publicId: string
  licenseeName: string
  contractingEntity: string
  trackTitle: string
  usage: string
  territory: string
  term: string
  feeLabel: string
  exclusivity: string
}): string {
  const owner = LICENSING_LICENSOR
  return [
    AGREEMENT_NOT_FOR_SIGNATURE,
    '',
    `Reference: ${input.publicId}`,
    licensorSignatureBlock(),
    `Licensee: ${input.contractingEntity || input.licenseeName}`,
    `Track: ${input.trackTitle || 'To be named'}`,
    '',
    `${owner.legalName} retains the copyrights in the master recording and the composition to the extent ${owner.legalName} owns or controls those rights.`,
    'This license does not transfer copyright ownership.',
    'The licensee receives only the usage described below.',
    'Sublicensing, redistribution, resale, and use outside that scope are not included.',
    'Further use needs a new agreement or a written amendment.',
    'Exclusive rights are not granted unless this draft says Exclusive and an administrator has approved that grant.',
    '',
    `Usage: ${input.usage}`,
    `Territory: ${input.territory}`,
    `Term: ${input.term}`,
    `Exclusivity: ${input.exclusivity === 'exclusive' ? 'Exclusive — manual approval required' : 'Non-exclusive'}`,
    `Fee: ${input.feeLabel}`,
    'The license becomes effective only after the signed agreement is on file and Stripe reports the quoted fee as paid.',
    'Content ID, YouTube, Meta, and TikTok claims stay with SERGIK unless a later sentence in this draft expressly allows the licensee to claim this recording.',
    `Governing law: ${owner.governingLaw}.`,
    `Forum: ${owner.forum}.`,
  ].join('\n')
}
