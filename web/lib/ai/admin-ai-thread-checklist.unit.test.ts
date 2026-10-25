import { describe, expect, it } from 'vitest'
import { formatThreadMemoryForPrompt, mergeThreadMemory, emptyThreadMemory } from '@/lib/ai/admin-ai-thread-memory'
import { advanceThreadChecklist, noteApprovedWrite } from '@/lib/ai/admin-ai-thread-checklist'

describe('admin ai thread checklist', () => {
  it('keeps DistroKid steps and marks a prefill done', () => {
    const seeded = advanceThreadChecklist({
      userText: 'Fill the DistroKid form for this release',
      assistantText: 'Starting the upload.',
      releaseOpen: true,
      toolCalls: [],
      toolBodies: [],
    })
    expect(seeded?.next[0]).toBe('Prefill the DistroKid form')
    expect(seeded?.done).toContain('Read the open release')
    const next = advanceThreadChecklist({
      previous: seeded,
      userText: 'Keep going',
      assistantText: 'Form is filled.',
      releaseOpen: true,
      toolCalls: [{ name: 'admin_browser', payload: { action: 'distrokid_prefill' } }],
      toolBodies: [],
    })
    expect(next?.done).toContain('Prefill the DistroKid form')
    expect(next?.next[0]).toBe('Attach the audio and artwork')
    expect(next?.id).toBe('distrokid')
    const memory = mergeThreadMemory(emptyThreadMemory(), { checklist: next })
    expect(formatThreadMemoryForPrompt(memory)).toContain('Next: Attach the audio and artwork')
  })

  it('advances a listed checklist when the user says done', () => {
    const seeded = advanceThreadChecklist({
      userText: 'Help me finish this',
      assistantText: '1. Open the album page\n2. Copy the UPC',
      releaseOpen: false,
      toolCalls: [],
      toolBodies: [],
    })
    expect(seeded?.id).toBe('custom')
    const next = advanceThreadChecklist({
      previous: seeded,
      userText: 'done',
      assistantText: 'Next is the UPC.',
      releaseOpen: false,
      toolCalls: [],
      toolBodies: [],
    })
    expect(next?.done).toEqual(['Open the album page'])
    expect(next?.next).toEqual(['Copy the UPC'])
  })

  it('moves the approval steps after a confirmed write', () => {
    const seeded = advanceThreadChecklist({
      userText: 'Update the Spotify pitch',
      assistantText: 'spotify_pitch is ready.',
      releaseOpen: true,
      toolCalls: [{ name: 'patch_release_marketing_copy', payload: { dryRun: true } }],
      toolBodies: ['Would update spotify_pitch'],
    })
    expect(seeded?.next).toContain('Wait for your approval')
    const after = noteApprovedWrite(seeded, { verified: true })
    expect(after?.done).toEqual(expect.arrayContaining(['Wait for your approval', 'Confirm the saved fields']))
    expect(after?.next).not.toContain('Confirm the saved fields')
  })
})
