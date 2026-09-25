/** DSP partner statement → payee ledger → payouts (label royalty ops). */

export const ROYALTY_SOURCES = ['distrokid', 'revelator', 'manual', 'generic'] as const
export type RoyaltySource = (typeof ROYALTY_SOURCES)[number]

export const LEDGER_STATUSES = ['owed', 'paid', 'voided'] as const
export type LedgerStatus = (typeof LEDGER_STATUSES)[number]

export type RoyaltyPayee = {
  id: string
  name: string
  email: string | null
  paymentMethod: string | null
  notes: string | null
  /** True for Nexus Studios AZ LLC — retains label share */
  isLabelEntity?: boolean
  createdAt: string
  updatedAt: string
}

export type StatementLineInput = {
  isrc: string | null
  upc: string | null
  trackTitle: string | null
  albumTitle: string | null
  artistName: string | null
  store: string | null
  territory: string | null
  quantity: number | null
  /** Net earnings in minor units (cents) */
  amountCents: number
  currency: string
  saleDate: string | null
  raw?: Record<string, string>
}

export type RoyaltyStatementLine = StatementLineInput & {
  id: string
  statementId: string
}

export type RoyaltyStatement = {
  id: string
  source: RoyaltySource
  filename: string | null
  periodLabel: string | null
  currency: string
  /** Sum of line amountCents */
  grossCents: number
  lineCount: number
  contentHash: string
  ingestedAt: string
  notes: string | null
}

export type SplitShare = {
  name: string
  percentage: number
  payeeId?: string | null
}

export type RoyaltyLedgerEntry = {
  id: string
  statementId: string
  statementLineId: string
  payeeId: string
  payeeName: string
  isrc: string | null
  trackTitle: string | null
  store: string | null
  splitPercent: number
  amountCents: number
  currency: string
  status: LedgerStatus
  payoutId: string | null
  releaseId: string | null
  trackId: string | null
  createdAt: string
  updatedAt: string
}

export type RoyaltyPayout = {
  id: string
  payeeId: string
  payeeName: string
  amountCents: number
  currency: string
  ledgerEntryIds: string[]
  paidAt: string
  paidVia: string
  notes: string | null
  createdAt: string
}

export type RoyaltyStoreSnapshot = {
  version: 1
  payees: RoyaltyPayee[]
  statements: RoyaltyStatement[]
  lines: RoyaltyStatementLine[]
  ledger: RoyaltyLedgerEntry[]
  payouts: RoyaltyPayout[]
  updatedAt: string
}

export type PayeeLedgerSummary = {
  payeeId: string
  payeeName: string
  isLabelEntity: boolean
  owedCents: number
  paidCents: number
  voidedCents: number
  entryCount: number
  currency: string
}

export type RoyaltyOpsSignals = {
  statementCount: number
  payeeCount: number
  ledgerEntryCount: number
  payoutCount: number
  owedCents: number
}

export type ParseStatementResult = {
  source: RoyaltySource
  currency: string
  periodLabel: string | null
  lines: StatementLineInput[]
  warnings: string[]
}
