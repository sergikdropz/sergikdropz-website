import type { CopyrightReadiness } from '@/lib/studio/copyright-pipeline'
import type { RightsTrackLike } from '@/lib/studio/rights-ops'
import { sergikOnlySplits, suggestedSergikPaperwork } from '@/lib/studio/rights-ops'
import type { CollabReviewStatus, ReleaseCollaborator } from '@/lib/studio/release-collab'

type ReviewRow = { collaborator_id: string; status: CollabReviewStatus }

/**
 * After a collab review changes, patch copyright checklist ops when all external parties approved.
 */
export function collabReviewChecklistPatch(input: {
  collaborators: ReleaseCollaborator[]
  reviews: ReviewRow[]
  ops: CopyrightReadiness['ops']
  tracks: RightsTrackLike[]
}): Record<string, string> | null {
  const { collaborators, reviews, ops, tracks } = input
  const reviewByCollab = new Map(reviews.map((r) => [r.collaborator_id, r.status]))
  const external = collaborators.filter(
    (c) => c.email && c.role !== 'label' && c.role !== 'manager',
  )
  if (!external.length) return null

  const allResponded = external.every((c) => {
    const status = reviewByCollab.get(c.id)
    return status === 'approved' || status === 'changes_requested'
  })
  if (!allResponded) return null

  const anyChanges = external.some(
    (c) => reviewByCollab.get(c.id) === 'changes_requested',
  )
  if (anyChanges) return null

  const allApproved = external.every((c) => reviewByCollab.get(c.id) === 'approved')
  if (!allApproved) return null

  const patch: Record<string, string> = {}
  if (ops.split_sheet_status === 'missing') {
    patch.split_sheet_status = 'pending'
  }

  const sergikAuto = suggestedSergikPaperwork(tracks, ops)
  if (sergikAuto) {
    for (const [key, value] of Object.entries(sergikAuto)) {
      patch[key] = value
    }
  } else if (sergikOnlySplits(tracks) && ops.split_sheet_status !== 'approved') {
    patch.split_sheet_status = 'approved'
    if (ops.producer_agreement_status === 'missing') {
      patch.producer_agreement_status = 'approved'
    }
  }

  return Object.keys(patch).length ? patch : null
}

export function contractKindToEmailKind(
  kind: 'split_sheet' | 'producer_agreement' | 'collab_agreement',
): 'contract_split_sheet' | 'contract_producer_agreement' | 'contract_collab_agreement' {
  if (kind === 'producer_agreement') return 'contract_producer_agreement'
  if (kind === 'collab_agreement') return 'contract_collab_agreement'
  return 'contract_split_sheet'
}
