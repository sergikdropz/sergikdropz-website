import { describe, expect, it } from 'vitest'
import { emptyThreadMemory } from '@/lib/ai/admin-ai-thread-memory'
import { suggestThreadAnchors, threadMemoryWithAnchors } from '@/lib/admin-ai-anchor-suggestions'

describe('suggestThreadAnchors', () => {
  it('does not turn the user question into a pinned fact', () => {
    const out = suggestThreadAnchors({
      lastUserText: 'is distrokid going to set its own upc and isrc?',
    })
    expect(out.map((item) => item.text)).toEqual(['Desk: DistroKid'])
  })

  it('pins the release, codes, date, and desk instead of the last instruction', () => {
    const out = suggestThreadAnchors({
      lastUserText: 'Navigate to the ISRC-specific page for this album',
      recentAssistantText: [
        'DistroKid UPC (live, going to stores): 700563968501',
        'Release Studio has 0199980184428 until you approve it.',
        'Staying A Vibe — DistroKid dashboard',
        'Release date October 8, 2026.',
        'Copy each DistroKid ISRC into this release after delivery.',
      ].join('\n'),
      goal: 'Launch support for "Staying A Vibe"',
      releaseTitle: 'Staying A Vibe',
      activeStep: 'copy',
    })
    const texts = out.map((item) => item.text)
    expect(texts).toContain('Staying A Vibe')
    expect(texts).toContain('Desk: DistroKid')
    expect(texts).toContain('Step: Copy')
    expect(texts).toContain('DistroKid UPC 700563968501')
    expect(texts).toContain('Studio UPC 0199980184428')
    expect(texts.some((text) => /approve it/i.test(text))).toBe(true)
    expect(texts.join(' ')).not.toMatch(/DistroKid dashboard/)
    expect(texts.some((text) => text.startsWith('Release date October 8, 2026'))).toBe(true)
    expect(texts.join(' ')).not.toMatch(/Navigate to the ISRC/)
    expect(texts.join(' ')).not.toMatch(/Launch support/)
  })

  it('keeps a specific goal and hides facts already pinned', () => {
    const out = suggestThreadAnchors({
      goal: 'Paste the DistroKid ISRCs into Release Studio before street date',
      releaseTitle: 'Staying A Vibe',
      existingAnchors: ['Staying A Vibe'],
      recentAssistantText: 'ISRCs QTA532600001 and QTA532600002 are on the album.',
    })
    expect(out.map((item) => item.text)).not.toContain('Staying A Vibe')
    expect(out.some((item) => item.reason === 'Goal' && item.text.includes('Paste the DistroKid ISRCs'))).toBe(true)
    expect(out.some((item) => item.text.startsWith('ISRCs QTA53'))).toBe(true)
  })

  it('drops email addresses from the text it reads', () => {
    const out = suggestThreadAnchors({
      releaseTitle: 'Staying A Vibe',
      recentAssistantText: 'Send the pitch to user@example.com. Release date Oct 8, 2026.',
    })
    expect(out.map((item) => item.text).join(' ').toLowerCase()).not.toContain('example.com')
  })
})

describe('threadMemoryWithAnchors', () => {
  it('adds pinned facts onto the request notes without dropping the memory object', () => {
    const memory = { ...emptyThreadMemory(), notes: ['Keep QTA53'] }
    const next = threadMemoryWithAnchors(memory, [' DistroKid UPC 700563968501 ', ''])
    expect(next.notes).toEqual(['Keep QTA53', 'Pinned: DistroKid UPC 700563968501'])
    expect(memory.notes).toEqual(['Keep QTA53'])
  })
})
