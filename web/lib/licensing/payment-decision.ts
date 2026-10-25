export type PaymentDecision =
  | { ok: true }
  | { ok: false; reason: string }

export function licensingPaymentDecision(input: {
  paymentStatus: string | null
  amountTotal: number | null
  currency: string | null
  quoteCents: number | null
  quoteCurrency: string | null
  quoteAccepted: boolean
}): PaymentDecision {
  if (!input.quoteAccepted) return { ok: false, reason: 'Quote is not accepted.' }
  if (input.paymentStatus !== 'paid') return { ok: false, reason: 'Stripe has not marked this payment paid.' }
  if (!input.quoteCents || input.quoteCents < 1) return { ok: false, reason: 'Quote amount is missing.' }
  if (input.amountTotal !== input.quoteCents) return { ok: false, reason: 'Paid amount does not match the quote.' }
  const quoted = (input.quoteCurrency || 'usd').toLowerCase()
  const paid = (input.currency || '').toLowerCase()
  if (paid !== quoted) return { ok: false, reason: 'Paid currency does not match the quote.' }
  return { ok: true }
}
