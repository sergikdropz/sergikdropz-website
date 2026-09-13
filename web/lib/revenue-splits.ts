import splitsConfig from '@/data/revenue-splits.json'

interface SplitEntry {
  collaborator_id: string
  collaborator_name: string
  track_title: string
  collaborator_amount: number
  split_percent: number
}

/**
 * Given a product ID (EP) and the total sale amount (in cents),
 * calculate how much each collaborator is owed.
 *
 * For EP sales: each track gets an equal share of the sale price,
 * then the collaborator gets their splitPercent of their collab track's share.
 */
export function calculateSplitsForProduct(
  productId: string,
  totalAmountCents: number
): SplitEntry[] {
  const releaseId = productId.replace(/^ep-/, '')
  const epKey = Object.keys(splitsConfig.splits).find(
    (key) => key === productId || key === `ep-${releaseId}` || key.replace(/^ep-/, '') === releaseId
  )

  if (!epKey) return []

  const epConfig = (splitsConfig.splits as Record<string, any>)[epKey]
  if (!epConfig?.collabTracks?.length) return []

  const perTrackShare = Math.floor(totalAmountCents / epConfig.totalTracks)

  return epConfig.collabTracks.map((track: any) => {
    const collaboratorAmount = Math.floor(perTrackShare * (track.splitPercent / 100))

    return {
      collaborator_id: track.collaboratorId,
      collaborator_name: track.collaboratorName,
      track_title: track.title,
      collaborator_amount: collaboratorAmount,
      split_percent: track.splitPercent,
    }
  })
}

/**
 * For bundle purchases, calculate splits for each EP included.
 * The bundle price is distributed proportionally across EPs.
 */
export function calculateSplitsForBundle(
  productIds: string[],
  totalAmountCents: number
): (SplitEntry & { product_id: string })[] {
  if (!productIds.length) return []

  const perEpAmount = Math.floor(totalAmountCents / productIds.length)
  const results: (SplitEntry & { product_id: string })[] = []

  for (const productId of productIds) {
    const splits = calculateSplitsForProduct(productId, perEpAmount)
    for (const split of splits) {
      results.push({ ...split, product_id: productId })
    }
  }

  return results
}

export function getCollaboratorConfig() {
  return splitsConfig.collaborators
}

export function getSplitsConfig() {
  return splitsConfig.splits
}
