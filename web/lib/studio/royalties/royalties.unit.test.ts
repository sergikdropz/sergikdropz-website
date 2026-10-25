import { describe, expect, it } from 'vitest'
import {
  allocateStatementLine,
  applyPayout,
  campaignRoas,
  emptyRoyaltyStore,
  formatUsdCents,
  ingestRoyaltyStatement,
  isLabelRetainName,
  parseRoyaltyStatementCsv,
  royaltyOpsSignals,
  summarizeMonetization,
  summarizePayeeLedger,
  LABEL_LEGAL_ENTITY_PAYEE_ID,
} from '@/lib/studio/royalties'

const DISTROKID_CSV = `Reporting Date,Sale Month,Store,Territory,UPC,ISRC,Song Title,Album Name,Artist Name,Quantity,Earnings (USD)
2026-01-15,2025-12,Spotify,US,123456789012,QTA530000001,Neon Drift,UTOPIA,SERGIK,1000,12.50
2026-01-15,2025-12,Apple Music,US,123456789012,QTA530000001,Neon Drift,UTOPIA,SERGIK,200,3.00
2026-01-15,2025-12,Spotify,US,123456789012,QTA530000002,Collab Cut,UTOPIA,SERGIK,500,8.00
`

describe('royalty statement parse', () => {
  it('detects DistroKid columns and converts dollars to cents', () => {
    const parsed = parseRoyaltyStatementCsv(DISTROKID_CSV)
    expect(parsed.source).toBe('distrokid')
    expect(parsed.lines).toHaveLength(3)
    expect(parsed.lines[0].amountCents).toBe(1250)
    expect(parsed.lines[0].isrc).toBe('QTA530000001')
    expect(parsed.currency).toBe('USD')
  })
})

describe('allocate + ingest', () => {
  it('maps SERGIK share to LLC and collab to payee', () => {
    const result = ingestRoyaltyStatement({
      csvText: DISTROKID_CSV,
      filename: 'dk-jan.csv',
      trackLookup: [
        {
          isrc: 'QTA530000001',
          trackId: 't1',
          releaseId: 'r1',
          title: 'Neon Drift',
          splits: [
            { name: 'SERGIK', percentage: 70 },
            { name: 'Auxlee', percentage: 30 },
          ],
        },
        {
          isrc: 'QTA530000002',
          trackId: 't2',
          releaseId: 'r1',
          title: 'Collab Cut',
          splits: [
            { name: 'SERGIK', percentage: 50 },
            { name: 'Batt Lo', percentage: 50 },
          ],
        },
      ],
    })

    expect(result.duplicate).toBe(false)
    expect(result.lineCount).toBe(3)
    expect(result.statement.grossCents).toBe(1250 + 300 + 800)

    const auxlee = result.store.payees.find((p) => p.name === 'Auxlee')
    expect(auxlee).toBeTruthy()
    expect(isLabelRetainName('SERGIK')).toBe(true)

    const summary = summarizePayeeLedger(result.store.ledger, result.store.payees)
    const label = summary.find((s) => s.payeeId === LABEL_LEGAL_ENTITY_PAYEE_ID)
    const aux = summary.find((s) => s.payeeName === 'Auxlee')
    const batt = summary.find((s) => s.payeeName === 'Batt Lo')

    // Neon Drift 15.50 * 30% = 4.65; Collab 8.00 * 50% = 4.00
    expect(aux?.owedCents).toBe(465)
    expect(batt?.owedCents).toBe(400)
    expect(label?.owedCents).toBe(result.statement.grossCents - 465 - 400)

    const signals = royaltyOpsSignals(result.store)
    expect(signals.statementCount).toBe(1)
    expect(signals.payeeCount).toBeGreaterThanOrEqual(2)
    expect(signals.owedCents).toBe(465 + 400)
  })

  it('is idempotent on the same CSV hash', () => {
    const first = ingestRoyaltyStatement({ csvText: DISTROKID_CSV })
    const second = ingestRoyaltyStatement({ csvText: DISTROKID_CSV, store: first.store })
    expect(second.duplicate).toBe(true)
    expect(second.store.statements).toHaveLength(1)
  })

  it('parks unknown ISRC 100% with LLC', () => {
    const alloc = allocateStatementLine({
      statementId: 's1',
      statementLineId: 'l1',
      line: {
        isrc: 'UNKNOWN',
        upc: null,
        trackTitle: 'Solo',
        albumTitle: null,
        artistName: null,
        store: 'Spotify',
        territory: 'US',
        quantity: 1,
        amountCents: 1000,
        currency: 'USD',
        saleDate: null,
      },
      splits: null,
      payees: emptyRoyaltyStore().payees,
    })
    expect(alloc.entries).toHaveLength(1)
    expect(alloc.entries[0].payeeId).toBe(LABEL_LEGAL_ENTITY_PAYEE_ID)
    expect(alloc.entries[0].amountCents).toBe(1000)
  })
})

