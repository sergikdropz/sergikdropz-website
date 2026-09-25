import {
  LABEL_LEGAL_ENTITY_NAME,
  LABEL_LEGAL_ENTITY_PAYEE_ID,
  LABEL_RETAIN_NAME_ALIASES,
} from '@/lib/studio/royalties/constants'
import type {
  RoyaltyLedgerEntry,
  RoyaltyPayee,
  SplitShare,
  StatementLineInput,
} from '@/lib/studio/royalties/types'

function clean(value: unknown): string {
  return value == null ? '' : String(value).trim()
}

export function normalizePayeeKey(name: string): string {
  return clean(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function isLabelRetainName(name: string): boolean {
  const key = normalizePayeeKey(name).replace(/-/g, ' ')
  return (LABEL_RETAIN_NAME_ALIASES as readonly string[]).includes(key)
}

export function ensureLabelPayee(payees: RoyaltyPayee[]): RoyaltyPayee {
  const existing = payees.find((p) => p.id === LABEL_LEGAL_ENTITY_PAYEE_ID || p.isLabelEntity)
  if (existing) return existing
  const now = new Date().toISOString()
  return {
    id: LABEL_LEGAL_ENTITY_PAYEE_ID,
    name: LABEL_LEGAL_ENTITY_NAME,
    email: null,
    paymentMethod: null,
    notes: 'Sole partner payee — DistroKid / Revelator deposit to LLC; Studio pays collabs',
    isLabelEntity: true,
    createdAt: now,
    updatedAt: now,
  }
}

export function resolveOrCreatePayee(
  payees: RoyaltyPayee[],
  name: string,
  opts?: { email?: string | null; paymentMethod?: string | null },
): { payee: RoyaltyPayee; created: boolean; payees: RoyaltyPayee[] } {
  if (isLabelRetainName(name) || !clean(name)) {
    const label = ensureLabelPayee(payees)
    const next = payees.some((p) => p.id === label.id) ? payees : [...payees, label]
    return { payee: label, created: !payees.some((p) => p.id === label.id), payees: next }
  }

  const key = normalizePayeeKey(name)
  const existing = payees.find(
    (p) => p.id === key || normalizePayeeKey(p.name) === key,
  )
  if (existing) return { payee: existing, created: false, payees }

  const now = new Date().toISOString()
  const payee: RoyaltyPayee = {
    id: key || `payee-${Date.now().toString(36)}`,
    name: clean(name),
    email: opts?.email ?? null,
    paymentMethod: opts?.paymentMethod ?? null,
    notes: null,
    isLabelEntity: false,
    createdAt: now,
    updatedAt: now,
  }
  return { payee, created: true, payees: [...payees, payee] }
}

/**
 * Normalize split sheet rows. If empty / invalid, 100% label retain.
 * Percentages rebalanced to 100 when they nearly sum (float drift).
 */
export function normalizeSplits(splits: SplitShare[] | null | undefined): SplitShare[] {
  const cleaned = (splits || [])
    .map((s) => ({
      name: clean(s.name),
      percentage: Number(s.percentage),
      payeeId: s.payeeId ?? null,
    }))
    .filter((s) => s.name && Number.isFinite(s.percentage) && s.percentage > 0)

  if (!cleaned.length) {
    return [{ name: LABEL_LEGAL_ENTITY_NAME, percentage: 100, payeeId: LABEL_LEGAL_ENTITY_PAYEE_ID }]
  }

  const sum = cleaned.reduce((acc, s) => acc + s.percentage, 0)
  if (Math.abs(sum - 100) > 0.51) {
    // Unusable sheet — park everything with LLC until Rights fixes splits
    return [{ name: LABEL_LEGAL_ENTITY_NAME, percentage: 100, payeeId: LABEL_LEGAL_ENTITY_PAYEE_ID }]
  }

  if (Math.abs(sum - 100) > 0.001) {
    const scale = 100 / sum
    return cleaned.map((s) => ({ ...s, percentage: s.percentage * scale }))
  }
  return cleaned
}

export type AllocateLineResult = {
  entries: Omit<RoyaltyLedgerEntry, 'id' | 'createdAt' | 'updatedAt'>[]
  payees: RoyaltyPayee[]
  warnings: string[]
}

/**
 * Allocate one statement line across split shares. Remainder cents go to the
 * largest share (usually label) so totals always match the line amount.
 */
export function allocateStatementLine(args: {
  statementId: string
  statementLineId: string
  line: StatementLineInput
  splits: SplitShare[] | null | undefined
  payees: RoyaltyPayee[]
  releaseId?: string | null
  trackId?: string | null
}): AllocateLineResult {
  const warnings: string[] = []
  let payees = [...args.payees]
  const shares = normalizeSplits(args.splits)
  if (!(args.splits || []).length) {
    warnings.push(
      `No split sheet for ${args.line.isrc || args.line.trackTitle || 'line'} — 100% to ${LABEL_LEGAL_ENTITY_NAME}`,
    )
  }

  const total = args.line.amountCents
  const draft: { payee: RoyaltyPayee; percent: number; amountCents: number }[] = []
  let allocated = 0

  for (let i = 0; i < shares.length; i++) {
    const share = shares[i]
    const resolved = resolveOrCreatePayee(payees, share.name)
    payees = resolved.payees
    const isLast = i === shares.length - 1
    const cents = isLast
      ? total - allocated
      : Math.round((total * share.percentage) / 100)
    if (!isLast) allocated += cents
    draft.push({ payee: resolved.payee, percent: share.percentage, amountCents: cents })
  }

  // Fix rounding so sum === total
  const sum = draft.reduce((a, d) => a + d.amountCents, 0)
  if (sum !== total && draft.length) {
    const largest = draft.reduce((best, d) =>
      Math.abs(d.amountCents) >= Math.abs(best.amountCents) ? d : best,
    )
    largest.amountCents += total - sum
  }

  const entries = draft
    .filter((d) => d.amountCents !== 0)
    .map((d) => ({
      statementId: args.statementId,
      statementLineId: args.statementLineId,
      payeeId: d.payee.id,
      payeeName: d.payee.name,
      isrc: args.line.isrc,
      trackTitle: args.line.trackTitle,
      store: args.line.store,
      splitPercent: Math.round(d.percent * 100) / 100,
      amountCents: d.amountCents,
      currency: args.line.currency,
      status: 'owed' as const,
      payoutId: null,
      releaseId: args.releaseId ?? null,
      trackId: args.trackId ?? null,
    }))

  return { entries, payees, warnings }
}
