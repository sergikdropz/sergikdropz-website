/** Meta's own follower gates, read off the Page monetization screen. A short count stays closed. */

export const STARS_FOLLOWERS = 500
export const SUBSCRIPTION_FOLLOWERS = 5_000

export type MonetizationSystemState = 'running' | 'blocked' | 'waiting'

export type MonetizationSystem = {
  id: string
  label: string
  state: MonetizationSystemState
  detail: string
}

function count(value: number): string {
  return Math.max(0, Math.floor(value)).toLocaleString('en-US')
}

function stars(followers: number, name: string): MonetizationSystem {
  const ready = followers >= STARS_FOLLOWERS
  return {
    id: 'facebook_stars',
    label: 'Facebook Stars',
    state: ready ? 'waiting' : 'blocked',
    detail: ready
      ? `${name} has ${count(followers)} followers, which meets the ${count(STARS_FOLLOWERS)}-follower Stars rule. Meta still has to accept the Page. This desk does not open a payout account.`
      : `${name} has ${count(followers)} Page followers. Stars needs ${count(STARS_FOLLOWERS)} for 30 days, so setup stays closed.`,
  }
}

function subscriptions(pageFollowers: number, pageName: string, igFollowers: number, igName: string): MonetizationSystem {
  const pageReady = pageFollowers >= SUBSCRIPTION_FOLLOWERS
  const igReady = igFollowers >= SUBSCRIPTION_FOLLOWERS
  return {
    id: 'meta_subscriptions',
    label: 'Meta Subscriptions',
    state: pageReady || igReady ? 'waiting' : 'blocked',
    detail:
      pageReady || igReady
        ? `A profile meets the ${count(SUBSCRIPTION_FOLLOWERS)}-follower rule. Meta still has to accept it. This desk does not open a payout account.`
        : `${pageName} has ${count(pageFollowers)} Page followers and @${igName} has ${count(igFollowers)}. Subscriptions need ${count(SUBSCRIPTION_FOLLOWERS)}, so setup stays closed.`,
  }
}

export function metaMonetizationSystems(input: {
  pageFollowers: number
  pageName: string
  igFollowers: number
  igUsername: string
  recordingCents: number
  creatorCents: number
  instagramInsights: boolean
}): MonetizationSystem[] {
  const pageName = input.pageName.trim() || 'The Page'
  const igName = input.igUsername.replace(/^@/, '').trim() || 'instagram'
  return [
    stars(input.pageFollowers, pageName),
    subscriptions(input.pageFollowers, pageName, input.igFollowers, igName),
    {
      id: 'recording_royalties',
      label: 'Recording royalties',
      state: input.recordingCents > 0 ? 'running' : 'waiting',
      detail:
        input.recordingCents > 0
          ? 'DistroKid statements are in the ledger. A view is not added on top.'
          : 'No recording statement is in the ledger yet. DistroKid stays a bank CSV.',
    },
    {
      id: 'facebook_creator',
      label: 'Facebook content monetization',
      state: 'running',
      detail:
        input.creatorCents > 0
          ? 'Page insights returned content-monetization amounts. They stay approximate.'
          : 'The Page insights pull is connected. The stored window is $0.00.',
    },
    {
      id: 'instagram_creator',
      label: 'Instagram creator earnings',
      state: input.instagramInsights ? 'running' : 'blocked',
      detail: input.instagramInsights
        ? 'Instagram insights are connected. Meta does not include an earnings amount, so the pull writes nothing.'
        : 'Reconnect Meta and allow Instagram insights.',
    },
  ]
}
