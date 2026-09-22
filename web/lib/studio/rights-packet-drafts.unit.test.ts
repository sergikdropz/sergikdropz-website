import { describe, expect, it } from 'vitest'
import {
  clearRightsPacketDraft,
  mergeRightsPacketDrafts,
  parseRightsPacketDrafts,
  rightsPacketDraftText,
  setRightsPacketDraft,
} from '@/lib/studio/rights-packet-drafts'

describe('rights packet drafts', () => {
  it('parses and merges drafts', () => {
    const parsed = parseRightsPacketDrafts({
      split_sheet: { text: 'Split body', updated_at: '2026-01-01' },
      producer_agreement: { text: '' },
    })
    expect(parsed.split_sheet?.text).toBe('Split body')
    expect(parsed.producer_agreement).toBeUndefined()

    const merged = mergeRightsPacketDrafts(parsed, {
      collab_agreement: { text: 'Collab body' },
    })
    expect(rightsPacketDraftText(merged, 'collab_agreement')).toBe('Collab body')
    expect(rightsPacketDraftText(merged, 'split_sheet')).toBe('Split body')
  })

  it('sets and clears a draft', () => {
    const withDraft = setRightsPacketDraft({}, 'split_sheet', 'Edited packet')
    expect(withDraft.split_sheet?.text).toBe('Edited packet')
    expect(clearRightsPacketDraft(withDraft, 'split_sheet')).toEqual({})
  })
})
