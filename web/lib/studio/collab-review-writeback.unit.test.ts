import { describe, expect, it } from 'vitest'
import { collabReviewChecklistPatch } from '@/lib/studio/collab-review-writeback'

describe('collabReviewChecklistPatch', () => {
  it('sets split sheet pending when all external collaborators approved', () => {
    const patch = collabReviewChecklistPatch({
      collaborators: [
        { id: '1', release_id: 'r', name: 'A', email: 'a@x.com', role: 'writer', notes: null },
        { id: '2', release_id: 'r', name: 'B', email: 'b@x.com', role: 'producer', notes: null },
      ],
      reviews: [
        { collaborator_id: '1', status: 'approved' },
        { collaborator_id: '2', status: 'approved' },
      ],
      ops: {
        owner_name: null,
        role_queue: null,
        split_sheet_status: 'missing',
        producer_agreement_status: 'missing',
        sample_clearance_status: 'missing',
        due_date: null,
      },
      tracks: [
        {
          id: 't1',
          title: 'Track',
          splits: [{ name: 'A', percentage: 50 }, { name: 'B', percentage: 50 }],
          contributors: [],
        },
      ],
    })
    expect(patch).toEqual({ split_sheet_status: 'pending' })
  })

  it('skips when any collaborator requested changes', () => {
    const patch = collabReviewChecklistPatch({
      collaborators: [
        { id: '1', release_id: 'r', name: 'A', email: 'a@x.com', role: 'writer', notes: null },
      ],
      reviews: [{ collaborator_id: '1', status: 'changes_requested' }],
      ops: {
        owner_name: null,
        role_queue: null,
        split_sheet_status: 'missing',
        producer_agreement_status: 'missing',
        sample_clearance_status: 'missing',
        due_date: null,
      },
      tracks: [],
    })
    expect(patch).toBeNull()
  })
})
