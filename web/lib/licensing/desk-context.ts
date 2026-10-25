import { promises as dns } from 'dns'
import { classifyLicensingMx } from '@/lib/licensing/inbound-mx'
import { attorneyActionBlock, attorneyReviewEnabled } from '@/lib/licensing/operator-gate'
import { getOperatorFacts } from '@/lib/licensing/operator-facts'
import { privateQuoteSheet } from '@/lib/licensing/quote-sheet'

export async function licensingDeskContext() {
  const facts = await getOperatorFacts()
  let exchanges: string[] = []
  try {
    const records = await dns.resolveMx('sergikdropz.com')
    exchanges = records.map((record) => record.exchange)
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
    if (code !== 'ENOTFOUND' && code !== 'ENODATA') {
      exchanges = []
    }
  }
  return {
    quoteSheet: privateQuoteSheet(),
    operator: {
      copyrightOwner: facts.copyrightOwner,
      stripeAccountName: facts.stripeAccountName,
      stripeNameMatchesLlc: facts.stripeNameMatchesLlc,
      stripeChecked: facts.stripeChecked,
      storageReady: facts.storageReady,
      attorneyBlock: attorneyActionBlock({
        reviewEnabled: attorneyReviewEnabled(),
        copyrightOwner: facts.copyrightOwner,
        stripeChecked: facts.stripeChecked,
        stripeNameMatchesLlc: facts.stripeNameMatchesLlc,
      }),
    },
    inbound: classifyLicensingMx(exchanges),
  }
}