describe('payouts', () => {
  it('marks a single-payee batch paid and blocks LLC payout', () => {
    const ingested = ingestRoyaltyStatement({
      csvText: DISTROKID_CSV,
      trackLookup: [
        {
          isrc: 'QTA530000002',
          trackId: 't2',
          releaseId: 'r1',
          title: 'Collab Cut',
          splits: [
            { name: 'SERGIK', percentage: 50 },
            { name: 'Batt Lo', percentage: 50 },
          ],
        },
      ],
    })

    const battEntries = ingested.store.ledger.filter(
      (e) => e.payeeName === 'Batt Lo' && e.status === 'owed',
    )
    expect(battEntries.length).toBeGreaterThan(0)

    const paid = applyPayout({
      store: ingested.store,
      ledgerEntryIds: battEntries.map((e) => e.id),
      paidVia: 'venmo',
      notes: 'Feb settlement',
    })
    expect('error' in paid).toBe(false)
    if ('error' in paid) return

    expect(paid.payout.amountCents).toBe(400)
    expect(paid.store.ledger.filter((e) => e.id === battEntries[0].id)[0].status).toBe('paid')
    expect(formatUsdCents(paid.payout.amountCents)).toBe('$4.00')

    const labelIds = ingested.store.ledger
      .filter((e) => e.payeeId === LABEL_LEGAL_ENTITY_PAYEE_ID)
      .map((e) => e.id)
    const blocked = applyPayout({
      store: paid.store,
      ledgerEntryIds: labelIds,
      paidVia: 'wire',
    })
    expect('error' in blocked).toBe(true)
  })
})

const META_ADS_CSV = `Campaign name,Ad set name,Amount spent,Currency,Impressions
UTOPIA launch,Reels,25.00,USD,10000
=CMD|calc,Feed,10.00,USD,200
`

const META_CREATOR_CSV = `Page ID,Approximate earnings,Currency,Song Title,ISRC
111,40.00,USD,Neon Drift,QTA530000001
`

describe('meta actuals stay separate from splits', () => {
  it('stores ad spend as a cost and does not pay collaborators', () => {
    const parsed = parseRoyaltyStatementCsv(META_ADS_CSV)
    expect(parsed.source).toBe('meta_ads')
    expect(parsed.category).toBe('meta_ad_spend')
    expect(parsed.lines[1].raw?.campaignname?.startsWith("'")).toBe(true)

    const result = ingestRoyaltyStatement({
      csvText: META_ADS_CSV,
      trackLookup: [
        {
          isrc: 'QTA530000001',
          trackId: 't1',
          releaseId: 'r1',
          title: 'Neon Drift',
          splits: [
            { name: 'SERGIK', percentage: 50 },
            { name: 'Auxlee', percentage: 50 },
          ],
        },
      ],
    })
    expect(result.statement.grossCents).toBe(3500)
    expect(result.ledgerCreated).toBe(0)
    expect(summarizeMonetization(result.store).adSpendCents).toBe(3500)
    expect(summarizeMonetization(result.store).roasLabel).toBe('N/A')
    expect(campaignRoas(7000, 3500)).toBe('2.00')
    expect(campaignRoas(null, 0)).toBe('N/A')
  })

  it('keeps creator payouts with the LLC and does not deduct 20 percent', () => {
    const result = ingestRoyaltyStatement({
      csvText: META_CREATOR_CSV,
      trackLookup: [
        {
          isrc: 'QTA530000001',
          trackId: 't1',
          releaseId: 'r1',
          title: 'Neon Drift',
          splits: [
            { name: 'SERGIK', percentage: 50 },
            { name: 'Auxlee', percentage: 50 },
          ],
        },
      ],
    })
    expect(result.statement.category).toBe('meta_creator')
    expect(result.statement.amountBasis).toBe('unknown')
    expect(result.statement.grossCents).toBe(4000)
    expect(result.store.ledger.every((entry) => entry.payeeId === LABEL_LEGAL_ENTITY_PAYEE_ID)).toBe(true)
    expect(result.store.payees.some((payee) => payee.name === 'Auxlee')).toBe(false)
    expect(result.warnings.some((warning) => warning.includes('20%'))).toBe(true)
  })

  it('replaces an API snapshot instead of stacking the same days', () => {
    const first = ingestRoyaltyStatement({
      csvText: META_ADS_CSV,
      externalKey: 'meta_ads:last_30d',
    })
    const second = ingestRoyaltyStatement({
      csvText: META_ADS_CSV.replace('25.00', '30.00'),
      externalKey: 'meta_ads:last_30d',
      store: first.store,
    })
    expect(second.replaced).toBe(true)
    expect(second.store.statements.filter((statement) => statement.externalKey === 'meta_ads:last_30d')).toHaveLength(1)
    expect(second.statement.grossCents).toBe(4000)
  })
})
