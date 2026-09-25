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
}

export type IngestStatementResult = {
  store: RoyaltyStoreSnapshot
  statement: RoyaltyStatement
  lineCount: number
  ledgerCreated: number
  warnings: string[]
  duplicate: boolean
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
    }
  }

  const now = new Date().toISOString()
  const statementId = newId('stmt')
  const isrcMap = buildIsrcMap(input.trackLookup)

  const newLines: RoyaltyStatementLine[] = []
  const newLedger: RoyaltyLedgerEntry[] = []
  let payees = store.payees

  for (const line of parsed.lines) {
    const lineId = newId('line')
    const fullLine: RoyaltyStatementLine = { ...line, id: lineId, statementId }
    newLines.push(fullLine)

    const hit = line.isrc ? isrcMap.get(line.isrc) : undefined
    const splits = hit?.splits || null
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
  }
}
