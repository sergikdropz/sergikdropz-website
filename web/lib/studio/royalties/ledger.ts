import type {
  PayeeLedgerSummary,
  RoyaltyLedgerEntry,
  RoyaltyOpsSignals,
  RoyaltyPayout,
  RoyaltyStoreSnapshot,
} from '@/lib/studio/royalties/types'
import { DEFAULT_ROYALTY_CURRENCY } from '@/lib/studio/royalties/constants'
import { ensureLabelPayee } from '@/lib/studio/royalties/allocate'

export function emptyRoyaltyStore(): RoyaltyStoreSnapshot {
  const now = new Date().toISOString()
  const label = ensureLabelPayee([])
  return {
    version: 1,
    payees: [label],
    statements: [],
    lines: [],
    ledger: [],
    payouts: [],
    updatedAt: now,
  }
}

export function summarizePayeeLedger(
  ledger: RoyaltyLedgerEntry[],
  payees: RoyaltyStoreSnapshot['payees'],
): PayeeLedgerSummary[] {
  const byId = new Map<string, PayeeLedgerSummary>()

  for (const payee of payees) {
    byId.set(payee.id, {
      payeeId: payee.id,
      payeeName: payee.name,
      isLabelEntity: Boolean(payee.isLabelEntity),
      owedCents: 0,
      paidCents: 0,
      voidedCents: 0,
      entryCount: 0,
      currency: DEFAULT_ROYALTY_CURRENCY,
    })
  }

  for (const entry of ledger) {
    let row = byId.get(entry.payeeId)
    if (!row) {
      row = {
        payeeId: entry.payeeId,
        payeeName: entry.payeeName,
        isLabelEntity: false,
        owedCents: 0,
        paidCents: 0,
        voidedCents: 0,
        entryCount: 0,
        currency: entry.currency || DEFAULT_ROYALTY_CURRENCY,
      }
      byId.set(entry.payeeId, row)
    }
    row.entryCount += 1
    row.currency = entry.currency || row.currency
    if (entry.status === 'owed') row.owedCents += entry.amountCents
    else if (entry.status === 'paid') row.paidCents += entry.amountCents
    else row.voidedCents += entry.amountCents
  }

  return [...byId.values()].sort((a, b) => {
    if (a.isLabelEntity !== b.isLabelEntity) return a.isLabelEntity ? 1 : -1
    return b.owedCents - a.owedCents || a.payeeName.localeCompare(b.payeeName)
  })
}

export function royaltyOpsSignals(store: RoyaltyStoreSnapshot): RoyaltyOpsSignals {
  const owedCents = store.ledger
    .filter((e) => e.status === 'owed' && !store.payees.find((p) => p.id === e.payeeId)?.isLabelEntity)
    .reduce((sum, e) => sum + e.amountCents, 0)

  return {
    statementCount: store.statements.length,
    payeeCount: store.payees.filter((p) => !p.isLabelEntity).length,
    ledgerEntryCount: store.ledger.length,
    payoutCount: store.payouts.length,
    owedCents,
  }
}

export function formatUsdCents(cents: number, currency = 'USD'): string {
  const value = cents / 100
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value)
  } catch {
    return `${currency} ${value.toFixed(2)}`
  }
}

export function applyPayout(args: {
  store: RoyaltyStoreSnapshot
  ledgerEntryIds: string[]
  paidVia: string
  notes?: string | null
  paidAt?: string
}): { store: RoyaltyStoreSnapshot; payout: RoyaltyPayout } | { error: string } {
  const ids = new Set(args.ledgerEntryIds)
  const selected = args.store.ledger.filter((e) => ids.has(e.id))
  if (!selected.length) return { error: 'No ledger entries selected' }

  const owed = selected.filter((e) => e.status === 'owed')
  if (!owed.length) return { error: 'Selected entries are not owed' }

  const payeeIds = new Set(owed.map((e) => e.payeeId))
  if (payeeIds.size !== 1) return { error: 'Payout must be for a single payee' }

  const currencySet = new Set(owed.map((e) => e.currency))
  if (currencySet.size !== 1) return { error: 'Mixed currencies in payout batch' }

  const payeeId = owed[0].payeeId
  const payee = args.store.payees.find((p) => p.id === payeeId)
  if (payee?.isLabelEntity) {
    return { error: 'Label entity retain is not paid out — it stays with the LLC' }
  }

  const now = args.paidAt || new Date().toISOString()
  const payoutId = `payout-${Date.now().toString(36)}`
  const amountCents = owed.reduce((sum, e) => sum + e.amountCents, 0)
  const payout: RoyaltyPayout = {
    id: payoutId,
    payeeId,
    payeeName: owed[0].payeeName,
    amountCents,
    currency: owed[0].currency,
    ledgerEntryIds: owed.map((e) => e.id),
    paidAt: now,
    paidVia: args.paidVia || 'manual',
    notes: args.notes ?? null,
    createdAt: now,
  }

  const ledger = args.store.ledger.map((e) =>
    ids.has(e.id) && e.status === 'owed'
      ? { ...e, status: 'paid' as const, payoutId, updatedAt: now }
      : e,
  )

  return {
    payout,
    store: {
      ...args.store,
      ledger,
      payouts: [payout, ...args.store.payouts],
      updatedAt: now,
    },
  }
}

export function simpleHash(text: string): string {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}
