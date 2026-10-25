export const INQUIRY_STATUSES = [
  'EMAIL_VERIFICATION_PENDING',
  'BUSINESS_VERIFICATION_PENDING',
  'UNDER_REVIEW',
  'QUOTE_SENT',
  'QUOTE_ACCEPTED',
  'PAYMENT_PENDING',
  'AWAITING_ACTIVATION',
  'ACTIVE',
  'EXPIRED',
  'CANCELLED',
  'REJECTED',
  'TERMINATED',
] as const

export type InquiryStatus = (typeof INQUIRY_STATUSES)[number]

const TRANSITIONS: Record<InquiryStatus, readonly InquiryStatus[]> = {
  EMAIL_VERIFICATION_PENDING: ['UNDER_REVIEW', 'BUSINESS_VERIFICATION_PENDING', 'CANCELLED', 'REJECTED'],
  BUSINESS_VERIFICATION_PENDING: ['UNDER_REVIEW', 'REJECTED', 'CANCELLED'],
  UNDER_REVIEW: ['QUOTE_SENT', 'BUSINESS_VERIFICATION_PENDING', 'REJECTED', 'CANCELLED'],
  QUOTE_SENT: ['QUOTE_ACCEPTED', 'UNDER_REVIEW', 'CANCELLED', 'REJECTED'],
  QUOTE_ACCEPTED: ['PAYMENT_PENDING', 'UNDER_REVIEW', 'CANCELLED'],
  PAYMENT_PENDING: ['AWAITING_ACTIVATION', 'QUOTE_ACCEPTED', 'CANCELLED'],
  AWAITING_ACTIVATION: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['EXPIRED', 'TERMINATED'],
  EXPIRED: [],
  CANCELLED: [],
  REJECTED: ['UNDER_REVIEW'],
  TERMINATED: [],
}

export function canTransitionInquiry(from: InquiryStatus, to: InquiryStatus): boolean {
  if (from === to) return true
  return TRANSITIONS[from].includes(to)
}

export function assertInquiryTransition(from: InquiryStatus, to: InquiryStatus): void {
  if (!canTransitionInquiry(from, to)) {
    throw new Error(`Licensing inquiry cannot move from ${from} to ${to}.`)
  }
}
