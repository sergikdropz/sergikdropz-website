import { describe, expect, it } from 'vitest'
import { suggestAnchorSnippetsFromUserText } from '@/lib/admin-ai-anchor-suggestions'

describe('suggestAnchorSnippetsFromUserText', () => {
  it('returns empty for whitespace-only input', () => {
    expect(suggestAnchorSnippetsFromUserText('   \n\t  ')).toEqual([])
  })

  it('strips email-like tokens from suggestions', () => {
    const out = suggestAnchorSnippetsFromUserText('Reach me at user@example.com about the launch timeline')
    expect(out.join(' ').toLowerCase()).not.toContain('example.com')
    expect(out.some((s) => s.toLowerCase().includes('launch'))).toBe(true)
  })

  it('captures quoted phrases', () => {
    const out = suggestAnchorSnippetsFromUserText('Focus on "dark mode hero" for the landing')
    expect(out.some((s) => s.includes('dark mode hero'))).toBe(true)
  })

  it('caps at three snippets', () => {
    const out = suggestAnchorSnippetsFromUserText(
      '"one" then \'two\' and finally "three" and "four" extra'
    )
    expect(out.length).toBeLessThanOrEqual(3)
  })
})
