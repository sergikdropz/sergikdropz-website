import { allocateStatementLine, ensureLabelPayee } from '@/lib/studio/royalties/allocate'
import { emptyRoyaltyStore, simpleHash } from '@/lib/studio/royalties/ledger'
import { parseRoyaltyStatementCsv } from '@/lib/studio/royalties/parse-statement'
import type {
  RoyaltyLedgerEntry,
  RoyaltyStatement,
  RoyaltyStatementLine,
  RoyaltyStoreSnapshot,
  SplitShare,
} from '@/lib/studio/royalties/types'

export type TrackSplitLookup = {
  isrc: string | null
  trackId: string | null
  releaseId: string | null
  title: string | null
  splits: SplitShare[] | null
}

export type IngestStatementInput = {
  csvText: string
  filename?: string | null
  notes?: string | null
  /** Optional ISRC → split sheet lookup from distribution_tracks */
  trackLookup?: TrackSplitLookup[]
  store?: RoyaltyStoreSnapshot
  /** When set, a later pull with the same key replaces the previous snapshot. */
  externalKey?: string | null
}

export type IngestStatementResult = {
  store: RoyaltyStoreSnapshot
  statement: RoyaltyStatement
  lineCount: number
  ledgerCreated: number
  warnings: string[]
  duplicate: boolean
  replaced: boolean
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function buildIsrcMap(lookup: TrackSplitLookup[] | undefined): Map<string, TrackSplitLookup> {
  const map = new Map<string, TrackSplitLookup>()
  for (const row of lookup || []) {
    const isrc = (row.isrc || '').replace(/[- ]/g, '').toUpperCase()
    if (isrc) map.set(isrc, row)
  }
  return map
}

/**
 * Ingest a partner royalty CSV into statements + ledger allocations.
 * Idempotent on content hash — re-upload of the same file is a no-op.
 */
export function ingestRoyaltyStatement(input: IngestStatementInput): IngestStatementResult {
  const parsed = parseRoyaltyStatementCsv(input.csvText)
  const warnings = [...parsed.warnings]
  let store = input.store ? { ...input.store } : emptyRoyaltyStore()
  store = {
    ...store,
    payees: [...store.payees],
    statements: [...store.statements],
    lines: [...store.lines],
    ledger: [...store.ledger],
    payouts: [...store.payouts],
  }

  const label = ensureLabelPayee(store.payees)
  if (!store.payees.some((p) => p.id === label.id)) {
    store.payees = [label, ...store.payees]
  }

  const contentHash = simpleHash(input.csvText.trim())
  const existing = store.statements.find((s) => s.contentHash === contentHash)
  if (existing) {
    return {
      store,
      statement: existing,
      lineCount: existing.lineCount,
      ledgerCreated: 0,
      warnings: ['Statement already ingested (same file hash)'],
      duplicate: true,
      replaced: false,
    }
  }

  const externalKey = input.externalKey?.trim() || null
  let replaced = false
  if (externalKey) {
    const prior = store.statements.find((statement) => statement.externalKey === externalKey)
    if (prior) {
      const paid = store.ledger.some((entry) => entry.statementId === prior.id && entry.status === 'paid')
      if (paid) {
        return {
          store,
          statement: prior,
          lineCount: prior.lineCount,
          ledgerCreated: 0,
          warnings: ['Previous pull has a paid ledger row, so it was left in place.'],
          duplicate: true,
          replaced: false,
        }
      }
      store.statements = store.statements.filter((statement) => statement.id !== prior.id)
      store.lines = store.lines.filter((line) => line.statementId !== prior.id)
      store.ledger = store.ledger.filter((entry) => entry.statementId !== prior.id)
      replaced = true
    }
  }

  const now = new Date().toISOString()
  const statementId = newId('stmt')
  const isrcMap = buildIsrcMap(input.trackLookup)

  const newLines: RoyaltyStatementLine[] = []
  const newLedger: RoyaltyLedgerEntry[] = []
  let payees = store.payees
  const unmatched = new Set<string>()

  for (const line of parsed.lines) {
    const lineId = newId('line')
    const fullLine: RoyaltyStatementLine = { ...line, id: lineId, statementId }
    newLines.push(fullLine)

    const hit = line.isrc ? isrcMap.get(line.isrc) : undefined
    if (parsed.category === 'meta_ad_spend') continue
    if (parsed.category === 'recording_royalty' && line.isrc && !hit && !unmatched.has(line.isrc)) {
      unmatched.add(line.isrc)
      warnings.push(`Unmatched ISRC ${line.isrc} parked with the LLC until Rights links it.`)
    }
    const splits = parsed.category === 'meta_creator' ? null : hit?.splits || null
    const alloc = allocateStatementLine({
      statementId,
      statementLineId: lineId,
      line,
      splits,
      payees,
      releaseId: hit?.releaseId,
      trackId: hit?.trackId,
    })
    payees = alloc.payees
    warnings.push(...alloc.warnings)
    for (const entry of alloc.entries) {
      newLedger.push({
        ...entry,
        id: newId('led'),
        createdAt: now,
        updatedAt: now,
      })
    }
  }

  const grossCents = newLines.reduce((sum, l) => sum + l.amountCents, 0)
  const statement: RoyaltyStatement = {
    id: statementId,
    source: parsed.source,
    filename: input.filename ?? null,
    periodLabel: parsed.periodLabel,
    currency: parsed.currency,
    grossCents,
    lineCount: newLines.length,
    contentHash,
    ingestedAt: now,
    notes: input.notes ?? null,
    category: parsed.category,
    amountBasis: parsed.amountBasis,
    externalKey,
  }

  store = {
    ...store,
    payees,
    statements: [statement, ...store.statements],
    lines: [...newLines, ...store.lines],
    ledger: [...newLedger, ...store.ledger],
    updatedAt: now,
  }

  return {
    store,
    statement,
    lineCount: newLines.length,
    ledgerCreated: newLedger.length,
    warnings,
    duplicate: false,
    replaced,
  }
}
