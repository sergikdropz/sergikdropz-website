/**
 * Bookkeeping desk for Admin AI. Issue-spots money questions for a CPA.
 * It does not file a return or calculate tax anyone should rely on.
 */

export const BOOKS_DISCLAIMER =
  'Music Business Books is a SergikAI desk for reading SERGIK figures and listing questions for a CPA. It is not an accountant, not a tax opinion, and not a filing. Confirm Arizona tax, W-9s, and payouts with your accountant before you rely on a number.'

export type BooksFinding = {
  id: string
  severity: 'blocker' | 'material' | 'watch' | 'note'
  title: string
  detail: string
}

export type BooksReport = {
  disclaimer: string
  findings: BooksFinding[]
  memo: string
  quotedCents: number | null
  paidCents: number | null
  currency: string | null
}

function money(cents: number | null, currency: string | null): string {
  if (cents == null) return 'unknown'
  const code = (currency || 'usd').toUpperCase()
  return `${code} ${(cents / 100).toFixed(2)}`
}

export function reviewMusicBooks(input: {
  text?: string | null
  quotedCents?: number | null
  paidCents?: number | null
  currency?: string | null
  paidCurrency?: string | null
  productType?: string | null
  collaboratorShareOpen?: boolean | null
  stripeBusinessName?: string | null
}): BooksReport {
  const findings: BooksFinding[] = []
  const narrative = input.text || ''
  const currency = input.currency || null

  if (/cashier'?s check|mobile deposit|forward the (?:balance|difference)|routing number/i.test(narrative)) {
    findings.push({
      id: 'off-platform-payment',
      severity: 'blocker',
      title: 'Payment is trying to leave Stripe',
      detail: 'Checks, forwarded balances, and bank-detail requests do not belong on a SERGIK invoice. Collect the quoted fee in Stripe only.',
    })
  }

  if (input.quotedCents != null && input.paidCents != null && input.quotedCents !== input.paidCents) {
    findings.push({
      id: 'amount-mismatch',
      severity: 'blocker',
      title: 'Quoted fee and paid amount differ',
      detail: `Quote ${money(input.quotedCents, currency)} versus paid ${money(input.paidCents, input.paidCurrency || currency)}.`,
    })
  }

  if (input.currency && input.paidCurrency && input.currency.toLowerCase() !== input.paidCurrency.toLowerCase()) {
    findings.push({
      id: 'currency-mismatch',
      severity: 'blocker',
      title: 'Currency does not match',
      detail: `Quote currency ${input.currency} versus paid currency ${input.paidCurrency}.`,
    })
  }

  if (input.collaboratorShareOpen) {
    findings.push({
      id: 'open-collab-share',
      severity: 'material',
      title: 'A collaborator share is still open',
      detail: 'Collect a W-9 before paying a collaborator from this fee. Do not change the split sheet from this desk.',
    })
  }

  if (input.stripeBusinessName && !/nexus studios az llc/i.test(input.stripeBusinessName)) {
    findings.push({
      id: 'stripe-legal-name',
      severity: 'watch',
      title: 'Stripe legal name should be checked against the licensor',
      detail: `Deposits are expected at Nexus Studios AZ LLC. The name on this note is “${input.stripeBusinessName}”.`,
    })
  }

  findings.push({
    id: 'cpa-questions',
    severity: 'note',
    title: 'Questions for the CPA',
    detail: 'Does Arizona tax apply to this license or custom-production fee, and does any collaborator payout need a 1099? Shop sales stay on the existing Stripe account.',
  })

  if (input.productType === 'license') {
    findings.push({
      id: 'beat-lease-separate',
      severity: 'watch',
      title: 'Shop beat-lease row',
      detail: 'A shop license tier is a different product from a sync license. Do not treat that row as a client sync agreement.',
    })
  }

  const memo = [
    BOOKS_DISCLAIMER,
    '',
    ...findings.map((finding) => `${finding.severity.toUpperCase()}: ${finding.title} — ${finding.detail}`),
  ].join('\n')

  return {
    disclaimer: BOOKS_DISCLAIMER,
    findings,
    memo,
    quotedCents: input.quotedCents ?? null,
    paidCents: input.paidCents ?? null,
    currency,
  }
}
