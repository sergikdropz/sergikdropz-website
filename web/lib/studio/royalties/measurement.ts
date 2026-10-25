import { licensingCampaignUrl } from '@/lib/studio/monetization-links'
import type {
  AmountBasis,
  RoyaltyStatement,
  RoyaltyStoreSnapshot,
  StatementCategory,
} from '@/lib/studio/royalties/types'

export type MonetizationMeasurement = {
  currency: string
  recordingRoyaltyCents: number
  metaCreatorCents: number
  adSpendCents: number
  amountBasis: AmountBasis | 'mixed'
  /** Attributed site sales ÷ ad spend. Catalog royalties are never the numerator. */
  roasLabel: string
  note: string
  licensingUrl: string
}

export function statementCategory(statement: RoyaltyStatement): StatementCategory {
  if (statement.category) return statement.category
  if (statement.source === 'meta_creator') return 'meta_creator'
  if (statement.source === 'meta_ads') return 'meta_ad_spend'
  return 'recording_royalty'
}

export function campaignRoas(attributedSalesCents: number | null, adSpendCents: number): string {
  if (attributedSalesCents == null || adSpendCents <= 0) return 'N/A'
  return (attributedSalesCents / adSpendCents).toFixed(2)
}

function sumCategory(
  statements: RoyaltyStatement[],
  category: StatementCategory,
  currency: string,
): number {
  return statements
    .filter((statement) => statementCategory(statement) === category && statement.currency === currency)
    .reduce((sum, statement) => sum + statement.grossCents, 0)
}

export function summarizeMonetization(
  store: RoyaltyStoreSnapshot,
  attributedSalesCents: number | null = null,
): MonetizationMeasurement {
  const currency = store.statements[0]?.currency || 'USD'
  const bases = new Set(
    store.statements.map((statement) => statement.amountBasis || 'unknown'),
  )
  const amountBasis: AmountBasis | 'mixed' = bases.size > 1 ? 'mixed' : ([...bases][0] as AmountBasis) || 'unknown'
  const adSpendCents = sumCategory(store.statements, 'meta_ad_spend', currency)
  return {
    currency,
    recordingRoyaltyCents: sumCategory(store.statements, 'recording_royalty', currency),
    metaCreatorCents: sumCategory(store.statements, 'meta_creator', currency),
    adSpendCents,
    amountBasis,
    roasLabel: campaignRoas(attributedSalesCents, adSpendCents),
    note:
      'Recording royalties, Meta creator payouts, and ad spend stay in separate totals. ROAS uses attributed site sales only, so it stays N/A until those sales are supplied. Views are not converted into royalties.',
    licensingUrl: licensingCampaignUrl({ campaign: 'studio' }),
  }
}
