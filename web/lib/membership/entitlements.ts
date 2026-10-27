export type MembershipPlanId = 'supporter' | 'inner-circle'

export type FanTier = 'free' | MembershipPlanId

export const CREDIT_EXPIRY_MONTHS = 12

export type PlanEntitlements = {
  id: MembershipPlanId
  creditRate: number
  mp3DownloadsPerPeriod: number
  wavDownloadsPerPeriod: number
  canAccessMemberDownloads: boolean
  canBrowseExclusiveStore: boolean
  canPurchaseExclusive: boolean
  exclusiveTeaserOnly: boolean
}

export const PLAN_ENTITLEMENTS: Record<MembershipPlanId, PlanEntitlements> = {
  supporter: {
    id: 'supporter',
    creditRate: 0.75,
    mp3DownloadsPerPeriod: 4,
    wavDownloadsPerPeriod: 2,
    canAccessMemberDownloads: true,
    canBrowseExclusiveStore: true,
    canPurchaseExclusive: false,
    exclusiveTeaserOnly: true,
  },
  'inner-circle': {
    id: 'inner-circle',
    creditRate: 0.9,
    mp3DownloadsPerPeriod: 8,
    wavDownloadsPerPeriod: 4,
    canAccessMemberDownloads: true,
    canBrowseExclusiveStore: true,
    canPurchaseExclusive: true,
    exclusiveTeaserOnly: false,
  },
}

export function entitlementsForPlan(planId: string | null | undefined): PlanEntitlements | null {
  if (planId === 'supporter' || planId === 'inner-circle') {
    return PLAN_ENTITLEMENTS[planId]
  }
  return null
}

export function planRank(planId: string | null | undefined): number {
  if (planId === 'inner-circle') return 2
  if (planId === 'supporter') return 1
  return 0
}
