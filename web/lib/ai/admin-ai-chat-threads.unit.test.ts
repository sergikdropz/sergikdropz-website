import { describe, expect, it } from 'vitest'
import { attachedThreadTitle, threadsFromSessionStore } from '@/lib/ai/admin-ai-chat-threads'

describe('threadsFromSessionStore', () => {
  it('keeps threads attached to a release', () => {
    const raw = JSON.stringify({
      sessions: [
        { id: 'a', title: 'DistroKid UPC', updatedAt: 2, attachedReleaseIds: ['rel-1', 4] },
        { id: 'b', title: 'New chat', updatedAt: 1 },
      ],
    })
    expect(threadsFromSessionStore(raw)).toEqual([
      { id: 'a', title: 'DistroKid UPC', updatedAt: 2, attachedReleaseIds: ['rel-1'] },
      { id: 'b', title: 'New chat', updatedAt: 1, attachedReleaseIds: [] },
    ])
    expect(threadsFromSessionStore('not-json')).toEqual([])
  })

  it('names an attached thread from the release and the work in the chat', () => {
    expect(
      attachedThreadTitle({
        releaseTitle: 'Staying A Vibe',
        goal: 'Launch support for "Staying A Vibe"',
        texts: ['is distrokid going to set its own upc and isrc?'],
      }),
    ).toBe('Staying A Vibe · DistroKid UPC & ISRC')
    expect(
      attachedThreadTitle({
        releaseTitle: 'Staying A Vibe',
        goal: 'Paste the DistroKid ISRCs into Release Studio before street date',
        texts: [],
      }),
    ).toBe('Staying A Vibe · Paste the DistroKid ISRCs into Release Studio …')
    expect(attachedThreadTitle({ releaseTitle: 'Staying A Vibe', texts: ['draft the elevator pitch'] })).toBe(
      'Staying A Vibe · Copy',
    )
    expect(
      attachedThreadTitle({
        releaseTitle: 'Staying A Vibe',
        texts: ['is distrokid going to set its own upc and isrc on the metadata page?'],
      }),
    ).toBe('Staying A Vibe · DistroKid UPC & ISRC')
  })
})