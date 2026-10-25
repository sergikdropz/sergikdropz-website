import { describe, expect, it } from 'vitest'
import { isReplyLeadIn, replyGroupTone } from '@/lib/ai/admin-chat-group-tone'

describe('replyGroupTone', () => {
  it('colors priority groupings by meaning', () => {
    expect(replyGroupTone('🔴 Do These Today (4 days out)')).toBe('now')
    expect(replyGroupTone('What to do right now:')).toBe('now')
    expect(replyGroupTone('**Needs attention**')).toBe('now')
    expect(replyGroupTone('🟡 Do Before Oct 8 (release day)')).toBe('soon')
    expect(replyGroupTone('🟢 Oct 8 Drop Day')).toBe('go')
    expect(replyGroupTone('STAYING A VIBE — LAUNCH CHECKLIST (OCT 8 STREET DATE, 4 DAYS OUT)')).toBe('plan')
    expect(replyGroupTone('Step 4 — QC Checklist Before You Click Continue')).toBe('plan')
    expect(replyGroupTone('### Next action')).toBe('action')
    expect(replyGroupTone('The album dashboard keeps truncating.')).toBeNull()
  })

  it('treats short setup lines as lead-ins', () => {
    expect(isReplyLeadIn('Here is an honest read of the situation before you touch anything.')).toBe(true)
    expect(isReplyLeadIn('Do not edit the ISRCs in DistroKid right now. Here is why:')).toBe(true)
    expect(
      isReplyLeadIn("Here's exactly what to do on Oct 8 (or shortly after DistroKid confirms delivery):"),
    ).toBe(true)
    expect(isReplyLeadIn("Here's what the live page confirms:")).toBe(true)
    expect(isReplyLeadIn('The safer path:')).toBe(true)
    expect(isReplyLeadIn('The album dashboard page keeps truncating at track 2.')).toBe(false)
    expect(
      isReplyLeadIn(
        'What this means: DistroKid does not expose ISRCs on the album dashboard page or in the edit form for a release that is on deck and not yet live in stores.',
      ),
    ).toBe(false)
    expect(isReplyLeadIn('---')).toBe(false)
    expect(isReplyLeadIn('| Risk | Severity |')).toBe(false)
    expect(isReplyLeadIn('/exec patch_release_marketing_copy {')).toBe(false)
  })
})